# P0-14 slice C: local qualification runs (2026-10-11)

Slice C lands the S1 and S2 deployment-hardening commits (cherry-picked with `-x` from the candidate) and the P0-14 fixes on branch `rtd/p0-14-slice-c-deploy-hardening`. This folder records what ran locally on 2026-10-11 and what did not run.

## Environment (local, not CI)

- macOS 26.6.2 (Darwin 25.6.0, arm64), Node v25.5.0, pnpm 10.33.0.
- Docker 29.5.2 (linux/arm64) in a colima 0.10.3 VM (profile `amc-s7f`, 4 CPU, 6 GiB); BuildKit through Homebrew's `docker-buildx` plugin.
- helm v4.3.0, kubeconform v0.8.0, kind v0.33.0 (node image `kindest/node:v1.37.0`), kubectl v1.37.1.
- `.github/workflows/deploy-pack.yml` pins the same tool versions. Its jobs have **not** run in GitHub Actions: nothing was pushed. Every CI job is `pending-ci`.

How the workflow steps were run locally: a scratch runner executed each job's `run:` blocks verbatim with the workflow, job and step `env`, under `bash --noprofile --norc -eo pipefail` for `shell: bash` steps. It skipped `uses:` steps and the `install-tools` step (the tools above were already installed), set `KIND_CLUSTER=amc-p014` (CI uses `amc-ci`), and redacted `::add-mask::` lines from its own console. Two local-only adjustments: `mktemp` was a shim with GNU semantics (honour `TMPDIR`), because macOS `mktemp -d` ignores `TMPDIR` and colima only mounts `$HOME` into the VM; and `DOCKER_CONFIG` pointed at a scratch config that loads the buildx plugin, because the Dockerfile's `COPY --chmod` needs BuildKit.

## Results

| Check | Commit | Result | Artifact |
|---|---|---|---|
| Tree equivalence of the 12 picks against `7180bd0c4` (S1) and `0d1bb10a3` (S2) | `5c2379934` | S1 empty; S2 differs only in `docs/RELEASE_RUNBOOK.md`, by main's own P0-09 change (`fefb9b85e`), kept | `equivalence.txt` |
| `deploy-pack-check.mjs --json --require-tools` | receipt commit | passed (helm lint, renders, kubeconform; nothing skipped) | `static/deploy-pack-check.json` |
| S1 and S2 vitest files (15 files) | receipt commit | 94 passed of 94 (the receipt's `tests`) | none |
| Four negative renders and no `kind: Secret` in the default render | receipt commit | all five checks pass, each refusal naming its reason | `static/negative-renders.txt` |
| The same step against chart 0.1.0 (`691a041dc`) | receipt commit | fails as required: 4 renders accepted, default render contains `kind: Secret` | `static/negative-renders-against-chart-0.1.0.txt` |
| Kind: install, pin monitor key (revision 2), pair, test, upgrade, rollback to 2, pair, test | `0c8fa7365` | **passed**: every step exit 0; both `helm test` probes reached `verified-prefix` | `kind/helm-lifecycle.json`, `kind/helm-lifecycle.log` |
| `deploy-verify.mjs` against the kind release | receipt commit (clean tree) | passed: 5 of 5 checks, `llm_response` receipt verified against the pinned monitor key | `kind/deploy-verify.json` |
| Rollback drill, image A from `origin/main` (`691a041dc`), image B from the head | `0c8fa7365` | **failed** at `probe-a` `verify`: main's Studio runs the complete-ledger check, which the live gateway session fails | `drill/rollback-drill-a-origin-main.json` |
| Rollback drill, image A from `8c4bc10ec`, image B from the head | `0c8fa7365` | **passed**: six steps, two `sha256` image ids, `verified-prefix` on all three probes | `drill/rollback-drill.json` |
| Mutations M1 to M22 | `30f88cac9` | 22 of 22 killed, restored green | `mutations.json` |

Between `0c8fa7365` and the receipt commit only this receipt changed. Image A of the second drill comes from `8c4bc10ec`, whose Studio differs from the head only in `0c8fa7365` (a failed verdict keeps its recorded head), which no passing verdict touches.

### Root cause of the earlier verify refusal, and the fix

Both probes reached Studio, claimed a pairing code, logged in, ran one stub-provider turn and called `/verify`, which answered `failed`. Studio's native verify ran `verifyAgentRun` over the complete ledger (`verifyLedgerIntegrity`), which requires every legacy session to carry a seal (`src/ledger/ledgerVerification.ts`, the `missing seal` rule in `verifySessions`). The gateway that Studio runs opens one legacy session at start and seals it only at stop (`src/gateway/server.ts`, `startSession` and `sealSession`), so a running Studio could never verify its own turn. The monitor key was also unpinned, so even an intact ledger would have been `failed` (untrusted).

The fix uses the verifier the product already had for this situation (`verifyNativeSessionContinuation`, the verified-prefix scope that session resume uses), without weakening any rule:

- The target session must be closed and sealed; an unclosed or unsealed target fails.
- Every row, every session chain and every sealed session is still checked. A truncated row or a cut row that later rows chain over fails.
- Only unended, unsealed legacy sessions other than the target may be unfinalized, and each is named.
- The result is a separate state. `verifyAgentRun` reports `prefixVerified` with `ok: false`; the CLI renders `VERIFIED PREFIX (not finalized: ...)`; Studio reports `anchored-prefix` (never `externally-anchored`) with `verificationScope`; the console labels it "verified prefix only"; the probe's status is `verified-prefix`; the helm-lifecycle and drill receipts record `probeStatuses`. The SDK still requires `ok`.
- Only Studio's own verify enables it (`src/studio/nativeTaskVerdict.ts`); the verify route's body schema is strict, and no query string or header reaches the service.
- It applies only when the store marker is positively SQLite. A thrown verifier or any unexpected report shape is `failed`.
- The monitor key is pinned by the operator: the chart passes `env.AMC_EXPECTED_MONITOR_FINGERPRINT` and rolls the pod on a config change; the kind job and the drill read the key through the cluster or docker, not from Studio's HTTP endpoints.

The kind verdicts name one unfinalized session, the gateway's (pods stop gracefully, so earlier gateway sessions were sealed). The drill's verdicts name one more session per replaced container, because `docker rm -f` stops the gateway without sealing.

### Other defects the real runs found, fixed in this slice

1. The kind install failed (`RunContainerError`): the image's `/var/run` is a symlink to `/run`, so the service-account token mount point lay inside the read-only `/run/secrets` mount. Pods no longer automount the token (`6fede779b`).
2. The drill's probe tried `/healthz` once, before Studio listened. The ready window now covers `/healthz` (`ff8566142`).
3. Every deploy CLI compared the unresolved `argv[1]` with `import.meta.url`. Started through a symlink, as a ConfigMap mount starts the Helm test probe, it ran nothing and exited 0. A first kind run recorded a `helm test` "pass" that ran no probe; that result is void. Guards now compare realpaths (`1ef317199`). The same bug in nine maintenance scripts is fixed with a shared helper, `scripts/lib/entrypoint.mjs` (`d28dba39a`).
4. LAN mode (the image and chart default) refuses login without a one-time pairing code. The probe claims one (`--pairing-code-file`), the Helm test mounts the optional Secret `<fullname>-test-pairing`, the drill mints one inside each container, and the workflow mints one before each `helm test` (`1ef317199`).
5. Secret temp dirs were left behind when a step failed; the workflow now cleans up in `EXIT` traps (`3596d3f00`). The verifier's stub upstream exits by itself (`5a2b84756`).

## Mutations (`mutations.json`)

| Id | Mutation | Test file |
|---|---|---|
| M1 | delete the `secret.yaml` if-wrapper | `tests/helmChartSecrets.test.ts` |
| M2 | `amc.bootstrapValue` uses the bare value, not `required` | `tests/helmChartSecrets.test.ts` |
| M3 | remove the ConfigMap `AMC_CORS_ALLOWED_ORIGINS` line | `tests/helmChartOrigins.test.ts` |
| M4 | drop the drill's `AMC_CORS_ALLOWED_ORIGINS` env | `tests/rollbackDrill.test.ts` |
| M5 | `buildReport` prints `value: env[name]` | `tests/credentialPresence.test.ts` |
| M6 | delete "wait for an explicit yes" under B4 | `tests/deploymentConfirmationRunbook.test.ts` |
| M7 | drop `automountServiceAccountToken: false` | `tests/helmChartSecrets.test.ts` |
| M8 | `deploy-verify.mjs` compares the unresolved `argv[1]` | `tests/deployPackCheck.test.ts` |
| M9 | the probe skips the pairing claim | `tests/deployPackProbe.test.ts` |
| M10 | the probe tries `/healthz` once | `tests/deployPackProbe.test.ts` |
| M11 | no closed-and-sealed target check in the live scope | `tests/agentLoopReconstructable.test.ts` |
| M12 | a verified prefix sets `ok` | `tests/agentLoopReconstructable.test.ts` |
| M13 | live scope on any marker except `jsonl` | `tests/agentLoopReconstructable.test.ts` |
| M14 | skip row checks in the live scope | `tests/agentLoopReconstructable.test.ts` |
| M15 | Studio reports a prefix as `externally-anchored` | `tests/nativeTaskVerdict.test.ts` |
| M16 | Studio accepts a report without `prefixVerified` | `tests/nativeTaskVerdict.test.ts` |
| M17 | a thrown verifier escapes the verdict | `tests/nativeTaskVerdict.test.ts` |
| M18 | the verify body schema passes unknown fields through | `tests/cosProduct10NativeTasksRouter.test.ts` |
| M19 | the probe reports a prefix as `verified` | `tests/deployPackProbe.test.ts` |
| M20 | the drill records every passing probe as `verified` | `tests/rollbackDrill.test.ts` |
| M21 | the console labels a prefix like a full verification | `tests/studioNativeTaskValidation.test.ts` |
| M22 | the shared entrypoint helper compares the unresolved `argv[1]` | `tests/scriptEntrypoint.test.ts` |

Each mutation turned its test file red and the restored file green; failing test names are in `mutations.json`. M1 to M6 are the spec's six. M9, M10 and M19 edit only `scripts/deploy/governed-turn-probe.mjs`, so the byte-identity test with the chart copy also fails; the behaviour test fails in each. The Studio service's call into `nativeTaskVerdict.ts` was not mutated: `tests/studioNativeTaskService.test.ts` fails on `int` on this host, so the kind run is the evidence for that wiring.

## Pending CI (`pending-ci`, not passed)

Nothing below has run in GitHub Actions. After a push, the pull request runs `.github/workflows/deploy-pack.yml`:

- `static`: `pnpm install --frozen-lockfile`; tool install with checksum checks; `node scripts/deploy/deploy-pack-check.mjs --json --require-tools`; the 15 S1 and S2 test files; the negative-render step.
- `kind`: `kind create cluster --name amc-ci --wait 180s`; `docker build -t amc-studio:ci .`; `kind load docker-image amc-studio:ci --name amc-ci`; random `amc-bootstrap`; `helm install amc deploy/helm/amc --set image.repository=amc-studio --set image.tag=ci --wait --timeout 10m`; pin the monitor key (`helm upgrade --reuse-values --set env.AMC_EXPECTED_MONITOR_FINGERPRINT=<sha256> --wait`); pair; `helm test amc --logs --timeout 10m`; `helm upgrade amc deploy/helm/amc --reuse-values --set resources.requests.cpu=250m --wait --timeout 10m`; `helm rollback amc 2 --wait --timeout 10m`; pair; `helm test amc --logs --timeout 10m`; `node scripts/deploy-verify.mjs --target http://127.0.0.1:13212 --gateway http://127.0.0.1:13210 --monitor-pubkey <pinned> --route /local --model gpt-test --lease-file <minted> --out tmp/deploy-pack/deploy-verify.json`.
- `drill`: `git worktree add --detach "$RUNNER_TEMP/base" origin/main`; build `amc-studio:drill-a` there and `amc-studio:drill-b` from the head; `node scripts/deploy/rollback-drill.mjs --image-a amc-studio:drill-a --image-b amc-studio:drill-b --secrets-dir <tmp> --out tmp/deploy-pack/rollback-drill.json`.

Expected from the local runs: `static` and `kind` green. `drill` stays red at `probe-a` until `origin/main` carries the verify fix, because image A is built from main. The workflow's actions are not pinned by commit SHA and its tool archives are checked against the publishers' checksum files, not pinned literals; both are marked `TODO(P0-14 follow-up)` in the file.

## Not run here

- The `docker-smoke` and `security-scan-lite` steps of `ci.yml` on `origin/main` and on the slice (landing runbook section 8). The `helm-lint-template` checks are covered by `deploy-pack-check.mjs`, which ran `helm lint` and the renders.
- The compose `verify` profile. Its `amc-verify` service passes no pairing code and no monitor pin, so it would fail at login.
- Any non-local cluster, any registry push and any real-model call. The verifier's turn used a loopback stub upstream.

## Follow-ups (not fixed here)

- `amc lease issue` can leave an unsigned revocation store that blocks every later lease. `signLeaseRevocations` writes the default store (`src/leases/leaseStore.ts:44`) before it asks for the auditor key (`src/leases/leaseStore.ts:47`); with the vault locked the signing throws and the unsigned file stays. `ensureLeaseRevocationStore` then refuses it (`src/leases/leaseCli.ts:114`), and `amc lease issue` fails with "Lease revocation signature invalid" (`src/cli-lease-commands.ts:40`) until an owner runs `amc lease resign-revocations`. Seen on 2026-10-11 when a first `amc lease issue` ran without `AMC_VAULT_PASSPHRASE`.
- Pin the workflow's actions by commit SHA and its tool archives by sha256 literal.
- A gateway stopped without a graceful shutdown (`docker rm -f`) leaves its session unsealed for good; every later prefix verdict names it.
- The compose `verify` profile needs a pairing code and a monitor pin.

## Needs a human (skipped)

- Sid: record, dated, whether any environment ever ran chart 0.1.0 with its default Secret (P0-37 relies on it), and write the remediation text left as a TODO in `docs/KUBERNETES_HELM_DEPLOYMENT.md` ("Upgrading from chart 0.1.0").
- Sid: approve the GitHub Actions and tool downloads the workflow uses, and the SHAs and checksums that replace its TODOs.
- D-03 follow-through: the `ghcr.io/your-org` image namespace in the docs.

## Reproduce

From the worktree root on a machine with the tools above: `node scripts/deploy/deploy-pack-check.mjs --json --require-tools`, then the `run:` blocks of `.github/workflows/deploy-pack.yml` in order. Never echo the generated secrets; the steps write them to files with `umask 077` and remove them on exit.
