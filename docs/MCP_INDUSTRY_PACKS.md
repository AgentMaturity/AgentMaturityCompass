# MCP tools for industry packs

`amc mcp serve` registers four read-only tools over the industry packs defined in
`src/domains/industryPacks.ts`. Implementation: `src/mcp/industryPackTools.ts`; registration:
`registerIndustryPackTools(server, { beforeCall: enforceRateLimit })` in `src/mcp/amcMcpServer.ts`.
See [MCP_SERVER.md](MCP_SERVER.md) for client setup.

| Tool | Input | Entitlement needed | Returns |
|---|---|---|---|
| `amc_list_industry_packs` | `{ station? }` | no (catalog view) | packs grouped by station; locked catalog items omit regulatory basis and frameworks |
| `amc_get_industry_pack` | `{ packId }` | yes | the full pack: questions, `regulatoryBasis`, `complianceFrameworks`, `euAIActClassification` |
| `amc_score_industry_pack` | `{ packId, responses }` | yes | `scoreIndustryPack()` result plus `unansweredQuestionIds` |
| `amc_industry_station_summary` | `{ station }` | frameworks only | `getStationSummary()`; `frameworks` omitted while locked |

`station` is one of the ids from `listDomainIds()` in `src/domains/domainRegistry.ts`.
`responses` maps question ids of that pack to integer levels 1-5; unanswered questions
score as L1, the same as the existing scorer.

## Behaviour

- Every tool is annotated `readOnlyHint: true`, `openWorldHint: false`. Nothing is written:
  no ledger event and no file. The existing server tools write no receipts either, so these
  tools do not write any.
- Schemas are strict. An unknown argument, an unknown station, or a level outside 1-5 or
  not an integer is rejected by the SDK as `Input validation error`.
- Refusals are tool results with `isError: true` and a JSON body
  `{ "ok": false, "error": { "code", "message", ... } }`, never a thrown error:
  - `unknown_pack_id`: the id is not an own key of `INDUSTRY_PACKS` (this also refuses
    `__proto__` and `constructor`). The body lists `availablePackIds`.
  - `industry_packs_locked`: no active entitlement. The message comes from
    `formatIndustryPackPaywallMessage()`.
  - `unknown_question_id`: a `responses` key is not a question of the pack.
  - `rate_limited`: the server's shared limit of 60 calls per minute was exceeded.
- The entitlement is resolved by `getIndustryPackEntitlement(process.cwd())`, which reads
  only environment variables and the workspace file. These tools make no network calls.

## Not covered

- `MCP_TOOL_METADATA` and `amc mcp` tool listings do not include these tools. That list is
  pinned at 10 entries by `tests/mcpServer.test.ts`.
- The pack content (questions, regulatory references) is served as stored in
  `src/domains/industryPacks.ts`. These tools do not check that content against
  primary sources.

## Tests

`tests/industryPackMcpTools.test.ts` runs the tools through an in-memory MCP client.
`tests/industryPackMcpToolsWiring.test.ts` starts the real `startMcpServer()` with its stdio
transport replaced by an in-memory pair.
