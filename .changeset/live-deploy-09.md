---
"agent-maturity-compass": patch
---

The Kubernetes docs match the chart and no longer pull an unpublished image (LIVE-DEPLOY-09). `docs/KUBERNETES_HELM_DEPLOYMENT.md` names the claims the chart renders, `<release>-amc` and `<release>-amc-state` (`amc-amc-state` for release `amc`). "Install With Helm" and the chart README lead with a locally built image deployed by digest: on kind through `scripts/deploy/kind-image-digest.mjs`, with a registry through `docker image inspect --format '{{index .RepoDigests 0}}'`, never the local image id. `ghcr.io/agentmaturity/amc-studio` is named only as the repository to use once registry publication is verified, because an unpublished tag puts the pod in `ImagePullBackOff`. Every documented `helm upgrade` that sets values carries `--reuse-values` or the operator's `-f` file, and the chart README tells A4 users to add `--reuse-values` to the generated overlay's upgrade line.
