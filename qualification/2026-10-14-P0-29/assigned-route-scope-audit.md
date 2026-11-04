# P0-29 assigned route scope audit — 14 October 2026

Three material route-scope conflicts affect five already-assigned non-final rows. These are proposals for an explicit owner/scope decision, not approved reassignments. Known P0-29 mappings remain preserved.

Accepted main: `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`. Input SHA-256: `2ef11713d5863fb57f18032e1e7c73b1bbc96f6ba5654e7c2def6c539b7c99b0`. Triaged 93 assigned non-final rows across 22 keys; focused review only. The 38 null routes and paused groups were excluded.

| Rows | Current key | Concrete scope conflict | Proposed handling, pending authority |
| --- | --- | --- | --- |
| G5-12 | P0-28 | The six packsEnabled policy toggles are schema/default state without runner consumption; truthfully counting packs does not implement or retire policy toggles. P0-28 is the documentation truth reset and explicitly excludes code behavior; its touch scope only allows selected CLI descriptions, count generation, docs and website work. | Keep P0-28 for docs wording/count claims only. Ask Sid to name an approved implementation/removal successor for the unresolved toggles, or explicitly expand acceptance. Do not silently assign another existing key. |
| G6-18, G8-27 | P0-34 | The candidate itself says argument-parser and recurrence acceptance remains unperformed. Absence/ignore of --json/--verbose and temporary files does not prove flag parsing is fixed. P0-34 prepares version, changelog, hidden surfaces, package contents and publishing workflows; its only CLI registration edit concerns D-12 native-schedule exclusion. No parser fix or recurrence fixture belongs to its listed touch scope/tests/acceptance. | Retain P0-34 only for package/release artifact exclusion. Preserve argument-parser recurrence as separately unowned debt pending an explicit successor or accepted scope extension. No local authored artifact cleanup is proposed. |
| G3-01, G3-03 | P2-29 | G3-01 still names three issuer implementations; G3-03 says assurance/redteam/shield engines coexist and wiring is not consolidation. CLI aliases/notices do not consolidate those implementations. P2-29 owns a deprecation plan, aliases/notices, docs consolidation, signed reviewer independence and optional behavior-preserving CLI extraction. It explicitly defers scoring-system retirement to P1-53 and does not list issuer/red-team engine consolidation in touch scope or acceptance. P1-52 also explicitly excludes fixing dead code/deduplication. | Keep P2-29 as a partial CLI/docs surface successor. Ask Sid to accept an explicit boundary that coexistence is intentional, or name a distinct internal-consolidation successor. Do not resume paused G4 work or repurpose P1-52 into source cleanup. |

## G6-08 proof language, without changing its explicit route

The generic remaining admission/revocation acceptance wording must not imply no such proof was executed. Accepted main carries historical passing explicit-admission bundle/certificate cases and refusal of history anchored by a compromised/revoked key. These are historical scoped runs, not qualification of every current notary/portable surface.

The P0-29 spec explicitly maps both G6-07 and G6-08 to P0-09 and keeps AMC-1525 linked. That mapping is preserved. Current notary signing returns without adding a history key; explicit trust configuration saves signed config before authenticated history admission. The accepted-main history test requires a trust-list anchor with `allowKeyHistory`; an explicit pin alone refuses the added key.

Historical passing evidence is `qualification/2026-10-07-P0-09/review-after.log:155` (history anchor revoked for key compromise), `:249` (bundle explicit authenticated admission), and `:414` (certificate explicit authenticated admission), with the command in `review-commands.tsv:2`. The durable receipt records the PR 3 review at `cbbd012b5c5291481a72987f865eae8dbd26785f`; it explicitly excludes whole-suite/performance/release-gate qualification. The record must not turn this performed historical work into an invented unperformed check.

Keep mitigated→P0-09 per explicit mapping, retaining AMC-1525. Qualify the debt note with the historical receipt and separate current portable/operator acceptance from lifecycle anti-rollback/atomic rotation owned by P1-08. No status closure or reassignment is proposed.

## Primary acceptance sources

- `P0-29.md:38`: explicit known mappings and unmatched-successor handling.
- `P0-28.md:29-35`: docs-only scope and code-behavior exclusion.
- `P0-34.md:26-32` and `:72-81`: release preparation touch scope and acceptance.
- `P2-29.md:25-31`, `:43-49`, `:69-76`: CLI/docs/reviewer scope and behavior-preserving extraction.
- `P1-52.md:23-29`: ratchet excludes deduplication/removal.
- `P0-09.md:160-165`, `:282`: authenticated history admission and AMC-1525 relationship.
- `P1-08.md:14-17`, `:28-32`: remaining lifecycle, anti-rollback and atomic rotation scope.

Full excerpts, exact source hashes and row snapshots are in `/private/tmp/p0-29-assigned-route-scope-audit-20261014.json`. Durable specs are under `/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa/specs`.

User instructed the parent to skip P0-29 and move to the next relevant plan item. This audit stopped with routing debt preserved. No repository source, candidate, tracker, history, refs or other worktree was changed; no test or build was run.
