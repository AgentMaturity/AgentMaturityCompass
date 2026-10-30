---
"agent-maturity-compass": patch
---

A fresh workspace becomes Ready without a manual `amc value init` (P2-06-D2). Workspace initialization now signs the default value policy beside the CGX, forecast and bench policies, which covers `amc init`, `amc bootstrap` (the Helm entrypoint), host-mode workspaces and Studio's first start. Studio start also signs a missing value policy through the asynchronous publication path for workspaces initialized before this fix. Readiness stays read-only: `/readyz` never creates the policy, and a missing, tampered or unparseable policy still reads NOT ready.
