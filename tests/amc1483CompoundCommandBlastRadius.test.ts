import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  defaultApprovalPolicy,
  initApprovalPolicy,
} from "../src/approvals/approvalPolicyEngine.js";
import {
  evaluateProviderHookControl,
  verifyProviderHookControlResult,
} from "../src/bridge/hookControl.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { checkExec } from "../src/enforce/execGuard.js";
import { parseShellCommandPlan } from "../src/enforce/shellCommandPlan.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import {
  defaultActionPolicy,
  initActionPolicy,
} from "../src/governor/actionPolicyEngine.js";
import { openLedger } from "../src/ledger/ledger.js";
import { toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import type { DiagnosticReport } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-1483-compound-command-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "amc-1483-compound-command-test";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function installObservedRun(workspace: string, agentId: string): void {
  const now = Date.now();
  const report: DiagnosticReport = {
    agentId,
    runId: "run_amc_1483",
    ts: now,
    windowStartTs: now - 60_000,
    windowEndTs: now,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.95,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      claimedLevel: 5,
      supportedMaxLevel: 5,
      finalLevel: 5,
      confidence: 0.95,
      evidenceEventIds: ["ev_amc_1483"],
      flags: [],
      narrative: "AMC-owned compound-command control fixture",
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "fixture",
    reportJsonSha256: "fixture",
  };
  const paths = getAgentPaths(workspace, agentId);
  mkdirSync(paths.runsDir, { recursive: true });
  writeFileSync(join(paths.runsDir, `${report.runId}.json`), JSON.stringify(report, null, 2));
}

function permitAllActions(workspace: string): void {
  const policy = defaultActionPolicy();
  for (const rule of policy.actions) {
    rule.minEffectiveQuestionLevels = {};
    rule.requireTrustTierAtLeast = "OBSERVED";
    rule.requireAssurancePacks = {};
    rule.allowExecute = true;
    rule.requireExecTicket = false;
  }
  for (const defaults of Object.values(policy.riskTierDefaults)) {
    defaults.requireSandboxForExecute = false;
  }
  initActionPolicy(workspace, policy);
}

function setApprovals(workspace: string, deployApprovals = 0, writeHighApprovals = 0): void {
  const policy = defaultApprovalPolicy();
  for (const rule of Object.values(policy.approvalPolicy.actionClasses)) {
    rule.requiredApprovals = 0;
    rule.requireDistinctUsers = false;
    rule.requireAssurancePacks = {};
  }
  policy.approvalPolicy.actionClasses.DEPLOY.requiredApprovals = deployApprovals;
  policy.approvalPolicy.actionClasses.WRITE_HIGH.requiredApprovals = writeHighApprovals;
  initApprovalPolicy(workspace, policy);
}

function prepareControlledWorkspace(input?: { deployApprovals?: number; writeHighApprovals?: number }): {
  workspace: string;
  agentId: string;
} {
  const workspace = newWorkspace();
  const agentId = "amc-1483-agent";
  installObservedRun(workspace, agentId);
  permitAllActions(workspace);
  setApprovals(workspace, input?.deployApprovals ?? 0, input?.writeHighApprovals ?? 0);
  return { workspace, agentId };
}

function providerInput(
  provider: "claude-code" | "gemini-cli",
  command: string,
  actionId: string,
): string {
  return JSON.stringify(provider === "claude-code"
    ? {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: actionId,
        tool_input: { command },
      }
    : {
        hook_event_name: "BeforeTool",
        tool_name: "run_shell_command",
        tool_call_id: actionId,
        tool_input: { command },
      });
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC-1483 compound-command blast radius", () => {
  test("parses supported separators without splitting quoted or escaped values", () => {
    const parsed = parseShellCommandPlan(
      `node -e "console.log('a && b')" && git status; python -V | node -v\ngit push`,
    );

    expect(parsed).toMatchObject({
      schemaVersion: "2026-07-13",
      status: "parsed",
      compound: true,
      reasonCodes: [],
    });
    expect(parsed.segments.map((segment) => segment.connector)).toEqual([
      null,
      "and",
      "sequence",
      "pipe",
      "newline",
    ]);
    expect(parsed.segments.map((segment) => segment.binary)).toEqual([
      "node",
      "git",
      "python",
      "node",
      "git",
    ]);
    expect(parsed.segments[0]?.argv).toEqual(["-e", "console.log('a && b')"]);

    const continued = parseShellCommandPlan("node -e one\\;two && \\\n git status");
    expect(continued.status).toBe("parsed");
    expect(continued.segments[0]?.argv).toEqual(["-e", "one;two"]);
    expect(continued.segments[1]?.connector).toBe("and");

    const alternative = parseShellCommandPlan("node -v || python -V");
    expect(alternative.segments.map((segment) => segment.connector)).toEqual([null, "or"]);

    const quotedEscape = parseShellCommandPlan('node "one\\"two"');
    expect(quotedEscape.segments[0]?.argv).toEqual(['one"two']);
  });

  test("fails closed before partial output for malformed, unsupported, or over-bounded syntax", () => {
    const cases = [
      ["node -v &&", "COMMAND_TRAILING_SEPARATOR"],
      ["; node -v", "COMMAND_EMPTY_SEGMENT"],
      ["node -e 'unterminated", "COMMAND_UNTERMINATED_QUOTE"],
      ["node " + "\\", "COMMAND_UNTERMINATED_ESCAPE"],
      ["node -v > out.txt", "COMMAND_SYNTAX_UNSUPPORTED"],
      ["node -v & git status", "COMMAND_SYNTAX_UNSUPPORTED"],
      ["node $(whoami)", "COMMAND_SYNTAX_UNSUPPORTED"],
      ["node *.js", "COMMAND_SYNTAX_UNSUPPORTED"],
      ["git p[us]h", "COMMAND_SYNTAX_UNSUPPORTED"],
      ["node ~", "COMMAND_SYNTAX_UNSUPPORTED"],
      [`node ${Array.from({ length: 129 }, (_, index) => `arg-${index}`).join(" ")}`, "COMMAND_TOKEN_LIMIT_EXCEEDED"],
      [`node ${"x".repeat(8_193)}`, "COMMAND_TOO_LONG"],
      [Array.from({ length: 33 }, () => "node -v").join(";"), "COMMAND_SEGMENT_LIMIT_EXCEEDED"],
    ] as const;

    for (const [command, reason] of cases) {
      const parsed = parseShellCommandPlan(command);
      expect(parsed.status, command).toBe("invalid");
      expect(parsed.segments, command).toEqual([]);
      expect(parsed.reasonCodes, command).toContain(reason);
    }
  });

  test("reuses the shared parser in checkExec and catches a dangerous hidden segment", () => {
    const result = checkExec("node -v && rm -rf /");
    expect(result.allowed).toBe(false);
    expect(result.blockedPattern).toBe("rm -rf /");
    expect(result.commandPlan).toMatchObject({ status: "parsed", compound: true });
    expect(result.commandPlan.segments).toHaveLength(2);

    const invalid = checkExec("node -v > result.txt");
    expect(invalid.allowed).toBe(false);
    expect(invalid.commandPlan).toMatchObject({ status: "invalid", segments: [] });
  });

  test("denies an invalid provider command without partial policy output", () => {
    const { workspace, agentId } = prepareControlledWorkspace();
    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: providerInput(
        "claude-code",
        "node -v > result.txt",
        "toolu_amc_1483_invalid_plan",
      ),
    });

    expect(result).toMatchObject({
      requestedDecision: "deny",
      decision: "deny",
      effectiveOutcome: "deny",
      providerMapping: "native",
    });
    expect(result.commandBlastRadius).toMatchObject({
      parseStatus: "invalid",
      trustStatus: "verified",
      completeEvaluation: false,
      segmentCount: 0,
      aggregateOutcome: "deny",
      decisiveStepIndex: null,
      steps: [],
      reasonCodes: expect.arrayContaining([
        "COMMAND_PLAN_INVALID",
        "COMMAND_SYNTAX_UNSUPPORTED",
      ]),
    });
  });

  test("preserves existing git action classes and asks on the decisive deploy step", () => {
    const { workspace, agentId } = prepareControlledWorkspace({ deployApprovals: 1 });
    const rawInput = providerInput("claude-code", "git status && git push origin main", "toolu_amc_1483_deploy");
    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
    });
    expect(result).toMatchObject({
      canonicalToolName: null,
      requestedDecision: "ask",
      decision: "ask",
      effectiveOutcome: "ask",
      providerMapping: "native",
    });
    expect(result.commandBlastRadius).toMatchObject({
      schemaVersion: "2026-07-13",
      parseStatus: "parsed",
      trustStatus: "verified",
      completeEvaluation: true,
      compound: true,
      segmentCount: 2,
      highestActionClass: "DEPLOY",
      aggregateOutcome: "ask",
      decisiveStepIndex: 1,
      rawCommandStored: false,
      argumentValuesStored: false,
    });
    expect(result.commandBlastRadius?.steps).toEqual([
      expect.objectContaining({
        index: 0,
        connector: null,
        canonicalToolName: "git.status",
        actionClass: "READ_ONLY",
        outcome: "allow",
      }),
      expect.objectContaining({
        index: 1,
        connector: "and",
        canonicalToolName: "git.push",
        actionClass: "DEPLOY",
        outcome: "ask",
      }),
    ]);
    expect(result.reason).toContain("2 steps");
    expect(result.reason).toContain("DEPLOY");
    expect(result.reason).toContain("step 2");
  });

  test("uses the most restrictive hidden-step outcome for Claude and Gemini", () => {
    for (const provider of ["claude-code", "gemini-cli"] as const) {
      const { workspace, agentId } = prepareControlledWorkspace();
      const rawInput = providerInput(provider, "node -v && rm -rf /", `amc_1483_hidden_${provider}`);
      const result = evaluateProviderHookControl({
        workspace,
        authenticatedAgentId: agentId,
        provider,
        rawInput,
      });

      expect(result.requestedDecision).toBe("steer");
      expect(result.decision).toBe("deny");
      expect(result.commandBlastRadius).toMatchObject({
        parseStatus: "parsed",
        trustStatus: "verified",
        completeEvaluation: true,
        aggregateOutcome: "steer",
        decisiveStepIndex: 1,
      });
      expect(result.commandBlastRadius?.steps[0]).toMatchObject({ outcome: "allow" });
      expect(result.commandBlastRadius?.steps[1]).toMatchObject({
        outcome: "steer",
        reasonCode: "TOOL_ARGUMENTS_REJECTED",
      });
      expect(result.effectiveOutcome).toBe(provider === "claude-code" ? "steer" : "deny");
      expect(result.providerMapping).toBe(provider === "claude-code" ? "corrective_deny" : "fail_closed_deny");
    }
  });

  test("does not downgrade Git global context or configured aliases", () => {
    const external = prepareControlledWorkspace({ deployApprovals: 1 });
    const externalResult = evaluateProviderHookControl({
      workspace: external.workspace,
      authenticatedAgentId: external.agentId,
      provider: "claude-code",
      rawInput: providerInput(
        "claude-code",
        "git -C /tmp push origin main",
        "toolu_amc_1483_git_context",
      ),
    });
    expect(externalResult.requestedDecision).toBe("steer");
    expect(externalResult.commandBlastRadius?.steps[0]).toMatchObject({
      canonicalToolName: "git.push",
      actionClass: "DEPLOY",
      outcome: "steer",
      reasonCode: "TOOL_ARGUMENTS_REJECTED",
    });

    const alias = prepareControlledWorkspace({ deployApprovals: 1 });
    const aliasResult = evaluateProviderHookControl({
      workspace: alias.workspace,
      authenticatedAgentId: alias.agentId,
      provider: "claude-code",
      rawInput: providerInput(
        "claude-code",
        "git release-production",
        "toolu_amc_1483_git_alias",
      ),
    });
    expect(aliasResult.requestedDecision).toBe("ask");
    expect(aliasResult.commandBlastRadius?.steps[0]).toMatchObject({
      canonicalToolName: "git.push",
      actionClass: "DEPLOY",
      outcome: "ask",
      reasonCode: "APPROVAL_REQUIRED",
    });
  });

  test("binds a privacy-safe review to signed evidence and verifies replay/tamper behavior", () => {
    const { workspace, agentId } = prepareControlledWorkspace({ deployApprovals: 1 });
    const command = `node -e "console.log('TOP_SECRET_1483')" && git push origin private-main`;
    const rawInput = providerInput("claude-code", command, "toolu_amc_1483_private");
    const first = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
    });
    const replay = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
    });

    expect(replay.idempotentReplay).toBe(true);
    expect(replay.commandBlastRadius).toEqual(first.commandBlastRadius);
    expect(verifyProviderHookControlResult({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
      result: first,
    })).toEqual({ ok: true, error: null });

    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("TOP_SECRET_1483");
    expect(serialized).not.toContain("private-main");
    expect(serialized).not.toContain(command);

    const ledger = openLedger(workspace);
    const event = ledger.getAllEvents().find((row) => row.id === first.eventId);
    ledger.close();
    expect(event?.meta_json).toContain("commandBlastRadius");
    expect(event?.meta_json).not.toContain("TOP_SECRET_1483");
    expect(event?.meta_json).not.toContain("private-main");

    const tampered = structuredClone(first);
    if (!tampered.commandBlastRadius) throw new Error("missing command blast-radius review");
    tampered.commandBlastRadius.segmentCount = 99;
    expect(verifyProviderHookControlResult({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
      result: tampered,
    })).toMatchObject({ ok: false });
  });

  test("returns no partial policy steps when a signed authority is untrusted", () => {
    const { workspace, agentId } = prepareControlledWorkspace();
    appendFileSync(toolsConfigPath(workspace), "\n# invalidate signature\n");
    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: providerInput("claude-code", "node -v && git status", "toolu_amc_1483_untrusted"),
    });

    expect(result.requestedDecision).toBe("deny");
    expect(result.commandBlastRadius).toMatchObject({
      parseStatus: "parsed",
      trustStatus: "untrusted",
      completeEvaluation: false,
      segmentCount: 2,
      steps: [],
      aggregateOutcome: "deny",
      reasonCodes: expect.arrayContaining(["SIGNED_AUTHORITY_UNTRUSTED"]),
    });
  });

  test("publishes the bounded existing-surface contract without a second route", () => {
    const readme = readFileSync("README.md", "utf8");
    const adapters = readFileSync("docs/ADAPTERS.md", "utf8");
    const compatibility = readFileSync("docs/ADAPTER_COMPATIBILITY.md", "utf8");
    const websiteAdapters = readFileSync("website/docs/adapters.html", "utf8");
    const openapi = readFileSync("website/openapi.yaml", "utf8");
    const response = readFileSync(
      "docs/internal/agent-control-agentapprove-competitive-response.md",
      "utf8",
    );
    const sourceReview = readFileSync(
      "docs/source-reviews/AMC-1483-compound-command-blast-radius.md",
      "utf8",
    );

    for (const surface of [readme, adapters, compatibility, websiteAdapters, openapi]) {
      expect(surface).toContain("compound-command blast-radius review");
      expect(surface).toContain("most restrictive");
      expect(surface).toContain("raw command");
    }
    expect((openapi.match(/^  \/bridge\/hooks\/control\/v1:/gm) ?? [])).toHaveLength(1);
    expect(response).toContain("Implemented in AMC-1483");
    expect(sourceReview).toContain("6fe500c3269870bb47fd9bb0967dc02801bd79c06ed36756c30ddeb2e5c44639");
    expect(sourceReview).toContain("3fcdece3f0682489d27cd9e5f1a59cc3481eac8835abb3de12ca7bb34fda9ed1");
    expect(sourceReview).toContain("No competitor code");
  });
});
