# P2-06-D1/D3: source image builds and Studio starts (2026-10-29)

Local qualification of the Dockerfile fix for defects D1 and D3 from `qualification/2026-10-29-P2-06/README.md`. Built and run on colima (profile `amc-s7f`, linux/arm64) with `docker buildx build --load --target studio`. Nothing was pushed to any registry; the container and its volumes were removed afterwards, and the generated test secrets were deleted.

| File | What it shows |
|---|---|
| `build.log` | The full studio build, exit 0. `copy-build-assets.mjs` no longer fails with ENOENT on `docs/adapters/manifests` (D1). |
| `image-id.txt` | Local image id `sha256:d2287c43…`. A local build, not a release image. |
| `image-inspect.txt` | `/home/amc/.config/amc` and `state` are mode 700, owned by `amc` (D3). The installed package now carries `catalog/`, `deploy/apparmor/`, `docs/NATIVE_SANDBOX_UBUNTU.md` and all eight adapter-claim files (four manifests, two conformance records, two `receipt.json`). |
| `studio.log` | Bootstrap and Studio start with a named volume on `/home/amc/.config/amc/state`, as Compose mounts it. There is no credentials-directory refusal and no restart. |
| `studio-state.json` | Final container state: `healthy`, 0 restarts. |
| `readyz-after-value-init.json` | `/readyz` is READY with no reasons. |

Before `amc value init`, `/readyz` returned 503 with only `VALUE_POLICY_UNTRUSTED: file missing`. That is defect D2 (P2-08 owner), which is outside this fix. The P2-06 diagnostic workaround `amc value init` cleared it, and the healthcheck then passed. A fresh workspace stays NOT_READY until D2 is fixed.

`scripts/container-smoke.mjs` did not catch D3 because it mounts a tmpfs at `/home/amc` with mode 0700, which hides the image's own directory modes.

## Receipt repaired 2026-10-31

The folder had no `receipt.json`, which `npm run check:qualification` requires. It was written from the files above and the git history. Its one command is the image build, whose line and exit code `build.log` records. The container run, `amc value init` and the `/readyz` request have outputs here but no recorded command lines or exit codes, so the notes describe them instead of listing them. `commit` is `ab6f2d4f6`, the commit that holds the Dockerfile fix the build ran with; its parent is the worktree tip `331f311d6` that `build.log` names. `tests` is null because the folder records no test run. The six evidence files are listed as hashed artifacts. The host's Node, pnpm and OS versions and the build's duration were never recorded; they are written as `not recorded` and `durationMs: 0`. `arch` is `arm64`, from the linux/arm64 build and run.
