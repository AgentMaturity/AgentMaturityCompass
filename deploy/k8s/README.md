# AMC Kubernetes Manifests

These manifests provide a baseline deployment for AMC Studio.

## Apply

```bash
kubectl apply -k deploy/k8s
```

## Notes

- Replace placeholder values in `secret.yaml` before production use.
- `hpa.yaml` defaults to `minReplicas=1` and `maxReplicas=1` because AMC uses local workspace state (SQLite/filesystem).
- If you need horizontal scaling, externalize shared state first and then raise `maxReplicas`.
