# P2-07 independent OIDC verifier: bounded qualification

The committed candidate adds one verifier test file against unchanged merged production source. The fresh-checkout canonical run passed 150/150 cases: 128 new verifier cases and the original 22 cases in three files. Both exact source controls produced their intended body assertion failures, and both reviewed byte restorations passed 150/150. This is bounded verifier qualification; full P2-07, global quality, interoperability, hosted merge and release acceptance remain open.

Source candidate: `2ca678025b26c74d9c7509f1e5d9f3979e2eae90`, branch `codex/p2-07-oidc-qualification`. The parent `67c4fc34fc8602fe607e44de8d0eb61b9d89959b` appears in the earlier working-tree command records. The later metadata commit contains this packet and does not change the source that Q installed and built. Node 22.23.3, ABI 127, macOS arm64 and the retained pnpm 10.33.0 version observation describe the local toolchain. No new cross-platform result is implied.

| Actual invocation | Result |
| --- | --- |
| Existing identity baseline, three files | 22/22; natural exit 0 |
| Initial admitted v2, four files | 149 passed, 1 cleanup failure; natural exit 1 |
| Corrected R v3, four files | 150/150; natural exit 0, 11,048 ms |
| Source typecheck, full test typecheck, lint and build | Passed |
| Counts, freeze, docs drift and architecture | Passed |
| Clean-source committed clone, frozen install/build and native smoke | Passed; 47,169 ms |
| Fresh Q canonical, four files | 150/150; natural exit 0, 11,968 ms |
| M1: bypass signature refusal | 148 passed, 2 failed; exact restoration 150/150 |
| M2: make only absent exp optional | 149 passed, 1 failed; exact restoration 150/150 |
| Duplicates and dead-code delta | Failed: 1,268 and 2,729 findings; no waiver |

These invocations overlap; their totals are not added. Canonical receipt tests refer only to the fresh 150-case run. Complete actual command triples, heads, argv, environment policy, natural close records and log hashes are in `commands.json` and the private reference index. The nonzero runs are preserved, including the actual fixture failure, intentional source controls and quality failures.

## Finite contracts and public observations

The new corpus uses real Node RSA-2048, RSA-PSS and P-256 signing plus actual owned HTTP/JWKS servers. It covers required finite exp and iat, bounded skew and exact time boundaries, optional nbf, issuer, audience/azp, subject and nonce; malformed token encoding; wrong-key and flipped signatures; compatible JWK type, use, algorithm, operations and unambiguous selection; and refusal of none, HS256 and EdDSA. Raw signed JSON numeric overflow distinguishes nonfinite numbers from serialized null. The current accepted policy remains fixed RS256/PS256/ES256.

Real cache cases warm a known key, observe one unknown-key rotation refresh and suppress another refresh within the actual sixty-second clock window. Advancing the claims-only clock does not advance that cache clock. A real failed refresh retains known keys without authorizing unknown ones. URL, literal-loopback opt-in and discovery issuer/endpoint checks, exact form request bytes, redirect refusal, sanitized status errors, invalid JSON/object/UTF-8, one-MiB response boundaries and the real ten-second request timeout are exercised. The finite twelve-second owned endpoint fallback is server behavior, not a changed client or test deadline. The repository's thirty-second deadline and global guards remain unchanged.

The six `public-fresh-*.json` observations belong to this actual fresh Q phase. They cover three algorithms, rotation, failed refresh and timeout: eight owned HTTP requests with all recorded responses, servers and socket sets closed, exact opt-in restoration and no handler, transport or cleanup errors. The fresh timeout observation records 10,006.714875 ms. No tolerated abort-whitelist event occurred. The records contain synthetic local claims and lifecycle/request facts, not JWTs, signature bytes, public JWKs or private signing keys. They do not permit independent offline signature replay or external IdP/authorship attestation. Other successful temporary fixtures were removed after natural closure; failed roots and raw evidence remain private.

## Preserved fixture corrections and causal masking

Unexecuted v1 was blocked because owned transport errors and errors emitted during closure could be missed. V2 captured scoped code/message/request/connection facts, allowed only narrowly confirmed peer aborts after actual refusal assertions, and checked errors after natural server closure. Its first real four-file run passed 149/150. The timeout body had passed at 10,005.757208 ms, but the cleanup snapshot showed a closed, non-listening server with one custom socket-close callback still unobserved. That snapshot remains failed; later process absence does not turn it green or prove the precise event order by itself.

V3 stores a promise for every actual connection when observed, deletes that socket and resolves in the same close handler, then awaits all stored promises after natural `server.close()`. The original closed/listening/zero-socket predicate and post-close error classification remain strict. No sleep, polling, forced socket destruction, signal, retry or deadline change was added. Every test definition and assertion is preserved. Corrected R and fresh Q runs passed. The independently reviewed v1/v2/v3 bytes, reviews and original failure remain pinned in `test-corrections.json` and `private-references.json`.

M1 changes only the existing signature-refusal decision. A genuine wrong-key token and a flipped signature return `ok:true` instead of the exact signature-invalid refusal. Their first failing body assertions are at 267:71 and 274:65. The request-count assertions at 268 and 275 are masked and receive no credit. The flipped-signature case's initial unmodified-token verification passed; the separate wrong-key case has no prior positive prerequisite. Restoring exact original source returns 150/150.

M2 makes only missing exp optional while retaining iat and malformed-present/expired exp checks. The separate genuinely signed missing-exp case returns `ok:true` with no exp instead of `id_token missing exp`, failing at 281:10. Its request-count assertion at 282 is masked. Exact restoration returns 150/150. These are actual source-Vitest body AssertionErrors, not collection, hook, timeout or cleanup failures. Neither mutant rebuilt compiled files; no compiler-valid, build-valid or compiled-mutant sensitivity is claimed.

## Binding, quality and remaining acceptance

The fresh checkout performed its own committed clone, frozen installation, build and native smoke. Root and the independent audit verified 81 selected source/corpus pairs at R and Q, twelve selected compiled rows across both roots, the borrowed R Vitest entry and separate native identities. Native inodes are R 539175547 and Q 542293271, each with link count 1. The command uses R's installed Vitest with physical Q as `--root`; this is not an independent Q runner. Private HOME, inherited environment and cwd are disclosed. Owned-group ESRCH establishes absence at the recorded observations, not universal detached-descendant exclusion or OS isolation. Both roots were recorded clean after exact restorations. Selected byte/stat checks are not an independent audit of every transitive file or whole Git tree.

The source candidate contains the new test and ten exact count-only published inventory overlays; production, existing Claude fixtures, verifier policy, guards, freeze and quality baselines remain unchanged. Freeze remains 1,236 CLI command paths, 1,236 inventory paths, 41 station packs and 632 questions. Current duplicate findings remain 1,268 with zero new clones; dead-code findings remain 2,729 with no additions or removals. Both quality commands actually exited 1. No ratchet change, baseline adoption or waiver occurred. Source counts are not passing test counts.

The packet is built only after the closed independent causal review reports no blockers and final restoration and closure records match. It does not itself assert ordinary receipt validation: private mirror validation, exact receipt-folder admission, repository materialization, ordinary whole-root validation and post-write preservation are separate root operations. The builder computes all selected bodies before exclusive writes; filesystem I/O is not transactional, so a write failure must be retained rather than erased or automatically retried.

Full P2-07 remains open. Provider-specific algorithm knobs, requireNbf and failed-refresh logging are ordinary unfinished source requirements. Five-minute cache expiry, refresh eligibility after sixty seconds, concurrent coalescing, mixed-DNS/rebinding, browser correlation/session fixation, tenant/email policy, recorded Okta/Entra fixtures and live interoperability are not qualified here. Existing compact JSON SAML compatibility passing does not establish standard SAML. Specific pending-login restart/reuse/expiry tests and full SCIM hardening remain separate. Full suite/coverage, packed-install/runtime audit, hosted CI/PR/merge/release, formal Done and downstream readiness are not established. The next allocation remains separately admitted pending-state qualification and genuinely unblocked OIDC work. Actual SAML ADR/dependency/private-tenant decisions, Claude ownership, all explicit holds and paused work are preserved. F37 remains skipped.
