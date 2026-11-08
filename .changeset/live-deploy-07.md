---
"agent-maturity-compass": patch
---

The Linux desktop archive is labelled for what it is (LIVE-DEPLOY-07). The `linux-x64` archive is an npm tarball plus an sh installer, so it is architecture-neutral; its README title now reads "Linux (x64, arm64)", and the archive README and `docs/DESKTOP_PACKAGES.md` say that on arm64, or whenever prebuilt `better-sqlite3` binaries cannot be downloaded, npm builds the native module and needs `python3`, `make` and `g++`. The archive id `linux-x64` is unchanged (the published `SHA256SUMS`, the hosted installer and the platform matrix consume it).
