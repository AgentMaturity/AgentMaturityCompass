# AMC Kubernetes Manifests

These manifests provide a baseline deployment for AMC Studio.

## Apply

```bash
kubectl apply -k deploy/k8s
```

## Notes

- `kustomization.yaml` does not apply any Secret. Create `amc-bootstrap` first: copy `secret.example.yaml` to the gitignored `secret.yaml`, replace every `REPLACE_WITH_` value and `kubectl apply -f deploy/k8s/secret.yaml`, or use the `kubectl create secret generic amc-bootstrap` command in `docs/KUBERNETES_HELM_DEPLOYMENT.md`. The Helm chart uses the same secret name and keys.
- The Deployment uses `strategy: Recreate` with one replica: the workspace has a single writer, so an update stops the old pod before starting the new one.
- `hpa.yaml` defaults to `minReplicas=1` and `maxReplicas=1` because AMC uses local workspace state (SQLite/filesystem).
- If you need horizontal scaling, externalize shared state first and then raise `maxReplicas`.
