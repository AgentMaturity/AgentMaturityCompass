# Content Calendar Template

> 4-week rolling calendar for documentation and content aligned with AMC feature releases.
> Duplicate this template for each release cycle.

## How to Use

1. At the start of each release cycle, copy the template below
2. Fill in the dates for the current cycle
3. Check off items as they ship
4. Roll unfinished items into the next cycle

---

## Cycle: [VERSION] — Week of [START DATE]

### Week 1: Feature Docs

| Day | Task | Surface | Status |
|-----|------|---------|--------|
| Mon | Draft docs for new features shipping this cycle | docs/ | [ ] |
| Tue | Update CLI --help for new/changed commands | src/cli.ts | [ ] |
| Wed | Update GETTING_STARTED.md if onboarding changed | docs/ | [ ] |
| Thu | Update API_REFERENCE.md for any new public APIs | docs/ | [ ] |
| Fri | Self-review: read all new docs end-to-end | — | [ ] |

### Week 2: Integration & Examples

| Day | Task | Surface | Status |
|-----|------|---------|--------|
| Mon | Add/update code examples for new features | docs/, README | [ ] |
| Tue | Update COMPATIBILITY_MATRIX.md if integrations changed | docs/ | [ ] |
| Wed | Update STARTER_BLUEPRINTS.md with new patterns | docs/ | [ ] |
| Thu | Write or update a recipe in RECIPES.md | docs/ | [ ] |
| Fri | Spot-check 5 random existing docs for staleness | docs/ | [ ] |

### Week 3: Release Prep

| Day | Task | Surface | Status |
|-----|------|---------|--------|
| Mon | Finalize CHANGELOG.md for this release | root | [ ] |
| Tue | Update README.md feature list and badges | root | [ ] |
| Wed | Update package.json description/keywords if needed | root | [ ] |
| Thu | Sync website docs with latest docs/ content | website/ | [ ] |
| Fri | Final read-through of README + GETTING_STARTED | — | [ ] |

### Week 4: Publish & Maintain

| Day | Task | Surface | Status |
|-----|------|---------|--------|
| Mon | Publish release (npm, GitHub release, tag) | — | [ ] |
| Tue | Post release notes (GitHub Discussions / changelog) | GitHub | [ ] |
| Wed | Review any doc issues filed during the cycle | GitHub issues | [ ] |
| Thu | Archive this calendar, start next cycle template | docs/ | [ ] |
| Fri | Buffer / catch-up day | — | [ ] |

---

## Recurring Items (Every Cycle)

- [ ] CHANGELOG.md reflects all user-visible changes
- [ ] No broken internal links in docs/ (run `grep -r '](./.*\.md)' docs/ | head -20` to spot-check)
- [ ] CLI --help matches actual command behavior
- [ ] README.md install instructions work on a clean machine
- [ ] Any deprecated features marked clearly in docs

## Notes

- This is a solo-dev + AI workflow. Timelines are guidelines, not deadlines.
- If a day's task takes > 30 min, it's too big — split it or file an issue.
- AI agents can draft most doc updates; human review is the bottleneck to protect.
