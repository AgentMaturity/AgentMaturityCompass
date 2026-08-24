/**
 * Reading and editing the AMC-owned credentials file.
 *
 * Two rules shape everything here.
 *
 * The first is that a parse failure must not print the line it failed on. The
 * YAML library, like every good parser, prettifies its errors with a source
 * frame and a caret — which for this file means printing a credential. So the
 * document is parsed with `prettyErrors: false` and the library's message is
 * never surfaced; positions are recomputed from a `LineCounter` and only the
 * error *code* travels.
 *
 * The second is that an edit must touch one key. Rewriting the file from a
 * parsed object would silently delete every comment an operator wrote — the
 * `# rotated 2026-03, expires in June` notes that are the only documentation a
 * credentials file ever has. So edits go through the CST-backed `Document`,
 * which re-emits the untouched parts byte-for-byte.
 */
import YAML, { isMap, isScalar, LineCounter, Scalar } from "yaml";
import { isCredentialRefName } from "./credentialRef.js";
import { normalizeCredentialValue } from "./credentialValue.js";
import {
  type CredentialsFilePosition,
  CredentialsFileParseError
} from "./credentialsStoreErrors.js";

/** A parsed store: reference name → non-empty value. Nothing else is legal. */
export type CredentialsFileEntries = ReadonlyMap<string, string>;

type ParsedDocument = ReturnType<typeof YAML.parseDocument>;

interface LoadedDocument {
  readonly document: ParsedDocument;
  readonly entries: Map<string, string>;
}

function positionAt(lineCounter: LineCounter, offset: number | undefined): CredentialsFilePosition | null {
  if (typeof offset !== "number") return null;
  const found = lineCounter.linePos(offset);
  return { line: found.line, column: found.col };
}

/** True for `KEY:` with nothing after it — a key present with no value. */
function isNullNode(node: unknown): boolean {
  return node === null || node === undefined || (isScalar(node) && node.value === null);
}

function loadDocument(path: string, raw: string): LoadedDocument {
  const lineCounter = new LineCounter();
  // `prettyErrors: false` is the security-relevant option, not a style choice:
  // with it on, `error.message` carries the offending source line.
  // `uniqueKeys` makes a repeated reference an error rather than a silent
  // last-one-wins, because "which copy of the key is live" is not something an
  // operator should have to know.
  const document = YAML.parseDocument(raw, {
    uniqueKeys: true,
    lineCounter,
    prettyErrors: false
  });

  const failure = document.errors[0];
  if (failure !== undefined) {
    throw new CredentialsFileParseError({
      path,
      reason: "yaml",
      position: positionAt(lineCounter, failure.pos[0]),
      detail: failure.code
    });
  }

  const entries = new Map<string, string>();
  const contents = document.contents;
  // An empty file, or one holding only comments, is an empty store — not a
  // shape error. Refusing it would make "no credentials yet" a startup failure.
  if (contents === null || contents === undefined) return { document, entries };
  if (isScalar(contents) && contents.value === null) return { document, entries };

  if (!isMap(contents)) {
    throw new CredentialsFileParseError({
      path,
      reason: "not-a-mapping",
      position: positionAt(lineCounter, contents.range?.[0])
    });
  }

  for (const item of contents.items) {
    const key = item.key;
    const keyPosition = positionAt(lineCounter, isScalar(key) ? key.range?.[0] : undefined);
    if (!isScalar(key) || typeof key.value !== "string" || !isCredentialRefName(key.value)) {
      // The key is deliberately not echoed. The likeliest reason a key fails
      // the reference grammar is that a secret was pasted into the key
      // position, and an error that quotes it completes the disclosure.
      throw new CredentialsFileParseError({ path, reason: "key-not-a-reference", position: keyPosition });
    }
    const name = key.value;

    // `KEY:` with no value is absent, not an error — the same rule the
    // resolver applies to a blank environment variable.
    if (isNullNode(item.value)) continue;

    if (!isScalar(item.value) || typeof item.value.value !== "string") {
      // Here the key *did* pass the reference grammar, so naming it is safe
      // and is what an operator needs; the value stays unmentioned.
      throw new CredentialsFileParseError({
        path,
        reason: "value-not-a-string",
        position: positionAt(lineCounter, item.value?.range?.[0]) ?? keyPosition,
        detail: name
      });
    }

    const normalized = normalizeCredentialValue(item.value.value);
    // Empty is absent: an entry that resolves to nothing must not be reported
    // as configured, or `describe()` and `resolve()` disagree.
    if (normalized === null) continue;
    entries.set(name, normalized);
  }

  return { document, entries };
}

/** Parses a credentials file's text into the strict reference→value mapping. */
export function parseCredentialsFile(path: string, raw: string): CredentialsFileEntries {
  return loadDocument(path, raw).entries;
}

/**
 * Returns `raw` with exactly one key set or removed, comments intact.
 *
 * The value is always emitted double-quoted. Left to choose, the stringifier
 * would write `KEY: 12345` for the string `"12345"`, and the next read would
 * parse it as a number and reject the file — a store that corrupts its own
 * entries on a round trip. Double quoting also escapes newlines, so a key with
 * embedded line breaks (a PEM block) survives instead of being folded.
 *
 * `changed` is false only when a removal found nothing to remove, so a caller
 * can report "already absent" without a read that would race the write queue.
 */
export function patchCredentialsFile(input: {
  readonly path: string;
  readonly raw: string;
  readonly name: string;
  /** The value to store, or `null` to remove the entry. */
  readonly value: string | null;
}): { readonly text: string; readonly changed: boolean } {
  const { document, entries } = loadDocument(input.path, input.raw);

  // A document whose contents parsed to an explicit null (an empty file, or one
  // holding only comments) is a scalar, not a collection, and `set` refuses to
  // add a key to a scalar. Clearing it lets `set` build the mapping.
  if (isNullNode(document.contents) && document.contents !== null) {
    document.contents = null;
  }

  if (input.value === null) {
    if (!entries.has(input.name)) return { text: input.raw, changed: false };
    document.delete(input.name);
    return { text: document.toString(), changed: true };
  }

  const node = document.createNode(input.value) as Scalar;
  node.type = Scalar.QUOTE_DOUBLE;
  document.set(input.name, node);
  return { text: document.toString(), changed: true };
}
