# Wave 4 Supply Chain Security Audit (Agent 19)

Date: 2026-02-22
Repository: `agent-maturity-compass`
Auditor: Codex

## Scope
- `package.json`
- `package-lock.json`
- `.github/workflows/*.yml`
- Existing SBOM artifacts under `docs/`

## Executive Summary
- `npm audit` online could not run in this environment due DNS/network block to `registry.npmjs.org`.
- `npm audit --offline` returned **0 vulnerabilities** (cache-only signal, not full internet advisory coverage).
- No confirmed HIGH/CRITICAL vulnerability is currently actionable from available evidence.
- Dependency confusion exposure is low in current state.
- Primary residual supply-chain risks are install-time script execution and permissive semver ranges (`^`) in direct dependencies.

## Task Results

### 1) Run `npm audit` and analyze exploitability in AMC context

Commands:
- `npm audit --json`
- `npm audit --offline --json`

Results:
- Online audit failed:
  - `getaddrinfo ENOTFOUND registry.npmjs.org`
  - `request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed`
- Offline audit reported:
  - `0` vulnerabilities (`info/low/moderate/high/critical = 0`)

Exploitability analysis for AMC:
- No vulnerability entries were returned, so there are no specific advisories to map to exploit paths.
- Runtime production dependency surface is small (6 direct prod dependencies), primarily CLI + local SQLite.
- Install-time attack surface exists via dependencies with install scripts (see Task 3): this is mainly CI/developer workstation risk, not normal AMC runtime request-path risk.

### 2) Dependency confusion attack vectors

Checks performed:
- Searched for `.npmrc` / registry overrides in repo.
- Parsed all lockfile `resolved` URLs.
- Checked for `git+`, `file:`, GitHub tarball dependencies.
- Reviewed direct dependencies for internal/private package naming patterns.

Findings:
- No `.npmrc` in repository.
- `295/295` lockfile packages resolve to `https://registry.npmjs.org/...`.
- No git/file/path dependency sources in lockfile.
- No private/internal npm package dependencies detected.

Assessment:
- Current dependency confusion risk: **LOW**.
- Residual risk remains if private packages are introduced later without scoped names and explicit registry pinning.

### 3) Overly permissive dependencies

Findings:
- All direct dependencies/devDependencies use caret ranges (`^`) in `package.json`.
- Packages with install scripts in lockfile:
  - `better-sqlite3@11.10.0` (prod)
  - `esbuild@0.27.3` (dev)
  - `esbuild@0.21.5` (transitive dev via `vite`)
  - `fsevents@2.3.3` (optional dev)

Assessment:
- Semver drift risk: **MEDIUM** (mitigated in CI by `npm ci` + committed lockfile).
- Install-script risk: **MEDIUM** (supply-chain execution during install/build stages).

### 4) Lockfile committed

Findings:
- `package-lock.json` exists and is tracked by git.
- Lockfile version: `3`.
- Integrity coverage: `295/295` packages include `integrity`.

Assessment:
- **PASS**.

### 5) Outdated dependencies with known CVEs

Constraint:
- `npm outdated --json` failed due `ENOTFOUND registry.npmjs.org`.

Best-effort local checks (selected high-signal packages):
- `minimist@1.2.8` (above historical critical PP fix floor).
- `glob-parent@5.1.2` (at historical fix level).
- `cross-spawn@7.0.6` (above historical ReDoS fix floor).

Assessment:
- No confirmed HIGH/CRITICAL CVE from available offline evidence.
- Full outdated/CVE coverage is incomplete without live registry/advisory connectivity.

### 6) Does AMC have an SBOM?

Findings:
- Yes. SBOM support exists in release workflow and CLI (`release sbom`).
- Existing CycloneDX artifact present: `docs/wave4-sbom.cdx.json`.

Assessment:
- **PASS**.

### 7) Transitive dependency scan for known malicious packages

Screened lockfile for known malicious-package incidents (name/version family checks), including:
- `event-stream`, `flatmap-stream`, `coa`, `ua-parser-js`, `node-ipc`, `colors`, `faker`, `rc`

Findings:
- No known malicious incident versions detected.
- `rc` appears as `1.2.8` only (not known compromised versions from the 2021 incident wave).

Assessment:
- **PASS** on screened set.

### 8) Findings written to `docs/wave4-supply-chain-audit.md`

Status: complete.

### 9) Fix all HIGH/CRITICAL `npm audit` vulnerabilities where possible

Command:
- `npm audit fix --offline --package-lock-only --audit-level=high`

Result:
- `found 0 vulnerabilities`
- No dependency changes were required by audit tooling in this environment.

Status:
- No confirmed HIGH/CRITICAL findings to patch from available advisory data.

### 10) Generate basic SBOM listing in `docs/sbom.md`

Status: complete.

Generated artifact:
- `docs/sbom.md`

Format:
- Markdown table with `package name`, `version`, `license`

Coverage summary:
- `295` components listed.
- `71` components have `UNKNOWN` license (mostly optional/uninstalled platform packages where local `package.json` license metadata was not available in this sandbox).

## Residual Risks and Follow-up Actions
1. Re-run online `npm audit --json` and `npm outdated --json` in a network-enabled CI runner and archive results.
2. Consider pinning direct dependencies exactly (or enforce lockfile-only update policy) for tighter drift control.
3. Restrict install-script execution in non-build CI jobs (`npm ci --ignore-scripts` where compatible).
4. Add a scheduled supply-chain check job: audit, outdated, malicious package denylist checks, and SBOM regeneration diff.
