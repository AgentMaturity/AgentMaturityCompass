# USE_CASES.md — Common ways to use AMC

AMC is easiest to understand when mapped to concrete jobs.

## 1. Get a first trust score for an existing agent
Use this when you want the fastest useful answer.

Typical path:
1. `npx agent-maturity-compass quickscore`
2. read the gaps
3. run `amc fix`
4. review `docs/AFTER_QUICKSCORE.md`

## 2. Add a trust gate to CI
Use this when you want releases to stop regressing silently.

Typical path:
1. add AMC to CI
2. set score thresholds / artifact generation
3. review outputs on pull requests and releases

Start with:
- `docs/CI_TEMPLATES.md`
- `docs/DEPLOYMENT_OPTIONS.md`

## 3. Wrap an agent stack you already use
Use this when you already run LangChain, CrewAI, OpenAI Agents SDK, Claude Code, OpenClaw, or a generic CLI agent.

Typical path:
1. wrap the existing workflow
2. capture evidence
3. score real behavior
4. expand into assurance and monitoring

## 4. Run adversarial assurance
Use this when you need more than a maturity score.

Typical path:
1. baseline score
2. run Shield packs
3. review weak points
4. add Enforce / Watch / Comply layers as needed

## 5. Prepare for governance or compliance work
Use this when buyers, auditors, or internal governance teams need more than “we tested it.”

Typical path:
1. score from evidence
2. capture reports and proof paths
3. map outputs into compliance/governance workflows
4. operationalize support and deployment choices

Start with:
- `docs/SECURITY_PATH.md`
- `docs/PRODUCT_EDITIONS.md`
- `docs/PRICING.md`
- `docs/SERVICES_AND_SUPPORT.md`

## 6. Compare multiple agents or programs
Use this when one-agent-at-a-time evaluation stops scaling.

Typical path:
1. establish baseline scoring
2. compare outputs across teams/agents
3. use Fleet/Watch style workflows for oversight and drift detection

## Read next
- `docs/START_HERE.md`
- `docs/PERSONAS.md`
- `docs/RECIPES.md`
- `docs/COMPARE_AMC.md`
