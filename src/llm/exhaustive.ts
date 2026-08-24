/**
 * Exhaustiveness for the LLM seam's CLOSED unions.
 *
 * The distinction this file exists to enforce is dsh's (`packages/llm/llm/src/
 * never.ts`) and it is load-bearing in AMC for a stronger reason than it was
 * there: a `StreamChunk` variant nobody handles is a variant nobody SIGNS. The
 * session spine commits one `assistant/block` per completed block, so a chunk
 * type that falls off the end of a switch is model-visible output with no
 * durable row — the exact "model-visible ⟺ logged ⟺ signed" break that P2.2
 * made structural. Ending every switch over `chunk.type` with `assertNever`
 * turns "someone added a variant" from a silent evidence gap into a build
 * failure at every site that must handle it.
 *
 * Applies to `StreamChunk` and `FinishReason` only. It does NOT apply to
 * merge-extensible vocabularies — but note that AMC has none in this seam:
 * `SurfaceKind` is closed on purpose, because each kind is already spelled into
 * signed rows and a sixth kind needs a deliberate vocabulary change, not a
 * declaration merge (this is a considered divergence from dsh, whose
 * `ContentBlockMap` is open).
 */

/**
 * Mark an unreachable branch of a closed union.
 *
 * A newly unhandled variant fails to compile at the call site; a value that
 * escaped its static type at runtime throws with the offending value rendered.
 */
export function assertNever(value: never, context: string): never {
  // JSON.stringify is typed `string` but really returns undefined for
  // undefined input, so String() covers that and other non-serializable cases.
  const rendered = (JSON.stringify(value) as string | undefined) ?? String(value);
  throw new Error(`unreachable variant in ${context}: ${rendered}`);
}
