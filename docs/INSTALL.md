# AMC Installation Guide

## System Requirements

| Component | Minimum |
|-----------|---------|
| Node.js | 22 or 24 LTS for production; package engine floor remains ≥ 20 |
| RAM | 512 MB |
| Disk | 100 MB + evidence storage |
| OS | macOS, Linux (Ubuntu/Debian, RHEL/CentOS), Windows |

## Option A: Verified GitHub Release Install

The published npm package and GitHub release are **1.1.1**. The current repository is **1.2.0 source**; use [Option B](#option-b-from-github-development) for its native agent workflow and to continue development on another device. Public 1.1.1 installation does not provide the current `agent-loop guide` or chat workflow. See [publication evidence](../website/publication-status.json).

macOS or Linux:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://agentmaturity.co/install.ps1 | iex
```

Both hosted installers pin the published 1.1.1 release, fetch the platform archive and `SHA256SUMS` from GitHub Releases, and refuse to execute the packaged installer when integrity verification fails. The downloaded archive then verifies its included package tarball before npm installs that local file. npm also publishes 1.1.1; the Homebrew tap is not publicly available.

After installation:

```bash
amc demo run --no-vault  # try a live gateway demo without vault setup
amc demo prospect        # guided 5-minute prospect flow
amc setup --demo    # demo workspace with sample data
# or
amc init            # empty production workspace
```

`amc demo run --no-vault` uses an ephemeral demo workspace and labels its output `DEMO_ONLY`. `amc demo share --public-base-url <url>` writes a static prospect leave-behind bundle and prints a URL for the host you publish to. Both are for first-look demos, not production audit evidence.

Use Node 22 or 24 LTS. Node 20 reached end of life on April 30, 2026; the package's minimum engine declaration is not a production support recommendation. Native dependencies such as `better-sqlite3` must match the selected Node ABI. The configured CI matrix and an actual passing platform receipt are distinct; installation and launcher qualification remain tracked under AMC-1530. See the [official Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json).

## Option B: From GitHub (Development)

Install Node.js 22 or 24 first. Enable Corepack so the repository's `packageManager` field selects pnpm 10.33.0; if Corepack is unavailable, use `npm install --global pnpm@10.33.0` instead.

```bash
corepack enable
git clone https://github.com/AgentMaturity/AgentMaturityCompass.git
cd AgentMaturityCompass
pnpm install --frozen-lockfile
pnpm run build
npm link            # makes `amc` available globally
```

AMC is a pnpm workspace (`packageManager` pins the version). `npm ci` cannot resolve the `workspace:*`
protocol the vendored `@amc/*` packages use, so it fails here by design.
`pnpm run build` compiles the CLI; the vendored packages and `@amc/core` ship
their compiled `lib/` in the tree, so no separate vendor build is needed unless
you edit them (`npm run build:vendor`).

A fresh source clone restores committed development work, not private runtime state or credentials. Configure a real provider/model on the new device using [the native workflow guide](NATIVE_AGENT_WORKFLOW.md), or explicitly select `stub` for a local recording demonstration. Session recovery does not grant cross-host takeover; review the [session ownership limits](SESSION_RESUME.md) before attempting runtime continuation.

**Source runtime vs published release.** The native governed agent loop is
built on the composition kernel `@amc/core` and the vendored `@amc/cordis`
family, which are private workspace packages. Since the build bundles that
closure into `dist/kernel/amcRuntime.js` (`scripts/bundle-kernel.mjs`), the
packed tarball carries the runtime too: `npm run check:packed-install` packs as
`npm publish` would, installs into a fresh directory with an empty HOME, proves
`@amc/core` is *not* resolvable there, and still completes a keyless native
turn over a fully signed session. `npm run check:clean-source` runs the
documented frozen install and build with an empty HOME/config and only OS/tool
discovery settings inherited. It explicitly selects the keyless stub provider,
then requires structured signed-evidence verification and request reconstruction
for a tool turn and a session resumed by a separate process. Its output reports
the attempted source revision; successful execution qualifies only that checkout
and host. These local checks do not establish public release acceptance.

Verify:

```bash
amc --version
amc doctor
```

## Option C: Desktop Installer Archives

AMC can generate portable installer archives for macOS, Linux, and Windows from a local build:

```bash
npm run package:desktop
npm run package:desktop:verify
```

Archives are written to `dist/installers/archives/` and install AMC from the included AMC npm tarball. The macOS and Windows archives also include the `Agent Maturity Compass Studio` launcher app. It verifies the included package digest, installs that exact build into a version-pinned per-user runtime, and starts the loopback-only local demo from a separate persistent `studio-workspace` directory. The native macOS build uses a native WebKit window; Windows uses the system browser. Neither launcher falls back to a global `amc` installation or bundles a browser runtime. npm still needs access to AMC's public runtime dependencies unless they are already cached or mirrored.

See `docs/DESKTOP_PACKAGES.md` for user install commands, manifest hashes, and legal/provenance notes.

## Option D: Docker Compose

```bash
git clone https://github.com/AgentMaturity/AgentMaturityCompass.git
cd AgentMaturityCompass/deploy/compose
cp .env.example .env    # edit ports and deployment settings
cp secrets/amc_vault_passphrase.txt.example secrets/amc_vault_passphrase.txt
cp secrets/amc_owner_username.txt.example secrets/amc_owner_username.txt
cp secrets/amc_owner_password.txt.example secrets/amc_owner_password.txt
```

Replace all three template values with your own vault passphrase, owner username and owner password before starting. These are untracked runtime files, not `.env` settings. Keep them private on the host and readable by container UID 10001, as described in [the container guide](../docker/README.md#studio-with-persistent-state). Then run:

```bash
docker compose up -d --build
```

Studio available at `http://localhost:3212`. Gateway at `http://localhost:3210`.

For TLS termination (production):

Configure `AMC_TLS_HOST` and the additional notary secret files using the [Compose prerequisites and TLS instructions](../deploy/compose/README.md) before starting this stack.

```bash
docker compose -f docker-compose.tls.yml up -d --build
```

## Option E: Kubernetes (Helm)

```bash
helm install amc deploy/helm/amc \
  --set replicaCount=2 \
  --set workspace.persistence.size=10Gi \
  --set ingress.enabled=true
```

Validate the chart first:

```bash
helm lint deploy/helm/amc
helm template amc deploy/helm/amc
```

See `deploy/helm/amc/values.yaml` for all configurable values.

For production rollout, secret creation, health checks, rollback, Kustomize, and the Terraform Helm-release example, see `docs/KUBERNETES_HELM_DEPLOYMENT.md`.

## Platform-Specific Notes

### macOS

```bash
brew install node@22
curl -fsSL https://agentmaturity.co/install.sh | sh
```

For the packaged desktop app path, unpack the macOS archive generated by `npm run package:desktop`, run `sh ./install.sh`, then open `Agent Maturity Compass Studio.app`.

### Ubuntu / Debian

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
curl -fsSL https://agentmaturity.co/install.sh | sh
```

### RHEL / CentOS

```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo yum install -y nodejs
curl -fsSL https://agentmaturity.co/install.sh | sh
```

### Windows

Run `irm https://agentmaturity.co/install.ps1 | iex` in PowerShell. It downloads and verifies the Windows release archive, which includes `install.ps1` plus the `Agent Maturity Compass Studio.cmd` launcher. You can also install WSL2 with Ubuntu and follow the Ubuntu instructions above.

## Post-Install Verification

```bash
amc --version       # prints version
amc doctor          # install readiness before init; full checks after init
amc doctor --strict # require an initialized, healthy workspace
amc doctor-fix      # auto-repairs common issues
```

In a new directory, default doctor exits zero when the CLI is healthy and tells you to run `amc`; it does not treat not-yet-created signatures or Gateway config as failures. Use `--strict` in CI and production deployment checks.

## Upgrading

```bash
# Verified release channel
curl -fsSL https://agentmaturity.co/install.sh | sh

# Windows PowerShell
irm https://agentmaturity.co/install.ps1 | iex

# GitHub
cd AgentMaturityCompass && git pull && pnpm install --frozen-lockfile && pnpm run build

# Docker
cd deploy/compose && docker compose pull && docker compose up -d --build

# Helm
helm upgrade amc deploy/helm/amc
```

## Uninstalling

```bash
npm uninstall -g agent-maturity-compass
rm -rf .amc/    # removes workspace data (back up first!)
```
