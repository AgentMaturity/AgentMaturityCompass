---
"agent-maturity-compass": patch
---

Harness support docs and a nightly harness conformance workflow (P2-17 part D). The Pi and Claude Code guides state their support status from the generated harness support matrix. `docs/adapters/README.md` lists all four governed harnesses with the status their manifests support. The README now says why Codex is unsupported. `.github/workflows/harness-conformance.yml` runs the Pi and Claude Code conformance suites nightly and on demand against the pinned harness versions, with local scripted model endpoints, no secrets and results uploaded as artifacts. Its first run has not happened yet.
