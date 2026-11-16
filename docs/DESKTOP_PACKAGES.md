# AMC Desktop Packages

AMC can produce portable installer archives for macOS, Linux, and Windows from the local repository build. Each archive includes an `Agent Maturity Compass Studio` launcher app so people can start the local Studio console without typing CLI commands.

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

Each archive also contains a Studio launcher:

- macOS: `Agent Maturity Compass Studio.app`
- Windows: `Agent Maturity Compass Studio.cmd`, `Agent Maturity Compass Studio.ps1` and `amc-studio.ico` (the icon of the Start menu shortcut the launcher makes)
- Linux: `amc-studio.sh` (the launcher), `launch-studio.sh` (the steps it runs, shared with the macOS app) and `icons/hicolor/{48x48,128x128,256x256,512x512}/apps/agent-maturity-compass-studio.png`

Each launcher app verifies the included tarball digest, installs that exact AMC package into a version-pinned per-user runtime, and runs its private `amc` executable. It never falls back to an older global `amc` install. Studio binds only to loopback, on the app's own ports (below), and every launcher starts your own workspace by default, with A4 Forge on (it is on by default; only `AMC_A4_PREVIEW=0` turns it off) and the console's home page first.

The native macOS build renders the Compass Console in a native WebKit window. Each of the Windows and Linux launchers, and the macOS cross-build fallback, opens the same local Studio console in the system browser. The launcher app does not bundle Electron, Chromium, WebKit content, or another browser runtime.

**Node.js.** One rule everywhere: Node.js 20 or newer (`engines.node` in package.json; the launchers read it from there when they are built). Every launcher says which `node` it picked, and refuses an older one with a message that names the version and the path it found.

**Time limits.** A first launch downloads AMC's dependencies from the npm registry. npm gets 30 seconds per request and two retries, and the whole install at most 15 minutes; starting Studio gets 5 minutes. When a limit passes, the launcher stops npm or `amc up` with every process under it and says what happened and what to do next. Stopping the launcher (quitting the app, Ctrl+C, closing the window) stops what it started, including a Studio it was still starting.

## The macOS app

### First launch

1. The window opens and asks how to start, in plain words: AMC keeps its records on this Mac, in `~/Library/Application Support/Agent Maturity Compass/workspace`. Setting up creates your own workspace there, a signing vault whose passphrase AMC keeps in your macOS Keychain, and an owner account named after your macOS user that the app signs in with for you. The choices are Set Up My Workspace, Try the Demo, and Quit.
2. While it works, the window shows what it is doing: "Installing AMC (first launch only)", then "Creating your workspace (first launch only)" and "Creating your owner account", with a Quit button. Installing runs npm and needs network access for AMC's public dependencies; it takes a minute or two, and at most 15 minutes before the app stops it and offers Retry and Quit.
3. The Compass Console opens, signed in as the owner, so every control works: run tasks, score your own agent, connect Claude Code or Codex. The first start also runs AMC's first baseline score.

Later launches go straight to the console, signed in. Studio > Try the Demo switches to the view-only sample workspace, and Studio > Open My Workspace switches back; the two never run at the same time.

### How the app signs you in

- The launcher generates a vault passphrase and writes it to the macOS Keychain entry that `amc up` already reads (service `amc-vault`, one account per workspace). It reaches `security` on stdin and `amc` in its environment; it is never shown, written to a file, or passed as a command argument.
- It creates the owner account with `amc user init --username <you> --password-file /dev/stdin`, using a generated password that it keeps in the Keychain (service `amc-console`). Look it up in Keychain Access if you want to sign in from a browser.
- If the console refuses that password (it was changed elsewhere, or the Keychain entry was lost), the launcher sets a new one once, in the Keychain and on the account (`amc user password`, with the vault passphrase from the Keychain in its environment and the password on stdin), and signs in with it. If signing in still fails, the window says so and offers Retry; it never leaves you on a sign-in page whose password only the Keychain knows.
- Each launch signs in through the console's own `POST /auth/login`, with the password piped from the Keychain, and hands the app only the session cookie. The app sets it as a session-only cookie in its WebKit profile (it is not written to disk), and keeps only the console's own address in the window: `http://127.0.0.1` on the exact port Studio bound. Links to other sites, and to any other port on this Mac, open in your default browser. The session cookie is removed when you choose Stop AMC and before each start or switch.

Nothing about sign-in changed on the server: there is no new endpoint and no passwordless access. Anyone who wants an owner session still needs the password, and only processes running as you can read your Keychain, the same boundary as the remembered vault passphrase `amc up` already uses.

### Menus, quitting and errors

- Studio menu: Reload (Command-R), Open in Browser (Command-O), Try the Demo or Open My Workspace, Stop AMC, Show Logs, Close Window. Window menu: Minimize (Command-M), Zoom, Bring All to Front. Help menu: Agent Maturity Compass Studio Help (opens https://agentmaturity.co/docs/) and Show Logs. The app menu has About, which shows the version, the Node.js in use, the runtime folder, the workspace folder, the launcher log, and the console account.
- Quitting asks whether to stop AMC too. When this app started Studio, Stop AMC and Quit is the default; "Do not ask again" remembers the answer. Quitting while AMC is still starting stops the launcher, which stops npm and a Studio it was starting.
- When something fails, the window says why and offers Retry, Show Logs and Quit: Node.js missing or too old (with the version and path it found), npm failing or taking too long (with the log path), a port in use, or the last line `amc` wrote. Messages never tell you to type `amc` unless an `amc` command is on the app's PATH; where a command is needed they give the app's own `amc` by its full path. The launcher log is `~/Library/Logs/Agent Maturity Compass/studio-launcher.log`.
- After an update to a new AMC version, the app clears its cached scripts and service workers before the first load, so an old cached console cannot run under the new one. Cookies and local storage stay.

### Ports

The app runs Studio on its own ports so a terminal `amc up` elsewhere keeps the defaults (3210 to 3212, 4173, 9464): the console on 127.0.0.1:3232, the gateway on 3230 and 3231, the dashboard on 4193 and metrics on 9484. The app opens the console on the port Studio actually bound. If one of these ports is taken, the window says by whom: another AMC Studio (told by its `_studio-daemon` process), or another program by its process name, and asks you to stop it, then click Retry. The Windows and Linux launchers use the same ports.

### Files

Launcher runtimes are stored under `~/Library/Application Support/Agent Maturity Compass/runtime` on macOS, `%LOCALAPPDATA%\Agent Maturity Compass\runtime` on Windows and `~/.local/share/agent-maturity-compass/runtime` on Linux (`$XDG_DATA_HOME` when set). Your workspace lives in the adjacent `workspace` folder and the demo in `studio-workspace`, so moving, replacing, or rebuilding an extracted app cannot corrupt them. The macOS app carries its own copy of the package tarball, so it keeps working after you move it, for example to `/Applications`. A package digest marker makes launcher upgrades deterministic: when the digest changes, the launcher stops the Studios the previous runtime started, installs the new package, and starts Studio again.

Stop Studio from Terminal with the launcher runtime's own `amc`:

```bash
# macOS
cd ~/"Library/Application Support/Agent Maturity Compass/workspace" && ../runtime/node_modules/.bin/amc down
```

```powershell
# Windows (Studio keeps running after you close the browser tab)
& ".\Agent Maturity Compass Studio.cmd" -Stop
```

```bash
# Linux
sh ./amc-studio.sh --stop
```

### Testing a build without touching your own data

The launcher files live in `scripts/desktop/`: `StudioApp.m` (the macOS window), `launch-studio.sh` (macOS and Linux), `amc-studio-linux.sh` and `studio-windows.ps1`. The packager fills their `__AMC_…__` values (package name, digest, Node.js rule, platform) through `scripts/desktop/files.mjs`, which the tests use too.

`AMC_DESKTOP_DEV_BUNDLE=1 npm run package:desktop` builds the app with the bundle identifier `co.agentmaturity.studio.dev`, so it has its own WebKit profile and keeps its data in `~/Library/Application Support/Agent Maturity Compass Dev`. The generated `launch-studio.sh` also accepts `AMC_STUDIO_SUPPORT_DIR` (all app data and the log move there) and the `AMC_*_PORT` variables, so it can be run headlessly: `launch-studio.sh info|workspace|demo|stop`. `AMC_LAUNCHER_INSTALL_LIMIT` and `AMC_LAUNCHER_START_LIMIT` (seconds) shorten the time limits for a test.

## Windows and Linux launchers

Both are generated and unit-tested on macOS only; neither has been run on a real Windows or Linux machine yet.

- **Windows.** Double-click `Agent Maturity Compass Studio.cmd` (add `-Demo` for the view-only demo, `-Stop` to stop it). It checks Node.js, installs the runtime under `%LOCALAPPDATA%\Agent Maturity Compass`, starts your own workspace on the app's ports (so a terminal `amc up` on 3210 to 3212 can run beside it), and on first launch asks in its window for the password of your owner account (`amc user init`). The first run adds a Start menu shortcut, `Agent Maturity Compass Studio`, with `amc-studio.ico` as its icon (`-NoShortcut` skips it); the shortcut starts AMC from the extracted folder, so keep that folder.
- **Linux.** `sh ./amc-studio.sh` in a terminal does the same, with data under `~/.local/share/agent-maturity-compass`, and opens the console with `xdg-open`. `sh ./amc-studio.sh --add-to-menu` writes `~/.local/share/applications/agent-maturity-compass-studio.desktop` (it runs the launcher in a terminal, so AMC can ask for the owner password) and copies the PNG icons into `~/.local/share/icons/hicolor`.

## Why the app does not carry its dependencies

A first launch needs the internet because npm downloads AMC's dependencies. Carrying them in the app was studied on 2026-11-17 (AMC 1.2.0): its 141 production packages take about 54 MB unpacked, and every licence is permissive (MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, and two dual-licensed packages, `expand-template` (MIT or WTFPL) and `rc` (BSD-2-Clause, MIT or Apache-2.0)). They are still not bundled, because `better-sqlite3` is a native module built for one Node.js version and one processor: a bundle would have to carry a prebuilt binary for every Node.js major from 20 up on both arm64 and x64, fetched from GitHub when the package is built, and a newer Node.js on the user's Mac would still need the internet. Until AMC can ship those binaries, or a dependency-free database, the launcher limits the download and says plainly when it fails.

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

Platform status, from run receipts: macOS arm64 is qualified (`docs/PLATFORM_MATRIX.md`). The Linux archive was installed and run on `node:22-bookworm` (aarch64) on 2026-11-07, and through the hosted installer on `node:22-bookworm` and `node:22-bookworm-slim` (aarch64) on 2026-11-08, with no platform-matrix receipt. The Linux x64, macOS x64 and Windows x64 packages are built and checksum-verified by the release scripts, with no run receipt: no maintainer-run Windows receipt exists, and the CLI natively and Studio under WSL2 are both untested. The Linux archive's Studio launcher (`amc-studio.sh`) and the Windows Studio launcher have not been run on those systems.

Launch the Studio app by double-clicking `Agent Maturity Compass Studio.cmd`, or from PowerShell:

```powershell
& ".\Agent Maturity Compass Studio.cmd"
```

## Requirements

- Node.js 20 or newer, with npm (it comes with Node.js)
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

The verifier checks archive hashes, required platform files, the macOS, Windows and Linux launcher files and icons, that every installer and Studio launcher pins the npm tarball digest, npm tarball contents, and the manifest legal posture.
