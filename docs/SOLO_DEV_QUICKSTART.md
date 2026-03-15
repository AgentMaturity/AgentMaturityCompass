# Solo Developer Quickstart

If you are one person trying to evaluate or harden an agent quickly, start here.

## Goal

Get from zero to first score with the least possible ceremony.

## Fast path

```bash
npx agent-maturity-compass quickscore
```

Or install AMC globally:

```bash
npm i -g agent-maturity-compass
amc init
amc doctor
amc quickscore
```

## Best next docs

1. `docs/QUICKSTART.md`
2. `docs/COMPATIBILITY_MATRIX.md`
3. `docs/STARTER_BLUEPRINTS.md`
4. `docs/TROUBLESHOOTING.md`

## Best next commands

```bash
amc fix
amc observe timeline
amc trace list
amc assurance run --all
```

## When to stop overthinking it

If you just want to know whether your agent is reckless, run quickscore, then inspect the caps and fixes. You do not need to ingest the whole governance universe on day one.
