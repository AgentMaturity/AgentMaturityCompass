# Verified lesson transfer

Lesson transfer is off by default. It uses the existing correction-memory ledger, not a separate lesson library. Legacy lessons without signed transfer provenance remain readable but are not eligible for transfer.

An owner can attach provenance when extracting lessons from verified effective corrections:

```sh
amc memory-extract --agent default --provenance lesson-provenance.json
amc prompt pack build --agent default --lessons lesson-run.json --out run.amcprompt
```

`lesson-provenance.json` contains the cue and the explicit source scope:

```json
{
  "cue": "When a tool result needs verification",
  "scope": "transferable",
  "domain": "software",
  "libraryVersion": "library-v1",
  "experimentalMode": "candidate",
  "sourceTaskIndex": 1,
  "partition": "train",
  "sourceFixtureIds": ["fixture-1"]
}
```

For an already extracted legacy lesson, explicit provenance enrollment creates one new signed version at the current time. The original must still pass verification and remain active, unexpired and free of drift. Its ID and digest become signed lineage in the new version. The original record is preserved; the active-lesson cap still applies. Later revocation or loss of eligibility of that original also excludes its enrolled version.

Optional `candidateSha256` and `resourceSha256` bind validated candidate/resource digests. The extractor adds the workspace scope, verified outcome timestamp, baseline and verification run IDs, and a requirement to recheck observations. These fields are covered by the existing lesson content hash and ledger-row signature. They describe the source outcome, not causal proof that the lesson improves another task. Provenance is an owner assertion about the source partition and task ordering; it does not establish hidden-evaluation isolation.

`lesson-run.json` freezes the target run context:

```json
{
  "runId": "run-target",
  "runStartTs": 1793318400000,
  "taskIndex": 5,
  "domain": "software",
  "libraryVersion": "library-v1",
  "experimentalMode": "candidate",
  "maxLessons": 10
}
```

Supply the actual run start timestamp, never compilation time for a run already underway. The compiler excludes lessons created or verified at or after that start, and source task indices at or after the target index. Source baseline/verification run IDs cannot equal the target run. Domain, library version and experimental mode must match. Held-out, expired, revoked, superseded, drifting, missing-lineage and ineffective-source lessons are excluded. Workspace-scoped lessons stay with their source agent and workspace. Cross-agent transfer requires `scope: "transferable"` and explicit `sourceAgentIds` in the target context.

Every eligible lesson must pass existing content hash, chain, signature and signed, anchored status-log verification. Scoped extraction and retrieval also authenticate the source correction content hash and ledger-row signature. Historical corrections with inconsistent hashes, including timestamp mismatches from an older writer, remain ineligible; the reader does not repair or re-sign them. Transfer never re-anchors or repairs that log. Sensitive prompt content fails admission before publication. Lessons are framed as literal attributed historical data and require current evidence before application. An empty selection records `NO_ENTRY` in the pack and provider prompts.

`compilePromptPack` previews the selection without incrementing counters. Managed publication of the signed pack and lint report records exact lesson IDs and content digests in `correction_lesson_consumptions` and increments each lesson once per pack ID. This receipt establishes committed artifact inclusion, not model execution or measured efficacy. Replaying the same committed pack does not increment counts again.

`preparePromptForBridgeRequest` requires trusted caller-provided `lessonRun` containing the full target run JSON above, matching the normalized signed context (including task index, domain, mode and library version) when it contains selected lessons. It also rechecks eligibility and revocation. Enforced bridge injection always authenticates the archive, even when the legacy `requirePackSignatureValid` toggle is false; untrusted metadata cannot disable lesson admission guards. The general bridge transport has no authenticated run-start input, so it refuses selected lesson packs rather than infer a start from request arrival or lease issuance. Existing transports can use packs without lesson transfer. A composition with a trusted run record can call the existing preparation API with its exact context.

The deterministic ablation fixture compares identical tasks and settings with and without lessons. It checks attribution and inclusion plumbing; measured benefit requires a separate evaluation campaign.
