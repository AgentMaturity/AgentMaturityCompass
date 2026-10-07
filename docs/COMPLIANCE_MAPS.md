# Compliance Maps

AMC Compliance Maps are signed control/evidence crosswalks used by the Audit Binder.

They map deterministic AMC evidence checks to control families and framework-like groupings (for example SOC2-like, ISO-like, NIST-like labels).

This is an engineering crosswalk, not legal advice.

These are the audit-binder maps (`amc audit map`). The `amc compliance report` maps (`.amc/compliance-maps.yaml`) bind evidence differently: an event counts only when its `meta.controlIds` names the control (or a declared audit type matches), it belongs to the reported agent, it comes from AMC runtime and it falls inside the window; anything else leaves the category NOT_EVALUATED. See [COMPLIANCE.md](COMPLIANCE.md#evidence-binding-and-not-evaluated).

## Structure

An audit map defines:

- control families (minimum 9 in builtin v1)
- controls per family (minimum 4 each)
- required evidence kinds
- strong-claim gates (integrity/correlation thresholds)
- deterministic checks (`satisfiedBy`)
- remediation action hints

Each control outputs:

- `PASS`, `FAIL`, or `INSUFFICIENT_EVIDENCE`
- deterministic reason codes
- evidence refs (hashes/ids only)

## Signing and Governance

- `builtin.yaml` and `active.yaml` are both signed.
- Only OWNER can apply a new active map.
- Invalid map signature fails closed for audit endpoints and readiness checks.

## Commands

```bash
amc audit map list
amc audit map show --id builtin
amc audit map apply --file ./active.yaml --reason "activate enterprise map"
amc audit map verify
```

## Extending Safely

When adding map content:

- keep checks deterministic and evidence-bound
- keep reason templates fixed (no model-generated text)
- never require raw prompt/content disclosure
- preserve privacy-safe outputs (hashes, refs, categorical statuses)
