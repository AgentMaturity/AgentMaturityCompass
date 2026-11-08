---
"agent-maturity-compass": patch
---

The install docs state platform status from run receipts (LIVE-DEPLOY-10). `docs/INSTALL.md` replaces "macOS, Linux, Windows" with one line per platform: macOS arm64 is qualified (`docs/PLATFORM_MATRIX.md`); Linux arm64 was installed and run on `node:22-bookworm` on 2026-11-07 with no matrix receipt; the Linux x64, macOS x64 and Windows x64 packages are built and checksum-verified with no run receipt; container images are built for amd64 and arm64, smoke-tested on arm64 and on amd64 only under emulation. The Windows section and `docs/DESKTOP_PACKAGES.md` say that no maintainer-run Windows receipt exists and that the CLI natively and Studio under WSL2 are both untested, and that the Linux archive ships no Studio launcher (`amc up` starts Studio).
