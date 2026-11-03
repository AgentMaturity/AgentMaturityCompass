import { SECRET_PATTERNS, type SecretPattern } from "./secretPatterns.js";
import { basicTokenSpans, markupSecretSpans } from "../../dataflow/detectors.js";
import { FoldOverflow, foldedView } from "../../dataflow/textViews.js";

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

interface Region { readonly type: string; readonly start: number; readonly end: number }

/**
 * What the table alone does not read, as regions of the original text: the value of a secret-named XML element or HTML
 * input and a free-text Basic token that decodes to a user:password pair (the protected-data walk's rules,
 * src/dataflow/detectors.ts), and a table match in the text read as the
 * walk reads a member name (`foldedView`: NFKC, look-alike letters, ignorable characters removed) where that reading
 * changed it, so `аpi_key=` with a Cyrillic а or a fullwidth `ａｐｉ＿ｋｅｙ` is redacted too. Text whose folded reading
 * would pass its length limit (`foldLimit`: megabytes of U+FDFA) cannot be read that way and is replaced whole.
 */
function foldedRegions(text: string): Region[] {
  const regions: Region[] = [...markupSecretSpans(text).map(span => ({ type: "secret_field", start: span.start, end: span.end })),
    ...basicTokenSpans(text).map(span => ({ type: "basic_auth", ...span }))];
  let folded: ReturnType<typeof foldedView>;
  try { folded = foldedView(text); } catch (error) {
    if (error instanceof FoldOverflow) return [{ type: "fold_overflow", start: 0, end: text.length }];
    throw error;
  }
  if (folded === undefined) return regions;
  for (const entry of SECRET_PATTERNS) {
    for (const match of folded.view.matchAll(globalise(entry.pattern))) {
      if (match[0].length === 0) continue;
      const start = folded.from[match.index]!, last = folded.from[match.index + match[0].length - 1]!;
      const end = last + (text.codePointAt(last)! > 0xffff ? 2 : 1);
      if (text.slice(start, end) !== match[0]) regions.push({ type: entry.type, start, end });
    }
  }
  return regions;
}

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
  let redacted = "", cursor = 0;
  for (const region of foldedRegions(text).sort((a, b) => a.start - b.start || b.end - a.end)) {
    findings.push({ type: region.type, index: region.start });
    if (region.end <= cursor) continue;
    redacted += text.slice(cursor, Math.max(cursor, region.start)) + (region.start >= cursor ? placeholderFor(region.type) : "");
    cursor = region.end;
  }
  redacted += text.slice(cursor);

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
