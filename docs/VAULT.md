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
amc vault passphrase   # change the passphrase; the keys stay the same
amc vault forget       # remove the remembered passphrase for this workspace
```

If vault is locked, signing commands fail with an actionable error.

## CI / Non-interactive

Set passphrase via environment variable:

```bash
export AMC_VAULT_PASSPHRASE='<passphrase>'
```

## Where the passphrase can be kept

The vault is only as private as its passphrase. AMC can keep it in these places:

- **The environment variable** `AMC_VAULT_PASSPHRASE`, in the shell you export it in. It wins over every store below.
- **A passphrase file** named by `AMC_VAULT_PASSPHRASE_FILE`, the form the container image, the Compose files and the Helm chart set. Every `amc` command reads it when `AMC_VAULT_PASSPHRASE` is unset, except `amc up` (which keeps its own rules, below), `amc mcp` and the hook forwarder (which never hold the vault), and `amc bootstrap`, `amc host bootstrap`, `amc studio start` and `amc doctor`, which read it themselves, as before, without the checks that follow. The file must be a regular file (not a symlink) that you own, closed to group and others (mode 0600 or 0400); any other file is refused with one line on stderr, and the vault stays locked. Its value unlocks the vault in that process only: it never enters the environment, so no child process inherits it, and it is never printed. While it is set, the remembered store is not read. Kubernetes secret volumes (root-owned symlinks that the group or others can read) and Compose secret files not owned by uid 10001 with mode 0600 or 0400 fail these checks; inside such a container run `sh -c 'AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc …'`, as [the Compose runbook](deploy/reference/COMPOSE.md) does.
- **The remembered store**: the macOS Keychain item with service `amc-vault`, or the file `$AMC_HOME/vault-credentials.json` (default `~/.config/amc/vault-credentials.json`, mode 0600, plaintext JSON keyed by a hash of the workspace path). The Keychain is used when stdin is a terminal on macOS; the file is used on other platforms, in non-interactive shells, when the Keychain does not answer within 5 seconds, or when `AMC_VAULT_REMEMBER_FILE` names a file. It is written by `amc up` after you answer yes to "Remember this passphrase", by `amc setup` and `amc init --skip-vault` when they generate a passphrase, and by a non-interactive `amc up` outside CI that generates one. This version moved the file under `AMC_HOME`; an entry still in `~/.config/amc/vault-credentials.json` is moved to the new file the first time that workspace's passphrase is read.
- **`.amc/local-vault-passphrase`** (0600, inside the workspace, ignored by `.amc/.gitignore`): written by bare `amc` for an instant first score and by `amc monitor start` when they create a vault. Only a process that is not an agent reads it (see below). `amc vault passphrase` removes it, because it holds the old passphrase; bare `amc` then scores unsigned until `AMC_VAULT_PASSPHRASE` is set.
- **Printed lines**: `amc init --minimal` with no `AMC_VAULT_PASSPHRASE` prints the export line for the passphrase it generated, once; under GitHub Actions it first prints `::add-mask::` for the value, so the job log masks it. Interactive `amc up` and `amc init` with no `AMC_VAULT_PASSPHRASE` (for `amc up`, also nothing remembered) offer to generate one: the menu shows the generated value, and choosing it prints the value again to save, so it stays in that terminal's scrollback. No other command prints a passphrase.

The trade-off is plain: any process running as the same OS user can read the remembered file, the Keychain item and `.amc/local-vault-passphrase`.

Opt-outs: `amc up --no-remember` (prompt each time), `AMC_VAULT_REMEMBER=0` (no store is read or written; `amc up`, `amc setup` and `amc init --skip-vault` then need `AMC_VAULT_PASSPHRASE`), `amc vault forget` (removes this workspace's entry, from the old path too), and `AMC_VAULT_REMEMBER_FILE=<path>` (forces the file store at that path).

## Who the remembered passphrase unlocks for

A command unlocks the vault from the remembered store only when an interactive operator runs it:

- stdin is a terminal (stdout may be piped, so `amc shell` and `amc ... | jq` keep working);
- the workspace is not in agent mode (`amc mode agent`);
- none of these agent markers is set to a non-empty value: `AMC_LEASE`, `AMC_TOKEN`, `AMC_EVALUATED_AGENT` (set for agents AMC launches), `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT` (Claude Code), `CODEX_SANDBOX`, `CODEX_SANDBOX_NETWORK_DISABLED`, `CODEX_CI`, `CODEX_THREAD_ID`, `CODEX_TOOL_CALL_ID` (Codex), `GEMINI_CLI` (Gemini CLI), `PI_CODING_AGENT` (pi). `AMC_AGENT_ID` is not a marker: the global `--agent` flag sets it for your own commands.

When a marker or agent mode is the reason and stdin is a terminal, the command prints one line naming it (`Vault passphrase remembered in <location> not used: ...`). `amc up` in a shell carrying a marker refuses to read the store and asks you to export `AMC_VAULT_PASSPHRASE` deliberately; a non-interactive `amc up` without a marker (a service manager, a script, a hook or a cron job) still uses the store and hands the passphrase to the Studio it starts. Without a terminal, `amc vault unlock` and every command that unlocks the vault itself refuse with `Vault passphrase needed: export AMC_VAULT_PASSPHRASE for this shell, or re-run this command from your terminal.`

Governance commands (the commands agent mode blocks, plus `user`, `trust`, `firewall`, `policy`, `tools`, `keys`, `identity`, `sso`, `scim`, `ops sign`, `studio lan`, `connect hooks install`, `connect hooks remove`, `lease issue`, `gateway`, `ticket issue`, `workorder`, `notary sign`) whose vault was opened from the remembered store ask `Sign <command> with the vault passphrase remembered in <location>?` first, default No. No locks the vault again and holds for the rest of that command, so a command that unlocks itself cannot reopen it. Export `AMC_VAULT_PASSPHRASE` in a shell you control to skip the question. The question is asked on stderr, so it reaches you when stdout is piped and never lands in a command's output. Reads under those names that sign nothing (for example `keys list`, `firewall status`, `tools list`, `policy controls`, `policy test`, `connect hooks health`, `user list`, `workorder show`) and `amc down` do not ask.

`.amc/local-vault-passphrase` follows the same rule without the terminal check (the monitor runs as a daemon): agent mode or a marker means it is not read. Bare `amc` then scores unsigned and says why; `amc monitor start` refuses.

The ceiling, said plainly: a coding-agent harness that runs commands in a pseudo-terminal passes the terminal check, so for it the marker list is the only guard, and a harness that sets none of these markers passes both. A process running as your OS user can also start `amc up` without a terminal (above) or read Studio's admin token, which passes OWNER-gated Studio routes ([SECURITY.md](SECURITY.md)). Export `AMC_VAULT_PASSPHRASE` only in shells you control, and use `--no-remember` or `AMC_VAULT_REMEMBER=0` on a machine where agents run as your user.

AMC has no default passphrase. `NODE_ENV=test`, `VITEST` and other test-runner variables never supply one, so a vault is never sealed with a passphrase written in AMC's source. AMC's own test suite sets `AMC_VAULT_PASSPHRASE` in `tests/setup/vaultPassphrase.ts`.

## Payload v2 and purpose keys (P1-08)

The vault holds one key per signing purpose (payload v2). The first unlock after upgrading rewrites a v1 vault as v2 with the same key bytes and keeps the v1 file in AMC home (`<AMC home>/state/keyset-recovery/<workspace scope>/previous-vault.amcvault`), out of the workspace; AMC 1.2.0 cannot read v2, so downgrading is unsupported. Signing call sites take their key per purpose, every key change is an atomic key-set generation, and an unlocked vault without its key set (`.amc/keys/keyset.json`) refuses to sign. See `docs/KEY_LIFECYCLE.md`.

## Rotation

`amc keys rotate --purpose <p>` rotates one purpose's key with a signed rotation statement; `amc vault rotate-keys` remains as the alias that rotates `ledger-row` and `receipt` (the monitor key) and updates public-key history so old artifacts remain verifiable.

Rotation now requires authenticated history. Existing unsigned histories need explicit reviewed migration before historical keys are admitted. See [authenticated key history](KEY_HISTORY.md) for the public format, migration commands, external pin behavior, and rotation recovery files.

### When to rotate

Rotate when `.amc/` was committed or copied somewhere else, when the remembered store or `.amc/local-vault-passphrase` may have been read by something else, when a laptop holding the workspace was lost, or when a person with the OWNER role leaves.

A leaked passphrase together with a copy of the vault file decrypts every key the vault holds, now and after `amc keys rotate`, because rotated keys are sealed under the same passphrase. First change the passphrase with `amc vault passphrase`: it asks for the current passphrase and the new one twice (never on the command line) and re-seals the vault under the new one in one key-set generation that keeps every key (a machine that adopted the key set accepts that generation with `amc keys rotate --accept`, as after a rotation). The same generation re-seals the child vaults a provider-held receipt or artifact-seal key uses. Then it locks the vault, forgets the remembered entry, removes `.amc/local-vault-passphrase` and re-seals every copy of the vault AMC keeps in AMC home (`<AMC home>/state/keyset-recovery/<workspace scope>/`, which `amc keys rotate --restore` uses); a copy that does not open with the current passphrase is left as it is and listed. It waits (up to 5 seconds) for a key rotation, revocation or vault secret write in progress, and refuses, changing nothing, when one changed the vault after the passphrase was checked; a rotation prepared before the change refuses to commit, so neither undoes the other. The old passphrase then opens neither the vault nor AMC's own copies, but a copy made earlier (a backup, a git commit of `.amc`, another machine) still opens with it. So treat a leaked passphrase as leaked keys and also rotate every key with `amc keys rotate --purpose <p> --reason key-compromise`, which needs this machine's pinned trust-list root keys held outside AMC (`--root-key`, see [KEY_LIFECYCLE.md](KEY_LIFECYCLE.md)); the verification chain starts a new epoch.

Then the accounts and tokens: `amc user password <name>` for every console account whose password may be known (it also ends that user's sessions), `amc user revoke <name>` for anyone who left (a revoked account cannot be reactivated, so a returning person gets a new username; AMC refuses to revoke or demote the last active OWNER), a new Studio admin token (`amc down`, delete `.amc/studio/admin.token`, `amc up`; every client holding the old token stops working at once), and for SCIM a new token from `amc scim token create`, replaced in the identity provider ([SCIM.md](SCIM.md)).

## What `.amc/.gitignore` keeps out of git

A workspace created by `amc up`, `amc init` or bare `amc` gets `.amc/.gitignore`. It ignores secrets and per-machine runtime state: `local-vault-passphrase`, `license.key`, `studio/` (the admin token, console sessions and Studio state), `studio-demo-host/`, `blobs/unvaulted.key`, `auth/api-keys.json`, `bridge/pairing-codes.json`, `dataflow/token-vault.sqlite*`, `hooks/`, `wire/`, `diagnostics/`, lock directories and SQLite shared-memory files. Signed configuration, `users.yaml` (scrypt hashes only), public keys, the encrypted vault and the evidence stay committable, because the AMC GitHub Action uses a committed `.amc` workspace as it is. AMC never rewrites an existing `.amc/.gitignore`; `amc doctor-fix` writes one where none exists. A secret committed before the file existed stays tracked whatever it says: `amc doctor` reports it (`amc-gitignore`), and the fix is `git rm --cached <file>`, a commit, and rotating that secret as above. AMC writes `users.yaml` and its signature 0600; a checkout from git still yields 0644.

## Console accounts

Console accounts live in the signed `.amc/users.yaml`. Create the first owner with `amc user init --username <owner>` (or `amc bootstrap` in a container), add people with `amc user add`, and reset a password with `amc user password <name>`; without a terminal pass `--password-file <path>`, and export `AMC_VAULT_PASSPHRASE` (or set `AMC_VAULT_PASSPHRASE_FILE`) first: these commands sign `users.yaml`, and a shell without a terminal does not use the remembered passphrase. `amc user init` refuses to replace an existing `users.yaml` unless `--force` is given. A password can be reset only from the command line on the Studio host (a container or Helm owner needs exec access and the vault passphrase); the console has no "change my password" form yet. Password hashing is scrypt at N=2^15 (about 60 ms per sign-in) and stays there until the sign-in path is asynchronous.

## When unlock refuses

A failed unlock locks the vault: a wrong passphrase, or a vault file that was replaced or corrupted, also closes a session opened earlier, so its keys are no longer used.

Unlock checks that every private key in the vault matches its public key file in `.amc/keys/` (`monitor_ed25519.pub`, `auditor_ed25519.pub`, `lease_ed25519.pub`, `session_ed25519.pub`, and since P1-08 each `<purpose>.pub`). AMC writes the encrypted vault first and the public keys after it, so a write interrupted in between (a crash, a full disk) leaves them disagreeing. Unlock then refuses and names the file, because signatures made with a key whose public half is not the published one would never verify. To recover, stop every AMC process that writes to the workspace, then:

- After a rotation, `.amc/trust.yaml` keeps the retired artifact-seal key's signature. `amc keys revoke` of that key with reason `superseded` or `unspecified` re-signs a trust.yaml that verifies, unchanged, with the current key; a `key-compromise` revocation leaves it refused for review, and one it cannot re-sign is reported with its recovery command. `amc trust resign` (owner mode, unlocked vault) prints the content digest and effective config; `amc trust resign --confirm <that sha256>` re-signs trust.yaml in place, NOTARY settings included, when its content verifies under its recorded signer from key history, even a retired or revoked one; a key-compromise signer also needs `--accept-compromised-signer`, and a signer the operator trust context distrusts is refused. `amc trust init` rewrites trust.yaml to the default LOCAL_VAULT config.
- If a key rotation was interrupted, run `amc keys rotate --resume`: it completes the change or restores the previous key set from `.amc/keys/rotations/gen-<N>/` (`docs/KEY_LIFECYCLE.md`). Recovery directories from rotations before P1-08 (`.amc/keys/rotations/<timestamp>-<fingerprint>/`) are still restored by hand, as [authenticated key history](KEY_HISTORY.md) describes.
- Otherwise restore the vault and the `.amc/keys/` directory together from the same backup. If the vault was created in the interrupted command and nothing was signed with it, you can instead move `.amc/vault.amcvault`, `.amc/vault.amcvault.meta.json` and `.amc/keys/` aside and run `amc init` again.

A vault from before lease and session keys may hold only some of them. Unlock adds the missing keys and keeps the ones the vault has. If a `lease_ed25519.pub` or `session_ed25519.pub` exists for a key the vault does not hold, unlock refuses: AMC cannot check that file, and a new key would replace it. To let AMC create a new key, move that `.pub` file and its `*_history.json` aside; anything signed with the old key will then no longer verify.

## The vault as the default key provider (P2-08)

The vault is the `file` key provider: the default, for development, and the only provider whose keys can leave it (`exportable: true`). With `keys.requireNonExportable: true` in `.amc/amc.config.yaml`, AMC refuses every vault key that no provider key replaces (`KEY_PROVIDER_KEY_REFUSED`). A purpose whose `keys.refs` names a provider key never signs with its vault key, even when the provider is unreachable (`KEY_PROVIDER_HELD`); the one exception is the `ledger-row` delegate, served only under a current provider-signed delegation. A locked vault still reports "Vault locked". See [KEY_PROVIDERS.md](KEY_PROVIDERS.md).
