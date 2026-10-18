# P0-50 read-only preflight — 14 October 2026

P0-50’s dependency fix is present on accepted main. [Merged PR #50](https://github.com/AgentMaturity/AgentMaturityCompass/pull/50) explicitly leaves **full ci.yml plus release:gate on the merged integration** unchecked. P0-47 remains the active implementation task.

## Current source comparison

Accepted main `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c` and committed P0-47 source `7a81b5aa7316471e841f4ae0ea684a64c85ae4a1` have identical `.github/workflows/ci.yml`, `scripts/release-gate.mjs`, `package.json`, `pnpm-lock.yaml`, `docs/NATIVE_MCP.md`, and the P0-50 changeset. The corresponding P0-47 working files also match. Observed P0-47 status contains only its untracked qualification directory.

Package range is `^1.31.0`; lock resolves `1.32.1(zod@4.4.3)`. The [official advisory](https://github.com/advisories/GHSA-6qxp-vccf-f47h) marks SDK `>=1.12.0 <1.31.0` affected and `1.31.0` patched. D-15 retains the previously verified P0-09 package snapshot and P0-49 lock snapshot. No dependency or archive change is needed by this preparation.

CI has the Node 22/24 matrix and instrumented suite. It does not directly invoke `release:gate`; the release gate separately runs production audit, with a 120-second deadline, and full covered tests, with a 900-second deadline. File equality proves source identity, not passing outcomes.

## Historical checked claims

PR50 merged at `2026-10-06T19:04:37Z`, merge `e680f2a6098b53c665b7f2ee7e738c2f05f24984`, issue commit `561f97f2c10b56a653260ad84df5881cfbcd4e78`. It marks audit, typecheck/build/package/notices/vendor/freeze/docs gates checked. It reports 7,209 parity/MCP tests across 33 files and 47/47 in `nativeMcpHttp`, `nativeMcpClient`, `reconciliationDefectsMcp`, and `reconciliationDefectsMcpHttp`. These are historical PR claims, not fresh receipts.

Historical installed stdio acceptance is source `90855cf7324ccaa710e7b82f3ab75036e89cf0b8`, Node22.22.0/macOS ARM64, 10 checks/29 commands. Historical HTTP acceptance is source `0af82e28572b325bae9389275b4904f2fca5b087`, Node22.22.0/macOS ARM64, 15 groups/36 commands. Their exact receipt SHA256 values match their final-summary records. Paths and hashes are in the JSON. Current docs say the installed HTTP acceptance used SDK1.30.0 and excludes live TLS/OAuth; it predates the current protocol and OAuth implementations. Neither qualifies SDK1.32.1.

## Current narrow evidence and remaining debt

The earlier P0-49 read-only audit used the exact same package/lock/workspace inputs: Node24.21.0, pnpm10.33.0, exit0 in 0.915 seconds, 192 production dependencies, zero reported advisories. The actual raw report is retained at `/Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass/tmp/p0-49-readonly-preflight-20261014/production-audit.json`. This preflight reran no audit.

Earlier same-source P0-47 Node24 linked parity passed 7,118 cases, including D-15 checks, but its 26 files exclude the four explicitly named MCP files. No tracked dedicated P0-50 qualification receipt was found. Fresh complete CI, release gate and current-source MCP outcomes remain the acceptance boundary; root’s broad P0-47 qualification is still active.

The advisory also describes issuer requirements for SDK OAuth providers and stored credentials. Existing AMC HTTP transport explicitly omits the SDK authProvider (`src/mcp/nativeMcpHttpTransport.ts:175-180`), and docs describe AMC-owned OAuth. No application OAuth or installed transport behavior was exercised here; a clean dependency audit cannot establish it.

No edits, tests, builds, installs, workflow triggers, publication or tracker changes occurred. No Node24 fixture command was issued. All historical work and receipts remain preserved.
