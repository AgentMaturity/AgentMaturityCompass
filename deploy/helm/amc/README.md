# AMC Helm Chart

## Render

```bash
helm template amc ./deploy/helm/amc
```

## Lint

```bash
helm lint ./deploy/helm/amc
```

## Install

Create the `amc-bootstrap` secret first (see `docs/KUBERNETES_HELM_DEPLOYMENT.md`). The chart references it and never renders a default. `bootstrap.createSecret=true` renders it from `bootstrap.values` instead; every value is then required and a `change-me` value is refused.

```bash
helm install amc ./deploy/helm/amc \
  --set image.repository=ghcr.io/agentmaturity/amc-studio \
  --set image.tag=latest
```

Pin the image with `--set image.digest=sha256:<64 hex>` (wins over the tag; `image.requireDigest=true` refuses a render without it). After install, `helm test amc --logs` runs one governed native turn and verifies its evidence.

Deploy by digest in production:

```bash
helm install amc ./deploy/helm/amc \
  --set image.repository=ghcr.io/agentmaturity/amc-studio \
  --set image.digest=sha256:<64 hex> \
  --set image.requireDigest=true
```

The release workflow is prepared to publish `ghcr.io/agentmaturity/amc-studio` as one multi-platform tag (linux/amd64 and linux/arm64) and to attach `image-digests.json` to the GitHub release; use its `indexDigest`, or a per-platform `digest` to pin one architecture. Registry publication is not yet verified (`website/publication-status.json`); until it is, build the image locally (`docker/README.md`) and deploy that image's digest from your own registry.

Production guide: `docs/KUBERNETES_HELM_DEPLOYMENT.md`.

## Example values

Render internal-only deployment:

```bash
helm template amc ./deploy/helm/amc -f ./deploy/helm/amc/examples/values-internal-only.yaml
```

Render ingress + TLS deployment:

```bash
helm template amc ./deploy/helm/amc -f ./deploy/helm/amc/examples/values-ingress-tls.yaml
```

Render persistent bootstrap deployment:

```bash
helm template amc ./deploy/helm/amc -f ./deploy/helm/amc/examples/values-persistent-bootstrap.yaml
```

## Features

- Non-root runtime (`runAsUser: 10001`)
- Read-only root filesystem
- Persistent workspace PVC (`/data/amc`)
- Bootstrap from an existing Kubernetes Secret (no Secret is rendered unless `bootstrap.createSecret=true`)
- Startup/liveness `/healthz` and readiness `/readyz` probes
- One replica with `strategy: Recreate` (single-writer workspace; other `replicaCount` values are refused)
- TLS ingress support
- NetworkPolicy with ingress-controller-only ingress and DNS/upstream egress controls
- PDB + ServiceAccount templates

## Terraform

The example under `deploy/terraform/helm-release/` deploys this chart with Terraform's Helm provider while keeping bootstrap secrets outside Terraform state.

## Pulumi

The example under `deploy/pulumi/helm-release/` deploys this chart with Pulumi's Kubernetes Helm v3 Release resource while keeping bootstrap secrets outside Pulumi stack config/state.

## A4 Forge releases (preview)

With `AMC_A4_PREVIEW=1`, an A4 project's Activate stage signs an agent package and records the release; AMC never runs `helm` or `kubectl`. In v1 a deployment is a same-host restart with a pinned image: the values overlay restarts this hosted Studio, the one that built the agent, whose volume holds the agent's resources. A deployment receipt can be recorded against `target: helm` only for an agent built in this hosted Studio; an agent built elsewhere has no v1 deployment path (`DEPLOYMENT_NOT_SAME_HOST`), and installing a package into another workspace is P2-40.

The package's `deploy/` directory holds the prepared `values.a4-<releaseId>.yaml` and `deploy/plan.json` (steps, receipt form, gaps; signed `a4-deployment-plan`). The overlay sets `image.repository` and `image.tag`, and names secrets only; the chart's `change-me-*` defaults are never copied. The steps, with `-n <namespace>` when the release answered a valid namespace hint:

```bash
kubectl exec deploy/amc-amc -c amc-studio -- cat /data/amc/a4-releases/<projectId>/<releaseId>/deploy/values.a4-<releaseId>.yaml > values.a4-<releaseId>.yaml
kubectl create secret generic amc-a4-lease-<id> --from-file=token=./amc_a4_lease_<releaseId>.txt
kubectl exec deploy/amc-amc -c amc-studio -- amc doctor --strict --json
helm upgrade --install amc deploy/helm/amc -f values.a4-<releaseId>.yaml --atomic --wait
kubectl set env deploy/amc-amc -c amc-studio AMC_A4_PREVIEW=1
helm history amc
```

Known gaps, each a WAITING item or a note in the plan, never a blocker:

- The overlay pins the image by tag (`IMAGE_TAG_ONLY`): it does not set the chart's `image.digest` yet.
- The plan still reads `TOPOLOGY_UNDECIDED` (`KEY:D-03`): D-03 has since kept Helm documented, and A4 does not read that decision yet.
- The chart has no volume of its own for the signed-journal checkpoint root, so `AMC_CONTROL_CHECKPOINT_DIR` is not set.
- The chart renders a fixed environment list, so the values overlay cannot set `AMC_A4_PREVIEW=1`
  (`A4_PREVIEW_NOT_SET_BY_CHART`). Set it on the Studio container yourself after each upgrade, for example with the
  `kubectl set env` step above, which restarts the Studio once more. Without it A4 answers 404 and the receipt cannot be
  recorded. A chart values key is a later item.
- The chart does not mount the lease secret; it is for the agent's gateway client.
- `networkPolicy.allowedEgressCidrs` stays as configured here.

Record the receipt with `POST /api/v1/a4/projects/<projectId>/releases/<releaseId>/deployments` (owner). Use `target: helm` and the revision `helm history` shows as `helmRevision`; `helm package deploy/helm/amc` gives the chart digest for your own records. AMC's check (`POST …/verify`) establishes reachability only; release identity at the destination is not evaluated until P2-40. To roll back, run `helm rollback amc <revision> --wait` with the revision that deployed the release running in production when this one was built (the preview names it), after an owner previews the rollback and project approvers other than the confirming owner decide it, then record the rollback row in the environment the rollback was approved for.
