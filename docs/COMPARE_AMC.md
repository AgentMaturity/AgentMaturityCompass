# COMPARE_AMC.md — How AMC compares to alternatives

AMC is strongest when compared honestly.

## AMC vs self-reported evals

| | Self-reported evals | AMC |
|---|---|---|
| Evidence source | Agent/team claims | Observed execution behavior |
| Trust weighting | None — all evidence equal | Tiered: observed 1.0×, self-reported 0.4× |
| Gaming resistance | Low — easy to inflate | High — adversarial probes + evidence integrity |
| Proof chains | None | Ed25519 signatures + Merkle trees |
| CI integration | Limited | Score gates, artifact generation, regression prevention |

**Bottom line:** Self-reported evals tell you what agents claim. AMC tells you what agents do.

## AMC vs keyword/static scanners

| | Keyword scanners | AMC |
|---|---|---|
| Analysis method | Pattern matching on code/config | Runtime behavior observation + scoring |
| Coverage | Known patterns only | 138 diagnostic questions × 5 dimensions |
| False positives | High | Evidence-weighted — scored by trust tier |
| Adversarial testing | None | 86 assurance packs (injection, exfiltration, adversarial) |
| Compliance mapping | Limited | EU AI Act, ISO 42001, NIST AI RMF, OWASP |

**Bottom line:** Keyword scanners find patterns. AMC finds behavioral gaps.

## AMC vs prompt-security-only tools

| | Prompt security tools | AMC |
|---|---|---|
| Scope | Prompt injection testing | Full trust stack: scoring, assurance, governance, monitoring, compliance |
| Product surface | Single-focus | Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport |
| Evidence model | Pass/fail per test | Weighted evidence with integrity verification |
| Maturity model | None | L0–L5 with clear progression and evidence gates |
| Domain coverage | Generic | 40 industry-specific domain packs (health, wealth, education, mobility, etc.) |

**Bottom line:** Prompt security is one slice. AMC is the full trust stack.

## AMC vs manual audits

| | Manual audits | AMC |
|---|---|---|
| Speed | Weeks to months | Minutes to hours |
| Repeatability | Low — auditor-dependent | High — deterministic scoring engine |
| Cost | $10K–$500K+ per engagement | Free (open source) to enterprise pricing |
| Evidence integrity | PDF reports | Cryptographic proof chains |
| Continuous monitoring | One-time snapshot | Watch + CI gates for ongoing trust |

**Bottom line:** Manual audits are slow, expensive, and non-repeatable. AMC automates the evidence layer.

## The 84-point documentation inflation gap

When scored by keyword matching or self-reported documentation, a test agent scores 100/100.
When AMC evaluates the same agent using execution-verified evidence, the real score is 16/100.

That 84-point gap is documentation inflation.
AMC closes it with observed evidence and cryptographic proof chains.

## Read next
- `docs/WHY_AMC.md`
- `docs/START_HERE.md`
- `docs/PRODUCT_EDITIONS.md`
- `docs/PRICING.md`
