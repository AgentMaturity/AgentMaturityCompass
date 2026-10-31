# Ledger delegation owner API

`bindPurposeProviderKey(workspace, "ledger-row", options)` binds or renews the configured provider key. It requires owner mode, the vault passphrase, and the existing signed-config gate when selecting a different provider key. It exports no private key.

The optional `delegation` member lets an owner narrow the normal 24-hour, 1,000,000-row grant for a shorter-lived or lower-volume installation:

```ts
await bindPurposeProviderKey(workspace, "ledger-row", {
  passphrase,
  delegation: { hours: 1, maxEvents: 10_000 }
});
```

`hours` must be positive and at most 24. `maxEvents` must be a positive safe integer and at most 1,000,000. Omitted values retain the normal limits. These are operational limits, not test overrides or additional signing purposes.

The cap is shared by SQLite control/audit evidence, SQLite outcomes, and JSONL session events in the workspace. The current grant and every historical grant remain in immutable, digest-named archives pinned by the committed key set. Every renewal advances the key-set generation. Older delegated rows retain their original grant references.

A row must pass both the current server-clock signing gate and the grant window for its recorded timestamp. The AMC-owned `amcKeyDelegation` metadata member binds the current grant and a unique use sequence before the event hash is signed. Callers cannot supply this member. A failed append after quota reservation can consume a slot; it never returns a slot or lowers the machine's high-water mark. Exhaustion requires renewal.

The row-signing path calls no remote provider. It currently verifies the complete metadata/signature prefixes before each delegated append; throughput has not been qualified. Payload availability, receipts, governance and independent trust remain separate verifier checks. An artifact carrying only selected rows cannot establish the workspace-wide event cap by declaring its own event index.
