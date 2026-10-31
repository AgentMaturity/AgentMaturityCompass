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

Only the `release` job of `.github/workflows/release.yml` publishes. The workflow runs only on a `v*.*.*` tag push: no `workflow_dispatch` input, `pull_request` or `pull_request_target` trigger can choose what is released or reach a secret. The released ref is the tag that triggered the run, and every job checks that the tag still names the commit the gate ran on. To retry, re-run the jobs of that tag's run.

A person approves before anything runs: the first job, `approve`, runs in the protected GitHub environment `release` and fails closed unless that environment has required reviewers and a deployment rule. The `sign`, `release` and (when enabled) `homebrew` jobs run in the same environment too, so re-running any one of them waits for approval again, and every other job that pushes or publishes needs `approve`. Expect three approvals per release: `approve`, `sign` and `release`.

It publishes exactly the bytes that passed the gate. The `gate` job checks out the tag, records the commit it names, builds and packs the npm tarball once into `tmp/npm-release/`, generates the SBOM, licence inventory and SEA binary there, and writes `record.json` with the tag, the commit and every file's SHA-256 (`scripts/release-record.mjs`). The full release gate, the packed-install and install-persona checks, `check-pack-contents` and `npm publish <tarball> --dry-run` then run against that tarball file, and the files are passed on as the `amc-gated-release` artifact. Every later job checks out that commit by SHA, refuses a tag that moved or was re-pointed, and verifies the record before using a file. The desktop archives wrap the gated tarball, the `image-tags` job makes the Studio image tags only from the per-architecture digests the image job qualified, and the `sign` job (which holds only the signing key, in its signing step) builds the signing tool from the frozen lockfile and signs a bundle that embeds the gated tarball, SBOM and licence inventory byte for byte.

Secrets appear only in the `env:` of the one step that uses them: `NPM_TOKEN` in the publish step, `AMC_RELEASE_SIGNING_KEY` in the signing step, `HOMEBREW_TAP_TOKEN` in the Homebrew step and `GITHUB_TOKEN` in the GHCR login (piped to `--password-stdin`), the environment check and `gh release create` steps. None is set at workflow or job level, passed to an action input, written into a command line or URL, printed or uploaded.

The `release` job is the only job with `id-token: write` or an npm credential. It installs, builds and downloads nothing and uses no action but checkout and artifact download. It checks the tag and the record, unpacks the npm CLI that the unprivileged `npm-cli` job fetched and checked against the pinned version and integrity (`NPM_CLI_VERSION`, `NPM_CLI_INTEGRITY` at the top of `release.yml`), checks that integrity, the tag and the record again, and runs `npm publish <gated tarball>` with the runner's Node. The `github-release` job, which holds only `contents: write`, then creates the release with `gh release create --verify-tag` from the verified files. Homebrew is off until the tap exists: setting the repository variable `AMC_HOMEBREW_TAP=enabled` turns on the `homebrew` job, which then fails without `HOMEBREW_TAP_TOKEN`. Every job declares least-privilege `permissions:`; the workflow default is `contents: read`. Actions stay at `@version` with a TODO for Sid to pin each by full commit SHA, as in `deploy-pack.yml`.

The `release` job fails instead of skipping:

- no `AMC_RELEASE_SIGNING_KEY` in the environment, or no committed release public key at `trust/amc-release-signing.pub` (P0-37): the job fails before anything is published;
- no npm credential: `npm publish` fails, and so does the job. The only skip left is "this version is already on npm".

`npm-publish.yml` only opens version PRs (when `CHANGESETS_GITHUB_TOKEN` is set), through `release-prepare.mjs --version-only`, on every push to `main`, every Tuesday at 09:00 UTC and on manual dispatch (P1-41 weekly train, [RELEASE_CADENCE.md](RELEASE_CADENCE.md)); it never publishes, tags or creates a release. Its default permission is `contents: read`; only the `version-pr` job holds `contents: write` and `pull-requests: write`, and its checkout keeps no credentials, so changesets/action pushes with `CHANGESETS_GITHUB_TOKEN` and CI runs on the version PR. The changesets CLI itself cannot version this repository: `pnpm-workspace.yaml` lists only `vendor/*` and `packages/*`, so `changeset version` and `changeset status` never see the root package (since the 2026-08-22 vendoring). `pnpm release` no longer publishes from a shell: it exits 1 and points here.

### Needs Sid: the `release` environment (P0-38)

The workflow cannot create this protection itself: GitHub creates an unprotected environment when a workflow names a missing one, which is why the `approve` job refuses to continue without it. Before the first release tag:

1. GitHub → AgentMaturity/AgentMaturityCompass → Settings → Environments → New environment `release`.
2. Required reviewers: Sid and the D-10 backup.
3. Deployment branches and tags: "Selected branches and tags", with only the tag rule `v*.*.*`.
4. Environment secrets: `AMC_RELEASE_SIGNING_KEY` (P0-37's new key, base64 PEM); `NPM_TOKEN` only for token publishing; `HOMEBREW_TAP_TOKEN` only after the tap exists, together with the repository variable `AMC_HOMEBREW_TAP=enabled`. No npm credential at repository level.
5. On npmjs.com, the trusted publisher names workflow `release.yml` and environment `release`.
6. A tag ruleset that lets only Sid create, move or delete `v*` tags (P0-38 step 6).

On the first tag, check that the `approve` job logs the number of required reviewers. Not verified: whether the workflow's `GITHUB_TOKEN` (with `actions: read`) may read the environment's protection rules. If that call is refused, the release stops there, by design; grant the read or ask for a change, but do not remove the check.

### Needs Sid: the weekly release train (P1-41)

The workflows are in the repository; these settings are not, and only Sid can make them:

1. **Version PR token.** Repository secret `CHANGESETS_GITHUB_TOKEN`: a fine-grained personal access token for `AgentMaturity/AgentMaturityCompass` only, with Contents and Pull requests read and write and nothing else. Set an expiry and a calendar reminder (P0-38): an expired token stops the version PR silently. Without it, `npm-publish.yml` logs a notice and opens no PR.
2. **Schedule.** Confirm the release weekday and UTC time. The defaults are `cron: "0 9 * * 2"` (Tuesday 09:00 UTC, the version PR) in `npm-publish.yml` and `cron: "0 6 * * 1"` (Monday 06:00 UTC, the distribution figure) in `post-publish-verify.yml`; Wednesday is release day. For the single-maintainer scope (D-01 option B) keep the schedule and merge monthly.
3. **Branch protection on `main`.** A ruleset that requires a pull request and the CI checks `build-test (22)`, `build-test (24)` (they include the release-notes claim-word check) and `changeset`, so a version PR merges only when green. Keep "Allow GitHub Actions to create and approve pull requests" off: the version PR is opened with the token above, not the workflow token.
4. **Release environment.** The `release` environment with required reviewers and the `v*.*.*` tag rule (above) gates every weekly release; the train adds nothing to it.
5. **GHCR visibility.** Make `amc-studio` public, or `post-publish-verify.yml` reports the image as not pullable anonymously.
6. **After each release.** Merge the post-publish pins PR that records the version in `website/publication-status.json`; `release:prepare` plans the next version from it.
7. **PyPI: held per D-12.** No PyPI workflow exists. If D-12 later publishes the Python SDK, first register a pending publisher on pypi.org (project `amc-sdk`, owner `AgentMaturity`, repository `AgentMaturityCompass`, workflow `pypi-publish.yml`, environment `pypi`), then add that workflow with its contract test.

### npm credentials (P0-38 picks one)

- **Trusted publishing (preferred, no token):** on npmjs.com, add a GitHub Actions trusted publisher for `AgentMaturity/AgentMaturityCompass`, workflow `release.yml`, environment `release`. The `release` job grants `id-token: write`. Trusted publishing needs npm 11.5.1 or later; the workflow pins npm 11.10.1 by integrity and logs the Node and npm versions it publishes with.
- **Granular token:** an npm granular access token limited to `agent-maturity-compass`, stored as the `release` environment secret `NPM_TOKEN` (`gh secret set NPM_TOKEN --env release`), never at repository level.

Both publish with `--provenance --access public`.

### Prepare a release

One command, run on a clean checkout of the release commit:

```bash
npm run release:prepare -- 2.0.0
```

It refuses unless the pending changesets give that version from the last published one (`website/publication-status.json`), regenerates `docs/releases/<version>.md` (`npm run release:notes` regenerates its two generated blocks on their own), applies the version from the published one (package.json, a CHANGELOG section in changesets' format, the consumed changesets removed) so it never versions on top of the unpublished 1.2.0, folds 1.2.0 into the release's single CHANGELOG heading, syncs the version-coupled files and runs `check-release-candidate`. It then packs the tarball once into `tmp/npm-release/` and runs the full release gate, `check-pack-contents`, the packed-install check and `npm publish <tarball> --dry-run` against that file, as the `gate` job does, and prints its SHA-256. It never publishes, tags or commits; the tag's own run packs and gates its tarball again at the tagged commit. Rerunning it is safe: once versioned, nothing is pending, and it repeats the checks and dry runs. Review and commit the result, then follow the [release runbook](RELEASE_RUNBOOK.md).

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
# 0. approve, in the release environment after approval: refuse anything but a tag push and an unprotected environment
# 1. gate: resolve the tag to a commit, check the release candidate, build, pack the npm tarball once, record it,
#    run the full release gate, the content check and the publish dry run on that file, upload it
# 2. desktop-assets: wrap the gated tarball in the macOS, Linux and Windows archives; emit SHA256SUMS + manifest
# 3. image: build, qualify and push the Studio image per architecture at the gated commit (P0-35)
# 4. image-tags: create the multi-platform tags from the qualified digests (packages: write)
# 5. npm-cli: fetch the pinned npm CLI tarball and check its integrity (unprivileged)
# 6. sign, in the release environment after approval: sign the bundle around the gated files and verify it with
#    --pubkey trust/amc-release-signing.pub; fail without the key
# 7. release, in the release environment after approval: verify the tag, the record and the npm CLI, publish the
#    gated tarball; fail without a credential
# 8. github-release: create the GitHub Release from verified files with docs/releases/<version>.md as its body,
#    failing if an asset is missing
# 9. homebrew, only with AMC_HOMEBREW_TAP=enabled, in the release environment: update the tap formula
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

Each release uses the copyable [release checklist](program/release-checklist.md); the [release runbook](RELEASE_RUNBOOK.md) has the commands.

---

## Secrets (environment `release`, set by P0-38; names only)

| Secret | Purpose |
|--------|---------|
| `AMC_RELEASE_SIGNING_KEY` | Signs the .amcrelease bundle (base64 PEM); the release fails without it |
| `NPM_TOKEN` | Only for token publishing; trusted publishing needs no secret |
| `HOMEBREW_TAP_TOKEN` | Pushes formula updates once the tap exists and `AMC_HOMEBREW_TAP=enabled`; the job fails without it then |
| `CHANGESETS_GITHUB_TOKEN` | Repository secret for `npm-publish.yml` version PRs only (fine-grained, this repository, Contents and Pull requests write) |
| `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | Docker Hub push (optional; not wired) |
