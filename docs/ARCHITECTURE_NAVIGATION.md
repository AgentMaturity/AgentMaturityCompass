# Reading AMC through its code graph

Start with the flow you need to change. The [Graphify guide](CODE_GRAPH.md) explains how to query the complete local graph. The smaller maps below reduce that graph to a few connected files so a contributor can follow an operation without opening the CLI monolith first.

## Native agent execution

Read these files in order:

1. [`cli-agent-commands.ts`](../src/cli-agent-commands.ts) validates the operator request and loads the composed runner. The native command is currently a checkout capability; distributing its private workspace dependencies is tracked by AMC-1510.
2. [`agentLoopRunner.ts`](../src/kernel/agentLoopRunner.ts) opens the session, composes credentials, model, prompt, approval and loop services, then disposes them in reverse order.
3. [`agentDriver.ts`](../src/agent/agentDriver.ts) owns turn and step lifecycles. End events belong in the same control flow as cancellation and failure.
4. [`stepRunner.ts`](../src/agent/stepRunner.ts) makes a model request and dispatches tool calls through the supplied seam. [`pipelineToolSeam.ts`](../src/agent/pipelineToolSeam.ts) connects that seam to governed tool execution.
5. [`sessionService.ts`](../src/session/sessionService.ts) supplies the event vocabulary. [`sessionSpine.ts`](../src/session/sessionSpine.ts) owns the durable append boundary and advances the chain head only after a successful write.

The dependency map is `graphify-out/navigation/native-runtime/graph.html`. The graph is a source-navigation aid: a missing edge does not show that a dynamic service connection is absent. Start with the runner's composition order when investigating those connections.

## External evidence import

The reading order is [`cli-import-commands.ts`](../src/cli-import-commands.ts) → [`neutralImporter.ts`](../src/importers/neutralImporter.ts) → the lifecycle, readiness and Watch writers it calls.

| Question | Source to inspect |
|---|---|
| What format is accepted, and what will be written? | `validateNeutralImport` in [`neutralImporter.ts`](../src/importers/neutralImporter.ts) |
| Where are raw records normalized and imported? | `parseCandidates` and `runNeutralImport` in the same file |
| Has an evaluation actually happened? | [`evidenceReadiness.ts`](../src/diagnostic/evidenceReadiness.ts) and [`EVIDENCE_TRUST.md`](EVIDENCE_TRUST.md) |
| What lifecycle state is published? | [`episodeRecord.ts`](../src/lifecycle/episodeRecord.ts) and [`lifecycleRunArtifact.ts`](../src/lifecycle/lifecycleRunArtifact.ts) |
| Where do failed traces become Watch findings? | [`traceFailureIndex.ts`](../src/watch/traceFailureIndex.ts) |

The focused map is `graphify-out/navigation/evidence-imports/graph.html`. Imported records remain self-reported and unevaluated. A signature on the generated artifact does not establish that AMC observed the original activity. AMC-1506 repairs the misleading maturity summary; nested Pi failure handling and explicit loss reporting have separate acceptance work in AMC-1507 and AMC-1523.

## Signing authority and exported proofs

Follow both the local reader and the exported representation:

1. [`keys.ts`](../src/crypto/keys.ts) selects signing keys and historical verification candidates.
2. [`vault.ts`](../src/vault/vault.ts) owns private material and key publication; [`keyHistoryEnvelope.ts`](../src/crypto/keyHistoryEnvelope.ts) authenticates admission and [`keyRotationReceipt.ts`](../src/crypto/keyRotationReceipt.ts) records continuity. [`keyHistoryChain.ts`](../src/crypto/keyHistoryChain.ts) handles structural hash linkage. [`ledgerConnection.ts`](../src/ledger/ledgerConnection.ts) separates read-only verification from writer initialization and migrations.
3. [`signer.ts`](../src/crypto/signing/signer.ts) chooses local/notary signing; [`trustConfig.ts`](../src/trust/trustConfig.ts) defines configured trust.
4. [`bundle.ts`](../src/bundles/bundle.ts) exports evidence and public-key history. [`certificate.ts`](../src/assurance/certificate.ts) consumes keys in offline certification paths.
5. [`ledgerVerification.ts`](../src/ledger/ledgerVerification.ts) opens evidence without initializing signing keys. SQLite session readers forward that mode; [`blobKeys.ts`](../src/storage/blobs/blobKeys.ts) refuses missing decryption keys during reads. SQLite can still create its WAL coordination files.

The focused map is `graphify-out/navigation/trust-and-publication/graph.html`. AMC-1525 tracks authenticated history admission, including export consumers. Hash-chain consistency alone cannot authorize a new signing key. This map is not a security certification; use the issue's attack regressions and verification receipt to judge the fix.

## Rebuild the focused maps

Use a Python environment containing the reviewed Graphify version. This optional development tool is independent of AMC's runtime dependencies.

```sh
uv run --with graphifyy==0.9.56 graphify extract . --code-only --no-cluster --max-workers 4 --out graphify-out/ast
uv run --with graphifyy==0.9.56 python scripts/graphify-navigation.py --graph graphify-out/ast/graphify-out/graph.json
```

To also generate notes and Canvas files, add `--obsidian-dir /absolute/path/to/vault/Graphify-Generated` to the second command. Use a dedicated directory; Graphify keeps a manifest of its generated notes. No API key or semantic backend is required. HTML uses Graphify's pinned vis-network CDN; JSON and Obsidian Canvas remain available independently.

`summary.json` records raw graph digest, file hashes at map generation, graph counts, omitted edges and missing requested files. Re-extract after source changes; compare source hashes before trusting a saved map. The source commit recorded at map generation does not prove the input graph was extracted at that commit.

## How to use the findings

The initial reduced graph contained 1,998 local files and 7,148 directed file pairs. The largest outgoing dependency surfaces were `src/cli.ts` (356), `src/index.ts` (279), the assurance-pack barrel (145) and Studio's server (141). These counts include type imports and re-exports; they are navigation priorities, not complexity or defect scores.

For CLI changes, begin with the registered command module. For Studio changes, begin with the relevant router. For barrel files, inspect the exported implementation rather than splitting a catalog merely to reduce its count. Keep source extraction and existing architecture/size checks as evidence for any proposed decomposition.

The raw extraction had 1,884 edges with unresolved endpoints and 851 inferred edges. The reduced maps omit those edges and list the number of dependencies crossing each focused boundary. Four Terraform files had no installed parser. Tests, vendor trees, generated files and archived Python are excluded by `.graphifyignore`. Dynamic dispatch, service injection and runtime behavior still require source inspection and meaningful tests.
