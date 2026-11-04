# Harness support policy

Status: **draft, pending the maintainer's approval** (P2-17). The qualification windows below are proposals; nothing
here is a commitment until it is approved.

This policy covers the agent harnesses AMC governs through hooks or plugins: Pi, Claude Code, DeepSeek Harness (DSH)
and Codex. What AMC claims for each, version by version, is in the generated [support matrix](SUPPORT_MATRIX.md).

## What "supported" means

- A harness version is supported only when it is listed in that harness's adapter claim manifest
  (`docs/adapters/manifests/<adapter>.json`) and the manifest passes its check.
- An adapter claims enforcement only at the hooks its manifest lists as `enforce`, only at the listed versions, and
  only where a passing case in the cited qualification record backs the hook. Everything else is "observed" or
  "not covered".
- An `enforce` hook must block when it cannot run or AMC cannot answer (`onFailure: "blocks"`). A hook at which the
  harness proceeds on failure is never claimed as enforced.
- AMC never claims OS containment, the harness's own sandbox, or effects outside its hooks.

## Qualifying new harness releases

- New harness releases are qualified within a number of business days the maintainer sets. Proposed: 5 business days
  for Pi and Claude Code, 10 for DSH and Codex.
- Qualification runs the harness conformance suite against the exact released package, records its integrity and the
  per-hook results under `qualification/`, and only then adds the version to the manifest and to the version list
  control accepts.
- Until a version is qualified, control mode fails closed on it: sessions of an unqualified version are refused or
  denied, never governed on trust.

## Retirement and advisories

- A version retires once two newer minor versions are qualified.
- A harness security advisory marks the affected versions unsupported until a fixed version is qualified.

## Pace

Harnesses can ship several releases a week. This policy, not the matrix, sets how fast AMC follows; a release that is
not yet qualified is reported as not supported, not as supported with caveats.
