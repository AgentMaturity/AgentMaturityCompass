# P1-25 bounded offline timestamp verifier qualification

This checkpoint qualifies the existing offline RFC 3161 verifier and its configured-anchor artifact-time seam. The local source commit is `2792ccc6ad68f9ec3df97fbdfc63718727245695` on `codex/p1-25-timestamp-qualification`. Full P1-25 acceptance, global quality, CI, release and plan completion remain open.

The source change adds one fixed 17-case test file and 11 public, test-only fixture files (105,252 bytes). The existing count generator updates 15 numeric inventory spans across ten files, from 1,686 to 1,687 test source files. These are source-path counts, not passing-test claims. Existing production source, existing tests, authored prose, package, lockfile, source generator, freeze baseline and guards are unchanged. Claude variants and the held runner work are preserved.

## Actual cryptographic fixture evidence

The reviewed private generator used installed OpenSSL 3.6.5 with no new package or network request. Its 41 serial children produced 40 exit-zero results and one expected exit-4 refusal of a corrupted signed attribute. Every child was waited naturally with its streams retained. The public corpus contains genuine RSA-2048/SHA-256 CMS tokens and certificates, a query, original TSTInfo, a granted response and a one-byte corruption. All private keys, CSRs, CA databases and bootstrap certificates remain outside the public corpus and this receipt. The private generator is identified by hash; its executable source is not published here as a substitute for the still-unallocated source generator.

The valid primary independently passed `openssl ts -verify` against its original query, nonce, pinned local root, intermediate and fixed validation time. All four independently signed tokens recovered the exact original TSTInfo under CMS signature/content verification. The deliberately missing-EKU, noncritical-EKU and expired certificates were checked with CMS `-noverify` solely to isolate signature/content verification; those results do not imply accepted PKI policy. AMC subsequently refused each with its intended error code.

The digest, nonce, policy and 16-October genTime were encoded before CMS signing; certificate validity was supplied before certificate signing. These controlled dates do not establish historical existence or external TSA attestation. OpenSSL's granted-response conversion extracted back to the exact original CMS token. Independent ASN.1 inspection locates signedAttrs at offset 1889, messageDigest's OCTET STRING at 1935, and its value at 1937. The corruption changes only that first value byte; OpenSSL refuses its signature. The cohort covers RSA/SHA-256, not the broader supported algorithm matrix. Revocation remains explicitly unchecked (`false`).

## Observed test and control chain

The unchanged trust-list/report baseline passed 30/30. The source run passed 47/47: 17 timestamp cases and 30 unchanged trust cases across three files. The 17 cases cover raw and granted-response positives, wrong digest, wrong nonce, signed-attribute corruption, unrelated root, excluded policy, missing EKU, noncritical EKU, expiry at signed genTime, rejection status, truncated DER, the 65,537-byte boundary, and four artifact-time seams. The artifact-time seam supplies configured anchors through the existing pure test helper; it does not authenticate a signed trust list or prove published report/CLI integration.

A retained fresh checkout of the exact source commit completed frozen installation, build, doctor and the ordinary keyless one-turn and cross-process two-turn signed checks. That helper runs no Vitest. The fresh test/control sequence separately observed:

| Phase | Passed | Failed | Exit |
|---|---:|---:|---:|
| Fresh canonical | 47 | 0 | 0 |
| Imprint comparison removed | 46 | 1 | 1 |
| Exact restoration | 47 | 0 | 0 |
| Final pinned-root refusal replaced | 45 | 2 | 1 |
| Exact restoration | 47 | 0 | 0 |

All five runs contain the same 47 ordered file/title occurrences and unique per-run observer IDs. Each has 28 hook-bearing task entries, 29 passing hook values, no unhandled or late errors, and natural owned-process-group absence. These cohorts are not added into a larger passing-test total.

Removing the comparison makes line 127 receive `ok:true` instead of `TST_IMPRINT_MISMATCH`, after the same-body genuine positive. Accepting the unrelated root makes line 143 receive `ok:true` instead of `TST_UNTRUSTED_TSA`. It also changes artifact time from claimed/null to an attested upper bound at line 199. That secondary failure masks the later assertions on lines 200–202; those assertions receive no separate control credit. Both operators changed only fresh-clone source and were restored byte-for-byte before their green reruns. No compiled sensitivity is claimed. The M1 patch representation was reconstructed from saved original bytes and a mutant matching the actual apply hash; M2's patch was captured from its live owned diff.

## Checks and preservation

Production and test TypeScript checks, lint, build, counts, gate reachability, threat model, architecture boundaries, docs drift and freeze passed. The initial stale-count failure is retained, followed by the ordinary generator and successful check. The final fresh counts, gates and freeze also passed. Freeze remains 1,236 command paths, 1,236 inventory paths, 41 station packs and 632 pack questions. No suggested baseline update was applied.

Global quality remains RED: 1,268 duplicate findings and 2,724 dead-code findings before and after this change. Both checks remain failures, with no waiver or baseline adoption. The held manual-generator/Knip D15 decision remains open. Ordinary source staging reported ignored `docs/internal` paths, but all 22 intended staged blobs matched their reviewed working bytes; whitespace validation and the ordinary local commit passed. No force-add, ignore-rule edit, no-verify, reset, stash or release operation was used. The separately held provider archive remains ignored and unstaged.

The source and fresh checkout are clean at the source checkpoint. Forty-four bound source, compiled, config and new files match between them. The source, borrowed runner and fresh native module retain distinct physical inodes with link count one; none was copied, relinked or rebuilt in an existing checkout. All 88 finite protected ownership inputs, including the 26 held-runner-related pins and ten Claude pins, remain exact. These finite checks do not imply universal filesystem or descendant isolation.

Before allocation, 177 registered/retained roots had no proposed test, fixture or receipt paths and no target history/status conflict. Hosted WIP was zero after excluding 13 verified Dependabot PRs only from WIP; every PR's changed paths remained included in overlap checks. D15 reported no snapshot needed. The new fresh clone is retained separately after that admission.

Claude's live reservations file is missing from its old path. The last-known binding (275,376 bytes; SHA-256 `9ac6ae7493c2bf579218c5bd075042f423e52727950090bb1e3f39dbadb133ca`) remains binding. Current deltas cannot be checked, and the normal shared append has not happened. A private exact reservation entry is retained for a later append if the real record returns. Disappearance does not release existing work. The finite review supports only these disjoint new test/fixture/receipt paths and the separately admitted generated count spans.

An optional read-only reservation snapshot scan lost its nested exec session identifier. Natural process closure remains unestablished; the scan supplies no snapshot, absence, ownership-release, command or qualification credit. A later exact command-marker metadata lookup found no match, which does not prove descendant absence. The limitation remains recorded without retry, signal or deletion.

## Remaining acceptance and next item

P1-25 remains open for P1-01/schema dependencies, the held package-review approval criterion, the admitted source generator, in-process TSA and client fallback/required-time behavior, checkpoint windows and pending-to-verified integration, session sealing, issuance token embedding, report/CLI presentation, broader algorithms, CI interoperability, full suite and global quality. This checkpoint does not resolve any held decision, including F37's skip, P0-29 successors, P0-22 empty results, P0-09 key precedence, the written D-03 health skip until P2-06, or the provider archive hold.

The next routed item is P1-11. Its read-only preparation is separate; implementation must retain the same ownership, freeze and quality requirements. This checkpoint is local and has no PR, push, merge, release or tracker-Done claim.

## Raw evidence representation

Ordinary metadata staging correctly rejected trailing whitespace and blank EOF lines in 18 intrinsic log/patch files. Their original bytes remain preserved in the private first packet and original producers. This packet reuses the existing lossless JSON evidence format: each `.evidence.json` file names its original relative path, byte count and SHA-256 and carries exact base64 bytes. Decode and verify those fields before reading it as the original log or patch. Every round trip was checked. The adoption map and original staging failure are included. No raw producer, command outcome, source control, receipt validator or Git whitespace policy was changed.
