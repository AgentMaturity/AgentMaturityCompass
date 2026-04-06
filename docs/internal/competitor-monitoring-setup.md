# Competitor Monitoring Setup (AMC-75)

## Tools & Cadence

### Weekly Automated Checks
- **GitHub**: Star count + release notes for Promptfoo, DeepEval, Giskard
  - `gh api repos/promptfoo/promptfoo --jq '.stargazers_count'`
  - `gh api repos/confident-ai/deepeval --jq '.stargazers_count'`
  - Monitor release tags for feature additions
- **npm**: Download trends
  - `npm-stat.com` for promptfoo, deepeval weekly downloads

### Monthly Manual Review
- Check Promptfoo changelog for maturity/governance features
- Review Credo AI blog for pricing/feature changes
- Scan HN/Reddit for new entrants in "AI agent trust" space
- Review EU AI Act enforcement timeline updates

### Trigger-based Alerts
- Google Alert: "AI agent evaluation framework"
- Google Alert: "AI agent trust scoring"
- Google Alert: "promptfoo maturity" OR "promptfoo compliance"
- GitHub: Watch promptfoo repo for issues mentioning "maturity" or "compliance"

## Competitor Snapshot — March 2026

| Competitor | GH Stars | npm Downloads/week | Last Release | Threat Level |
|---|---|---|---|---|
| Promptfoo | ~15K | ~50K | Active | Primary |
| DeepEval | ~10K | ~20K | Active | Secondary |
| Giskard | ~5K | ~2K | Active | Low |
| Skales | N/A | N/A | Active | Low |
| Zeroboot | <1K | <500 | Sporadic | Minimal |

## Response Playbook
- If competitor adds maturity model → publish comparison showing AMC's depth advantage
- If competitor adds compliance → highlight AMC's crypto evidence chain
- If competitor goes viral → engage respectfully, offer integration
- If regulatory body endorses a competitor → map AMC to same regulatory requirements
