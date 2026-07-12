import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { builtInAdapterCapabilities } from "../src/adapters/adapterCapabilities.js";
import { mapProviderHookEvent } from "../src/adapters/hookIntegration.js";
import {
  evaluateProviderHookControl,
  HookControlError,
  renderProviderControlResponse,
  serializeProviderControlResponse,
  validateProviderControlResponse,
  verifyProviderHookControlResult,
} from "../src/bridge/hookControl.js";
import {
  ingestObservedAepHookEvent,
  resolveUnmatchedObservedHookAction,
} from "../src/bridge/hookIngress.js";
import { hashBinaryOrPath, openLedger } from "../src/ledger/ledger.js";
import { projectOnboardingActivation } from "../src/setup/onboardingActivation.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";
import { toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
let metadataSequence = 0;

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-1476-steer-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "amc-1476-provider-steer-test";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initApprovalPolicy(workspace);
  return workspace;
}

function providerInput(input: {
  workspace: string;
  provider: "claude-code" | "gemini-cli";
  actionId: string;
}): string {
  return JSON.stringify(input.provider === "claude-code"
    ? {
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_use_id: input.actionId,
        tool_input: { file_path: join(input.workspace, "outside-policy.txt") },
      }
    : {
        hook_event_name: "BeforeTool",
        tool_name: "read_file",
        tool_call_id: input.actionId,
        tool_input: { file_path: join(input.workspace, "outside-policy.txt") },
      });
}

function observeRequestedAction(input: {
  workspace: string;
  agentId: string;
  provider: "claude-code" | "gemini-cli";
  rawInput: string;
}) {
  const event = mapProviderHookEvent({
    provider: input.provider,
    agentId: input.agentId,
    rawInput: input.rawInput,
    observedAt: Date.parse("2026-07-12T04:00:00.000Z"),
  });
  ingestObservedAepHookEvent({
    workspace: input.workspace,
    authenticatedAgentId: input.agentId,
    rawBody: Buffer.from(JSON.stringify(event), "utf8"),
    now: Date.parse("2026-07-12T04:00:00.000Z"),
  });
  return event;
}

function appendLegacyV1Allow(input: {
  workspace: string;
  agentId: string;
  actionId: string;
  rawInput: string;
}): void {
  const provider = "claude-code" as const;
  const eventId = `hook_control_${sha256Hex(canonicalize({
    agentId: input.agentId,
    provider,
    actionId: input.actionId,
  })).slice(0, 44)}`;
  const sessionId = `hook-control-session-${sha256Hex(canonicalize({
    agentId: input.agentId,
    provider,
    actionId: input.actionId,
  })).slice(0, 36)}`;
  const response = renderProviderControlResponse(provider, "allow", "signed legacy allow");
  const responseSha256 = sha256Hex(Buffer.from(serializeProviderControlResponse(response), "utf8"));
  const ledger = openLedger(input.workspace);
  ledger.startSession({
    sessionId,
    runtime: "claude",
    binaryPath: "amc-bridge-hook-control",
    binarySha256: hashBinaryOrPath("amc-bridge-hook-control", "1"),
  });
  ledger.appendEvidenceWithReceipt({
    id: eventId,
    sessionId,
    runtime: "claude",
    eventType: "audit",
    payload: `${JSON.stringify({
      kind: "hook_control_decision",
      version: 1,
      agentId: input.agentId,
      provider,
      actionId: input.actionId,
      requestedDecision: "allow",
      decision: "allow",
      capabilityLossy: false,
      providerResponseSha256: responseSha256,
      rawPayloadStored: false,
    }, null, 2)}\n`,
    payloadExt: "json",
    inline: false,
    meta: {
      trustTier: "OBSERVED",
      controlSchemaVersion: 1,
      agentId: input.agentId,
      provider,
      actionId: input.actionId,
      providerToolName: "Read",
      rawInputSha256: sha256Hex(Buffer.from(input.rawInput, "utf8")),
      rawPayloadStored: false,
      canonicalToolName: "fs.read",
      requestedDecision: "allow",
      decision: "allow",
      capabilityLossy: false,
      reason: "signed legacy allow",
      providerResponse: response,
      providerResponseSha256: responseSha256,
      bodySha256: responseSha256,
    },
    receipt: {
      kind: "guard_check",
      agentId: input.agentId,
      providerId: `hook-control:${provider}`,
      model: null,
      bodySha256: responseSha256,
    },
  });
  ledger.sealSession(sessionId);
  ledger.close();
}

function appendDecisionShapedEvent(input: {
  workspace: string;
  agentId: string;
  actionId: string;
  eventType: "audit" | "llm_request";
  provider?: "claude-code" | "gemini-cli";
  validMapping?: boolean;
}): void {
  metadataSequence += 1;
  const provider = input.provider ?? "claude-code";
  const validMapping = input.validMapping === true;
  const sessionId = `amc-1476-metadata-session-${metadataSequence}`;
  const payload = `malformed-decision-candidate-${metadataSequence}`;
  const bodySha256 = sha256Hex(payload);
  const ledger = openLedger(input.workspace);
  ledger.startSession({
    sessionId,
    runtime: provider === "claude-code" ? "claude" : "gemini",
    binaryPath: "amc-1476-metadata-test",
    binarySha256: hashBinaryOrPath("amc-1476-metadata-test", "1"),
  });
  ledger.appendEvidenceWithReceipt({
    id: `amc-1476-metadata-event-${metadataSequence}`,
    sessionId,
    runtime: provider === "claude-code" ? "claude" : "gemini",
    eventType: input.eventType,
    payload,
    payloadExt: "txt",
    inline: false,
    meta: {
      trustTier: "OBSERVED",
      controlSchemaVersion: 2,
      agentId: input.agentId,
      provider,
      actionId: input.actionId,
      requestedDecision: "steer",
      decision: "deny",
      effectiveOutcome: validMapping && provider === "claude-code" ? "steer" : "deny",
      providerMapping: provider === "claude-code" ? "corrective_deny" : "fail_closed_deny",
      capabilityLossy: provider === "gemini-cli",
      rawPayloadStored: false,
    },
    receipt: {
      kind: "guard_check",
      agentId: input.agentId,
      providerId: `hook-control:${provider}`,
      model: null,
      bodySha256,
    },
  });
  ledger.sealSession(sessionId);
  ledger.close();
}

afterEach(() => {
  while (roots.length > 0) {
    const workspace = roots.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

describe("AMC-1476 capability-gated provider steer outcome", () => {
  test("blocks the current Claude call, returns bounded correction, and records verified steer", () => {
    const workspace = newWorkspace();
    const agentId = "claude-steer-agent";
    const actionId = "toolu_amc1476_claude";
    const rawInput = providerInput({ workspace, provider: "claude-code", actionId });
    observeRequestedAction({ workspace, agentId, provider: "claude-code", rawInput });

    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
    });

    expect(result).toMatchObject({
      requestedDecision: "steer",
      decision: "deny",
      effectiveOutcome: "steer",
      providerMapping: "corrective_deny",
      capabilityLossy: false,
    });
    expect(result.providerResponse).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringMatching(/signed ToolHub/i),
        additionalContext: expect.stringMatching(/correct.*retry.*new action/i),
      },
    });
    expect(JSON.stringify(result)).not.toContain(join(workspace, "outside-policy.txt"));
    expect(JSON.stringify(result.providerResponse)).not.toContain("updatedInput");
    expect(validateProviderControlResponse("claude-code", result.providerResponse)).toBe(true);
    expect(verifyProviderHookControlResult({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
      result,
    })).toEqual({ ok: true, error: null });

    const lifecycle = inspectHookActionLifecycle({ workspace, agentId, actionId });
    expect(lifecycle).toMatchObject({
      schemaVersion: "2026-07-12",
      status: "steered",
      valid: true,
      failClosed: false,
      phases: {
        decision: {
          decision: "deny",
          requestedDecision: "steer",
          effectiveOutcome: "steer",
          providerMapping: "corrective_deny",
        },
      },
    });

    expect(() => evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_use_id: actionId,
        tool_input: { file_path: join(workspace, "workspace", "corrected.txt") },
      }),
    })).toThrowError(expect.objectContaining<Partial<HookControlError>>({
      code: "HOOK_CONTROL_REPLAY_CONFLICT",
      statusCode: 409,
    }));

    const tampered = structuredClone(result);
    tampered.effectiveOutcome = "deny";
    expect(verifyProviderHookControlResult({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
      result: tampered,
    }).ok).toBe(false);
  });

  test("fails a requested Gemini steer closed to deny without claiming effective steer", () => {
    const workspace = newWorkspace();
    const agentId = "gemini-steer-agent";
    const rawInput = providerInput({
      workspace,
      provider: "gemini-cli",
      actionId: "toolu_amc1476_gemini",
    });

    const result = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "gemini-cli",
      rawInput,
    });

    expect(result).toMatchObject({
      requestedDecision: "steer",
      decision: "deny",
      effectiveOutcome: "deny",
      providerMapping: "fail_closed_deny",
      capabilityLossy: true,
    });
    expect(result.providerResponse).toEqual({
      decision: "deny",
      reason: expect.stringMatching(/does not support.*corrective.*retry/i),
    });
    expect(JSON.stringify(result)).not.toContain(join(workspace, "outside-policy.txt"));
    expect(JSON.stringify(result)).not.toContain("updatedInput");
  });

  test("keeps invalid signed state and unmapped tools as permanent deny", () => {
    const workspace = newWorkspace();
    const toolsPath = toolsConfigPath(workspace);
    writeFileSync(toolsPath, `${readFileSync(toolsPath, "utf8")}\n# unsigned change\n`, "utf8");
    const rawInput = providerInput({
      workspace,
      provider: "claude-code",
      actionId: "toolu_amc1476_invalid_signature",
    });

    const invalidSignature = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: "invalid-signature-agent",
      provider: "claude-code",
      rawInput,
    });
    expect(invalidSignature).toMatchObject({
      requestedDecision: "deny",
      decision: "deny",
      effectiveOutcome: "deny",
      providerMapping: "native",
      capabilityLossy: false,
    });
    expect(JSON.stringify(invalidSignature.providerResponse)).not.toContain("additionalContext");

    const unmappedWorkspace = newWorkspace();
    const unmapped = evaluateProviderHookControl({
      workspace: unmappedWorkspace,
      authenticatedAgentId: "unmapped-agent",
      provider: "claude-code",
      rawInput: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "UnknownTool",
        tool_use_id: "toolu_amc1476_unknown",
        tool_input: {},
      }),
    });
    expect(unmapped).toMatchObject({
      requestedDecision: "deny",
      effectiveOutcome: "deny",
      providerMapping: "native",
    });
  });

  test("advertises steer only for the provider with a verified corrective-retry contract", () => {
    const claude = builtInAdapterCapabilities({
      hookProvider: "claude-code",
      versionSource: "adapter_binary",
    });
    const gemini = builtInAdapterCapabilities({
      hookProvider: "gemini-cli",
      versionSource: "adapter_binary",
    });

    expect(claude.controls.map((row) => row.id)).toContain("provider.steer");
    expect(gemini.controls.map((row) => row.id)).not.toContain("provider.steer");
    expect(gemini.lossiness.omitted.join(" ")).toMatch(/steer.*deny/i);
  });

  test("accepts bounded Claude correction context but rejects input rewrites and unknown fields", () => {
    const corrective = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Correct arguments under signed ToolHub policy.",
        additionalContext: "Correct the arguments and retry as a new action.",
      },
    };
    expect(validateProviderControlResponse("claude-code", corrective)).toBe(true);
    expect(validateProviderControlResponse("claude-code", {
      hookSpecificOutput: {
        ...corrective.hookSpecificOutput,
        updatedInput: { file_path: "workspace/rewritten.txt" },
      },
    })).toBe(false);
    expect(validateProviderControlResponse("claude-code", {
      ...corrective,
      effectiveOutcome: "steer",
    })).toBe(false);
  });

  test("fails closed on malformed audit mappings without poisoning unrelated evidence types", () => {
    const workspace = newWorkspace();
    const agentId = "metadata-boundary-agent";
    const actionId = "toolu_amc1476_metadata";
    const rawInput = providerInput({ workspace, provider: "claude-code", actionId });
    observeRequestedAction({ workspace, agentId, provider: "claude-code", rawInput });

    appendDecisionShapedEvent({ workspace, agentId, actionId, eventType: "llm_request" });
    expect(inspectHookActionLifecycle({ workspace, agentId, actionId })).toMatchObject({
      status: "requested",
      valid: true,
      reasonCodes: [],
    });

    appendDecisionShapedEvent({ workspace, agentId, actionId, eventType: "audit" });
    expect(inspectHookActionLifecycle({ workspace, agentId, actionId })).toMatchObject({
      status: "fail_closed",
      valid: false,
      reasonCodes: expect.arrayContaining(["DECISION_METADATA_INVALID"]),
    });
  });

  test("binds valid control-shaped metadata to audit events across lifecycle, correlation, and onboarding", () => {
    const workspace = newWorkspace();
    const agentId = "event-type-boundary-agent";
    const actionId = "toolu_amc1476_event_type";
    const rawInput = providerInput({ workspace, provider: "gemini-cli", actionId });
    const request = observeRequestedAction({ workspace, agentId, provider: "gemini-cli", rawInput });

    appendDecisionShapedEvent({
      workspace,
      agentId,
      actionId,
      eventType: "llm_request",
      provider: "gemini-cli",
      validMapping: true,
    });

    const lifecycle = inspectHookActionLifecycle({ workspace, agentId, actionId });
    expect(lifecycle).toMatchObject({ status: "requested", valid: true, reasonCodes: [] });
    expect(lifecycle.phases.decision).toBeNull();

    const correlation = request.extensions["x-amc-correlation"].sha256;
    expect(resolveUnmatchedObservedHookAction({
      workspace,
      authenticatedAgentId: agentId,
      provider: "gemini-cli",
      correlationSha256: correlation,
    })).toMatchObject({ actionId, correlationSha256: correlation });

    const activation = projectOnboardingActivation({ workspace, agentId });
    expect(activation.milestones.find((row) => row.id === "control_decision")?.status).toBe("WAITING");
  });

  test("normalizes and verifies immutable version-1 allow evidence", () => {
    const workspace = newWorkspace();
    const agentId = "legacy-control-agent";
    const actionId = "toolu_amc1476_legacy";
    const rawInput = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: actionId,
      tool_input: { file_path: join(workspace, "workspace", "legacy.txt") },
    });
    appendLegacyV1Allow({ workspace, agentId, actionId, rawInput });

    const normalized = evaluateProviderHookControl({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
    });
    expect(normalized).toMatchObject({
      idempotentReplay: true,
      requestedDecision: "allow",
      decision: "allow",
      effectiveOutcome: "allow",
      providerMapping: "native",
      capabilityLossy: false,
    });

    const legacyResult = { ...normalized } as Record<string, unknown>;
    delete legacyResult.effectiveOutcome;
    delete legacyResult.providerMapping;
    expect(verifyProviderHookControlResult({
      workspace,
      authenticatedAgentId: agentId,
      provider: "claude-code",
      rawInput,
      result: legacyResult,
    })).toEqual({ ok: true, error: null });
  });

  test("publishes the same capability-honest contract in Docs and both OpenAPI surfaces", () => {
    const compatibility = readFileSync("docs/ADAPTER_COMPATIBILITY.md", "utf8");
    const adapters = readFileSync("docs/ADAPTERS.md", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const website = readFileSync("website/docs/adapters.html", "utf8");
    const sourceReview = readFileSync(
      "docs/source-reviews/AMC-1476-capability-gated-provider-steer-outcome.md",
      "utf8",
    );
    for (const body of [readme, compatibility, adapters]) {
      expect(body).toMatch(/corrective steer/i);
      expect(body).toMatch(/new .*action/i);
      expect(body).toMatch(/Gemini.*deny/is);
      expect(body).toMatch(/never.*steer/is);
    }
    expect(website).toMatch(/corrective-steer/);
    expect(website).toMatch(/no input rewrite/);
    expect(sourceReview).toContain("83188b62c63e2b4ff9ada87048fd99605184ee5a");
    expect(sourceReview).toContain("## No-bloat boundary");

    const generated = generateFullOpenApiSpec() as any;
    const generatedLifecycle = generated.components.schemas.HookActionLifecycleResponse.properties.data;
    expect(generatedLifecycle.properties.schemaVersion.const).toBe("2026-07-12");
    expect(generatedLifecycle.properties.status.enum).toContain("steered");
    expect(generatedLifecycle.properties.phases.properties.decision.properties.effectiveOutcome.enum)
      .toContain("steer");
    expect(generatedLifecycle.properties.phases.properties.decision.additionalProperties).toBe(false);
    expect(generatedLifecycle.properties.phases.properties.terminal.required).toContain("status");

    const published = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as any;
    const publicLifecycle = published.components.schemas.HookActionLifecycle;
    expect(publicLifecycle.properties.schemaVersion.enum).toEqual(["2026-07-12"]);
    expect(publicLifecycle.properties.status.enum).toContain("steered");
    expect(publicLifecycle.properties.phases.properties.decision.properties.providerMapping.enum)
      .toContain("fail_closed_deny");
    expect(publicLifecycle.properties.phases.properties.decision.additionalProperties).toBe(false);
  });
});
