# AMC Publishing & Distribution Guide

## Overview

AMC has five distribution channels with explicit availability:

| Channel | Status | Command |
|---------|--------|---------|
| **Verified GitHub release installer** | Available | `curl -fsSL https://agentmaturity.co/install.sh \| sh` or Windows PowerShell installer |
| **npm** | Live with 1.1.1; 2.0.0 is prepared, not published | Publishes only from `release.yml` on a `v*.*.*` tag |
| **Docker / GHCR** | Release workflow ready; public visibility must be verified | local build first; GHCR after anonymous-pull verification |
| **Single-binary (SEA)** | Experimental | host-built `amc` binary artifact |
| **Homebrew** | Unavailable until the tap exists and formula is verified | Do not advertise a tap command |

---

## 1. npm publication - `agent-maturity-compass`

npm serves 1.1.1 (published 15 July 2026). Version 1.2.0 was prepared in the repository but never published; its changes ship in 2.0.0 (D-12).

### One publish path

Only the `release` job of `.github/workflows/release.yml` publishes. It runs on a `v*.*.*` tag (or a dispatch naming an existing tag) inside the protected GitHub environment `release`, whose required reviewers approve each run (P0-38). It fails instead of skipping:

- no `AMC_RELEASE_SIGNING_KEY` in the environment, or no committed release public key at `trust/amc-release-signing.pub` (P0-37): the job fails before anything is published;
- no npm credential: `npm publish` fails, and so does the job. The only skip left is "this version is already on npm".

`npm-publish.yml` only opens version PRs (when `CHANGESETS_GITHUB_TOKEN` is set); it never publishes, tags or creates a release. `pnpm release` no longer publishes from a shell: it exits 1 and points here.

### npm credentials (P0-38 picks one)

- **Trusted publishing (preferred, no token):** on npmjs.com, add a GitHub Actions trusted publisher for `AgentMaturity/AgentMaturityCompass`, workflow `release.yml`, environment `release`. The job already grants `id-token: write`. Trusted publishing needs npm 11.5.1 or later; the job pins npm 11.10.1 and logs `npm --version`.
- **Granular token:** an npm granular access token limited to `agent-maturity-compass`, stored as the `release` environment secret `NPM_TOKEN` (`gh secret set NPM_TOKEN --env release`), never at repository level.

Both publish with `--provenance --access public`.

### Prepare a release

One command, run on a clean checkout of the release commit:

```bash
npm run release:prepare -- 2.0.0
```

It refuses unless the pending changesets give that version from the last published one (`website/publication-status.json`), regenerates `docs/releases/<version>.md` (`npm run release:notes` regenerates its two generated blocks on their own), runs `changeset version` from the published version so it never versions on top of the unpublished 1.2.0, folds 1.2.0 into the release's single CHANGELOG heading, syncs the version-coupled files, then runs `check-release-candidate`, `check-pack-contents`, `npm publish --dry-run` (its `prepack` runs the full release gate) and the packed-install check. It never publishes, tags or commits. Rerunning it is safe: once versioned, nothing is pending, and it repeats the checks and dry runs. Review and commit the result, then follow the [release runbook](RELEASE_RUNBOOK.md).

### Package metadata

- `name: "agent-maturity-compass"`, `bin: { amc: "dist/cli.js" }`, `engines: { node: ">=20" }` (Node 22 and 24 are the qualified runtimes).
- `files` in `package.json` is the publish file set. `node scripts/check-pack-contents.mjs` packs it, refuses `AMC_OS/`, `.amc/`, `tests/`, `src/`, `research/`, `plans/`, key files, vault data and env files, secret-scans the tarball and reports its size, file count and SHA-256.

---

## 2. Verified GitHub Releases

A `v*.*.*` tag push runs `release.yml`:

```bash
# After release:prepare, commit, PR and merge, tag the exact release commit
git tag -a v<version> -m "AMC v<version>"
git push origin v<version>

# What CI does:
# 1. Build native macOS plus Linux and Windows desktop archives on macOS CI, verify them, emit SHA256SUMS + amc-release-manifest.json
# 2. Build, qualify and push the Studio image per architecture (P0-35)
# 3. In the release environment (after approval): check the release candidate, run the tests, build, check the version
#    contract, prepack guardrails and package contents
# 4. Create the multi-platform image tags from the qualified digests
# 5. Build the signed .amcrelease and verify it with --pubkey trust/amc-release-signing.pub; fail without the key
# 6. Publish npm (trusted publishing or NPM_TOKEN); fail without a credential
# 7. Create the GitHub Release with docs/releases/<version>.md as its body and every asset, failing if one is missing
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
docker build --target studio -t amc-studio:dev .
docker run --rm amc-studio:dev --help
```

For Studio startup with persistent state and runtime secret files, use the [source container guide](../docker/README.md). Build the CI image with `docker build --target runner -t amc-runner:dev .`. The former `Dockerfile.runner` and `deploy/compose/Dockerfile` are replaced by targets in the root Dockerfile. Linux container qualification and the separate release gate must pass before publication.

### Docker Compose (full stack)
```bash
cd docker
# Create the runtime secret files described in ../deploy/compose/README.md first.
docker compose up -d --build
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
[ ] npm run release:prepare -- <version> passes; review and commit its result
[ ] Merge to `main`, then create and push the matching annotated tag
[ ] Approve the `release` environment run only for that version
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

## Secrets (environment `release`, set by P0-38; names only)

| Secret | Purpose |
|--------|---------|
| `AMC_RELEASE_SIGNING_KEY` | Signs the .amcrelease bundle (base64 PEM); the release fails without it |
| `NPM_TOKEN` | Only for token publishing; trusted publishing needs no secret |
| `HOMEBREW_TAP_TOKEN` | Pushes formula updates once the tap exists; skipped while it is unset |
| `CHANGESETS_GITHUB_TOKEN` | Repository secret for `npm-publish.yml` version PRs only |
| `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | Docker Hub push (optional; not wired) |
