import type { ProtectedDataClass } from "../vault/dataClassification.js";
import type { ProtectedDataDetection } from "./detectors.js";
import { loadProcessorRegistrySnapshot, normalizeProcessorRouteBaseUrl } from "./processorRegistry.js";

export interface PurposePolicyV1 {
  readonly purposeId: string;
  readonly allowedDataClasses: readonly ProtectedDataClass[];
  readonly allowedTools: readonly string[];
  readonly allowedProcessors: readonly string[];
}

export interface ProtectedModelAdmission {
  readonly allowed: boolean;
  readonly reason: string;
  readonly processorId: string | null;
  readonly purposeId: string | null;
}

const protectedClasses = ["phi", "pii", "card_number", "bank_account", "credential"] as const;
const refusalReasons = ["admission_failed", "audit_failed", "detector_invalid", "request_invalid", "workspace_invalid",
  "registry_missing", "registry_unreadable", "signature_missing", "signature_invalid", "schema_invalid", "binding_missing",
  "binding_ambiguous", "processor_unavailable", "purpose_unavailable", "purpose_not_permitted", "class_not_permitted",
  "contract_required", "baa_required"] as const;

/** Static diagnostics only: no payload, route, path, or contract text enters this exception. */
export class DataFlowRefused extends Error {
  readonly code = "DATA_FLOW_REFUSED";
  readonly reason: string;
  constructor(reason: string) {
    const safeReason = refusalReasons.find(value => value === reason) ?? "admission_failed";
    super(`Protected model request refused: ${safeReason}`);
    this.name = "DataFlowRefused";
    this.reason = safeReason;
  }
}

function admission(allowed: boolean, reason: string, processorId: string | null = null, purposeId: string | null = null): ProtectedModelAdmission {
  return Object.freeze({ allowed, reason, processorId, purposeId });
}

function validDetection(detection: ProtectedDataDetection): boolean {
  if (!detection || !Array.isArray(detection.classes) || detection.classes.length > protectedClasses.length
    || new Set(detection.classes).size !== detection.classes.length || !detection.classes.every(value => protectedClasses.some(known => known === value))
    || typeof detection.detectorSetDigest !== "string" || !/^[a-f0-9]{64}$/.test(detection.detectorSetDigest)
    || !detection.counts || typeof detection.counts !== "object" || Array.isArray(detection.counts)) return false;
  const counts = Object.entries(detection.counts);
  return counts.length === detection.classes.length && counts.every(([key, value]) => detection.classes.some(known => known === key)
    && typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}

/**
 * Experimental admission for a native prepared model request at its pinned route base. The signed operator binding is
 * the only purpose source. "model.request" is a policy data term, not a ToolHub authorization grant. Active declarations
 * express operator claims only; neither a BAA declaration nor a signature establishes contractual or legal sufficiency.
 * Later envelope URLs, redirects and dispatch policy changes require separate rechecks; gateway/bridge and other
 * transports are outside this boundary. Deterministic detection does not prove absence of protected data.
 */
export function admitProtectedModelRequest(
  workspace: string,
  providerId: string,
  baseUrl: string,
  detection: ProtectedDataDetection
): ProtectedModelAdmission {
  try {
    if (!validDetection(detection)) return admission(false, "detector_invalid");
    const classes = [...detection.classes];
    if (classes.length === 0) return admission(true, "no_protected_data");
    const routeBase = normalizeProcessorRouteBaseUrl(baseUrl);
    if (typeof providerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(providerId) || routeBase === null)
      return admission(false, "request_invalid");
    const snapshot = loadProcessorRegistrySnapshot(workspace);
    if (snapshot.state === "missing") return admission(false, "registry_missing");
    if (snapshot.state === "invalid") return admission(false, snapshot.reason);
    const bindings = snapshot.registry.bindings.filter(row => row.providerId === providerId && row.baseUrl === routeBase);
    if (bindings.length === 0) return admission(false, "binding_missing");
    if (bindings.length !== 1) return admission(false, "binding_ambiguous");
    const binding = bindings[0]!;
    const processors = snapshot.registry.processors.filter(row => row.processorId === binding.processorId);
    const purposes = snapshot.registry.purposes.filter(row => row.purposeId === binding.purposeId);
    if (processors.length !== 1) return admission(false, "processor_unavailable");
    if (purposes.length !== 1) return admission(false, "purpose_unavailable", binding.processorId);
    const processor = processors[0]!;
    const purpose = purposes[0]!;
    const refuse = (reason: string): ProtectedModelAdmission => admission(false, reason, processor.processorId, purpose.purposeId);
    if (!purpose.allowedTools.includes("model.request") || !purpose.allowedProcessors.includes(processor.processorId))
      return refuse("purpose_not_permitted");
    if (classes.some(value => !purpose.allowedDataClasses.includes(value))) return refuse("class_not_permitted");
    const now = Date.now();
    const activeContracts = processor.contracts.filter(contract => Date.parse(`${contract.effective}T00:00:00.000Z`) <= now
      && (contract.expires === null || now < Date.parse(`${contract.expires}T00:00:00.000Z`)));
    for (const dataClass of classes) {
      const covering = activeContracts.filter(contract => contract.dataClasses.includes(dataClass));
      if (dataClass === "phi" && !covering.some(contract => contract.kind === "BAA")) return refuse("baa_required");
      if (covering.length === 0) return refuse("contract_required");
    }
    return admission(true, "declared_policy_allows", processor.processorId, purpose.purposeId);
  } catch { return admission(false, "admission_failed"); }
}
