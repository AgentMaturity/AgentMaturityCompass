# Deterministic improvement demo

This source-checkout example shows a known directory typo fail, a candidate correction pass, and the existing experiment gate select the candidate. It is a **demo-only synthetic fixture**, not evidence of model capability, real-world uplift, or agent maturity.

## Run

Use Node 22 and a source checkout with dependencies installed. Build the checkout with `npm run -s build`, then run this command from the repository root:

```sh
node examples/improvement-demo/run.mjs
```

No model credentials are needed. The runner prints only a JSON summary labelled `DEMO ONLY`; it creates a separate temporary workspace and removes its data when the run finishes, including on failure.

For the pinned fixture, expect three failed baseline cases, three passed candidate cases, and gate status `pass` with decision `promote-candidate`. The current fixture run reports:

```json
{
  "baseline": { "failed": 3 },
  "candidate": { "passed": 3 },
  "gate": { "status": "pass", "decision": "promote-candidate" },
  "provenance": {
    "syntheticRows": 168,
    "bookkeepingRows": 12,
    "maturityRows": 0
  }
}
```

This is an excerpt of the summary. It also includes the manifest SHA-256, execution method, evaluated split, and per-case oracle results.

## What executes

The fixture calls `runExecutedExperimentAsync`, the same core used by the existing `amc experiment run --execute-trials` path. It runs `nativeTrialRunner` through the real ToolPipeline and `fs.read` tool, writes signed local records, and invokes the real experiment gate. It does not use the simulation path or introduce a new AMC CLI command or flag.

The stock stub provider ignores personas. This fixture therefore uses a fixture-only scripted decoder over the existing in-process stub transport and decoder. The script selects one read path from the admitted configuration and the task's filename. It receives no oracle answers. The baseline reads `workspace/demo-only-missing`; the candidate corrects that directory to `workspace/demo-only-notes`. Both execute the governed tool against real temporary files.

The casebook contains six pinned cases. The pinned experiment ID makes the ordinary holdout partition deterministic: three held-out cases each receive a baseline trial and a candidate trial. An independent oracle checks the actual recorded `fs.read` tool-result bytes against separately defined expected content. It does not grade the model's final answer, a candidate label, or a digest.

The demo gate requires at least three paired cases, success-rate uplift of 0.5, value uplift of 50 points, no regression, and an interval above zero. It omits a cost-ratio condition because the baseline has zero successes and its cost per success is unavailable. Case validators explicitly set `minCorrelationRatio: 0`. These are demo-only choices, not recommended production qualification thresholds.

## Evidence and isolation

Native trial rows are stamped `demoOnly: true`, `claimKind: synthetic_example`, and `trustTier: SELF_REPORTED`. The executor's 12 existing `OBSERVED` start/settle rows are `NON_MATURITY` bookkeeping; they are not synthetic trial rows. The fixture asserts that no rows are admitted by registered maturity emitters (`maturityRows: 0`). A promotion decision applies only to this synthetic candidate comparison.

“Keyless” means no model credentials. The temporary workspace still uses normal local signing keys and a random, temporary vault passphrase. No signing key or passphrase is committed. Keys, checkpoints, guard state, input files, and ledger records stay in the separate scratch area and are removed in cleanup; affected environment variables are restored.

The manifest pins SHA-256 values for the baseline and candidate configurations, casebook, oracle, and runner. The summary includes the manifest digest. These pins detect changes relative to the checked-in manifest; they are not an external trust anchor.

## Verify

After building, run the fixture test:

```sh
npx vitest run tests/improvementDemo.test.ts --maxWorkers=2 --configLoader runner --no-cache
```

The test runs with an empty provider-credential environment and blocks fetch, sockets, HTTP, HTTPS, TLS, UDP, and DNS entry points. It checks the real offline trials, oracle results, promotion decision, provenance boundary, a changed pinned artifact, and a defective candidate even after that candidate is re-pinned.
