# Key lifecycle

AMC signs with one key per purpose, rotates and revokes keys with signed, chained records, and refuses older copies of anything it signs or accepts. This page covers what P1-08 added: purpose keys, rotation statements, the key set, revocation lists, anti-rollback, trust roots and the `amc keys` commands.

Workspace keys are not only an audit trail: live authorization checks verify against them, among them lease verification, execution tickets, approvals and policy guards. On a machine that committed a key set, every public key AMC reads must be the key that key set names, and the key set must be the exact generation this machine committed (its mark in AMC home). A writer that can change only the workspace therefore cannot swap a public key, restore older keys or roll the key set back.

That binding lives in AMC home. Under `trustBoundaryMode: shared`, an agent that can also write AMC home can rewrite the marks and defeats it. The remedy is the `isolated` mode, which keeps agents out of AMC home, or keys a verifier pinned: a trust list, `--pubkey` or `--expect-monitor` ([TRUST_LIST.md](TRUST_LIST.md)). A portable verdict, on any machine, always needs pinned keys.

## Purposes

| Purpose | Signs | Vault role it shared in 1.x |
|---|---|---|
| `ledger-row` | ledger rows, incident and claim records, score history | monitor |
| `receipt` | receipts the ledger mints, artifact provenance manifests | monitor |
| `artifact-seal` | run seals, bundles, certificates, passports, binders, bench and BOM exports, transparency and Merkle roots, signed records | auditor |
| `revocation-list` | certificate, lease and key revocations | auditor |
| `config-signature` | policy and configuration signatures (`*.yaml.sig`, trust config, ops policy, compliance maps, tool and gateway config) | auditor |
| `lease` | lease tokens | lease |
| `session` | session tokens, pairing codes, agent identity claims | session |

Keys for `release`, `notary`, `trust-list-root`, `evidence-authority`, `independent-attestation` and `catalog-review` never live in a workspace vault; `getSigningKey` refuses them. A `catalog-review` key is a named expert's own key, pinned in a signed trust list, that signs catalog review records (docs/catalog/GOVERNANCE.md).

Synchronous private-key consumers use `getSigningKey(workspace, purpose)`. Maintained asynchronous consumers can use `signWithPurposeKey` or the policy signer without exporting a provider private key; their publication checks run after remote waits. `scripts/architecture-boundaries-check.mjs` checks the older private-key boundaries, including named A4 exceptions owned by that lane. Neither an async helper nor those exceptions enable general provider binding.

## Vault payload v2 and migration

The vault now holds one key per purpose (`{ "v": 2, "keys": { "<purpose>": { "keyId", "privateKeyPem", "createdTs" } }, "secrets": {} }`). On the first unlock after upgrading, a v1 vault is rewritten as v2 with the same key bytes: each role's key serves every purpose it signed before, so no public key changes and nothing needs re-pinning. The v1 envelope is kept in AMC home (`<AMC home>/state/keyset-recovery/<workspace scope>/previous-vault.amcvault`), out of the workspace. AMC 1.2.0 cannot read a v2 vault; downgrading is unsupported.

Public files: `.amc/keys/<purpose>.pub` and `<purpose>_history.json` (key-history envelope v2, whose `role` is the purpose). Lease and session keep their role history. The role files stay as a compatible view: a role's `<role>_ed25519.pub` names its primary purpose's key (monitor: `ledger-row`, auditor: `artifact-seal`), and its `<role>_history.json` admits every key its purposes use, so verifiers that read role histories keep verifying after a purpose is split off.

That role view is legacy compatibility, not new provider authority. Provider transitions retain authenticated history for the exact purpose. A provider admitted for ledger rows, session credentials or configuration does not gain another purpose merely because their old vault keys shared a role.

## The key set: atomic key changes

Creating a vault, the v1 migration and every rotation are one key-set generation. AMC writes every file under a staged name, then `.amc/keys/keyset.pending.json`, renames the staged files into place, and commits by renaming the pending file to `.amc/keys/keyset.json`:

```json
{ "type": "amc.keyset", "version": 1, "generation": 12,
  "keys": { "artifact-seal": "<key id>", "...": "..." },
  "files": { "keys/artifact-seal.pub": "<sha256>", "keys/artifact-seal_history.json": "<sha256>", "vault.amcvault": "<sha256>" },
  "statements": ["<sha256>"] }
```

While a change is pending, signing and verifying refuse with "key set generation N is incomplete; run `amc keys rotate --resume`". `files` lists what the generation wrote plus every public key and statement still in force. Signers also refuse when one of those public keys or statements lost its digest, and when the unlocked vault does not hold exactly the key ids the key set names.

`keyset.json` is unsigned, so it never vouches for itself. This machine's mark (`<AMC home>/state/high-water.json`) records the generation and digest of the key set it committed, and is raised only when this machine commits or resumes a generation, never when it reads one. Once a mark exists, signers and verifiers accept only that exact key set. They refuse an older generation (`ROLLBACK_DETECTED`), other bytes at the same generation (`FORK_DETECTED`), a newer generation this machine never committed, and a missing `keyset.json`. Unlock and key creation check this first: once a mark exists, AMC never creates a new vault or adopts key files from the workspace, and a vault whose key ids differ from the bound key set is refused at unlock.

A lost key set is never re-created automatically. Each committed generation also keeps its `keyset.json` and the files it wrote in AMC home (`gen-<N>/committed/`), and `amc keys rotate --restore`, in owner mode, puts back exactly the key set this machine committed. It restores `keyset.json` when its copy matches the mark, and every listed file that is missing or, for a public key or statement, lost its digest. A file it replaces is copied aside first.

A machine that never committed the workspace's key set uses it on trust on first use, and does so visibly:

- It records the generation it adopted, and refuses an older or forked key set from then on.
- It also refuses any newer generation it did not commit. The owner must accept that generation explicitly, with the digest `amc keys list` shows on the committing machine.
- Each process prints, on exit, that the key set was "adopted unanchored (trust on first use)", and `keysetAnchoring()` reports the same state for receipts and reports.

A workspace that has purpose key files but no `keyset.json` is refused on any machine. Released 1.x versions (v1.0.0 to v1.1.1) wrote only `<role>_ed25519.pub` and role histories in `.amc/keys`; a purpose-named file there is a stray. At the 2.0 migration, a stray that is the vault's own key for that purpose is bound by the first generation. One that is not is refused by name. `keys` binds key ids rather than vault bytes, so writing a vault secret does not open a generation.

`amc keys rotate --resume` rolls a pending generation forward when every staged file is intact. Before writing anything to the workspace, each commit records in AMC home the generation and digest it is committing. Resume finishes only a pending generation that this record names, and only with the owner's passphrase. Otherwise it restores the previous bytes. Those copies hold older key material (the previous vault, public keys and histories), so they live in AMC home, under `<AMC home>/state/keyset-recovery/<workspace scope>/gen-<N>/`. Only the manifest, which names the files and their modes, stays in `.amc/keys/rotations/gen-<N>/`. Resume accepts only the generation this workspace would write next, or one this machine already marked before a crash, and only with that manifest; any other pending file is refused for the owner to inspect. Resuming never overwrites or deletes a file: one it would replace is copied to `gen-<N>/discarded/` in AMC home first, under a new name if that name is taken.

Key, history, statement, revocation and anti-rollback files are read and written through `src/utils/containedFs.ts`: every directory below the workspace (or AMC home) must be a real directory, a file must be a regular file with one link opened without following a symlink, and writes go through a fresh temporary file that is fsynced and renamed. Node has no `openat`, so a directory swapped and swapped back between the check and the read is outside what AMC can see; a lasting swap is refused.

## Rotation statements

`amc keys rotate --purpose <p>` writes one signed statement per rotated purpose to `.amc/keys/statements/<purpose>/<sequence>.json`:

```json
{ "statement": { "type": "amc.key-rotation", "version": 1, "workspaceId": "acme-prod-eu-1", "purpose": "artifact-seal",
    "sequence": 4, "previousStatementSha256": "<64 hex>", "previousKeyId": "<64 hex>", "nextKeyId": "<64 hex>",
    "nextPublicKeyPem": "<SPKI PEM>", "reason": "scheduled",
    "overlap": { "notBefore": "2026-12-01T00:00:00.000Z", "notAfter": "2026-12-15T00:00:00.000Z" }, "issuedAt": "2026-12-01T00:00:00.000Z" },
  "signatures": [ { "by": "previous", "keyId": "<64 hex>", "signature": "<base64>" }, { "by": "next", "keyId": "<64 hex>", "signature": "<base64>" } ] }
```

The signed bytes are `AMC_KEY_ROTATION_V1`, one 0x00 byte and the canonical statement, so every field is bound, including the purpose, workspace, sequence, previous statement digest and times. A statement exists in one encoding only: canonical JSON, signature rows sorted by role and key id, canonical base64, canonical PEM and `toISOString` times. Anything else is refused.

Authority never comes from the statement's own fields. The verifier names the chain (workspace and purpose) and the key it already trusts for that purpose; `previousKeyId` must be that key, and the `previous` signature is checked against it. The `next` signature only proves possession of the new key.

- `scheduled`, `superseded` and `purpose-split` need valid `previous` and `next` signatures.
- `key-compromise` gives the previous key no authority: it needs `next` and signatures from this machine's pinned trust-list roots (`--root-key <file>`, keys held outside AMC). The roots and their threshold come from `<AMC home>/trust/trust-roots.json`, never from the keys handed in, and a `--root-key` that is not pinned there is refused. It has no overlap. AMC also moves every purpose that shares the compromised key and drops that key from every history, including the history of a purpose that split off it earlier.
- A purpose's first key, likewise, needs a root.
- Overlap is at most 30 days (`keys.maxOverlapDays`); `--overlap-days` defaults to 7.
- A sequence gap or a wrong `previousStatementSha256` is refused.

A statement never changes a verifier's pins by itself. To move a pinned key, the trust-list owner publishes a new list (sequence plus one) that sets the old key's `validTo` to `overlap.notAfter` and adds the new key. `amc keys export-public --purpose <p>` prints the public key, its key id and a proof of possession (tag `AMC_KEY_POP_V1`, 0x00, canonical `{ keyId, purpose, issuedAt }`, signed by that key) for the organisation's list. Rotation statements replace the old `amc.monitor-key-rotation` receipts; `verifyKeyRotationReceipt` still verifies old ones.

`amc vault rotate-keys` remains, as an alias that rotates `ledger-row` and `receipt` to one new key.

### Explicit digest signatures for large lists and statements

The v1 examples on this page preserve their original bytes when the envelope omits `signatureVersion`. An explicit envelope `signatureVersion: 2` supports large payloads within provider message limits. The signed bytes are the format's v2 tag, NUL and the 32-byte SHA-256 of the complete v1 tagged payload (including its v1 tag and NUL). The inner statement/list still has `version: 1`.

| Envelope | v2 tag |
|---|---|
| Trust list | `AMC_TRUST_LIST_V2_DIGEST` |
| Key rotation | `AMC_KEY_ROTATION_V2_DIGEST` |
| Revocation list | `AMC_REVOCATION_LIST_V2_DIGEST` |
| Trust-root rotation | `amc.root-rotation/v2-digest` |

All holders in one envelope sign the same version. Main and standalone verifiers reject unknown discriminators, mixed-version signatures, changed complete preimages and v1/v2 substitutions. Provider authoring uses pinned descriptions and canonical signatures. Raw provider signing does not silently hash an oversized v1 message. Trust-list and root-statement authoring preserves independent external root ownership; a workspace provider binding never becomes trust-root authority.

## Revocation lists

A revocation list is one signed file, written atomically:

```json
{ "list": { "type": "amc.revocation-list", "version": 1, "listId": "leases:default", "sequence": 7,
    "previousSha256": "<64 hex>", "issuedAt": "<RFC 3339>",
    "revoked": [ { "id": "lease_…", "kind": "lease", "revokedAt": "<RFC 3339>", "reason": "…", "expiresAt": "<RFC 3339>" } ] },
  "signature": { "keyId": "<64 hex>", "signature": "<base64>" },
  "anchor": { "transparencyEntryHash": "<64 hex>" } }
```

The signature (revocation-list purpose) covers `AMC_REVOCATION_LIST_V1`, 0x00 and the canonical list; it is checked against the verifier's own key history for the purpose, never a key the file names. Each write is staged, appended to the workspace transparency log (`REVOCATION_LIST`, `<listId>#<sequence>`), made final with its anchor and recorded in this machine's high-water file. A crash after the log entry rolls forward; before it, the write never happened.

- Lease revocations: `.amc/studio/leases/revocations.signed.json` ([LEASES.md](LEASES.md)).
- Key revocations: `.amc/keys/revocations.signed.json` (`keys:<workspaceId>`). Every key set starts one, empty. `amc keys revoke --purpose <p> --key-id <id> --reason key-compromise|superseded|unspecified` adds a retired key; a key still in use is refused (rotate first). Every key use checks the list: a revoked current key is refused, and a missing, unverifiable, rolled-back or forked list refuses every key. The workspace self-check distrusts revoked keys; portable verifiers learn of a revocation when the trust-list owner publishes it.
- Revoking the key that signs `.amc/trust.yaml` (P0-37). trust.yaml refuses a revoked signer, so before the list is staged the revocation checks trust.yaml under the pre-revocation state: when it verifies and the key being revoked signs it, its bytes are re-signed unchanged (NOTARY settings included) by the current artifact-seal key, and policy signing keeps working. When it does not verify (tampered, or its signer was already retired or revoked), it is left as it is and stays refused; the revocation still completes, and its output's `trustConfig` names the reason and the recovery command (`amc trust resign --confirm`, or `amc trust init` for content that verifies under no history key). No trust.yaml state blocks a revocation: trust.yaml is writable by anyone who can write the workspace, so the revocation's own transparency append seals with the vault's artifact-seal key when the trust config is refused (under a NOTARY config that one seal is vault-signed; the next append after recovery re-seals through the notary).

## Anti-rollback

`<AMC home>/state/high-water.json` (mode 0600, canonical JSON, atomic writes) keeps, outside every workspace, the highest accepted sequence and its sha256 for each trust list, revocation list, key history, rotation chain, key set and trust-list root set. A lower sequence is `ROLLBACK_DETECTED`; the same sequence with other bytes is `FORK_DETECTED`. A symlinked, malformed or unreadable file refuses every decision that needs it. When AMC home is read-only (a container with a read-only root), AMC warns once and keeps deciding on the workspace transparency log.

Deployments must keep `<AMC home>/state` on persistent storage. The compose files mount a named volume at `/home/amc/.config/amc/state`, and the Helm chart a PersistentVolumeClaim (`amcHomeState` in `values.yaml`). On a temporary filesystem every restart forgets the marks, and an older list, history or key set is then judged only by the workspace log.

Each revocation list, rotation statement and key-history revision is also appended to the workspace transparency log, including the history revisions vault creation, the v1 migration and an explicit key admission write. The one exception is the notary key that enabling notary trust admits: the seal of that log entry would need the notary itself mid-enable, so that revision is only marked on this machine (an admission adds a key, so an older history narrows trust). An older file than the latest logged sequence is refused even after the high-water file is lost; a key history is checked against the log whenever this machine has no mark at its revision. A missing list is never read as empty once either anchor recorded it.

Limits: the high-water file is per machine, so a fresh verifier starts at zero; the transparency log lives in the workspace, so someone who can rewrite both the workspace and AMC home can still roll back. P1-26 anchors the log publicly. Restoring an older backup over a newer workspace at the same path on the same machine is refused as a rollback; restore to a new path, or have the machine owner remove the affected marks deliberately.

## Trust roots

`<AMC home>/trust/trust-roots.json` may set `"threshold": <n>`: a trust list then needs signatures from `n` distinct pinned roots (m-of-n), and a list may also declare its own `rootThreshold`. `--trust-root` flags replace the root set but never lower the threshold. This machine remembers the highest threshold and list version it accepted per list and root set, so a later single-signature policy or an older version is refused.

Rotating the root set needs `"rootSetId"` in `trust-roots.json` and one signed `amc.root-rotation` statement:

```json
{ "statement": { "type": "amc.root-rotation", "version": 1, "rootSetId": "acme-roots", "sequence": 2,
    "previousSha256": "<sha256 of rotation 1's bytes>", "previousRoots": ["<key id>", "..."], "previousThreshold": 2,
    "newRoots": ["<key id>", "..."], "newThreshold": 2, "newRootPublicKeyPems": ["<SPKI PEM>", "..."],
    "allowDecrease": false, "issuedAt": "2026-12-01T00:00:00.000Z" },
  "signatures": [ { "by": "current", "keyId": "<64 hex>", "signature": "<base64>" }, { "by": "new", "keyId": "<64 hex>", "signature": "<base64>" } ] }
```

The signed bytes are `amc.root-rotation/v1`, one 0x00 byte and the canonical statement; only the canonical encoding is accepted, with one signature row per key and role.

- Authority comes only from the pinned set: `previousRoots` and `previousThreshold` must be what `trust-roots.json` pins, and `previousThreshold` distinct current roots must sign. Signatures by the new keys never count as authority.
- The new set proves possession: `newThreshold` distinct new roots sign too.
- A new set has at least two roots and a threshold of at least 2, without duplicates. A smaller threshold or set needs `"allowDecrease": true`, which the current set signs with everything else.
- `sequence` is one above the last rotation this machine applied, and `previousSha256` names it. Replaying an applied rotation, forking from an older one, a gap or a statement for another `rootSetId` is refused.

`applyTrustRootRotation` (or `root-apply`) stores the statement under `<AMC home>/state/root-rotations/<rootSetId>/<sequence>.json`, outside the trust directory, records it in the high-water file, copies this machine's trust-list marks to the new root set and then writes `trust-roots.json`. A crash before that last write leaves the anchored statement; applying the same statement again finishes it after checking it again.

Every later read of `trust-roots.json` verifies the stored chain whole (each statement linked by digest and signed by the set before it) and requires the file to equal what the latest statement installed. Once a set was rotated on this machine, a `trust-roots.json` that is missing, drops `rootSetId` (the pre-rotation format) or names another set is refused. Switching to an unrelated root set is a deliberate act: the machine owner removes that set's `state/root-rotations` directory and its `trust-root-set` mark. The first stored statement's authority is checked against the operator's keys when it is applied; no earlier statement holds those keys, so a later read checks only its new-set signatures. `amc.key-rotation` statements never rotate a trust-list root.

## Cross-agent claims

Identity claims between agents bind the issuing agent, audience, key purpose and key id, issue and expiry times (at most 24 hours), a nonce and the claimed score, level and passport. A verifier passes its expectation: audience, expected issuer, requested scope, its own grants per issuer, the key ids it binds to each issuer (`issuerKeyIds`: an Ed25519 session key id, or `claimHmacKeyId(secret)` for a shared secret) and a replay cache. A claim whose key is not bound to the issuer it names is refused, so one agent's key never speaks for another; so is anything unknown, expired, replayed or not granted, with score 0. A claim proved only by a shared HMAC secret, or by a key issuer admission does not vouch for, is `SELF_REPORTED`: it is reported, never trusted, at most `limited`, and grants no scope. An Ed25519 claim by a session key that issuer admission admits for `session` is `ATTESTED` and can be trusted ([AMC_TRUST_PROTOCOL.md](AMC_TRUST_PROTOCOL.md)).

## When a key set is refused: recovery paths

Every repair below runs in owner mode and needs the vault passphrase. Each is logged in `<AMC home>/state/keyset-recovery/<workspace scope>/repairs.jsonl`.

The checks sit inside the functions that change keys, not only in the CLI, so an SDK, API or script caller cannot skip them. That covers rotate, revoke, resume, restore, accept, quarantine and every key-set commit:

- Agent mode refuses all of them.
- Rotate, revoke, restore, accept and quarantine also open the workspace vault with the real passphrase.
- `amc keys list` and `amc keys export-public` stay unprivileged and print no private material. Nothing is ever deleted: a file that a repair replaces or moves is kept, either in AMC home or in `.amc/quarantine/keys/`.

| Refusal | Where | Recovery |
|---|---|---|
| `keyset.json is missing, but this machine committed generation N` | the committing machine | `amc keys rotate --restore` puts back `keyset.json`, every missing or changed public key and statement, and a vault holding the committed key ids, from AMC home. |
| `key set generation N was never committed on this machine` / `FORK_DETECTED` / `ROLLBACK_DETECTED` | the committing machine | `amc keys rotate --restore`. |
| `Vault unlock refused: the vault does not hold the keys key set generation N names` | the committing machine | `amc keys rotate --restore` opens the vault with your passphrase. If its key ids are wrong, it restores the newest committed copy that holds the right ones. If AMC home holds none, it says so: restore `vault.amcvault` from a backup taken after generation N. |
| `the vault is missing from a workspace whose key set this machine committed` | the committing machine | `amc keys rotate --restore`. |
| `keyset.json is missing, but this machine adopted generation N` | a machine that adopted the key set | Copy that `keyset.json` back from the committing machine. There, `amc keys rotate --restore` recreates it if needed. |
| `key set generation N+1 (sha256 D) is newer than generation N, which this machine adopted` | a machine that adopted the key set | Compare `D` with `amc keys list` on the committing machine. If they match, run `amc keys rotate --accept N+1 --digest D`; if not, the workspace was rewritten, so restore it from the committing machine. Accept reads `keyset.json` once and checks that digest against those same bytes. The workspace vault, opened with your passphrase, must hold the keys that generation names. A generation further ahead than N+1 also needs `--allow-gap "<reason>"`. |
| `keyset.json is missing from a workspace with purpose key files` | any machine with no record | On the committing machine, `amc keys rotate --restore`. Elsewhere, copy `keyset.json` from it. For strays in a 1.x workspace, `amc keys rotate --quarantine-unbound-pub`. |
| `Vault unlock refused: <purpose>.pub is not this vault's <purpose> key and no key set binds it` | 1.x upgrade | `amc keys rotate --quarantine-unbound-pub` moves the file to `.amc/quarantine/keys/<time>/`; the next unlock migrates. |
| `revocations.signed.json ... no key set binds it` | 1.x upgrade or a new vault | `amc keys rotate --quarantine-unbound-pub`. Quarantine never moves the purpose files of a key set this machine committed or adopted; it moves only files no marked key set names. |
| `key set generation N is incomplete; run amc keys rotate --resume` | any | `amc keys rotate --resume` finishes or rolls back the change. Resume runs only when, before writing anything to the workspace, AMC on this machine recorded in AMC home that it was committing exactly that generation (`gen-<N>/intent.json`). It also needs the vault opened with your passphrase; to roll forward, that vault must hold the keys the pending generation names. |
| `pending key set generation N has no write-ahead record in AMC home` | any | AMC on this machine never started that change, so a workspace writer may have planted it. `amc keys rotate --quarantine-unbound-pub` moves the pending file, its staged files and its manifest to `.amc/quarantine/keys/<time>/`. Then run `amc keys rotate --restore` if this machine committed the key set. |
| `pending key set generation N is not one this workspace started` | any | Same as the row above. |
| a revoked, unverifiable or rolled-back key revocation list | any | Restore the newest list from a backup or the committing machine; AMC refuses an older one. |

## Commands

```bash
amc keys list [--json]
amc keys rotate --purpose <p> [--reason scheduled|superseded|purpose-split|key-compromise] [--overlap-days <n>] [--root-key <file>...]
amc keys rotate --resume
amc keys rotate --restore   # owner mode: put back the key set this machine committed
amc keys rotate --accept <generation> --digest <sha256> [--allow-gap <reason>]   # owner mode, on a machine that adopted the key set
amc keys rotate --quarantine-unbound-pub                  # owner mode, with no keyset.json: move unbound purpose files aside
amc keys revoke --purpose <p> --key-id <id> --reason key-compromise|superseded|unspecified
amc trust resign --confirm   # owner mode: re-sign trust.yaml in place after its signer was retired or revoked
amc keys export-public --purpose <p>
```

## Key providers (P2-08)

A purpose's key can be held by a key provider (AWS KMS, Google Cloud KMS, Azure Key Vault, a PKCS#11 token) instead of the vault; [KEY_PROVIDERS.md](KEY_PROVIDERS.md) has the setup. In terms of this page:

- `keys.refs.<purpose>` in `.amc/amc.config.yaml` names provider intent. Direct private-key callers refuse (`KEY_PROVIDER_HELD`); an editable ref cannot select a new committed signer. A bound ledger-row purpose may serve its local key only as the explicitly authorized, current scoped delegate. The vault never stands in for a failed provider call.
- The generic provider owner command binds `ledger-row` and `session`; `config-signature` has a dedicated exact-candidate transition. Each commits one new generation with binding/public/history files and any rotation statement/delegation archives. A real previous-to-next key change needs the separate P1-08 holder signatures; possession/delegation alone does not authorize rotation. Same-key renewal is a new generation without a fake key-change statement. Runtime signing follows the committed ref, and removing an editable ref does not release it.
- Ledger rows use a scoped provider-signed delegation (at most 24 hours), durable shared usage across SQLite/JSONL/outcome streams and an authenticated legacy boundary. Checkpoints sign directly through the provider. Session/config consumers sign directly and have their own authorization/publication checks. This is a limited migrated surface, not every consumer or every purpose; [KEY_PROVIDERS.md](KEY_PROVIDERS.md) records the remaining A4, approval, lease, portable-context and cold-start dependencies.
- Bound and historical provider issuers are admitted for their exact purpose. `amc keys export-public` prints the public key with its proof of possession. Re-binding retains history and does not automatically revoke the old key. `amc keys revoke` refuses the active key; the async owner flow can revoke a retired eligible key while preserving list sequence/predecessor and key-set semantics. Normal provider binding for `revocation-list` remains refused pending its lease/native-task owners.
- Maintained async producers include tools init/reviewed signing, action-policy init, users, tickets/workorders, outcome contracts, overrides and policy-selected plugin initialization. Their final publication/return checks retain current purpose authority and the caller's existing mode/actor rules. Overrides recheck their explicit no-sign policy after the last wait. These migrations preserve the limited binder and do not qualify full cold startup, reserved compound callers or every artifact producer.
- `amc keys list` adds `provider`, `algorithm`, `protection`, `protectionBasis` and `providerKeyId` per purpose (`file`, `ed25519`, `software`, `configured` for the vault).
- A rotation now refuses before it commits when the transparency log's signer would refuse the log append that follows the commit (an unverifiable trust config, or an `artifact-seal` key held by a provider).
- One pre-sign gate for every key, the vault's and a provider's alike (`assertSigningKeyUsable`): the key, identified by its own bytes, must be the one the committed, mark-bound key set names for the purpose and holder; the workspace key revocation list must load, verify and not name it (a missing or unverifiable list refuses every key); and the built-in distrust list must not distrust it at the server clock. A provider is never asked whether its own key is fine: AMC decides from its signed state before the provider is called, and the key the provider then presents must be the bound key by its bytes.

Three decisions recorded for this release:

- ECDSA P-256 signatures have one accepted encoding, IEEE P1363 with low S (s ≤ n/2); DER and the high-S twin are refused everywhere. Ed25519 keeps its 64-byte form with S below the group order.
- Direct purpose signing checks the committed authority, workspace key revocation list and built-in distrust. The asynchronous notary policy path also rechecks its selected descriptor, enforcement policy and applicable operator distrust after the remote wait. Public verification uses its independent trust context; a notary transport pin is not workspace purpose authority.
- Signing has distinct time gates. The vault evicts cached unlocked sessions after 30 minutes since their last unlock/refresh; obtaining a vault key still needs a usable session (or an allowed environment-passphrase unlock). This is an access-session TTL, not a new per-purpose cryptoperiod. Delegated rows additionally require the current delegation window and quota. Credentials and verifier pins retain their own lifetime/`validTo` checks. No claim that delegation is the only signing time limit is intended.

P2-08 adds strict statement/list algorithm and explicit digest-envelope verification in both main and standalone formats. It does not claim new P1-26 public anchoring or P1-25 RFC 3161 qualification. Provider compromise with independent roots, delegate rotation, general purpose binding and complete reserved-owner integration remain limits. Focused native/compiled test and mutation evidence is not final full-suite, hosted-CI, live-cloud or hardware qualification.
