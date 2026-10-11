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

```bash
helm install amc ./deploy/helm/amc \
  --set image.repository=ghcr.io/your-org/amc-studio \
  --set image.tag=latest
```

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
- Bootstrap from Kubernetes Secret values
- Readiness/liveness probes (`/readyz`, `/healthz`)
- TLS ingress support
- NetworkPolicy with ingress-controller-only ingress and DNS/upstream egress controls
- PDB + ServiceAccount templates

## Terraform

The example under `deploy/terraform/helm-release/` deploys this chart with Terraform's Helm provider while keeping bootstrap secrets outside Terraform state.

## Pulumi

The example under `deploy/pulumi/helm-release/` deploys this chart with Pulumi's Kubernetes Helm v3 Release resource while keeping bootstrap secrets outside Pulumi stack config/state.

## A4 Forge releases (preview)

With `AMC_A4_PREVIEW=1`, an A4 project's Activate stage signs an agent package and records the release; AMC never runs `helm`. In v1 a deployment is a same-host restart with a pinned image: the values overlay restarts this hosted Studio, the one that built the agent, whose volume holds the agent's resources. A deployment receipt can be recorded against `target: helm` only for an agent built in this hosted Studio; an agent built elsewhere has no v1 deployment path (`DEPLOYMENT_NOT_SAME_HOST`), and installing a package into another workspace is P2-40. The chart has no `image.digest` field yet, so the image stays pinned by tag (`IMAGE_TAG_ONLY`) and the topology stays undecided until D-03 (`TOPOLOGY_UNDECIDED`); both are WAITING items, never blockers. The staging lease token is shown once by the release response: create it as a Kubernetes secret yourself; the chart's `change-me-*` defaults are never used for it. AMC's check of a deployment establishes reachability only; release identity at the destination is not evaluated until P2-40.
