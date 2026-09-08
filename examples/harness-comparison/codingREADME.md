# Three standalone harnesses on the same coding tasks

This preparation workflow binds actual installed AMC, DeepSeek Harness and Pi
CLIs to three identical JavaScript repair tasks. The independent oracle evaluates
the resulting module against fixed expected outputs. It does not require an AMC
ledger, signature, session format or harness-reported success message from any
target. AMC runs its own model loop and tools; the other two programs are optional
benchmark targets, never AMC runtime dependencies.

The three tasks cover interval normalization, quoted CSV parsing and stable
dependency ordering. They are a small controlled repair corpus, **not a
representative coding benchmark or evidence that one harness is superior**.

## Prepare

Build and install each reviewed source into a private consumer. Keep the exact
build/installation receipts and full source revisions. The materializer inventories
the installed packages and their declared transitive dependencies; it refuses
missing required packages, mutable symlink members and overwritten evidence.
It launches no harness or model and downloads nothing.

Create a reviewed JSON configuration with these fields:

```json
{
  "baseURL": "http://127.0.0.1:8080",
  "model": "REPLACE_WITH_ACTUAL_SERVED_MODEL",
  "modelIdentity": {
    "runtimeSha256": "REPLACE_WITH_64_HEX_RUNTIME_HASH",
    "weightsSha256": ["REPLACE_WITH_64_HEX_WEIGHTS_HASH"],
    "auditReference": "REPLACE_WITH_RUNTIME_WEIGHTS_AND_SERVING_PROCESS_RECEIPT"
  },
  "repetitions": 3,
  "timeoutMs": 240000,
  "maxTokens": 16000,
  "maxOutputTokens": 2048,
  "maxRequests": 12,
  "contextWindow": 8192,
  "temperature": 0,
  "targets": [
    {
      "id": "amc",
      "root": "/absolute/private/consumer/node_modules/agent-maturity-compass",
      "cli": "dist/cli.js",
      "source": {
        "url": "https://example.invalid/REPLACE_WITH_AMC_REPOSITORY",
        "commit": "REPLACE_WITH_ACTUAL_40_HEX_REVISION",
        "auditReference": "REPLACE_WITH_INSTALLED_ARTIFACT_BUILD_RECEIPT"
      }
    },
    {
      "id": "dsh",
      "root": "/absolute/private/consumer/node_modules/@deepseek-ai/dsh",
      "cli": "lib/bin.js",
      "source": {
        "url": "https://github.com/deepseek-ai/deepseek-harness",
        "commit": "REPLACE_WITH_ACTUAL_40_HEX_REVISION",
        "auditReference": "REPLACE_WITH_INSTALLED_ARTIFACT_BUILD_RECEIPT"
      }
    },
    {
      "id": "pi",
      "root": "/absolute/private/consumer/node_modules/@earendil-works/pi-coding-agent",
      "cli": "dist/bundle/cli.js",
      "source": {
        "url": "https://github.com/earendil-works/pi",
        "commit": "REPLACE_WITH_ACTUAL_40_HEX_REVISION",
        "auditReference": "REPLACE_WITH_INSTALLED_ARTIFACT_BUILD_RECEIPT"
      }
    }
  ]
}
```

Values above are placeholders, not source or model attestations. Do not put API
keys, account tokens, private prompts or secrets in this public configuration.
The gateway uses a generated per-trial credential towards harnesses and the
synthetic `amc-local-comparison` bearer towards the local server. An endpoint
requiring a real account credential is outside this lane.

```sh
node examples/harness-comparison/codingMaterialize.mjs \
  --config /absolute/reviewed-coding-config.json \
  --out /absolute/new-coding-corpus
```

The generated `codingMaterialization.json` records an exact run argument array.
Review it before executing `amc bench harness-compare` with
`--allow-adapter-execution`. The manifest requires the local-provider lane added
to AMC; older installed versions that lack it must be rebuilt first.

## Execution and limits

Each trial has a fresh repository and private HOME. All targets receive the same
prompt, model identifier, temperature, per-response output cap, request cap and
deadline through an owned literal-loopback forwarding endpoint. The gateway
does not synthesize responses or follow redirects. It buffers a bounded response
before delivery so forwarding integrity and usage can be recorded. This buffering
is common to all targets, and does not measure interactive token latency.

The gateway records request/response hashes, response status and reported token
usage. Missing usage stays unknown and stops further model requests. Recorded
overruns fail the budget qualification; input-token demand cannot be known before
a provider response without that model's tokenizer. A successful task with
unknown usage remains an observed outcome, not a budget-qualified pass. No local
price, provider invoice or zero-cost claim is invented.

Model/runtime hashes are operator declarations. HTTP success and a matching
model name do not prove which weights served a response. Tie the serving process,
runtime, weights, template and startup settings to a separate receipt before
using results as real-model evidence. A scripted endpoint can exercise protocol
and tool bindings, but must be labeled as a scripted fixture and kept separate
from a local-inference study.

Native system prompts and tool schemas differ and remain part of each target.
AMC signs repository-only read/write/search grants; Pi and DSH retain their own
native permission semantics, recorded in adapter receipts. These are not equal
OS confinement boundaries. The runner and import-free bounded oracle VM are
intended for trusted repair fixtures, not hostile programs. Direct network calls,
host access and arbitrary detached processes are not machine-wide sandboxed by
this example. Do not turn this small corpus into an adversarial safety claim.

Published results must keep observed coding outcomes, usage qualification,
governance evidence, human usability and wider platform qualification separate.
No runtime, benchmark or deployment result follows from materialization alone.

## Retained final source

New adapter receipts include `outputSnapshot` for all three targets after their
native process has exited, before the workspace is cleaned up. It captures only
`repo/solution.mjs`: a stable, unsymlinked regular file of at most 128 KiB, decoded
as strict UTF-8 with its BOM preserved. The capture reads the module as data;
it does not execute it or decide the independent oracle verdict. A failed or
timed-out process may still leave a captured file. Setup or spawn failure leaves
`status: "not-captured"`; missing, unsafe, oversized, changed or undecodable
output has `status: "unavailable"` and a fixed reason, without partial source.

For a captured file, `original.sha256` and `original.bytes` describe the actual
file bytes. `retained.sourceText`, `retained.sha256` and `retained.bytes` describe
the text after known synthetic credentials are redacted by the adapter. The
`fidelity.atAdapterCapture` field distinguishes byte-identical text from that
redacted text. These hashes describe the stages named in the receipt, **before
outer publication redaction**. The comparison publisher may redact additional
secret-like material: recompute the digest of the published text before assuming
it still matches the retained digest. A mismatch means that exact adapter text
is no longer available in that published artifact, not that the original file
digest identifies the redacted content. No encoded backup bypasses redaction.

The original snapshot and the later independent oracle may observe different
bytes if another process changes the file; compare their digests and retain that
limitation rather than inferring agreement. Older pilot receipts that retained
only a source digest do not acquire historical source bytes from this change.
