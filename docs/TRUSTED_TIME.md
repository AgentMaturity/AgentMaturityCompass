# Trusted time (RFC 3161)

AMC keeps two kinds of time apart.

- **Claimed time** is whatever the writer recorded: an event's `ts`, a certificate's `issuedTs`, a signature's `signedTs`. AMC stores it as written and never overwrites it, but a writer can backdate or postdate it, so it proves nothing on its own.
- **Attested time** comes from an RFC 3161 timestamp token: a timestamp authority (TSA) signed a SHA-256 digest together with its `genTime`. AMC counts a token only when it verifies offline against a TSA anchor the operator pinned in a signed trust list.

A token proves that **this hash existed by `genTime`**. It does not prove that the content is true, that it was written at the claimed time, or who wrote it (the artifact's own signatures and issuer admission answer that).

## Configure

1. Pin the TSA in your trust list ([TRUST_LIST.md](TRUST_LIST.md)) under `timestampAuthorities`:

   ```json
   "timestampAuthorities": [
     { "anchorId": "acme-tsa-root", "name": "Acme TSA root", "rootCertificatePem": "-----BEGIN CERTIFICATE-----\n...", "policyOids": ["1.2.3.4.1"] }
   ]
   ```

   `rootCertificatePem` can be the TSA's root, an intermediate or the TSA certificate itself. `policyOids` is optional.

2. Name the TSAs in `.amc/amc.config.yaml`:

   ```yaml
   time:
     tsa:
       - name: acme
         url: https://tsa.example.com/
         anchorIds: [acme-tsa-root]
         # reqPolicy: 1.2.3.4.1
     required: false          # true: checkpoints and certificate issuance fail without a verified token
     toleranceMinutes: 5
     checkpoint:
       everyEvents: 1000
       everyMinutes: 15
   ```

Without `time.tsa`, nothing changes: no request is made and no checkpoint is written. AMC never contacts a TSA you did not configure, and its tests never contact one at all. Public TSAs have rate limits and terms of use; choose TSAs by policy.

## Requests

For each configured TSA, in order, AMC sends one DER `TimeStampReq` (version 1, SHA-256 message imprint, a random 64-bit nonce, `certReq: true`, optional `reqPolicy`) as an HTTP(S) POST with `Content-Type: application/timestamp-query` (RFC 3161 §3.4). It accepts only an HTTP 200 reply with `Content-Type: application/timestamp-reply`, refuses redirects, stops after 10 seconds and refuses replies over 64 KiB. The first reply whose token verifies (imprint, nonce, requested policy, a pinned anchor named in `anchorIds`) wins; otherwise AMC tries the next TSA.

The destination goes through the same egress decision as the gateway and the shell proxy (`decideEgress`): a TSA host name must resolve only to public addresses, and AMC connects to the address it checked. A non-public address (loopback, private, link-local, metadata) is reachable only when the URL names that exact IP literal. A URL with credentials is refused.

## Verification

The verifier (`verifyTimestampToken`) works offline, on Node's built-in crypto, and refuses:

| Code | When |
|---|---|
| `TST_MALFORMED` | not DER, truncated, over 64 KiB, not CMS SignedData carrying `id-ct-TSTInfo`, or not exactly one signer |
| `TST_STATUS_REJECTED` | the reply's status is not `granted` or `grantedWithMods` |
| `TST_IMPRINT_MISMATCH` | the imprint is not the expected SHA-256 digest |
| `TST_NONCE_MISMATCH` | the nonce differs from the request's |
| `TST_SIGNATURE_INVALID` | the CMS signature, `content-type` or `message-digest` attribute fails, no signing-certificate (RFC 2634) or signing-certificate-v2 (RFC 5816) attribute binds the signer, or the algorithm is not accepted (SHA-1 signatures are refused) |
| `TST_UNTRUSTED_TSA` | no path from the signer to a pinned anchor, or the policy is not one the anchor allows |
| `TST_EKU_MISSING` | the TSA certificate's extended key usage is not exactly one critical `id-kp-timeStamping` |
| `TST_CERT_EXPIRED_AT_GENTIME` | `genTime` lies outside a validity period on the path |

Path checks cover issuer signatures, the CA flag and validity at `genTime`. Name and policy constraints are not checked. **Revocation is not checked:** every attested time carries `revocationChecked: false`. Long-term validation with archived CRLs or OCSP responses, and eIDAS qualified timestamps, are out of scope.

## Ledger checkpoints

A checkpoint (`amc.ledger-checkpoint`, version 1) commits to the ledger head (`headEventHash`, `eventCount`), the transparency root (with the tree it uses, `amc-legacy-v1` or `rfc9162-sha256`) and the previous checkpoint's SHA-256, and records its own `claimedAt`. AMC verifies the ledger up to the head, the transparency root and the earlier checkpoints first, then signs the checkpoint with the monitor (`ledger-row`) key and writes `.amc/time/checkpoints/<sequence>.json`. The token over the checkpoint's canonical SHA-256 is stored next to it as `<sequence>.tsr`, and a `time/checkpoint` ledger event records the checkpoint and token digests.

- Every event the checkpoint covers existed by the token's `genTime`: an **upper bound**.
- Every event after the `time/checkpoint` event chains through the token's digest, so it was written after `genTime`: a **lower bound**.

An event between two timestamped checkpoints therefore gets `basis: "attested-window"`; one covered only from above gets `attested-upper-bound`; any other event stays `claimed`. A claimed time earlier than the window's start, or later than its end, by more than the token's accuracy plus `toleranceMinutes`, is reported as `BACKDATED_CLAIM` or `POSTDATED_CLAIM`. `ledgerTimeline` computes these windows offline from a verified ledger.

Ledger appends never wait on a TSA. The Studio scheduler writes a checkpoint every `everyEvents` events or `everyMinutes` minutes (whichever comes first, and only when new events exist) and retries checkpoints still waiting for a token; a checkpoint without a token stays pending. With `time.required: true`, writing a checkpoint fails when no TSA grants a verified token.

## Certificates

When TSAs are configured, `amc certify` timestamps the SHA-256 of `cert.json`, embeds the token as `timestamps/<sha256>.tsr` and lists it under `timestamps` in `metadata/exportInfo.json`. With `time.required: true`, issuance fails without a verified token; otherwise the certificate is issued without one and the command prints why.

`amc cert verify` reports `time` in its verifier report: the certificate's `issuedTs` as `claimedAt`, and the attested time when the token verifies against a TSA anchor in the trust lists you pass (`basis: "attested-upper-bound"`). A token that is present but broken is an integrity failure. A token from a TSA you did not pin leaves the basis `claimed`, with a warning.

## Not yet covered

- Checkpoints at each session seal: sealing is synchronous today, so the Studio scheduler picks the new events up on its next tick.
- Timestamps on attestations other than `.amccert`, and attested time in issuer admission (which still uses the claimed signing time).
- Surfacing per-event windows in `amc verify` output. Public anchoring of checkpoints in Rekor v2 is described in [PUBLIC_ANCHORING.md](PUBLIC_ANCHORING.md); SCITT is not covered.
