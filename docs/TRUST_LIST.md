# Trust lists and pinned issuers

A signature proves who signed a record and that it has not changed since. It does not prove the record is true, and a public key shipped inside an artifact cannot vouch for that artifact: anyone can sign fabricated content with a fresh key and include that key. AMC's trust library (`agent-maturity-compass/trust`) therefore counts a signature only when the person running the verifier pinned its key for that purpose, and the key is neither revoked nor distrusted. The verify commands adopt it in P0-09 PR 2 and PR 3; see "Status" below.

This page describes the trust-list format, how a key is admitted, the built-in distrust list and the verifier report.

## Status

P0-09 lands in three pull requests. PR 1 added the library, exported as `agent-maturity-compass/trust`, and the maintainer tool `scripts/trust-list.mjs`. **PR 2 wires `amc verify`, `verify all`, `evidence verify`, `session verify`, `agent-loop verify`, `bundle verify`, `cert verify`, `cert verify-revocation`, `passport verify`, `assurance cert-verify` and `release verify`**, their API routes and the flags and exit codes below. PR 3 wires the remaining verifiers marked PR 3 in [the verifier inventory](security/verifier-inventory.md); until then they behave as before.

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
2. `--expect-monitor <sha256>`, else `AMC_EXPECTED_MONITOR_FINGERPRINT`: pins the monitor key for `ledger-row`.
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

Until trusted time lands (P1-25), a signing time is whatever the artifact claims. A claim later than the verification time is refused, but a leaked key can backdate a signature to before its revocation or expiry, so treat `timeBasis: "claimed"` admissions as weaker than unconditional ones, and use `key-compromise` when a key leaked.

## Built-in distrust list

The package ships `dist/trust/amc-distrust.json` (outside any `data/` directory, which the release bundle's tarball safety check refuses) (`{ "distrust": [] }` until P0-37 adds the keys exposed in public history). `loadTrustContext` and `workspaceSelfTrust` always include it, and `admitKey` applies it first: no flag, environment variable or trust list turns it off, and it beats every pin, including `--pubkey` pins and key-history anchors. Every verify command wired so far applies it. A malformed file stops verification instead of being ignored.

## Workspace self-trust

`workspaceSelfTrust(workspace)` pins the workspace's own role keys for their role purposes (`monitor`: `ledger-row`, `receipt`; `auditor`: `artifact-seal`, `revocation-list`, `config-signature`; `lease`; `session`). It exists for internal round trips, such as an export re-checking what the workspace just signed. Its admissions carry source `workspace-self`, and reports built from it carry a warning saying they are a self-check. A workspace can sign its own configuration, so these keys never count as an independent issuer: `independent-attestation`, `evidence-authority` and `trust-list-root` are never admitted this way, and CLI and API verdicts must not use it.

## Verifier report

Every verifier will return `VerifierReportV1` (`type: "amc.verifier-report"`, `version: 1`). It keeps integrity separate from issuer admission: `integrity` (`pass` or `fail` with errors), `issuerAdmission` (every signature's admission), `anchoring` (`anchored`, `unanchored` or `not-applicable`), and `scope`, `freshness`, `completeness` and `satisfaction`, which stay `not-evaluated` until P1-06. `trusted` is true only when integrity passes, every signature is admitted and anchoring is not `unanchored`. `--allow-unpinned` and `--allow-unanchored` appear in `overrides` and never make a report trusted.

## Flags

On every portable verify command wired so far: `--trust-list <file>` and `--trust-root <sha256>` (both repeatable), `--allow-unpinned`, `--allow-unanchored` and `--json`. `--pubkey <path>` pins one key for the purposes the command checks; PR 2 added it to `bundle verify`, `cert verify`, `cert verify-revocation` and `assurance cert-verify`. `--expect-monitor <sha256>` pins the monitor key on `verify`, `verify all`, `evidence verify`, `bundle verify`, `cert verify`, `session verify` and `agent-loop verify`. The ledger-only commands have no issuer to pin, so they take every flag except `--allow-unpinned`. These are flags on existing commands; no command path is added. Allow flags are never read from environment variables or API request bodies, and API routes build their trust context from the server's AMC home and refuse a body that names a pin or an allow flag.

Example, with the fingerprints and `.pub` files recorded when the workspace was created:

```
amc verify --expect-monitor <monitor sha256>
amc bundle verify run.amcbundle --pubkey ~/amc-pins/auditor.pub --expect-monitor <monitor sha256>
amc cert verify agent.amccert --pubkey ~/amc-pins/auditor.pub --expect-monitor <monitor sha256> --revocation agent.amcrevoke
amc passport verify agent.amcpass --pubkey ~/amc-pins/auditor.pub
amc release verify amc-2.0.0.amcrelease --pubkey release-signing.pub
```

A bundle or certificate carries its own ledger, so it is anchored only when its monitor key is pinned; a passport or assurance certificate is anchored when its inclusion proofs resolve to its signed Merkle root.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Trusted: integrity verified and every issuer admitted. |
| 1 | Failed: integrity error, an issuer refused, or an unanchored ledger. |
| 2 | Integrity verified but untrusted because `--allow-unpinned` or `--allow-unanchored` was used; stderr starts with `UNTRUSTED:`. |

## Maintainer tool

`scripts/trust-list.mjs` is not shipped in the npm package. Its subcommands are `keygen`, `init`, `add`, `distrust`, `sign` and `verify`; run `node scripts/trust-list.mjs --help` (or `npm run trust-list -- --help`). `add` and `distrust` validate the list before writing and remove existing signatures, so sign again after every edit.
