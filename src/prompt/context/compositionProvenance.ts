import { isSha256HexDigest, sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

/** Source values stay outside provenance records; only identities and commitments are retained. */
export type CompositionSourceKind = "prompt" | "tool" | "policy" | "context" | "route" | "preset" | "override";

export interface CompositionSource {
  readonly kind: CompositionSourceKind;
  readonly id: string;
  readonly digest: string;
}

export interface CompositionProvenance {
  readonly version: 1;
  readonly sources: readonly CompositionSource[];
  readonly digest: string;
}

const SOURCE_KINDS: ReadonlySet<string> = new Set(["prompt", "tool", "policy", "context", "route", "preset", "override"]);

function snapshotSource(source: CompositionSource): CompositionSource {
  if (!SOURCE_KINDS.has(source.kind) || typeof source.id !== "string" || source.id.trim().length === 0
    || typeof source.digest !== "string" || !isSha256HexDigest(source.digest)) {
    throw new Error("Invalid composition source identity or digest");
  }
  return Object.freeze({ kind: source.kind, id: source.id, digest: source.digest });
}

/** Hash a resolved JSON value, including rendered text or an offered tool schema, without retaining its content. */
export function compositionSource(kind: CompositionSourceKind, id: string, content: unknown): CompositionSource {
  const encoded = canonicalize(content);
  if (typeof encoded !== "string") throw new Error("Composition source content has no JSON representation");
  return snapshotSource({ kind, id, digest: sha256Hex(encoded) });
}

/** Object keys are canonicalized; source order is preserved because prompt, tool and overlay order can affect a run. */
export function createCompositionProvenance(sources: readonly CompositionSource[]): CompositionProvenance {
  const snapshot = Object.freeze(sources.map(snapshotSource));
  const body = { version: 1 as const, sources: snapshot };
  return Object.freeze({ ...body, digest: sha256Hex(canonicalize(body)) });
}

export interface PresetCompositionOverride {
  readonly field: string;
  readonly presetValue: unknown;
  readonly effectiveValue: unknown;
}

/** Commit the verified preset and explicit invocation choices without retaining either value. */
export function presetCompositionSources<T extends { readonly id: string }>(preset: T, overrides: readonly PresetCompositionOverride[]): readonly CompositionSource[] {
  return Object.freeze([compositionSource("preset", preset.id, preset), ...overrides.map(override =>
    compositionSource("override", `${preset.id}:${override.field}`, {
      presetValue: override.presetValue ?? null,
      effectiveValue: override.effectiveValue ?? null
    }))]);
}
