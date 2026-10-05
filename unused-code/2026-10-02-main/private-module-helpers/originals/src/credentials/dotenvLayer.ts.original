/**
 * The two `.env` layers — the ones AMC reads but did not write.
 *
 * A project `.env` belongs to the repository and a user `.env` belongs to the
 * machine. AMC is a guest in both, and that single fact decides every choice in
 * this file: unparsable lines are skipped rather than fatal (a `.env` full of
 * shell interpolation for some other tool must not stop AMC from starting), the
 * file mode is not enforced (0644 `.env` files are near-universal, and refusing
 * would be AMC dictating policy over a file it does not own), and nothing here
 * ever writes. The AMC-owned store is the writable layer; these two are inputs.
 *
 * The parser is deliberately small rather than a dotenv dependency. It has to
 * agree with the resolver's empty-is-absent rule and never surface a value in
 * an error, and a shared library that does neither would need wrapping anyway.
 */
import { readFileSync } from "node:fs";
import { isCredentialRefName } from "./credentialRef.js";
import { normalizeCredentialValue } from "./credentialValue.js";

/** `KEY=value`, tolerating a leading `export` and surrounding whitespace. */
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/**
 * Removes one layer of matching quotes.
 *
 * No escape processing: `\n` inside a quoted `.env` value stays two characters.
 * Expanding it would mean this parser and the operator's shell disagree about
 * what the file says, and for a credential that disagreement shows up as an
 * opaque 401 rather than an error anyone can read.
 */
function unquote(raw: string): string {
  const trimmed = raw.trim();
  const first = trimmed[0];
  if (trimmed.length >= 2 && (first === '"' || first === "'") && trimmed.endsWith(first)) {
    return trimmed.slice(1, -1);
  }
  // Unquoted values end at an unescaped `#`, matching shell-ish `.env` habit.
  const commentAt = trimmed.indexOf(" #");
  return commentAt === -1 ? trimmed : trimmed.slice(0, commentAt);
}

/** Parses `.env` text into the credential entries it contributes. */
export function parseDotenv(raw: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const match = ASSIGNMENT.exec(line);
    if (match === null) continue;
    const [, name, rawValue] = match;
    // The regex already enforces the grammar; this keeps the rule in one place
    // rather than in two that can drift apart.
    if (name === undefined || rawValue === undefined || !isCredentialRefName(name)) continue;
    const value = normalizeCredentialValue(unquote(rawValue));
    if (value === null) continue;
    entries.set(name, value);
  }
  return entries;
}

/**
 * Reads a `.env` layer, treating an unreadable file as an empty one.
 *
 * A missing `.env` is the normal case, and a `.env` this process cannot read is
 * a layer that contributes nothing — neither is a reason to refuse to start.
 * The AMC-owned file is the opposite: unreadable there is fatal, because that
 * one is AMC's own and a silent empty read would look exactly like a rotation
 * that removed every key.
 */
export function readDotenvLayer(path: string): ReadonlyMap<string, string> {
  try {
    return parseDotenv(readFileSync(path, "utf8"));
  } catch {
    return new Map<string, string>();
  }
}
