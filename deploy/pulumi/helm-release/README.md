# AMC Pulumi Helm Release Example

This example deploys the local `deploy/helm/amc` chart with a Pulumi Kubernetes Helm v3 Release. It is a provider-agnostic root module for existing Kubernetes clusters, not an AMC-operated hosted service.

Official references checked on 2026-06-16:

- Pulumi Kubernetes Helm v3 Release: https://www.pulumi.com/registry/packages/kubernetes/api-docs/helm/v3/release/
- Pulumi configuration and secret config: https://www.pulumi.com/docs/iac/concepts/config/
- Pulumi Kubernetes provider: https://www.pulumi.com/registry/packages/kubernetes/api-docs/provider/

## Usage

```bash
cd deploy/pulumi/helm-release
npm install
pulumi stack init dev
pulumi config set imageRepository ghcr.io/your-org/amc-studio
pulumi config set imageTag latest
pulumi preview
pulumi up
```

Optional kubeconfig handling:

```bash
pulumi config set kubeContext your-context-name
pulumi config set --secret kubeconfig "$(cat ~/.kube/config)"
```

If `kubeconfig` is omitted, Pulumi uses the active Kubernetes environment available to the provider.

## Secret Handling

Create the `amc-bootstrap` Kubernetes secret outside Pulumi before applying this release. Do not put vault passphrases or owner passwords in Pulumi stack config. Pulumi state/config is not the right place for bootstrap secret literals, even when secret config encryption is enabled.

```bash
kubectl create namespace amc-system
kubectl -n amc-system create secret generic amc-bootstrap \
  --from-literal=vaultPassphrase='<managed-secret-value>' \
  --from-literal=ownerUsername='<managed-secret-value>' \
  --from-literal=ownerPassword='<managed-secret-value>' \
  --from-literal=notaryPassphrase='<managed-secret-value>' \
  --from-literal=notaryAuthSecret='<managed-secret-value>'
```

For production, source those values from your cloud secret manager, sealed-secrets workflow, External Secrets Operator, or a separate secure pipeline.

## Configuration

Common stack config keys:

| Key | Default | Purpose |
|---|---|---|
| `releaseName` | `amc` | Helm release name |
| `namespace` | `amc-system` | Kubernetes namespace |
| `chartPath` | `../../helm/amc` | Local AMC Helm chart path |
| `imageRepository` | `ghcr.io/your-org/amc-studio` | AMC image repository |
| `imageTag` | `latest` | AMC image tag |
| `bootstrapSecretName` | `amc-bootstrap` | Existing Kubernetes Secret with bootstrap keys |
| `ingressEnabled` | `false` | Enable chart ingress |
| `ingressHost` | `amc.example.com` | Hostname for ingress |
| `ingressTlsSecretName` | empty | Existing TLS secret name |
| `storageClassName` | empty | Workspace PVC storage class |
| `workspaceStorageSize` | `10Gi` | Workspace PVC size |
| `valuesFiles` | empty | Additional Helm values files |

Example values-file overlay:

```bash
pulumi config set --path 'valuesFiles[0]' ../../helm/amc/examples/values-ingress-tls.yaml
```

## Verify

```bash
kubectl -n amc-system rollout status deploy/amc
kubectl -n amc-system get pods,svc,ingress,pvc
kubectl -n amc-system port-forward svc/amc 3212:3212
```

Then open `http://127.0.0.1:3212/console`.

Health endpoints:

- `GET /healthz`
- `GET /readyz`

See `docs/KUBERNETES_HELM_DEPLOYMENT.md` for the full operator guide and `docs/CLOUD_REFERENCE_ARCHITECTURES.md` for AWS, GCP, and Azure architecture choices.
