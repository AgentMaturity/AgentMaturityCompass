---
"agent-maturity-compass": patch
---

Helm chart 0.4.1 roots signed-control checkpoints on the state claim (LIVE-DEPLOY-15). The chart's ConfigMap sets `AMC_CONTROL_CHECKPOINT_DIR` to `<amcHomeState.mountPath>/control-checkpoints` (by default `/home/amc/.config/amc/state/control-checkpoints`), outside the workspace. On chart 0.4.0 the root defaulted to `$HOME/.amc/control-checkpoints` on the read-only root filesystem, where firewall, guardrail, legal-hold and compiled-control journals cannot write their checkpoints. Existing releases upgrade with `helm upgrade … --reuse-values` before publishing such a control. The raw `deploy/k8s` Deployment sets the same path.
