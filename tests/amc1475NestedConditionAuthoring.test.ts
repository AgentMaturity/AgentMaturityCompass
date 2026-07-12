import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import Ajv from "ajv";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolveApiRolePolicy } from "../src/api/accessPolicy.js";
import { handleComplianceRoute } from "../src/api/complianceRouter.js";
import {
  ActionEvidenceLogicError,
  applyActionEvidenceLogic,
  compileActionEvidenceLogic,
  inspectActionEvidenceLogic,
} from "../src/enforce/actionEvidenceLogic.js";
import { buildControlProjection } from "../src/enforce/controlProjection.js";
import { simulateControlDecision } from "../src/enforce/controlSimulation.js";
import {
  actionPolicyPath,
  ACTION_POLICY_WRITER_LOCK,
  evaluateActionPermission,
  initActionPolicy,
  loadActionPolicy,
  signActionPolicy,
  verifyActionPolicySignature,
  type GovernorAssuranceSummary,
  type GovernorTrustSummary,
} from "../src/governor/actionPolicyEngine.js";
import type { ActionPolicyRule } from "../src/governor/actionPolicySchema.js";
import {
  canonicalizePolicyEvidenceLogic,
  defaultPolicyEvidenceLogicForRule,
  evaluatePolicyEvidenceLogic,
  policyEvidenceGateId,
  policyEvidenceLogicSchema,
  policyEvidenceLogicSemanticHash,
  validatePolicyEvidenceLogicForRule,
  type PolicyEvidenceLogic,
} from "../src/governor/policyEvidenceLogic.js";
import { ControlFileLockError, withControlFileLock } from "../src/lifecycle/controlFileLock.js";
import { openLedger } from "../src/ledger/ledger.js";
import { applyPolicyPack } from "../src/policyPacks/packApply.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";
import { readTransparencyEntries, transparencyLogPath } from "../src/transparency/logChain.js";
import { trustConfigPath } from "../src/trust/trustConfig.js";
import type { DiagnosticReport } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const cliPath = resolve(process.cwd(), "dist/cli.js");
let previousPassphrase: string | undefined;

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-action-evidence-logic-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

function configureDeployRule(root: string): ActionPolicyRule {
  const policy = loadActionPolicy(root);
  const deploy = policy.actions.find((rule) => rule.actionClass === "DEPLOY")!;
  deploy.minEffectiveQuestionLevels = {
    "AMC-1.7": 4,
    "AMC-1.8": 4,
  };
  deploy.requireAssurancePacks = {
    governance_bypass: { minScore: 85, maxSucceeded: 0 },
    unsafe_tooling: { minScore: 85, maxSucceeded: 0 },
  };
  deploy.requireTrustTierAtLeast = "OBSERVED_HARDENED";
  deploy.allowExecute = true;
  deploy.requireExecTicket = true;
  initActionPolicy(root, policy);
  return loadActionPolicy(root).actions.find((rule) => rule.actionClass === "DEPLOY")!;
}

function alternativeLogic(): PolicyEvidenceLogic {
  return {
    all: [
      { gate: "maturity:AMC-1.7" },
      { gate: "maturity:AMC-1.8" },
      {
        any: [
          { gate: "assurance:governance_bypass" },
          { gate: "assurance:unsafe_tooling" },
        ],
      },
    ],
  };
}

function run(levels: Record<string, number>): DiagnosticReport {
  return {
    questionScores: Object.entries(levels).map(([questionId, finalLevel]) => ({ questionId, finalLevel })),
  } as DiagnosticReport;
}

const strongTrust: GovernorTrustSummary = {
  trustTier: "OBSERVED_HARDENED",
  sandboxEvidence: true,
  untrustedConfig: false,
  correlationRatio: 1,
};

const onePassingAssurance: GovernorAssuranceSummary = {
  packs: {
    governance_bypass: { score: 20, succeeded: 2, observed: true },
    unsafe_tooling: { score: 95, succeeded: 0, observed: true },
  },
};

function runCli(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      AMC_VAULT_PASSPHRASE: "amc-action-evidence-logic-test-passphrase",
    },
    timeout: 30_000,
  });
}

async function callPolicyApi(root: string, pathname: string, method: string, body?: unknown) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as IncomingMessage;
  req.method = method;
  req.url = pathname;
  const response = { status: 0, body: "", headers: {} as Record<string, string> };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      response.status = status;
      response.headers = headers ?? {};
      return res;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) response.body += chunk.toString();
    },
  } as unknown as ServerResponse;
  const routePath = pathname.split("?", 1)[0]!;
  const handled = await handleComplianceRoute(routePath, method, req, res, root);
  return { handled, ...response, json: response.body ? JSON.parse(response.body) : null };
}

beforeEach(() => {
  previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "amc-action-evidence-logic-test-passphrase";
});

afterEach(() => {
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC-1475 bounded nested Action Policy evidence logic", () => {
  test("accepts one strict bounded AST and rejects ambiguous or unsafe shapes", () => {
    expect(policyEvidenceLogicSchema.parse(alternativeLogic())).toEqual(alternativeLogic());
    expect(() => policyEvidenceLogicSchema.parse({ gate: "maturity:AMC-1.7", any: [] })).toThrow();
    expect(() => policyEvidenceLogicSchema.parse({ any: [] })).toThrow();
    expect(() => policyEvidenceLogicSchema.parse({ all: [{ gate: "maturity:AMC-1.7" }] })).toThrow();
    expect(() => policyEvidenceLogicSchema.parse({ not: { gate: "maturity:AMC-1.7" } })).toThrow();
    expect(() => policyEvidenceLogicSchema.parse({ gate: "maturity:AMC-1.7", selector: "input" })).toThrow();
    expect(() => policyEvidenceLogicSchema.parse({ gate: "provider:upstream" })).toThrow();
    expect(() => policyEvidenceLogicSchema.parse({ gate: `maturity:${"x".repeat(129)}` })).toThrow();
    expect(() => policyEvidenceLogicSchema.parse({
      all: Array.from({ length: 17 }, (_, index) => ({ gate: `maturity:AMC-1.${index}` })),
    })).toThrow();
  });

  test("requires exact declared gate coverage and family-local alternatives", () => {
    const root = workspace();
    const rule = configureDeployRule(root);
    const validation = validatePolicyEvidenceLogicForRule(alternativeLogic(), rule);
    expect(validation).toMatchObject({ hasAlternatives: true, gateCount: 4 });
    expect(validation.gateIds).toEqual([
      "assurance:governance_bypass",
      "assurance:unsafe_tooling",
      "maturity:AMC-1.7",
      "maturity:AMC-1.8",
    ]);

    expect(() => validatePolicyEvidenceLogicForRule({
      all: [
        { gate: "maturity:AMC-1.7" },
        { gate: "maturity:AMC-1.8" },
        { gate: "assurance:governance_bypass" },
      ],
    }, rule)).toThrow(/exactly once/i);
    expect(() => validatePolicyEvidenceLogicForRule({
      all: [
        { gate: "maturity:AMC-1.7" },
        { gate: "maturity:AMC-1.8" },
        { gate: "assurance:governance_bypass" },
        { gate: "assurance:governance_bypass" },
        { gate: "assurance:unsafe_tooling" },
      ],
    }, rule)).toThrow(/duplicate/i);
    expect(() => validatePolicyEvidenceLogicForRule({
      all: [
        { gate: "maturity:AMC-1.7" },
        { gate: "maturity:AMC-1.8" },
        {
          any: [
            { gate: "maturity:AMC-1.8" },
            { gate: "assurance:governance_bypass" },
          ],
        },
        { gate: "assurance:unsafe_tooling" },
      ],
    }, rule)).toThrow(/one evidence family/i);
    expect(() => validatePolicyEvidenceLogicForRule({
      all: [
        { gate: "maturity:AMC-1.7" },
        { gate: "maturity:AMC-1.8" },
        { gate: "assurance:governance_bypass" },
        { gate: "assurance:unsafe_tooling" },
        { gate: "assurance:made_up" },
      ],
    }, rule)).toThrow(/declared/i);
  });

  test("bounds depth and total nodes before canonicalization or evaluation", () => {
    const root = workspace();
    const rule = configureDeployRule(root);
    let tooDeep: PolicyEvidenceLogic = { gate: "maturity:AMC-1.7" };
    for (let index = 0; index < 7; index += 1) {
      tooDeep = { all: [tooDeep, { gate: "maturity:AMC-1.8" }] };
    }
    expect(() => validatePolicyEvidenceLogicForRule(tooDeep, rule)).toThrow(/depth/i);

    let hostileDepth: unknown = { gate: "maturity:AMC-1.7" };
    for (let index = 0; index < 1_000; index += 1) {
      hostileDepth = { all: [hostileDepth, { gate: "maturity:AMC-1.8" }] };
    }
    expect(() => policyEvidenceLogicSchema.parse(hostileDepth)).toThrow(/depth/i);

    const tooManyNodes = {
      all: Array.from({ length: 16 }, (_, group) => ({
        all: Array.from({ length: 4 }, (_, leaf) => ({ gate: `maturity:AMC-${group}.${leaf}` })),
      })),
    };
    expect(() => policyEvidenceLogicSchema.parse(tooManyNodes)).toThrow(/node count/i);
    expect(() => policyEvidenceLogicSchema.parse({
      gate: "maturity:AMC-1.7",
      padding: "x".repeat(9_000),
    })).toThrow(/serialized bytes/i);
  });

  test("canonicalizes deterministically and evaluates every alternative without allowing unknown gates", () => {
    const canonical = canonicalizePolicyEvidenceLogic(alternativeLogic());
    expect(canonicalizePolicyEvidenceLogic({
      all: [...alternativeLogic().all!].reverse(),
    })).toEqual(canonical);
    expect(policyEvidenceLogicSemanticHash({
      all: [
        { gate: "maturity:AMC-1.7" },
        { all: [{ gate: "maturity:AMC-1.8" }, { gate: "assurance:governance_bypass" }] },
        { gate: "assurance:unsafe_tooling" },
      ],
    })).toBe(policyEvidenceLogicSemanticHash({
      all: [
        { gate: "assurance:unsafe_tooling" },
        { gate: "assurance:governance_bypass" },
        { gate: "maturity:AMC-1.8" },
        { gate: "maturity:AMC-1.7" },
      ],
    }));

    const evaluated = evaluatePolicyEvidenceLogic(canonical, {
      "maturity:AMC-1.7": true,
      "maturity:AMC-1.8": true,
      "assurance:governance_bypass": false,
      "assurance:unsafe_tooling": true,
    });
    expect(evaluated.passed).toBe(true);
    expect(evaluated.blockingGateIds).toEqual([]);
    expect(evaluated.nodes).toContainEqual(expect.objectContaining({
      gateId: "assurance:governance_bypass",
      passed: false,
    }));
    expect(evaluated.nodes).toContainEqual(expect.objectContaining({ nodeType: "any", passed: true }));

    const missing = evaluatePolicyEvidenceLogic(canonical, {
      "maturity:AMC-1.7": true,
      "maturity:AMC-1.8": true,
      "assurance:governance_bypass": false,
    });
    expect(missing.passed).toBe(false);
    expect(missing.unknownGateIds).toEqual(["assurance:unsafe_tooling"]);
    expect(missing.blockingGateIds).toEqual(["assurance:governance_bypass", "assurance:unsafe_tooling"]);
  });

  test("preserves legacy all-gates behavior and makes a declared alternative path effective", () => {
    const root = workspace();
    const rule = configureDeployRule(root);
    expect(rule.evidenceLogic).toBeUndefined();

    const baseline = evaluateActionPermission({
      agentId: "default",
      actionClass: "DEPLOY",
      riskTier: "low",
      currentDiagnosticRun: run({ "AMC-1.7": 5, "AMC-1.8": 5 }),
      targetProfile: null,
      trustSummary: strongTrust,
      assuranceSummary: onePassingAssurance,
      requestedMode: "EXECUTE",
      hasExecTicket: true,
      policy: loadActionPolicy(root),
      policySignatureValid: true,
    });
    expect(baseline.effectiveMode).toBe("SIMULATE");

    const policy = loadActionPolicy(root);
    policy.actions.find((candidate) => candidate.actionClass === "DEPLOY")!.evidenceLogic = alternativeLogic();
    initActionPolicy(root, policy);
    const withAlternatives = evaluateActionPermission({
      agentId: "default",
      actionClass: "DEPLOY",
      riskTier: "low",
      currentDiagnosticRun: run({ "AMC-1.7": 5, "AMC-1.8": 5 }),
      targetProfile: null,
      trustSummary: strongTrust,
      assuranceSummary: onePassingAssurance,
      requestedMode: "EXECUTE",
      hasExecTicket: true,
      policy: loadActionPolicy(root),
      policySignatureValid: true,
    });
    expect(withAlternatives.effectiveMode).toBe("EXECUTE");
    expect(withAlternatives.conditionResults).toContainEqual(expect.objectContaining({
      conditionId: "evidence-logic",
      passed: true,
    }));
    expect(withAlternatives.conditionResults).toContainEqual(expect.objectContaining({
      conditionId: expect.stringContaining("assurance:governance_bypass"),
      passed: false,
    }));

    const maturityBlocked = evaluateActionPermission({
      agentId: "default",
      actionClass: "DEPLOY",
      riskTier: "low",
      currentDiagnosticRun: run({ "AMC-1.7": 0, "AMC-1.8": 5 }),
      targetProfile: null,
      trustSummary: strongTrust,
      assuranceSummary: onePassingAssurance,
      requestedMode: "EXECUTE",
      hasExecTicket: true,
      policy: loadActionPolicy(root),
      policySignatureValid: true,
    });
    expect(maturityBlocked.effectiveMode).toBe("SIMULATE");
    expect(maturityBlocked.reasons).toContainEqual(expect.stringContaining("AMC-1.7 effective level"));
    expect(maturityBlocked.reasons).not.toContainEqual(expect.stringContaining("governance_bypass"));

    const seventeenRequirements = Object.fromEntries(
      Array.from({ length: 17 }, (_, index) => [`AMC-X.${index + 1}`, 4]),
    );
    const boundedImplicit = defaultPolicyEvidenceLogicForRule({
      minEffectiveQuestionLevels: seventeenRequirements,
      requireAssurancePacks: {},
    });
    expect(boundedImplicit).not.toBeNull();
    expect(validatePolicyEvidenceLogicForRule(boundedImplicit, {
      minEffectiveQuestionLevels: seventeenRequirements,
      requireAssurancePacks: {},
    })).toMatchObject({ gateCount: 17, hasAlternatives: false });

    const compatibilityRoot = workspace();
    const compatibilityPolicy = loadActionPolicy(compatibilityRoot);
    const compatibilityRule = compatibilityPolicy.actions.find((candidate) => candidate.actionClass === "DEPLOY")!;
    compatibilityRule.minEffectiveQuestionLevels = { "Legacy Question/1": 4 };
    compatibilityRule.requireAssurancePacks = { "legacy pack/1": { minScore: 80, maxSucceeded: 0 } };
    initActionPolicy(compatibilityRoot, compatibilityPolicy);
    const opaqueMaturityGate = policyEvidenceGateId("maturity", "Legacy Question/1");
    const opaqueAssuranceGate = policyEvidenceGateId("assurance", "legacy pack/1");
    expect(opaqueMaturityGate).toMatch(/^maturity:~[a-f0-9]{64}$/);
    expect(opaqueAssuranceGate).toMatch(/^assurance:~[a-f0-9]{64}$/);
    expect(inspectActionEvidenceLogic({ workspace: compatibilityRoot, actionClass: "DEPLOY" }).gates)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ gateId: opaqueMaturityGate, label: expect.stringContaining("Legacy Question/1") }),
        expect.objectContaining({ gateId: opaqueAssuranceGate, label: expect.stringContaining("legacy pack/1") }),
      ]));
    expect(() => buildControlProjection(compatibilityRoot)).not.toThrow();

    const legacyLevels = Object.fromEntries(
      Array.from({ length: 61 }, (_, index) => [`AMC-LEGACY.${index + 1}`, 5]),
    );
    const legacyPolicy = loadActionPolicy(root);
    const legacyRule = legacyPolicy.actions.find((candidate) => candidate.actionClass === "DEPLOY")!;
    legacyRule.minEffectiveQuestionLevels = Object.fromEntries(
      Object.keys(legacyLevels).map((questionId) => [questionId, 4]),
    );
    legacyRule.requireAssurancePacks = {};
    delete legacyRule.evidenceLogic;
    initActionPolicy(root, legacyPolicy);
    const legacyInput = {
      agentId: "default",
      actionClass: "DEPLOY" as const,
      riskTier: "low" as const,
      currentDiagnosticRun: run(legacyLevels),
      targetProfile: null,
      trustSummary: strongTrust,
      assuranceSummary: onePassingAssurance,
      requestedMode: "EXECUTE" as const,
      hasExecTicket: true,
      policy: loadActionPolicy(root),
      policySignatureValid: true,
    };
    expect(evaluateActionPermission(legacyInput).effectiveMode).toBe("EXECUTE");
    expect(evaluateActionPermission({
      ...legacyInput,
      currentDiagnosticRun: run({ ...legacyLevels, "AMC-LEGACY.61": 0 }),
    }).effectiveMode).toBe("SIMULATE");
    expect(() => inspectActionEvidenceLogic({ workspace: root, actionClass: "DEPLOY" }))
      .toThrowError(expect.objectContaining<Partial<ActionEvidenceLogicError>>({ code: "LOGIC_INVALID" }));
  });

  test("keeps trust, ticket, sandbox, budget, freeze, work-order, and allowExecute hard gates", () => {
    const root = workspace();
    configureDeployRule(root);
    const policy = loadActionPolicy(root);
    policy.actions.find((candidate) => candidate.actionClass === "DEPLOY")!.evidenceLogic = alternativeLogic();
    initActionPolicy(root, policy);
    const base = {
      agentId: "default",
      actionClass: "DEPLOY" as const,
      riskTier: "high" as const,
      currentDiagnosticRun: run({ "AMC-1.7": 5, "AMC-1.8": 5 }),
      targetProfile: null,
      trustSummary: strongTrust,
      assuranceSummary: onePassingAssurance,
      requestedMode: "EXECUTE" as const,
      hasExecTicket: true,
      policy: loadActionPolicy(root),
      policySignatureValid: true,
    };
    expect(evaluateActionPermission({ ...base, trustSummary: { ...strongTrust, trustTier: "SELF_REPORTED" } }).effectiveMode).toBe("SIMULATE");
    expect(evaluateActionPermission({ ...base, trustSummary: { ...strongTrust, sandboxEvidence: false } }).effectiveMode).toBe("SIMULATE");
    expect(evaluateActionPermission({ ...base, hasExecTicket: false }).effectiveMode).toBe("SIMULATE");
    expect(evaluateActionPermission({ ...base, budgetStatus: { ok: false, reasons: ["daily llm cost exceeded"], exceededActionClasses: [], budgetConfigValid: true } }).effectiveMode).toBe("SIMULATE");
    expect(evaluateActionPermission({ ...base, freezeStatus: { active: true, actionClasses: ["DEPLOY"] } }).effectiveMode).toBe("SIMULATE");
    expect(evaluateActionPermission({ ...base, workOrder: { workOrderId: "wo-1", riskTier: "high", allowedActionClasses: ["READ_ONLY"] } }).effectiveMode).toBe("SIMULATE");
    const denyPolicy = loadActionPolicy(root);
    denyPolicy.actions.find((candidate) => candidate.actionClass === "DEPLOY")!.allowExecute = false;
    expect(evaluateActionPermission({ ...base, policy: denyPolicy }).effectiveMode).toBe("SIMULATE");
  });

  test("previews read-only, applies exact signed state, and records bounded evidence", () => {
    const root = workspace();
    const beforeRule = configureDeployRule(root);
    const policyPath = actionPolicyPath(root);
    const signaturePath = `${policyPath}.sig`;
    appendFileSync(policyPath, "\n# owner rationale: deployment evidence must remain reviewable\n", "utf8");
    signActionPolicy(root);
    const before = {
      policy: readFileSync(policyPath),
      signature: readFileSync(signaturePath),
      transparency: readTransparencyEntries(root),
      parsed: loadActionPolicy(root),
    };

    const inspected = inspectActionEvidenceLogic({ workspace: root, actionClass: "DEPLOY" });
    expect(inspected).toMatchObject({
      actionClass: "DEPLOY",
      configured: false,
      gateCount: 4,
      mandatoryGates: expect.arrayContaining(["policy-signature", "trust-tier", "sandbox", "execution-ticket", "allow-execute"]),
    });
    expect(JSON.stringify(inspected)).not.toContain(root);

    const associativeAll = {
      all: [
        {
          all: [
            { gate: "maturity:AMC-1.7" },
            { gate: "assurance:governance_bypass" },
          ],
        },
        {
          all: [
            { gate: "maturity:AMC-1.8" },
            { gate: "assurance:unsafe_tooling" },
          ],
        },
      ],
    };
    const associativeAllPreview = compileActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: associativeAll,
    });
    expect(associativeAllPreview).toMatchObject({ status: "no_changes", canApply: false });
    expect(readFileSync(policyPath)).toEqual(before.policy);
    expect(readTransparencyEntries(root)).toEqual(before.transparency);

    const explicitRoot = workspace();
    configureDeployRule(explicitRoot);
    const explicitPolicyPath = actionPolicyPath(explicitRoot);
    const explicitAllPolicy = loadActionPolicy(explicitRoot);
    explicitAllPolicy.actions.find((rule) => rule.actionClass === "DEPLOY")!.evidenceLogic = associativeAll;
    initActionPolicy(explicitRoot, explicitAllPolicy);
    appendFileSync(explicitPolicyPath, "\n# operator formatting must survive a semantic no-op\n", "utf8");
    signActionPolicy(explicitRoot);
    const explicitAllBytes = readFileSync(explicitPolicyPath);
    const regroupedAllPreview = compileActionEvidenceLogic({
      workspace: explicitRoot,
      actionClass: "DEPLOY",
      logic: {
        all: [
          { gate: "assurance:unsafe_tooling" },
          { gate: "maturity:AMC-1.7" },
          { gate: "assurance:governance_bypass" },
          { gate: "maturity:AMC-1.8" },
        ],
      },
    });
    expect(regroupedAllPreview).toMatchObject({ status: "no_changes", canApply: false });
    expect(readFileSync(explicitPolicyPath)).toEqual(explicitAllBytes);

    const preview = compileActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
    });
    expect(preview).toMatchObject({
      actionClass: "DEPLOY",
      status: "ready",
      canApply: true,
      hasAlternatives: true,
      requiresAlternativeAcknowledgement: true,
    });
    expect(preview.compileId).toMatch(/^action-logic-compile-[a-f0-9]{16}$/);
    expect(JSON.stringify(preview)).not.toContain(root);
    expect(readFileSync(policyPath)).toEqual(before.policy);
    expect(readFileSync(signaturePath)).toEqual(before.signature);
    expect(readTransparencyEntries(root)).toEqual(before.transparency);

    expect(() => applyActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: preview.compileId,
      acknowledgeAlternatives: false,
    })).toThrowError(expect.objectContaining<Partial<ActionEvidenceLogicError>>({ code: "ALTERNATIVE_ACK_REQUIRED" }));

    const applied = applyActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: preview.compileId,
      acknowledgeAlternatives: true,
    });
    expect(applied).toMatchObject({ applied: true, compileId: preview.compileId });
    expect(applied.transparencyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(applied.auditEventId).toEqual(expect.any(String));
    expect(verifyActionPolicySignature(root).valid).toBe(true);
    expect(sha256Hex(readFileSync(policyPath))).toBe(preview.candidate.actionPolicySha256);
    expect(readFileSync(policyPath, "utf8")).toContain("owner rationale: deployment evidence must remain reviewable");

    const after = loadActionPolicy(root);
    expect(after.actions.find((rule) => rule.actionClass === "DEPLOY")?.evidenceLogic)
      .toEqual(canonicalizePolicyEvidenceLogic(alternativeLogic()));
    expect(after.actions.map((rule) => rule.actionClass === "DEPLOY" ? { ...rule, evidenceLogic: undefined } : rule))
      .toEqual(before.parsed.actions.map((rule) => rule.actionClass === "DEPLOY" ? { ...beforeRule, evidenceLogic: undefined } : rule));
    expect(readTransparencyEntries(root).at(-1)).toMatchObject({
      type: "ACTION_POLICY_EVIDENCE_LOGIC_APPLIED",
      artifact: { kind: "policy", id: preview.compileId },
    });

    const ledger = openLedger(root);
    try {
      const row = ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ?")
        .get(applied.auditEventId) as { meta_json: string } | undefined;
      expect(JSON.parse(row!.meta_json)).toMatchObject({
        auditType: "ACTION_POLICY_EVIDENCE_LOGIC_APPLIED",
        actionClass: "DEPLOY",
        compileId: preview.compileId,
        logicSha256: preview.logic.candidateSha256,
        baseline: preview.baseline,
        candidate: preview.candidate,
        receipt: expect.any(String),
      });
    } finally {
      ledger.close();
    }

    const stablePolicy = readFileSync(policyPath);
    const stableSignature = readFileSync(signaturePath);
    const stableTransparency = readTransparencyEntries(root);
    const noOpPreview = compileActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
    });
    expect(noOpPreview).toMatchObject({ status: "no_changes", canApply: false });
    const noOp = applyActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: noOpPreview.compileId,
      acknowledgeAlternatives: false,
    });
    expect(noOp).toMatchObject({ applied: false, reason: "NO_CHANGES" });
    expect(readFileSync(policyPath)).toEqual(stablePolicy);
    expect(readFileSync(signaturePath)).toEqual(stableSignature);
    expect(readTransparencyEntries(root)).toEqual(stableTransparency);
  });

  test("rejects stale, tampered, busy, and failed signing state and restores prior bytes", () => {
    const root = workspace();
    configureDeployRule(root);
    const preview = compileActionEvidenceLogic({ workspace: root, actionClass: "DEPLOY", logic: alternativeLogic() });
    const policyPath = actionPolicyPath(root);
    appendFileSync(policyPath, "\n# owner change\n", "utf8");
    signActionPolicy(root);
    expect(() => applyActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: preview.compileId,
      acknowledgeAlternatives: true,
    })).toThrowError(expect.objectContaining<Partial<ActionEvidenceLogicError>>({ code: "CONFIRMATION_REQUIRED" }));

    const fresh = compileActionEvidenceLogic({ workspace: root, actionClass: "DEPLOY", logic: alternativeLogic() });
    const paths = [policyPath, `${policyPath}.sig`];
    const before = new Map(paths.map((path) => [path, readFileSync(path)]));
    delete process.env.AMC_VAULT_PASSPHRASE;
    lockVault(root);
    expect(() => applyActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: fresh.compileId,
      acknowledgeAlternatives: true,
    })).toThrowError(expect.objectContaining<Partial<ActionEvidenceLogicError>>({ code: "APPLY_FAILED" }));
    process.env.AMC_VAULT_PASSPHRASE = "amc-action-evidence-logic-test-passphrase";
    for (const path of paths) expect(readFileSync(path)).toEqual(before.get(path));
    expect(readTransparencyEntries(root).some((entry) => entry.type === "ACTION_POLICY_EVIDENCE_LOGIC_APPLIED")).toBe(false);

    withControlFileLock({
      root: join(root, ".amc"),
      name: ACTION_POLICY_WRITER_LOCK,
      operation: () => {
        expect(() => initActionPolicy(root)).toThrowError(ControlFileLockError);
        expect(() => applyPolicyPack({ workspace: root, packId: "code-agent.low" }))
          .toThrowError(ControlFileLockError);
        expect(() => applyActionEvidenceLogic({
          workspace: root,
          actionClass: "DEPLOY",
          logic: alternativeLogic(),
          confirmCompileId: fresh.compileId,
          acknowledgeAlternatives: true,
        })).toThrowError(expect.objectContaining<Partial<ActionEvidenceLogicError>>({ code: "LOCK_BUSY" }));
      },
    });

    const evidenceFailureRoot = workspace();
    configureDeployRule(evidenceFailureRoot);
    const evidenceFailurePreview = compileActionEvidenceLogic({
      workspace: evidenceFailureRoot,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
    });
    const evidenceFailurePolicyPath = actionPolicyPath(evidenceFailureRoot);
    const evidenceFailureBefore = {
      policy: readFileSync(evidenceFailurePolicyPath),
      signature: readFileSync(`${evidenceFailurePolicyPath}.sig`),
      transparency: readFileSync(transparencyLogPath(evidenceFailureRoot)),
    };
    writeFileSync(transparencyLogPath(evidenceFailureRoot), "{broken-transparency-log}\n", "utf8");
    expect(() => applyActionEvidenceLogic({
      workspace: evidenceFailureRoot,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: evidenceFailurePreview.compileId,
      acknowledgeAlternatives: true,
    })).toThrowError(expect.objectContaining<Partial<ActionEvidenceLogicError>>({ code: "APPLY_FAILED" }));
    expect(readFileSync(evidenceFailurePolicyPath)).toEqual(evidenceFailureBefore.policy);
    expect(readFileSync(`${evidenceFailurePolicyPath}.sig`)).toEqual(evidenceFailureBefore.signature);
    expect(verifyActionPolicySignature(evidenceFailureRoot).valid).toBe(true);
    const pendingPath = join(evidenceFailureRoot, ".amc", ".action-policy-writer.pending.json");
    expect(existsSync(pendingPath)).toBe(true);
    expect(() => initActionPolicy(evidenceFailureRoot)).toThrow(/recovery is pending/i);
    expect(() => applyPolicyPack({ workspace: evidenceFailureRoot, packId: "code-agent.low" }))
      .toThrow(/recovery is pending/i);
    writeFileSync(transparencyLogPath(evidenceFailureRoot), evidenceFailureBefore.transparency);
    const recovered = applyActionEvidenceLogic({
      workspace: evidenceFailureRoot,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: evidenceFailurePreview.compileId,
      acknowledgeAlternatives: true,
    });
    expect(recovered.applied).toBe(true);
    expect(existsSync(pendingPath)).toBe(false);
  });

  test("exposes CLI and API parity with strict requests and owner-only mutation", async () => {
    const root = workspace();
    configureDeployRule(root);
    const logicPath = join(root, "logic.json");
    writeFileSync(logicPath, `${JSON.stringify(alternativeLogic(), null, 2)}\n`, "utf8");

    const shown = runCli(root, ["policy", "action", "logic", "show", "DEPLOY", "--json"]);
    expect(shown.status).toBe(0);
    expect(JSON.parse(shown.stdout)).toMatchObject({ actionClass: "DEPLOY", gateCount: 4 });
    const compiled = runCli(root, ["policy", "action", "logic", "compile", "DEPLOY", "--file", logicPath, "--json"]);
    expect(compiled.status).toBe(0);
    const preview = JSON.parse(compiled.stdout);
    expect(preview).toMatchObject({ canApply: true, hasAlternatives: true });
    expect(JSON.stringify(preview)).not.toContain(root);
    const denied = runCli(root, [
      "policy", "action", "logic", "apply", "DEPLOY", "--file", logicPath,
      "--confirm", preview.compileId, "--json",
    ]);
    expect(denied.status).toBe(2);
    expect(JSON.parse(denied.stderr)).toMatchObject({ ok: false, error: { code: "ALTERNATIVE_ACK_REQUIRED" } });
    const applied = runCli(root, [
      "policy", "action", "logic", "apply", "DEPLOY", "--file", logicPath,
      "--confirm", preview.compileId, "--acknowledge-alternatives", "--json",
    ]);
    expect(applied.status).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ applied: true, compileId: preview.compileId });

    const apiRoot = workspace();
    configureDeployRule(apiRoot);
    const inspected = await callPolicyApi(apiRoot, "/api/v1/policy/action/evidence-logic?actionClass=DEPLOY", "GET");
    expect(inspected).toMatchObject({ handled: true, status: 200 });
    expect(inspected.json.data).toMatchObject({ actionClass: "DEPLOY", gateCount: 4 });
    const apiCompiled = await callPolicyApi(apiRoot, "/api/v1/policy/action/evidence-logic/compile", "POST", {
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
    });
    expect(apiCompiled).toMatchObject({ handled: true, status: 200 });
    const apiPreview = apiCompiled.json.data;
    const malformed = await callPolicyApi(apiRoot, "/api/v1/policy/action/evidence-logic/compile", "POST", {
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      selector: "input",
    });
    expect(malformed).toMatchObject({ handled: true, status: 400 });
    const apiApplied = await callPolicyApi(apiRoot, "/api/v1/policy/action/evidence-logic/apply", "POST", {
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: apiPreview.compileId,
      acknowledgeAlternatives: true,
    });
    expect(apiApplied).toMatchObject({ handled: true, status: 200 });
    expect(apiApplied.json.data).toMatchObject({ applied: true });
    expect(JSON.stringify(apiApplied.json)).not.toContain(apiRoot);

    expect(resolveApiRolePolicy("/api/v1/policy/action/evidence-logic", "GET")).toMatchObject({ access: "read" });
    expect(resolveApiRolePolicy("/api/v1/policy/action/evidence-logic/compile", "POST")).toMatchObject({ access: "analyze" });
    expect(resolveApiRolePolicy("/api/v1/policy/action/evidence-logic/apply", "POST")).toMatchObject({ access: "owner", roles: ["OWNER"] });
  });

  test("keeps remote mutation read-only when signed trust configuration is invalid", async () => {
    const root = workspace();
    configureDeployRule(root);
    const compiled = await callPolicyApi(root, "/api/v1/policy/action/evidence-logic/compile", "POST", {
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
    });
    expect(compiled).toMatchObject({ handled: true, status: 200 });
    const policyPath = actionPolicyPath(root);
    const beforePolicy = readFileSync(policyPath);
    const beforeSignature = readFileSync(`${policyPath}.sig`);
    const beforeTransparency = readTransparencyEntries(root);
    appendFileSync(trustConfigPath(root), "\n# unsigned trust change\n", "utf8");

    const denied = await callPolicyApi(root, "/api/v1/policy/action/evidence-logic/apply", "POST", {
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: compiled.json.data.compileId,
      acknowledgeAlternatives: true,
    });
    expect(denied).toMatchObject({ handled: true, status: 403 });
    expect(denied.json.error).toContain("READ_ONLY_MODE");
    expect(readFileSync(policyPath)).toEqual(beforePolicy);
    expect(readFileSync(`${policyPath}.sig`)).toEqual(beforeSignature);
    expect(readTransparencyEntries(root)).toEqual(beforeTransparency);
  });

  test("projects and simulates the real evidence tree and publishes bounded public contracts", () => {
    const root = workspace();
    configureDeployRule(root);
    const preview = compileActionEvidenceLogic({ workspace: root, actionClass: "DEPLOY", logic: alternativeLogic() });
    const applied = applyActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: preview.compileId,
      acknowledgeAlternatives: true,
    });
    const noOpPreview = compileActionEvidenceLogic({ workspace: root, actionClass: "DEPLOY", logic: alternativeLogic() });
    const noOpApplied = applyActionEvidenceLogic({
      workspace: root,
      actionClass: "DEPLOY",
      logic: alternativeLogic(),
      confirmCompileId: noOpPreview.compileId,
      acknowledgeAlternatives: false,
    });
    const emptyRoot = workspace();
    const emptyPolicy = loadActionPolicy(emptyRoot);
    const emptyRule = emptyPolicy.actions.find((rule) => rule.actionClass === "DEPLOY")!;
    emptyRule.minEffectiveQuestionLevels = {};
    emptyRule.requireAssurancePacks = {};
    initActionPolicy(emptyRoot, emptyPolicy);
    const emptyInspection = inspectActionEvidenceLogic({ workspace: emptyRoot, actionClass: "DEPLOY" });
    const projected = buildControlProjection(root).families
      .find((family) => family.familyId === "action-policy")!.controls
      .find((control) => control.controlId === "action:DEPLOY")!;
    expect(projected.when).toContainEqual(expect.stringContaining("ANY"));
    expect(projected.when).toContainEqual(expect.stringContaining("mandatory"));
    const simulation = simulateControlDecision({
      workspace: root,
      controlId: "action:DEPLOY",
      riskTier: "low",
      requestedMode: "EXECUTE",
      hasExecTicket: true,
    });
    expect(simulation.evaluator).toBe("action-policy");
    expect(simulation.conditions).toContainEqual(expect.objectContaining({ conditionId: "evidence-logic" }));

    const openapi = generateFullOpenApiSpec();
    const publishedOpenApiSource = readFileSync("website/openapi.yaml", "utf8");
    const published = YAML.parse(publishedOpenApiSource) as any;
    expect(published.openapi).toBe("3.0.3");
    expect(publishedOpenApiSource).not.toMatch(/type:\s*\[[^\]]*['\"]null['\"]/);
    expect(publishedOpenApiSource).not.toMatch(/type:\s*['\"]null['\"]/);
    for (const suffix of ["", "/compile", "/apply"]) {
      expect(openapi.paths).toHaveProperty(`/api/v1/policy/action/evidence-logic${suffix}`);
      expect(published.paths).toHaveProperty(`/v1/policy/action/evidence-logic${suffix}`);
    }
    expect(Object.keys(openapi.paths["/api/v1/policy/action/evidence-logic"].get.responses).sort())
      .toEqual(["200", "400", "401", "409", "500"]);
    expect(Object.keys(openapi.paths["/api/v1/policy/action/evidence-logic/compile"].post.responses).sort())
      .toEqual(["200", "400", "401", "409", "500"]);
    expect(Object.keys(openapi.paths["/api/v1/policy/action/evidence-logic/apply"].post.responses).sort())
      .toEqual(["200", "400", "401", "403", "409", "423", "500"]);
    expect(Object.keys(published.paths["/v1/policy/action/evidence-logic"].get.responses).sort())
      .toEqual(["200", "400", "401", "409", "500"]);
    expect(Object.keys(published.paths["/v1/policy/action/evidence-logic/compile"].post.responses).sort())
      .toEqual(["200", "400", "401", "409", "500"]);
    expect(Object.keys(published.paths["/v1/policy/action/evidence-logic/apply"].post.responses).sort())
      .toEqual(["200", "400", "401", "403", "409", "423", "500"]);
    for (const schema of [
      "PolicyEvidenceLogic",
      "ActionEvidenceLogicInspection",
      "ActionEvidenceLogicCompilation",
      "ActionEvidenceLogicApplyRequest",
      "ActionEvidenceLogicApplyResult",
    ]) {
      expect(openapi.components.schemas).toHaveProperty(schema);
      expect(published.components.schemas).toHaveProperty(schema);
    }
    expect(published.components.schemas).toHaveProperty("NullablePolicyEvidenceLogic");
    expect(openapi.components.schemas.PolicyEvidenceLogic.description).toContain("at most 60 declared gates");
    expect(openapi.components.schemas.ActionEvidenceLogicInspection.properties.gateCount.maximum).toBe(60);
    expect(openapi.components.schemas.ActionEvidenceLogicCompilation.properties.gates.maxItems).toBe(60);
    expect(published.components.schemas.PolicyEvidenceLogic.description).toContain("at most 60 declared gates");
    expect(published.components.schemas.ActionEvidenceLogicInspection.properties.gateCount.maximum).toBe(60);
    expect(published.components.schemas.ActionEvidenceLogicCompilation.properties.gates.maxItems).toBe(60);
    const validatePreview = new Ajv({ strict: false, validateFormats: false }).compile({
      ...openapi.components.schemas.ActionEvidenceLogicCompilation,
      components: openapi.components,
    });
    expect(validatePreview(preview), validatePreview.errors ?? []).toBe(true);
    const validatePublishedApply = new Ajv({ strict: false, validateFormats: false }).compile({
      ...published.components.schemas.ActionEvidenceLogicApplyResult,
      components: published.components,
    });
    expect(validatePublishedApply(applied), JSON.stringify(validatePublishedApply.errors ?? [])).toBe(true);
    expect(validatePublishedApply(noOpApplied), JSON.stringify(validatePublishedApply.errors ?? [])).toBe(true);
    const validatePublishedInspection = new Ajv({ strict: false, validateFormats: false }).compile({
      ...published.components.schemas.ActionEvidenceLogicInspection,
      components: published.components,
    });
    expect(validatePublishedInspection(emptyInspection), JSON.stringify(validatePublishedInspection.errors ?? [])).toBe(true);
    const studio = readFileSync("src/console/assets/app.js", "utf8");
    const start = studio.indexOf('const evidenceLogicActionClass = document.getElementById("evidenceLogicActionClass")');
    const end = studio.indexOf('const scopeTemplateSelect = document.getElementById("scopeTemplateSelect")', start);
    const evidenceLogicUi = studio.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(evidenceLogicUi).toContain("evidenceLogicAlternativeGroups");
    expect(evidenceLogicUi).toContain("acknowledgeAlternatives");
    expect(evidenceLogicUi).toContain("/api/v1/policy/action/evidence-logic/compile");
    expect(evidenceLogicUi).toContain("/api/v1/policy/action/evidence-logic/apply");
    expect(evidenceLogicUi).toContain("evidenceLogicConfirm.value.trim() !== evidenceLogicPreview.compileId");
    expect(evidenceLogicUi).toContain('evidenceLogicActionClass.addEventListener("change", loadEvidenceLogicInspection)');
    expect(evidenceLogicUi).toContain("evidenceLogicBusy || !evidenceLogicInspection");
    expect(evidenceLogicUi).toContain("evidenceLogicBuilderCompatible");
    expect(evidenceLogicUi).toContain("read-only in Studio");
    expect(evidenceLogicUi).not.toContain("window.confirm");
    expect(readFileSync("src/console/pages/policypacks.html", "utf8"))
      .toContain("app.js?v=20260711c");
  });

  test("publishes adoption, source, no-copy, and release artifacts", () => {
    expect(readFileSync("docs/ACTION_EVIDENCE_LOGIC.md", "utf8")).toContain("Mandatory Gates");
    expect(readFileSync("docs/source-reviews/AMC-1475-nested-action-evidence-logic.md", "utf8")).toContain("83188b62c63e2b4ff9ada87048fd99605184ee5a");
    expect(readFileSync("docs/source-reviews/AMC-1475-nested-action-evidence-logic.md", "utf8")).toContain("No-bloat boundary");
    expect(readFileSync("docs/internal/agent-control-agentapprove-competitive-response.md", "utf8")).toContain("Implemented in AMC-1475");
    expect(readFileSync(".changeset/amc-nested-action-evidence-logic.md", "utf8")).toContain("minor");
    expect(readFileSync("website/docs/docs.js", "utf8")).toContain("'ACTION_EVIDENCE_LOGIC'");
    const source = [
      readFileSync("src/governor/policyEvidenceLogic.ts", "utf8"),
      readFileSync("src/enforce/actionEvidenceLogic.ts", "utf8"),
    ].join("\n");
    expect(source).not.toMatch(/agentcontrol|agent-control|ConditionNode|ControlSelector|EvaluatorSpec/i);
    expect(source).not.toMatch(/step_name|step-name|providerSelector|payloadSelector/i);
  });
});
