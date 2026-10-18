# P0-49 bounded installed-dependency qualification — 17 October 2026

The existing proxy-addr 2.0.8 fix passed 39 direct API regression vectors on Node 22.23.3 (darwin arm64). Removing only the two prefix >=96 conjuncts in memory made the unchanged corpus fail nine semantic assertions (30 passed, 9 failed). A new original-module process passed all 39 again. No installed source, dependency, cache override, production file, archive or freeze rule was changed.

The nine control failures cover single/multiple short mapped CIDRs, mapped peers, mixed ranges, the /95 boundary and three forged X-Forwarded-For request fixtures. Legitimate IPv4/native-IPv6 trust and forwarding cases remain in the same corpus. The control is narrower than a historical release: proxy-addr 2.0.7 was not run. These are 39 distinct scalar vectors, not 117 unique tests or a Vitest suite.

The registry integrity value equals the lockfile and actual downloaded tarball SHA-512. Every one of the five published package members equals the installed member byte for byte. Actual resolution uses forwarded 0.2.0 and ipaddr.js 1.9.1. Current package and lock both use the override ^2.0.8. The existing audit:runtime script (pnpm audit --prod --audit-level moderate) exited 0 and printed "No known vulnerabilities found". The earlier unquoted outer-shell download attempt failed before H launched; its evidence is retained.

Target source: 076e4c79486f4b1669e0593bc374e56fcb9636e1 on codex/p1-28-qualification. H executes from the separate held p1-09 worktree; its printed HEAD is not the target commit. Every listed phase has its actual result and natural process closure. The control command remains exit 1. ordered-case-audit.json retains every fixed oracle and actual row, failure stack, input binding, command pin and source hash.

The unchanged freeze check passed (1236 CLI paths, 41 station packs, 632 questions). The finite ownership read returned 445 normal reads across 196 aliases, 193 physical roots and 24 history authorities; all 3752 held file pins matched at both endpoints. Dependabot is excluded from WIP only: WIP was zero, and eight package.json overlaps remain recorded. No ownership transfer or foreign-file edit was inferred. All 19 admitted source, 51 protected source/fixture and 17 native file pins still matched after these runs.

The existing P0-49 lockfile archive matches its manifest row. Whole D15 acceptance remains open on the explicitly held P2-07 archive. P1-28 retains 19 full-suite failures; dead-code 2710 and duplicate occurrences 1268 remain RED and unwaived. F37 remains skipped, unfixed and unqualified. All human, Claude and publication holds remain open.

The post-packet qualification check validated 32 receipts. Freeze, published counts and docs drift passed unchanged (336 documentation files scanned). Dead-code and duplicate checks both exited 1, retaining 2710 findings and 1268 occurrences respectively. These failures are not waived.

This receipt establishes the bounded installed-library behavior and runtime audit only. No real socket, deployed trust configuration, Express/Studio enforcement, hosted CI, full release gate, whole P0-49 acceptance or plan completion is asserted. P0-48’s remaining matrix/CI failures and the full-suite/global-quality failures require separate admitted work.
