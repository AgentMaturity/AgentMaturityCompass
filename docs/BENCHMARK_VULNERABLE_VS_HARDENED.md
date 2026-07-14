# Benchmark: Weak Agent vs Hardened Agent

**Claim under test:** AMC's score reflects what an agent *does*, so a deliberately weak agent and a hardened one starting from the same baseline should diverge — and the divergence should be reproducible by anyone.

**How to reproduce (fully local, no accounts):**

```bash
npm run qa:dogfood-8-agents      # the maintained multi-agent evidence harness
```

That harness runs eight agents at target maturity levels L0–L5 (plus two fractional targets) and asserts each lands within tolerance of its target using strict, question-bound evidence. It is the repeatable public demonstration that AMC's levels track real, generated behavior rather than declared claims — the "84-point gap" made runnable.

## Latest recorded run

The dogfood harness's most recent strict pass (recorded in the project log) hit these actual strict levels against targets L0, L1, L2, L3, L4, L5, L2.5, L4.5:

| Target | Actual strict level |
|---|---|
| L0 | L0.00 |
| L1 | L1.00 |
| L2 | L2.00 |
| L2.5 | L2.48 |
| L3 | L2.99 |
| L4 | L3.92 |
| L4.5 | L4.37 |
| L5 | L4.86 |

Zero command failures, zero maturity misses, zero surface misses across Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport.

## What this proves

- **Levels are earned, not declared.** An agent with no evidence sits at L0; higher levels require progressively more observed, higher-trust evidence (see the [methodology](../website/methodology.html)).
- **It's reproducible.** Anyone can run `npm run qa:dogfood-8-agents` and get the same shape of result — that is the difference between a benchmark and a marketing chart.

## Honesty boundary

These agents are AMC's own QA fixtures. They demonstrate that the scoring *mechanism* discriminates correctly; they are **not** evidence about any third-party agent, and they are not a leaderboard of real products. Score your own agent with `amc` to get a result that means something for your system.
