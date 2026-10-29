# P0-36 qualification receipt: 1.1.1 advisory draft

P0-36 drafts the GitHub security advisory for agent-maturity-compass 1.1.1 and earlier. The draft is `docs/security/advisories/1.1.1.md`, written on base `cafe5751f` (branch `rtd/w6-p0-36`). Nothing was created, submitted or published on GitHub. Sid's review, the severity, CWE, split and CVE decisions, and publication (P0-39) are pending.

## What this folder holds

- `check-advisory-facts.mjs`: re-checks every repository fact the draft cites (80 facts: lines at tag v1.1.1 and at HEAD, commits in HEAD's history, tracked files, the vault's add and delete history). Read-only git commands only. `--keys` also lists the AMC key id of every public key ever tracked under `.amc/keys/` or `--/.amc/keys/`.
- `advisory-facts.txt`: its output at `cafe5751f` with `--keys`: 80/80 facts hold; 44 historical public keys. The key list is input for P0-37's distrust list, not a distrust list.
- `tar-traversal-probe.sh`: builds five hostile archives (`..`, absolute path, absolute and relative symlink-then-write, hard link) and extracts each the way 1.1.1 did (`tar -xzf <archive> -C <outDir>`), then reports any file outside the output directory.
- `tar-probe-darwin-bsdtar.txt`: its output on macOS bsdtar 3.5.3 (libarchive 3.7.4): all five contained.

## Checks recorded

- `check-advisory-facts.mjs`: 80/80. Mutation: changing one expected line text and one commit id made it fail with 70/72 (two FAIL lines, exit 1), then restored.
- `tar-traversal-probe.sh`: all contained, exit 0. Mutation: running it with `tar -P -xzf` reported four `ESCAPED` lines and exit 1, so the probe detects an escape.
- The 14 regression test files the draft cites (`tests/assuranceAgentResponder`, `redteamRealExecution`, `security/jailbreak`, `storage/blobKeyNoVault`, `trust/embeddedKeyForgery`, `ledgerTrustRootAnchor`, `ledgerTrustRootAnchorCli`, `vaultPassphraseSource`, `evalImportTrust`, `trustTierWriteGuard`, `noFabricatedDomainResults`, `domainExampleMode`, `tarTraversalGuard`, `trust/builtInDistrust`): 279/279 passed on the build of `cafe5751f`. This confirms the fixes on this base, not on a 2.0.0 release candidate.

## Pending (not faked)

1. **Reproduction on npm 1.1.1 (Sid or an agent with network access).** In an empty temporary directory, outside any AMC checkout: `npm i agent-maturity-compass@1.1.1`, then for each issue: (1) `amc assurance run` against an unreachable agent and confirm a passing, `OBSERVED` result; (2) with `AMC_NO_SIGN=1`, store evidence, export a bundle and decrypt one blob with the key `amc-no-sign-fallback-key-32bytes!`; (3) re-sign a bundle or certificate with a fresh key placed inside it and confirm `bundle verify` or `cert verify` passes; (4) `NODE_ENV=test amc init` without `AMC_VAULT_PASSPHRASE` and open the vault with `amc-test-passphrase`; (5) `amc eval import --trust-tier OBSERVED` and confirm the tier is stored; (6) `amc domain assess` twice for two agent ids on an empty workspace and confirm different numeric scores. Repeat each on the 2.0.0 release candidate and confirm it is refused or "not evaluated". Keep the notes private until the advisory is published.
2. **Archive extraction on Linux.** Run `sh tar-traversal-probe.sh` on GNU tar, inside `node:20-slim` (the v1.1.1 quickstart image base) and inside `node:20-alpine` (the v1.1.1 `Dockerfile` base). Any `ESCAPED` line turns "Other hardening" into issue 7 (suggested CWE-22).
3. **P0-37.** Distrust entries for the exposed keys, the rotation date and the list's URL fill issue 4's "Fixed by". Until then the draft does not say the keys are distrusted.
4. **Sid.** Severities, CWEs for issues 1 and 4, one or several advisories, CVE requests, CRA check (D-07), the draft GHSA in GitHub, and publication after npm serves 2.0.0 (P0-39).
