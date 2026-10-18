# P0-49 read-only preflight — 14 October 2026

The landed P0-49 dependency fix remains present. One fresh production audit under Node 24 passed with no reported advisories. This is preparation while P0-47 broad qualification runs; P0-29 remains skipped.

Source: `7a81b5aa7316471e841f4ae0ea684a64c85ae4a1` in `/Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass`. `package.json` and `pnpm-lock.yaml` are byte-identical to accepted main `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`. Node `v24.21.0`, pnpm `10.33.0`.

## Current observations

- `proxy-addr` override is `^2.0.8`; lock and installed runtime resolve `@modelcontextprotocol/sdk 1.32.1 > express 5.2.1 > proxy-addr 2.0.8`. Its dependencies remain `forwarded 0.2.0` and `ipaddr.js 1.9.1`.
- Package and lock override maps agree. Installed/locked versions: `qs 6.16.0`, `fast-uri 3.1.8`, `hono 4.13.7`, `ip-address 10.7.2`, `proxy-addr 2.0.8`.
- The preserved P0-49 lock archive contains historical `proxy-addr 2.0.7`. Its SHA256 is `6ee56db74a48240aca2a66072fd62ada30a468a73bd2fc839b98fe5ab325466b`; bytes equal the blob at base `b552b69cd220d7d73b63a58685f77bb2bbb26c8f`, which is an ancestor of current HEAD. The P0-09 package archive also matches its declared hash and base blob. No archive replacement is needed.

## One fresh audit

Command: `pnpm audit --prod --audit-level moderate --json`. Start `2026-10-14T13:47:05.919652+00:00`; end `2026-10-14T13:47:06.834739+00:00`; elapsed `0.915` seconds; actual exit `0`. The actual JSON reports 192 production dependencies, zero devDependencies, and zero info/low/moderate/high/critical vulnerabilities.

Raw JSON: `/Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass/tmp/p0-49-readonly-preflight-20261014/production-audit.json` (SHA256 `c30e0af322a954d2a84a0b344aa586a7c82f6b8b477eaff81df8ddc26cc2f5f9`). Stderr is empty. Package, lock and workspace hashes stayed unchanged; git status remains clean.

## Acceptance and existing coverage

[Merged PR #42](https://github.com/AgentMaturity/AgentMaturityCompass/pull/42) records the override, lock update, D-15 archive and security changeset. Its 1,525-file, 21,457-test proof and 17/19 release-gate result are historical. The current [official advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) confirms critical severity, affected `>=1.1.0 <2.0.8` and patched `2.0.8`. Official publication metadata differs from the old PR’s 6 October date.

`tests/releaseReadinessScripts.test.ts:24-40,54-66` checks gate registration, production-only scope and moderate threshold. `tests/planEditsManifest.test.ts:43-80` checks snapshot hashes and provenance. `tests/explainabilityContractParity.test.ts:154-158` validates the landed lock contract. There is no dedicated proxy-addr version assertion in the searched tests. Earlier same-source P0-47 Node24 results passed 7,118 linked cases, including all 16 helper/manifest cases; this preflight reran no tests.

## Remaining qualification debt

A passing production advisory audit does not prove the full current suite, global/per-file coverage, clean-source, packed install, e2e or complete release gate. Root’s P0-47 broad qualification is still active. No fresh installed-package spoofing behavior test was run. Existing source, archive and audit evidence supports retaining the fix and moving to the required qualification boundary; it does not justify changing trackers.

The existing graph was used for navigation only: 36,459 nodes, indexed last seen on 8 September 2026. Actual source was verified. No graph refresh occurred.

No source, package, lock, tracker or other fixture was changed. No install, update, broad test, repeated audit, commit or publication occurred. The JSON contains exact source hashes, archive witnesses, commands, receipts and limitations.
