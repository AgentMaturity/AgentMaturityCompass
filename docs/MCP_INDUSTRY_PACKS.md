# MCP tools for industry packs

`amc mcp serve` registers four read-only tools over the industry packs defined in
`src/domains/industryPacks.ts`. Implementation: `src/mcp/industryPackTools.ts`; registration and
the `amc mcp list-tools` entries: `src/mcp/amcMcpServer.ts`. See [MCP_SERVER.md](MCP_SERVER.md) for
client setup.

## Industry Packs licence

The Industry Packs licence gate stays (ADR-005, decision D-06 = B). Pack questions and scoring need an
Industry Packs licence that verifies against a licence key pinned in this machine's AMC trust list
(see [PRICING.md](PRICING.md)); nothing the MCP client sends can unlock them. Without one,
`amc_get_industry_pack` and `amc_score_industry_pack` refuse with `industry_packs_locked` and the same
text every locked surface prints: what is locked, the price, and either a working checkout or
"Checkout is not available in this deployment; contact sales for access."

A licence unlocks access only. It never changes a listing, a summary, a score or any other result:
the listing and the station summary return the same data with and without a licence (each catalog
item's `locked` flag says whether its questions are locked), and a licensed score is the same score.

| Tool | Input | Licence needed | Returns |
|---|---|---|---|
| `amc_list_industry_packs` | `{ station? }` | no | packs grouped by station: name, description, regulatory basis, frameworks, question count and `locked` |
| `amc_get_industry_pack` | `{ packId }` | yes | the pack as stored: questions, `regulatoryBasis`, `complianceFrameworks`, `euAIActClassification` |
| `amc_score_industry_pack` | `{ packId, responses }` | yes | `selfAssessment`, `notEvaluatedQuestionIds` and `result` (the `scoreIndustryPack()` result, or `null`) |
| `amc_industry_station_summary` | `{ station }` | no | `getStationSummary()`: pack count, question count and frameworks |

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

`responses` maps question ids of the pack to integer levels 1-5. A question without an answer is not
evaluated and is never given a default level:

- When every question is answered, `result` is the `scoreIndustryPack()` result (self-reported score,
  level and gaps) and `notEvaluatedQuestionIds` is empty.
- When any question is unanswered, `result` is `null`, `notEvaluatedQuestionIds` lists the unanswered
  question ids, and no score, level or percentage is computed. `selfAssessment` still reports
  `answered` and `total`.

## Behaviour

- Every tool is annotated `readOnlyHint: true`, `openWorldHint: false`. Nothing is written: no ledger
  event and no file.
- Schemas are strict. An unknown argument, an unknown station, or a level outside 1-5 or not an
  integer is rejected by the SDK as `Input validation error`.
- Refusals are tool results with `isError: true` and a JSON body
  `{ "ok": false, "error": { "code", "message", ... } }`, never a thrown error. Refusals carry no claim.
  - `unknown_pack_id`: the id is not an own key of `INDUSTRY_PACKS` (`getPackById`, which also refuses
    `__proto__`, `constructor` and `toString`). The body lists `availablePackIds`.
  - `industry_packs_locked`: no licence verifies against a pinned licence key. The message is the
    entitlement's own text (`getIndustryPackEntitlement`), which starts with the paywall message.
  - `unknown_question_id`: a `responses` key is not a question of the pack.
  - `rate_limited`: the server's shared limit of 60 calls per minute was exceeded.
- The server resolves the licence with `getIndustryPackEntitlement(<server workspace>)`, which reads the
  licence from the environment or the workspace's access file and verifies it against the operator's
  trust list. These tools make no network calls.

## Not covered

- The pack content (questions, regulatory references) is served as stored in
  `src/domains/industryPacks.ts`. These tools do not check that content against primary sources.
- `amc_score_sector_pack` and `amc domain pack run` still count an unanswered question as level 1
  (`scoreIndustryPack`, owned by P0-21). Only these tools withhold the score until every question is
  answered.

## Tests

`tests/industryPackMcpTools.test.ts` and `tests/industryPackMcpClaims.test.ts` run the tools through an
in-memory MCP client with licences signed by a key pinned in a temporary trust list.
`tests/industryPackMcpToolsWiring.test.ts` starts the real `startMcpServer()` with its stdio transport
replaced by an in-memory pair. `tests/mcpServer.test.ts` pins the `amc mcp list-tools` entries: 15
tools, or 20 with `AMC_A4_PREVIEW=1`.
