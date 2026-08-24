/**
 * The encoder seam: the one function a request's bytes are allowed to come from.
 *
 * WHY THIS EXISTS AT ALL. P2.2 committed `requestDigest = sha256(exact bytes)`
 * in a signed row, which proves the bytes were not altered AFTER the fact but
 * says nothing about how to get them back — the row holds the digest, never the
 * bytes. Reconstruction therefore needs a function `derive(header, log) → bytes`,
 * and a function needs a NAME in the row, because "run the encoder" is only
 * meaningful if the log says which encoder and at which version. An encoder that
 * changes its output without changing its version silently un-reconstructs every
 * request ever recorded under it; that is what {@link RequestEncoder.version} is
 * for, and why the header carries the pair rather than the provider id alone.
 *
 * WHAT AN ENCODER MUST BE. Pure and total over its declared inputs: no clock, no
 * randomness, no environment, no credential, no dependence on object-key
 * enumeration order. Two calls with equal {@link EncodableRequest}s must produce
 * byte-identical output, in this process and in one five years from now with a
 * different Node version. Anything an encoder cannot express must throw
 * {@link RequestEncodingError} rather than be approximated.
 *
 * WHAT AN ENCODER MUST NOT DO. Touch credentials. The bytes an encoder produces
 * are the request BODY; authentication is a transport header applied by the
 * adapter, resolved per request through `ctx.amcCredentials` (P3.0). Keeping the
 * key out of the body is also what keeps it out of the log — `requestBytes` is
 * hashed into a signed row and, for a body carrying a key, that row would be a
 * durable record of the secret.
 */
import type { EncodableRequest } from "./requestSpec.js";

export interface RequestEncoder {
  /** Stable identity, recorded in every `request/header` row it produced. */
  readonly id: string;
  /**
   * The version of this encoder's WIRE SHAPE. Bump on any change to the bytes
   * produced for an unchanged input — including one that only reorders keys.
   * Never bump for a refactor that cannot change output.
   */
  readonly version: number;
  encode(request: EncodableRequest): Buffer;
}

/**
 * A lookup from (id, version) to encoder.
 *
 * A class rather than a module-level mutable map so that derivation can be run
 * against an EXPLICIT set of encoders. A verifier that silently depended on
 * whichever adapters a process happened to have imported would give different
 * verdicts in different hosts, which is the opposite of what a verifier is for.
 */
export class RequestEncoderRegistry {
  private readonly encoders = new Map<string, RequestEncoder>();

  constructor(encoders: readonly RequestEncoder[] = []) {
    for (const encoder of encoders) {
      this.register(encoder);
    }
  }

  private static key(id: string, version: number): string {
    return `${id}@${version}`;
  }

  /**
   * Add an encoder. Refuses to replace an existing (id, version): two different
   * functions under one name is exactly the condition that makes a recorded
   * request unreconstructable, and it should fail where the collision is
   * introduced rather than where a verdict later comes out wrong.
   */
  register(encoder: RequestEncoder): this {
    const key = RequestEncoderRegistry.key(encoder.id, encoder.version);
    if (this.encoders.has(key)) {
      throw new Error(`request encoder ${key} is already registered`);
    }
    if (!Number.isInteger(encoder.version) || encoder.version < 1) {
      throw new Error(`request encoder ${encoder.id}: version must be an integer >= 1`);
    }
    this.encoders.set(key, encoder);
    return this;
  }

  /** The encoder for this exact (id, version), or null. Never a near match. */
  get(id: string, version: number): RequestEncoder | null {
    return this.encoders.get(RequestEncoderRegistry.key(id, version)) ?? null;
  }

  /** Every registered `id@version`, sorted — for diagnostics when a lookup fails. */
  list(): readonly string[] {
    return [...this.encoders.keys()].sort();
  }
}
