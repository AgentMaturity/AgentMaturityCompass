# Handoff: Wave-2 Tool Intelligence Modules

**From:** Senior Platform Engineer  
**Date:** 2026-02-18  
**Status:** ✅ COMPLETE — 89/89 tests pass

## Delivered

10 new Python modules under `AMC_OS/PLATFORM/amc/product/`, full routing in `amc/api/routers/product.py`, and a comprehensive test suite.

### Modules

| # | File | API Prefix | Tests |
|---|------|-----------|-------|
| 1 | `task_spec.py` | `/task/spec` | 10 |
| 2 | `clarification_optimizer.py` | `/task/clarify` | 10 |
| 3 | `task_splitter.py` | `/task/split` | 8 |
| 4 | `dependency_graph.py` | `/task/deps` | 8 |
| 5 | `param_autofiller.py` | `/tools/autofill` | 8 |
| 6 | `response_validator.py` | `/tools/validate-response` | 11 |
| 7 | `tool_cost_estimator.py` | `/tools/cost` | 8 |
| 8 | `tool_chain_builder.py` | `/tools/chain` | 8 |
| 9 | `tool_fallback.py` | `/tools/fallback` | 10 |
| 10 | `tool_rate_limiter.py` | `/tools/rate-limit` | 10 |

### Test file
`tests/test_wave2_tool_intelligence.py` — **89 tests, 89 passing, 0.31s**

## Architecture Highlights

- **All heuristic/local** — zero LLM dependency, deterministic, fast
- **SQLite-backed persistence** — uses `product_db_path()` convention
- **Singleton factory pattern** — `get_<module>()` per existing AMC convention
- **Pydantic route models** — all request/response types in product router
- **Feature flags** — each router respects `module_product_<name>_enabled` setting

## Key Algorithms

- **Dep graph**: Kahn's topological sort + DFS cycle detection + DP critical path
- **Rate limiter**: Token bucket with configurable burst, refill rate, next-window calc
- **Task splitter**: Regex-based agent-type inference, parallel/sequential detection
- **Clarification optimizer**: Entropy-based scoring, scope-diversity, context coverage
- **Chain builder**: TF-IDF-style coverage scoring, greedy chain synthesis

## Next Actions

1. Wire `get_task_spec_compiler()` into intake pipeline for auto-spec on every request
2. Register real tool cost models via `POST /api/v1/product/tools/cost/models`
3. Register fallback chains for all critical tools
4. Set rate limit policies matching external API quotas
5. Add integration tests against live FastAPI app using `TestClient`
