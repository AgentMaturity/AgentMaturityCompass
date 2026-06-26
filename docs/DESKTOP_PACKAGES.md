# AMC Desktop Packages

AMC can produce portable installer archives for macOS, Linux, and Windows from the local repository build. The macOS and Windows archives now include an `Agent Maturity Compass Studio` launcher app so users can start the local Studio console without memorizing CLI commands.

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

macOS and Windows archives also contain:

- macOS: `Agent Maturity Compass Studio.app`
- Windows: `Agent Maturity Compass Studio.cmd` and `Agent Maturity Compass Studio.ps1`

Each launcher app installs AMC from the included tarball if `amc` is not already available, runs `amc up --demo --no-open`, and opens the same local Studio console at `http://127.0.0.1:3212/w/demo/console`. The launcher app does not bundle Electron, Chromium, WebKit content, or another browser runtime; it uses the system browser.

## User Install

macOS and Linux install:

```bash
tar -xzf amc-<version>-macos-universal.tar.gz
cd amc-<version>-macos-universal
sh ./install.sh
amc --version
amc doctor
```

macOS Studio app launch:

```bash
open "Agent Maturity Compass Studio.app"
```

Windows PowerShell:

```powershell
Expand-Archive .\amc-<version>-windows-x64.zip
cd .\amc-<version>-windows-x64
.\install.ps1
amc --version
amc doctor
```

Launch the Studio app:

```powershell
.\Agent Maturity Compass Studio.cmd
```

## Requirements

- Node.js 20 or 22 LTS
- npm available on PATH

These packages intentionally install AMC from a local npm tarball, so they work before the public AMC registry package is available. npm still needs access to AMC's public runtime dependencies unless they are already present in the user's npm cache or installed by an enterprise package mirror.

## Legal And Source Safety

The desktop packages include AMC's own npm tarball, installer scripts, and lightweight launcher app scripts only. They do not include:

- competitor implementation code
- cloned GitHub repository source snapshots
- academic paper full text
- arXiv PDFs or extracted text
- Electron, Chromium, WebKit content, or a bundled browser runtime

Research artifacts may inform AMC-original implementation work, but copied source text or third-party code must not be placed into AMC packages unless a license review explicitly allows it.

The generated `manifest.json` records archive hashes and this legal posture for release review.

## Release Verification

Before publishing archives, run:

```bash
npm run package:desktop
npm run package:desktop:verify
```

The verifier checks archive hashes, required platform files, macOS and Windows launcher files, npm tarball contents, and the manifest legal posture.
