# Evaluator Registry

AMC exposes a small signed metadata catalog for the evaluators it already owns. It covers deterministic metrics, LLM-as-judge metrics, and Shield assurance packs without adding a second evaluator engine or dynamic plugin registry.

## Inspect The Catalog

The normal command is read-only:

```bash
amc eval registry
amc eval registry --json
```

Before the first explicit refresh, status is `UNINITIALIZED`. The command does not create a workspace, signing key, registry file, or other state.

Create or replace the derived snapshot only when you intend to record the currently loaded package inventory:

```bash
amc eval registry --refresh
amc eval registry --refresh --json
```

AMC writes `.amc/evaluators/registry.json` and its domain-separated signature under the existing control-file lock. The snapshot contains only bounded metadata:

- stable evaluator ID, display name, category, kind, and Score/Shield surface
- AMC package version for AMC-owned evaluators
- package-relative owner module, never an absolute local path
- implementation and definition SHA-256 fingerprints
- explicit trust state and the requirement for evaluator-result evidence

It does not contain evaluator source, prompts, scenario text, responses, secrets, credentials, or local paths.

## Status Contract

| Status | Meaning | Claim eligible |
| --- | --- | --- |
| `TRUSTED` | Signature, schema, counts, order, definition hashes, and current runtime hash all verify; every entry is AMC-owned | Yes, for registry identity only |
| `PARTIAL` | The signed current inventory includes one or more runtime custom metrics | No |
| `STALE` | A valid signed snapshot no longer matches the loaded evaluator inventory | No |
| `INVALID` | The file, signature, artifact kind, schema, duplicate-key rule, counts, IDs, or hashes fail verification | No |
| `UNINITIALIZED` | No snapshot or signature exists | No |

Custom metrics are disclosed as `custom-metric://amc/...`, with no AMC version or owner-module claim. Replacing a built-in metric implementation also makes that entry custom and unverified.

## Claim Boundary

Registry status proves only which evaluator definitions are loaded and which exact metadata was signed. It is not evaluator-result evidence. It does not prove that an evaluator ran, that its result passed, that an agent is safe, or that a maturity score is justified. Those claims still require AMC's execution evidence and signed receipts.

The snapshot is derived and replaceable. It is not an append-only evidence ledger, external evaluator marketplace, remote service, dynamic discovery system, or scoring-methodology version.
