import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { verifyCanonSignature, canonPath } from "../src/canon/canonLoader.js";
import { loadDiagnosticBank, verifyDiagnosticBankSignature, diagnosticBankPath } from "../src/diagnostic/bank/bankLoader.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { cgxBuildCli } from "../src/cgx/cgxCli.js";
import { cgxLatestGraphPath, cgxLatestPackPath } from "../src/cgx/cgxStore.js";
import { renderContextualizedDiagnostic } from "../src/diagnostic/contextualizer/contextualizer.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { tailTransparencyEntries } from "../src/transparency/logCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { validateTruthguardForWorkspace } from "../src/truthguard/truthguardApi.js";
import { questionBank } from "../src/diagnostic/questionBank.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-compass-core-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "compass-core-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  vi.useRealTimers();
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

async function pickPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate port");
  }
  return addr.port;
}

async function httpRaw(params: {
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  const bodyRaw = params.body === undefined ? "" : JSON.stringify(params.body);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      params.url,
      {
        method: params.method,
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(bodyRaw)),
          ...(params.headers ?? {})
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () =>
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          })
        );
      }
    );
    req.on("error", rejectPromise);
    if (bodyRaw.length > 0) {
      req.write(bodyRaw);
    }
    req.end();
  });
}

describe("compass canon + cgx + truthguard", () => {
  test("canon and bank signatures verify, tamper fails, and /readyz fails closed", async () => {
    const workspace = newWorkspace();
    expect(verifyCanonSignature(workspace).valid).toBe(true);
    expect(verifyDiagnosticBankSignature(workspace).valid).toBe(true);

    writeFileSync(canonPath(workspace), `${readFileSync(canonPath(workspace), "utf8")}\n# tamper\n`);
    writeFileSync(diagnosticBankPath(workspace), `${readFileSync(diagnosticBankPath(workspace), "utf8")}\n# tamper\n`);
    expect(verifyCanonSignature(workspace).valid).toBe(false);
    expect(verifyDiagnosticBankSignature(workspace).valid).toBe(false);

    const port = await pickPort();
    const runtime = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token: "admin-token"
    });
    try {
      const ready = await httpRaw({
        url: `http://127.0.0.1:${port}/readyz`,
        method: "GET"
      });
      expect(ready.status).toBe(503);
      expect(ready.body).toContain("CANON_UNTRUSTED");
      expect(ready.body).toContain("DIAGNOSTIC_BANK_UNTRUSTED");
    } finally {
      await runtime.close();
    }
  });

  test("bank completeness has 5 dimensions and all fully-rubriced questions", () => {
    const workspace = newWorkspace();
    const bank = loadDiagnosticBank(workspace);
    expect(bank.diagnosticBank.dimensions).toHaveLength(5);
    expect(bank.diagnosticBank.questions).toHaveLength(questionBank.length);
    for (const question of bank.diagnosticBank.questions) {
      expect(question.rubrics).toHaveLength(6);
      for (const rubric of question.rubrics) {
        expect(rubric.observableDefinition.trim().length).toBeGreaterThan(0);
      }
      expect(question.evidenceMap.queries.length).toBeGreaterThan(0);
    }
  });

  test("cgx graph + pack generation is deterministic for fixed time", () => {
    const workspace = newWorkspace();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00.000Z"));
    cgxBuildCli({
      workspace,
      scope: "workspace"
    });
    const graphA = readFileSync(
      cgxLatestGraphPath(workspace, {
        type: "workspace",
        id: "workspace"
      }),
      "utf8"
    );
    cgxBuildCli({
      workspace,
      scope: "workspace"
    });
    const graphB = readFileSync(
      cgxLatestGraphPath(workspace, {
        type: "workspace",
        id: "workspace"
      }),
      "utf8"
    );
    expect(graphB).toBe(graphA);

    cgxBuildCli({
      workspace,
      scope: "agent",
      id: "default"
    });
    const packA = readFileSync(cgxLatestPackPath(workspace, "default"), "utf8");
    cgxBuildCli({
      workspace,
      scope: "agent",
      id: "default"
    });
    const packB = readFileSync(cgxLatestPackPath(workspace, "default"), "utf8");
    expect(packB).toBe(packA);
  });

  test("contextualizer keeps semantic ids stable for each agent type", () => {
    const workspace = newWorkspace();
    const baseline = renderContextualizedDiagnostic({
      workspace,
      profile: {
        v: 1,
        agentId: "default",
        agentType: "code-agent",
        modelFamilies: ["gpt"],
        toolFamilies: ["git"],
        riskTier: "medium",
        operatingMode: "interactive",
        capabilities: {
          notaryEnabled: false,
          pluginsEnabled: true,
          forecastEnabled: true,
          benchmarksEnabled: true
        }
      }
    });
    expect(baseline.questions).toHaveLength(questionBank.length);
    const baselineIds = baseline.questions.map((row) => row.qId);

    for (const agentType of ["code-agent", "support-agent", "ops-agent", "research-agent", "sales-agent", "other"] as const) {
      const rendered = renderContextualizedDiagnostic({
        workspace,
        profile: {
          ...baseline.profile,
          agentType
        }
      });
      expect(rendered.questions).toHaveLength(questionBank.length);
      expect(rendered.questions.map((row) => row.qId)).toEqual(baselineIds);
    }
    const support = renderContextualizedDiagnostic({
      workspace,
      profile: {
        ...baseline.profile,
        agentType: "support-agent"
      }
    });
    expect(support.questions[0]?.howThisApplies).not.toEqual(baseline.questions[0]?.howThisApplies);
  });

  test("lease self-run ignores answers payload and records transparency entry", async () => {
    const workspace = newWorkspace();
    const port = await pickPort();
    const runtime = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token: "admin-token"
    });
    try {
      const lease = issueLeaseForCli({
        workspace,
        workspaceId: workspaceIdFromDirectory(workspace),
        agentId: "default",
        ttl: "20m",
        scopes: "diagnostic:self-run,governor:check,receipt:verify",
        routes: "/local,/openai,/anthropic,/gemini,/grok,/openrouter",
        models: "*",
        rpm: 60,
        tpm: 200000
      }).token;
      const res = await httpRaw({
        url: `http://127.0.0.1:${port}/diagnostic/self-run`,
        method: "POST",
        headers: {
          "x-amc-lease": lease
        },
        body: {
          answers: {
            "AMC-1.1": 5
          }
        }
      });
      expect(res.status).toBe(200);
      const parsed = JSON.parse(res.body) as {
        measuredScores?: Record<string, number>;
      };
      expect(Object.keys(parsed.measuredScores ?? {}).length).toBe(questionBank.length);
      const entries = tailTransparencyEntries(workspace, 20);
      expect(entries.some((row) => row.type === "DIAGNOSTIC_SELF_RUN")).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  test("truthguard validates claims/evidence and blocks secrets + disallowed tags", () => {
    const workspace = newWorkspace();
    const ledger = openLedger(workspace);
    let eventId = "";
    try {
      ledger.startSession({
        sessionId: "tg-session",
        runtime: "any",
        binaryPath: "test",
        binarySha256: "test"
      });
      eventId = ledger.appendEvidence({
        sessionId: "tg-session",
        runtime: "any",
        eventType: "audit",
        payload: JSON.stringify({ ok: true }),
        payloadExt: "json",
        inline: true,
        meta: {
          trustTier: "OBSERVED",
          auditType: "TEST_EVIDENCE"
        }
      });
      ledger.sealSession("tg-session");
    } finally {
      ledger.close();
    }

    const good = validateTruthguardForWorkspace({
      workspace,
      output: {
        v: 1,
        answer: "Completed run using tool:git.status and model:gpt-4o-mini.",
        claims: [
          {
            text: "I executed diagnostics and verified the result.",
            evidenceRefs: [eventId]
          }
        ],
        unknowns: [],
        nextActions: [{ actionId: "review", requiresApproval: true }]
      }
    });
    expect(good.result.status).toBe("PASS");

    const missingRef = validateTruthguardForWorkspace({
      workspace,
      output: {
        v: 1,
        answer: "Done.",
        claims: [{ text: "I deployed the change." }],
        unknowns: [],
        nextActions: []
      }
    });
    expect(missingRef.result.status).toBe("FAIL");
    expect(missingRef.result.violations.some((row) => row.kind === "MISSING_EVIDENCE_REF")).toBe(true);

    const secret = validateTruthguardForWorkspace({
      workspace,
      output: {
        v: 1,
        answer: "Token sk-ABCDEF1234567890 should never appear.",
        claims: [],
        unknowns: [],
        nextActions: []
      }
    });
    expect(secret.result.status).toBe("FAIL");
    expect(secret.result.violations.some((row) => row.kind === "SECRET_PATTERN")).toBe(true);

    const disallowed = validateTruthguardForWorkspace({
      workspace,
      output: {
        v: 1,
        answer: "Executed tool:dangerous.shell with model:unknown-model.",
        claims: [{ text: "I executed tool:dangerous.shell", evidenceRefs: [eventId] }],
        unknowns: [],
        nextActions: []
      }
    });
    expect(disallowed.result.status).toBe("FAIL");
    expect(disallowed.result.violations.some((row) => row.kind === "DISALLOWED_TOOL")).toBe(true);
    expect(disallowed.result.violations.some((row) => row.kind === "DISALLOWED_MODEL")).toBe(true);
  });

  test("console pages serve without CDN or secret patterns", async () => {
    const workspace = newWorkspace();
    const port = await pickPort();
    const runtime = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token: "admin-token"
    });
    try {
      const pages = ["/console/compass.html", "/console/contextGraph.html", "/console/diagnosticView.html", "/console/assets/app.js"];
      for (const page of pages) {
        const response = await httpRaw({
          url: `http://127.0.0.1:${port}${page}`,
          method: "GET"
        });
        expect(response.status).toBe(200);
        expect(response.body).not.toMatch(/https?:\/\/cdn/i);
        expect(response.body).not.toMatch(/BEGIN PRIVATE KEY|Bearer\s+[A-Za-z0-9._-]{10,}|lease_/i);
      }
    } finally {
      await runtime.close();
    }
  });
});
