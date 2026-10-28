<!-- SPDX-License-Identifier: MIT -->
# 7. Authorization records, receipt states and failure behaviour

Status: normative from 1.0.0, for evidence producers and adapters. In the 1.0.0-draft series this chapter tracks the
behaviour P1-02 (authorization at the enforcement point) and P1-03 (action-state receipts) built; the producer and
adapter fixtures in [`spec/conformance/v1/`](../conformance/v1/README.md) are kept aligned with it.

Records: `https://agentmaturity.co/spec/schemas/v1/authorization-record.schema.json` and
`https://agentmaturity.co/spec/schemas/v1/receipt.schema.json`. Their digests, signed bytes and the rules a schema
cannot express are in [`spec/ACCEPTANCE_RULES.md`](../ACCEPTANCE_RULES.md), sections "authorization-record" and
"receipt".

## Authorization records

1. An adapter MUST bind an authorization record at the enforcement point, before the effect runs, naming who
   authorized which action class, under which approvals and exceptions, until when.
2. Identity and authority MUST come from the authenticated context. `agentSuppliedMetadata` is what the agent said;
   it is untrusted and no rule MAY read it.
3. An adapter MUST re-check the record (expiry, scoped exceptions, break-glass) immediately before the effect runs and
   MUST deny when the re-check fails.
4. A record MUST NOT be valid at or after its `expiresAt`, and MUST NOT outlive any approval it relies on.

## Receipt states

One execution has one `executionId` and one `idempotencyKey` across all its receipts. States follow this table,
generated from `ALLOWED_TRANSITIONS` (`src/actions/receiptStates.ts`):

<!-- amc:spec:receipt-states -->
| From | Allowed next states |
| --- | --- |
| (no receipt yet) | `requested` |
| `requested` | `authorized`, `denied`, `cancelled` |
| `authorized` | `started`, `denied`, `cancelled` |
| `started` | `completed`, `outcome_unknown` |
| `outcome_unknown` | `completed` |
| `completed` | none (terminal) |
| `denied` | none (terminal) |
| `cancelled` | none (terminal) |
<!-- /amc:spec:receipt-states -->

1. A producer MUST NOT write a transition outside the table. A verifier MUST fail satisfaction on one.
2. From `authorized` on, every receipt MUST carry the digest of the execution's authorization record.
3. A receipt that settles an `outcome_unknown` execution MUST carry `reconciliation` naming the `outcome_unknown`
   receipt it follows.
4. A receipt proves that a row was written. It MUST NOT be read as proof that the effect happened or succeeded.

## Failure behaviour

1. Unknown authority, an unreadable policy, an unknown action class or an unavailable approval store MUST give deny
   or ask, never allow.
2. Once a body was dispatched, a producer that cannot tell whether the effect happened MUST record `outcome_unknown`.
   It MUST NOT record `completed`, and MUST NOT replay the call to find out. Only reconciliation (asking the system of
   record, or an operator's signed statement) moves it to `completed`.
3. A dispatched execution MUST NOT become `cancelled`.
4. A producer MUST NOT drop a failed or incomplete execution from its records. Missing evidence is marked incomplete,
   never filled in.
5. A kill switch or revocation MUST take effect even when workspace state that an agent can write says otherwise.
