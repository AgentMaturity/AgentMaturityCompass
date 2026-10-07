# Public anchoring (Rekor v2)

AMC's transparency log is local and signed with the workspace's own keys, so on its own it cannot show that history was not rewritten and re-signed. Public anchoring (P1-26) records a digest of a signed transparency checkpoint in an independent, append-only public log, Sigstore Rekor v2. A third party can then check offline that an entry existed in a tree the log recorded, and that the tree you show them extends it.

An anchor is evidence that a checkpoint digest was recorded in a public log you and the verifier trust. It does not show that the logged evidence is true, complete or compliant.

## What goes public

Only this, per anchor, as one `hashedrekord` v0.0.2 entry:

- the SHA-256 of an AMC checkpoint note;
- a P-256 public key generated for that one submission, and its signature over the note.

The note itself, the workspace ID, entry contents, tenant names and every other identifier stay in the workspace. The one-time key means entries cannot be linked to each other or to your workspace keys through the log. Rekor v2's `hashedrekord` accepts only prehashing signature schemes (ECDSA, RSA, Ed25519ph), and Node has no Ed25519ph, which is the other reason AMC does not submit with the workspace's Ed25519 keys.

Entries in a public log are permanent and public. Read the log operator's terms of use before you configure one; a public instance may rate-limit or restrict use, and AMC never contacts a log you did not configure. Each anchor is one request and one permanent entry, so `anchorEvery: daily` (the default) keeps the footprint small.

## What is anchored

A ledger checkpoint (P1-25, [TRUSTED_TIME.md](TRUSTED_TIME.md)) whose transparency tree is `rfc9162-sha256` ([TRANSPARENCY_MERKLE.md](TRANSPARENCY_MERKLE.md); migrate a legacy log first) becomes a C2SP checkpoint (c2sp.org/tlog-checkpoint) in a C2SP signed note (c2sp.org/signed-note):

```
amc-transparency/<workspaceId>
<transparency tree size>
<base64 RFC 9162 root>
amc-ledger-checkpoint <sequence> <ledger checkpoint sha256>

— amc-transparency/<workspaceId> <base64(key ID || Ed25519 signature)>
```

The extension line binds the note to the monitor-signed ledger checkpoint, which commits to the ledger head. The note is signed with the auditor key, the key that signs Merkle roots (`artifact-seal`). When the trust config requires the notary for `MERKLE_ROOT`, AMC does not sign notes with the vault key and anchoring stops with an error, because the notary signs digests, not notes.

Notes and receipts are stored as `.amc/transparency/anchors/<sequence>.note` and `.amc/transparency/anchors/<sequence>.<anchor name>.json`.

## Configure

1. Pin the log in your signed trust list ([TRUST_LIST.md](TRUST_LIST.md)) under `transparencyLogs`, with the shard's checkpoint origin and public key:

   ```json
   "transparencyLogs": [
     { "logId": "rekor-v2-shard", "name": "Rekor v2 shard", "origin": "<shard origin>", "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n..." }
   ]
   ```

   Take the origin (the shard's host name, which is also its signed-note key name) and the public key from the `tlogs` entry for the Rekor v2 shard in Sigstore's trusted root (`trusted_root.json`, distributed through Sigstore's TUF repository), and convert the DER key to PEM. Sigstore rotates shards and keys through TUF: when it publishes a new shard, add it as a new entry and re-sign the list; keep the old entry while old anchors must still verify.

2. Pin a TSA (`timestampAuthorities`) and configure `time.tsa` ([TRUSTED_TIME.md](TRUSTED_TIME.md)). Rekor v2 records no time, so every anchor carries an RFC 3161 token over the note's digest, and anchoring needs a TSA.

3. Name the log in `.amc/amc.config.yaml`:

   ```yaml
   transparency:
     anchorEvery: daily        # or: checkpoint
     anchors:
       - name: rekor           # used in file names: [a-z0-9][a-z0-9._-]*
         backend: rekor-v2
         url: https://<rekor v2 shard>/
         logIds: [rekor-v2-shard]
   ```

The Studio scheduler then anchors the newest ledger checkpoint after its checkpoint step: on every new checkpoint with `checkpoint`, at most once per 24 hours per log with `daily`. For each anchor it signs the note, fetches an RFC 3161 token over the note's SHA-256 first (so it never submits an entry it cannot complete), then POSTs `/api/v2/log/entries` and stores the reply verbatim. The request goes through the same egress decision as TSA requests (`decideEgress`: the host must resolve only to public addresses, AMC connects to the address it checked, a non-public address only when the URL names that exact IP literal), refuses redirects and credentials in the URL, accepts only HTTP 201 `application/json`, stops after 30 seconds (Rekor answers once a checkpoint covers the entry) and caps the reply at 64 KiB. Failures are returned to the scheduler and retried on a later checkpoint; nothing is anchored silently or reported as anchored without verification.

## Verify

Everything verifies offline from recorded data, against the verifier's own trust: logs in `transparencyLogs` and TSAs in `timestampAuthorities` of signed trust lists. A key or certificate a log reply carries never counts.

For a receipt, AMC checks that:

1. the receipt names the note's SHA-256;
2. the reply's entry body is canonical JSON for a `hashedrekord` v0.0.2 entry whose `SHA2_256` digest is that SHA-256;
3. the reply's log checkpoint is a C2SP note with a valid signature under a pinned log key whose `origin` is the note's first line (Ed25519 or ECDSA P-256/P-384/P-521 checkpoint keys);
4. the RFC 9162 inclusion proof from the entry's leaf (`SHA-256(0x00 || body)`) at its log index resolves to that signed checkpoint's root and size;
5. the RFC 3161 token over the note's SHA-256 verifies against a pinned TSA.

`amc transparency merkle verify-proof` reports the result in `anchoring.public` of its verifier report:

| `status` | When |
|---|---|
| `anchored` | the bundle's note is signed by an auditor key you admit for `artifact-seal`, the signed root extends the anchored tree (RFC 9162 consistency proof), the receipt verifies as above, and the entry lies inside the anchored tree. `backend` and `logIndex` say where. |
| `not-anchored` | the bundle carries no anchor, the log or the TSA is not pinned, the receipt has no token, or the entry is newer than the anchored tree. |
| `invalid` | any check against pinned trust fails. This is also an integrity error, so the report is not trusted. |

A verifier with only the proof bundle and its pinned keys can repeat all of this with standard RFC 9162 and C2SP tooling.

## Not covered

- SCITT. RFC 9943 and RFC 9942 leave the leaf construction of a registered statement to each transparency service, so an offline receipt verifier needs a service profile. The backend waits for a chosen service.
- Recorded fixtures from the public Rekor v2 log: submitting a test entry creates a permanent public record and needs the maintainer's written approval.
- Consistency between successive Rekor checkpoints (log monitoring and witnessing) and anchors embedded in passports, certificates and session proofs.
- Anchoring at each session seal: the scheduler anchors checkpoints, which it writes on its own schedule.
