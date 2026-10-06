# Plan-edit snapshots (decision D-15)

The restoration parity tests under `tests/` compare live repository files byte for byte with archived originals, so editing one of those files fails the suite. Under D-15 ("snapshot on edit"), a plan issue that edits a frozen file first archives the file's bytes from before its edit and registers them in `manifest.json`. The parity tests then compare that archived copy through `tests/helpers/landedSource.ts`, so the historical proof stays intact and every later edit is listed by issue key.

## Is a file frozen?

Make the edit, then run the parity tests:

```
npx vitest run $(git grep -l 'unused-code/' -- tests)
```

If a freeze assertion fails because of your edit, the file is frozen.

## Register a snapshot

Run this once, before you rebuild `dist/`, with your issue key and the commit your branch started from:

```
node scripts/snapshot-plan-edit.mjs --issue <KEY> --base <base-commit> <path>...
```

Commit `manifest.json` and the new `.landed` archive with the edit. The first issue to edit a file archives it; a later issue that edits the same file keeps that entry, because the proof is about the original landed bytes. The script refuses a path that is already registered, an issue key that does not match `P[0-3]-NN` and a path that is outside the repository or is not a file at the base commit. `package.json` is snapshotted the same way: `tests/helpers/packageEntries.ts` pins its entries (name, type, main, types, exports, bin and files), and the four tests that use that pin read its landed bytes.

## Build outputs under `dist/`

Some parity tests also hash build outputs, listed as `compiledContracts` in a `restoration.json`. Git does not track `dist/`, so the script archives a pinned output from disk, and only when its bytes still equal the pin. Registering `src/X.ts` also registers its pinned `dist/X.d.ts` and `dist/X.js`; pass any other pinned output, such as `dist/index.d.ts` for an edit that changes what it re-exports, explicitly. If you already rebuilt, the script refuses; rebuild at the base commit and run it again.

## Rebasing onto a rewritten base

`baseCommit` must stay an ancestor of `HEAD`. If a squash merge rewrites your base, remove your entries from `manifest.json`, delete their archives and run the script again with the new base. Otherwise the provenance test fails.

## Manifest fields

`manifest.json` holds `schemaVersion` (1), `decision` ("D-15") and `files`, sorted by `path` with each path at most once. Each entry has:

- `path`: the repository-relative POSIX path of the edited file.
- `issue`: the plan issue that archived it, for example `P0-06`.
- `baseCommit`: the 40-hex commit whose bytes were archived; for a `dist/` output, the commit the pinned build was taken at.
- `archivePath`: `unused-code/plan-edits/<issue>/<path>.landed`.
- `sha256`: the sha256 of the archived bytes. The helper refuses an archive that no longer matches.

`tests/planEditsManifest.test.ts` validates the manifest. It checks every archive against the file at its `baseCommit`, which must be an ancestor of `HEAD`, or for a `dist/` output against its pin. It skips that check only in a shallow clone that lacks a base commit.

## Limits

Only freeze comparisons read the snapshot. Behaviour checks keep importing and running the live code.
