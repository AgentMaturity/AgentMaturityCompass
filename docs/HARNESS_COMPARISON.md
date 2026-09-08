# Reproducible harness comparisons

AMC runs natively. This optional benchmark facility is not a DSH/Pi adapter
requirement, does not replace AMC tools or sessions, and is not needed to use
AMC. A manifest can contain only AMC for native conformance, or add independently
installed comparator artifacts for a matched study.

The source runner and concrete AMC-only corpus exist; no benchmark execution or
superiority result is claimed by this implementation. Source audits and
automated install contracts are separate evidence from task trials and human
usability studies.

## Concrete native offline corpus

The [native materializer](../examples/harness-comparison/nativeMaterialize.mjs)
turns an **already installed AMC artifact** into executable bindings. It performs
file reads and writes a new corpus directory; it does not start AMC, invoke a
provider, install anything, or execute a trial. DSH and Pi are not dependencies.
Use the source revision from that artifact's actual build receipt, including
the build's dirty-source record where applicable. Do not substitute today's
checkout revision for an older installed build.

```sh
node examples/harness-comparison/nativeMaterialize.mjs \
  --amc-root "$AMC_INSTALLED_PACKAGE_ROOT" \
  --source-url https://github.com/AgentMaturity/AgentMaturityCompass \
  --source-commit "$AMC_BUILD_COMMIT" \
  --package-artifact "$AMC_BUILT_PACKAGE_TGZ" \
  --out /absolute/new-native-corpus \
  --repetitions 3
```

The package archive argument is optional; without it the materializer records
that no archive was supplied. It computes actual hashes for the installed CLI,
Node executable, copied adapter/oracle/helpers, individual case fixtures, and a
bounded installed runtime inventory. The inventory covers AMC's `dist` and
package metadata plus the installed declared dependency, peer and optional
dependency closure, including native addon bytes. It records absent optional
dependencies, verifies dependency resolution has not changed, and refuses
missing required packages or unsupported package-member symlinks. Its limits are
50,000 files, 2,048 packages, 512 MiB per file and 32 MiB of inventory metadata;
hashing uses bounded buffers. OS libraries, kernel and hardware are outside that
content pin. Existing files are never overwritten. A supplied archive hash does
not prove that the installed tree was extracted from that archive or built from
the declared revision; retain the installation/build receipt separately.

After the implementation batch is qualified, execute the generated bindings:

```sh
node "$AMC_INSTALLED_PACKAGE_ROOT/dist/cli.js" bench harness-compare \
  --manifest /absolute/new-native-corpus/nativeManifest.json \
  --out /absolute/new-native-results \
  --allow-adapter-execution
```

`nativeMaterialization.json` records exact repeat argv, real pins, the installed
version, declared source provenance, planned trial count and
`materialized-not-executed`. The manifest fixes the materialization host's exact
Node version, OS and architecture. This corpus supports Linux/macOS x64/arm64;
its genuine process-group crash case deliberately does not claim Windows
support. Three repetitions of the twelve authored cases request 36 trials;
that is a plan, **not an executed sample count**.

| Case | Real action | Independent observable checks |
| --- | --- | --- |
| Echo | Native CLI, installed stub transport and echo demo tool | Actual call/result rows, fixture bytes, two recorded requests, both cold verifiers |
| No tools | Explicit native `tools=none` | Recorded assistant turn, zero dispatch/result rows, valid closure |
| Step bound | One-step native loop with echo | Exactly one request/step, actual tool call, signed `max_steps` ending |
| Retry | Installed stub's one-429 failure injection | Durable request failure, one signed retry, second request and completion |
| Cancellation | Cancel a delayed offline response | Signed user cancellation, settled process, valid closed session |
| Resume | Release and reopen from a separate CLI process | Same identity, two turns, unchanged original event/hash/signature prefix |
| Fork | Fork a closed verified parent | Distinct child, signed exact parent head/sequence, unchanged parent |
| Compaction | Apply explicit summary to a measured user origin | Exact UTF-8 byte difference, replacement hash, raw origin retained, successful continuation |
| Stale edit refusal | Reuse a reviewed head after compaction advanced it | Explicit refusal and byte-identical event/hash/signature snapshot across refusal |
| Tampering | Change one stored signature in the disposable fixture | Both verifiers pass before mutation and refuse afterwards; exactly one signature changed |
| Crash recovery | SIGKILL the real CLI after a durable request header | Dead owner takeover, signed synthetic closure, unchanged prefix, no redispatch |
| Public SDK continuation | Installed `./sdk/native`, committed-update iteration, release, fresh-client load and close | Replayed history, two actual turns, unchanged signed prefix, SDK receipt plus both cold verifiers |

The adapter uses AMC's installed process runner with bounded captures/deadlines
and disposal. Each trial gets a fresh workspace and a newly generated local
fixture vault passphrase in a mode-0600 temporary file. Only that fixture value
is supplied to native processes; ambient provider keys, signing-disable flags,
proxy settings and credential stores are not forwarded. The independent oracle
reads the actual SQLite rows and launches fresh installed CLI verifier
processes. It does not turn driver status, command exit alone, or an adapter
`pass` string into acceptance. Original initialization fingerprint continuity is
checked as a fixture pin, not an external identity attestation. Raw command
receipts and oracle observations are retained through the runner's redacted,
digest-addressed publication; the temporary workspace and its vault fixture are
removed by the runner.

The lane has an explicit **local stub transport**, no provider/model binding,
no provider calls and no price/cost observations. A Node preload refuses socket,
DNS, HTTP and fetch entry points in fixture and native processes. This boundary
is for trusted offline fixture code; it is not kernel confinement or protection
against native addons. Echo checks the side-effect-free demo tool, not workspace
shell/write approval enforcement. Fork checks branching, not subagent
delegation. Crash recovery interrupts a request before tool dispatch and does
not measure recovery of an uncertain external side effect. Step exhaustion
measures the native step bound, not tokens or spend. Compaction measures payload
bytes, not token savings. SDK updates are committed completed blocks, not a
provider token-latency measurement. Timings include CLI/adapter startup,
workspace initialization and runtime-inventory hashing.

The missing injection, redaction, tool-error attribution and unsupported
capability scenarios remain explicit coverage gaps. Live model evaluation,
DSH/Pi execution and human usability/evidence-preparation studies are unavailable
in this corpus. They cannot contribute a zero, pass, ranking or tenfold claim.
The source scripts, materializer and trials remain **unexecuted** until the
deferred implementation-batch qualification.

## Inputs and execution

`runHarnessComparison` in `src/benchmarks/harnessComparison.ts` accepts:

```ts
await runHarnessComparison({
  manifestPath: "/absolute/path/comparison.json",
  outputDir: "/absolute/path/new-results-directory",
  allowAdapterExecution: true,
  allowLive: false,
  redactValues: ["a-known-fixture-canary"],
  signal: abortController.signal
});
```

The small `registerHarnessComparisonCommands(bench)` registrar provides this
integration under an existing `bench` command:

```sh
amc bench harness-compare --manifest /path/comparison.json --out /path/new-results --allow-adapter-execution
```

The registrar is connected to AMC's main CLI. It requires `--live` separately for real-provider lanes. It reads
only credential names explicitly requested by those lanes, and exits nonzero
when any trial is failed, unavailable or inconclusive. The core API returns the
redacted report without inventing a gate success.

For custom studies, the versioned example in
[`examples/harness-comparison/manifest.example.json`](../examples/harness-comparison/manifest.example.json)
is a source-only preparation template. The native materializer above is the
concrete AMC-only option; the generic template is not needed for it. Zero
digests, replacement paths and the
AMC revision are placeholders, not measured artifact identities. Populate them
from the exact local binaries, task fixtures, adapters and independent oracles
you intend to execute. The example has no executable target bindings and cannot
produce a successful comparison without that work.

Each lane fixes provider/model/settings, requested read/write/network/sandbox
permissions, timeout/token/spend limits and named credential requirements. Each
task fixes its fixture and independent oracle. Each target fixes a source URL,
full revision, retrieval date, audit reference, artifact and command inputs. The
environment pins exact OS/architecture/Node version plus public variables.
Concurrency is one, repetition count is explicit, and target order rotates
deterministically between repetitions. Up to 2,000 trials are admitted.

Determinate trials require file digests to match before and after execution. Source revisions remain
declared provenance: a file hash does not prove that a package was built from a
declared commit or pin every dynamically loaded dependency. Preserve the build
recipe, lockfiles and artifact acceptance alongside a publishable study.

## Adapter and oracle contract

A target task binding supplies an exact executable pin, additional input pins
and argv. There is no implicit shell interpretation. Supported substitutions are
`{{artifact}}`, `{{workspace}}`, `{{fixture}}`, `{{context}}`,
`{{observations}}` and indexed `{{input:0}}` pins. The command receives a fresh
workspace/HOME and a versioned context file containing the shared lane and task.
The only live credential variables forwarded are the lane's explicit names.
AMC's existing `runProcess` supplies capture limits, deadline, cancellation and
process-group handling.

The runner is not an OS sandbox. `allowAdapterExecution` authorizes the selected
local code to execute; the pinned adapter must establish the lane's declared
filesystem/network boundary and enforce live token/spend limits. Keyless lanes
cannot request a provider/model, secrets or network destinations. That manifest
restriction does not itself block sockets. Run adversarial or unknown target
code in an independently qualified container/VM rather than treating an
isolated HOME as kernel confinement. Live bindings must declare bounded live
execution support; unknown limits or absent measurements cannot pass a bounded
trial.

An independent oracle receives JSON through stdin with the target's actual
bounded stdout/stderr, process outcome, lane and observations. It returns one
JSON object and exits zero. Example:

```json
{
  "schemaVersion": "2026-09-08",
  "verdict": "pass",
  "checks": [
    {"id": "expected-file", "passed": true, "evidence": "Actual output file matched the pinned expected bytes."}
  ]
}
```

Every check must pass for a `pass`. A `fail` needs an explicit failed check.
`inconclusive` and `unsupported` are neither competitor failures nor passes.
An exit code alone, a success string from the target, or a malformed/truncated
oracle response cannot pass a trial. The oracle sees original captures before
publication redaction, so the report writer cannot accidentally turn a real
credential leak into a passing redaction test.

Adapters may write `observations.json` at the supplied path. Every absent
counter remains unknown. The strict schema supports:

- Input/output tokens and nullable cache-read/cache-write tokens, with a
  `provider-response` or `local-counter` source and evidence reference.
- Actual USD cost observations with `provider-invoice` or
  `published-rate-calculation`, source URL, valid source date and evidence
  reference. No prices are fetched or inferred.
- Intervention and evidence-preparation action counts with an evidence
  reference and either `observed-human` or `automated-fixture` attribution.

Optional oracle `falsePositives` records `count`, `eligible` and `evidenceRef`.
The rate is unknown with no eligible observations; an omitted counter does not
become zero. A claimed provider response or action counter remains attributed
to the recorded adapter/oracle evidence, not independently authenticated by
this runner.

## Scenarios and reports

Keyless conformance scenarios cover success, refusal, injection, redaction,
budget exhaustion, cancellation, crash recovery, tool-error attribution, resume,
tampering, child identity and unsupported capability. Each requires an adapter
that invokes the real native implementation and an oracle that inspects its
result. Source inspection alone is unavailable. Reports list scenarios without a
determinate execution; a partial corpus cannot silently appear complete.

Optional live lanes use matched coding tasks and model/provider settings. Keep
installation actions, first useful verified task, explanation, cancel, resume
and repeat-use cohorts distinct where they measure different things. Existing
source-only audits of DSH, Pi, OpenCode, OpenHands, Goose, Claude Code and Codex
can guide corpus selection; they do not establish artifact execution or an
all-market ranking. See the dated
[September source audit](../AMC_OS/RESEARCH/2026-09-08-dsh-pi/september-harness-usability-audit.md).

`report.json`, `report.md`, `summary.json` and per-trial captures/receipts retain
manifest and artifact digests, exact requested/ran/determinate counts, oracle
outcomes, unknown measurements, source dates and repeat argv. All durable
captures and returned report strings are redacted. Capture truncation is counted,
the partial stream is omitted from publication to avoid exposing split secrets,
and the trial is inconclusive. Temporary raw workspaces are removed after
each trial; cleanup failure also makes it inconclusive.

Latency is full target-command wall time, including adapter startup and the
process-group wait. Timing summaries include failed and inconclusive executions
and show the sample count. Usage/cache/cost/actions each have their own sample
and missing counts. Automated fixture actions are never averaged into human
interventions. No rank, synthetic score, maturity blend or tenfold factor is
generated. A tenfold reduction in manual evidence-preparation actions requires
a separately observed matched human baseline and enough reported samples to
support that exact claim.
