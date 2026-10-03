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
node scripts/deploy/validate-assets.mjs
helm lint deploy/helm/amc
helm template amc deploy/helm/amc
```

`validate-assets.mjs` exits non-zero on drift. It checks that `Chart.yaml` `appVersion` equals the `package.json` version, that the quickstart image pins the published GitHub release recorded in `website/publication-status.json`, that every values file and raw manifest parses without duplicate keys, that no Helm values, template, raw manifest or Docker asset carries a literal or default secret, that every probe path has a handler in the server source, and that the deployment stays single-writer. When `helm` is on `PATH` it also renders the chart with defaults and each example values file, and confirms `--set replicaCount=2` is refused. When `helm` is absent it prints that rendering was not exercised.

The chart renders:

- `Deployment` with non-root containers, read-only root filesystem, one replica and `strategy: Recreate`.
- `Service` for Studio, Gateway, and proxy ports.
- `Ingress` when enabled.
- `PersistentVolumeClaim` for the AMC workspace.
- `NetworkPolicy`, `PodDisruptionBudget`, `ServiceAccount` and `ConfigMap`.
- No `Secret`. The chart only references the bootstrap secret you create, so no default passphrase can reach the cluster.

Resources are named `<release>-amc`; with release `amc` that is `amc-amc`.

### Probes

| Probe | Path | Handler | What it proves |
|---|---|---|---|
| startup | `GET /healthz` on `studio` | `src/studio/studioServer.ts` (`pathname === "/healthz"`), payload from `buildHealthPayload` in `src/api/health.ts` | Studio answers after `amc bootstrap`. Allows up to 300 seconds before liveness applies. |
| readiness | `GET /readyz` on `studio` | `src/studio/studioServer.ts` (`pathname === "/readyz"`), `buildReadiness` | Signed policies verify, the ledger database answers, the workspace is writable, and the transparency seal and Merkle root are valid. Otherwise it returns 503 with `reasons`. |
| liveness | `GET /healthz` on `studio` | as startup | The process answers. It does not depend on policy trust, so an untrusted policy takes the pod out of service instead of restarting it in a loop. |

The notary sidecar, when enabled, uses `/readyz` and `/healthz` from `src/notary/notaryServer.ts`.

These probes do not run a governed turn. An authenticated governed-turn check against the deployed service remains a separate post-deploy step.

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
```

`--atomic` rolls back a failed upgrade automatically. A rollback restores manifests, not workspace data: the ledger on the claim keeps whatever the newer version wrote. Snapshot the volume before an upgrade if you need to restore data too.

Raw manifests:

```bash
kubectl -n amc-system rollout history deploy/amc-studio
kubectl -n amc-system rollout undo deploy/amc-studio --to-revision=<revision>
kubectl -n amc-system rollout status deploy/amc-studio
```

`revisionHistoryLimit: 2` keeps the previous ReplicaSet for `rollout undo`. A later `kubectl apply -k` reapplies whatever the checkout contains, so check out the matching revision before you reapply.

### What was exercised

On 2026-10-03, on macOS (Darwin 25.6.0, arm64) with Node v25.5.0, `node scripts/deploy/validate-assets.mjs` and `node scripts/deploy/rollback-check.mjs --from 8f57ce63d8331f1bef1c2a18fde82a7e8f4511da --to WORKTREE` were run against the change that added them. `helm`, `kubectl`, `kustomize` and `kubeconform` were not installed. Helm rendering, `helm lint`, schema validation against the Kubernetes API, and any cluster install, upgrade or rollback were not exercised. The commands in this section are the documented procedure, not a recorded cluster run.

## Remaining Cloud Boundaries

- AMC still does not publish a hosted SaaS endpoint in this repo.
- Provider-specific AWS, GCP, and Azure reference architectures are documented in `docs/CLOUD_REFERENCE_ARCHITECTURES.md`.
- Terraform and Pulumi Helm-release examples are present; provider-specific full-stack infrastructure modules remain future work.
- Validate image provenance and registry availability in your deployment environment before production rollout.
