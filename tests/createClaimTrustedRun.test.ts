import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import { handleScoreRoute } from "../src/api/scoreRouter.js";
import { ClaimReplayCache, claimHmacKeyId, verifyAgentClaim, type AgentIdentityClaim } from "../src/score/crossAgentTrust.js";
import { initWorkspace } from "../src/workspace.js";
import { observedRunReport, writeSealedRun } from "./helpers/actionPolicyFixtures.js";

/**
 * Security review 2026-10-31: POST /api/v1/score/trust/create-claim signed whatever amcScore and amcLevel the caller sent,
 * under the server's AMC_TRUST_SECRET, so any API caller could mint a claim an external verifier sharing that secret
 * honours. The claim's score and level now come from the agent's latest trusted run, and a request never signs with the
 * server's secret.
 */
const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const LAYERS = ["Strategic Agent Operations", "Leadership & Autonomy", "Culture & Alignment", "Resilience", "Skills"] as const;

function workspace(trustedLevel?: number): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-create-claim-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  if (trustedLevel !== undefined) {
    const report = observedRunReport("default");
    report.layerScores = LAYERS.map((layerName) => ({ layerName, avgFinalLevel: trustedLevel, confidenceWeightedFinalLevel: trustedLevel }));
    writeSealedRun(dir, report);
  }
  return dir;
}

async function createClaim(dir: string, body: Record<string, unknown>): Promise<{ status: number; ok: boolean; data?: AgentIdentityClaim; error?: string }> {
  const payload = JSON.stringify({ agentId: "default", publicKeyHash: "hash", issuingWorkspace: "ws", audience: "peer", sharedSecret: "request-secret-0123456789", ...body });
  const req = Object.assign(Readable.from([Buffer.from(payload, "utf8")]), { method: "POST", url: "/api/v1/score/trust/create-claim" }) as unknown as IncomingMessage;
  const state = { status: 0, body: "" };
  const res = {
    writeHead(status: number) { state.status = status; return res; },
    end(chunk?: string | Buffer) { if (chunk !== undefined) state.body += chunk.toString(); }
  } as unknown as ServerResponse;
  expect(await handleScoreRoute("/api/v1/score/trust/create-claim", "POST", req, res, dir)).toBe(true);
  return { status: state.status, ...(JSON.parse(state.body) as { ok: boolean; data?: AgentIdentityClaim; error?: string }) };
}

describe("create-claim states the agent's trusted score, never the caller's", () => {
  test("a body claiming amcScore 100 for an agent with no trusted run is refused", async () => {
    const result = await createClaim(workspace(), { amcScore: 100, amcLevel: "L5" });
    expect(result.status).toBe(409);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("NO_TRUSTED_RUN");
  });

  test("with a sealed trusted run, the claim carries the run's score and level whatever the body says", async () => {
    const dir = workspace(3); // every layer at level 3: 0.6 on the 0-1 scale, 60 on the display scale, L3
    const result = await createClaim(dir, { amcScore: 100, amcLevel: "L5" });
    expect(result.status).toBe(201);
    expect(result.data).toMatchObject({ agentId: "default", amcScore: 60, amcLevel: "L3" });
    const claim = { ...result.data!, issuedAt: new Date(result.data!.issuedAt), expiresAt: new Date(result.data!.expiresAt!) };
    const verdict = verifyAgentClaim(claim, { requirePassport: false, requireFreshness: true }, "request-secret-0123456789", {
      audience: "peer", issuer: "default", requestedScope: "read", grants: { default: ["read"] },
      issuerKeyIds: { default: [claimHmacKeyId("request-secret-0123456789")] }, replay: new ClaimReplayCache() });
    expect(verdict.reasons).toContain("Signature valid");
  });

  test("a request never signs with the server's AMC_TRUST_SECRET", async () => {
    vi.stubEnv("AMC_TRUST_SECRET", "operator-secret-0123456789");
    const result = await createClaim(workspace(3), { sharedSecret: undefined });
    expect(result.status).toBe(400);
    expect(result.error).toContain("sharedSecret is required");
  });
});
