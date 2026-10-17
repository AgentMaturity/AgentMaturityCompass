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

## Validate the Chart

```bash
helm lint deploy/helm/amc
helm template amc deploy/helm/amc
```

The chart renders:

- `Deployment` with non-root containers and read-only root filesystem.
- `Service` for Studio, Gateway, and proxy ports.
- `Ingress` when enabled.
- `PersistentVolumeClaim` for the AMC workspace.
- `NetworkPolicy`, `PodDisruptionBudget`, `ServiceAccount` and `ConfigMap`.
- No `Secret` by default. The chart references the separately provisioned `amc-bootstrap` Secret. Explicit `bootstrap.createSecret=true` renders it only after all five values are supplied and the template rejects any leading `change-me` prefix, case-insensitively.
- Liveness `/healthz` and readiness `/readyz` probes.

## Create Bootstrap Secret

Provision `amc-bootstrap` outside Git, preferably through your existing secret manager. For the file-based example, write your own values to five private files before running the command; the files must stay outside Git. All five keys below are mounted by the current Deployment even with the notary disabled. Use the same namespace for the Secret and release.

```bash
kubectl create namespace amc-system

kubectl -n amc-system create secret generic amc-bootstrap \
  --from-file=vaultPassphrase=./vault-passphrase.txt \
  --from-file=ownerUsername=./owner-username.txt \
  --from-file=ownerPassword=./owner-password.txt \
  --from-file=notaryPassphrase=./notary-passphrase.txt \
  --from-file=notaryAuthSecret=./notary-auth-secret.txt
```

The namespace creation line is for a new namespace. Keep actual values out of shell command literals, Helm values and Terraform state.

For a new release, chart-managed Secret creation is an explicit alternative:

```bash
helm install amc deploy/helm/amc --namespace amc-system \
  --set replicaCount=1 \
  --set bootstrap.createSecret=true \
  --set-file bootstrap.values.vaultPassphrase=./vault-passphrase.txt \
  --set-file bootstrap.values.ownerUsername=./owner-username.txt \
  --set-file bootstrap.values.ownerPassword=./owner-password.txt \
  --set-file bootstrap.values.notaryPassphrase=./notary-passphrase.txt \
  --set-file bootstrap.values.notaryAuthSecret=./notary-auth-secret.txt
```

All five values are required, and any leading `change-me` prefix is refused case-insensitively. Values supplied to Helm, including file inputs, become part of the release record, so prefer out-of-band provisioning. The rendered Secret includes `helm.sh/resource-policy: keep`; that annotation alone does not establish retention behavior for an existing release. Review the upgrade notes before changing an existing installation.

Use one replica for the workspace. This partial bootstrap change adds no values schema or strict input-type guarantee and does not qualify a cluster, upgrade or rollback.

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
kubectl apply -k deploy/k8s
```

Use the raw manifests for review, platform policy mapping, or environments where Helm is not permitted.

## Upgrade and Rollback

This source change turns default Secret creation off without establishing an upgrade or rollback procedure. If an existing Helm release manages `amc-bootstrap`, do not assume that a release which stops rendering it will preserve it. Inspect the deployed Secret and release manifests and protect the workspace data before selecting a migration. A new keep annotation is not evidence that an existing Secret is protected. Whether any environment used the old published defaults, and its exposure, remediation and rotation decisions, remain operator matters tracked by P0-37; no confirmation or passphrase-migration procedure is recorded here.

The commands below are procedure examples, not evidence of an executed or safe migration.

```bash
helm upgrade amc deploy/helm/amc --namespace amc-system --atomic --wait
helm history amc --namespace amc-system
helm rollback amc <revision> --namespace amc-system --wait
```

## Remaining Cloud Boundaries

- AMC still does not publish a hosted SaaS endpoint in this repo.
- Provider-specific AWS, GCP, and Azure reference architectures are documented in `docs/CLOUD_REFERENCE_ARCHITECTURES.md`.
- Terraform and Pulumi Helm-release examples are present; provider-specific full-stack infrastructure modules remain future work.
- Validate image provenance and registry availability in your deployment environment before production rollout.
