# Kubernetes and Helm Deployment

This guide is for operators running AMC Studio on an existing Kubernetes cluster. It covers the supported Helm chart, raw Kustomize manifests, and the Terraform and Pulumi Helm-release examples. For provider-specific AWS, GCP, and Azure architecture choices, see `docs/CLOUD_REFERENCE_ARCHITECTURES.md`.

External references checked on 2026-06-16:

- Helm `install` docs: local chart paths, `--values`, `--set`, `--create-namespace`, `--wait`, and `--atomic` deployment behavior.
- Kubernetes probe docs: liveness and readiness probes for container health.
- Terraform Helm provider docs: `helm_release` models a chart release in a Kubernetes cluster and supports local chart paths.
- Pulumi Kubernetes Helm v3 Release docs: `Release` models a Helm release as if created by the Helm CLI and supports local chart paths.
- Pulumi configuration docs: stack config can set keys and Pulumi supports secret config values, but AMC bootstrap secret literals should still stay in a provider secret workflow.

## Prerequisites

- Kubernetes cluster with a working `kubectl` context.
- Helm 3 or 4 installed.
- Pulumi CLI and Node.js installed if using the Pulumi example.
- A built or published AMC image available to the cluster.
- Secret values for vault bootstrap and owner bootstrap.

## Validate the Assets Offline

No cluster access is needed:

```bash
node scripts/deploy/deploy-pack-check.mjs          # static checks, plus helm/kubeconform when installed
node scripts/deploy/deploy-pack-check.mjs --json   # {status, skipped:[{id, reason}], errors, ...}
node scripts/deploy/deploy-pack-check.mjs --require-tools   # CI: a missing helm or kubeconform fails
```

`deploy-pack-check.mjs` runs `validate-assets.mjs` and lists every tool it could not run under `skipped` with reason `binary absent`; it never reports an absent tool as passed. With `helm` installed it also runs `helm lint` and the render checks below. With `kubeconform` installed it validates the raw manifests and the default render with `-strict -summary`; set `AMC_KUBECONFORM_SCHEMA_LOCATION` to a local schema directory for a fully offline run.

`validate-assets.mjs` exits non-zero on drift. It checks that `Chart.yaml` `appVersion` equals the `package.json` version, that the quickstart image pins the published release the hosted installers use (`scripts/lib/published-installer-version.mjs`), that every values file and raw manifest parses without duplicate keys, that no Helm values, template, raw manifest or Docker asset carries a literal or default secret, that every probe path has a handler in the server source, and that the deployment stays single-writer. When `helm` is on `PATH` it also renders the chart with defaults and each example values file, confirms that `--set replicaCount=2`, `--set bootstrap.createSecret=true` without values, a `change-me` bootstrap value and `--set image.requireDigest=true` without a digest are each refused, and that `--set image.digest=sha256:...` renders `repository@digest`. When `helm` is absent it prints that rendering was not exercised.

The chart renders:

- `Deployment` with non-root containers, read-only root filesystem, one replica and `strategy: Recreate`.
- `Service` for Studio, Gateway, and proxy ports.
- `Ingress` when enabled.
- `PersistentVolumeClaim` for the AMC workspace.
- `NetworkPolicy`, `PodDisruptionBudget`, `ServiceAccount` and `ConfigMap`.
- No `Secret` by default. The chart references the bootstrap secret you create. `bootstrap.createSecret=true` renders it from `bootstrap.values`, and then every value is required and any value starting with `change-me` is refused, by the template and by `values.schema.json`. No default passphrase can reach the cluster.
- A `helm test` pod (`templates/tests/governed-turn.yaml`), created only by `helm test`.

Resources are named `<release>-amc`; with release `amc` that is `amc-amc`.

### Probes

| Probe | Path | Handler | What it proves |
|---|---|---|---|
| startup | `GET /healthz` on `studio` | `src/studio/studioServer.ts` (`pathname === "/healthz"`), payload from `buildHealthPayload` in `src/api/health.ts` | Studio answers after `amc bootstrap`. Allows up to 300 seconds before liveness applies. |
| readiness | `GET /readyz` on `studio` | `src/studio/studioServer.ts` (`pathname === "/readyz"`), `buildReadiness` | Signed policies verify, the ledger database answers, the workspace is writable, and the transparency seal and Merkle root are valid. Otherwise it returns 503 with `reasons`. |
| liveness | `GET /healthz` on `studio` | as startup | The process answers. It does not depend on policy trust, so an untrusted policy takes the pod out of service instead of restarting it in a loop. |

The notary sidecar, when enabled, uses `/readyz` and `/healthz` from `src/notary/notaryServer.ts`.

These probes do not run a governed turn. `helm test` does: see [Verify Runtime](#verify-runtime).

### Single writer

The workspace is a SQLite ledger and files on a `ReadWriteOnce` volume, and Studio takes no cross-process workspace lock. The chart therefore refuses any `replicaCount` other than 1. Both the chart and the raw manifests use `strategy: Recreate`, so an update never runs two pods against one workspace. An update has a short outage while the old pod stops and the new one passes readiness. The `PodDisruptionBudget` (`minAvailable: 1`) also blocks voluntary eviction of the single pod, so a node drain waits until you scale to 0 or delete the pod deliberately.

## Create Bootstrap Secret

Create the bootstrap secret outside Git and keep real values out of Helm values and Terraform state. The chart does not create it, and the pod stays in `ContainerCreating` until it exists. Write each value to a file only you can read, so it stays out of shell history:

```bash
kubectl create namespace amc-system

kubectl -n amc-system create secret generic amc-bootstrap \
  --from-file=vaultPassphrase=./vault-passphrase.txt \
  --from-file=ownerUsername=./owner-username.txt \
  --from-file=ownerPassword=./owner-password.txt
```

With `notary.enabled=true`, add `--from-file=notaryPassphrase=...` and `--from-file=notaryAuthSecret=...`, and set `env.AMC_ENABLE_NOTARY="true"` to match. The raw manifests in `deploy/k8s/` mount the same secret name and keys, including both notary keys.

Alternatively, let the chart create the Secret. Values passed this way are stored in the Helm release record, so prefer the out-of-band Secret above or an external secret manager:

```bash
helm upgrade --install amc deploy/helm/amc --namespace amc-system --create-namespace \
  --set bootstrap.createSecret=true \
  --set-file bootstrap.values.vaultPassphrase=./vault-passphrase.txt \
  --set-file bootstrap.values.ownerUsername=./owner-username.txt \
  --set-file bootstrap.values.ownerPassword=./owner-password.txt \
  --set-file bootstrap.values.notaryPassphrase=./notary-passphrase.txt \
  --set-file bootstrap.values.notaryAuthSecret=./notary-auth-secret.txt
```

All five values are required even with the notary disabled, so enabling it later needs no new Secret. The Secret carries `helm.sh/resource-policy: keep`, so `helm uninstall`, upgrade and rollback do not delete the vault passphrase of a live workspace.

## Install With Helm

```bash
helm upgrade --install amc deploy/helm/amc \
  --namespace amc-system \
  --create-namespace \
  --atomic \
  --wait \
  --set image.repository=ghcr.io/your-org/amc-studio \
  --set image.tag=latest
```

Deploy by digest so the cluster runs exactly the image you tested. `image.digest` wins over `image.tag`; `image.requireDigest=true` refuses to render without one:

```bash
helm upgrade --install amc deploy/helm/amc \
  --namespace amc-system \
  --atomic \
  --wait \
  --set image.repository=ghcr.io/your-org/amc-studio \
  --set image.digest=sha256:<64 hex> \
  --set image.requireDigest=true
```

Record the digest you deployed (`docker image inspect --format '{{.Id}} {{.RepoDigests}}' <image>`) so a rollback can name it. Terraform (`image_digest`) and Pulumi (`imageDigest`) pass the same value through.

Internal-only profile:

```bash
helm upgrade --install amc deploy/helm/amc \
  --namespace amc-system \
  --create-namespace \
  --atomic \
  --wait \
  -f deploy/helm/amc/examples/values-internal-only.yaml
```

Ingress and TLS profile:

```bash
helm upgrade --install amc deploy/helm/amc \
  --namespace amc-system \
  --create-namespace \
  --atomic \
  --wait \
  -f deploy/helm/amc/examples/values-ingress-tls.yaml \
  --set image.repository=ghcr.io/your-org/amc-studio \
  --set image.tag=latest
```

## Verify Runtime

```bash
kubectl -n amc-system rollout status deploy/amc-amc
kubectl -n amc-system get pods,svc,ingress,pvc
kubectl -n amc-system port-forward svc/amc-amc 3212:3212
curl -fsS http://127.0.0.1:3212/healthz   # "version" must equal Chart.yaml appVersion
curl -fsS http://127.0.0.1:3212/readyz    # "status":"READY"; otherwise read "reasons"
```

Then run the governed-turn check:

```bash
helm test amc --namespace amc-system --logs
```

The test pod logs in as the bootstrap owner (credentials mounted read-only from the bootstrap Secret, never printed), submits one native task with provider `stub` and tools `none` through `/api/v1/native-tasks`, waits for the turn to finish and calls `/verify`. It exits 0 only when Studio reports the evidence as `workspace-key-consistency` or `externally-anchored`; a server that answers `/healthz` and `/readyz` but cannot run a governed turn fails. The probe is `scripts/deploy/governed-turn-probe.mjs`, shipped in the chart as `files/governed-turn-probe.mjs`. The docker compose example runs the same probe with `docker compose -f docker/docker-compose.yml --profile verify run --rm amc-verify`.

Studio admits native requests (`/api/v1/native-tasks/*`) only when the request's `Host` matches an origin in `AMC_CORS_ALLOWED_ORIGINS` or the bind host (`src/studio/nativeAdmission.ts`). With `--bind 0.0.0.0` the bind host alone is `http://0.0.0.0:3212`, so the chart ConfigMap always sets `AMC_CORS_ALLOWED_ORIGINS` to the Service origin the test pod calls, `http://<release>-amc:<service.port>` (`http://amc-amc:3212` for release `amc`), and appends `env.AMC_CORS_ALLOWED_ORIGINS` from values. Add your Ingress host there, for example `--set env.AMC_CORS_ALLOWED_ORIGINS=https://amc.example.internal`, or browser sessions through the Ingress are refused with `NATIVE_HOST_DENIED`. The compose file sets `AMC_CORS_ALLOWED_ORIGINS=http://amc-studio:3212` for `amc-verify`.

Then open `http://127.0.0.1:3212/console`.

Health endpoints:

- `GET /healthz` for liveness.
- `GET /readyz` for readiness.
- `amc studio healthcheck` inside the container image for CLI probing.

## Terraform Example

The example under `deploy/terraform/helm-release/` manages the local Helm chart with Terraform:

```bash
cd deploy/terraform/helm-release
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

The Terraform example intentionally does not manage secret literal values. Terraform state is not the right place for those values. Create `amc-bootstrap` through your secret manager, sealed-secrets controller, External Secrets Operator, or a separate secure pipeline before applying the release.

## Pulumi Example

The example under `deploy/pulumi/helm-release/` manages the same local Helm chart with Pulumi's Kubernetes Helm v3 Release resource:

```bash
cd deploy/pulumi/helm-release
npm install
pulumi stack init dev
pulumi config set imageRepository ghcr.io/your-org/amc-studio
pulumi config set imageTag latest
pulumi preview
pulumi up
```

Pulumi state/config is not the right place for bootstrap secret literals. Create `amc-bootstrap` through your secret manager, sealed-secrets controller, External Secrets Operator, or a separate secure pipeline before applying the release. The Pulumi example configures the existing bootstrap secret name and chart values; it does not store vault passphrases or owner passwords.

## Raw Kustomize Manifests

For operators who do not use Helm:

```bash
kubectl -n amc-system apply -f deploy/k8s/secret.yaml   # your filled-in copy of secret.example.yaml
kubectl -n amc-system apply -k deploy/k8s
kubectl -n amc-system rollout status deploy/amc-studio
```

The kustomization applies no Secret. The raw Deployment always mounts all five `amc-bootstrap` keys, notary keys included. Use the raw manifests for review, platform policy mapping, or environments where Helm is not permitted.

## Upgrade and Rollback

Before an upgrade, check the change offline. `rollback-check.mjs` renders the deployment pack at two revisions and diffs them. It fails on changes a rollback cannot cross: a changed Deployment selector, a changed or shrunk workspace claim, or a removed claim. Helm deletes a claim it no longer renders, and the workspace data with it.

```bash
node scripts/deploy/rollback-check.mjs --from <deployed-revision> --to WORKTREE
```

Raw manifests are always rendered. The chart is rendered only when `helm` is on `PATH`; otherwise the script says so.

Upgrade, verify, and roll back with Helm:

```bash
helm upgrade amc deploy/helm/amc --namespace amc-system --atomic --wait --timeout 10m
kubectl -n amc-system rollout status deploy/amc-amc
curl -fsS http://127.0.0.1:3212/readyz   # through the port-forward above
helm history amc --namespace amc-system
helm rollback amc <revision> --namespace amc-system --wait --timeout 10m
helm test amc --namespace amc-system --logs
```

### Container rollback drill

`rollback-drill.mjs` is the tested rollback until a cluster run is recorded. It needs a Docker daemon. It runs image A on a fresh workspace volume, runs the governed-turn probe, replaces the container with image B on the same volume, probes again, rolls back to A by its `sha256` image id and probes a third time. The JSON receipt holds both image ids and the six step results. Any failed step fails the drill and skips the rest. Each container runs with `AMC_CORS_ALLOWED_ORIGINS=http://127.0.0.1:<port>` so Studio admits the probe's `127.0.0.1` host. `--secrets-dir` is required: it must hold `amc_vault_passphrase`, `amc_owner_username` and `amc_owner_password`, which bootstrap the drill workspace and log the probe in. Without it the drill exits 2 with `--secrets-dir is required`; with it and no daemon it exits 2 with `docker daemon unavailable`.

```bash
node scripts/deploy/rollback-drill.mjs --image-a amc-studio:s1-a --image-b amc-studio:s1-b \
  --secrets-dir ./drill-secrets --out ./rollback-receipt.json
```

### Upgrading from chart 0.1.0

Chart 0.1.0 rendered its own `amc-bootstrap` Secret with fixed `change-me-*` values. Chart 0.2.0 renders no Secret unless `bootstrap.createSecret=true`, so a plain upgrade makes Helm delete that Secret and the new pod cannot mount it. Before upgrading, keep the Secret and replace its values:

```bash
kubectl -n amc-system annotate secret amc-bootstrap helm.sh/resource-policy=keep
```

A workspace bootstrapped by chart 0.1.0 used the published vault passphrase `change-me-vault-passphrase`; treat its vault as exposed. The `amc vault` commands at this revision (`init`, `unlock`, `lock`, `status`, `forget`) include no passphrase change, so moving that workspace to a new passphrase is an open operator decision, not a documented step.

`--atomic` rolls back a failed upgrade automatically. A rollback restores manifests, not workspace data: the ledger on the claim keeps whatever the newer version wrote. Snapshot the volume before an upgrade if you need to restore data too.

Raw manifests:

```bash
kubectl -n amc-system rollout history deploy/amc-studio
kubectl -n amc-system rollout undo deploy/amc-studio --to-revision=<revision>
kubectl -n amc-system rollout status deploy/amc-studio
```

`revisionHistoryLimit: 2` keeps the previous ReplicaSet for `rollout undo`. A later `kubectl apply -k` reapplies whatever the checkout contains, so check out the matching revision before you reapply.

### What was exercised

On 2026-10-03, on macOS (Darwin 25.6.0, arm64) with Node v25.5.0, `node scripts/deploy/deploy-pack-check.mjs --json` (status `passed`, `helm` and `kubeconform` skipped as `binary absent`) and `node scripts/deploy/rollback-check.mjs --from 8f57ce63d8331f1bef1c2a18fde82a7e8f4511da --to WORKTREE` were run against the change that added them. `helm`, `kubectl`, `kustomize` and `kubeconform` were not installed and the Docker daemon was not running. Not exercised: Helm rendering, `helm lint`, `values.schema.json` validation by Helm (the schema was checked with Ajv), `helm test`, kubeconform, the container rollback drill (it exited 2, `docker daemon unavailable`), the compose `verify` profile, and any cluster install, upgrade or rollback. The governed-turn probe was exercised only against stub HTTP servers. On 2026-10-04 the rendered `AMC_CORS_ALLOWED_ORIGINS` value (`http://amc-amc:3212`, computed from the template expression because `helm` was absent) was passed to Studio's own `nativeAllowedBrowserOrigins` and `assertNativeBrowserAdmission` in a unit test (`tests/helmChartOrigins.test.ts`): the test pod's `GET` and `POST` were admitted, and without the value the `GET` was refused with `NATIVE_HOST_DENIED`. That admitted path was proven with a unit test against `src/studio/nativeAdmission.ts`, not in a cluster, a compose run or a drill run. The commands in this section are the documented procedure, not a recorded cluster run.

Behaviour statements in this guide and where they were checked (retrieved 2026-10-03):

- Deployment selector immutable after creation; `kubectl rollout undo --to-revision`; `revisionHistoryLimit` keeps old ReplicaSets for rollback; `Recreate` kills existing pods before creating new ones: [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/).
- Kubernetes does not support shrinking a claim below its current size: [Kubernetes Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/).
- Helm deletes a resource the chart no longer renders on upgrade or rollback unless it carries `helm.sh/resource-policy: keep`: [Helm chart tips and tricks](https://helm.sh/docs/howto/charts_tips_and_tricks/).
- `helm test` runs templates annotated `helm.sh/hook: test` and passes on container exit 0: [Helm chart tests](https://helm.sh/docs/topics/chart_tests/).
- `values.schema.json` is applied by `helm install`, `upgrade`, `lint` and `template`: [Helm charts, schema files](https://helm.sh/docs/topics/charts/).
- A digest pins the code a pod runs: [Kubernetes Images](https://kubernetes.io/docs/concepts/containers/images/).
- Not re-verified against official docs: that `accessModes`, `storageClassName` and `volumeName` are immutable on a bound claim (`rollback-check.mjs` flags those changes as hazards on that assumption).

## Remaining Cloud Boundaries

- AMC still does not publish a hosted SaaS endpoint in this repo.
- Provider-specific AWS, GCP, and Azure reference architectures are documented in `docs/CLOUD_REFERENCE_ARCHITECTURES.md`.
- Terraform and Pulumi Helm-release examples are present; provider-specific full-stack infrastructure modules remain future work.
- Validate image provenance and registry availability in your deployment environment before production rollout.
