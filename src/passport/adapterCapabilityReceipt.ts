import { basename } from "node:path";
import { z } from "zod";
import { detectAdapter } from "../adapters/adapterDetection.js";
import { loadAdaptersConfig, verifyAdaptersConfigSignature } from "../adapters/adapterConfigStore.js";
import { getAdapterDefinition } from "../adapters/catalog.js";
import { hasBuiltInAdapter } from "../adapters/registry.js";
import { getHookIntegrationStatus, type HookProvider } from "../adapters/hookIntegration.js";
import {
  adapterCapabilityControlIdSchema,
  adapterCapabilityDeclarationSchema,
  adapterCapabilityEventIdSchema,
  type AdapterCapabilityActivation,
  type AdapterCapabilityDeclaration,
  type AdapterCapabilityControlId,
  type AdapterCapabilityEventId,
  type AdapterDefinition
} from "../adapters/adapterTypes.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { signatureEnvelopeSchema, verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";
import { resolveAgentId } from "../fleet/paths.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

export const ADAPTER_CAPABILITY_RECEIPT_VERSION = "amc.adapter-capability-receipt.v1";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const runtimeInspectionSchema = z.object({
  status: z.enum(["detected", "version_unavailable", "not_detected"]),
  command: z.string().min(1).nullable(),
  version: z.string().min(1).nullable()
}).strict();
const configurationInspectionSchema = z.object({
  status: z.enum(["signed_selected", "not_selected", "missing", "invalid"])
}).strict();
const hookInspectionSchema = z.object({
  status: z.enum([
    "not_applicable",
    "not_installed",
    "observe",
    "control",
    "drifted",
    "expired",
    "invalid",
    "agent_mismatch"
  ]),
  provider: z.enum(["claude-code", "gemini-cli"]).nullable(),
  mode: z.enum(["observe", "control"]).nullable()
}).strict();
export const adapterCapabilityInspectionSchema = z.object({
  runtime: runtimeInspectionSchema,
  configuration: configurationInspectionSchema,
  hook: hookInspectionSchema
}).strict();

const adapterCapabilitySignatureSchema = z.object({
  digestSha256: sha256Schema,
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
}).strict();

const adapterCapabilityReceiptBaseSchema = z.object({
  receiptVersion: z.literal(ADAPTER_CAPABILITY_RECEIPT_VERSION),
  receiptId: z.string().regex(/^adcap_[a-f0-9]{32}$/),
  issuedAt: z.string().datetime({ offset: true }),
  subject: z.object({
    agentId: z.string().min(1),
    adapterId: z.string().min(1)
  }).strict(),
  adapter: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    source: z.enum(["builtin", "plugin"]),
    kind: z.enum(["CLI", "LIBRARY_NODE", "LIBRARY_PYTHON"]),
    providerFamily: z.enum(["OPENAI_COMPAT", "ANTHROPIC", "GEMINI", "XAI_GROK", "OPENROUTER", "CUSTOM_HTTP"]),
    capabilities: adapterCapabilityDeclarationSchema
  }).strict(),
  inspection: adapterCapabilityInspectionSchema,
  effective: z.object({
    events: z.array(adapterCapabilityEventIdSchema),
    controls: z.array(adapterCapabilityControlIdSchema)
  }).strict(),
  verification: z.object({
    status: z.enum(["verified", "partial", "fail_closed"]),
    reasons: z.array(z.string().min(1))
  }).strict()
}).strict();

export const adapterCapabilityReceiptSchema = adapterCapabilityReceiptBaseSchema.extend({
  receiptHash: sha256Schema,
  signature: adapterCapabilitySignatureSchema
}).strict();

export type AdapterCapabilityInspection = z.infer<typeof adapterCapabilityInspectionSchema>;
export type AdapterCapabilityReceipt = z.infer<typeof adapterCapabilityReceiptSchema>;
export type AdapterCapabilityVerification = AdapterCapabilityReceipt["verification"];

export interface BuildAdapterCapabilityReceiptInput {
  workspace: string;
  agentId: string;
  definition: AdapterDefinition;
  source: "builtin" | "plugin";
  inspection: AdapterCapabilityInspection;
  issuedAt?: string;
}

export interface IssueAdapterCapabilityReceiptInput {
  workspace: string;
  agentId?: string;
  adapterId: string;
  issuedAt?: string;
}

export interface VerifyAdapterCapabilityReceiptOptions {
  workspace?: string;
  trustedPublicKeys?: string[];
}

function activeConditions(inspection: AdapterCapabilityInspection): Set<AdapterCapabilityActivation> {
  const active = new Set<AdapterCapabilityActivation>();
  if (inspection.runtime.status !== "not_detected") {
    active.add("adapter_run");
  }
  if (inspection.runtime.status !== "not_detected" && inspection.configuration.status === "signed_selected") {
    active.add("gateway_routed");
  }
  if (inspection.hook.status === "observe") {
    active.add("hook_observe");
  }
  if (inspection.hook.status === "control") {
    active.add("hook_control");
  }
  return active;
}

function hasHookCapabilities(declaration: AdapterCapabilityDeclaration): boolean {
  return declaration.events.some((row) => row.activeWhen.some((value) => value.startsWith("hook_")))
    || declaration.controls.some((row) => row.activeWhen.some((value) => value.startsWith("hook_")));
}

function projectCapabilities(
  declaration: AdapterCapabilityDeclaration,
  inspection: AdapterCapabilityInspection,
  source: "builtin" | "plugin"
): {
  effective: { events: AdapterCapabilityEventId[]; controls: AdapterCapabilityControlId[] };
  verification: AdapterCapabilityVerification;
} {
  const reasons: string[] = [];
  let failClosed = false;
  let partial = false;

  if (declaration.verification.status !== "fixture_verified" || declaration.definitionVersion === "unverified") {
    reasons.push("declaration:unverified");
    failClosed = true;
  }
  if (source === "plugin" || declaration.verification.authority !== "amc") {
    reasons.push(source === "plugin" ? "declaration:plugin-not-certified" : "declaration:authority-untrusted");
    failClosed = true;
  }
  if (declaration.verification.status === "fixture_verified" && declaration.verification.evidenceRefs.length === 0) {
    reasons.push("declaration:evidence-missing");
    failClosed = true;
  }
  if (inspection.runtime.status === "not_detected") {
    reasons.push("runtime:not-detected");
    failClosed = true;
  } else if (inspection.runtime.status === "version_unavailable" || !inspection.runtime.version) {
    reasons.push("runtime:version-unavailable");
    failClosed = true;
  }
  if (inspection.configuration.status !== "signed_selected") {
    reasons.push(`configuration:${inspection.configuration.status.replaceAll("_", "-")}`);
    failClosed = true;
  }
  if (["drifted", "expired", "invalid", "agent_mismatch"].includes(inspection.hook.status)) {
    reasons.push(`hook:${inspection.hook.status.replaceAll("_", "-")}`);
    failClosed = true;
  }

  if (!failClosed) {
    if (declaration.versionSource === "host_runtime") {
      reasons.push("version:host-runtime-only");
      partial = true;
    } else if (declaration.versionSource === "shell_runtime") {
      reasons.push("version:shell-runtime-only");
      partial = true;
    } else if (declaration.versionSource === "mixed_runtime") {
      reasons.push("version:mixed-runtime-probe");
      partial = true;
    } else if (declaration.versionSource === "unknown") {
      reasons.push("version:unknown");
      failClosed = true;
    }

    if (hasHookCapabilities(declaration) && inspection.hook.status === "not_installed") {
      reasons.push("hook:not-installed");
      partial = true;
    } else if (hasHookCapabilities(declaration) && inspection.hook.status === "observe") {
      reasons.push("hook:observe-only");
      partial = true;
    } else if (hasHookCapabilities(declaration) && inspection.hook.status === "not_applicable") {
      reasons.push("hook:not-inspected");
      partial = true;
    }
  }

  const active = activeConditions(inspection);
  const declarationTrusted = declaration.verification.status === "fixture_verified"
    && declaration.verification.authority === "amc"
    && source === "builtin"
    && declaration.definitionVersion !== "unverified"
    && declaration.verification.evidenceRefs.length > 0;
  const effective = declarationTrusted
    ? {
        events: declaration.events
          .filter((row) => row.activeWhen.some((condition) => active.has(condition)))
          .map((row) => row.id),
        controls: declaration.controls
          .filter((row) => row.activeWhen.some((condition) => active.has(condition)))
          .map((row) => row.id)
      }
    : { events: [], controls: [] };

  if (failClosed) {
    return { effective, verification: { status: "fail_closed", reasons: [...new Set(reasons)] } };
  }
  if (partial) {
    return { effective, verification: { status: "partial", reasons: [...new Set(reasons)] } };
  }
  return { effective, verification: { status: "verified", reasons: [] } };
}

function receiptId(agentId: string, adapterId: string, issuedAt: string): string {
  return `adcap_${sha256Hex(canonicalize({ agentId, adapterId, issuedAt })).slice(0, 32)}`;
}

function receiptHash(base: z.infer<typeof adapterCapabilityReceiptBaseSchema>): string {
  return sha256Hex(Buffer.from(canonicalize(base), "utf8"));
}

export function buildAdapterCapabilityReceipt(input: BuildAdapterCapabilityReceiptInput): AdapterCapabilityReceipt {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const capabilities = adapterCapabilityDeclarationSchema.parse(input.definition.capabilities);
  const inspection = adapterCapabilityInspectionSchema.parse(input.inspection);
  const projection = projectCapabilities(capabilities, inspection, input.source);
  const base = adapterCapabilityReceiptBaseSchema.parse({
    receiptVersion: ADAPTER_CAPABILITY_RECEIPT_VERSION,
    receiptId: receiptId(input.agentId, input.definition.id, issuedAt),
    issuedAt,
    subject: {
      agentId: input.agentId,
      adapterId: input.definition.id
    },
    adapter: {
      id: input.definition.id,
      displayName: input.definition.displayName,
      source: input.source,
      kind: input.definition.kind,
      providerFamily: input.definition.providerFamily,
      capabilities
    },
    inspection,
    effective: projection.effective,
    verification: projection.verification
  });
  const digestSha256 = receiptHash(base);
  const signature = signDigestWithPolicy({
    workspace: input.workspace,
    kind: "BUNDLE",
    digestHex: digestSha256
  });
  return adapterCapabilityReceiptSchema.parse({
    ...base,
    receiptHash: digestSha256,
    signature: {
      digestSha256,
      signature: signature.signature,
      signedTs: signature.signedTs,
      signer: "auditor",
      envelope: signature.envelope
    }
  });
}

function inspectConfiguration(workspace: string, agentId: string, adapterId: string): AdapterCapabilityInspection["configuration"] {
  const signature = verifyAdaptersConfigSignature(workspace);
  if (!signature.signatureExists) return { status: "missing" };
  if (!signature.valid) return { status: "invalid" };
  try {
    const profile = loadAdaptersConfig(workspace).adapters.perAgent[agentId];
    return { status: profile?.preferredAdapter === adapterId ? "signed_selected" : "not_selected" };
  } catch {
    return { status: "invalid" };
  }
}

function hookProviderForAdapter(adapterId: string): HookProvider | null {
  if (adapterId === "claude-cli") return "claude-code";
  if (adapterId === "gemini-cli") return "gemini-cli";
  return null;
}

function inspectHook(workspace: string, agentId: string, adapterId: string): AdapterCapabilityInspection["hook"] {
  const provider = hookProviderForAdapter(adapterId);
  if (!provider) return { status: "not_applicable", provider: null, mode: null };
  try {
    const status = getHookIntegrationStatus({ workspace, provider });
    if (status.state === "not-installed") return { status: "not_installed", provider, mode: null };
    if (status.agentId !== agentId) return { status: "agent_mismatch", provider, mode: status.mode };
    if (status.state === "installed" && status.mode === "observe") return { status: "observe", provider, mode: "observe" };
    if (status.state === "installed" && status.mode === "control") return { status: "control", provider, mode: "control" };
    if (status.state === "installed") return { status: "invalid", provider, mode: null };
    return { status: status.state, provider, mode: status.mode };
  } catch {
    return { status: "invalid", provider, mode: null };
  }
}

export function issueAdapterCapabilityReceipt(input: IssueAdapterCapabilityReceiptInput): AdapterCapabilityReceipt {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  const definition = getAdapterDefinition(input.workspace, input.adapterId);
  const source = hasBuiltInAdapter(definition.id) ? "builtin" : "plugin";
  // Receipts must not turn a cold CLI startup into a false version failure.
  // Uncertified plugin probes are not executed merely to produce a fail-closed receipt.
  const detection = source === "builtin" ? detectAdapter(definition, { timeoutMs: 2_000 }) : null;
  const runtime: AdapterCapabilityInspection["runtime"] = !detection
    ? { status: "not_detected", command: null, version: null }
    : detection.installed
      ? detection.version
        ? { status: "detected", command: detection.command ? basename(detection.command) : null, version: detection.version }
        : { status: "version_unavailable", command: detection.command ? basename(detection.command) : null, version: null }
      : { status: "not_detected", command: null, version: null };
  return buildAdapterCapabilityReceipt({
    workspace: input.workspace,
    agentId,
    definition,
    source,
    issuedAt: input.issuedAt,
    inspection: {
      runtime,
      configuration: inspectConfiguration(input.workspace, agentId, definition.id),
      hook: inspectHook(input.workspace, agentId, definition.id)
    }
  });
}

function verifyTrustedSignature(
  receipt: AdapterCapabilityReceipt,
  options: VerifyAdapterCapabilityReceiptOptions
): boolean {
  if (options.workspace) {
    try {
      return verifySignedDigest({
        workspace: options.workspace,
        digestHex: receipt.receiptHash,
        signed: receipt.signature
      });
    } catch {
      return false;
    }
  }
  const trustedPublicKeys = options.trustedPublicKeys ?? [];
  if (trustedPublicKeys.length === 0) return false;
  if (receipt.signature.envelope) {
    return verifySignatureEnvelope(receipt.receiptHash, receipt.signature.envelope, {
      trustedPublicKeys,
      requireTrustedKey: true
    });
  }
  return verifyHexDigestAny(receipt.receiptHash, receipt.signature.signature, trustedPublicKeys);
}

export function verifyAdapterCapabilityReceipt(
  value: unknown,
  options: VerifyAdapterCapabilityReceiptOptions
): { valid: boolean; reasons: string[] } {
  const parsed = adapterCapabilityReceiptSchema.safeParse(value);
  if (!parsed.success) {
    return { valid: false, reasons: ["schema:invalid"] };
  }
  const receipt = parsed.data;
  const reasons: string[] = [];
  const { receiptHash: _receiptHash, signature: _signature, ...base } = receipt;
  const expectedHash = receiptHash(adapterCapabilityReceiptBaseSchema.parse(base));
  if (expectedHash !== receipt.receiptHash) reasons.push("receiptHash:mismatch");
  if (receipt.signature.digestSha256 !== receipt.receiptHash) reasons.push("signature:digest-mismatch");
  if (!verifyTrustedSignature(receipt, options)) reasons.push("signature:untrusted");
  if (receipt.subject.adapterId !== receipt.adapter.id) reasons.push("subject:adapter-mismatch");
  if (receipt.receiptId !== receiptId(receipt.subject.agentId, receipt.subject.adapterId, receipt.issuedAt)) {
    reasons.push("receiptId:mismatch");
  }

  const projection = projectCapabilities(receipt.adapter.capabilities, receipt.inspection, receipt.adapter.source);
  if (canonicalize(projection.effective) !== canonicalize(receipt.effective)) reasons.push("effective:projection-mismatch");
  if (canonicalize(projection.verification) !== canonicalize(receipt.verification)) reasons.push("verification:projection-mismatch");

  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function trustedAdapterCapabilityReceiptKeys(workspace: string): string[] {
  return getPublicKeyHistory(workspace, "auditor");
}
