<!-- SPDX-License-Identifier: MIT -->
# 4. Evidence model

Status: normative.

## Records

Each record is identified by the `$id` of its JSON Schema (draft 2020-12). The schemas are generated from the zod
parsers AMC runs (`src/contracts/`), listed with their SHA-256 in `spec/schemas/index.json`, and served at their
`$id`. The published `$id`s, generated from that index:

<!-- amc:spec:schema-ids -->
- `https://agentmaturity.co/spec/schemas/v1/a4-conformance-statement.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-decision.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-deployment-receipt.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-gate-policy.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-gate.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-integration-claim.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-intent.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-package.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-project.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-readiness.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-record.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-release.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-revision.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-rollback-receipt.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-transition.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/a4-value-claim.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/amcaudit.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/amcbench.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/amccert.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/amcpass.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/amcprompt.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/amcproof.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/authorization-record.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/break-glass.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/catalog-lock.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/claim-envelope.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/conformance-results.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/control-record.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/control-result.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/detokenization-receipt.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/evidence-event.schema.json`
- `https://agentmaturity.co/standards/external-evidence/v1/schema.json`
- `https://agentmaturity.co/spec/schemas/v1/legacy-receipt.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/pack-manifest.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/receipt.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/redaction-receipt.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/register-entry.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/registry.bench.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/registry.passport.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/review-record.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/scoped-attestation.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/scoped-exception.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/signature-envelope.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/trust-list.schema.json`
- `https://agentmaturity.co/spec/schemas/v2/scoped-attestation.schema.json`
- `https://agentmaturity.co/spec/schemas/v1/verifier-report.schema.json`
<!-- /amc:spec:schema-ids -->

1. A producer MUST write records that parse under the schema of the `$id` it claims.
2. A consumer MUST parse a record with the schema of its `$id` before reading any member. Where a schema says
   `additionalProperties: false`, an unknown member MUST make the record fail to parse.
3. Members a schema allows but does not name are not evidence of anything. A consumer MUST NOT read a conclusion from
   them.
4. A published v1 `$id` MUST NOT change meaning. A compatible addition regenerates the v1 schema; a breaking change
   MUST use a new major path (`v2/`), as `https://agentmaturity.co/spec/schemas/v2/scoped-attestation.schema.json`
   does.

The record most producers write is the ledger row, `https://agentmaturity.co/spec/schemas/v1/evidence-event.schema.json`.
Execution state is `https://agentmaturity.co/spec/schemas/v1/receipt.schema.json` (chapter 7).

## Canonical form and hashing

Canonical form, hash pre-images and signed bytes for each record are specified in
[`spec/ACCEPTANCE_RULES.md`](../ACCEPTANCE_RULES.md), sections "Canonical form" and the per-record sections, with
test vectors.

1. An implementation MUST compute hashes and signatures over exactly the bytes those sections name.
2. A verifier MUST NOT strip, add or reorder members of a signed record before checking it. It parses a copy and
   verifies the original bytes.
3. AMC's canonical form for v1 records is not RFC 8785 (JCS): integer-like object keys sort first, in ascending
   numeric order. A second implementation MUST reproduce that rule for v1 records. Whether v2 records adopt RFC 8785
   is an open RFC (see [chapter 10](10-versioning.md) and the changelog).

## Known limit of v1

An `evidence-event` export does not carry the full hash pre-image (payload path, inline payload, stored meta text).
A verifier holding only the export cannot recompute `eventHash`, so it MUST report hash integrity as not evaluated
rather than pass. Recomputing needs the ledger. A portable pre-image is an open RFC for v2.
