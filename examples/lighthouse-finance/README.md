> Current local evidence (16 October 2026): the source-only description below records the original 9 October slice. The service and client now have bounded local qualification; the full normative finance workflow remains open. See the qualification update below.

# Synthetic finance provider

This is the source-only P1-19 fixture slice. Its Node service imports no AMC source or built output; seed, fault plans and F01–F38 scenario data are under `spec/fixtures/v1/lighthouse-finance/`.

See [the fixture guide](../../docs/LIGHTHOUSE_FINANCE_FIXTURE.md) for operation, credentials, transaction-log semantics and integration boundaries. No service, scenario runner, oracle or evaluation was executed. Scenario expectations are unobserved; the source remains unqualified.

All tenants, names, accounts and destination tokens are synthetic. This fixture models finite cases and does not establish any real provider's behavior, exactly-once delivery, compliance or universal safety.

## Local qualification update: 16 October 2026

The service and client/adapter have 120 passing local Node 22 component cases across the service and client runs after repairing payee-version overflow. See the fixture guide and `qualification/2026-10-16-P1-19/` for evidence and boundaries. Full AMC tool composition, oracle, example runner and F01–F38 qualification remain open; no normative case status has been promoted.


## Independent oracle update: 16 October 2026

Ten local Node 22 oracle tests now pass, including a genuine signed positive and the specified negative families. The oracle independently reads provider/action evidence, authenticates ledger rows with a pinned cold CLI, and requires an external operator manifest and exact database/WAL/key checks. See the fixture guide's independent-oracle update for the runnable test, trust boundaries, retained original failures and profile limits.

P1-19 remains active. Finance tool composition, the normative oracle/profile, example runner, compliance controls and F01–F38 qualification remain open. Scenario statuses are unchanged; these finite oracle tests establish no universal safety, external identity, live-provider, compliance or release claim.


The opt-in finance composition is in `src/lighthouse/finance/financeOpsTools.ts`, with durable preimage resolution in `financePaymentContext.ts`. It offers five scoped tools and reuses genuine signed approvals, action receipts, reader refresh and the existing payment adapter. The caller owns configuration, journal and recording. It is not installed in default tool sets. See `docs/LIGHTHOUSE_FINANCE_FIXTURE.md` for the exact trust and recovery limits; the full normative runner and P1-19 qualification remain open.
