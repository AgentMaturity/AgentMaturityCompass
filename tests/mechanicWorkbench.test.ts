import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import { loadMechanicTargets, mechanicTargetsPath, verifyMechanicTargetsSignature } from "../src/mechanic/targetsStore.js";
import { mechanicProfileApplyForApi, mechanicCreatePlanForApi } from "../src/mechanic/mechanicApi.js";
import { tailTransparencyEntries } from "../src/transparency/logCli.js";
import { mechanicPlanSchema } from "../src/mechanic/upgradePlanSchema.js";
import { simulateMechanicPlan } from "../src/mechanic/simulator.js";
import { mechanicPlanRequestApprovalForApi, mechanicPlanExecuteForApi } from "../src/mechanic/mechanicApi.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { listApprovalDecisions } from "../src/approvals/approvalChainStore.js";
import { questionBank } from "../src/diagnostic/questionBank.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-mechanic-workbench-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "mechanic-workbench-passphrase";
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
          ...(bodyRaw.length > 0 ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(bodyRaw)) } : {}),
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

describe("mechanic workbench", () => {
  test("targets governance: owner apply allowed, lease denied, tamper fails readyz", async () => {
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
        ttl: "15m",
        scopes: "diagnostic:self-run",
        routes: "/local",
        models: "*",
        rpm: 30,
        tpm: 30000
      }).token;

      const denied = await httpRaw({
        url: `${runtime.url}/mechanic/targets`,
        method: "GET",
        headers: {
          "x-amc-lease": lease
        }
      });
      expect(denied.status).toBe(403);

      const current = await httpRaw({
        url: `${runtime.url}/mechanic/targets`,
        method: "GET",
        headers: {
          "x-amc-admin-token": "admin-token"
        }
      });
      expect(current.status).toBe(200);
      const parsed = JSON.parse(current.body) as { targets: { mechanicTargets: { targets: Record<string, number> } } };
      const next = {
        mechanicTargets: {
          ...(JSON.parse(current.body) as { targets: { mechanicTargets: Record<string, unknown> } }).targets.mechanicTargets,
          targets: {
            ...parsed.targets.mechanicTargets.targets,
            "AMC-3.2.4": 4
          }
        }
      };
      const applied = await httpRaw({
        url: `${runtime.url}/mechanic/targets/apply`,
        method: "POST",
        headers: {
          "x-amc-admin-token": "admin-token"
        },
        body: {
          targets: next,
          reason: "mechanic tuning test"
        }
      });
      expect(applied.status).toBe(200);
      expect(verifyMechanicTargetsSignature(workspace).valid).toBe(true);

      writeFileSync(mechanicTargetsPath(workspace), `${readFileSync(mechanicTargetsPath(workspace), "utf8")}\n# tamper\n`);
      const ready = await httpRaw({
        url: `${runtime.url}/readyz`,
        method: "GET"
      });
      expect(ready.status).toBe(503);
      expect(ready.body).toContain("MECHANIC_TARGETS_UNTRUSTED");
    } finally {
      await runtime.close();
    }
  });

  test("profile application sets targets for all questions and writes transparency event", () => {
    const workspace = newWorkspace();
    const applied = mechanicProfileApplyForApi({
      workspace,
      profileId: "code-agent-excellence",
      mode: "DESIRED",
      scopeType: "WORKSPACE",
      scopeId: "workspace",
      reason: "profile apply test",
      actor: "owner"
    });
    const targets = loadMechanicTargets(workspace);
    expect(Object.keys(targets.mechanicTargets.targets)).toHaveLength(questionBank.length);
    expect(applied.profile.id).toBe("code-agent-excellence");
    const entries = tailTransparencyEntries(workspace, 20);
    expect(entries.some((row) => row.type === "MECHANIC_PROFILE_APPLIED")).toBe(true);
  });

  test("planner is deterministic for fixed fixtures and emits only supported action kinds", async () => {
    const workspace = newWorkspace();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T10:00:00.000Z"));
    const first = await mechanicCreatePlanForApi({
      workspace,
      scopeType: "WORKSPACE",
      scopeId: "workspace"
    });
    const firstBytes = readFileSync(first.latestPath, "utf8");
    const second = await mechanicCreatePlanForApi({
      workspace,
      scopeType: "WORKSPACE",
      scopeId: "workspace"
    });
    const secondBytes = readFileSync(second.latestPath, "utf8");
    expect(secondBytes).toBe(firstBytes);

    const parsed = mechanicPlanSchema.parse(JSON.parse(firstBytes) as unknown);
    const allowedKinds = new Set([
      "POLICY_PACK_APPLY",
      "BUDGETS_APPLY",
      "TOOLS_APPLY",
      "APPROVAL_POLICY_APPLY",
      "PLUGIN_INSTALL",
      "ASSURANCE_RUN",
      "TRANSFORM_PLAN_CREATE",
      "FREEZE_SET",
      "BENCH_CREATE",
      "FORECAST_REFRESH"
    ]);
    const actualKinds = parsed.phases.flatMap((phase) => phase.actions.map((action) => action.kind));
    expect(actualKinds.every((kind) => allowedKinds.has(kind))).toBe(true);
  });

  test("simulator honesty gates numeric output on insufficient evidence", () => {
    const workspace = newWorkspace();
    const plan = mechanicPlanSchema.parse({
      v: 1,
      planId: "plan_test",
      scope: { type: "WORKSPACE", id: "workspace" },
      generatedTs: Date.now(),
      inputs: {
        targetsSha256: "a".repeat(64),
        measuredScorecardSha256: "b".repeat(64),
        bankVersion: 1,
        canonVersion: 1,
        cgxPackSha256: "c".repeat(64)
      },
      summary: {
        currentOverall: 2.5,
        targetOverall: 4.2,
        gapPointsTotal: 50,
        unknownQuestionsCount: 8,
        integrityIndex: 0.7,
        correlationRatio: 0.7,
        readiness: "NEEDS_EVIDENCE"
      },
      phases: [
        {
          phaseId: "P1-INSTRUMENTATION",
          goal: "instrument",
          actions: [
            {
              id: "a1",
              kind: "TOOLS_APPLY",
              requiresApproval: true,
              effect: "instrument tools",
              evidenceToVerify: ["receipt"],
              params: {}
            }
          ]
        }
      ],
      perQuestionPlan: [],
      eta: {
        status: "UNKNOWN",
        reasons: ["insufficient history"]
      },
      safety: {
        highRiskActionsCount: 1,
        requiresDualControl: true,
        blockedByFreeze: false,
        warnings: []
      }
    });

    const blocked = simulateMechanicPlan({
      workspace,
      plan,
      integrityIndex: 0.7,
      correlationRatio: 0.7
    });
    expect(blocked.simulation.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(blocked.simulation.candidates[0]?.projected.maturityDeltaBand).toBeUndefined();

    const ok = simulateMechanicPlan({
      workspace,
      plan,
      integrityIndex: 0.95,
      correlationRatio: 0.95
    });
    expect(ok.simulation.status).toBe("OK");
    expect(ok.simulation.candidates[0]?.projected.maturityDeltaBand).toBeTruthy();
    expect((ok.simulation.candidates[0]?.honestyNotes ?? []).length).toBeGreaterThan(0);
  });

  test("execution requires approvals and succeeds after quorum", async () => {
    const workspace = newWorkspace();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T10:00:00.000Z"));
    const created = await mechanicCreatePlanForApi({
      workspace,
      scopeType: "WORKSPACE",
      scopeId: "workspace"
    });

    await expect(
      mechanicPlanExecuteForApi({
        workspace,
        planId: created.plan.planId
      })
    ).rejects.toThrow(/requires approval request/i);

    const requested = mechanicPlanRequestApprovalForApi({
      workspace,
      planId: created.plan.planId,
      actor: "owner",
      reason: "approval test"
    });
    expect(requested.approvalRequests.length).toBeGreaterThan(0);

    for (const req of requested.approvalRequests) {
      decideApprovalForIntent({
        workspace,
        agentId: "default",
        approvalId: req.approvalRequestId,
        decision: "APPROVED",
        mode: "EXECUTE",
        reason: "owner approve",
        userId: "owner-1",
        username: "owner-1",
        userRoles: ["OWNER"]
      });
      decideApprovalForIntent({
        workspace,
        agentId: "default",
        approvalId: req.approvalRequestId,
        decision: "APPROVED",
        mode: "EXECUTE",
        reason: "auditor approve",
        userId: "auditor-1",
        username: "auditor-1",
        userRoles: ["AUDITOR"]
      });
    }

    const executed = await mechanicPlanExecuteForApi({
      workspace,
      planId: created.plan.planId
    });
    expect(executed.executed.length).toBeGreaterThan(0);
    const entries = tailTransparencyEntries(workspace, 40);
    expect(entries.some((row) => row.type === "MECHANIC_PLAN_EXECUTED")).toBe(true);

    const firstApproval = requested.approvalRequests[0];
    if (firstApproval) {
      const decisions = listApprovalDecisions({
        workspace,
        agentId: "default",
        approvalRequestId: firstApproval.approvalRequestId
      });
      expect(decisions.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("mechanic console pages serve and contain no external refs", async () => {
    const workspace = newWorkspace();
    const port = await pickPort();
    const runtime = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token: "admin-token"
    });
    try {
      const pages = ["/console/mechanic.html", "/console/equalizer.html", "/console/upgradeWizard.html", "/console/simulator.html"];
      for (const page of pages) {
        const response = await httpRaw({
          url: `${runtime.url}${page}`,
          method: "GET"
        });
        expect(response.status).toBe(200);
        expect(response.body).not.toMatch(/https?:\/\/(cdn|unpkg|jsdelivr|cdnjs)/i);
        expect(response.body).not.toMatch(/BEGIN PRIVATE KEY|Bearer\s+[A-Za-z0-9_\-\.]+/);
      }
    } finally {
      await runtime.close();
    }
  });
});
