import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";
import { domainProofCheckCli } from "../src/domainProof/domainProofCli.js";
import { handleApiRoute } from "../src/api/index.js";

const manifest = "fixtures/domain-proof/toy-governance/source-rule-manifest.json";
const provenInput = "examples/domain-proof/toy-governance/proven.json";
const disprovenInput = "examples/domain-proof/toy-governance/disproven.json";
const unsupportedInput = "examples/domain-proof/toy-governance/unsupported.json";

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload.length > 0 ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
  (req as { method?: string; url?: string }).method = method;
  (req as { method?: string; url?: string }).url = url;
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; headers: Record<string, string>; body: string } } {
  const state = { statusCode: 0, headers: {} as Record<string, string>, body: "" };
  const res = {
    writeHead: (statusCode: number, headers?: Record<string, string>) => {
      state.statusCode = statusCode;
      state.headers = headers ?? {};
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) state.body += chunk.toString();
    },
  } as unknown as ServerResponse;
  return { res, state };
}

describe("Domain Proof Lane proof check CLI/API", () => {
  test("CLI proof check proves a toy governance answer with source clause refs and non-claim boundary", () => {
    const out = domainProofCheckCli({
      workspace: process.cwd(),
      domain: "governance",
      manifest,
      input: provenInput,
    });

    expect(out.result).toBe("proven");
    expect(out.artifact.proofClass).toBe("domain_correctness");
    expect(out.artifact.ruleRefs.map((ref) => ref.clauseId)).toEqual(["TG-1", "TG-2", "TG-3"]);
    expect(out.artifact.proofBindings.canonicalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(out.nonClaim).toContain("not legal advice");
    expect(out.surfaces).toEqual(["Enforce", "Comply", "Score", "Vault", "Watch"]);
  });

  test("CLI proof check disproves failed toy facts with a counterexample", () => {
    const out = domainProofCheckCli({
      workspace: process.cwd(),
      domain: "governance",
      manifest,
      input: disprovenInput,
    });

    expect(out.result).toBe("disproven");
    expect(out.artifact.counterexample).toMatchObject({
      brokenClauseId: "TG-1",
      remediationHint: expect.stringContaining("age"),
    });
  });

  test("CLI proof check returns unsupported for missing required toy facts", () => {
    const out = domainProofCheckCli({
      workspace: process.cwd(),
      domain: "governance",
      manifest,
      input: unsupportedInput,
    });

    expect(out.result).toBe("unsupported");
    expect(out.artifact.counterexample).toMatchObject({
      brokenClauseId: "TG-3",
      missingAssumption: expect.stringContaining("residency"),
    });
  });

  test("API exposes POST /api/v1/proof/check with the same fail-closed semantics", async () => {
    const req = mockReq("POST", "/api/v1/proof/check", {
      domain: "governance",
      manifest,
      input: disprovenInput,
    });
    const { res, state } = mockRes();

    const handled = await handleApiRoute("/api/v1/proof/check", "POST", req, res, process.cwd());

    expect(handled).toBe(true);
    expect(state.statusCode).toBe(200);
    const json = JSON.parse(state.body) as { ok: boolean; data: ReturnType<typeof domainProofCheckCli> };
    expect(json.ok).toBe(true);
    expect(json.data.result).toBe("disproven");
    expect(json.data.artifact.counterexample?.brokenClauseId).toBe("TG-1");
  });
});
