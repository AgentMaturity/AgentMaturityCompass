# AMC Web Playground

The [AMC Web Playground](https://agentmaturity.co/playground.html) is the no-install way to explore AMC's scoring language, adversarial scenarios, and assurance-pack catalog.

## What You Can Do

- answer a guided maturity assessment and inspect the resulting level and dimension breakdown
- test a response against illustrative adversarial scenarios
- browse a curated preview of AMC assurance packs by risk or regulation
- export the browser assessment as JSON
- switch between the terminal and clean themes without creating an account

The playground runs locally in the browser. It is useful for learning and early exploration, but its results are illustrative and are not observed runtime evidence.

## When To Use The CLI

Use the full AMC workflow when you need evidence-backed scoring, signed receipts, runtime traffic capture, complete assurance packs, compliance artifacts, CI gates, or portable proof:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
cd your-agent-project
amc
```

A signed artifact can still report `INSUFFICIENT_EVIDENCE`. Signing proves integrity; evidence readiness determines whether an external claim is eligible.

## Next Steps

- [Getting Started](GETTING_STARTED.md)
- [Evidence Trust](EVIDENCE_TRUST.md)
- [Assurance Lab](ASSURANCE_LAB.md)
- [After the First Score](AFTER_FIRST_SCORE.md)
