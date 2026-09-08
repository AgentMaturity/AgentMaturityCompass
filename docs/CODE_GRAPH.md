# Code Graph (Graphify)

A queryable source graph for navigating AMC's imports, exports, calls and
containment relationships. Built with [Graphify](https://github.com/Graphify-Labs/graphify)
(Apache-2.0/MIT). The graph is **generated, never committed**. Static extraction
has unresolved and inferred relationships; it does not capture every runtime
connection. Counts depend on corpus, extraction and build stages.

In a [repository checkout](https://github.com/AgentMaturity/AgentMaturityCompass)
that includes the focused-map tooling, read `docs/ARCHITECTURE_NAVIGATION.md`
for guided paths through native execution, evidence import, trust/publication,
SDK/MCP/provider integration and sandbox/DSH launch boundaries.
That contributor guide and its generated maps are checkout resources rather
than pages in this public Docs collection. The maps can also be exported to
Obsidian.

## Build

```bash
uv tool install graphifyy==0.9.56
npm run graph:update        # writes graphify-out/ (git-ignored)
```

`.graphifyignore` scopes extraction to production code: tests, vendored
packages, generated output and working directories are excluded. Code
extraction is local AST parsing with zero model tokens. The explicit
`--code-only --no-cluster` flow in the focused-map guide avoids semantic
extraction. Graphify's optional semantic features are outside this workflow.

## Browse

Open `graphify-out/graph.html` for the generated overview, when present.
Large graphs use an aggregated view. `graphify-out/GRAPH_REPORT.md` describes
that build. For a smaller starting point, open one of the focused HTML maps
under `graphify-out/navigation/`. The HTML viewer loads vis-network from its
pinned CDN; graph JSON and Obsidian Canvas do not need that viewer.

## Query

Every edge is tagged `EXTRACTED` (explicit in source) or `INFERRED` (with a
confidence). Verified on `47141f7a`:

```bash
# what a module depends on and who depends on it
graphify explain "sessionService.ts"
#   --> sha256Hex() [imports], src/types.ts [imports_from], sessionSpine.ts [re_exports] ...
#   <-- agentLoopRunner.ts, llmRuntime.ts, agentDriver.ts, stepRunner.ts, streamRecorder.ts ...

# how one module reaches another (directed: follows imports)
graphify path "cli.ts" "ledger.ts"
#   cli-agent-commands.ts --imports_from--> agentToolset.ts --imports_from--> ledger.ts

# add --undirected when the two share a dependency rather than a chain
graphify path "neutralImporter.ts" "runner.ts" --undirected
```

## Freshness

`GRAPH_REPORT.md` records the commit it was built from. Compare with
`git rev-parse HEAD`; rebuild after code changes with `npm run graph:update`
(`--force` if a refactor deleted code and the rebuild has fewer nodes).
