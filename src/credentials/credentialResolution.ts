/**
 * Precedence, applied.
 *
 * A pure fold from "what each layer had for this reference" to "which layer
 * answers, and with what". It holds no storage and reads no files — the caller
 * supplies the readings — so the precedence rule and the empty-is-absent rule
 * can be exercised exhaustively without a filesystem, and a provider cannot
 * accidentally implement precedence a second, slightly different way.
 */
import {
  CREDENTIAL_SOURCE_PRECEDENCE,
  type CredentialDescription,
  type CredentialSource,
  credentialSourceRank,
  describeCredential
} from "./credentialSources.js";
import { DuplicateCredentialLayerError } from "./credentialsErrors.js";
import { normalizeCredentialValue } from "./credentialValue.js";

/** One layer's raw reading for a single reference. */
export interface CredentialLayer {
  readonly source: CredentialSource;
  /** Exactly what the layer held: absent, blank and set are all representable. */
  readonly raw: string | null | undefined;
}

/**
 * Which layer answered, and what it answered with.
 *
 * Unlike {@link CredentialDescription} this *does* carry the value, because the
 * resolver's whole job is to produce one. It is the internal shape; nothing
 * that faces a UI, a log or an evidence event should take this — those take a
 * description.
 */
export interface CredentialResolution {
  readonly value: string | null;
  readonly source: CredentialSource | null;
}

/**
 * Resolves a reference across the supplied layers.
 *
 * Layers are ranked, not trusted in argument order. Handing them in the wrong
 * order is the easiest mistake for a provider to make and the hardest to see in
 * review, and its consequence — a project `.env` outranking the inherited
 * environment — is a silent privilege inversion rather than a visible fault.
 *
 * A layer whose reading is blank does not answer and does not block a lower
 * one, so `OPENAI_API_KEY=` in a shell profile leaves the file layer free to
 * supply the key and free to be written to.
 *
 * @throws {DuplicateCredentialLayerError} when a layer appears twice, because
 * precedence over a repeated layer is undefined and the answer would silently
 * depend on array order again.
 */
export function resolveCredentialLayers(
  layers: readonly CredentialLayer[]
): CredentialResolution {
  const seen = new Set<CredentialSource>();
  for (const layer of layers) {
    if (seen.has(layer.source)) {
      throw new DuplicateCredentialLayerError(layer.source);
    }
    seen.add(layer.source);
  }

  const ranked = [...layers].sort(
    (left, right) => credentialSourceRank(left.source) - credentialSourceRank(right.source)
  );

  for (const layer of ranked) {
    const value = normalizeCredentialValue(layer.raw);
    if (value !== null) {
      return { value, source: layer.source };
    }
  }
  return { value: null, source: null };
}

/**
 * Describes a reference across the supplied layers, without carrying the value.
 *
 * The composition exists so a provider's `describe` is `resolve` minus the
 * secret rather than a parallel code path — the two can then never disagree
 * about whether something is configured.
 */
export function describeCredentialLayers(
  layers: readonly CredentialLayer[]
): CredentialDescription {
  return describeCredential(resolveCredentialLayers(layers).source);
}

/**
 * The layer order a provider must assemble, restated as a value for tests and
 * for provider construction. Exported so "highest first" is asserted somewhere
 * rather than only commented.
 */
export const CREDENTIAL_LAYER_ORDER: readonly CredentialSource[] = CREDENTIAL_SOURCE_PRECEDENCE;
