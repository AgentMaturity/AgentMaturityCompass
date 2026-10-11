# P0-35: image digest pins and quickstart hardening, local qualification (2026-10-11)

Branch `rtd/p0-35-image-digests-quickstart` from `int` (`a1aef9d69`). The images were built and qualified at `886bc5762`; the only later commit on the branch adds this folder. Everything here ran locally. No GitHub Actions job ran, and nothing was pushed to a registry.

## Environment (local colima, not CI)

- macOS 26.6.2 (Darwin 25.6.0, arm64), Node v25.5.0, pnpm 10.33.0.
- Docker client 29.8.0, server 29.5.2 (linux/arm64) in a colima 0.10.3 VM (profile `amc-s7f`, vz, 4 CPU, 6 GiB, Rosetta enabled); buildx v0.37.0 (Homebrew plugin, loaded through a scratch `DOCKER_CONFIG`).
- linux/arm64 builds and runs natively. linux/amd64 builds and runs through Rosetta, which is slower than a native amd64 host.
- The engine uses the containerd image store, so an image ID is the OCI index digest of the loaded image. GitHub-hosted runners with the classic store report a config digest instead.

## Base image pins

Resolved 2026-10-11T00:03Z with `docker buildx imagetools inspect` (full output in the two `base-*.inspect.txt` files):

| Image | Index digest (pinned) | linux/amd64 | linux/arm64 |
|---|---|---|---|
| `node:22-bookworm-slim` (created 2026-10-06) | `sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392` | `sha256:efd0ab5780c2…` | `sha256:b20fe038d959…` |
| `docker/dockerfile:1` (`# syntax=`) | `sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e` | `sha256:7b32114e84ca…` | `sha256:e291cde6b142…` |

The 1.1.1 release tarball was downloaded from this project's GitHub release; its SHA-256 `dfc370a8…74f9fbf6` equals `website/install-channel.json` `packageTarballSha256` and the v1.1.1 `SHA256SUMS`.

## Results

| Check | Result | Artifact |
|---|---|---|
| `node scripts/check-image-pins.mjs` | `image-pins: files=2 errors=0` | none |
| `tests/checkImagePins.test.ts` before pinning | 8 of 9 pass; the repository case fails (expected) | none |
| Mutations M1 (pin regex also accepts tags) and M2 (quickstart check disabled) | both killed (4 and 1 failing tests), then restored | `mutations.txt` |
| Build studio, runner, quickstart for linux/arm64 and linux/amd64 | 6 of 6 built on the first try | `images.json` |
| container-smoke, linux/arm64 | passed | `container-smoke-arm64.json` |
| container-smoke, linux/amd64 (Rosetta) | attempt 1 and 2 failed: `Studio readiness timed out`; attempt 3 passed every check | `container-smoke-amd64-attempt1.json`, `-attempt2.json`, `container-smoke-amd64.json` |
| Quickstart `--version`, `id`, native SQLite, both architectures | `1.1.1`, uid/gid 10001, `better-sqlite3` opens `:memory:` | `quickstart-checks.txt` |
| Quickstart with 64 zeros as `AMC_TGZ_SHA256` | fails at the checksum: `/tmp/amc.tgz: FAILED` | `quickstart-negative-builds.txt` |
| Quickstart with an empty `AMC_TGZ_SHA256` | fails at the empty-hash guard before any download | `quickstart-negative-builds.txt` |
| 224 test files that read the touched files | 1,511 of 1,511 passed (the receipt's `tests`) | none |

The amd64 smoke allows 180 s for Studio to become ready. A separate timing run of the same amd64 image under Rosetta took 178 s to its first readiness and 49 s after a restart, so the local amd64 result sits at that deadline. All three attempts used the same image IDs and are kept. Native amd64 qualification is the CI leg below.

An earlier full run at `879e9d254` (before the count regeneration changed `README.md`, which enters the packed tarball) also passed on both architectures. In it the amd64 runner build first failed with a Rosetta segfault (exit 139 in the `python3-setuptools` postinst) and passed on retry. Its first amd64 smoke timed out at Studio readiness after a restart while the host also ran build, typecheck and lint, then passed alone.

## Pending CI (not run)

- `.github/workflows/ci.yml` `docker-smoke`: matrix over `ubuntu-latest` and `ubuntu-24.04-arm`. The arm64 runner label was not re-checked against GitHub's documentation in this session.
- `.github/workflows/release.yml`: the per-architecture `image` job, the multi-platform tag creation and `image-digests.json`. It needs a tag push (P0-39).
- `.github/workflows/docker-runner.yml`: the per-architecture `build-and-push` and the `manifest` job.

## Reproduce

```bash
docker buildx imagetools inspect node:22-bookworm-slim
node scripts/check-image-pins.mjs && npx vitest run tests/checkImagePins.test.ts
docker build --platform linux/arm64 --target studio -t amc-studio:arm64 .
docker build --platform linux/arm64 --target runner -t amc-runner:arm64 .
node scripts/container-smoke.mjs --studio-image amc-studio:arm64 --runner-image amc-runner:arm64 --out tmp/container-smoke.json
docker build --platform linux/arm64 -f docker/Dockerfile.quickstart -t amc-quickstart:arm64 . && docker run --rm amc-quickstart:arm64 --version
docker build -f docker/Dockerfile.quickstart --build-arg AMC_TGZ_SHA256=$(printf '0%.0s' $(seq 64)) .   # must fail
```

Repeat with `linux/amd64`. On colima, set `TMPDIR` to a directory under `$HOME` so container-smoke's secret files can be bind-mounted into the VM.
