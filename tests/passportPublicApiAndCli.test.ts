import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { initWorkspace } from "../src/workspace.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { createPassportArtifact } from "../src/passport/passportArtifact.js";
import {
  passportPublicForApi,
  passportRegistryForApi,
  passportRevokeForApi,
  passportVerifyPublicForApi
} from "../src/passport/passportApi.js";
import { passportCompareCli, passportShareCli } from "../src/passport/passportCli.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { savePassportPolicy } from "../src/passport/passportStore.js";
import { operatorTrustHome, workspaceKeyPem } from "./helpers/trustContext.js";

const roots: string[] = [];
const previousVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-passport-public-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "passport-public-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  savePassportPolicy(dir, defaultPassportPolicy());
  return dir;
}

function writeDiagnosticRun(params: {
  workspace: string;
  agentId: string;
  runId: string;
  ts: number;
  base: number;
}): void {
  const run = {
    runId: params.runId,
    ts: params.ts,
    trustLabel: "HIGH TRUST",
    integrityIndex: 0.92,
    correlationRatio: 0.9,
    evidenceTrustCoverage: {
      observed: 0.8,
      attested: 0.15,
      selfReported: 0.05
    },
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: params.base + 0.2 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: params.base + 0.1 },
      { layerName: "Culture & Alignment", avgFinalLevel: params.base + 0.05 },
      { layerName: "Resilience", avgFinalLevel: params.base - 0.1 },
      { layerName: "Skills", avgFinalLevel: params.base + 0.3 }
    ],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      finalLevel: Math.max(0, Math.min(5, params.base)),
      evidenceEventIds: ["ev_fixture"]
    }))
  };
  const dir = join(params.workspace, ".amc", "agents", params.agentId, "runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${params.runId}.json`), JSON.stringify(run, null, 2));
}

function createAgentPassport(workspacePath: string, agentId: string, outName = "latest.amcpass") {
  return createPassportArtifact({
    workspace: workspacePath,
    scopeType: "AGENT",
    scopeId: agentId,
    outFile: join(".amc", "passport", "exports", "agent", agentId, outName)
  });
}

function mockReq(method: string, url: string, body?: unknown, headers?: Record<string, string>): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload.length > 0 ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
  (req as { method?: string }).method = method;
  (req as { url?: string }).url = url;
  (req as { headers?: Record<string, string> }).headers = headers ?? {};
  (req as { socket?: { encrypted?: boolean } }).socket = { encrypted: false };
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; body: string } } {
  const state = { statusCode: 0, body: "" };
  const res = {
    writeHead: (statusCode: number) => {
      state.statusCode = statusCode;
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) {
        state.body += chunk.toString();
      }
    }
  } as unknown as ServerResponse;
  return { res, state };
}

async function callApi(params: {
  workspace: string;
  pathname: string;
  method: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
}): Promise<{ status: number; json: any }> {
  const req = mockReq(params.method, params.url ?? params.pathname, params.body, params.headers);
  const { res, state } = mockRes();
  const handled = await handleApiRoute(
    params.pathname,
    params.method,
    req,
    res,
    params.workspace,
    params.token
  );
  if (!handled) {
    throw new Error(`route not handled: ${params.method} ${params.pathname}`);
  }
  return {
    status: state.statusCode,
    json: JSON.parse(state.body)
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  process.env.AMC_VAULT_PASSPHRASE = previousVaultPassphrase;
});

describe("passport public API + sharing + comparison", () => {
  test("share format url returns public and verify URLs", () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.1
    });
    createAgentPassport(ws, "agent-a");
    const out = passportShareCli({
      workspace: ws,
      agentId: "agent-a",
      format: "url",
      baseUrl: "https://verify.example.com"
    });
    expect(out.publicUrl).toContain("/api/v1/passport/pass_");
    expect(out.verificationUrl).toContain("/verify");
  });

  test("share format qr returns QR URL that encodes verify URL", () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.2
    });
    createAgentPassport(ws, "agent-a");
    const out = passportShareCli({
      workspace: ws,
      agentId: "agent-a",
      format: "qr",
      baseUrl: "https://verify.example.com"
    });
    expect(out.qrCodeUrl).toContain("api.qrserver.com");
    expect(decodeURIComponent(out.qrCodeUrl ?? "")).toContain(out.verificationUrl);
  });

  test("share format json includes passport payload", () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.3
    });
    createAgentPassport(ws, "agent-a");
    const out = passportShareCli({
      workspace: ws,
      agentId: "agent-a",
      format: "json"
    });
    expect(out.passport?.passportId).toMatch(/^pass_/);
    expect(out.publicUrl).toContain("/api/v1/passport/");
  });

  test("share format pdf writes a PDF file", () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.4
    });
    createAgentPassport(ws, "agent-a");
    const out = passportShareCli({
      workspace: ws,
      agentId: "agent-a",
      format: "pdf"
    });
    expect(out.file).toBeTruthy();
    const bytes = readFileSync(out.file!);
    expect(bytes.toString("utf8", 0, 8)).toBe("%PDF-1.4");
  });

  test("compare returns side-by-side dimensions and deltas", () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.6
    });
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-b",
      runId: "run-b",
      ts: Date.now(),
      base: 2.2
    });
    createAgentPassport(ws, "agent-a");
    createAgentPassport(ws, "agent-b");
    const out = passportCompareCli({
      workspace: ws,
      agentA: "agent-a",
      agentB: "agent-b"
    });
    expect(out.dimensions.length).toBe(6);
    expect(out.dimensions.find((row) => row.dimension === "overall")?.delta).not.toBeNull();
  });

  test("public helper returns null for unknown passport id", () => {
    const ws = workspace();
    const out = passportPublicForApi({
      workspace: ws,
      passportId: "pass_missing"
    });
    expect(out).toBeNull();
  });

  test("registry helper supports pagination", () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.2
    });
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-b",
      runId: "run-b",
      ts: Date.now(),
      base: 3.0
    });
    createAgentPassport(ws, "agent-a");
    createAgentPassport(ws, "agent-b");
    const out = passportRegistryForApi({
      workspace: ws,
      page: 1,
      pageSize: 1,
      baseUrl: "https://verify.example.com"
    });
    expect(out.total).toBeGreaterThanOrEqual(2);
    expect(out.items.length).toBe(1);
    expect(out.items[0]?.verificationUrl).toContain("https://verify.example.com");
  });

  test("verify helper reports expiry after 90 days", () => {
    const ws = workspace();
    const realNow = Date.now;
    const issuedTs = Date.UTC(2025, 0, 1, 0, 0, 0);
    Date.now = () => issuedTs;
    try {
      writeDiagnosticRun({
        workspace: ws,
        agentId: "agent-a",
        runId: "run-old",
        ts: issuedTs,
        base: 3.0
      });
      const created = createAgentPassport(ws, "agent-a", "expired.amcpass");
      Date.now = () => Date.UTC(2025, 4, 10, 0, 0, 0);
      const verified = passportVerifyPublicForApi({
        workspace: ws,
        passportId: created.passport.passportId
      });
      expect(verified?.expired).toBe(true);
      expect(verified?.ok).toBe(false);
      expect(verified?.errors.some((row) => row.code === "PASSPORT_EXPIRED")).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  test("revoke helper marks passport revoked and verify reflects revocation", () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.0
    });
    const created = createAgentPassport(ws, "agent-a");
    const revoked = passportRevokeForApi({
      workspace: ws,
      passportId: created.passport.passportId,
      reason: "manual revocation"
    });
    expect(revoked?.revoked).toBe(true);
    const verified = passportVerifyPublicForApi({
      workspace: ws,
      passportId: created.passport.passportId
    });
    expect(verified?.ok).toBe(false);
    expect(verified?.revoked).toBe(true);
    expect(verified?.errors.some((row) => row.code === "PASSPORT_REVOKED")).toBe(true);
  });

  test("GET /api/v1/passports is public and paginated", async () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.1
    });
    createAgentPassport(ws, "agent-a");
    const out = await callApi({
      workspace: ws,
      pathname: "/api/v1/passports",
      method: "GET",
      url: "/api/v1/passports?page=1&pageSize=10"
    });
    expect(out.status).toBe(200);
    expect(out.json.ok).toBe(true);
    expect(out.json.data.items.length).toBeGreaterThan(0);
  });

  test("GET /api/v1/passport/:id is public", async () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.1
    });
    const created = createAgentPassport(ws, "agent-a");
    const out = await callApi({
      workspace: ws,
      pathname: `/api/v1/passport/${created.passport.passportId}`,
      method: "GET"
    });
    expect(out.status).toBe(200);
    expect(out.json.ok).toBe(true);
    expect(out.json.data.passportId).toBe(created.passport.passportId);
  });

  test("GET /api/v1/passport/:id/verify is public", async () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.1
    });
    const created = createAgentPassport(ws, "agent-a");
    const verify = () => callApi({
      workspace: ws,
      pathname: `/api/v1/passport/${created.passport.passportId}/verify`,
      method: "GET"
    });
    // P0-09: the endpoint uses the server operator's trust list, never the workspace's own keys.
    const previousHome = process.env.AMC_HOME;
    process.env.AMC_HOME = mkdtempSync(join(tmpdir(), "amc-passport-public-home-"));
    roots.push(process.env.AMC_HOME);
    try {
      const unpinned = await verify();
      expect(unpinned.status).toBe(422);
      // The response carries the verifier report and says why, with the key id to pin.
      expect(unpinned.json.data.report.issuerAdmission.status).toBe("fail");
      const auditorKeyId = createHash("sha256").update(workspaceKeyPem(ws, "auditor"), "utf8").digest("hex");
      expect(unpinned.json.data.errors).toContainEqual(expect.objectContaining({ code: "ISSUER_NOT_ADMITTED",
        message: expect.stringContaining(`key ${auditorKeyId} is not pinned`) }));
      process.env.AMC_HOME = operatorTrustHome([{ publicKeyPem: workspaceKeyPem(ws, "auditor"), purposes: ["artifact-seal"] }]);
      roots.push(process.env.AMC_HOME);
      const out = await verify();
      expect(out.status).toBe(200);
      expect(out.json.ok).toBe(true);
      expect(out.json.data.ok).toBe(true);
      expect(out.json.data.report.trusted).toBe(true);
    } finally {
      if (previousHome === undefined) delete process.env.AMC_HOME;
      else process.env.AMC_HOME = previousHome;
    }
  });

  test("POST /api/v1/passport/:id/revoke requires admin token and then fails verify", async () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      agentId: "agent-a",
      runId: "run-a",
      ts: Date.now(),
      base: 3.1
    });
    const created = createAgentPassport(ws, "agent-a");
    const denied = await callApi({
      workspace: ws,
      pathname: `/api/v1/passport/${created.passport.passportId}/revoke`,
      method: "POST",
      body: {
        reason: "for-test"
      },
      token: "passport-admin-token"
    });
    expect(denied.status).toBe(401);

    const allowed = await callApi({
      workspace: ws,
      pathname: `/api/v1/passport/${created.passport.passportId}/revoke`,
      method: "POST",
      body: {
        reason: "for-test"
      },
      headers: {
        "x-amc-admin-token": "passport-admin-token"
      },
      token: "passport-admin-token"
    });
    expect(allowed.status).toBe(200);
    expect(allowed.json.ok).toBe(true);

    const verified = await callApi({
      workspace: ws,
      pathname: `/api/v1/passport/${created.passport.passportId}/verify`,
      method: "GET",
      token: "passport-admin-token"
    });
    expect(verified.status).toBe(422);
    expect(verified.json.ok).toBe(true);
    expect(verified.json.data.ok).toBe(false);
    expect(verified.json.data.revoked).toBe(true);
  });
});
