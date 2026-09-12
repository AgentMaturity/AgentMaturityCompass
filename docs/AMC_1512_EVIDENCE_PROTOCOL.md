# AMC-1512 — real-provider evidence protocol

Version: `amc-1512-provider-evidence/1`, authored September 10, 2026.
**IMPLEMENTED PROTOCOL; EXECUTION HELD; NO PROVIDER RESULT.**

This is the operator collection/review contract for Phase A step 2, not a new
provider adapter, benchmark runner or acceptance result. The current instruction
prohibits tests, checks, builds, imports, fixtures, acceptance and provider
execution. Nothing in this document lifts that hold, including guide, doctor,
help, hash-validation or verifier commands. Future commands below are unexecuted.

## Purpose and authority

AMC-1512 needs a real-provider sample of the public native workflow plus a
separately observed human first-use study. A working scripted endpoint does not
supply either. A real local-model sample is not a paid remote-provider sample.
Human presence, real inference, protocol conformance and answer quality are
separate axes; none can be inferred from another.

Use this packet with [the human protocol](AMC_1512_HUMAN_FIRST_USE_PROTOCOL.md),
[the existing study contract](HUMAN_FIRST_USE_STUDY.md),
[capture](HUMAN_FIRST_USE_CAPTURE.md) and [observer](HUMAN_FIRST_USE_OBSERVER.md).
Those existing script schemas remain authoritative. This packet adds source and
artifact binding, a case manifest, evidence requirements and reviewer decisions;
it does not introduce a replacement intake format or certify participants.

The companion planning forms are under
`AMC_OS/RESEARCH/2026-09-10-amc-1512-evidence-protocols/`:
`provider-plan.template.json`, `human-plan.template.json` and
`observation-review.template.json`. They are deliberately unfilled, not observed
trials, not runnable configuration, and not input accepted by the existing CLI.

## Source observations, not execution qualification

On authoring, direct reads of `.git/HEAD` and
`.git/refs/heads/amc/gap-register-execution` returned the integration branch and
`4d2d69e5d4d01bfd1f82662ceff0305b5c2885b5`. Current source files have later
modifications. This ref is not a pin of uncommitted bytes, a clean-tree report,
an installed artifact, or proof of the current runtime.

The current text of `src/cli-agent-commands.ts` registers native `guide`, `chat`,
`run` and `verify`; `amc agent` still denotes the separate registry. It registers
explicit provider/model/credential references, `--tools none`, `--no-delegate`,
`--max-steps`, `--max-tokens`, run `--stream`, `--keep-open`, `--session` and
`--fork-from`. Ctrl-C or run `--cancel-after` requests cancellation. There is
no `agent-loop cancel <session>` command in that source. Do not invent one.

`src/cli-agent-options.ts` contains route selection and request parameter mapping.
`docs/NATIVE_PROVIDER_CACHE_REPORT.md` separates configured labels and recorded
usage from remote-model authentication and billing. The packet does not promote
route strings, gateway templates or unqualified modality source to tested
provider breadth. Select one explicitly reviewed native text route for the first
sample, not every advertised provider. Route-specific settings must be recorded;
for example, the source requires explicit disabled DeepSeek thinking for a
tools-free chat. Do not silently discard an unsupported setting.

## Admission before any future execution

All of the following must be recorded before changing the hold to authorized:

1. **Candidate:** full integration commit containing all intended changes;
   fresh isolated clone path; clean initial source disposition; lockfile,
   installed package and executable identity; artifact byte size and SHA-256;
   build/install receipt paths. Do not build from this shared dirty root.
2. **Environment:** actual OS/version, architecture, Node/version/ABI, package
   manager/version, machine class, working directory, local history backend,
   entry point and isolated credential/skills home. Historical Node 22 or Node
   24 receipts cannot populate a new observation. Record exact approved setup
   steps and any failure instead of silently preconfiguring around it.
3. **Provider:** requested native adapter and encoder versions, model identifier,
   returned model label when available, immutable model revision when available,
   approved endpoint identity and transport evidence, exact request settings and
   their digest. A mutable/undisclosed remote model revision stays unknown;
   record it as a comparability limitation, not a guessed version.
4. **Authority and budget:** named approving operator and dated approval for the
   exact endpoint, account and plan; reference name only for the credential;
   maximum billable requests, total token/spend budget and timeout/cleanup grace;
   concrete enforcing mechanism and its reviewed configuration. A per-request
   token limit is not a whole-session spend cap. Runtime retry policy and
   cumulative budget admission must be pinned. No observer-added retry, model
   substitution, new key, gateway or stub fallback is allowed.
5. **Isolation and policy:** disposable workspace, exact selected agent,
   signed-policy digests and intended tool/write scope. The primary task has
   tools disabled, delegation disabled, and no MCP, extensions, public-check
   hooks or network access granted through tools. Necessary AMC local evidence
   writes are distinct from model tool permission. No claim of OS confinement
   follows from a signed allowlist or a machine having a sandbox installed.
6. **Collection:** preregistered case IDs and order; unique private recording
   and receipt directories; retention/deletion owner; redaction policy; stop
   rule and owned process-group cleanup method. Every attempted case must keep
   its own disposition, including setup failures and uncertain command delivery.

Unknown required values keep execution blocked. Filling these forms is not
authorization. No production secret, signing key or credential file is needed
for this authoring task; do not read one to fill a planning form.

## Common primary task

Use these exact UTF-8 prompt bytes, without a trailing newline:

> Draft three acceptance tests for a CLI that imports JSONL, rejects malformed records, and reports partial failures.

Set **one model step per turn, 512 output tokens per request, tools none and
delegation off**. These are protocol limits, not measured latency, usage or cost.
Keep the exact user prompt separate from AMC's assembled system prompt; retain
the latter's provenance rather than claiming all harness prompts are identical.

Source-derived future entry forms (replace every placeholder only after approval):

```text
<pinned-amc-entry> agent-loop chat --agent <agent-id> --provider <native-route> --model <model-id> --credential <reference-name> --credentials-home <isolated-home> --tools none --no-delegate --max-steps 1 --max-tokens 512
<pinned-amc-entry> agent-loop run --agent <agent-id> --provider <native-route> --model <model-id> --credential <reference-name> --credentials-home <isolated-home> --tools none --no-delegate --max-steps 1 --max-tokens 512 --stream --json --keep-open "<exact-primary-prompt>"
<pinned-amc-entry> session show <recorded-session-id> --json
<pinned-amc-entry> agent-loop verify <recorded-session-id> --json
```

Choose chat for the human-facing primary sample; run is a separately labelled
operator sample, not a surrogate human. Preserve an explicit credential file or
endpoint override across turns when one was approved. Never substitute the
default current agent for the recorded owner during resume. Do not paste secrets
into argv, labels, notes or recordings. No generated IDs are supplied by this
protocol: use only IDs returned by the actual future operation.

## Preregistered case manifest

The JSON plan enumerates these cases; none has run. RP-01 through RP-04 are the
minimum real-sample chain. Other cases support AMC-1512's workflow claim and
must be named as outstanding rather than assumed covered by that chain.

| Case | Procedure and required observation | Non-passing / limited result |
|---|---|---|
| RP-00 | In an isolated configuration with a deliberately unavailable reference, inspect the public missing-credential/route guidance; preserve the refusal and exact next action. No live request intended. | A named fix is not successful authentication; no session/request ID may be invented when admission precedes creation. This is setup evidence, not a real-model sample. |
| RP-01 | Submit the common prompt through actual installed native chat on the approved real endpoint. Preserve complete terminal output, request/header and linked outcome references, actual dispatch evidence, provisional streaming and recorded settlement. | No dispatch, stub/scripted endpoint, unsupported route, interrupted stream, missing linkage or missing recording cannot qualify a completed real task. |
| RP-02 | Review the recorded answer against the three-part useful-result rubric below; record the exact answer reference and rationale independently of command exit. | A clean exit, model response, signed ledger or plausible prose alone is insufficient. |
| RP-03 | Deliberately inspect that exact recorded session and preserve cumulative usage, failures, policy/write scope and displayed evidence reference. | Inspection is not signature verification. Unknown cache/usage fields remain null, not zero. |
| RP-04 | After the writer releases, use the isolated installed entry to cold-verify the same history and request chain. Keep the complete report and exit disposition. | No empty history, different backend, reconstructed-only placeholder or old candidate result can stand in. Verification cannot attest remote model identity or answer quality. |
| RP-05 | In a separately labelled recovery turn, send a bounded prompt, interrupt using the supported Ctrl-C path, record request and termination boundaries, then deliberately resume the same unsealed session with the same owner/configuration. | If the turn finishes before interruption, report not observed; do not fabricate cancellation or keep retrying until it occurs. Cancellation requested is not confirmed process/provider termination. |
| RP-06 | Exercise another explicit user turn and, separately, the supported fork form. Retain same-session continuity for resume and a distinct child plus verified parent-lineage reference for fork. | A guessed ID, copied parent result, changed agent, unexplained provider/settings drift or a failed result swallowed by chat cannot count as continuity. |
| RP-07 | Separate optional approval lane only after its exact tool/policy scope is reviewed: observe pending approval, record authenticated decision/readback, retain denial and permitted side-effect observations. | Tools remain disabled in the primary lane. A decision acknowledgement is not clean delivery or proof of effect. No automatic approval exception or policy widening to obtain success. Unattempted approval is outstanding, not passed. |

Do not improvise crash, network-drop or policy-mutation experiments inside this
packet. They require separate named candidate-bound qualification after the
execution hold is lifted. A graceful Ctrl-C result does not prove those cases.

## Useful-result rubric

An independent reviewer records each criterion as met / unmet / unknown and
points to the actual answer bytes. The useful-result decision also preserves
the participant's own judgement in human sessions.

- A concrete valid JSONL input and its expected import outcome.
- A concrete malformed record and its expected rejection/error behavior.
- A mixed valid/invalid example with explicit expected partial-failure reporting,
  so silent all-or-nothing success would not satisfy the described test.

Tests must be actionable examples with expected outcomes, not merely restating
the prompt. Do not execute generated tests during this study or treat an LLM
judge as the independent human. Preserve disagreements: observer-declared useful
time and reviewer quality judgement are separate fields. Do not retroactively
move the timestamp or alter the source journal to improve the result.

## Evidence envelope and privacy

For each attempted case, retain the plan digest, exact source/artifact/settings
pins, operator/observer pseudonym, actual start/end/time source, sanitized argv,
exit/signal/timeout disposition, stdout/stderr/terminal recording references,
session/parent IDs, signed header/outcome/turn-ending references and all failures.
Record actual provider dispatch support and limitations separately from claimed
provider/model labels. Link a provider-issued request identifier when available;
absence is unknown, not an invented identifier or evidence of no call.

Each retained file needs relative path, byte size, SHA-256, collection origin,
raw-versus-redacted designation, access/retention owner and missing-file reason.
Keep raw private records access-controlled. Publish only reviewed redacted
derivatives with their own digests and the transformation description; never
alter a raw file while retaining its old hash. A hash establishes byte identity,
not the truth of a transcript, a live provider or a human's presence. Do not
commit credentials, cookies, tokens, private keys, participant identities or
account/billing details. Where safe collection cannot be achieved, keep the
case blocked/inconclusive rather than silently discarding contrary evidence.

Usage records distinguish completed, partial, failed and pending requests.
Copy known provider-reported input/output/cache values with source references;
keep missing values null. Do not sum step copies as extra requests. A request
cache-read hit, token reuse ratio, remote cache behavior and billing savings are
different measures. Cost remains unknown without dated applicable pricing or
actual billing evidence; no price is supplied here.

## Review and disposition

Use the unfilled review form only after observation. Keep independent verdicts
for protocol completeness, real-dispatch support, streaming, task usefulness,
evidence verification, cancellation/resume, approval delivery and cleanup.
Allowed case dispositions: not-started, blocked-before-dispatch, completed,
failed, cancelled, inconclusive, not-observed, not-applicable-with-reason.
None automatically means the issue is Done. Every verdict must reference raw
evidence or explicitly state why it is unknown. Record all originally planned
cases and later amendments; do not delete failures, choose only winners or reuse
an earlier case ID for a fresh attempt.

The real sample is reportable only with a source-bound observed dispatch,
preserved answer and quality review, linked complete evidence, cold-verifier
disposition and process closure. Failure is reportable evidence too; it is not a
qualified successful sample. Remote model authenticity remains limited to the
recorded transport/operator/provider evidence, never proved by AMC's signature.

Release/Done still requires the standing brief's merged implementation,
fresh-candidate acceptance, full suite, named release-gate disposition, durable
receipt, appropriate Linear transition and Obsidian evidence. All execution and
state closure remain deferred here. An AMC provider sample is neither the
five-human-per-harness study nor AMC-1518 matched comparative outcomes.

## Dated evidence retained

The September 8 installed identity receipt at
`AMC_OS/RESEARCH/2026-09-08-dsh-pi/native-identity-installed-91b2ad3b/receipt.json`
records 40 passed / 0 failed assertions at source
`91b2ad3b1543370ceabd7236ce2823e51c6d3165`, Darwin ARM64 / Node v24.20.0.
Its provider is explicitly scripted loopback OpenAI Responses HTTP/SSE; its own
limitations exclude real-provider, human-usability and answer-quality claims.

The September 8 local pilot disposition at
`AMC_OS/RESEARCH/2026-09-08-dsh-pi/real-local-coding-pilot/pilot-9b60d86f-a1813776/disposition.json`
records zero qualified passes, five qualified failures and four inconclusive
trials, with six completed-response trials. Its runtime source is
`9b60d86fd74a7bd3b294c893b506f6da32373623`, helper
`a1813776d1ec133258fd9bcf4b2e6b10ebf70b36`. This is dated local-model evidence,
not a new remote-provider result, human study or causal harness ranking.

## September 11, 2026 — separately versioned evidence transfer

Task `amc-1512-evidence-transfer-v2-2026-09-11` authors the separate
`amc-1512-evidence-transfer/2` review/mapping packet at
`AMC_OS/RESEARCH/2026-09-11-amc-1512-evidence-transfer-v2/`.
Read `EVIDENCE_TRANSFER_PROTOCOL.v2.md`, `CAPTURE_INPUT_MAPPING.v2.md` and
`evidence-transfer.v2.template.json` there. Applicability is explicit capture
`2026-09-10.1`, intake `2026-09-10`, credentials `1`; it does not change this
provider protocol's identity or upgrade the preserved transfer/1 packet.

The study-level sidecar binds original preparation, source/migration/correction
occurrences and each actual-use declaration to explicit attempt/request/answer/
recording and independent-review references. Provider-returned IDs remain distinct
from native local keys; unjoined requests, retries, failures and unavailable
original bytes remain visible. A declared use or matching hash is not inference
authentication. All observation fields are blank; catalog layouts are not rows.
No sidecar field belongs in strict capture input. No new collector, converter,
provider run, human study or qualification is implemented by this addendum.
