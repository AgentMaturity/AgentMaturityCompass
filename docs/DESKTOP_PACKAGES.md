# AMC Desktop Packages

AMC can produce portable installer archives for macOS, Linux, and Windows from the local repository build.

```bash
npm run package:desktop
npm run package:desktop:verify
```

The command writes:

- `dist/installers/archives/amc-<version>-macos-universal.tar.gz`
- `dist/installers/archives/amc-<version>-linux-x64.tar.gz`
- `dist/installers/archives/amc-<version>-windows-x64.zip`
- `dist/installers/manifest.json`

Each archive contains the AMC npm tarball built from this repository, a platform installer, a README, and a legal notice.

## User Install

macOS and Linux:

```bash
tar -xzf amc-<version>-macos-universal.tar.gz
cd amc-<version>-macos-universal
sh ./install.sh
amc --version
amc doctor
```

Windows PowerShell:

```powershell
Expand-Archive .\amc-<version>-windows-x64.zip
cd .\amc-<version>-windows-x64
.\install.ps1
amc --version
amc doctor
```

## Requirements

- Node.js 20 or 22 LTS
- npm available on PATH

These packages intentionally install AMC from a local npm tarball, so they work before the public AMC registry package is available. npm still needs access to AMC's public runtime dependencies unless they are already present in the user's npm cache or installed by an enterprise package mirror.

## Legal And Source Safety

The desktop packages include AMC's own npm tarball and installer scripts only. They do not include:

- competitor implementation code
- cloned GitHub repository source snapshots
- academic paper full text
- arXiv PDFs or extracted text

Research artifacts may inform AMC-original implementation work, but copied source text or third-party code must not be placed into AMC packages unless a license review explicitly allows it.

The generated `manifest.json` records archive hashes and this legal posture for release review.

## Release Verification

Before publishing archives, run:

```bash
npm run package:desktop
npm run package:desktop:verify
```

The verifier checks archive hashes, required platform files, npm tarball contents, and the manifest legal posture.
