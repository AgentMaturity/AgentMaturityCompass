# AMC Publishing & Distribution Guide

## Overview

AMC has five distribution channels with explicit availability:

| Channel | Status | Command |
|---------|--------|---------|
| **Verified GitHub release installer** | Available | `curl -fsSL https://agentmaturity.co/install.sh \| sh` or Windows PowerShell installer |
| **npm** | Unavailable until the first registry publish is verified | Do not advertise `npx` or global registry installs |
| **Docker / GHCR** | Release workflow ready; public visibility must be verified | local build first; GHCR after anonymous-pull verification |
| **Single-binary (SEA)** | Experimental | host-built `amc` binary artifact |
| **Homebrew** | Unavailable until the tap exists and formula is verified | Do not advertise a tap command |

---

## 1. npm publication - `agent-maturity-compass`

The package name currently returns 404 from the public npm registry. npm remains a conditional release output, not a user-facing install channel. The tag workflow skips npm without failing GitHub asset publication when `NPM_TOKEN` is absent.

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
The `release.yml` workflow uses this automatically on `git push v*.*.*`. Until the package URL returns a real version, keep `website/install-channel.json` set to `unavailable` for npm.

### Package metadata (already in package.json)
- `name: "agent-maturity-compass"` — the install name
- `bin: { amc: "dist/cli.js" }` — makes `amc` command available globally
- `files: ["dist/**", "README.md", "LICENSE"]` — only these ship in the package
- `engines: { node: ">=20" }` — minimum Node version enforced

---

## 2. Verified GitHub Releases

Automatic on every `git tag v*.*.*` push:

```bash
# Apply pending Changesets, review the version/changelog, then tag the exact commit
npm run version-packages
git commit -am "Release AMC <version>"
git tag -a v<version> -m "AMC v<version>"
git push origin main
git push origin v<version>

# What CI does:
# 1. Run tests, build, and prepack guardrails
# 2. Build native macOS plus Linux and Windows desktop archives on macOS CI
# 3. Verify archives and emit SHA256SUMS + amc-release-manifest.json
# 4. Build + push the Docker image to GHCR
# 5. Build a signed .amcrelease only when AMC_RELEASE_SIGNING_KEY exists
# 6. Publish npm only when NPM_TOKEN exists and the version is not already live
# 7. Create the GitHub Release even when npm/signing credentials are absent
```

---

## 3. Docker / GitHub Container Registry (GHCR)

The Docker image builds automatically in `release.yml`. It is pushed to:

```
ghcr.io/agentmaturity/amc-studio:latest
ghcr.io/agentmaturity/amc-studio:v{VERSION}
```

GHCR visibility must be verified before publishing copy-paste `docker run ghcr.io/...` commands. GitHub Container Registry packages can be private by default or have independent package permissions, so public install docs should use local build commands until the package page and anonymous pull have both been verified.

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

# 3. Use the package tarball and SHA-256 attached to the verified GitHub release
VERSION=<released-version>
curl -fsSLO "https://github.com/AgentMaturity/AgentMaturityCompass/releases/download/v${VERSION}/SHA256SUMS"
grep "agent-maturity-compass-${VERSION}.tgz" SHA256SUMS

# 4. Update Formula/amc.rb with real sha256 and tarball URL
# 5. Push to homebrew-tap repo

# Users then install with:
# Do not publish a user command until the tap repository and formula test pass.
```

### Automate SHA256 update on release
The current `release.yml` already updates the tap from the GitHub release tarball when `HOMEBREW_TAP_TOKEN` is configured. Keep the channel unavailable until a clean-machine formula test passes.

Reference shape:
```yaml
- name: Update Homebrew formula
  if: startsWith(github.ref, 'refs/tags/v')
  env:
    HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
  run: |
    VERSION=$(node -e 'process.stdout.write(require("./package.json").version)')
    TARBALL="https://github.com/${GITHUB_REPOSITORY}/releases/download/v${VERSION}/agent-maturity-compass-${VERSION}.tgz"
    SHA256=$(awk -v asset="agent-maturity-compass-${VERSION}.tgz" '$2 == asset { print $1 }' dist/release-assets/SHA256SUMS)
    
    git clone https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/AgentMaturity/homebrew-tap.git /tmp/homebrew-tap
    sed -i "s|url \".*\"|url \"${TARBALL}\"|" /tmp/homebrew-tap/Formula/amc.rb
    sed -i "s|sha256 \".*\"|sha256 \"${SHA256}\"|" /tmp/homebrew-tap/Formula/amc.rb
    sed -i "s|version \".*\"|version \"${VERSION}\"|" /tmp/homebrew-tap/Formula/amc.rb
    
    cd /tmp/homebrew-tap
    git config user.name "AMC Release Bot"
    git config user.email "releases@agentmaturity.co"
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

## 6. Hosted verified installers

`website/install.sh` and `website/install.ps1` are the canonical public bootstrap paths. They:

- pin a specific AMC release version;
- download the exact platform archive and `SHA256SUMS` from that release;
- reject missing, malformed, or mismatched hashes;
- reject unsafe archive paths;
- run only the installer contained in the verified archive;
- require that archive installer to verify its included package tarball again.

Host at: `agentmaturity.co/install.sh`

Users run `curl -fsSL https://agentmaturity.co/install.sh | sh` on macOS/Linux or `irm https://agentmaturity.co/install.ps1 | iex` in Windows PowerShell.

---

## Release Checklist

```
[ ] Apply pending Changesets and review the resulting version/changelog
[ ] Commit the release version and push `main`
[ ] Create and push the matching annotated tag
[ ] Release CI passes tests, builds, package verification, and checksums
[ ] GitHub Release contains all three platform archives, npm-format tarball, manifest, and `SHA256SUMS`
[ ] Run both checksum-negative and clean-install verification
[ ] Verify Docker image visibility before publishing its pull command
[ ] Verify npm independently before marking its channel available
[ ] Verify Homebrew independently before marking its channel available
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
