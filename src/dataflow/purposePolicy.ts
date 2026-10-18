import type { ProtectedDataClass } from "../vault/dataClassification.js";
import type { ProtectedDataDetection } from "./detectors.js";
import { loadProcessorRegistrySnapshot, normalizeProcessorRouteBaseUrl, protectedDataOptedIn, type ProcessorRecordV1,
  type ProcessorRegistryV1 } from "./processorRegistry.js";

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
  /** The classes admission decided on: detected, declared and the run purpose's PHI. Empty until they are known. */
  readonly classes: readonly ProtectedDataClass[];
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

function admission(allowed: boolean, reason: string, processorId: string | null = null, purposeId: string | null = null,
  classes: readonly ProtectedDataClass[] = []): ProtectedModelAdmission {
  return Object.freeze({ allowed, reason, processorId, purposeId, classes: Object.freeze([...classes]) });
}

const knownClasses = (values: readonly unknown[]): boolean => Array.isArray(values) && values.length <= protectedClasses.length
  && new Set(values).size === values.length && values.every(value => protectedClasses.some(known => known === value));

function validDetection(detection: ProtectedDataDetection): boolean {
  if (!detection || !knownClasses(detection.classes) || typeof detection.detectorSetDigest !== "string" || !/^[a-f0-9]{64}$/.test(detection.detectorSetDigest)
    || !detection.counts || typeof detection.counts !== "object" || Array.isArray(detection.counts)) return false;
  const counts = Object.entries(detection.counts);
  return counts.length === detection.classes.length && counts.every(([key, value]) => detection.classes.some(known => known === key)
    && typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}

/** The purpose the signed registry's `runPurpose` names (P2-02 step 8), or null when it names none. */
export const runPurposeOf = (registry: ProcessorRegistryV1): PurposePolicyV1 | null =>
  registry.purposes.find(row => row.purposeId === registry.runPurpose) ?? null;

type ProcessorUseReason = "allowed" | "purpose_not_permitted" | "class_not_permitted" | "contract_required" | "baa_required";
export interface ProcessorUse { readonly reason: ProcessorUseReason; readonly contractReferences: readonly string[] }

/**
 * Whether `purpose` lets `processor` receive `classes` for `operation` at `now`, one rule for model admission and
 * restoration at egress: the purpose names the operation and the processor, allows every class, and each class has an
 * effective, unexpired covering contract (for `phi`, a BAA). `contractReferences` lists every such contract. Operator
 * declarations only; neither a BAA declaration nor a signature establishes contractual or legal sufficiency.
 */
export function processorUse(processor: ProcessorRecordV1, purpose: PurposePolicyV1, operation: string,
  classes: readonly ProtectedDataClass[], now = Date.now()): ProcessorUse {
  const refuse = (reason: ProcessorUseReason): ProcessorUse => Object.freeze({ reason, contractReferences: Object.freeze([]) });
  if (!purpose.allowedTools.includes(operation) || !purpose.allowedProcessors.includes(processor.processorId)) return refuse("purpose_not_permitted");
  if (classes.some(value => !purpose.allowedDataClasses.includes(value))) return refuse("class_not_permitted");
  const activeContracts = processor.contracts.filter(contract => Date.parse(`${contract.effective}T00:00:00.000Z`) <= now
    && (contract.expires === null || now < Date.parse(`${contract.expires}T00:00:00.000Z`)));
  const references = new Set<string>();
  for (const dataClass of classes) {
    const covering = activeContracts.filter(contract => contract.dataClasses.includes(dataClass));
    if (dataClass === "phi" && !covering.some(contract => contract.kind === "BAA")) return refuse("baa_required");
    if (covering.length === 0) return refuse("contract_required");
    for (const contract of covering) if (dataClass !== "phi" || contract.kind === "BAA") references.add(contract.reference);
  }
  return Object.freeze({ reason: "allowed", contractReferences: Object.freeze([...references].sort()) });
}

type PurposeResource = { readonly purpose: string | null; readonly dataClasses: readonly ProtectedDataClass[] };
export type PurposeResourceResult =
  | { readonly ok: true; readonly resource: PurposeResource }
  | { readonly ok: false; readonly failure: "purpose_violation" | "authority_store_unavailable"; readonly reason: string };
const NO_PURPOSE: PurposeResourceResult = Object.freeze({ ok: true, resource: Object.freeze({ purpose: null, dataClasses: Object.freeze([]) }) });

/**
 * The authorization record's `resource` for a call to `toolName` (P2-02 step 8), from the signed processor registry only,
 * never from arguments, model text or tool output. A workspace that has not opted in, or names no `runPurpose`, binds
 * `{ purpose: null, dataClasses: [] }`. In an opted-in workspace a registry that is missing or does not verify refuses
 * (`authority_store_unavailable`), and a tool the run purpose does not allow refuses (`purpose_violation`).
 */
export function purposeResource(workspace: string, toolName: string): PurposeResourceResult {
  if (!protectedDataOptedIn(workspace)) return NO_PURPOSE;
  const snapshot = loadProcessorRegistrySnapshot(workspace);
  if (snapshot.state !== "verified") {
    return { ok: false, failure: "authority_store_unavailable",
      reason: `the processor registry does not verify (${snapshot.state === "missing" ? "registry_missing" : snapshot.reason})` };
  }
  const purpose = runPurposeOf(snapshot.registry);
  if (purpose === null) return NO_PURPOSE;
  if (!purpose.allowedTools.includes(toolName)) return { ok: false, failure: "purpose_violation", reason: `run purpose ${purpose.purposeId} does not allow this tool` };
  return { ok: true, resource: { purpose: purpose.purposeId, dataClasses: [...purpose.allowedDataClasses] } };
}

/**
 * Experimental admission for a native prepared model request at its pinned route base. The signed operator binding is
 * the only purpose source. "model.request" is a policy data term, not a ToolHub authorization grant. Active declarations
 * express operator claims only; neither a BAA declaration nor a signature establishes contractual or legal sufficiency.
 * Later envelope URLs, redirects and dispatch policy changes require separate rechecks; gateway/bridge and other
 * transports are outside this boundary. Deterministic detection does not prove absence of protected data.
 * The classes are the detected ones, `declared` (an issued PHI token in the request) and `phi` when the signed run
 * purpose allows it, because the rest of the text may still be PHI. A registry that is missing or does not verify refuses
 * whatever the request holds.
 */
export function admitProtectedModelRequest(
  workspace: string,
  providerId: string,
  baseUrl: string,
  detection: ProtectedDataDetection,
  declared: readonly ProtectedDataClass[] = []
): ProtectedModelAdmission {
  try {
    if (!validDetection(detection) || !knownClasses(declared)) return admission(false, "detector_invalid");
    const snapshot = loadProcessorRegistrySnapshot(workspace);
    if (snapshot.state === "missing") return admission(false, "registry_missing");
    if (snapshot.state === "invalid") return admission(false, snapshot.reason);
    const runPhi: readonly ProtectedDataClass[] = runPurposeOf(snapshot.registry)?.allowedDataClasses.includes("phi") ? ["phi"] : [];
    // Detection order first, so the reasons the L0 fixtures name do not move.
    const classes = [...new Set([...detection.classes, ...declared, ...runPhi])];
    if (classes.length === 0) return admission(true, "no_protected_data");
    const routeBase = normalizeProcessorRouteBaseUrl(baseUrl);
    const decided = (allowed: boolean, reason: string, processorId: string | null = null, purposeId: string | null = null) =>
      admission(allowed, reason, processorId, purposeId, classes);
    if (typeof providerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(providerId) || routeBase === null)
      return decided(false, "request_invalid");
    const bindings = snapshot.registry.bindings.filter(row => row.providerId === providerId && row.baseUrl === routeBase);
    if (bindings.length === 0) return decided(false, "binding_missing");
    if (bindings.length !== 1) return decided(false, "binding_ambiguous");
    const binding = bindings[0]!;
    const processors = snapshot.registry.processors.filter(row => row.processorId === binding.processorId);
    const purposes = snapshot.registry.purposes.filter(row => row.purposeId === binding.purposeId);
    if (processors.length !== 1) return decided(false, "processor_unavailable");
    if (purposes.length !== 1) return decided(false, "purpose_unavailable", binding.processorId);
    const processor = processors[0]!;
    const purpose = purposes[0]!;
    const use = processorUse(processor, purpose, "model.request", classes);
    return decided(use.reason === "allowed", use.reason === "allowed" ? "declared_policy_allows" : use.reason, processor.processorId, purpose.purposeId);
  } catch { return admission(false, "admission_failed"); }
}
