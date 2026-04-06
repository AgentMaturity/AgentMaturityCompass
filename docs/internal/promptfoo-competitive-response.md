# Promptfoo Competitive Response Plan

## Threat Level: Primary (300K+ devs, 127 F500)

## Key Insight
Promptfoo and AMC are **complementary, not competitive**. Promptfoo evaluates prompt quality. AMC evaluates agent trust. The danger is perception — developers might think "I already have Promptfoo, I don't need AMC."

## Response Strategy: "Better Together"

### 1. Integration as proof of complementarity
- ✅ `amc eval import --format promptfoo` already ships — import Promptfoo results into AMC trust scores
- Publish a tutorial: "How to combine Promptfoo evals with AMC trust scoring"
- Show that Promptfoo results feed into AMC's ATTESTED evidence tier

### 2. Messaging that frames the distinction
- **Never attack Promptfoo** — respect earns more than conflict
- Message: "Promptfoo tells you if your prompts are good. AMC tells you if your agent is safe to ship."
- Message: "Eval frameworks test outputs. AMC scores trust with cryptographic receipts."

### 3. Where AMC must win clearly
| Capability | Promptfoo gap | AMC advantage |
|---|---|---|
| Maturity model | Binary pass/fail | L0-L5 across 5 dimensions |
| Compliance automation | OWASP only | EU AI Act + ISO 42001 + NIST + SOC 2 |
| Evidence integrity | JSON files | Ed25519 + Merkle proofs |
| Multi-agent governance | Single target | Fleet oversight + delegation |
| Industry packs | Limited | 40 packs across 7 verticals |

### 4. When developers compare
- ✅ `website/vs-promptfoo.html` comparison page published
- Include fair comparison in docs and README
- Acknowledge Promptfoo's strengths honestly

### 5. Community positioning
- Participate in Promptfoo discussions as a complementary tool, not competitor
- Offer to write guest posts showing the integration
- If Promptfoo users ask "can this do trust scoring?" — be there with the answer

## What NOT to do
- Don't claim AMC replaces Promptfoo
- Don't disparage their eval quality
- Don't compete on prompt-level testing (we'd lose)
- Don't ignore them (300K devs is a massive audience)

## Success metric
Developers use Promptfoo AND AMC together. The integration path is the competitive moat.
