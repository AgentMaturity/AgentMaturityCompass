# BENCHMARK_GALLERY.md — Real AMC proof artifacts

No invented benchmarks. No synthetic customer theater. Every artifact here exists in the repo.

---

## Score Badge

Add a trust badge to your README after running AMC:

```markdown
[![AMC Score](https://img.shields.io/badge/AMC-L3_(72.5)-green)](https://github.com/AgentMaturity/AgentMaturityCompass)
```

Result: ![AMC Score](https://img.shields.io/badge/AMC-L3_(72.5)-green)

See: `README.md` badge block

---

## The 84-Point Gap

| Scoring method | Score |
|---|---|
| Keyword matching / self-reported | 100/100 |
| AMC execution-verified evidence | 16/100 |
| **Gap** | **84 points** |

This is not a synthetic benchmark. It is what happens when you score the same agent with claims vs observed behavior.

See: `docs/SECURITY_ARCHITECTURE_OVERVIEW.md`, homepage trust-gap section

---

## CI Trust Gate

Real workflow already in the repo:

```yaml
# .github/workflows/amc-score.yml
- uses: AgentMaturity/AgentMaturityCompass/amc-action@main
  with:
    target-level: 3
    fail-on-drop: true
    comment: true
```

See: `.github/workflows/amc-score.yml`

---

## Test Suite

| Metric | Value |
|---|---|
| Test files | 234 |
| Tests passing | 3,311 |
| Diagnostic questions | 138 |
| Assurance packs | 86 |
| Domain packs | 40 |
| Framework adapters | 14 |
| Scoring modules | 74+ |
| CLI commands | 481 |

These numbers come from the actual repo, not marketing material.

---

## Example Stacks

Real working examples for every supported adapter:

| Framework | Example path |
|---|---|
| LangChain (Python) | `examples/langchain-python/` |
| LangChain (Node) | `examples/langchain-node/` |
| LangGraph | `examples/langgraph-python/` |
| CrewAI | `examples/crewai/` |
| CrewAI + GitHub Actions | `examples/crewai-amc-github-actions/` |
| OpenAI Agents SDK | `examples/openai-agents-sdk/` |
| OpenAI-compatible lite | `examples/openai-compatible-lite-score/` |
| Claude Code | `examples/claude-code/` |
| Gemini | `examples/gemini/` |
| Generic CLI | `examples/generic-cli/` |
| Semantic Kernel | `examples/semantic-kernel/` |
| OpenClaw | `examples/openclaw/` |
| OpenClaw baseline | `examples/openclaw-amc-baseline/` |
| Python SDK | `examples/python-amc-sdk/` |

---

## Release Engineering

AMC includes real release engineering, not just "we tagged a version":

| Artifact | What it proves |
|---|---|
| `.github/workflows/release.yml` | Signed release workflow |
| `.github/workflows/nightly-compatibility-matrix.yml` | Nightly adapter compatibility |
| `tests/releaseEngineeringPack.test.ts` | Release pack + verify tests |
| `scripts/security-scan-lite.mjs` | Secret scan on packaged artifacts |
| `scripts/prepack-release-check.mjs` | Pre-publish validation |

---

## Evidence Trust Tiers

| Tier | Weight | How |
|---|---|---|
| `OBSERVED_HARDENED` | 1.1× | AMC-controlled adversarial scenarios |
| `OBSERVED` | 1.0× | Captured via gateway proxy |
| `ATTESTED` | 0.8× | Cryptographic attestation |
| `SELF_REPORTED` | 0.4× | Agent's own claims (capped) |

---

## Sample CLI Outputs

```bash
# Quick score
$ amc quickscore
  Maturity Level: L2 (Developing)
  Overall Score: 42.3/100
  Gaps Found: 7 critical, 12 high

# Fix suggestions
$ amc fix
  Generated 19 guardrails
  Applied to 4 config targets

# Adversarial assurance
$ amc assurance run --pack prompt-injection
  Ran 12 attack scenarios
  Passed: 8 | Failed: 4
  Report: .amc/reports/latest.md
```

---

## What Is Not Here Yet

Being honest about what's missing:
- Public screenshot gallery of dashboard/console UIs
- Published sample full reports in a safe examples directory
- Before/after hardening case studies
- Third-party benchmark reproductions

These will be added as real artifacts are generated, not as marketing fiction.

---

## Read next
- `docs/COMPARE_AMC.md`
- `docs/COMMUNITY_SHOWCASE.md`
- `docs/RELEASE_HIGHLIGHTS.md`
- `docs/START_HERE.md`
