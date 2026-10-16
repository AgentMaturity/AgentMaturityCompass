# P2-07 OIDC verifier and persisted login state: bounded qualification

The fresh committed checkout passed 154/154 tests across five files: 128 verifier cases, 22 existing identity/security cases and four new pending-state cases. Two independent source controls reached their intended body assertions; each exact restoration passed the complete 154-case corpus. This checkpoint qualifies those bounded observations. Full P2-07 and global quality acceptance remain open.

The active source candidate is `b3473a9ccdd41c5a7e453bc132d2cb2c59387a82`, branch `codex/p2-07-pending-state-qualification`. It adds `tests/identity/pendingLoginStore.test.ts` and ten exact source-inventory count overlays. Production code, existing tests, guards and baselines are unchanged. The earlier R five-file run occurred at parent `5696f68c241e411e1d55e39319194ddd9a768988` with the new test in its working tree; its command provenance remains historical. All five Q baseline/control/restoration phases use committed b347. Node 22.23.3, ABI127, pnpm 10.33.0 and macOS arm64 describe the actual local toolchain.

The original 25-file verifier packet remains archived at metadata commit `5696f68c241e411e1d55e39319194ddd9a768988`, for source `2ca678025b26c74d9c7509f1e5d9f3979e2eae90`. Its 23 non-index artifacts remain byte-identical in this folder, including historical 150-case observations, actual fixture failure, verifier controls and quality findings. Only `receipt.json` and this README are versioned; flat `pending-state-*` artifacts hold the new checkpoint. Historical commands and findings are not relabeled as checks on b347.

| Actual invocation | Result |
| --- | --- |
| Initial four pending-state cases | 4/4; natural exit0 |
| R five-file corpus before source commit | 154/154; natural exit0; 10,930ms |
| Source and full test typechecks, lint and build | Passed |
| Counts, freeze, docs drift and architecture | Passed |
| Committed clean-source clone, frozen install/build and native smoke | Passed; 48,791ms |
| Fresh Q canonical | 154/154; natural exit0; 11,881ms |
| M1: retain consumed pending state | 151 passed, 3 body failures; natural exit1 |
| Original restored after M1 | 154/154; natural exit0; 11,012ms |
| M2: remove exact-expiry comparison | 152 passed, 2 body failures; natural exit1 |
| Original restored after M2 | 154/154; natural exit0; 10,900ms |
| Duplicate and dead-code checks | Failed: 1,268 and 2,727 findings; no waiver |

These invocations overlap. Receipt tests refer only to the single actual fresh canonical 154-case run. Full command triples, original heads, environment policy, closed process/group records and log hashes are retained in `pending-state-commands.json` and its private reference index. All nonzero commands remain recorded.

## Pending-state behavior and causal controls

The new fixture uses public signed identity/provider setup and a minimal auth-only host. A real owned loopback IdP signs RS256 tokens, verifies S256 PKCE and exact client/redirect/grant inputs, and consumes authorization codes once. Router A starts a login and closes naturally. The parent vault is explicitly locked before a fresh Node child starts the compiled router on the same port and canonical host directory. The callback creates an identity session, `/auth/me` confirms the expected identity, and replay is refused before a second exchange. This exercises persisted state across a cold router replacement without raw fixture SQL or global pool cleanup.

Separate TS-router and public-store cases check exact expiry. The direct store accepts elapsed599999ms, rejects600000ms, and refuses reuse of the consumed expired row. Scoped `Date.now` replacement restores both the exact function and property descriptor. The real-clock router retry after expiry remains refused without a token exchange. All four pending fixture roots are retained. Public records contain lifecycle facts and fixed assertions; no JWT, signing-key, vault or database bodies are copied.

M1 changes only DELETE RETURNING to the sealed equivalent SELECT. Its primary witness is line430: a direct second consume returns after the valid first material/timestamp assertion, instead of throwing `OIDC state mismatch`. Line431's refusal milestone is masked. Additional actual failures occur at416, where the restored-clock retry returns302 after the initial exact-TTL400 and zero-exchange assertions passed, and448, where reconsuming retained expired state throws `OIDC state expired` instead of mismatch. The same-line retry JSON, line417 cookie/count checks and line418 milestone are masked by416; line449's milestone is masked by448.

M2 removes only ` || row.expiresTs <= now`. Its primary witness is line446: exact-TTL consume returns after the TTL-minus-one positive, instead of throwing `OIDC state expired`. Lines447-449's milestone, consumed-row assertion and final milestone are masked. The TS router also returns302 at412 with an actual token exchange; the same-line expiry envelope, line413 cookie/count checks and lines415-418 retry checks are masked. All five failures are plain reached body AssertionErrors, with clean hooks and cleanup. No setup, native, timeout or transport failure is credited as a semantic control result.

Both operators use separately preserved originals, actual body review before restore and exact original-byte restoration. Neither rebuilds compiled outputs. The cold child always imports original compiled modules during these TS-only controls; its passing branch receives no mutant-sensitivity credit. No mutant compiler/build validity is claimed.

## Preservation, quality and remaining work

Each 154-case execution has the same unique raw/observer identities, preserves the original22, passes all27 hooks and has no unhandled or late diagnostics. Actual post-exit logs and natural owned-group ESRCH records supplement the run-end observer. All inspected client, IdP, server and socket closures pass. The six independently inspected cold children naturally exit0 without a signal, have recorded PID absence and actually empty complete streams. Repeated lifecycle transcripts are preservation evidence, not additional test coverage or independent cryptographic replay.

The new fresh checkout performed its own committed clone, frozen installation, build and native smoke. Root and the independent review verify 83 selected R/Q source pairs, 16 compiled rows and 185 distinct selected physical files. Native inodes remain R539175547 and Q542399330, each with link count1 and the same qualified bytes. The command uses R's installed Vitest with physical Q as `--root`; it is not an independent Q runner. Private HOME and inherited environment are disclosed. Selected-file checks and recorded PID/PGID absence do not establish OS isolation, every transitive import or universal detached-descendant exclusion. Both roots are clean after restoration; historical compiler halts and closure certificates remain preserved.

Freeze remains 1,236 CLI paths, 1,236 inventory paths, 41 packs and 632 questions. Duplicates remain1,268 with a byte-identical prior summary. Dead-code findings decrease from2,729 to2,727 with zero additions: the new test genuinely calls `hostVaultStatus` and `lockHostVault`, removing those two unused-export findings. This is test-usage attribution, not a production dead-code repair. Both quality commands actually exit1. No baseline adoption, ratchet change, deadline change or waiver occurred. Published source counts are not passing-test totals.

Full P2-07 remains unfinished. Provider-specific algorithm policy, required-nbf configuration and failed-refresh logging are the next local source requirements. Current production still uses fixed RS256/PS256/ES256 policy. Browser correlation/session replacement, secure non-loopback startup, tenant/email policy, standard SAML, SCIM hardening, recorded Okta/Entra fixtures and live interoperability remain separate. Passing compact SAML compatibility does not establish standard SAML. Actual library/private-tenant decisions, Claude ownership, held decisions and paused work remain open. F37 remains skipped. Full-suite/coverage, hosted CI/merge/release and full-plan completion are not established by this packet.
