# AMC Terraform Helm Release Example

This example deploys the local `deploy/helm/amc` chart with Terraform's Helm provider. It is an example root module, not a provider-specific cloud reference architecture.

## Usage

```bash
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

## Image Pinning

Set `image_digest = "sha256:<64 hex>"` to deploy `image_repository@image_digest`; the tag is then ignored. Record the digest you deployed so a rollback can name it.

## Secret Handling

Create the `amc-bootstrap` Kubernetes secret outside Terraform before applying this release. Do not put vault passphrases or owner passwords in `terraform.tfvars`; Terraform state is not the right place for those values.

```bash
kubectl create namespace amc-system
kubectl -n amc-system create secret generic amc-bootstrap \
  --from-literal=vaultPassphrase='replace-with-long-random-passphrase' \
  --from-literal=ownerUsername='admin' \
  --from-literal=ownerPassword='replace-with-long-random-password' \
  --from-literal=notaryPassphrase='replace-with-long-random-passphrase' \
  --from-literal=notaryAuthSecret='replace-with-long-random-secret'
```

## Verify

```bash
kubectl -n amc-system rollout status deploy/amc-amc
kubectl -n amc-system get pods,svc,ingress,pvc
```

See `docs/KUBERNETES_HELM_DEPLOYMENT.md` for the full operator guide.
