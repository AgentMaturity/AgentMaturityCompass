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

Each launcher app verifies the included tarball digest, installs that exact AMC package into a version-pinned per-user runtime, and runs its private `amc up --demo --no-open` executable. It never falls back to an older global `amc` install. The demo binds only to loopback, stores mutable local data, and produces unsigned evidence.

The native macOS build renders the local Studio URL in a native WebKit window. The Windows launcher, and the macOS cross-build fallback, opens the same local Studio console in the system browser. The launcher app does not bundle Electron, Chromium, WebKit content, or another browser runtime.

Launcher runtimes are stored under `~/Library/Application Support/Agent Maturity Compass/runtime` on macOS and `%LOCALAPPDATA%\Agent Maturity Compass\runtime` on Windows. Mutable demo data lives separately in the adjacent `studio-workspace` directory, so moving, replacing, or rebuilding an extracted app cannot corrupt the active workspace. The macOS app carries its own copy of the package tarball, so it keeps working after you move it, for example to `/Applications`. A package digest marker makes launcher upgrades deterministic: when the digest changes, the launcher stops the Studio that the previous runtime started, installs the new package, and starts Studio again.

Studio listens on `127.0.0.1:3212`. If another program already holds that port, for example a CLI `amc up` in another folder, Studio cannot start; the macOS app says so in a dialog, and the Windows launcher points to its log.

Studio keeps running after you close the app window or browser tab. Stop it with the launcher runtime's own `amc`:

```bash
# macOS
cd ~/"Library/Application Support/Agent Maturity Compass/studio-workspace" && ../runtime/node_modules/.bin/amc down
```

```powershell
# Windows
cd "$env:LOCALAPPDATA\Agent Maturity Compass\studio-workspace"; ..\runtime\node_modules\.bin\amc.cmd down
```

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

The app is ad-hoc signed, not notarized. If macOS says it cannot verify the app, open System Settings > Privacy & Security and choose Open Anyway. If you checked the archive against the release's `SHA256SUMS`, you can instead clear the download quarantine in the extracted folder with `xattr -dr com.apple.quarantine "Agent Maturity Compass Studio.app"`.

Windows PowerShell:

```powershell
Expand-Archive .\amc-<version>-windows-x64.zip -DestinationPath .
cd .\amc-<version>-windows-x64
.\install.cmd
amc --version
amc doctor
```

`install.cmd` runs `install.ps1` with `-ExecutionPolicy Bypass`, because the default execution policy on Windows clients refuses to run `.ps1` files directly.

Launch the Studio app by double-clicking `Agent Maturity Compass Studio.cmd`, or from PowerShell:

```powershell
& ".\Agent Maturity Compass Studio.cmd"
```

## Requirements

- Node.js 22 or 24 LTS
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

The verifier checks archive hashes, required platform files, macOS and Windows launcher files, that every installer and Studio launcher pins the npm tarball digest, npm tarball contents, and the manifest legal posture.
