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

AMC has no default passphrase. `NODE_ENV=test`, `VITEST` and other test-runner variables never supply one, so a vault is never sealed with a passphrase written in AMC's source. AMC's own test suite sets `AMC_VAULT_PASSPHRASE` in `tests/setup/vaultPassphrase.ts`.

## Payload v2 and purpose keys (P1-08)

The vault holds one key per signing purpose (payload v2). The first unlock after upgrading rewrites a v1 vault as v2 with the same key bytes and keeps the v1 file in AMC home (`<AMC home>/state/keyset-recovery/<workspace scope>/previous-vault.amcvault`), out of the workspace; AMC 1.2.0 cannot read v2, so downgrading is unsupported. Signing call sites take their key per purpose, every key change is an atomic key-set generation, and an unlocked vault without its key set (`.amc/keys/keyset.json`) refuses to sign. See `docs/KEY_LIFECYCLE.md`.

## Rotation

`amc keys rotate --purpose <p>` rotates one purpose's key with a signed rotation statement; `amc vault rotate-keys` remains as the alias that rotates `ledger-row` and `receipt` (the monitor key) and updates public-key history so old artifacts remain verifiable.

Rotation now requires authenticated history. Existing unsigned histories need explicit reviewed migration before historical keys are admitted. See [authenticated key history](KEY_HISTORY.md) for the public format, migration commands, external pin behavior, and rotation recovery files.

## When unlock refuses

A failed unlock locks the vault: a wrong passphrase, or a vault file that was replaced or corrupted, also closes a session opened earlier, so its keys are no longer used.

Unlock checks that every private key in the vault matches its public key file in `.amc/keys/` (`monitor_ed25519.pub`, `auditor_ed25519.pub`, `lease_ed25519.pub`, `session_ed25519.pub`, and since P1-08 each `<purpose>.pub`). AMC writes the encrypted vault first and the public keys after it, so a write interrupted in between (a crash, a full disk) leaves them disagreeing. Unlock then refuses and names the file, because signatures made with a key whose public half is not the published one would never verify. To recover, stop every AMC process that writes to the workspace, then:

- After a rotation, `.amc/trust.yaml` keeps the retired artifact-seal key's signature. `amc keys revoke` of that key with reason `superseded` or `unspecified` re-signs a trust.yaml that verifies, unchanged, with the current key; a `key-compromise` revocation leaves it refused for review, and one it cannot re-sign is reported with its recovery command. `amc trust resign` (owner mode, unlocked vault) prints the content digest and effective config; `amc trust resign --confirm <that sha256>` re-signs trust.yaml in place, NOTARY settings included, when its content verifies under its recorded signer from key history, even a retired or revoked one; a key-compromise signer also needs `--accept-compromised-signer`, and a signer the operator trust context distrusts is refused. `amc trust init` rewrites trust.yaml to the default LOCAL_VAULT config.
- If a key rotation was interrupted, run `amc keys rotate --resume`: it completes the change or restores the previous key set from `.amc/keys/rotations/gen-<N>/` (`docs/KEY_LIFECYCLE.md`). Recovery directories from rotations before P1-08 (`.amc/keys/rotations/<timestamp>-<fingerprint>/`) are still restored by hand, as [authenticated key history](KEY_HISTORY.md) describes.
- Otherwise restore the vault and the `.amc/keys/` directory together from the same backup. If the vault was created in the interrupted command and nothing was signed with it, you can instead move `.amc/vault.amcvault`, `.amc/vault.amcvault.meta.json` and `.amc/keys/` aside and run `amc init` again.

A vault from before lease and session keys may hold only some of them. Unlock adds the missing keys and keeps the ones the vault has. If a `lease_ed25519.pub` or `session_ed25519.pub` exists for a key the vault does not hold, unlock refuses: AMC cannot check that file, and a new key would replace it. To let AMC create a new key, move that `.pub` file and its `*_history.json` aside; anything signed with the old key will then no longer verify.

## The vault as the default key provider (P2-08)

The vault is the `file` key provider: the default, for development, and the only provider whose keys can leave it (`exportable: true`). With `keys.requireNonExportable: true` in `.amc/amc.config.yaml`, AMC refuses every vault key that no provider key replaces (`KEY_PROVIDER_KEY_REFUSED`). A purpose whose `keys.refs` names a provider key never signs with its vault key, even when the provider is unreachable (`KEY_PROVIDER_HELD`); the one exception is the `ledger-row` delegate, served only under a current provider-signed delegation. A locked vault still reports "Vault locked". See [KEY_PROVIDERS.md](KEY_PROVIDERS.md).
