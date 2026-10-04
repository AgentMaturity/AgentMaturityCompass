# Track S1 — deployment pack, round 3 (native origin/host admission)

- Status: **PARTIAL**. The monitor's round-3 fixes A–E are in. Helm render/test, kubeconform, the docker drill and the compose verify run stay blocked: binary absent / daemon down, tool install not authorized (root-decisions.md).
- Branch `worktree-wf_5210e2f4-3ea-1`, round-2 head `33655e6c`, round-3 code commit `cdab568c`, followed by the receipt commit.
- Environment: macOS Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0. helm, kubectl, kubeconform and pulumi absent; Docker daemon down.

## Defect (verify/reverify-S1.json)

Studio admits native requests only when the `Host` matches an origin in `AMC_CORS_ALLOWED_ORIGINS` or the bind host (`src/studio/nativeAdmission.ts`). The chart, the drill and compose all ran Studio with `--bind 0.0.0.0` and no `AMC_CORS_ALLOWED_ORIGINS`. The allowed list was therefore `[http://0.0.0.0:3212]`, and the probe's first native request (`GET /api/v1/native-tasks/options`) was refused with `NATIVE_HOST_DENIED` from `<release>-amc:3212` (helm test pod), `127.0.0.1:<port>` (drill) and `amc-studio:3212` (compose `amc-verify`). Round 2 listed this as unverified. It could have been checked offline, and it failed.

## Fixes

- **A, chart.** `_helpers.tpl` gains `amc.studioServiceOrigin` (`http://<fullname>:<service.port>`) and `amc.corsAllowedOrigins`. The second joins the Service origin with `env.AMC_CORS_ALLOWED_ORIGINS`, a new values key that defaults to `""`, using `compact`. `configmap.yaml` renders `AMC_CORS_ALLOWED_ORIGINS` from that helper. The test pod's `--base-url` now uses `amc.studioServiceOrigin` too, so the two can't drift apart. New `tests/helmChartOrigins.test.ts` has 3 tests:
  - the template wiring
  - the rendered value `http://amc-amc:3212` is fed to Studio's own `nativeAllowedBrowserOrigins("0.0.0.0", 3212, extra)` and `assertNativeBrowserAdmission`. With it, a GET with Host `amc-amc:3212` and a POST with Origin, intent and CSRF are admitted. Without it, the GET throws `NATIVE_HOST_DENIED`.
  - an operator origin is appended, not substituted
- **B, drill.** `rollback-drill.mjs` docker run adds `-e AMC_CORS_ALLOWED_ORIGINS=http://127.0.0.1:${port}`. `tests/rollbackDrill.test.ts` asserts the entry for ports 3212 and 4412.
- **C, compose.** `docker/docker-compose.yml` amc-studio adds `AMC_CORS_ALLOWED_ORIGINS=http://amc-studio:3212`. The existing compose assertion in `tests/deployPackProbe.test.ts` now parses the `amc-verify` `--base-url` from the file and requires that same value in the amc-studio environment.
- **D, docs.** `docs/KUBERNETES_HELM_DEPLOYMENT.md` changes in three places:
  - The helm test section states the admission mechanism and the rendered value. It also says to put an Ingress host in `env.AMC_CORS_ALLOWED_ORIGINS`.
  - The drill section states the run env and that `--secrets-dir` is required. This answers the monitor's open item by documenting the requirement, not by changing the drill.
  - "What was exercised" says the admitted path was proven with a unit test against `src/studio/nativeAdmission.ts`, not in a cluster, a compose run or a drill run.

  `pnpm check:docs-drift`: passed, 327 files scanned.

## Commands (round 3)

| Command | Result |
|---|---|
| `pnpm vitest run tests/helmChartOrigins.test.ts tests/rollbackDrill.test.ts tests/deployPackProbe.test.ts` before the fix (`red-r3.log`) | 3 failed, 9 passed (12) |
| Same 3 files after the fix | 12 passed |
| 10-file focused run (`green-r3.log`): helmChartOrigins, helmChartVersion, helmChartSecrets, k8sManifestsSecrets, deployPackCheck, deployPackProbe, rollbackDrill, deploymentPack, pulumiHelmRelease, containerSourceBuild | 10 files, 58 tests passed |
| `node scripts/deploy/deploy-pack-check.mjs --json` (`deploy-pack-check-r3.log`) | `passed`; helm and kubeconform skipped (binary absent); exit 0 |
| `node scripts/deploy/rollback-drill.mjs ...` (`rollback-drill-r3.log`) | without `--secrets-dir`: exit 2, `--secrets-dir is required`. With an empty scratch dir: exit 2, `docker daemon unavailable` |
| `pnpm typecheck`; `pnpm typecheck:tests` | exit 0; exit 0 |
| Path discipline (`path-discipline-r3.log`) | 57 paths checked: 0 outside the claimed globs, 0 of the 306 dirty-list entries, 0 in package.json, pnpm-lock.yaml or src/** |

## Mutation checks (round 3, `mutations-r3.json`)

| Id | Mutation | RED | Restored |
|---|---|---|---|
| M-R3-A1 | configmap `AMC_CORS_ALLOWED_ORIGINS` line removed | helmChartOrigins 1 failed, 2 passed | 3 passed |
| M-R3-A2 | helper drops the Service origin from the list | helmChartOrigins 1 failed, 2 passed | 3 passed |
| M-R3-A3 | test pod `--base-url` no longer uses the helper | helmChartOrigins 1 failed, 2 passed | 3 passed |
| M-R3-B | drill docker run env entry removed | rollbackDrill 1 failed, 4 passed | 5 passed |
| M-R3-C | compose amc-studio env line removed | deployPackProbe 1 failed, 3 passed | 4 passed |

## Not exercised (round 3)

- Helm did not render the value; the test computes it from the template expression (`helm` absent).
- Studio was not started; admission was checked by calling `src/studio/nativeAdmission.ts` directly.
- Drill execution, the compose verify run, kubeconform and any cluster (Docker daemon down; tools not installed).
- Planner scope not delivered (unchanged): quickstart SHA256SUMS verification, `scripts/deploy/record-image-digest.mjs`, the kubeconform step in `.github/workflows/docker-build.yml`.

# Round 2 report (superseded where round 3 differs)


- Status: **PARTIAL**. Every monitor fix is in. Helm render, kubeconform and the docker drill are still blocked: binary absent / daemon down, and tool install is not authorized (root-decisions.md).
- Branch `worktree-wf_5210e2f4-3ea-1`, base `8f57ce63`, round-2 code commit `903c19fe`, followed by the receipt commit.
- Environment: macOS Darwin 25.6.0 arm64, Node v25.5.0, Terraform v1.14.4. helm, kubectl, kustomize, kubeconform, pulumi and the docker compose plugin are not installed. The Docker daemon is not running.

## Monitor fixes

1. `tests/deploymentPack.test.ts` is back to its 8f57ce63 content: `git diff 8f57ce63 HEAD` on that file is empty, and the test passes. `templates/secret.yaml` is restored and wrapped in `{{- if .Values.bootstrap.createSecret }}`, which defaults to `false` in `values.yaml`. Each of the five values goes through the `amc.bootstrapValue` helper in `_helpers.tpl`. The helper applies `required` and calls `fail` on a `change-me` prefix (case-insensitive). The Secret carries `helm.sh/resource-policy: keep`. The new `values.schema.json` rejects `^change-?me` bootstrap values. With `image.requireDigest` set, it also requires `image.digest` to match `^sha256:[a-f0-9]{64}$`. Deleting the if-wrapper turns `tests/helmChartSecrets.test.ts` RED (M-R1).
2. `tests/deployAssets.test.ts` is split into claimed names: `tests/helmChartVersion.test.ts`, `tests/helmChartSecrets.test.ts`, `tests/k8sManifestsSecrets.test.ts` and `tests/deployPackCheck.test.ts`. New files are `tests/deployPackProbe.test.ts`, `tests/rollbackDrill.test.ts` and `tests/helpers/deployPackFixtures.ts`. In `git diff --name-only 8f57ce63..HEAD`, no tests/ path falls outside the claimed globs (`path-discipline-r2.log`).
3. Image digest. `image.digest` and `image.requireDigest` are in `values.yaml`. Both containers in `deployment.yaml`, and the test pod, render `repository@digest` when a digest is set and `repository:tag` otherwise. A template `fail` refuses `requireDigest` without a digest. Terraform has `image_digest`, with a validation regex, passed to `image.digest`. Pulumi has `imageDigest`, which is validated and passed through. The tests are static template assertions plus Ajv. **Helm rendering was not exercised** because helm is absent.
4. `scripts/deploy/deploy-pack-check.mjs` supports `--json` and `--require-tools` and reuses `validate-assets.mjs`. When helm is present, `validate-assets.mjs` now also runs `helm lint` and refuses these renders: createSecret without values, a change-me value, requireDigest without a digest, and replicaCount=2. It also checks that a digest renders as repository@digest. On this host the check prints `passed helm:binary absent,kubeconform:binary absent`, and `--require-tools` exits 1.
5. `scripts/deploy/governed-turn-probe.mjs` is plain Node with no dependencies. It follows the existing contract:
   - check `/healthz` and `/readyz`
   - `POST /auth/login`, then read the native CSRF token from `/auth/me`
   - `GET /api/v1/native-tasks/options`: execution must not be blocked and `stub` must be admitted
   - `POST /api/v1/native-tasks` with `{provider:"stub", tools:"none"}`, sending `x-amc-native-intent: task-workspace-v1`, the CSRF header and Origin (docs/NATIVE_STUDIO_TASKS.md:98)
   - poll until the task is `idle`
   - `POST /:taskId/verify`; a pass needs `workspace-key-consistency` or `externally-anchored`

   Against a stub that answers 200 on `/healthz` and `/readyz` and 503 on `/api/v1/native-tasks*`, the probe returns `failed` and the CLI exits 1. In mutation M-R8 the probe returns verified right after a 2xx `/readyz`; 3 tests go RED. The probe is wired into `templates/tests/governed-turn.yaml`: a ConfigMap and Pod with `helm.sh/hook: test`, using the chart image and the read-only owner credentials. The chart copy `files/governed-turn-probe.mjs` is byte-identical to the script, and a test enforces this. `networkpolicy.yaml` admits the test pod on the Studio port by its component label. The script is also wired into `docker/docker-compose.yml` as the `amc-verify` service under the `verify` profile.
6. `scripts/deploy/rollback-drill.mjs`:
   - preflight: `docker info`; resolve both image ids, which must match `/^sha256:[a-f0-9]{64}$/`
   - six steps: `deploy-a`, `probe-a`, `upgrade-b`, `probe-b`, `rollback-a` (by sha256 id) and `probe-after-rollback`, all on one volume
   - fails closed: a failed step fails the drill and skips the remaining steps
   - output: a JSON receipt with both ids and every step's status
   - without a daemon: exits 2 with `docker daemon unavailable`

   `tests/rollbackDrill.test.ts` uses an injected docker runner and covers step order, 'refuses non-digest ids', 'fails closed on probe failure' and the unavailable daemon. **The drill was not executed on this host because the daemon is down.** The CLI exited 2 (`rollback-drill-r2.log`).
7. The boundary paragraph in `docs/KUBERNETES_HELM_DEPLOYMENT.md` ("What was exercised") now cites official pages, retrieved 2026-10-03:
   - kubernetes.io Deployments: selector immutability, `rollout undo --to-revision`, revisionHistoryLimit, Recreate
   - kubernetes.io Persistent Volumes: no PVC shrink
   - helm.sh tips: resource-policy keep
   - helm.sh chart tests
   - helm.sh charts schema files
   - kubernetes.io Images: digest

   It also states that immutability of `accessModes`, `storageClassName` and `volumeName` on a bound claim was **not** re-verified.
8. `result.json` lists the items that are still blocked, with the reason `binary absent / daemon down — tool install not authorized (root-decisions.md)`: helm render/lint/test, kubeconform, drill execution and the compose verify run.

## Commands (round 2)
- `pnpm vitest run` on 9 files (`tests/helmChartVersion.test.ts`, `tests/helmChartSecrets.test.ts`, `tests/k8sManifestsSecrets.test.ts`, `tests/deployPackCheck.test.ts`, `tests/deployPackProbe.test.ts`, `tests/rollbackDrill.test.ts`, `tests/deploymentPack.test.ts`, `tests/pulumiHelmRelease.test.ts`, `tests/containerSourceBuild.test.ts`) gave 9 files and 54 tests passed (`green-r2.log`).
- `pnpm typecheck:tests` exited 0. `pnpm check:docs-drift` passed (327 files). `terraform fmt -check -recursive deploy/terraform` exited 0.
- `node scripts/deploy/deploy-pack-check.mjs --json` printed `passed helm:binary absent,kubeconform:binary absent`. With `--require-tools` it exited 1 (`deploy-pack-check-r2.log`).
- `node scripts/deploy/rollback-drill.mjs ...` exited 2 with `docker daemon unavailable` (`rollback-drill-r2.log`).
- Path discipline: 0 intersections with codex-dirty-paths.json (306 entries) and with codex-dirty-root-20261003.txt. No hard-forbidden path was touched. No tests/ path is outside the claimed globs.

## Mutation checks (round 2, `mutations-r2.json`)

Each mutation was applied, run RED, reverted with `git checkout`, and run GREEN again.

- M-R1: deleting the secret.yaml if-wrapper → 2 failed ('default render must contain no Secret', 'finds no literal secret').
- M-R2: replacing `required` in the helper with the bare value → 1 failed ('createSecret without values must refuse').
- M-R3: removing the schema change-me pattern → 1 failed ('schema rejects change-me').
- M-R4: removing the schema requireDigest→digest dependency → 1 failed ('requireDigest without digest refuses').
- M-R5: always rendering repository:tag → 1 failed ('digest renders repository@digest').
- M-R6: making the drill accept any id → 1 failed ('refuses non-digest ids').
- M-R7: marking the drill passed after a failed probe → 1 failed ('fails closed on probe failure').
- M-R8: probe returns verified after a 2xx /readyz → 3 failed (including 'liveness-only server is not verified').
- M-R9: renaming a k8s secret.example key → 1 failed.
- M-R10: dropping the `--require-tools` failure → 1 failed.

Round-1 guards were re-verified against the split files (`mutations-r1-recheck.json`): appVersion, values literal secret, k8s Recreate and the readiness path. Each went RED and then GREEN again.

## Not exercised
- `helm template`, `helm lint`, schema validation by Helm itself, and `helm test`. helm is absent. The schema was checked with Ajv; the templates were checked as text.
- kubeconform (absent).
- The docker rollback drill and the compose `verify` profile: the daemon is down and the compose plugin is absent. The governed-turn probe ran only against stub HTTP servers, never against a real Studio.
- Whether Studio's Origin check accepts `http://<release>-amc:3212` from the test pod. The probe sends Origin equal to its base URL and Host. This was not exercised in a cluster.
- terraform validate/plan, because init downloads providers. Pulumi is not installed.

## Not delivered (planner scope, outside the monitor's fix list)
- SHA256SUMS verification in `docker/Dockerfile.quickstart`.
- `scripts/deploy/record-image-digest.mjs`.
- A kubeconform step in `.github/workflows/docker-build.yml`.

## Ready to wire (root session; package.json and ci.yml are forbidden here)
- `package.json` scripts:
  - `"check:deploy-pack": "node scripts/deploy/deploy-pack-check.mjs"`
  - `"deploy:rollback-drill": "node scripts/deploy/rollback-drill.mjs"`
- CI: after pinned `azure/setup-helm` and kubeconform installs, run `node scripts/deploy/deploy-pack-check.mjs --require-tools` (with `AMC_KUBECONFORM_SCHEMA_LOCATION` for offline schemas).

## Blockers / escalations
- **SECURITY** (pre-existing at 8f57ce63, owner decision): chart 0.1.0 rendered `amc-bootstrap` with literal `change-me-*` values, so any workspace bootstrapped by a plain `helm install` used a published vault passphrase. There is no `amc vault` passphrase-change command at this revision. The exposure and the upgrade step are documented in docs/KUBERNETES_HELM_DEPLOYMENT.md, "Upgrading from chart 0.1.0".
- Tool installs (helm, kubeconform, Docker daemon) are not authorized (root-decisions.md). The acceptance items above stay blocked until Sid approves them or CI runs them.
- The round-1 blocker "the governed-turn probe needs a new Studio endpoint" was wrong (the monitor refuted it). The probe uses the existing native-task routes.

---

# Round 1 report (superseded where round 2 differs)


- Status (self-report): **PARTIAL**
- Branch: `worktree-wf_5210e2f4-3ea-1`; HEAD before `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` → after `1cc80aab414d983c0245523606580d62b5794750`
- Environment: macOS Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, Terraform v1.14.4, Go 1.25.6; helm/kubectl/kustomize/kubeconform/pulumi not installed; Docker daemon not running; base 8f57ce63, final HEAD 1cc80aab
- Receipt path (as reported): /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_5210e2f4-3ea-1/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S1/result.json

## Commits
- e05bcb7d fix: keep default secrets out of the deployment pack and align chart with 1.2.0
- a0ed68d0 docs: document offline validation, probes, secret creation and rollback for Kubernetes
- 3ca024d0 fix: flag Secret removal as an upgrade hazard and document the chart 0.1.0 upgrade
- 1cc80aab docs: add S1 deployment-pack receipt logs and result

## Files changed
- `deploy/helm/amc/Chart.yaml`
- `deploy/helm/amc/templates/secret.yaml (deleted)`
- `deploy/helm/amc/templates/deployment.yaml`
- `deploy/helm/amc/examples/values-persistent-bootstrap.yaml`
- `deploy/helm/amc/README.md`
- `deploy/k8s/deployment.yaml`
- `deploy/k8s/secret.example.yaml`
- `deploy/k8s/README.md`
- `deploy/terraform/helm-release/variables.tf`
- `deploy/terraform/helm-release/terraform.tfvars.example`
- `deploy/terraform/helm-release/README.md`
- `deploy/pulumi/helm-release/index.ts`
- `deploy/pulumi/helm-release/README.md`
- `docs/KUBERNETES_HELM_DEPLOYMENT.md`
- `scripts/deploy/validate-assets.mjs (new, 244 lines)`
- `scripts/deploy/rollback-check.mjs (new, ~122 lines)`
- `tests/deployAssets.test.ts (new, ~109 lines)`
- `tests/deploymentPack.test.ts`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S1/{result.json,mutations.json,red-before-fix.log,validate-before-fix.log,green-after-fix.log,validate-after-fix.log,rollback-check.log}`

## Commands run
- `pnpm vitest run tests/deployAssets.test.ts (before scripts existed)` → RED: import of scripts/deploy/validate-assets.mjs failed
- `pnpm vitest run tests/deployAssets.test.ts tests/deploymentPack.test.ts (scripts present, assets unfixed)` → RED: Test Files 1 failed | 1 passed; Tests 7 failed | 14 passed. The existing deploymentPack suite passed in full on the defective assets, so the existing guard did not cover these cases
- `node scripts/deploy/validate-assets.mjs (assets unfixed)` → exit 1, 10 failures: appVersion 1.1.1 != 1.2.0, duplicate env key in example, chart Secret with change-me values, no startupProbe, not Recreate (helm+k8s), no replicaCount guard, terraform default 2 and tfvars 2
- `pnpm vitest run tests/deploymentPack.test.ts tests/deployAssets.test.ts tests/pulumiHelmRelease.test.ts tests/containerSourceBuild.test.ts` → GREEN: 4 files, 37 tests passed
- `node scripts/deploy/validate-assets.mjs` → exit 0; 'chart amc 0.2.0 appVersion 1.2.0 == package.json 1.2.0'; 5 probe->handler lines; 'helm: not on PATH; chart template rendering NOT exercised'
- `node scripts/deploy/rollback-check.mjs --from 8f57ce63d8331f1bef1c2a18fde82a7e8f4511da --to WORKTREE` → exit 0; k8s 7 -> 7 objects, changed [Deployment/amc-studio]; hazards: 0; helm not rendered
- `node scripts/deploy/rollback-check.mjs --from HEAD / --bogus x` → exit 0 hazards 0 / exit 2 usage
- `terraform fmt -check -recursive deploy/terraform` → exit 0
- `grep -rn "amc-test-passphrase\|changeme\|password:" deploy/helm deploy/k8s docker` → 2 hits, neither a value: docker/README.md:40 (bind-mount path .../amc_owner_password.txt) and docker/docker-compose.yml:54 (compose secret name amc_owner_password: mapping to a file path; name shared with deploy/compose, owned by the other session). No hit in any rendered or committed manifest value
- `scratch Go text/template renderer (scratchpad/s1-helmlite, not committed) over the chart: defaults + 3 example values files, then --set replicaCount=2` → all 4 rendered and strict-parsed with 0 YAML errors, 0 Secret objects, no change-me, Recreate, replicas 1, 3 or 5 projected secret refs; replicaCount=2 exit 1 with fail message. This approximates Helm and is not Helm

## Typecheck
pnpm typecheck: exit 0. pnpm typecheck:tests: exit 0, 0 'error TS'.

## Acceptance self-report
- [x] validate-assets exits 0 and prints chart version equal to package.json — `node scripts/deploy/validate-assets.mjs` → exit 0; 'chart amc 0.2.0 appVersion 1.2.0 == package.json 1.2.0'
- [x] focused vitest files pass — `pnpm vitest run tests/deploymentPack.test.ts tests/deployAssets.test.ts` → all passed (the 4-file run including pulumiHelmRelease and containerSourceBuild: 37/37)
- [x] no literal/default secret in rendered or committed manifests — `grep -rn "amc-test-passphrase\|changeme\|password:" deploy/helm deploy/k8s docker` → 2 non-value hits: docker/README.md:40 (mount path) and docker/docker-compose.yml:54 (compose secret name). Chart Secret template with change-me values deleted. The validator scans values, templates, raw manifests and docker assets
- [ ] helm template renders; probes reference endpoints that exist in src — `helm template deploy/helm/amc` → helm NOT installed, so not run. Probe handlers cited: studio /healthz src/studio/studioServer.ts:1729 (payload src/api/health.ts:12); studio /readyz src/studio/studioServer.ts:1768 (buildReadiness :568); notary /healthz src/notary/notaryServer.ts:144; notary /readyz src/notary/notaryServer.ts:149. A scratch text/template approximation rendered all variants cleanly
- [x] typecheck — `pnpm typecheck && pnpm typecheck:tests` → both exit 0
- [x] worktree clean — `git status --porcelain` → empty after commit 1cc80aab

## Mutation checks
- deployAssets: Helm chart appVersion equals package.json version — mutation: Chart.yaml appVersion -> "9.9.9" — RED: exit 1, 1 failed | 9 skipped — restored: exit 0, 1 passed | 9 skipped
- deployAssets: finds no literal secret (findSecretLiterals) — mutation: values.yaml env default AMC_VAULT_PASSPHRASE: "s3cret-default-passphrase" injected — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: finds no literal secret — mutation: templates/secret.yaml re-added with change-me-vault-passphrase — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: single-writer — mutation: k8s Deployment strategy -> RollingUpdate — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: single-writer — mutation: Helm replicaCount fail guard replaced with printf — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: probes target endpoints in src — mutation: Helm readiness path /readyz -> /ready — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: probes target endpoints in src — mutation: Helm liveness path /healthz -> /readyz — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: raw k8s secret example matches mounted secret — mutation: secret.example.yaml name -> amc-bootstrap-secrets — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: rollback hazards — mutation: rollbackHazards selector check disabled (if (false && ...)) — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: single-writer — mutation: terraform replica_count default -> 2 — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: every Helm example values file parses — mutation: duplicate env: key re-added to values-persistent-bootstrap.yaml — RED: exit 1, 1 failed — restored: exit 0, 1 passed
- deployAssets: rollback hazards (Secret removal) — mutation: Secret-removal branch disabled — RED: 1 failed | 9 skipped — restored: 1 passed | 9 skipped

## Sources


## Not exercised
- helm template / helm lint, and the helm branches of validate-assets.mjs (helmRender, checkHelmRender incl. replicaCount=2 refusal) and rollback-check.mjs: helm not installed. Only a scratch Go text/template approximation was run, which is not Helm
- Kubernetes API schema validation (kubeconform-style): no tool or schema installed and nothing downloaded. Checks are structural only (strict YAML, required fields)
- kubectl kustomize/apply -k, and any cluster install, upgrade, helm rollback or kubectl rollout undo. The guide's procedure is documented, not executed
- terraform validate/plan (init downloads providers). Only terraform fmt -check ran. Pulumi not installed
- Docker quickstart image build (no daemon)
- Whether Studio writes $HOME under readOnlyRootFilesystem in Kubernetes: the Docker README mounts a /home/amc tmpfs, while the Helm and raw manifests mount only /tmp. Unknown
- A governed-turn health check: /readyz proves signed-policy trust + ledger reachability + workspace writable, not a completed governed turn; the gateway port 3210 is not probed
- website/publication-status.json githubRelease=1.1.1 (asOf 2026-09-29) is quoted from that file, not re-measured; the quickstart pin is checked against it

## Blockers
- SECURITY (escalate): chart 0.1.0 (templates/secret.yaml at 8f57ce63) always rendered amc-bootstrap with vaultPassphrase 'change-me-vault-passphrase'. Any workspace bootstrapped by a plain helm install used a published passphrase. The amc vault subcommands at this revision are forget/init/unlock/lock/status (src/cli.ts:7024, 11623-11652); there is no passphrase-change command, so remediation is an open owner decision. The guide documents the exposure and the upgrade step (kubectl annotate secret amc-bootstrap helm.sh/resource-policy=keep) without claiming a fix
- Governed-turn probe needs a new Studio endpoint in src/studio/studioServer.ts (forbidden for this track). Design unspecified (auth, turn, provider), so no diff is proposed
- helm not installed: Helm render acceptance cannot be met in this environment; the ready-to-wire CI diff below would exercise it
- Other session's paths still describe the old flow: docs/DEPLOYMENT.md:47-59 and docs/INSTALL.md:130-143 (helm install without creating amc-bootstrap first; with chart 0.2.0 the pod waits for the secret instead of booting with change-me values). .github/workflows/ci.yml does not run validate-assets.mjs
- Receipt report.md could not be written: the subagent harness refused report .md files. Full report content is in notesForMonitor; result.json, mutations.json and run logs are committed in the receipt dir

## Ready-to-wire diff
```
--- .github/workflows/ci.yml (other session; NOT applied)
   helm-lint-template:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v6
 
+      - uses: pnpm/action-setup@v4
+        with:
+          version: 10.33.0
+
+      - uses: actions/setup-node@v6
+        with:
+          node-version: "24"
+          cache: pnpm
+
+      - run: pnpm install --frozen-lockfile
+
       - name: Set up Helm
         uses: azure/setup-helm@v5
 
       - name: Helm lint/template
         run: |
+          node scripts/deploy/validate-assets.mjs
           helm lint ./deploy/helm/amc
(With helm on PATH this also exercises the render branch: defaults + each example strict-parsed and secret-scanned, and replicaCount=2 must be refused.)
```

## Notes for monitor
REPORT (report.md was refused by the harness, so its content is here).

DEFECTS at 8f57ce63:
- D1 Chart.yaml:6 appVersion "1.1.1" vs package.json 1.2.0.
- D2 templates/secret.yaml rendered Secret amc-bootstrap with literal change-me-* values for all 5 keys. It used the same name the guide tells operators to kubectl-create (a conflict), and a plain install boots the vault with a public passphrase.
- D3 examples/values-persistent-bootstrap.yaml had a duplicate `env:` key (lines 22 and 30). It fails a strict parse; last-wins drops two keys.
- D4 Rolling updates overlapped two pods on one single-writer workspace (k8s maxSurge 1/maxUnavailable 0; Helm default). There is no workspace lock in src/studio/studioSupervisor.ts; src/ledger/ledgerConnection.ts:42-44 sets only WAL/busy_timeout.
- D5 Terraform replica_count default 2 (variables.tf:58) and tfvars example 2.
- D6 Raw Deployment mounted Secret amc-secrets with snake_case keys, while secret.example.yaml was amc-bootstrap-secrets with camelCase keys and no notaryPassphrase.
- D7 Helm had no startupProbe; bootstrap runs in-container before listen.
- D8 Helm secret volume ignored the per-ref secret names and always required the notary keys.
- D9 Duplicate pod-template labels (name/instance) in the Helm Deployment.
- D10 Docs/Pulumi export used deploy/amc and svc/amc, but resources are <release>-amc (amc-amc).

FIXES: Chart 0.2.0 with appVersion 1.2.0 (package.json untouched, equality enforced by script and tests). secret.yaml deleted. In the Helm deployment.yaml: fail unless replicaCount==1 (:1-3), strategy Recreate (:12-14), notary auth env only when notary.enabled (:51-54), startup /healthz (10s x 30), readiness /readyz, liveness /healthz (:63-84), projected volume with one source per {name,key} ref and notary refs conditional (:145-162), duplicate labels removed. Example env merged. k8s deployment: Recreate, secret amc-bootstrap with camelCase keys. secret.example: name amc-bootstrap, notaryPassphrase added, all REPLACE_WITH_. Terraform defaults to 1. Pulumi port-forward uses svc/<release>-amc. Docs: offline validation, probe table with handlers, single-writer/Recreate/PDB-drain consequence, --from-file secret creation, verify via curl /healthz version and /readyz, rollback-check usage, Helm and raw rollback procedures, chart 0.1.0 upgrade note (annotate helm.sh/resource-policy=keep; vault exposure), 'what was exercised' boundary.

KEPT: docker/Dockerfile.quickstart AMC_VERSION=1.1.1, because it installs a GitHub release tarball and website/publication-status.json (asOf 2026-09-29, not re-measured) records v1.1.1 as the latest live release. validate-assets enforces quickstart pin == that recorded release. deploy/apparmor was read and needs no change.

SCRIPTS: validate-assets.mjs checks versions, strict YAML, secret literals (values/examples leaf keys ending passphrase|password|secret|token|apikey, templates kind: Secret / change-me / amc-test-passphrase, raw manifests Secret objects and literal secret env, example placeholders, compose env, quickstart ENV/ARG), probe paths resolved to pathname handlers in src (studio -> studioServer.ts, notary -> notaryServer.ts), and single-writer rules. With helm present it renders all variants, strict-parses, and requires replicaCount=2 to be refused. Exit 0/1/2. rollback-check.mjs: git archive of two revisions, renders raw manifests (and the chart if helm is present), diffs, and flags in both directions a Deployment selector change, PVC accessModes/storageClassName/volumeName change, PVC shrink, PVC removed, or Secret removed.

PROBES: studio /healthz src/studio/studioServer.ts:1729 (src/api/health.ts:12, rate-limited 120/min/IP at :1509); studio /readyz :1768 (buildReadiness :568: signed policies, ledger reachable, workspace writable, disk, transparency seal, merkle, plugin integrity, assurance/audit/value/passport gates); notary src/notary/notaryServer.ts:144/:149. None runs a governed turn.

SOURCES: no external sources were used. The Helm/Kubernetes behaviour statements (Helm deletes resources it no longer renders, immutable selector, PVC shrink refused, revisionHistoryLimit for rollout undo) come from general knowledge and were not re-verified against official docs in this run, so they are unverified.

Scratch tooling (not committed): /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/s1-helmlite/{main.go,check.mjs,mutate.mjs}. No .amc/keys changes occurred. The worktree is clean at 1cc80aab.