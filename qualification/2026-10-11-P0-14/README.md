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
| `deploy-pack-check.mjs --json --require-tools` | `7f98c42fe` | passed (helm lint, renders, kubeconform; nothing skipped) | `static/deploy-pack-check.json` |
| S1 and S2 vitest files (15 files) | `7f98c42fe` | 89 passed of 89 (the receipt's `tests`) | none |
| Four negative renders and no `kind: Secret` in the default render | `7f98c42fe` | all five checks pass: each render refused with its reason, default render has no Secret | `static/negative-renders.txt` |
| The same step against chart 0.1.0 (`int`) | `7f98c42fe` | fails as required: 4 renders accepted, default render contains `kind: Secret` | `static/negative-renders-against-chart-0.1.0.txt` |
| Kind: install, pair, test, upgrade, rollback to 1, pair, test | `7f98c42fe` | **failed**: install, upgrade, rollback and both pairings exit 0; both `helm test` runs exit 1 at the probe's `verify` step | `kind/helm-lifecycle.json`, `kind/helm-lifecycle.log` |
| `deploy-verify.mjs` against the kind release | `5a2b84756` (clean tree) | passed: 5 of 5 checks, `llm_response` receipt verified against the pinned monitor key | `kind/deploy-verify.json` |
| Rollback drill, image A from `origin/main` (`691a041dc`), image B from the head | `7f98c42fe` | **failed**: `deploy-a` passed; `probe-a` failed at `verify`; the B swap and rollback did not run | `drill/rollback-drill.json` |
| Mutations M1 to M10 | `5a2b84756` | 10 of 10 killed, restored green | `mutations.json` |

Between `7f98c42fe` and `5a2b84756` only docs, the changeset and the verifier step's stub line changed (`git diff --stat 7f98c42fe 5a2b84756 -- scripts deploy docker Dockerfile src package.json` is empty).

### Why `helm test` and the drill fail at `verify`

Both probes reach Studio, claim a pairing code, log in, run one stub-provider native task to `idle` and call `/verify`, which answers `failed`: "Cold native verification refused this evidence. Other live workspace sessions can also prevent complete-ledger verification". In the kind pod, `amc agent-loop verify <native session> --json --allow-unanchored` (vault unlocked inside the pod) reports one ledger error for both native sessions, `Session d2cab7c9-… missing seal`. That session is the gateway's (`runtime: gateway`), which Studio keeps open while it runs. The monitor key was also `not-pinned`, so even an intact ledger would give `failed` (untrusted) unless the operator's trust list or `AMC_EXPECTED_MONITOR_FINGERPRINT` admits it. Studio now reports only `failed`, `not-verified` or `externally-anchored`; the probe's other accepted value, `workspace-key-consistency`, is not produced at this revision. This is a product behaviour of `src/studio/nativeTaskService.ts` and `verifyAgentRun`, outside P0-14's touch scope. No assertion was weakened to make these runs pass.

### Defects the real runs found, fixed in this slice

1. The kind install failed (`RunContainerError`): the image's `/var/run` is a symlink to `/run`, so the service-account token mount point lay inside the read-only `/run/secrets` mount. Pods no longer automount the token (`6fede779b`). main's chart has the same mount.
2. The drill's probe tried `/healthz` once, before Studio listened. The ready window now covers `/healthz` (`ff8566142`).
3. Every deploy CLI compared the unresolved `argv[1]` with `import.meta.url`. Started through a symlink, as a ConfigMap mount starts the Helm test probe, it ran nothing and exited 0. A first kind run recorded a `helm test` "pass" that ran no probe; that result is void and is not used here. Guards now compare realpaths (`1ef317199`).
4. LAN mode (the image and chart default) refuses login without a one-time pairing code. The probe claims one (`--pairing-code-file`), the Helm test mounts the optional Secret `<fullname>-test-pairing`, the drill mints one inside each container, and the workflow mints one before each `helm test` (`1ef317199`).
5. Secret temp dirs were left behind when a step failed; the workflow now cleans up in `EXIT` traps (`3596d3f00`). The verifier's stub upstream now exits by itself (`5a2b84756`).

## Mutations (`mutations.json`)

| Id | Mutation | Test file | Result |
|---|---|---|---|
| M1 | delete the `secret.yaml` if-wrapper | `tests/helmChartSecrets.test.ts` | 2 failed, restored green |
| M2 | `amc.bootstrapValue` uses the bare value, not `required` | `tests/helmChartSecrets.test.ts` | 1 failed, restored green |
| M3 | remove the ConfigMap `AMC_CORS_ALLOWED_ORIGINS` line | `tests/helmChartOrigins.test.ts` | 1 failed, restored green |
| M4 | drop the drill's `AMC_CORS_ALLOWED_ORIGINS` env | `tests/rollbackDrill.test.ts` | 1 failed, restored green |
| M5 | `buildReport` prints `value: env[name]` | `tests/credentialPresence.test.ts` | 2 failed, restored green |
| M6 | delete "wait for an explicit yes" under B4 | `tests/deploymentConfirmationRunbook.test.ts` | 1 failed, restored green |
| M7 | drop `automountServiceAccountToken: false` (P0-14 guard) | `tests/helmChartSecrets.test.ts` | 1 failed, restored green |
| M8 | `deploy-verify.mjs` compares the unresolved `argv[1]` (P0-14 guard) | `tests/deployPackCheck.test.ts` | 1 failed, restored green |
| M9 | the probe skips the pairing claim (P0-14 guard) | `tests/deployPackProbe.test.ts` | 2 failed, restored green |
| M10 | the probe tries `/healthz` once (P0-14 guard) | `tests/deployPackProbe.test.ts` | 2 failed, restored green |

M1 to M6 are the spec's six; they were also run once right after the picks (all killed). M9 and M10 edit only `scripts/deploy/governed-turn-probe.mjs`, so the byte-identity test with the chart copy fails too; the behaviour test fails in each.

## Pending CI (`pending-ci`, not passed)

Nothing below has run in GitHub Actions. After a push, the pull request runs `.github/workflows/deploy-pack.yml`:

- `static`: `pnpm install --frozen-lockfile`; tool install with checksum checks; `node scripts/deploy/deploy-pack-check.mjs --json --require-tools`; the 15 S1 and S2 test files; the negative-render step.
- `kind`: `kind create cluster --name amc-ci --wait 180s`; `docker build -t amc-studio:ci .`; `kind load docker-image amc-studio:ci --name amc-ci`; random `amc-bootstrap`; `helm install amc deploy/helm/amc --set image.repository=amc-studio --set image.tag=ci --wait --timeout 10m`; pair; `helm test amc --logs --timeout 10m`; `helm upgrade amc deploy/helm/amc --reuse-values --set resources.requests.cpu=250m --wait --timeout 10m`; `helm rollback amc 1 --wait --timeout 10m`; pair; `helm test amc --logs --timeout 10m`; `node scripts/deploy-verify.mjs --target http://127.0.0.1:13212 --gateway http://127.0.0.1:13210 --monitor-pubkey <pinned> --route /local --model gpt-test --lease-file <minted> --out tmp/deploy-pack/deploy-verify.json`.
- `drill`: `git worktree add --detach "$RUNNER_TEMP/base" origin/main`; build `amc-studio:drill-a` there and `amc-studio:drill-b` from the head; `node scripts/deploy/rollback-drill.mjs --image-a amc-studio:drill-a --image-b amc-studio:drill-b --secrets-dir <tmp> --out tmp/deploy-pack/rollback-drill.json`.

Expected from the local runs: `static` green; `kind` red at both `helm test` runs; `drill` red at `probe-a`. The workflow's actions are not pinned by commit SHA and its tool archives are checked against the publishers' checksum files, not pinned literals; both are marked `TODO(P0-14 follow-up)` in the file.

## Not run here

- The `docker-smoke` and `security-scan-lite` steps of `ci.yml` on `origin/main` and on the slice (landing runbook section 8). The `helm-lint-template` checks are covered by `deploy-pack-check.mjs`, which ran `helm lint` and the renders.
- The compose `verify` profile. Its `amc-verify` service passes no pairing code, so it would fail at login.
- Any non-local cluster, any registry push and any real-model call.

## Needs a human (skipped)

- Sid: record, dated, whether any environment ever ran chart 0.1.0 with its default Secret (P0-37 relies on it), and write the remediation text left as a TODO in `docs/KUBERNETES_HELM_DEPLOYMENT.md` ("Upgrading from chart 0.1.0").
- Sid: approve the GitHub Actions and tool downloads the workflow uses, and the SHAs and checksums that replace its TODOs.
- D-03 follow-through: the `ghcr.io/your-org` image namespace in the docs.

## Reproduce

From the worktree root on a machine with the tools above: `node scripts/deploy/deploy-pack-check.mjs --json --require-tools`, then the `run:` blocks of `.github/workflows/deploy-pack.yml` in order. Never echo the generated secrets; the steps write them to files with `umask 077` and remove them on exit.
