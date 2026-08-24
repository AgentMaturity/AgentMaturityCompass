/**
 * The last thing between a resolved credential and a durable row.
 *
 * A provider's error body is untrusted text that AMC then SIGNS. Most of the
 * time it says "rate limit exceeded". Occasionally an upstream echoes part of
 * the request — a proxy quoting the `authorization` header it rejected, a
 * misconfigured gateway returning its own inbound request on a 400 — and that
 * text goes straight into `request/failure`, into `event_hash`, under
 * `writer_sig`, and eventually into an anchored Merkle root. A secret written
 * into an append-only, tamper-evident, externally anchored log cannot be taken
 * back out. It can only be rotated and confessed.
 *
 * So the value is removed before the row is built, by exact substring match
 * against the value that was actually resolved for this request. Exact match
 * rather than a pattern is deliberate: this module knows the secret, so it does
 * not need to guess what secrets look like, and a guesser produces both misses
 * (a key shaped unlike the pattern) and false positives (a model's output
 * mangled because it resembled one).
 *
 * This is NOT AMC's redaction engine and must not grow into one. The tree has
 * three of those already and P5.3 owns reconciling them; what this does is a
 * single exact-value guard on one path, and keeping it that small is what keeps
 * it obviously correct.
 */

/** What replaces a credential value wherever one is found. */
export const CREDENTIAL_PLACEHOLDER = "[amc:redacted-credential]";

/**
 * Values too short to remove safely.
 *
 * A one- or two-character "credential" would match everywhere and turn a
 * provider message into confetti. A value that short is not a secret worth
 * protecting, and mangling every row that mentions the letter `a` would be a
 * worse outcome than the risk it addresses.
 */
const MIN_SCRUBBABLE_LENGTH = 8;

/**
 * Remove every occurrence of `secret` from `text`.
 *
 * `split`/`join` rather than a regular expression: building a `RegExp` from a
 * secret means escaping it correctly, and an escaping bug on this path is a
 * secret that reaches the log. There is nothing to escape in a split.
 *
 * @param text untrusted text about to be recorded.
 * @param secret the value resolved for this request, or null when there was none.
 */
export function scrubCredential(text: string, secret: string | null): string {
  if (secret === null || secret.length < MIN_SCRUBBABLE_LENGTH) return text;
  if (!text.includes(secret)) return text;
  return text.split(secret).join(CREDENTIAL_PLACEHOLDER);
}

/**
 * True when `text` still contains `secret`.
 *
 * Exists so a test can assert the guarantee directly rather than by inspecting
 * the placeholder, and so a future caller on a different path has one predicate
 * to reach for instead of writing `includes` and getting the null case wrong.
 */
export function containsCredential(text: string, secret: string | null): boolean {
  if (secret === null || secret.length === 0) return false;
  return text.includes(secret);
}
