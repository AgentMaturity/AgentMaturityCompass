# Track S1 — worker report (backfilled by the root session from the structured return; the harness refused the subagent's .md write)

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