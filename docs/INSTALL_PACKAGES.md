# AMC Packaging & Installation Options

AMC supports multiple installation paths depending on how much friction you are willing to tolerate.

## Recommended install order

If you just want to try AMC:
1. Use the browser playground without installing anything.
2. Use the verified GitHub release installer for the real CLI and local Studio.
3. Use Docker for isolated or team environments.
4. Use a source install when contributing to AMC itself.

## Package formats

### Verified GitHub release
Best for:
- most developers
- repeatable local installs
- macOS, Linux, and Windows users who need the real CLI

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
```

```powershell
irm https://agentmaturity.co/install.ps1 | iex
```

These scripts pin the release, verify `SHA256SUMS`, and install the package tarball included in the platform archive. npm and Homebrew registry channels remain unavailable until their public publication is independently verified.

### Docker images
Best for:
- isolated evaluation
- demos
- team/local infra
- reproducible environments

Use local build commands for quickstart images unless a GHCR package has been verified public. GitHub Container Registry publication and visibility are release operations, not assumptions from source docs.

### From source
Best for:
- contributors
- debugging
- local development on the repo itself

```bash
git clone https://github.com/AgentMaturity/AgentMaturityCompass.git
cd AgentMaturityCompass
npm ci
npm run build
npm link
```

## OS notes

### macOS
- use the verified release installer; the desktop archive includes the native WebKit Studio app

### Linux
- use the verified release installer
- Docker/Compose and Helm are also supported for deployment scenarios

### Windows
- use the verified PowerShell installer for the native archive and system-browser Studio launcher
- Winget/Chocolatey support remains unavailable until maintained packages exist

## Team deployment options

For more than one person or for service-style setups:
- Docker Compose
- Helm / Kubernetes
- GitHub Actions / CI integrations

See also:
- `docs/INSTALL.md`
- `docs/DEPLOYMENT.md`
- `docs/integrations/ci-cd.md`

## Upgrade guidance

Use the path you installed with:
- macOS/Linux release installer -> rerun `curl -fsSL https://agentmaturity.co/install.sh | sh`
- Windows release installer -> rerun `irm https://agentmaturity.co/install.ps1 | iex`
- source → `git pull && npm ci && npm run build`
- Docker → pull/update image or compose stack

## Packaging roadmap

High-value future additions:
- single-binary releases for macOS/Linux/Windows
- Winget/Chocolatey packages
- clearer purpose-built container images (`core`, `all-packs`, `dev`, `sidecar`)
