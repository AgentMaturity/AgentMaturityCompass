# External evidence profile v1

The profile is a small JSON interchange format for producers and verifiers that do not run an AMC workspace. It represents source identities, events, source time, unknowns, declared policy references and provenance. It does not contain a maturity score. The implementation is available at `agent-maturity-compass/standard/external-evidence` and imports only Node's cryptography module.

This is an AMC-proposed profile. An implementation and conformance corpus do not establish independent adoption or an industry standard. The current implementation batch awaits its combined validation run.

## Create and consume an import

`amc import <path> --dry-run --json` shows the source digests, mapping losses and semantic digest. Apply with `--expected-digest <reviewed-digest>`. Each applied source writes bounded profiles under `.amc/imports/runs/<import-id>/external-evidence/`; `amc imports show <import-id>` lists the exact paths. Each file is independently consumable. The importer also retains the fuller redacted source in `normalized.json` and, unless `--no-retain-original` is passed, the exact original bytes encrypted in the workspace blob store; profiles never embed those originals.

The generic export is an operational trace projection. It retains reported failures/cancellations, source times and source identifiers as attributes. It omits payloads, usage, costs and unproven tool/parent edges. A source with no mapped traces emits an empty profile with explicit losses. Multiple parts remain separate; no cross-part lineage is invented. Imported profiles stay unsigned and `SELF_REPORTED`, regardless of the importer's local signing key.

```sh
amc imports verify-profile profile.json --original original.jsonl --json
```

This command requires no workspace or provider. Omit `--original` when original bytes are unavailable; the receipt then says `declared-not-checked`. `--expected-digest` supplies an independently received semantic digest. `--authorities keys.json` supplies the verifier operator's admitted keys and producer/capture scope. Keys embedded in the evidence are never admitted.

The command reports with the shared verifier report and exit codes (`docs/TRUST_LIST.md`). It exits 0 only for a signed profile whose authority key `--authorities` names and that the operator's distrust (built-in list, `--trust-list`) does not refuse. An unsigned profile, including every imported `SELF_REPORTED` profile, names no signer and exits 1 with `not-pinned`, even when its digests check out: the JSON output still shows `originalDigest`, `trustTier` and the integrity errors, so a well-formed self-reported profile is visible as such, but it is never reported as trusted.

An independent Node consumer needs only the exported module:

```js
import { readFileSync } from "node:fs";
import { verifyExternalEvidence } from "agent-maturity-compass/standard/external-evidence";

const profile = JSON.parse(readFileSync("profile.json", "utf8"));
const result = verifyExternalEvidence(profile, {
  originalBytes: readFileSync("original.jsonl")
});
console.log(result);
process.exitCode = result.ok ? 0 : 1;
```

`ok` means the supplied structure, references, digests and any supplied signature/authority checks agree. An unsigned file with internally consistent hashes can be valid and still self-reported. It does not prove that a task ran, succeeded, complied with a policy, or earned a score. Protect independently received digests and admitted keys separately from the evidence.

## Contract

Every field is required unless described as nullable. Unknown values use JSON `null`; absent data is not zero.

| Field | Meaning |
|---|---|
| `profile`, `version` | Exact `amc.external-evidence`, integer `1` |
| `source` | Producer/version, SHA-256 of original source bytes, source media type |
| `session` | Session identity and nullable declared parent session identity |
| `provenance` | Declared trust tier, capture method and nullable authority identity |
| `normalization` | Normalizer version, semantic SHA-256, separate ingestion time, explicit losses |
| `policyRefs` | Opaque declared references; no policy execution is inferred |
| `events` | Ordered events with stable IDs and optional source parent/tool identities |
| `signature` | Nullable Ed25519 envelope; the public key is supplied independently |

An event has `id`, `parentId`, `toolCallId`, `kind`, `outcome`, `sourceTime`, `durationNs`, `cost` and flat `attributes`. Kinds are `input`, `output`, `tool-call`, `tool-result`, `error`, `cancel` and `metadata`. Outcome is `success`, `failure`, `cancelled`, `unknown` or `null`. A reported successful tool call is not a successful overall task.

Event IDs are unique. A non-null event parent must precede its child in the same profile. Tool calls have unique non-null call IDs; a tool result must reference one preceding call and cannot settle it twice. Tool failures retain `kind: tool-result` and `outcome: failure`; cancellation can be a separate cancel event. A partial tool call without a result is permitted and remains incomplete. Session parents are declared external references: this verifier reports `declared-not-verified` and does not claim to verify another session.

Source time and ingestion time use canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ` and must describe real calendar times. Durations use nonnegative safe integer nanoseconds. Costs use decimal strings, uppercase three-letter currencies, a named source and a dated `asOf`; unknown cost is null. Numeric attributes are safe integers. Text must contain valid Unicode. Profiles are bounded to 16 MiB, 10,000 events, 256 attributes per event and 256 loss/policy entries. Unknown fields and versions are refused.

The JSON schema is exported as `externalEvidenceProfileSchema` and included in generated standard bundles as `external-evidence.schema.json`. Schema validation describes shape. `validateExternalEvidenceProfile` additionally enforces references and semantic digest consistency. `verifyExternalEvidence` applies external authority rules. The schema URL is an identifier; it does not promise a hosted schema endpoint.

## Canonicalization and signing

Canonical JSON uses object keys sorted by UTF-16 code units, unchanged array order, no whitespace and JavaScript JSON escaping/number formatting. Restricting numbers to safe integers avoids floating-point interoperability ambiguity. Encode as UTF-8, without a byte-order mark. Reject malformed Unicode before encoding.

The normalized digest hashes `{profile, version, source, session, provenance, normalizer, losses, policyRefs, events}`. Here `normalizer` and `losses` come from the normalization object. Ingestion time and signature are excluded; re-ingesting unchanged semantic content does not manufacture a different semantic identity. It is separate from the reviewed multi-source import digest.

The signature signs UTF-8 `amc.external-evidence/v1\n` followed by canonical JSON for the full profile with the `signature` field omitted. This includes the ingestion time and normalized digest. Use the exported `externalEvidenceSigningBytes` to obtain these bytes. The signature is exactly 64 bytes encoded as canonical padded Base64. Public keys must be Ed25519 PEMs admitted by the verifier operator.

Each admitted authority has `id`, `publicKeyPem`, `maxTrustTier`, `captureMethods` and `producers`. The signature identity must match the provenance identity and one uniquely admitted authority for the named producer. Import capture never exceeds `SELF_REPORTED`. Producer callbacks can reach at most `ATTESTED`; `OBSERVED` requires an admitted governed-capture authority. A declaration cannot exceed that admission, and the verifier never raises a producer's own lower declaration. Any verification error returns `SELF_REPORTED` with `ok: false`.

## Versioning and interoperability

Breaking field, unit, identity or canonicalization changes require a new profile version. Producers retain original bytes or clearly disclose when only a declared original digest remains. Migration is explicit, produces a new normalizer version/digest and records losses. Do not silently reinterpret newer versions.

Pi v3 sessions, Pi callback telemetry and DSH session imports remain their own source formats. Their import projections can use this common envelope without claiming all source semantics survived. Full runtime-specific tool/branch detail stays in the normalized source artifact. The conformance fixture generator under `examples/external-evidence` creates synthetic Pi-shaped and DSH-shaped evidence; these are format examples, not captures of real tasks or head-to-head benchmark results.
