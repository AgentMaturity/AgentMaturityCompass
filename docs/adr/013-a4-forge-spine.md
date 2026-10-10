# ADR 013: A4 Forge spine

Status: proposed. Implemented for the spine behind `AMC_A4_PREVIEW=1` (P0-54, P1-56, P1-57, P1-58, P1-63). Owner: lane S
of epic E17. Date: 2026-10-11.

## Context

A4 Forge guides one agent from a brief to a recorded deployment in four stages (`docs/A4_FORGE.md`). Every stage
asks people to approve something: a direction, a completed build, a policy change, a release. The approvals must bind
the exact bytes reviewed, survive a crash between commit and effect, keep human statements apart from runtime
observations, and stay checkable by an auditor who holds neither AMC's software nor the workspace's keys. AMC already
had a signed, hash-chained ledger, an approval engine with quorum and binding digests, native Studio admission, claim
envelopes and a verifier report. The question was how much of A4 could be built from those, and what had to be new.

## Decision

- **Store.** A4 lives in the evidence ledger (migration 13, `src/ledger/ledgerSchemaA4.ts`), not in a separate file, so
  backups, retention, ledger verification, bundles and per-workspace scoping cover it. `a4_transitions` is the chain:
  each row hash-links to the previous one, names the signed `A4_STATE` audit row written in the same transaction, and
  lists in its body every side row it inserted with that row's sha256. The chain is therefore the integrity and
  completeness root: a deleted or altered side row is `A4_SIDE_ROW_MISMATCH`. `a4_projects` is the only mutable table,
  an index whose state is always re-derived from the chain. Only `src/a4/a4Store.ts` writes; every row is
  `meta.source: "a4-store"`, `SELF_REPORTED`; the store never emits OBSERVED.
- **Approvals split.** Documentary gates (direction, completion, policy) are `ApprovalRequestRecord`-shaped rows in A4's
  own tables, decided through the engine's shapes, binding digest and quorum, so A4 never writes an engine decision.
  Effect gates are a second, separately decided engine request, re-checked against A4's separation of duties and
  project membership before consume. A decision without the gate's request digest, or recorded after a superseding
  transition (`gateSupersededBy`), counts for nothing.
- **Identity, option B.** A4 routes are native Studio paths: identity comes from the authenticated session, resolved
  live against signed `users.yaml` or the tracked host session record, never from a body. LOCAL_USER and
  WORKSPACE_ROUTER are separate planes and a gate takes decisions from one. `bootstrap-admin` reads only. No frozen file
  is edited in G1; host memberships wait for P2-33.
- **Readiness.** One pure evaluator (`evaluateA4Readiness`) on rows read inside the write transaction. A gate binds a
  readiness digest over exactly `A4_BOUND_ITEMS[stage]`: never an item its own votes decide and never an environment
  fact of the moment, so a second approval lands on the bytes the first approved. Missing evidence is `not_evaluated`
  with a reason. AMC's own integrity checks are a separate section, never a lane or a claim.
- **Five envelope kinds.** Only `GATE_REQUESTED`, `GATE_DECIDED`, `RELEASE`, `DEPLOYMENT` and `ROLLBACK` carry an
  `A4_RECORD` envelope (auditor key), signed outside the ledger transaction. Each envelope is a vault round trip, and a
  notary call in NOTARY mode; Ask, Understand, Explain and Propose must not need an unlocked vault.
- **Lanes from claim kinds.** The lane of an evidence ref is derived from its claim kind, the referenced row's
  recomputed tier and its method, never chosen by the writer. Every gate decision is `self_reported` with
  `review.independent = false`: SoD-distinct users in one workspace are not independent, and two local users are not
  evidence of two people. `independently_reviewed` needs an admitted external record (P2-24, P3-21).
- **No new formats.** A4 adds no bundle format, threat-model channel, failure row, `ApprovalAnswer` member or
  `EvidenceEventType`. It adds contracts under `spec/schemas/v1/a4-*.schema.json` and the `amc.a4-record/v1` export,
  which carries the rows exactly as stored so a second verifier recomputes every digest without SQLite. The A4 slice of
  an existing `.amcbundle` is one such record per verified project, listed in the signed manifest (one net-zero hook in
  `src/bundles/bundle.ts`); the bundle's ledger is never extended for it. Its rules and seven normative
  fixtures are published (`spec/ACCEPTANCE_RULES.md`, "A4 project record"; `tests/fixtures/contracts/a4-record/`).

## Consequences

- An auditor can check an exported project offline under their own pinned trust list. Without one, a report states
  integrity only. API routes verify under the server operator's trust list and refuse any trust a request names.
- The canonical form is AMC's (`canonicalize`, integer-like keys first), not RFC 8785; the rules say so, and a second
  verifier must copy it.
- A record alone proves a prefix of the chain: a tail cut back together with the mutable head is visible only against
  a later signed statement (a bundle manifest, the workspace ledger).
- Every gate decision is a vault round trip, and in NOTARY mode a notary call.
- Stage producers (P1-59 to P1-62) register into the spine; until then stages record human-authored content through a
  labelled "no producer registered" path.

## Alternatives considered

- **A separate SQLite file or signed control journal.** Outside retention, backups and ledger verification, and the
  signed control journal needs a checkpoint directory that read-only container filesystems cannot write.
- **Engine decisions for documentary gates.** Would replay votes across two stores and let an engine decision stand in
  for an A4 vote; kept for effects only.
- **A new export format for A4.** Rejected: one more format to verify. The `.amcbundle` carries the slice as
  `a4-record` files, the same rows a verifier without SQLite reads.
- **Extending the bundle's ledger prefix to the A4 rows.** Rejected: it pulls in every session open in that range,
  such as a running gateway's unsealed legacy session, and the bundle then fails ledger verification.
