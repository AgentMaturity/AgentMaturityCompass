# AMC Publishing & Distribution Guide

## Overview

AMC is distributed through 5 channels:

| Channel | Status | Command |
|---------|--------|---------|
| **npm** | ✅ Ready | `npm i -g agent-maturity-compass` |
| **GitHub Releases** | ✅ Ready | `.amcrelease` bundles + SBOM |
| **Docker / GHCR** | ✅ Ready | `docker run ghcr.io/agentmaturity/amc-studio` |
| **Single-binary (SEA)** | 🧪 Experimental | host-built `amc` binary artifact |
| **Homebrew** | 🔜 Pending | `brew install AgentMaturity/tap/amc` |

---

## 1. npm — `agent-maturity-compass`

### Pre-publish checklist
```bash
# 1. Bump version in package.json
npm version patch   # or minor / major

# 2. Run full checks
npx tsc --noEmit
npx vitest run
npm run build

# 3. Dry run (inspect what gets published)
npm pack --dry-run

# 4. Publish
npm publish
```

### First-time setup
1. Create account at [npmjs.com](https://www.npmjs.com)
2. `npm login` — authenticates your session
3. `npm publish` — first publish claims the package name
4. Enable 2FA on npm account (Settings → Security)
5. For CI: create an **Automation** token in npm Settings → Access Tokens

### npm CI token (GitHub Actions)
```
GitHub repo → Settings → Secrets → Actions
Add secret: NPM_TOKEN = <your automation token>
```
The `release.yml` workflow uses this automatically on `git push v*.*.*`.

### Package metadata (already in package.json)
- `name: "agent-maturity-compass"` — the install name
- `bin: { amc: "dist/cli.js" }` — makes `amc` command available globally
- `files: ["dist/**", "README.md", "LICENSE"]` — only these ship in the package
- `engines: { node: ">=20" }` — minimum Node version enforced

---

## 2. GitHub Releases + SBOM

Automatic on every `git tag v*.*.*` push:

```bash
# Bump version
npm version patch                    # updates package.json + commits
git push origin main --follow-tags   # triggers release.yml CI

# What CI does:
# 1. npm test + build
# 2. Build .amcrelease bundle (release pack)
# 3. Build + push Docker image to GHCR
# 4. npm publish
# 5. Create GitHub Release with:
#    - amc-{VERSION}.amcrelease bundle
#    - sbom.cdx.json (CycloneDX SBOM)
#    - licenses.json
#    - provenance.json
#    - release-verify.txt
```

---

## 3. Docker / GitHub Container Registry (GHCR)

The Docker image builds automatically in `release.yml`. It is pushed to:

```
ghcr.io/agentmaturity/amc-studio:latest
ghcr.io/agentmaturity/amc-studio:v{VERSION}
```

### Local build & test
```bash
docker build -t amc-studio:dev .
docker run -p 3212:3212 -p 3210:3210 -v $(pwd)/.amc:/data/amc amc-studio:dev
```

### Docker Compose (full stack)
```bash
cd docker
docker compose up -d
# Open dashboard: http://localhost:4173
# Studio API:     http://localhost:3212
# Gateway proxy:  http://localhost:3210
```

### Make GHCR image public
```
GitHub → Packages → amc-studio → Package Settings
→ Change visibility → Public
```

### Also publish to Docker Hub (optional, broader reach)
1. Create Docker Hub account at [hub.docker.com](https://hub.docker.com)
2. Create repo: `AgentMaturity/amc-studio`
3. Add secrets to GitHub:
   ```
   DOCKERHUB_USERNAME = agentmaturity
   DOCKERHUB_TOKEN = <access token from Docker Hub>
   ```
4. Add to `release.yml`:
   ```yaml
   - name: Login to Docker Hub
     uses: docker/login-action@v3
     with:
       username: ${{ secrets.DOCKERHUB_USERNAME }}
       password: ${{ secrets.DOCKERHUB_TOKEN }}
   ```
5. Add `docker.io/AgentMaturity/amc-studio:latest` to the image tags list

---

## 4. Single-binary (experimental SEA)

AMC now has an **experimental** single-binary path using Node SEA.

Local build:
```bash
npm run build
npm run build:sea
./dist/sea/amc doctor --json
```

Current release direction:
- release CI is wired to build a host-specific Linux SEA binary artifact
- the binary and its manifest are uploaded as GitHub release assets when the release workflow runs successfully
- this is an MVP convenience path, not yet the default install route
- runtime verification remains experimental and should be checked per host/runner

See also: `docs/SINGLE_BINARY.md`

# 5. Homebrew Tap

### How Homebrew taps work
A Homebrew tap is just a GitHub repo named `homebrew-{tap-name}`.

### Step-by-step setup

```bash
# 1. Create a new GitHub repo: AgentMaturity/homebrew-tap
#    (must be named "homebrew-tap" for brew to find it)

# 2. Copy Formula/amc.rb into it
mkdir -p ~/homebrew-tap/Formula
cp Formula/amc.rb ~/homebrew-tap/Formula/amc.rb
cd ~/homebrew-tap && git init && git add . && git push AgentMaturity/homebrew-tap main

# 3. Get the SHA256 of the npm tarball AFTER publishing
curl -s https://registry.npmjs.org/agent-maturity-compass/latest | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d['dist']['tarball'])"
# Download the tarball and sha256sum it
curl -sL <tarball-url> | sha256sum

# 4. Update Formula/amc.rb with real sha256 and tarball URL
# 5. Push to homebrew-tap repo

# Users then install with:
brew tap AgentMaturity/tap
brew install amc
```

### Automate SHA256 update on release
Add to `release.yml` after npm publish:
```yaml
- name: Update Homebrew formula
  if: startsWith(github.ref, 'refs/tags/v')
  env:
    HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
  run: |
    VERSION=$(node -e 'process.stdout.write(require("./package.json").version)')
    TARBALL="https://registry.npmjs.org/agent-maturity-compass/-/agent-maturity-compass-${VERSION}.tgz"
    SHA256=$(curl -sL "$TARBALL" | sha256sum | cut -d' ' -f1)
    
    git clone https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/AgentMaturity/homebrew-tap.git /tmp/homebrew-tap
    sed -i "s|url \".*\"|url \"${TARBALL}\"|" /tmp/homebrew-tap/Formula/amc.rb
    sed -i "s|sha256 \".*\"|sha256 \"${SHA256}\"|" /tmp/homebrew-tap/Formula/amc.rb
    sed -i "s|version \".*\"|version \"${VERSION}\"|" /tmp/homebrew-tap/Formula/amc.rb
    
    cd /tmp/homebrew-tap
    git config user.name "AMC Release Bot"
    git config user.email "releases@agentmaturitycompass.dev"
    git add Formula/amc.rb
    git commit -m "chore: bump amc formula to v${VERSION}"
    git push
```

Required secrets:
```
HOMEBREW_TAP_TOKEN = GitHub Personal Access Token with repo:write scope
                     (for AgentMaturity/homebrew-tap repo)
```

---

## 5. One-liner Install Script (optional)

For `curl | sh` style installs — convenience for non-npm users:

```bash
# Create: website/install.sh
#!/usr/bin/env bash
set -euo pipefail

if command -v npm &>/dev/null; then
  npm install -g agent-maturity-compass
elif command -v brew &>/dev/null; then
  brew tap AgentMaturity/tap && brew install amc
else
  echo "Install Node.js from https://nodejs.org then run: npm i -g agent-maturity-compass"
  exit 1
fi

echo "✓ AMC installed. Run: amc init && amc quickscore"
```

Host at: `agentmaturity.co/install.sh`

Users run: `curl -fsSL https://agentmaturity.co/install.sh | sh`

---

## Release Checklist

```
[ ] npm version patch/minor/major
[ ] git push origin main --follow-tags
[ ] CI passes (test + build + publish)
[ ] GitHub Release created with all artifacts
[ ] Docker image live on GHCR
[ ] Homebrew formula auto-updated
[ ] Website install tabs updated if version shown
[ ] Tweet / announce in community
```

---

## Secrets Required (GitHub → Settings → Secrets → Actions)

| Secret | Purpose |
|--------|---------|
| `NPM_TOKEN` | npm publish (Automation type) |
| `HOMEBREW_TAP_TOKEN` | Push formula updates to homebrew-tap repo |
| `DOCKERHUB_USERNAME` | Docker Hub push (optional) |
| `DOCKERHUB_TOKEN` | Docker Hub push (optional) |
| `AMC_RELEASE_SIGNING_KEY` | Signs .amcrelease bundles |
