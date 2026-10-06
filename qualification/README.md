# Qualification receipts

A qualification receipt records what was run to prove a plan issue, gate or decision: the commit, the toolchain, every command with its exit code, the test totals and the hashes of any attached artifacts. Receipts are tracked here so that anyone working from a clone can check them. `npm run check:qualification` validates every receipt, and CI runs it in `build-test`.

## Folder naming

One folder per receipt: `qualification/<YYYY-MM-DD>-<KEY>/`, for example `2026-10-05-P0-01`. The date is the real calendar day the checks ran. The key is a plan issue (`P0-01`), a decision (`D-09`) or a gate (`GATE-G0`). The folder date and key must equal the `date` and `key` in the receipt.

## Required files

- `receipt.json`, valid against [`receipt.schema.json`](receipt.schema.json). The commit is the full 40-character SHA the checks ran on. When `tests` is not null, `passed + failed + skipped` must equal `total`. A command that exited non-zero must be explained in `notes`.
- `README.md`, non-empty: what was checked, why, and how to reproduce it.
- Optional artifacts (summarised logs, reports). Each one listed in `artifacts` must be a regular file inside the folder, named by a relative path with forward slashes, and match its `sha256`. Symlinks are rejected anywhere under `qualification/`.

## Size limit

No file may exceed 1 MB (1,048,576 bytes). Summarise long logs and keep the hash of the full log in the receipt or README instead of committing it.

## No secrets

Never commit keys, tokens or credentials. The validator rejects `*.pem`, `*.key`, `*.p12`, `.env*` and `*.amcvault` files and any file containing private key material. Test keys belong in temporary directories.

## Why not `AMC_OS/`

`AMC_OS/` is gitignored, so new files written there never reach a clone and cannot be cited as evidence. Receipts live here instead.
