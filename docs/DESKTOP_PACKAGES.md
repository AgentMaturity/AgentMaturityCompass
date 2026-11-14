# AMC Desktop Packages

AMC can produce portable installer archives for macOS, Linux, and Windows from the local repository build. The macOS and Windows archives now include an `Agent Maturity Compass Studio` launcher app so users can start the local Studio console without memorizing CLI commands.

```bash
npm run package:desktop
npm run package:desktop:verify
```

The command writes:

- `dist/installers/archives/amc-<version>-macos-universal.tar.gz`
- `dist/installers/archives/amc-<version>-linux-x64.tar.gz` (Linux x64 and arm64: the archive is architecture-neutral, so the `linux-x64` name covers both)
- `dist/installers/archives/amc-<version>-windows-x64.zip`
- `dist/installers/manifest.json`

Each archive contains the AMC npm tarball built from this repository, a platform installer, a README, and a legal notice.

macOS and Windows archives also contain:

- macOS: `Agent Maturity Compass Studio.app`
- Windows: `Agent Maturity Compass Studio.cmd` and `Agent Maturity Compass Studio.ps1`

Each launcher app verifies the included tarball digest, installs that exact AMC package into a version-pinned per-user runtime, and runs its private `amc` executable. It never falls back to an older global `amc` install. Studio binds only to loopback.

The native macOS build renders the Compass Console in a native WebKit window. The Windows launcher, and the macOS cross-build fallback, opens the same local Studio console in the system browser, in view-only demo mode. The launcher app does not bundle Electron, Chromium, WebKit content, or another browser runtime.

## The macOS app

### First launch

1. The window opens and asks how to start, in plain words: AMC keeps its records on this Mac, in `~/Library/Application Support/Agent Maturity Compass/workspace`. Setting up creates your own workspace there, a signing vault whose passphrase AMC keeps in your macOS Keychain, and an owner account named after your macOS user that the app signs in with for you. The choices are Set Up My Workspace, Try the Demo, and Quit.
2. While it works, the window shows what it is doing: "Installing AMC (first launch only)", then "Creating your workspace (first launch only)" and "Creating your owner account". Installing runs npm and needs network access for AMC's public dependencies; it takes a minute or two.
3. The Compass Console opens, signed in as the owner, so every control works: run tasks, score your own agent, connect Claude Code or Codex. The first start also runs AMC's first baseline score.

Later launches go straight to the console, signed in. Studio > Try the Demo switches to the view-only sample workspace, and Studio > Open My Workspace switches back; the two never run at the same time.

### How the app signs you in

- The launcher generates a vault passphrase and writes it to the macOS Keychain entry that `amc up` already reads (service `amc-vault`, one account per workspace). It reaches `security` on stdin and `amc` in its environment; it is never shown, written to a file, or passed as a command argument.
- It creates the owner account with `amc user init --username <you> --password-file /dev/stdin`, using a generated password that it keeps in the Keychain (service `amc-console`). Look it up in Keychain Access if you want to sign in from a browser; `amc user password <you>` in the workspace folder sets your own, after which the app shows the console's sign-in page.
- Each launch signs in through the console's own `POST /auth/login`, with the password piped from the Keychain, and hands the app only the session cookie. The app sets it as a session-only cookie in its WebKit profile (it is not written to disk), and keeps only the console's own address in the window: `http://127.0.0.1` on the exact port Studio bound. Links to other sites, and to any other port on this Mac, open in your default browser. The session cookie is removed when you choose Stop AMC and before each start or switch.

Nothing about sign-in changed on the server: there is no new endpoint and no passwordless access. Anyone who wants an owner session still needs the password, and only processes running as you can read your Keychain, the same boundary as the remembered vault passphrase `amc up` already uses.

### Menus, quitting and errors

- Studio menu: Reload (Command-R), Open in Browser (Command-O), Try the Demo or Open My Workspace, Stop AMC, Show Logs, Close Window. The app menu has About, which shows the version, the runtime folder, the workspace folder, the launcher log, and the console account.
- Quitting asks whether to stop AMC too. When this app started Studio, Stop AMC and Quit is the default; "Do not ask again" remembers the answer.
- When something fails, the window says why and offers Retry and Show Logs: Node.js missing or too old (with where to get it), npm failing (with the log path), a port in use, or the last line `amc` wrote. The launcher log is `~/Library/Logs/Agent Maturity Compass/studio-launcher.log`.
- After an update to a new AMC version, the app clears its cached scripts and service workers before the first load, so an old cached console cannot run under the new one. Cookies and local storage stay.

### Ports

The app runs Studio on its own ports so a terminal `amc up` elsewhere keeps the defaults (3210 to 3212, 4173, 9464): the console on 127.0.0.1:3232, the gateway on 3230 and 3231, the dashboard on 4193 and metrics on 9484. The app opens the console on the port Studio actually bound. If another program holds one of these ports, the window names the port and asks you to stop that program, for example with `amc down` in its folder, then click Retry.

### Files

Launcher runtimes are stored under `~/Library/Application Support/Agent Maturity Compass/runtime` on macOS and `%LOCALAPPDATA%\Agent Maturity Compass\runtime` on Windows. Your workspace lives in the adjacent `workspace` folder and the demo in `studio-workspace`, so moving, replacing, or rebuilding an extracted app cannot corrupt them. The macOS app carries its own copy of the package tarball, so it keeps working after you move it, for example to `/Applications`. A package digest marker makes launcher upgrades deterministic: when the digest changes, the launcher stops the Studios the previous runtime started, installs the new package, and starts Studio again.

Stop Studio from Terminal with the launcher runtime's own `amc`:

```bash
# macOS
cd ~/"Library/Application Support/Agent Maturity Compass/workspace" && ../runtime/node_modules/.bin/amc down
```

```powershell
# Windows (the demo launcher keeps Studio running after you close the browser tab, on 127.0.0.1:3212)
cd "$env:LOCALAPPDATA\Agent Maturity Compass\studio-workspace"; ..\runtime\node_modules\.bin\amc.cmd down
```

### Testing a build without touching your own data

`AMC_DESKTOP_DEV_BUNDLE=1 npm run package:desktop` builds the app with the bundle identifier `co.agentmaturity.studio.dev`, so it has its own WebKit profile and keeps its data in `~/Library/Application Support/Agent Maturity Compass Dev`. The generated `launch-studio.sh` also accepts `AMC_STUDIO_SUPPORT_DIR` (all app data and the log move there) and the `AMC_*_PORT` variables, so it can be run headlessly: `launch-studio.sh info|workspace|demo|stop`.

## User Install

macOS and Linux install:

```bash
tar -xzf amc-<version>-macos-universal.tar.gz
cd amc-<version>-macos-universal
sh ./install.sh
amc
```

Without root: when the global npm folder (`$(npm prefix -g)/lib/node_modules`) is not writable by your user, `install.sh` stops before npm runs and prints the rerun command. Install into a folder you own, then add its `bin` directory to PATH:

```bash
AMC_INSTALL_PREFIX="$HOME/.local" sh ./install.sh
export PATH="$HOME/.local/bin:$PATH"
```

`sudo sh ./install.sh` is the last resort: it runs the package postinstall and the native build as root.

macOS Studio app launch:

```bash
open "Agent Maturity Compass Studio.app"
```

The installer ends with the one next step: type `amc`, which walks you through setup (`amc --version && amc doctor` checks the machine first if you want).

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

Platform status, from run receipts: macOS arm64 is qualified (`docs/PLATFORM_MATRIX.md`). The Linux archive was installed and run on `node:22-bookworm` (aarch64) on 2026-11-07, and through the hosted installer on `node:22-bookworm` and `node:22-bookworm-slim` (aarch64) on 2026-11-08, with no platform-matrix receipt. The Linux x64, macOS x64 and Windows x64 packages are built and checksum-verified by the release scripts, with no run receipt: no maintainer-run Windows receipt exists, and the CLI natively and Studio under WSL2 are both untested. The Linux archive ships no Studio launcher; after `sh ./install.sh`, `amc up` starts Studio.

Launch the Studio app by double-clicking `Agent Maturity Compass Studio.cmd`, or from PowerShell:

```powershell
& ".\Agent Maturity Compass Studio.cmd"
```

## Requirements

- Node.js 22 or 24 LTS
- npm available on PATH
- Linux: the archive is architecture-neutral (npm tarball + sh installer). On arm64, or whenever prebuilt `better-sqlite3` binaries cannot be downloaded, npm builds the native module and needs `python3`, `make` and `g++`.

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
