# Regulated-industry deployment guides

One guide per AMC station. Each maps the station's sector packs to the frameworks they name, the assurance packs linked to the station, the deployment controls and the evidence outputs, for source at commit `8f57ce63`. These guides are not legal advice and do not state what any regulation requires.

## Stations

Stations are the keys of `DOMAIN_REGISTRY` [C1]; packs are grouped by `stationId` [C2].

| Station | Guide | Packs | Questions |
|---|---|---|---|
| `health` | [Health](health.md) | 9 | 151 |
| `education` | [Education](education.md) | 5 | 72 |
| `environment` | [Environment / Critical Infrastructure](environment.md) | 6 | 87 |
| `mobility` | [Mobility](mobility.md) | 6 | 78 |
| `governance` | [Governance / Public Sector](governance.md) | 5 | 71 |
| `technology` | [Technology / General AI Services](technology.md) | 5 | 71 |
| `wealth` | [Wealth](wealth.md) | 5 | 70 |

Total: 41 packs, 600 questions.

## How these guides stay true

- Nothing in the repository regenerates these guides. `tests/industryGuides.test.ts` re-derives every pack, question and scenario count from source and fails on any difference.
- Every source location sits in a guide's verification appendix as `file:line` plus a token. The same test opens the file and fails if that line no longer contains the token, printing where the token is now.
- [The regulatory calendar](../REGULATORY_CALENDAR.md) is generated from `GLOBAL_FRAMEWORKS` [C3] by `node scripts/gen-regulatory-calendar.mjs`; `--check` fails when the page and the register disagree.

## Shared caveats

- Deployment controls and evidence outputs do not vary by station in source; each guide repeats them so it stands alone.
- `amc domain assurance` validates scenarios against a fixed built-in response [C4]; use `amc assurance run --agent <id> --pack <packId>` to grade the agent [C5].

## Verification appendix

- Source commit: `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da`. Measured on Darwin arm64, Node v25.5.0, 2026-10-03.
- Exercised: reading source and running the commands below. Not exercised: no command in this guide was run against an agent, no control was executed, and no regulatory text was consulted.
- `pnpm vitest run tests/industryGuides.test.ts` re-derives every pack, question and scenario count in this guide from source, re-runs the empty-response check, and checks that every row below still points at a line containing its token.
- Pack counts by hand: `node_modules/.bin/tsx -e 'import {listIndustryPacks} from "./src/domains/industryPacks.ts"; const p=listIndustryPacks(); console.log(p.length, p.reduce((n,x)=>n+x.questions.length,0))'`
- Empty-response passes by hand: `node_modules/.bin/tsx -e 'import {getAssurancePack} from "./src/assurance/packs/index.ts"; const c={agentId:"a",agentName:"a",role:"r",domain:"health",primaryTasks:["t"],stakeholders:["s"],riskTier:"high"}; const p=getAssurancePack("hipaaCompliance"); console.log(p.scenarios.filter(s=>s.validate("",s.buildPrompt(c),c).pass).length, p.scenarios.length)'` (substitute the pack id).

| ID | Claim | Source | Token on that line |
|---|---|---|---|
| C1 | Station registry | `src/domains/domainRegistry.ts:26` | `export const DOMAIN_REGISTRY` |
| C2 | Station pack lookup | `src/domains/industryPacks.ts:2403` | `export function getIndustryPacksByStation` |
| C3 | Calendar register | `src/compliance/globalRegulatory.ts:100` | `export const GLOBAL_FRAMEWORKS` |
| C4 | Scenarios are validated against the fixed text | `src/domains/domainCliIntegration.ts:202` | `scenario.validate(SAFE_ASSURANCE_RESPONSE` |
| C5 | Each scenario prompt goes to the responder | `src/assurance/assuranceRunner.ts:438` | `await responder.respond(prompt)` |
