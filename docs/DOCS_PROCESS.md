# Continuous Documentation Update Process

> Lightweight process for keeping AMC documentation accurate as the project evolves.
> Target: < 5 minutes of doc overhead per PR.

## Documentation Surfaces

| Surface | Location | Owner | Update trigger |
|---------|----------|-------|----------------|
| README.md | repo root | maintainer | New features, CLI changes, install changes |
| CHANGELOG.md | repo root | maintainer | Every release / meaningful PR |
| CLI --help text | `src/cli.ts` + command files | maintainer | Any CLI command change |
| docs/ directory | `docs/` | maintainer | Feature additions, architecture changes |
| npm package listing | `package.json` description + keywords | maintainer | Major releases |
| GitHub repo description | GitHub settings | maintainer | Rebrand or major pivot only |
| Website / docs hub | `website/` | maintainer | Synced with docs/ on release |

## When Documentation Must Update

### Always (every PR)

- **CHANGELOG.md** — add an entry under `[Unreleased]` for any user-visible change
- **CLI --help** — if you added, renamed, or removed a command or flag

### On feature PRs

- **README.md** — update if the feature changes install steps, quickstart, or the feature list
- **Relevant docs/ file** — create or update the doc that covers the affected area
- **API_REFERENCE.md** — if public API surface changed
- **GETTING_STARTED.md** — if onboarding flow changed

### On release

- **CHANGELOG.md** — move `[Unreleased]` entries to a versioned heading
- **package.json** — bump version
- **Website** — regenerate or sync any rendered docs

## Doc Update Checklist (PR Template Ready)

Copy this into your PR template or use as a mental checklist:

```markdown
### Documentation

- [ ] CHANGELOG.md updated (or N/A — no user-visible change)
- [ ] CLI --help text accurate for any changed commands
- [ ] README.md updated if install/quickstart/feature list changed
- [ ] Relevant docs/ file created or updated
- [ ] API_REFERENCE.md updated if public API changed
- [ ] No stale references to removed features
```

## Review Cadence

| Frequency | Action |
|-----------|--------|
| Every PR | Run through the checklist above |
| Weekly | Skim CHANGELOG.md — does it reflect this week's work? |
| Per release | Full read of README.md, GETTING_STARTED.md, QUICKSTART.md |
| Monthly | Spot-check 5 random docs/ files for staleness |

## Staleness Detection

Signs a doc needs attention:

- References a CLI command that no longer exists
- Mentions a version number more than one minor release behind
- Describes a workflow that no longer matches the code
- Has a "TODO" or "TBD" older than 30 days

When you find a stale doc, file an issue (or fix it in the same PR if < 10 lines).

## Conventions

- **Tone**: Direct, practical. Write for a developer who has 5 minutes.
- **Format**: Markdown. Use tables for structured info. Use code blocks for CLI examples.
- **File naming**: `UPPER_SNAKE_CASE.md` for docs/ files (matches existing convention).
- **Heading depth**: Max 3 levels (##, ###, ####). Deeper nesting signals the doc should be split.
- **Links**: Use relative paths (`./OTHER_DOC.md`) within docs/. Never use absolute GitHub URLs that break on forks.
