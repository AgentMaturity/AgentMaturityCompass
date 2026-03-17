# AMC Compatibility Matrix

A practical compatibility guide for teams deciding whether AMC will work with their stack.

## What this document covers

This matrix focuses on real adoption questions:

- Can AMC wrap my agent without code changes?
- Can AMC capture evidence from my framework?
- Can AMC run scoring, assurance, trace inspection, and reporting?
- What level of support should I expect right now?

---

## Summary

| Category | Status |
|---|---|
| CLI-based agent wrapping | Strong |
| Node/Python framework support | Strong |
| OpenAI-compatible endpoint scoring | Strong |
| Full trust scoring + assurance flows | Strong |
| Non-agent LLM app scoring (`lite-score`) | Strong |
| Browser playground / no-install trial | Available |
| Enterprise deployment options | Available |
| Public hosted sandbox for real agent execution | Not yet first-class |

---

## Framework compatibility

| Framework / Runtime | Built-in Adapter | Zero-Code Wrap | Evidence Capture | Quickscore | Assurance Packs | Trace / Observe | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| LangChain (Python) | `langchain-python` | ✅ | ✅ | ✅ | ✅ | ✅ | Strong default path |
| LangChain (Node) | `langchain-node` | ✅ | ✅ | ✅ | ✅ | ✅ | Strong default path |
| LangGraph | `langgraph-python` | ✅ | ✅ | ✅ | ✅ | ✅ | Good support; deeper graph semantics can improve over time |
| CrewAI | `crewai-cli` | ✅ | ✅ | ✅ | ✅ | ✅ | CLI-first support is solid |
| AutoGen | `autogen-cli` | ✅ | ✅ | ✅ | ✅ | ✅ | Multi-agent semantics can deepen further |
| OpenAI Agents SDK | `openai-agents-sdk` | ✅ | ✅ | ✅ | ✅ | ✅ | Strong path for agent workflows |
| LlamaIndex | `llamaindex-python` | ✅ | ✅ | ✅ | ✅ | ✅ | Good support |
| Semantic Kernel | `semantic-kernel` | ✅ | ✅ | ✅ | ✅ | ✅ | Good support |
| Claude Code | `claude-cli` | ✅ | ✅ | ✅ | ✅ | ✅ | Useful for coding-agent evaluation |
| Gemini CLI | `gemini-cli` | ✅ | ✅ | ✅ | ✅ | ✅ | CLI-based path |
| OpenClaw | `openclaw-cli` | ✅ | ✅ | ✅ | ✅ | ✅ | First-class fit |
| OpenHands | `openhands-cli` | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | Experimental / manual install assumptions |
| Generic CLI agent | `generic-cli` | ✅ | ✅ | ✅ | ✅ | ✅ | Fallback for basically anything shell-runnable |
| Plain chatbot / LLM app | n/a | n/a | n/a | ✅ | Partial | Partial | Use `amc lite-score` + datasets/imported evals |

---

## Provider / model endpoint compatibility

| Provider Type | Status | Notes |
|---|---|---|
| OpenAI-compatible endpoints | ✅ | Strong path for scoring, datasets, and gateway-backed evaluation |
| OpenAI | ✅ | Strong |
| Anthropic | ✅ | Strong |
| Gemini | ✅ | Strong |
| Local / self-hosted OpenAI-compatible endpoints | ✅ | Practical path via gateway and eval workflows |
| Mixed-provider fleets | ✅ | Supported through fleet, trace, and scoring workflows |

---

## Workflow compatibility

| Workflow | Status | Notes |
|---|---|---|
| Quick trust score | ✅ | `amc quickscore` |
| Deep diagnostic | ✅ | Full question bank and scoring modules |
| Active red-teaming | ✅ | Assurance packs |
| Compliance reporting | ✅ | Audit binders, domain packs, framework reports |
| Trace inspection | ✅ | `amc trace ...` |
| Observability / anomaly views | ✅ | `amc observe ...` |
| Correction tracking | ✅ | correction log/report workflows |
| Golden datasets | ✅ | `amc dataset ...` |
| Import external evals | ✅ | Promptfoo / other result ingestion paths |
| Lite scoring for non-agent apps | ✅ | `amc lite-score` |
| Leaderboards | ✅ | Fleet comparison and export |
| AI asset inventory | ✅ | `amc inventory scan` |
| Communications policy checks | ✅ | `amc comms-check` |

---

## Environment compatibility

| Environment | Status | Notes |
|---|---|---|
| macOS | ✅ | Strong |
| Linux | ✅ | Strong |
| Windows | ⚠️ | Usable, but some shell-centric flows may be smoother via WSL/container |
| Docker | ✅ | Supported |
| GitHub Actions | ✅ | Supported |
| Local developer workstation | ✅ | Excellent fit |
| CI/CD pipeline | ✅ | Good fit |
| Air-gapped / offline verification | ✅ | Bundle/cert verification model supports this |

---

## Recommended adoption paths

### If you already run an agent framework
Use:
- `amc wrap <adapter> -- ...`
- `amc quickscore`
- `amc assurance run --all`
- `amc trace inspect`
- `amc observe timeline`

### If you only have a chatbot or LLM app
Use:
- `amc lite-score`
- `amc dataset create`
- `amc dataset run`
- `amc eval import`

### If you are a security/compliance team
Use:
- `amc assurance run`
- `amc compliance report`
- `amc audit binder create`
- `amc business report`

---

## Known friction points

- Some frameworks are better supported through CLI wrapping than native SDK semantics.
- Windows users may prefer Docker or WSL for the smoothest experience.
- OpenHands is not as mature as the mainline adapter set.
- Hosted browser sandbox for real execution is still more roadmap than polished product.

---

## Bottom line

AMC already works best for teams that want to:

- wrap an existing agent without rewriting it,
- score trust maturity from execution evidence,
- run red-team and compliance workflows,
- and build repeatable evaluation loops over time.

If your system can run from a CLI, a Node/Python stack, or an OpenAI-compatible endpoint, AMC is already in very workable territory.
