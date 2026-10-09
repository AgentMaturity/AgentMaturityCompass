# Trust lists and pinned issuers

A signature proves who signed a record and that it has not changed since. It does not prove the record is true, and a public key shipped inside an artifact cannot vouch for that artifact: anyone can sign fabricated content with a fresh key and include that key. AMC's trust library (`agent-maturity-compass/trust`) therefore counts a signature only when the person running the verifier pinned its key for that purpose, and the key is neither revoked nor distrusted. The verify commands adopted it in P0-09 PR 2 and PR 3 and in P0-51; see "Status" below.

This page describes the trust-list format, how a key is admitted, the built-in distrust list and the verifier report.

## Status

P0-09 lands in three pull requests. PR 1 added the library, exported as `agent-maturity-compass/trust`, and the maintainer tool `scripts/trust-list.mjs`. **PR 2 wires `amc verify`, `verify all`, `evidence verify`, `session verify`, `agent-loop verify`, `bundle verify`, `cert verify`, `cert verify-revocation`, `passport verify`, `assurance cert-verify` and `release verify`**, their API routes and the flags and exit codes below. **PR 3 wires `audit binder verify`, `bench verify`, `benchmark verify`, `backup verify` (and `backup restore`), `plugin verify`, `plugin registry verify`, `prompt pack verify` and `federate verify-bundle`**, the imports and installs behind them (`benchmark ingest`, `federate import`, `plugin install`, `plugin search`, bench registry imports), their API routes, and binds bench inclusion proofs to the signed Merkle root. **P0-51 wires the last ten portable commands: `bench registry verify`, `bom verify`, `domain pack verify`, `enforce verify-certificate`, `imports verify-profile`, `notary verify-attest`, `passport verify-token`, `session verify-proof`, `transparency merkle verify-proof` and `transparency verify-bundle`**, their API routes, and Studio's native task verification. [The verifier inventory](security/verifier-inventory.md) says which change wired each command; every portable verify command now takes the flags below.

## Two-minute path: pin your own keys

1. When you create a workspace, record the fingerprints of its role keys somewhere outside the workspace, such as a ticket, a release note or a password manager. An AMC fingerprint is the sha256 of the key's canonical PEM (Node's SPKI export, LF line endings), which for the `.pub` files AMC writes is the sha256 of the file:

   ```
   shasum -a 256 .amc/keys/auditor_ed25519.pub .amc/keys/monitor_ed25519.pub
   ```

2. Build the package once (`npm run build`), then create a trust-list root key and a list, and add the auditor key with the purposes it signs. The tool creates missing directories with mode 0700. Pass `--valid-from` with the vault's creation time: an entry admits signatures that claim a time from `validFrom` on, and without the flag it starts now, so artifacts the key signed before today would be refused as `not-yet-valid`. Compare the key id the tool prints with the fingerprint you recorded in step 1, never with one read back from the workspace or artifact you are about to verify.

   ```
   node scripts/trust-list.mjs keygen --out ~/amc-roots --name root
   node scripts/trust-list.mjs init --list-id acme-prod --out ~/.config/amc/trust/amc-trust-list.json --days 90
   node scripts/trust-list.mjs add --list ~/.config/amc/trust/amc-trust-list.json \
     --pubkey auditor_ed25519.pub --purpose artifact-seal --purpose revocation-list \
     --subject "Acme prod-eu-1 workspace, auditor role" --valid-from 2026-03-17T00:00:00.000Z
   node scripts/trust-list.mjs sign --list ~/.config/amc/trust/amc-trust-list.json --key ~/amc-roots/root.key
   ```

3. Pin the root by writing its key id (printed by `keygen`) to `~/.config/amc/trust/trust-roots.json`:

   ```
   { "type": "amc.trust-roots", "version": 1, "roots": ["<64 hex>"] }
   ```

4. Check the list: `node scripts/trust-list.mjs verify --list ~/.config/amc/trust/amc-trust-list.json --root <64 hex>`.

For a single artifact, `--pubkey <path>` pins one key without a list, and `--expect-monitor <sha256>` or `AMC_EXPECTED_MONITOR_FINGERPRINT` pins the ledger's monitor key.

## Default paths and permissions

| File | Default location | Mode |
|---|---|---|
| Trust list | `<AMC home>/trust/amc-trust-list.json` | 0600 |
| Pinned roots | `<AMC home>/trust/trust-roots.json` | 0600 |
| `trust/` directory | `<AMC home>/trust/` | 0700 |

The AMC home is `$AMC_HOME`, or `~/.config/amc` when it is unset. A trust list is only as safe as the directory that holds it: anyone who can write there can pin keys. Keep the root private key off the machine that verifies, and keep root pins apart from the list where you can, for example by passing `--trust-root` from a deployment secret instead of relying on `trust-roots.json`. AMC does not yet check these modes; set them yourself.

## Format

A trust-list file holds the list and one or more root signatures. Unknown fields, including `__proto__`, are refused everywhere, and files over 1 MiB, symbolic links and lists with more than 4,096 entries are refused.

```json
{
  "list": {
    "type": "amc.trust-list", "version": 1, "listId": "acme-prod", "sequence": 3,
    "issuedAt": "2026-10-15T09:00:00.000Z", "expiresAt": "2027-01-15T09:00:00.000Z",
    "entries": [{
      "keyId": "<64 hex>", "algorithm": "ed25519", "publicKeyPem": "<SPKI PEM>",
      "purposes": ["artifact-seal", "revocation-list"],
      "subject": "Acme prod-eu-1 workspace, auditor role",
      "validFrom": "2026-10-15T00:00:00.000Z", "validTo": "2027-10-15T00:00:00.000Z",
      "allowKeyHistory": false, "source": "operator"
    }],
    "distrust": [{
      "keyId": "<64 hex>", "distrustedFrom": null, "reason": "exposed-in-public-history",
      "note": "why this key must never be trusted", "source": "amc-project"
    }]
  },
  "signatures": [{ "keyId": "<64 hex>", "publicKeyPem": "<root SPKI PEM>", "signature": "<base64>" }]
}
```

Entry rules:

- `keyId` is 64 lowercase hex: the sha256 of the UTF-8 `publicKeyPem`, which must be an Ed25519 SPKI public key in canonical PEM form (as Node exports it, with LF line endings). Private keys and certificates are refused. Key ids are unique within a list. `scripts/trust-list.mjs add` stores a CRLF key file in canonical form.
- `purposes` is a non-empty set of: `ledger-row`, `receipt`, `artifact-seal`, `revocation-list`, `config-signature`, `lease`, `session`, `release`, `notary`, `evidence-authority`, `independent-attestation`, `trust-list-root`. An `evidence-authority` entry also needs `authority` (`producers`, `captureMethods`, `maxTrustTier`).
- Times are RFC 3339 UTC (`Z`). `validTo` is after `validFrom`, or `null` for "until revoked".
- `revokedAt` and `revocationReason` (`superseded`, `cessation`, `key-compromise` or `unspecified`) appear together.
- `source` is `operator`, `amc-project` or `imported:<uri>`.
- `listId` matches `[a-z0-9][a-z0-9._-]{0,63}`; `sequence` is a positive integer.

Optional `timestampAuthorities` (P1-25) pins RFC 3161 timestamp authorities: at most 64 entries of `{ "anchorId", "name", "rootCertificatePem", "policyOids"? }`. `anchorId` matches the `listId` pattern and is unique in the list; `rootCertificatePem` is exactly one PEM X.509 certificate (a root, an intermediate or the TSA certificate itself); `policyOids`, when present, lists the TSA policies accepted under that anchor. A timestamp token verifies only through a path to one of these certificates, never through a certificate the token carries. See [TRUSTED_TIME.md](TRUSTED_TIME.md).

Optional `transparencyLogs` (P1-26) pins public transparency logs such as a Rekor v2 shard: at most 64 entries of `{ "logId", "name", "origin", "publicKeyPem" }`. `logId` matches the `listId` pattern and is unique in the list; `origin` is the log's checkpoint origin and signed-note key name (no spaces or `+`); `publicKeyPem` is the log's checkpoint key, an Ed25519 or ECDSA P-256, P-384 or P-521 SPKI public key. A log checkpoint counts only when a C2SP signed-note signature under this key verifies, never under a key a log reply carries. See [PUBLIC_ANCHORING.md](PUBLIC_ANCHORING.md).

### Signing

The signed bytes are the ASCII tag `AMC_TRUST_LIST_V1`, one 0x00 byte, then the canonical JSON of `list` (object keys sorted at every level, arrays kept in order) in UTF-8. The signature is Ed25519 over those bytes, never over a digest, so reordering keys in the file does not change it. In Node:

```js
import { createPrivateKey, createPublicKey, createHash, sign } from "node:crypto";

const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;

export function signList(list, rootPrivateKeyPem) {
  const bytes = Buffer.concat([Buffer.from("AMC_TRUST_LIST_V1", "ascii"), Buffer.from([0]),
    Buffer.from(JSON.stringify(canonical(list)), "utf8")]);
  const publicKeyPem = createPublicKey(createPrivateKey(rootPrivateKeyPem)).export({ type: "spki", format: "pem" }).toString();
  return {
    keyId: createHash("sha256").update(publicKeyPem, "utf8").digest("hex"),
    publicKeyPem,
    signature: sign(null, bytes, rootPrivateKeyPem).toString("base64"),
  };
}
```

The package exports the same operation as `signTrustList(list, rootPrivateKeyPem)`, and `verifySignedTrustList(signed, { pinnedRootKeyIds, now })` accepts a list only when one signature verifies under a pinned root and the list has not expired.

## Where pins come from

`loadTrustContext` builds the verifier's trust context from, in order:

1. `--pubkey <path>`: pins that key for the purposes the command checks.
2. `--expect-monitor <sha256>`, else `AMC_EXPECTED_MONITOR_FINGERPRINT`: pins the monitor key for `ledger-row`. (`domain pack verify` likewise pins `AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY` for the license signature.)
3. `--trust-list <file>` (repeatable), else `<AMC home>/trust/amc-trust-list.json` when it exists.

Lists are checked against `--trust-root <sha256>` (repeatable), else `<AMC home>/trust/trust-roots.json`. A list with no valid signature by a pinned root fails with `TRUST_LIST_SIGNATURE_INVALID`; an expired list fails with `TRUST_LIST_EXPIRED`; a malformed or unreadable file fails with `TRUST_LIST_INVALID`. A failing list is never skipped.

## How a key is admitted

`admitKey` checks one signature's key for one purpose. It identifies the key by the sha256 of its canonical PEM, so a re-encoded copy of a key (for example with CRLF line endings) matches the same pins and distrust entries, and a PEM that is not an Ed25519 public key is never admitted. The checks run in this order:

1. **Distrusted** when the key is on the built-in distrust list or a loaded list's `distrust` entries. A `null` `distrustedFrom` refuses every signature; a date refuses signatures that claim that time or later, and signatures that claim no time.
2. **Admitted (`explicit-key`)** when `--pubkey` or `--expect-monitor` pinned it for this purpose. A pin for another purpose does not admit the key; the checks continue.
3. **Revoked** when any loaded list revokes the key for `key-compromise`, whatever the purpose, the claimed time or the other lists say. Otherwise, for a trust-list entry: **wrong-purpose**, **not-yet-valid** or **expired** (checked at the signature's claimed time, else at verification time), or **revoked**. A claimed time later than the verification time is refused as **not-yet-valid**. A revocation for another reason refuses signatures that claim `revokedAt` or later, or claim no time, and admits earlier claims with `timeBasis: "claimed"` and a warning. An expired entry likewise admits a claim before `validTo` with `timeBasis: "claimed"` and a warning.
4. **Admitted (`trust-list-history`)** when the artifact carries a key-history envelope (AMC-1525) signed by a key that a list admits for this purpose with `allowKeyHistory: true`, and the envelope's role signs this purpose. An anchor that is distrusted, or revoked for `key-compromise` in any loaded list, vouches for no key.
5. Otherwise **not-pinned**, or **unpinned-allowed** under `--allow-unpinned`.

Every refusal names the key id, so you can pin the right key.

### Signing times are claims

Issuer admission still uses the signing time the artifact claims. Since P1-25 a certificate can also carry an RFC 3161 token, and its verifier report states the attested time separately in `time` ([TRUSTED_TIME.md](TRUSTED_TIME.md)); admission does not use it yet. A claim later than the verification time is refused, but a leaked key can backdate a signature to before its revocation or expiry, so treat `timeBasis: "claimed"` admissions as weaker than unconditional ones, and use `key-compromise` when a key leaked.

The claim each command checks: `bundle verify` and `cert verify` use the run seal's own `ts` for `run.json`, and the `signedTs` of `manifest.sig` or `cert.sig` for every other signature the artifact carries; `passport verify` and `assurance cert-verify` use their signature's `signedTs`, which the signed Merkle root shares; `cert verify-revocation` uses the revocation's `ts`; a trust certificate uses its `generatedTs`. Two checks have no signing claim and run at verification time: a release bundle (its `generatedTs` is a reproducible build time, not a signing time) and the ledger's monitor key for `ledger-row`.

## Built-in distrust list

The package ships `dist/trust/amc-distrust.json` (outside any `data/` directory, which the release bundle's tarball safety check refuses) (`{ "distrust": [] }` until P0-37 adds the keys exposed in public history). `loadTrustContext` and `workspaceSelfTrust` always include it, and `admitKey` applies it first: no flag, environment variable or trust list turns it off, and it beats every pin, including `--pubkey` pins and key-history anchors. Every wired verify command applies it. A malformed file stops verification instead of being ignored.

## Workspace self-trust

`workspaceSelfTrust(workspace)` pins the workspace's own role keys for their role purposes (`monitor`: `ledger-row`, `receipt`; `auditor`: `artifact-seal`, `revocation-list`, `config-signature`; `lease`; `session`). It exists for internal round trips, such as an export re-checking what the workspace just signed. Its admissions carry source `workspace-self`, and reports built from it carry a warning saying they are a self-check. A workspace can sign its own configuration, so these keys never count as an independent issuer: `independent-attestation`, `evidence-authority` and `trust-list-root` are never admitted this way, and CLI and API verdicts must not use it.

## Verifier report

Every verifier will return `VerifierReportV1` (`type: "amc.verifier-report"`, `version: 1`). It keeps integrity separate from issuer admission: `integrity` (`pass` or `fail` with errors), `issuerAdmission` (every signature's admission), `anchoring` (`anchored`, `unanchored` or `not-applicable`), and `scope`, `freshness`, `completeness` and `satisfaction`, which stay `not-evaluated` until P1-06. Where a verifier reads time (P1-25), the optional `time` field holds the claimed time, any attested time and its `basis`; `freshness` then states that basis and fails with `BACKDATED_CLAIM` or `POSTDATED_CLAIM` when the claim lies outside the attested window. `trusted` is true only when integrity passes, every signature is admitted and anchoring is not `unanchored`. `--allow-unpinned` and `--allow-unanchored` appear in `overrides` and never make a report trusted.

## Flags

On every wired portable verify command: `--trust-list <file>` and `--trust-root <sha256>` (both repeatable), `--allow-unpinned`, `--allow-unanchored` and `--json`. `--pubkey <path>` pins one key for the purposes the command checks; PR 2 added it to `bundle verify`, `cert verify`, `cert verify-revocation` and `assurance cert-verify`, PR 3 to `benchmark verify`, `plugin registry verify`, `federate verify-bundle` and `backup restore` (which also takes `--trust-list`, `--trust-root` and `--allow-unpinned`, but not `--allow-unanchored`, because a backup carries no ledger to anchor; a restore allowed by `--allow-unpinned` exits 2 with `UNTRUSTED:` on stderr), and P0-51 to `bench registry verify`, `domain pack verify`, `notary verify-attest`, `transparency merkle verify-proof` and `transparency verify-bundle` (`bom verify` already had it, and now it pins). `imports verify-profile` pins the authority key its `--authorities` file names for this signature, and also accepts an `evidence-authority` entry of a loaded trust list whose `keyId` equals the profile's `signature.authorityId`, with that entry's `authority` scope; a listed key is admitted by its list (validity window, revocation), never pinned, and an id that both sources name matches neither. `session verify-proof` pins `--expect-auditor-key`; distrust beats all of these. An artifact that names no signer (an `enforce verify-certificate` proof certificate, a `passport verify-token` HMAC token, an unsigned external-evidence profile, a license signed with a shared secret) has no issuer to admit: it exits 1 whatever the flags, and `--allow-unpinned` does not turn it into exit 2. Over the API, `POST /api/v1/enforce/formal/certificate` answers `status: "UNTRUSTED"` with the reasons, and `POST /api/v1/passport/trust-token/verify` answers `status: "not_evaluated"` without checking the HMAC and refuses a body that carries `secret` (400). `--expect-monitor <sha256>` pins the monitor key on `verify`, `verify all`, `evidence verify`, `bundle verify`, `cert verify`, `session verify` and `agent-loop verify`. The ledger-only commands have no issuer to pin, so they take every flag except `--allow-unpinned`. These are flags on existing commands; no command path is added. Allow flags are never read from environment variables or API request bodies, and API routes build their trust context from the server's AMC home and refuse a body that names a pin or an allow flag.

Example, with the fingerprints and `.pub` files recorded when the workspace was created:

```
amc verify --expect-monitor <monitor sha256>
amc bundle verify run.amcbundle --pubkey ~/amc-pins/auditor.pub --expect-monitor <monitor sha256>
amc cert verify agent.amccert --pubkey ~/amc-pins/auditor.pub --expect-monitor <monitor sha256> --revocation agent.amcrevoke
amc passport verify agent.amcpass --pubkey ~/amc-pins/auditor.pub
amc release verify amc-2.0.0.amcrelease --pubkey release-signing.pub
amc audit binder verify workspace.amcaudit --pubkey ~/amc-pins/auditor.pub
amc backup verify latest.amcbackup --pubkey ~/amc-pins/auditor.pub
amc plugin verify my-plugin.amcplug --pubkey publisher.pub
amc federate verify-bundle latest.amcfed --pubkey peer-publisher.pub
```

Imports and installs have no verify flags; they admit what the operator already pinned. `benchmark ingest` and `plugin search` use the AMC home trust list. `federate import` admits a package from a peer added with `amc federate peer add` (the peer's publisher key, recorded out of band) and takes the benchmarks inside it on that peer's signed manifest. `plugin install` and the marketplace need the registry fingerprint pinned in the workspace's signed registries config, and admit a package only for the publisher the pinned registry's signed index names; bench registry imports work the same way. The registries config counts only with a valid auditor signature, so an edit without it is refused, and a registry key the operator distrusts is refused even when its fingerprint is pinned. Publishing to a plugin or bench registry checks integrity only, because the registry operator vouches for a publisher by signing the index that names it.

A bundle or certificate carries its own ledger, so it is anchored only when its monitor key is pinned; a passport, assurance certificate, audit binder or bench is anchored when its inclusion proofs resolve to its signed Merkle root (`verifyBenchProofBundle` refuses any proof whose own `rootHash` differs from the signed root).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Trusted: integrity verified and every issuer admitted. |
| 1 | Failed: integrity error, an issuer refused, or an unanchored ledger. |
| 2 | Integrity verified but untrusted because `--allow-unpinned` or `--allow-unanchored` was used; stderr starts with `UNTRUSTED:`. |

## Maintainer tool

`scripts/trust-list.mjs` is not shipped in the npm package. Its subcommands are `keygen`, `init`, `add`, `distrust`, `sign` and `verify`; run `node scripts/trust-list.mjs --help` (or `npm run trust-list -- --help`). `add` and `distrust` validate the list before writing and remove existing signatures, so sign again after every edit.
