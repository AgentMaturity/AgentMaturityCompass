# P2-06 local qualification runs (2026-10-29)

The reference deployment is **not qualified**. This folder records what ran locally on 2026-10-29 and what did not.

## Environment (local, not CI)

- macOS 26.6 (Darwin 25.6.0, arm64), Node v22.23.3.
- Docker in a colima VM (profile `amc-s7f`, linux/arm64); kind v0.33.0 with node image `kindest/node@sha256:a1ed56cf…` (Kubernetes v1.37.0); helm and kubectl from Homebrew. Cluster `amc-p206`, deleted afterwards.
- No cloud, no credentials, no registry. Secrets were random per run (`--ephemeral-secrets`) and never left the cluster except through stdin.
- Recovery targets: a scratch file marked `engineering-placeholder` (`rpoSeconds` 3600, `rtoSeconds` 1800), passed with `--targets`. It is not the agreed record; `qualification/reference-deployment/targets.json` stays empty for Sid and the P2-03 partner. BR-2 is therefore recorded as not run.

## Images

- Image A (N-1): commit `545bfe98c` (ledger schema 14, P2-09 downgrade guard present).
- Image B (N): commit `cafe5751f` (schema 16), the base of this branch.
- Both were built locally with two Dockerfile patches, because the repository Dockerfile does not produce a working image (defects D1 and D3 below): `COPY docs/adapters/manifests/` (B only) and `chmod 0700 /home/amc/.config/amc`. They are local builds, not release images.
- Digests are containerd import digests from `scripts/deploy/kind-image-digest.mjs`, not registry digests: `amc-studio@sha256:9fd81511…` (A), `amc-studio@sha256:13df09ba…` (B).

## Results

| Run | Folder | Commit | Result |
|---|---|---|---|
| Qualification run (receipt of record), harness as committed | `kind/` | `16a9ab68f` | exit 1: 1 passed (INS-2), 6 failed, 15 not run. INS-1 never became Ready (D2), so every check that needs a running Studio failed. |
| Diagnostic run: the same, plus an operator `amc value init` in the pod while it was NotReady (workaround for D2 only) | `kind-diagnostic/` | `16a9ab68f` | exit 1: 6 passed (INS-2, UPG-1, RB-1, RB-2, BR-1, CR-2), 2 failed (INS-1, BR-3), 14 not run |
| Platform lane, macOS ARM64, Node 22, local machine | `platform/darwin-arm64-node22/` | `7f38251c4` | `npm run qualify:platform` passed (13 steps, clean tree); doctor `native-modules` PASS |
| Desktop installers, macOS ARM64, local machine | `platform/darwin-arm64-desktop/` | `7f38251c4` | `package:desktop` and `package:desktop:verify` passed (macos-universal, linux-x64 and windows-x64 packages); doctor PASS |

`docs/PLATFORM_MATRIX.md` is generated from `platform/` for commit `7f38251c4`; every other lane is "not run" because no hosted run happened (nothing was pushed). `7f38251c4` and `16a9ab68f` differ only in harness files under `qualification/reference-deployment/`.

Diagnostic-run detail: UPG-1 upgraded schema 14 to 16 with the pre-upgrade chain intact and recorded about 11.8 s of downtime (Recreate). RB-2: image A refused the newer ledger (`ledger schema version 16 is newer than this AMC…`), then the pre-upgrade backup restored and A served it with `integrity_check` ok and a governed turn passing. INS-1 passed every criterion except "KeyProvider and ledger encryption on". BR-1 restored a backup taken during a governed turn into a new namespace and volume.

A first diagnostic run before `16a9ab68f` reported BR-1's restored chain as "not a prefix". That was a harness error: `amc backup restore` appends its own BACKUP_RESTORED audit session to the restored ledger. `16a9ab68f` compares the chain beyond those rows; it is not a product defect.

## Defects found (filed against their owners, not fixed here)

| Id | Defect | Evidence | Owner |
|---|---|---|---|
| D1 | `docker build` fails at `copy-build-assets.mjs`: the Dockerfile does not copy `docs/adapters/manifests` (and the receipts they name), which the build has read since `b3102b613`. | build log: `ENOENT … scandir '/build/amc/docs/adapters/manifests'` | P2-37 |
| D2 | A fresh workspace never becomes Ready: `/readyz` reports `VALUE_POLICY_UNTRUSTED: file missing`. Studio's readiness switched to `loadValuePolicyReadOnly` in `6280ba4b7`, which no longer creates the value policy, and bootstrap does not create it. | `kind/checks/INS-1.json`; diagnostic run proves `amc value init` clears it | P2-08 (async signing migration) |
| D3 | Studio crash-loops: the image's `/home/amc/.config/amc` is mode 0755 (created by `mkdir -p` for the `state` mount point) and the credentials store refuses a group- or world-readable directory. Seen on image `545bfe98c`; the same Dockerfile line is at `cafe5751f`. | pod log: `credentials directory /home/amc/.config/amc is mode 0755 …` | P1-08 (state volume) |
| D4 | `amc backup restore --force` into another tenant's initialised workspace exits non-zero but has already changed that workspace's `.amc`. | `kind-diagnostic/checks/BR-3.json` (`tenantChanged: true`) | P2-01 (workspace scoping) with the backup owner P2-09 |
| D5 | The chart cannot select a P2-08 KeyProvider or switch on P2-09 ledger field encryption, so INS-1 cannot pass. | `kind-diagnostic/checks/INS-1.json` | P2-08, P2-09 |

## Not run, and why

UPG-2 (no failing-migration test image yet), BR-2 (targets not agreed), CR-1 (P1-19 fixture), CR-3 (size-limited storage), CR-4 (networked KeyProvider not in the chart), CR-5 (HA mode not in the topology), CR-6 (no scraper or OTLP endpoint staged), OV-1 and OV-2 (not wired yet), TS-1 to TS-5 (no second tenant release; kindnet enforces no NetworkPolicy). Each is named in its `checks/<ID>.json` with the blocking item.

## Pending for Sid

- Agree RPO, RTO and backup cadence with the P2-03 partner and fill `qualification/reference-deployment/targets.json`.
- Run the harness on the D-03 cluster with real images by registry digest into `qualification/<date>-P2-06/cluster/`, and give the release gate a staging URL (`AMC_RELEASE_GATE_LIVE_URL`).
- Run `docs/deploy/reference/GUI_CHECKLIST.md` on macOS ARM64 and Windows x64.
- Confirm the proposed alert thresholds (`docs/deploy/reference/MONITORING.md`) and the `ubuntu-24.04-arm` runner label.
- Trigger the nightly matrix and reference-deployment workflows once pushed; neither has run in GitHub Actions.

## Mutations

`mutations.json`: seven guard mutations (M1 to M7) and one red/green run (R1), each killed by at least one test.

## Rerun after the D1-D4 fixes (base `58bbdff83`)

Folder `kind-rerun/`, harness as committed at `58bbdff83`, no operator workaround, the same placeholder targets.

- Image N: `58bbdff83` built with the repository Dockerfile and **no local patch**; the build passed, so D1 and D3 no longer need a patch. Digest `amc-studio@sha256:3ea4798c…` (containerd import).
- Image N-1: still `545bfe98c` with the same two local patches as before (manifests copy, `chmod 0700`). Digest `amc-studio@sha256:8f1883f5…`.

| Check | First run (`kind/`) | Rerun (`kind-rerun/`) |
|---|---|---|
| INS-1 | failed (not Ready, D2) | failed (not Ready: `VALUE_POLICY_UNTRUSTED: file missing`) |
| INS-2 | passed | passed |
| UPG-1, RB-1, BR-1, CR-2 | failed (Studio never Ready) | failed (same cause) |
| BR-3 | failed (cross-tenant restore changed the tenant) | failed (same) |
| RB-2 | not run (UPG-1 left no backup) | not run (same) |
| other 14 | not run | not run (same reasons) |

Totals are unchanged: 1 passed, 6 failed, 15 not run.

The D2, D4 and D1/D3 fixes are not what this run measures. These are two harness defects, found by this rerun and not fixed here:

- **H1, INS-1 installs N-1.** INS-1 installs `--image-a`, and N-1 (`545bfe98c`) predates the D2 fix. The fresh workspace is created by N-1, which never writes the value policy, so the cascade of the first run repeats. N's own fresh-install path (where D2 was fixed) is never exercised on a fresh volume: N only meets a volume N-1 created, and never reaches it because UPG-1's seeding fails first. Root cause: the matrix order "install N-1, then upgrade to N" makes N-1's defects gate every later check. To qualify N, either INS-1 installs N on its own release before the upgrade path, or N-1 must be a build that already contains the D2 fix.
- **H2, restores run N-1 code.** `prepareRestoreNamespace` and RB-2 start their tool pods with `--image-a` (`checks/backup.mjs`, `checks/rollback.mjs`), so BR-1 and BR-3 run N-1's `amc backup restore`, which predates the D4 fix. The restored ledger shows schema migrations 1 to 14 (N-1's), confirming it. BR-3's `tenantChanged: true` therefore says nothing about N's D4 fix. Root cause: the tool-pod image is tied to the image the release runs after RB-2 (N-1), not to the image under qualification.

Platform lanes were not rerun, so `docs/PLATFORM_MATRIX.md` is unchanged.
