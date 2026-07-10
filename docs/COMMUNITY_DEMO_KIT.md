# AMC Community Demo Kit

This is the repo-owned demo kit for DevRel, meetups, launch posts, and maintainer replies. It is designed for a five-minute walkthrough without requiring an account, hosted AMC service, or the eight dogfood test agents.

## Shareable Asset

- Terminal proof image: `website/assets/amc-five-minute-terminal.svg`
- Why-AMC one-pager: `docs/WHY_AMC_ONE_PAGER.md`
- GitHub attachment reference checked on 2026-06-16: `https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files`

GitHub Docs attaching-files guidance lists SVG, GIF, PNG, and video formats as supported media in issue and pull request conversations. The shipped SVG stays small, text-readable, and version-controlled; hosted video or GIF production remains separate launch work.

## Five-Minute Terminal Demo

Use this script when a developer asks what AMC does and why it is different from an eval harness.

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
amc quickscore --rapid
amc quickscore --answers answers.json --json
amc quickstart --startup-plan --role cto --answers-out amc-startup-answers.json
amc business risk --maturity 3 --baseline-frequency 4 --incident-cost 50000 --risk-appetite 75000 --json
amc business heatmap --portfolio risk-portfolio.json --out risk-heatmap.md
amc business grc-export --portfolio risk-portfolio.json --out grc-treatment-plan.csv
amc compare <run-a> <run-b> --output compare.json --badge
```

## Talk Track

1. AMC starts with a fast score, but warns when non-interactive output is only a placeholder.
2. Real maturity comes from evidence-backed answers, observed traces, and generated artifacts.
3. The same trust stack supports Score, Shield, Enforce, Vault, Watch, Comply, Fleet, and Passport.
4. Business users can move from maturity to expected annual loss, heatmaps, board briefs, and GRC treatment-plan exports.
5. The output is intentionally local-first and self-hosted; hosted leaderboard/SaaS proof is separate future work.

## Copy Blocks

Short post:

> AMC scores AI agents from execution evidence, not brochure claims. One CLI path gives a quick score, evidence-backed next steps, adversarial checks, compliance artifacts, business risk exports, and command inventory you can verify locally.

Maintainer reply:

> Install the verified GitHub release, then try `amc quickscore --rapid` for a pulse check and use `amc quickstart --startup-plan --role cto` to create a measured path. If you need risk evidence, `amc business grc-export` turns a portfolio JSON into a treatment-plan register.

## Caveats

- The SVG is a shareable terminal proof asset, not a recorded video.
- Hosted video/GIF screencasts and third-party verified benchmark recordings still need separate production and review.
- Do not use the eight dogfood test agents as marketing proof; they were created for internal surface testing only.
