import { describe, expect, it } from "vitest";
import type { AuthorizationRecordV1 } from "../../src/actions/authorizationRecord.js";
import type { ActiveCompiledPolicy } from "../../src/catalog/compiler/activate.js";
import type { EffectiveRuntimePolicy } from "../../src/catalog/compiler/types.js";
import {
  compiledApprovalClasses, compiledPolicyDenial, compiledPolicyFacts, compiledPolicyShows, planRequiresAgentLease
} from "../../src/tools/guards/compiledPolicyGuard.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";

// Typed, already-derived unit inputs only: no plan activation, authenticated lease, approval or effect is created.
const WORKSPACE = "/unit-p112-no-workspace-created";
const CONTROL = "L0-UNIT-01";
const APPROVAL_CONTROL = "L1-UNIT-02";
const HEX = "a".repeat(64);

function policy(pipeline: Partial<EffectiveRuntimePolicy["toolPipeline"]> = {},
  approvals: EffectiveRuntimePolicy["approvals"] = {}): ActiveCompiledPolicy {
  return {
    revision: 7, entrySha256: "b".repeat(64), planDigest: `sha256:${"c".repeat(64)}`,
    profileSha256: "d".repeat(64), lockDigest: `sha256:${"e".repeat(64)}`,
    controls: [
      { controlId: CONTROL, controlVersion: "1.0.0", points: ["tool_pipeline"], compiledPoints: ["tool_pipeline"], review: "pending" },
      { controlId: APPROVAL_CONTROL, controlVersion: "2.0.0", points: ["approvals"], compiledPoints: ["approvals"], review: "pending" }
    ],
    runtimePolicy: {
      policyDigest: `sha256:${HEX}`,
      toolPipeline: { visibleTools: ["unit.echo"], approvalRequiredFor: [], guards: [], ...pipeline }, approvals,
      egress: { mode: "deny_by_default", allowHosts: [], processorAllowlist: [], controlIds: [] },
      deletion: { unknownHold: "deny", retentionDays: {}, controlIds: [] },
      proposedSignedConfigs: { approvalPolicy: null, budgets: null, tools: null, actionPolicy: null, firewall: null, opsPolicy: null }
    }
  };
}

function identity(params: EffectiveRuntimePolicy["toolPipeline"]["guards"][number]["params"]) {
  return { id: "identity-binding", params, controlIds: [CONTROL] };
}

function execution(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    token: "unit-token", callId: "unit-call", rootCallId: "unit-call", name: "unit.echo",
    agentId: "unit-agent", workspace: WORKSPACE, actionClass: "READ_ONLY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
    arguments: {}, parentToken: null, ...overrides
  };
}

function authorization(authenticatedVia: AuthorizationRecordV1["principal"]["authenticatedVia"] = "lease",
  leaseId: string | null = "unit-derived-lease"): NonNullable<ToolExecution["authorization"]> {
  const record: AuthorizationRecordV1 = {
    schema: "amc.authorization-record/v1", authorizationId: "unit-authorization", executionId: "unit-execution",
    issuedAt: "2026-10-17T00:00:00.000Z", expiresAt: "2026-10-17T00:05:00.000Z",
    scope: { workspaceId: "unit-workspace", tenantId: null, deploymentId: "unit-deployment", deploymentDigest: HEX },
    subject: { governedAs: "unit-agent", runAs: "unit-agent", agentConfigDigest: null },
    principal: { principalId: "unit-principal", kind: authenticatedVia === "lease" ? "service" : "human", authenticatedVia },
    delegation: { depth: 0, parentExecutionId: null, allowedActionClasses: ["READ_ONLY"], leaseId },
    session: { sessionId: "unit-session", runId: null, callId: "unit-call", rootCallId: "unit-call", parentToken: null },
    control: { controlId: CONTROL, controlVersion: "1.0.0" },
    policy: { compiledPolicyDigest: HEX, policyRevision: 7, toolsConfigDigest: HEX, actionPolicyDigest: HEX, approvalPolicyDigest: HEX, budgetsDigest: HEX },
    action: { toolName: "unit.echo", adapterId: "unit", actionClass: "READ_ONLY", mode: "EXECUTE", argumentsDigest: HEX, normalizer: "amc.args/v1" },
    resource: { purpose: null, dataClasses: [] },
    bindings: { amount: null, recipient: null, destination: null, resourceId: null, resourceVersion: null },
    authority: { approvals: [], exceptions: [] }, idempotencyKey: null, evidenceRefs: []
  };
  return { authorizationId: record.authorizationId, digest: HEX, record };
}

function neutral(input = policy(), call = execution()): void {
  // Undefined leaves the call unchanged by this component; another guard or authorization can still deny it.
  expect(compiledPolicyDenial(input, WORKSPACE, call)).toBeUndefined();
}

describe("compiled policy guard on already-derived unit inputs", () => {
  it("shows listed names and names a hidden-tool refusal", () => {
    const input = policy();
    neutral(input);
    expect(compiledPolicyShows(input, "unit.echo")).toBe(true);
    expect(compiledPolicyShows(input, "unit.echo.extra")).toBe(false);
    expect(compiledPolicyShows(input, "UNIT.ECHO")).toBe(false);
    expect(compiledPolicyDenial(input, WORKSPACE, execution({ name: "unit.hidden" })))
      .toBe('compiled policy denied this call (toolPipeline.visibleTools): "unit.hidden" is not a visible tool');
  });

  it("keeps run_code visible without exempting its call from compiled guards", () => {
    const input = policy({ visibleTools: [] });
    const call = execution({ name: "run_code" });
    expect(compiledPolicyShows(input, "run_code")).toBe(true);
    neutral(input, call);
    const guarded = policy({ visibleTools: [], guards: [{ id: "unit-unsupported", params: {}, controlIds: [CONTROL] }] });
    expect(compiledPolicyDenial(guarded, WORKSPACE, call))
      .toBe(`compiled policy denied this call (control ${CONTROL}@1.0.0): guard unit-unsupported is not implemented by this pipeline`);
  });

  it("fails closed on unsupported guard names and identifies each supplied control version", () => {
    const call = execution({ authorization: authorization() });
    neutral(policy(), call);
    const rows = [
      { ids: [CONTROL, APPROVAL_CONTROL], names: `${CONTROL}@1.0.0, ${APPROVAL_CONTROL}@2.0.0` },
      { ids: ["L0-UNKNOWN-99"], names: "L0-UNKNOWN-99@unknown" }
    ].map(row => ({
      expected: `compiled policy denied this call (control ${row.names}): guard unit-unsupported is not implemented by this pipeline`,
      actual: compiledPolicyDenial(policy({ guards: [{ id: "unit-unsupported", params: {}, controlIds: row.ids }] }), WORKSPACE, call)
    }));
    expect(rows.map(row => row.actual)).toEqual(rows.map(row => row.expected));
  });

  it("requires a lease only for the identity-binding rule's explicit lease requirement", () => {
    expect(planRequiresAgentLease(null)).toBe(false);
    expect(planRequiresAgentLease(policy())).toBe(false);
    expect(planRequiresAgentLease(policy({ guards: [identity({ requireAgentLease: false })] }))).toBe(false);
    expect(planRequiresAgentLease(policy({ guards: [{ id: "unit-other", params: { requireAgentLease: true }, controlIds: [CONTROL] }] }))).toBe(false);
    expect(planRequiresAgentLease(policy({ guards: [identity({ requireAgentLease: true })] }))).toBe(true);
  });

  it("requires the already-derived authorization to carry its lease identity", () => {
    const input = policy({ guards: [identity({ requireAgentLease: true })] });
    neutral(input, execution({ authorization: authorization() }));
    const expected = `compiled policy denied this call (control ${CONTROL}@1.0.0): IDENTITY_UNRESOLVED: the call carries no verified agent lease`;
    expect(compiledPolicyDenial(input, WORKSPACE, execution())).toBe(expected);
    expect(compiledPolicyDenial(input, WORKSPACE, execution({ authorization: authorization("lease", null) }))).toBe(expected);
  });

  it("rejects absent and OS-user principals while consuming the authenticated principal methods", () => {
    const input = policy({ guards: [identity({ requirePrincipal: true })] });
    const methods: AuthorizationRecordV1["principal"]["authenticatedVia"][] = ["studio-session", "lease", "approval-engine"];
    for (const method of methods) neutral(input, execution({ authorization: authorization(method) }));
    const expected = `compiled policy denied this call (control ${CONTROL}@1.0.0): PRINCIPAL_UNRESOLVED: no authenticated principal is bound to the call (an OS user name is self-reported)`;
    expect(compiledPolicyDenial(input, WORKSPACE, execution())).toBe(expected);
    expect(compiledPolicyDenial(input, WORKSPACE, execution({ authorization: authorization("cli-os-user") }))).toBe(expected);
  });

  it("preserves lease-before-principal refusal when both identity requirements apply", () => {
    const input = policy({ guards: [identity({ requireAgentLease: true, requirePrincipal: true })] });
    neutral(input, execution({ authorization: authorization() }));
    expect(compiledPolicyDenial(input, WORKSPACE, execution()))
      .toBe(`compiled policy denied this call (control ${CONTROL}@1.0.0): IDENTITY_UNRESOLVED: the call carries no verified agent lease`);
    expect(compiledPolicyDenial(input, WORKSPACE, execution({ authorization: authorization("cli-os-user") })))
      .toBe(`compiled policy denied this call (control ${CONTROL}@1.0.0): PRINCIPAL_UNRESOLVED: no authenticated principal is bound to the call (an OS user name is self-reported)`);
  });

  it("leaves identity requirements disabled when neither flag is required", () => {
    neutral(policy({ guards: [identity({ requireAgentLease: false, requirePrincipal: false })] }));
    neutral(policy({ guards: [identity({})] }));
  });

  it("projects the digest and revision with approval-class control before the guard fallback", () => {
    const input = policy({ guards: [identity({ requirePrincipal: true })] }, { FINANCIAL: {
      requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["OWNER"], ttlMinutes: 10, controlIds: [APPROVAL_CONTROL]
    } });
    const facts = compiledPolicyFacts(input);
    expect(facts.digest).toBe(HEX);
    expect(facts.revision).toBe(7);
    expect(facts.controlFor("FINANCIAL")).toEqual({ controlId: APPROVAL_CONTROL, controlVersion: "2.0.0" });
    expect(facts.controlFor("READ_ONLY")).toEqual({ controlId: CONTROL, controlVersion: "1.0.0" });
  });

  it("leaves absent admitting controls null and unknown control versions explicitly null", () => {
    expect(compiledPolicyFacts(policy()).controlFor("READ_ONLY")).toBeNull();
    const input = policy({ guards: [{ id: "unit-unsupported", params: {}, controlIds: ["L0-UNKNOWN-99"] }] });
    const facts = compiledPolicyFacts({ ...input, runtimePolicy: { ...input.runtimePolicy, policyDigest: HEX } });
    expect(facts.digest).toBe(HEX);
    expect(facts.controlFor("READ_ONLY")).toEqual({ controlId: "L0-UNKNOWN-99", controlVersion: null });
  });

  it("projects only the supplied approval-required action classes without granting authority", () => {
    expect([...compiledApprovalClasses(null)]).toEqual([]);
    expect([...compiledApprovalClasses(policy())]).toEqual([]);
    const input = policy({ approvalRequiredFor: ["FINANCIAL", "DEPLOY"] });
    const before = JSON.stringify(input);
    const classes = compiledApprovalClasses(input);
    expect([...classes]).toEqual(["FINANCIAL", "DEPLOY"]);
    expect(classes.has("READ_ONLY")).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });
});
