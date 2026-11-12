import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { initWorkspace } from "../src/workspace.js";

/** M3: the console's in-browser questionnaire scores with the same function as `amc domain pack run` and the MCP tool. */
describe("POST /industry-packs/:id/score", () => {
  const pack = listIndustryPacks()[0]!;
  let workspace: string;
  let api: Awaited<ReturnType<typeof startStudioApiServer>>;
  const score = async (id: string, body: unknown) => {
    const res = await fetch(`${api.url}/industry-packs/${encodeURIComponent(id)}/score`, {
      method: "POST", headers: { "x-amc-admin-token": "pack-token", "content-type": "application/json" }, body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() as Record<string, any> };
  };

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), "amc-pack-score-"));
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "pack-score");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "pack-token" });
  }, 60_000);
  afterAll(async () => {
    await api?.close();
    vi.unstubAllEnvs();
    rmSync(workspace, { recursive: true, force: true });
  });

  test("a complete answer set is scored, self-reported and capped at L1, with gaps", async () => {
    const responses = Object.fromEntries(pack.questions.map((q, i) => [q.id, i === 0 ? 1 : 5]));
    const out = await score(pack.id, { responses });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ packId: pack.id, claimKind: "self_reported", eligibleLevel: 1 });
    expect(out.body.selfAssessment).toMatchObject({ complete: true, answered: pack.questions.length });
    expect(typeof out.body.percentage).toBe("number");
    expect(out.body.complianceGaps[0]).toContain(pack.questions[0]!.id);
    expect(typeof out.body.claimLabel).toBe("string");
  });

  test("no answers is not evaluated, as the CLI baseline", async () => {
    const out = await score(pack.id, { responses: {} });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ percentage: null, eligibleLevel: null });
  });

  test("unknown packs, unknown questions and out-of-range levels are refused", async () => {
    expect((await score("no-such-pack", { responses: {} })).status).toBe(404);
    expect((await score(pack.id, { responses: { "NOT-A-QUESTION": 3 } })).status).toBe(400);
    expect((await score(pack.id, { responses: { [pack.questions[0]!.id]: 9 } })).status).toBe(400);
    expect((await score(pack.id, { responses: "x" })).status).toBe(400);
  });
});
