# P1-36 receipt: file tools parity (line ranges, replaceAll, multi-edit, diffs, fileChange)

Environment: local macOS arm64 (Darwin 25.6.0), Node 22, pnpm 10.33.0. Not CI. `receipt.json` lists every command with
its exit code and duration, the focused test totals and the artifact hashes. It was written after `int` was merged in.

## What ran

- `focused-tests.json`: vitest JSON for tests/fsToolsParity.test.ts, tests/lineDiff.test.ts,
  tests/fsToolsLiteralEdit.test.ts, tests/fsToolsReadBeforeEdit.test.ts and tests/nativePinnedToolSchemas.test.ts.
- `mutations.json`: each guard broken once in the working tree, the fs tests run, the failing tests named, the source
  restored. M1 (write after each edit) and M2 (no exactly-once rule) are the spec's two mutations; M3 to M7 break the
  read-to-write digest check, diff redaction, byte-order-mark preservation, overlapping-match counting and the NUL
  binary check. Each mutation fails at least one test.
- `patch-crosscheck.log`: 400 seeded random diffs from `unifiedDiff` (CRLF lines, missing final newlines, context 0 to
  3, and eight 1,500-line cases past the 1,000-edit Myers bound) applied with the system `patch` (Apple patch
  2.0-12u11); every one reproduced the new text. The script is not part of the suite, which carries its own apply-back
  property check.
- `sample-fs-edit.txt`: one line-range read and one two-item `fs.edit` through the built pipeline, with the output
  diff and the audit row's `fileChange`. Synthetic file, no model involved.

## Schema change

The published `fs.read` schema gains `offset` and `limit`; `fs.edit` gains `replaceAll` and `edits`, and its `required`
list is now `["path"]` (exclusivity is checked in zod, not with `oneOf`). The signed policy pin (`expectedToolsDigest`)
covers grants, not schema bytes, so no policy pin changes. Each new request's `toolSchemaSha256` changes; recorded
sessions keep and are verified against their own `request/tools` bytes. tests/nativePinnedToolSchemas.test.ts now pins
the digest of the offered fs schemas (`7507bbea…`), so a later schema change is an explicit test change.

## Not done here

- The full suite (`npm test`) was not run; the focused files above and the existing files covering the changed
  modules were.
- `fileChange` uses plain SHA-256 as the spec names it. In a workspace opted in to P2-02 protected-data redaction, the
  stdout row uses a keyed digest instead; `fileChange` does not yet (follow-up).
