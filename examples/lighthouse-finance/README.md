# Synthetic finance provider

This is the P1-19 synthetic finance fixture. Its Node service imports no AMC source or built output; seed, fault plans and F01–F38 scenario data are under `spec/fixtures/v1/lighthouse-finance/`.

See [the fixture guide](../../docs/LIGHTHOUSE_FINANCE_FIXTURE.md) for operation, credentials, transaction-log semantics and integration boundaries. What exists: the provider with its client and adapter, an independent oracle (see the guide's "Independent oracle" section) and an opt-in finance tool composition. What is not built: the example runner for the normative F01–F38 scenarios and compliance-engine control evidence. The F01–F38 scenarios have not been run. Qualification runs and their results are recorded under `qualification/2026-10-16-P1-19/`, including the P1-19 oracle receipts, not here.

All tenants, names, accounts and destination tokens are synthetic. This fixture models finite cases and does not establish any real provider's behavior, exactly-once delivery, compliance or universal safety.

The opt-in finance composition is in `src/lighthouse/finance/financeOpsTools.ts`, with durable preimage resolution in `financePaymentContext.ts`. It offers five scoped tools and reuses genuine signed approvals, action receipts, reader refresh and the existing payment adapter. The caller owns configuration, journal and recording. It is not installed in default tool sets. See `docs/LIGHTHOUSE_FINANCE_FIXTURE.md` for the exact trust and recovery limits; the full normative runner is not implemented.
