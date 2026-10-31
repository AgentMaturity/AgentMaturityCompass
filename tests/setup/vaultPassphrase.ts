// The suite's vault passphrase. AMC's source has no default passphrase and never picks one from NODE_ENV or VITEST
// (tests/vaultPassphraseSource.test.ts), so the harness supplies it the way an operator would: through
// AMC_VAULT_PASSPHRASE, which child processes inherit. Assigned directly, not stubbed, so vi.unstubAllEnvs() restores
// this value rather than removing it mid-suite. A test that needs no passphrase stubs it to "" or deletes it.
if (!process.env.AMC_VAULT_PASSPHRASE) process.env.AMC_VAULT_PASSPHRASE = "amc-test-passphrase";
