# VAULT

AMC stores signing private keys encrypted at rest in a local vault.

Vault files:
- `.amc/vault.amcvault`
- `.amc/vault.amcvault.meta.json`

Private keys are not kept in plaintext key files.

## Commands

```bash
amc vault init
amc vault unlock
amc vault lock
amc vault status
amc vault rotate-keys
```

If vault is locked, signing commands fail with an actionable error.

## CI / Non-interactive

Set passphrase via environment variable:

```bash
export AMC_VAULT_PASSPHRASE='<passphrase>'
```

AMC never writes the passphrase to disk and never prints it.

## Rotation

`amc vault rotate-keys` rotates monitor signing key and updates public-key history so old artifacts remain verifiable.

Rotation now requires authenticated history. Existing unsigned histories need explicit reviewed migration before historical keys are admitted. See [authenticated key history](KEY_HISTORY.md) for the public format, migration commands, external pin behavior, and rotation recovery files.
