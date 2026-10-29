---
"agent-maturity-compass": patch
---

The source container image builds and its Studio starts again (P2-06-D1, P2-06-D3). The Dockerfile's build stage now copies the adapter claim manifests and the qualification receipts they name, which `scripts/copy-build-assets.mjs` has read since P2-37, and the non-`dist` entries of the package `files` list (`catalog/`, `deploy/apparmor/`, `docs/NATIVE_SANDBOX_UBUNTU.md`), which `npm pack` otherwise left out of the image's package without an error. The runtime stage creates `/home/amc/.config/amc` and its `state` mount point at mode 0700, owned by the runtime user, because the credentials store refuses an AMC home that is group- or world-readable.
