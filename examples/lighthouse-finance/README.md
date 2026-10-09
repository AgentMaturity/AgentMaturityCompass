# Synthetic finance provider

This is the source-only P1-19 fixture slice. Its Node service imports no AMC source or built output; seed, fault plans and F01–F38 scenario data are under `spec/fixtures/v1/lighthouse-finance/`.

See [the fixture guide](../../docs/LIGHTHOUSE_FINANCE_FIXTURE.md) for operation, credentials, transaction-log semantics and integration boundaries. No service, scenario runner, oracle or evaluation was executed. Scenario expectations are unobserved; the source remains unqualified.

All tenants, names, accounts and destination tokens are synthetic. This fixture models finite cases and does not establish any real provider's behavior, exactly-once delivery, compliance or universal safety.
