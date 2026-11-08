---
"agent-maturity-compass": patch
---

The container healthcheck probes Studio over HTTP and holds under load (LIVE-DEPLOY-03). The image HEALTHCHECK and the compose Studio services ran `amc studio healthcheck`, which loads the whole CLI for two GETs; under load it took 42 s against a 10 s timeout and marked a READY Studio unhealthy. They now run one `node -e` probe of `/healthz` and `/readyz`, each request bounded at 8 s in-process (interval 30 s, timeout 10 s, start period 120 s, 5 retries), and the TLS stack's `amc-studio` declares it explicitly. `scripts/container-smoke.mjs` polls readiness with the same probe. The probe covers the entrypoint's single-workspace `amc studio start`; a container running `amc host` is not probed by it. `amc studio healthcheck` stays as the CLI probe for operators.
