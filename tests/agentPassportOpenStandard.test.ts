import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { createPassportArtifact } from "../src/passport/passportArtifact.js";
import { verifyPassportArtifactFile } from "../src/passport/passportVerifier.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { generateStandardSchemas, validateWithStandard, verifyStandardSchemas } from "../src/standard/standardGenerator.js";
import { stableStandardSchemaSnapshot } from "../src/standard/standardTests.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { passportPolicySigPath, savePassportPolicy } from "../src/passport/passportStore.js";
import { scanPassportForPii } from "../src/passport/passportRedaction.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

const roots: string[] = [];
const previousVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-passport-standard-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "passport-standard-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  savePassportPolicy(dir, defaultPassportPolicy());
  return dir;
}

function writeDiagnosticRun(params: {
  workspace: string;
  runId: string;
  ts: number;
  integrity: number;
  correlation: number;
  observed: number;
  attested: number;
  selfReported: number;
}): void {
  const run = {
    runId: params.runId,
    ts: params.ts,
    trustLabel: "HIGH TRUST",
    integrityIndex: params.integrity,
    correlationRatio: params.correlation,
    evidenceTrustCoverage: {
      observed: params.observed,
      attested: params.attested,
      selfReported: params.selfReported
    },
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 2.2 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 2.1 },
      { layerName: "Culture & Alignment", avgFinalLevel: 2.0 },
      { layerName: "Resilience", avgFinalLevel: 1.9 },
      { layerName: "Skills", avgFinalLevel: 2.3 }
    ],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      finalLevel: 2,
      evidenceEventIds: ["ev_fixture"]
    }))
  };
  const path = join(params.workspace, ".amc", "agents", "default", "runs", `${params.runId}.json`);
  mkdirSync(join(params.workspace, ".amc", "agents", "default", "runs"), { recursive: true });
  writeFileSync(path, JSON.stringify(run, null, 2));
}

async function pickPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate port");
  }
  return address.port;
}

async function httpText(url: string, init?: RequestInit): Promise<{ status: number; body: string }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: await response.text()
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

describe("agent passport + open standard", () => {
  test("passport artifact creates, verifies offline, and tamper fails verification", () => {
    const ws = workspace();
    const created = createPassportArtifact({
      workspace: ws,
      scopeType: "AGENT",
      scopeId: "default",
      outFile: ".amc/passport/exports/agent/default/latest.amcpass"
    });

    const verified = verifyPassportArtifactFile({
      workspace: ws,
      file: created.outFile,
      trust: workspaceKeyTrust(ws)
    });
    expect(verified.ok, JSON.stringify(verified.errors)).toBe(true);

    const tamperedFile = join(ws, ".amc", "passport", "exports", "agent", "default", "tampered.amcpass");
    const bytes = Buffer.from(readFileSync(created.outFile));
    bytes[Math.max(0, bytes.length - 10)] = bytes[Math.max(0, bytes.length - 10)] ^ 0xff;
    writeFileSync(tamperedFile, bytes);
    const tampered = verifyPassportArtifactFile({
      workspace: ws,
      file: tamperedFile,
      trust: workspaceKeyTrust(ws)
    });
    expect(tampered.ok).toBe(false);
  });

  test("gate behavior stays informational with deterministic reasons when integrity is low", () => {
    const ws = workspace();
    writeDiagnosticRun({
      workspace: ws,
      runId: "run_low_integrity",
      ts: Date.UTC(2026, 0, 20, 12, 0, 0),
      integrity: 0.42,
      correlation: 0.44,
      observed: 0.95,
      attested: 0.03,
      selfReported: 0.02
    });
    const created = createPassportArtifact({
      workspace: ws,
      scopeType: "AGENT",
      scopeId: "default",
      outFile: ".amc/passport/exports/agent/default/low-integrity.amcpass"
    });
    expect(created.passport.status.label).toBe("INFORMATIONAL");
    expect(created.passport.status.reasons).toContain("GATE_FAIL_LOW_INTEGRITY");
    expect(created.passport.status.reasons).toContain("GATE_FAIL_LOW_CORRELATION");
    expect(created.passport.status.reasons).toContain("MISSING_ASSURANCE_CERT_PASS");
  });

  test("pii scanner fails on email-like fields (fail-closed behavior trigger)", () => {
    const pii = scanPassportForPii({
      v: 1,
      passportId: "pass_fixture",
      generatedTs: 1,
      suspicious: "owner@example.com"
    } as never);
    expect(pii.status).toBe("FAIL");
    expect(pii.findings.some((row) => row.type === "EMAIL")).toBe(true);
  });

  test("lease auth can fetch badge only and is denied for create/export/verify operations", async () => {
    const ws = workspace();
    const server = await startStudioApiServer({
      workspace: ws,
      host: "127.0.0.1",
      port: await pickPort(),
      token: "passport-admin-token"
    });
    const lease = issueLeaseForCli({
      workspace: ws,
      agentId: "default",
      ttl: "30m",
      scopes: "gateway:llm,toolhub:intent,toolhub:execute",
      routes: "/openai",
      models: "*",
      rpm: 60,
      tpm: 60000
    }).token;
    try {
      const badge = await httpText(`${server.url}/passport/badge`, {
        headers: {
          "x-amc-agent-id": "default",
          "x-amc-lease": lease
        }
      });
      expect(badge.status).toBe(200);
      expect(badge.body).toContain("AMC ");

      const deniedCreate = await httpText(`${server.url}/passport/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-amc-agent-id": "default",
          "x-amc-lease": lease
        },
        body: JSON.stringify({
          scopeType: "AGENT",
          scopeId: "default"
        })
      });
      expect([401, 403]).toContain(deniedCreate.status);

      const deniedExport = await httpText(`${server.url}/passport/export`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-amc-agent-id": "default",
          "x-amc-lease": lease
        },
        body: JSON.stringify({
          scopeType: "AGENT",
          scopeId: "default",
          outFile: ".amc/passport/exports/agent/default/lease-denied.amcpass"
        })
      });
      expect([401, 403]).toContain(deniedExport.status);

      const deniedVerify = await httpText(`${server.url}/passport/verify`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-amc-agent-id": "default",
          "x-amc-lease": lease
        },
        body: JSON.stringify({
          file: ".amc/passport/exports/agent/default/latest.amcpass"
        })
      });
      expect([401, 403]).toContain(deniedVerify.status);
    } finally {
      await server.close();
    }
  });

  test("tampered passport policy signature fails closed for passport APIs", async () => {
    const ws = workspace();
    const server = await startStudioApiServer({
      workspace: ws,
      host: "127.0.0.1",
      port: await pickPort(),
      token: "passport-admin-token"
    });
    try {
      writeFileSync(passportPolicySigPath(ws), "tampered\n");
      const res = await httpText(`${server.url}/passport/policy`, {
        headers: {
          "x-amc-admin-token": "passport-admin-token"
        }
      });
      expect(res.status).toBe(503);
      expect(res.body).toContain("PASSPORT_ENDPOINTS_UNAVAILABLE");
    } finally {
      await server.close();
    }
  });

  test("standard schemas generate deterministically, verify signatures, and validate passport JSON", () => {
    const ws = workspace();
    generateStandardSchemas(ws);
    const snapshotOne = stableStandardSchemaSnapshot(ws);
    generateStandardSchemas(ws);
    const snapshotTwo = stableStandardSchemaSnapshot(ws);
    expect(snapshotTwo).toBe(snapshotOne);

    const verify = verifyStandardSchemas(ws);
    expect(verify.ok, verify.errors.join("; ")).toBe(true);

    const passport = createPassportArtifact({
      workspace: ws,
      scopeType: "AGENT",
      scopeId: "default",
      outFile: ".amc/passport/exports/agent/default/standard-validate.amcpass"
    });
    const validate = validateWithStandard({
      workspace: ws,
      schemaId: "amcpass",
      file: passport.outFile
    });
    expect(validate.ok, validate.errors.join("; ")).toBe(true);
  });

  test("passport and standard console pages serve without CDN refs or secret patterns", async () => {
    const ws = workspace();
    const server = await startStudioApiServer({
      workspace: ws,
      host: "127.0.0.1",
      port: await pickPort(),
      token: "passport-admin-token"
    });
    try {
      for (const page of ["/console/passport.html", "/console/standard.html"]) {
        const res = await httpText(`${server.url}${page}`);
        expect(res.status).toBe(200);
        expect(res.body).not.toMatch(/https?:\/\/cdn|unpkg|jsdelivr/i);
        expect(res.body).not.toMatch(/BEGIN PRIVATE KEY|Bearer\s+[A-Za-z0-9._-]{8,}|lease_[A-Za-z0-9_-]{8,}/i);
      }
    } finally {
      await server.close();
    }
  });
});
