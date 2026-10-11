---
"agent-maturity-compass": patch
---

Contributor tooling only, no runtime change: `npm run check:duplicates` and `npm run check:dead-code` now compare jscpd and Knip findings with the committed baseline `scripts/quality/source-quality-baseline.json` (decision D-11, option A). They fail on a finding missing from the baseline, on a baseline entry whose finding is gone (`npm run quality:baseline -- <scan> --shrink` removes it and never adds one), and when `.jscpd.json`, `knip.json` or the jscpd or Knip version differs from the baseline (`--rebaseline --reason`). A new finding stays only through `--accept <id> --reason "<at least 20 characters>"`, which records the reason, `git config user.name` and the date. Each run writes its counts to `tmp/source-quality/<scan>.json`, which CI uploads as the `source-quality-summary` artifact, and `node scripts/source-quality.mjs trend` prints a weekly trend row. Existing duplicates and dead code are recorded, not removed. See CONTRIBUTING.md.
