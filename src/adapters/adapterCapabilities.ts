import {
  adapterCapabilityDeclarationSchema,
  type AdapterCapabilityDeclaration,
  type AdapterVersionSource
} from "./adapterTypes.js";

export type BuiltInHookCapability = "claude-code" | "gemini-cli";

export interface BuiltInAdapterCapabilityOptions {
  definitionVersion?: string;
  versionSource: Exclude<AdapterVersionSource, "unknown">;
  hookProvider?: BuiltInHookCapability;
  evidenceRefs?: string[];
  additionalOmissions?: string[];
}

const BASE_EVIDENCE_REFS = [
  "tests/adapterCapabilityReceipts.test.ts",
  "tests/adaptersDoctorLeaseCarriers.test.ts",
  "docs/ADAPTERS.md"
] as const;

/**
 * Creates a capability declaration embedded by each authoritative adapter
 * definition. This is a reusable declaration shape, not an adapter registry.
 */
export function builtInAdapterCapabilities(
  options: BuiltInAdapterCapabilityOptions
): AdapterCapabilityDeclaration {
  const hookEvidence = options.hookProvider
    ? ["tests/connectHookIntegration.test.ts", "tests/hookControl.test.ts", "tests/hookActionLifecycle.test.ts"]
    : [];
  const hookOmissions = options.hookProvider === "gemini-cli"
    ? [
        "Gemini CLI has no native ask outcome; AMC fails an ask decision closed to deny",
        "Gemini CLI has no general provider call ID; missing or ambiguous terminal correlation fails closed",
      ]
    : options.hookProvider === "claude-code"
      ? ["AMC's managed Claude hook covers the pinned tool request, success, and failure boundary, not every provider event"]
      : [];
  const versionOmissions = options.versionSource === "host_runtime"
    ? ["host runtime version does not prove the framework package version"]
    : options.versionSource === "shell_runtime"
      ? ["shell runtime version does not prove the wrapped agent version"]
      : options.versionSource === "mixed_runtime"
        ? ["fallback host-runtime probes do not prove the preferred framework CLI version"]
        : [];

  return adapterCapabilityDeclarationSchema.parse({
    declarationVersion: "1",
    definitionVersion: options.definitionVersion ?? "1.0.0",
    versionSource: options.versionSource,
    events: [
      { id: "process.started", activeWhen: ["adapter_run"] },
      { id: "process.stdout", activeWhen: ["adapter_run"] },
      { id: "process.stderr", activeWhen: ["adapter_run"] },
      { id: "process.exited", activeWhen: ["adapter_run"] },
      { id: "model.request", activeWhen: ["gateway_routed"] },
      { id: "model.response", activeWhen: ["gateway_routed"] },
      ...(options.hookProvider
        ? [
            { id: "action.requested" as const, activeWhen: ["hook_observe" as const, "hook_control" as const] },
            { id: "action.completed" as const, activeWhen: ["hook_observe" as const, "hook_control" as const] },
            { id: "action.failed" as const, activeWhen: ["hook_observe" as const, "hook_control" as const] },
            { id: "action.decision" as const, activeWhen: ["hook_control" as const] }
          ]
        : [])
    ],
    controls: [
      { id: "gateway.route", activeWhen: ["gateway_routed"] },
      { id: "gateway.model", activeWhen: ["gateway_routed"] },
      { id: "gateway.budget", activeWhen: ["gateway_routed"] },
      { id: "gateway.freeze", activeWhen: ["gateway_routed"] },
      ...(options.hookProvider
        ? [
            { id: "tool.allowlist" as const, activeWhen: ["hook_control" as const] },
            { id: "provider.allow" as const, activeWhen: ["hook_control" as const] },
            { id: "provider.deny" as const, activeWhen: ["hook_control" as const] },
            ...(options.hookProvider === "claude-code"
              ? [{ id: "provider.ask" as const, activeWhen: ["hook_control" as const] }]
              : [])
          ]
        : [])
    ],
    lossiness: {
      level: "partial",
      omitted: [
        "provider-native session and tool lifecycle is not guaranteed by gateway wrapping",
        "configured redaction excludes secrets and raw sensitive fields from evidence",
        ...versionOmissions,
        ...hookOmissions,
        ...(options.additionalOmissions ?? [])
      ]
    },
    verification: {
      status: "fixture_verified",
      authority: "amc",
      evidenceRefs: [...new Set([
        ...BASE_EVIDENCE_REFS,
        ...hookEvidence,
        ...(options.evidenceRefs ?? [])
      ])]
    }
  });
}
