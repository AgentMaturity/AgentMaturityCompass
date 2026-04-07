# AMC Packaging & Installation Options

AMC supports multiple installation paths depending on how much friction you are willing to tolerate.

## Recommended install order

If you just want to try AMC:
1. `npx agent-maturity-compass quickscore`
2. `npm i -g agent-maturity-compass`
3. Homebrew on macOS
4. Docker for isolated or team environments
5. Source install for contributors

## Package formats

### npm / npx
Best for:
- most developers
- CI runners
- quick evaluation

```bash
npx agent-maturity-compass quickscore
npm i -g agent-maturity-compass
```

### Homebrew
Best for:
- macOS users
- repeat installs on developer machines

```bash
brew tap AgentMaturity/amc
brew install agent-maturity-compass
```

### Docker images
Best for:
- isolated evaluation
- demos
- team/local infra
- reproducible environments

Common images referenced in repo/docs include quickstart and compose-based deployment flows.

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
- npm and Homebrew are the smoothest paths

### Linux
- npm is the mainline path
- Docker/Compose and Helm are also supported for deployment scenarios

### Windows
- WSL2 is the recommended environment today
- native Windows package-manager support (Winget/Chocolatey) is a worthwhile future direction, but should be treated as additive until fully maintained

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
- npm → `npm update -g agent-maturity-compass`
- Homebrew → `brew upgrade agent-maturity-compass`
- source → `git pull && npm ci && npm run build`
- Docker → pull/update image or compose stack

## Packaging roadmap

High-value future additions:
- single-binary releases for macOS/Linux/Windows
- Winget/Chocolatey packages
- clearer purpose-built container images (`core`, `all-packs`, `dev`, `sidecar`)
