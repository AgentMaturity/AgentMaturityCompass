---
"agent-maturity-compass": major
---

Deployment pack hardening (P0-14, slices S1 and S2). Breaking for Helm chart users: chart `deploy/helm/amc` is now 0.2.0 (appVersion 1.2.0).

- The chart renders no Secret by default. Create the `amc-bootstrap` Secret before `helm install`, or the Studio pod cannot start. Chart 0.1.0 always rendered that Secret with published `change-me-*` values. With `bootstrap.createSecret=true` the chart renders it from `bootstrap.values`: all five values are required, a value that starts with `change-me` (any case) is refused by the template and by `values.schema.json`, and the Secret carries `helm.sh/resource-policy: keep`.
- `replicaCount` other than 1 is refused (the workspace has a single writer), and the rollout strategy is `Recreate`. `image.digest` renders `repository@digest`; `image.requireDigest=true` refuses to render without a digest.
- The chart ConfigMap sets `AMC_CORS_ALLOWED_ORIGINS` to the chart's own Service origin followed by `env.AMC_CORS_ALLOWED_ORIGINS`. The Studio pod, the `helm test` pod and the raw `deploy/k8s` Deployment no longer automount the service-account token, which collided with the read-only `/run/secrets` mount.
- `helm test` runs one stub-provider native task as the bootstrap owner and passes only when Studio reports its evidence as `workspace-key-consistency` or `externally-anchored`. A workspace-key result is a local audit trail, not a portable verdict.
- Upgrading from 0.1.0: annotate the existing `amc-bootstrap` Secret with `helm.sh/resource-policy=keep` first, or Helm deletes it. A workspace bootstrapped by chart 0.1.0 used a published vault passphrase. AMC has no command that changes a vault passphrase, and this release does not repair such a workspace.
- New npm scripts: `check:deploy-pack` (offline checks, plus helm and kubeconform when installed), `deploy:rollback-drill` (container A to B to A drill), `deploy:verify` (one leased gateway turn whose receipt is checked against a pinned monitor key) and `check:credentials-presence` (prints only whether each release credential is present).
- `railway.json` and `vercel.json` stay documented but unqualified: they serve only the standalone API and cannot pass `deploy:verify`.
