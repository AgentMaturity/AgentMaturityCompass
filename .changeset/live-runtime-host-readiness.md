---
"agent-maturity-compass": patch
---

Host mode readiness no longer lists workspaces to anonymous callers (LIVE-RUNTIME-09). `/readyz` and `/host/readyz` answer `status`, `mode` and a `summary` (total, ready, not ready) to everyone; the per-workspace rows are included only for a signed-in host user (host admins see all, members see their own). Anonymous `/w/<id>/readyz` answers 401 `authentication required` for every id, known or not, so it no longer tells whether a workspace exists. The host's `/healthz` is now liveness only: it answers 200 even while one workspace is not ready, so a liveness probe no longer restarts the whole host for one tenant's misconfiguration. Readiness probes should keep using `/readyz`.
