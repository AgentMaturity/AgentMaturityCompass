# PERSONAS.md — Start from your role, not from AMC's entire surface area

AMC is broad. That does **not** mean every user should start broad.

Use the path that matches your job.

## Solo builder / OSS maintainer
You want:
- a first score fast
- practical gaps
- minimal setup
- a path to harden without building a governance department

Start here:
- `docs/START_HERE.md`
- `docs/SOLO_DEV_PATH.md`
- `docs/AFTER_QUICKSCORE.md`
- `docs/RECIPES.md`

## Platform engineer / engineering lead
You want:
- repeatable trust workflows
- CI gates
- standardization across teams
- monitoring and operational clarity

Start here:
- `docs/PLATFORM_PATH.md`
- `docs/CI_TEMPLATES.md`
- `docs/DEPLOYMENT_OPTIONS.md`
- `docs/PRODUCT_EDITIONS.md`

## Security / compliance / governance lead
You want:
- evidence that survives audit questions
- assurance workflows
- compliance mapping
- policy and control surfaces

Start here:
- `docs/SECURITY_PATH.md`
- `docs/COMPARE_AMC.md`
- `docs/PRODUCT_EDITIONS.md`
- `docs/PRICING.md`
- `docs/SERVICES_AND_SUPPORT.md`

## AI product team
You want:
- a clear first score
- a way to catch risky regressions
- faster iteration without safety theater
- a path from demo confidence to production confidence

Start here:
- `docs/START_HERE.md`
- `docs/AFTER_QUICKSCORE.md`
- `docs/COMPARE_AMC.md`
- `docs/COMMUNITY_SHOWCASE.md`

## Evaluator / researcher
You want:
- structured comparisons
- documented dimensions
- reproducible score logic
- benchmark and assurance surfaces

Start here:
- `docs/COMPARE_AMC.md`
- `docs/BENCHMARK_GALLERY.md`
- `docs/RELEASE_HIGHLIGHTS.md`
- `docs/INDEX.md`

## Supply chain / logistics operator
You want:
- a reliable score for an agent that touches supplier risk, procurement, transport, carrier management, warehouse operations, or delivery exceptions
- a clear mapping from operations language to AMC's domain stations
- domain modules and gaps without reading the whole product manual

Start here:
- `docs/DOMAIN_PACKS.md`
- `docs/SECTOR_PACKS.md`
- `docs/SUPPLY_CHAIN.md`
- `docs/AFTER_QUICKSCORE.md`

First commands:

```bash
amc domain list
amc domain assess --agent <agent-id> --domain supply-chain
amc domain assess --agent <agent-id> --domain logistics
amc domain modules --domain logistics
amc domain pack describe --pack freight-3pl-warehouse
amc score operational-independence <agent-id> --domain logistics --json
```

Use `--domain supply-chain` for supplier risk, procurement, traceability, materials, food systems, and critical-infrastructure workflows. Use `--domain logistics` for freight, 3PL, warehouse, carrier, transport, and port-logistics workflows. Use `freight-3pl-warehouse` when you need carrier reliability, WMS integrity, exception management, traceability, SLA, EDI/API resilience, and cold-chain controls.

## One-line routing rule
- New? start with `START_HERE`
- Already scored? go to `AFTER_QUICKSCORE`
- Buying/packaging? go to `PRODUCT_EDITIONS` + `PRICING`
- Need deployment clarity? go to `DEPLOYMENT_OPTIONS`
