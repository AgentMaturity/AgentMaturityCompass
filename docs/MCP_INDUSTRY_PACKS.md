# MCP tools for industry packs

`amc mcp serve` registers four read-only tools over the industry packs defined in
`src/domains/industryPacks.ts`. Implementation: `src/mcp/industryPackTools.ts`; registration and
the `amc mcp list-tools` entries: `src/mcp/amcMcpServer.ts`. See [MCP_SERVER.md](MCP_SERVER.md) for
client setup.

## Access

Industry Packs are free (ADR 019, `docs/adr/019-industry-packs-free.md`; see [PRICING.md](PRICING.md)).
Every tool, pack questions and scoring included, works with no licence, account or payment, and no
tool refuses for lack of a licence. Each catalog item keeps its `locked` field for API compatibility;
it is always `false`. Access never changes a listing, a summary, a score or any other result.

| Tool | Input | Returns |
|---|---|---|
| `amc_list_industry_packs` | `{ station? }` | packs grouped by station: name, description, regulatory basis, frameworks, question count and `locked` (always `false`) |
| `amc_get_industry_pack` | `{ packId }` | the pack as stored: questions, `regulatoryBasis`, `complianceFrameworks`, `euAIActClassification` |
| `amc_score_industry_pack` | `{ packId, responses }` | `result`: the `scoreIndustryPack()` result |
| `amc_industry_station_summary` | `{ station }` | `getStationSummary()`: pack count, question count and frameworks |

`station` is one of the ids from `listDomainIds()` in `src/domains/domainRegistry.ts`.

## Claims

Every successful result carries a claim label from the shared service (`withClaim` in
`src/mcp/mcpClaimOutput.ts`; see [CLAIM_KINDS.md](CLAIM_KINDS.md)): a second text block with the claim
line, and `claimKind`, `statusDimensions` and `claimLabel` in `structuredContent` beside the result.

- `amc_score_industry_pack` uses the regulated self-assessment envelope (`packSelfAssessmentEnvelope`),
  the same one `amc_score_sector_pack` uses: claim kind `self_reported`, result not evaluated, eligible
  level 1 at most. Its answers are self-declared levels 1-5. No result has a `certified` field; a
  complete self-assessment is not a certification.
- The listing, the pack and the station summary are catalog data, not results about an agent; they are
  labelled not evaluated, as Studio labels its industry pack routes.

## Unanswered questions are not evaluated

`responses` maps question ids of the pack to integer levels 1-5. The tool returns the shared
`scoreIndustryPack()` result, the same one `amc_score_sector_pack` and `amc domain pack run` report. A
question without an answer is not evaluated and is never given a default level:

- When every question is answered, `result` carries the self-reported `percentage`, `level` and gaps,
  and `result.notEvaluatedQuestionIds` is empty.
- When any question is unanswered, `result.notEvaluatedQuestionIds` lists it, it has no question
  result and no gap, and `result.percentage`, `result.level` and `result.eligibleLevel` are `null`.
  `result.selfAssessment` still reports `answered` and `total`.

## Behaviour

- Every tool is annotated `readOnlyHint: true`, `openWorldHint: false`. Nothing is written: no ledger
  event and no file.
- Schemas are strict. An unknown argument, an unknown station, or a level outside 1-5 or not an
  integer is rejected by the SDK as `Input validation error`.
- Refusals are tool results with `isError: true` and a JSON body
  `{ "ok": false, "error": { "code", "message", ... } }`, never a thrown error. Refusals carry no claim.
  - `unknown_pack_id`: the id is not an own key of `INDUSTRY_PACKS` (`getPackById`, which also refuses
    `__proto__`, `constructor` and `toString`). The body lists `availablePackIds`.
  - `unknown_question_id`: a `responses` key is not a question of the pack.
  - `rate_limited`: the server's shared limit of 60 calls per minute was exceeded.
- These tools make no network calls.

## Not covered

- The pack content (questions, regulatory references) is served as stored in
  `src/domains/industryPacks.ts`. These tools do not check that content against primary sources.

## Tests

`tests/industryPackNotEvaluated.test.ts` pins the not-evaluated rule in the shared scorer, the CLI, both MCP scoring
tools and the pack audit. `tests/industryPackMcpTools.test.ts` and `tests/industryPackMcpClaims.test.ts` run the tools through an
in-memory MCP client.
`tests/industryPackMcpToolsWiring.test.ts` starts the real `startMcpServer()` with its stdio transport
replaced by an in-memory pair. `tests/mcpServer.test.ts` pins the `amc mcp list-tools` entries: 15
tools, or 20 with `AMC_A4_PREVIEW=1`.
