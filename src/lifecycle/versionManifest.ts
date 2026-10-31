/**
 * The agent version manifest (P2-23, backlog A13; shared with P2-26): what a deployed agent runs, pinned so a change can
 * be named. A lifecycle approval binds `manifestDigest`; at session open the running components are digested again and
 * `diffManifests` names what moved. A null or missing component in the current manifest counts as changed (fail closed).
 *
 * `model.providerReportedVersion` is the one null that does not count as a change: providers often serve several
 * versions behind one model name, so without a provider-reported version the model is unpinned, and
 * `unpinnedComponents` says so instead of suspending every session.
 */
import { z } from "zod";
import type { NativeToolCapability } from "../agent/nativeToolCapabilities.js";
import { activeControlPlan } from "../catalog/compiler/activate.js";
import type { InvalidationTrigger } from "../catalog/types.js";
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type ChangeKind = "model" | "prompt" | "tool" | "policy" | "deployment" | "corpus";
const CHANGE_KINDS: readonly ChangeKind[] = ["model", "prompt", "tool", "policy", "deployment", "corpus"];

export interface AgentVersionManifest {
  v: 1; agentId: string; deploymentId: string;
  model: { providerId: string; model: string; providerReportedVersion: string | null };
  systemPromptSha256: string; toolsDigest: string | null; policyDigest: string;
  compiledPlanDigest: string; harnessVersion: string; compositionDigest: string;
  corpusDigests: string[];
}

const text = z.string().min(1);
/** Parses a manifest read from a file, a request body or a ledger row. Strict: an unknown key is refused. */
export const agentVersionManifestSchema = z.strictObject({
  v: z.literal(1), agentId: text, deploymentId: text,
  model: z.strictObject({ providerId: text, model: text, providerReportedVersion: text.nullable() }),
  systemPromptSha256: text, toolsDigest: text.nullable(), policyDigest: text,
  compiledPlanDigest: text, harnessVersion: text, compositionDigest: text,
  corpusDigests: z.array(text)
});

/** sha256 of canonicalize(m), prefixed like the plan digests. */
export function manifestDigest(m: AgentVersionManifest): string {
  return `sha256:${sha256Hex(canonicalize(m))}`;
}

const blank = (value: string | null | undefined): boolean => value === null || value === undefined || value.trim().length === 0;
const differs = (bound: string | null, current: string | null | undefined): boolean => blank(current) || bound !== current;

/**
 * The change kinds between the manifest an approval bound and the one running now, in CHANGE_KINDS order. Every
 * component the current manifest leaves null, empty or missing counts as changed.
 */
export function diffManifests(bound: AgentVersionManifest, current: AgentVersionManifest): ChangeKind[] {
  const changed = new Set<ChangeKind>();
  const m = current.model as Partial<AgentVersionManifest["model"]> | undefined;
  if (differs(bound.model.providerId, m?.providerId) || differs(bound.model.model, m?.model)
    || bound.model.providerReportedVersion !== (m?.providerReportedVersion ?? null)) changed.add("model");
  if (differs(bound.systemPromptSha256, current.systemPromptSha256)) changed.add("prompt");
  if (differs(bound.toolsDigest, current.toolsDigest)) changed.add("tool");
  if (differs(bound.policyDigest, current.policyDigest) || differs(bound.compiledPlanDigest, current.compiledPlanDigest)) changed.add("policy");
  if (differs(bound.deploymentId, current.deploymentId) || differs(bound.harnessVersion, current.harnessVersion)
    || differs(bound.compositionDigest, current.compositionDigest)) changed.add("deployment");
  const corpus = (digests: readonly string[] | undefined): string | null => digests === undefined ? null : canonicalize([...digests].sort());
  if (!Array.isArray(current.corpusDigests) || current.corpusDigests.some(blank) || corpus(bound.corpusDigests) !== corpus(current.corpusDigests)) {
    changed.add("corpus");
  }
  return CHANGE_KINDS.filter((kind) => changed.has(kind));
}

/** Components that are not pinned even when unchanged: a model without a provider-reported version. */
export function unpinnedComponents(m: AgentVersionManifest): ChangeKind[] {
  return m.model.providerReportedVersion === null ? ["model"] : [];
}

/** The catalog's invalidation trigger for a change kind (a control's `invalidatedBy`). */
export function invalidationTrigger(kind: ChangeKind): InvalidationTrigger {
  return `${kind}_version` as InvalidationTrigger;
}

/** The tool surface a session resolved: what its seam offers the model. Only `schemas()` is read. */
export interface ResolvedToolSurface { schemas(): readonly unknown[] | null }

/**
 * The manifest of a native session as it opens (src/agent/agentSession.ts, src/kernel/agentLoopRunner.ts), built only
 * from what the session resolved, never from a caller's pins (P2-23 security review; P2-26 builds its manifests the same
 * way):
 * - `toolsDigest` digests the tool mode, the verified signed tools config, the tool schemas the composed seam offers the
 *   model, and every additional capability as declared (name, action class, context), so a capability whose action
 *   class changes counts even when its schema does not (P2-26's stricter rule). A seam that cannot list its schemas (a
 *   pinned digest that no longer matches throws there) or a workspace config that does not verify gives null, which
 *   counts as changed.
 * - `policyDigest` and `compiledPlanDigest` come from the verified active plan ("none" without one). A plan that cannot
 *   be read or verified throws, which refuses the session: stricter than counting the policy as changed.
 * This is the one manifest builder: P2-26's change envelopes (src/runtime/changeEnvelope.ts) compare this manifest too.
 * The route, prompt, harness version and composition digest are the session's own identity, as its open row records.
 * No provider reports a model version and the native runtime pins no corpus yet, so the model is unpinned and the
 * corpus list is empty.
 */
export function nativeSessionManifest(input: { workspace: string; agentId: string; providerId: string; model: string; systemPrompt: string;
  harnessVersion: string; compositionDigest: string; tools: "none" | "workspace"; surface: ResolvedToolSurface;
  additionalCapabilities?: readonly NativeToolCapability[] }): AgentVersionManifest {
  const plan = activeControlPlan(input.workspace);
  return {
    v: 1, agentId: input.agentId, deploymentId: plan?.profile.deployment?.deploymentId ?? "not_bound",
    model: { providerId: input.providerId, model: input.model, providerReportedVersion: null },
    systemPromptSha256: sha256Hex(input.systemPrompt),
    toolsDigest: resolvedToolsDigest(input.workspace, input.tools, input.surface, input.additionalCapabilities ?? []),
    policyDigest: plan?.runtimePolicy.policyDigest ?? "none", compiledPlanDigest: plan?.digest ?? "none",
    harnessVersion: input.harnessVersion, compositionDigest: input.compositionDigest, corpusDigests: []
  };
}

function resolvedToolsDigest(workspace: string, tools: "none" | "workspace", surface: ResolvedToolSurface,
  additionalCapabilities: readonly NativeToolCapability[]): string | null {
  let signedToolsConfig: string | null = null;
  if (tools === "workspace") {
    const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
    if (!snapshot.signatureValid || snapshot.digestSha256 === null) return null;
    signedToolsConfig = snapshot.digestSha256;
  }
  let schemas: readonly unknown[] | null;
  try {
    schemas = surface.schemas();
  } catch {
    return null;
  }
  const capabilities = additionalCapabilities.map((capability) => canonicalize(capability)).sort();
  return sha256Hex(canonicalize({ tools, signedToolsConfig, schemas: schemas ?? [], additionalCapabilities: capabilities }));
}
