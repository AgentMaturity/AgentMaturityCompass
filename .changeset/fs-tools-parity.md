---
"agent-maturity-compass": minor
---

`fs.read` accepts `offset` and `limit` and then returns numbered lines; `fs.edit` supports `replaceAll` and an all-or-nothing list of literal `edits`; `fs.write` and `fs.edit` return unified diffs and record before and after hashes (P1-36).

- `fs.read` with `offset` (1-based first line) or `limit` (1 to 20,000 lines, default 2,000) returns each line as its number right-aligned in six columns, a tab and the text, then `[amc: lines {from}-{to} of {total}]`. `maxBytes` applies after the lines are selected. An offset past the last line is refused, and so is a line range of a binary or non-UTF-8 file. Without `offset` and `limit` the output is unchanged.
- `fs.edit` takes either `find`, `replace` and an optional `replaceAll`, or `edits` (1 to 50 items applied in order to one read of the file), never both. A single replacement now counts overlapping matches, so `aa` in `aaa` is refused as appearing twice. An edit whose `find` equals its `replace` is refused, and a failure names the edit (`edit 2 of 3: ...`) and writes nothing. `fs.edit` now refuses a file that is not valid UTF-8 instead of rewriting its undecodable bytes.
- `fs.write` and `fs.edit` refuse when the file changes between their own read and their write, and `fs.write` refuses to overwrite a file it cannot read.
- `fs.edit` returns `edited {path} ({n} replacements)` and `fs.write` returns `wrote {path}` or, for a new file, `created {path}`, followed by a unified diff capped at 400 lines and 100,000 characters (not computed past 50,000 lines a side). Secrets matched by the shared redaction patterns appear as `[AMC_REDACTED:<type>]` in the diff. In SIMULATE mode both return the diff without writing.
- Their `TOOL_CALL_ALLOWED` audit row carries `fileChange`: path, SHA-256 and size of the bytes read and written (`beforeSha256` null for a new file), replacement count, the SHA-256 of the diff shown and whether it was truncated. No file content enters the row.
- The published `fs.read` and `fs.edit` schemas change, so each new request's `toolSchemaSha256` changes. Signed tool policy digests are unaffected, and recorded sessions keep the schema bytes they committed.
