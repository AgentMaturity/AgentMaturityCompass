# RECIPES.md — Copy-paste quick wins

These are the smallest useful AMC workflows.

## 1. Get a first score
```bash
npx agent-maturity-compass quickscore
```

## 2. Add a CI trust gate
Start from:
- `.github/workflows/amc-score.yml`
- `docs/CI_TEMPLATES.md`

## 3. Use browser try-now
Start from:
- `website/playground.html`
- `docs/BROWSER_SANDBOX.md`

## 4. Wrap an existing CLI agent
```bash
amc wrap <adapter> -- <your command>
```

## 5. Run an assurance pack
Use Shield-oriented workflows and assurance docs to test prompt injection, misuse, or leakage scenarios.

## 6. Create a compliance binder
Use compliance/reporting workflows when you need audit-oriented evidence outputs.

## Next
- `docs/START_HERE.md`
- `docs/AFTER_QUICKSCORE.md`
- `docs/EXAMPLES_INDEX.md`
