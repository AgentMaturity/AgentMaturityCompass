# Plan-edit snapshots (decision D-15)

The restoration parity tests under `tests/` compare live repository files byte for byte with archived originals, so editing one of those files fails the suite. Under D-15 ("snapshot on edit"), a plan issue that edits a frozen file first archives the file's bytes from before its edit and registers them in `manifest.json`. The parity tests then compare that archived copy through `tests/helpers/landedSource.ts`, so the historical proof stays intact and every later edit is listed by issue key.

## Is a file frozen?

Make the edit, then run the parity tests:

```
npx vitest run $(git grep -l 'unused-code/' -- tests)
```

If a freeze assertion fails because of your edit, the file is frozen.

## Register a snapshot

Run this once, before or with the edit, with your issue key and the commit your branch started from:

```
node scripts/snapshot-plan-edit.mjs --issue <KEY> --base <base-commit> <path>...
```

Commit `manifest.json` and the new `.landed` archive with the edit. The first issue to edit a file archives it; a later issue that edits the same file keeps that entry, because the proof is about the original landed bytes. The script refuses a path that is already registered, an issue key that does not match `P[0-3]-NN`, and a path that is outside the repository or absent at the base commit.

## Manifest fields

`manifest.json` holds `schemaVersion` (1), `decision` ("D-15") and `files`, sorted by `path` with each path at most once. Each entry has:

- `path`: the repository-relative POSIX path of the edited file.
- `issue`: the plan issue that archived it, for example `P0-06`.
- `baseCommit`: the 40-hex commit whose bytes were archived.
- `archivePath`: `unused-code/plan-edits/<issue>/<path>.landed`.
- `sha256`: the sha256 of the archived bytes. The helper refuses an archive that no longer matches.

`tests/planEditsManifest.test.ts` validates the manifest and, when the base commits are in the clone, checks every archive against `git show <baseCommit>:<path>`.

## Limits

Only freeze comparisons read the snapshot. Behaviour checks keep importing and running the live code. Files under `dist/` that some parity tests hash are build outputs that git does not track, so this script cannot archive them.
