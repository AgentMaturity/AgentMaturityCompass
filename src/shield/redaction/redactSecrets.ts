import { SECRET_PATTERNS, type SecretPattern } from "./secretPatterns.js";

/**
 * The one redaction pass over text (P5.3).
 *
 * Callers differ only in what they write where a secret was, so the placeholder
 * is theirs to choose: the bridge writes an anonymous `<AMC_REDACTED>` into
 * durable rows, while `blindSecrets` writes `[SECRET_BLIND:<type>]` because its
 * consumers act on which KIND of secret leaked. Both now match the same
 * patterns, which is the point — before this, each caught roughly half of what
 * the other did.
 */

export interface SecretFinding {
  readonly type: string;
  /** Offset in the ORIGINAL text, so two findings cannot shift each other. */
  readonly index: number;
}

export interface SecretRedactionResult {
  readonly redacted: string;
  readonly findings: readonly SecretFinding[];
}

/**
 * Compile a table entry for use.
 *
 * A fresh `RegExp` per call, with `g` added here rather than stored: a shared
 * global regex carries `lastIndex` between calls, so the same input matches and
 * then does not. The table is asserted flag-free by its own test.
 */
const globalise = (pattern: RegExp): RegExp => new RegExp(pattern.source, `${pattern.flags}g`);

/**
 * Replace every secret in `text`.
 *
 * Findings are collected against the ORIGINAL text so their offsets stay
 * meaningful — collecting them against the partially-redacted string would
 * report positions that shift as earlier matches are replaced by placeholders
 * of a different length.
 */
export function redactSecrets(
  text: string,
  placeholderFor: (type: string) => string,
  extraPatterns: readonly RegExp[] = []
): SecretRedactionResult {
  const findings: SecretFinding[] = [];
  let redacted = text;

  const apply = (type: string, pattern: RegExp): void => {
    const scanner = globalise(pattern);
    let match: RegExpExecArray | null;
    while ((match = scanner.exec(text)) !== null) {
      findings.push({ type, index: match.index });
      // A zero-length match would spin forever; nudge past it.
      if (match[0].length === 0) scanner.lastIndex += 1;
    }
    redacted = redacted.replace(globalise(pattern), placeholderFor(type));
  };

  for (const entry of SECRET_PATTERNS as readonly SecretPattern[]) {
    apply(entry.type, entry.pattern);
  }
  for (const extra of extraPatterns) {
    apply("custom", extra);
  }

  return { redacted, findings };
}
