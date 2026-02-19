# HOW TO IMPROVE YOUR AMC SCORES

> Per-dimension guide with concrete steps for each maturity transition.

---

## Understanding the Scoring System

### Maturity Levels

| Level | Name | Score Range |
|-------|------|-------------|
| L1 | Ad-hoc | 0–29 |
| L2 | Defined | 30–54 |
| L3 | Managed | 55–79 |
| L4 | Optimized | 80–94 |
| L5 | Autonomous | 95–100 |

### Evidence Trust Multipliers

Your raw score is scaled by *how* you prove compliance. Higher-trust evidence = higher effective score.

| Evidence Type | Multiplier | What It Means |
|---|---|---|
| `KEYWORD_CLAIM` | 40% | Docs mention the practice (e.g. "we do code review") |
| `CODE_PRESENT` | 55% | Config/code exists in repo but isn't proven to run |
| `IMPORT_VERIFIED` | 70% | Module is imported/installed and wired up |
| `EXECUTION_VERIFIED` | 100% | Proof the control actually executed (logs, receipts) |
| `CONTINUOUS_VERIFIED` | 110% | Ongoing automated proof with no gaps (bonus) |

**Key insight:** A perfect checklist with only keyword claims scores at most 40% of maximum. To reach L4+, you need execution-verified or continuous-verified evidence.

---

## 1. Governance (gov_1 – gov_7)

**Controls:** Policy existence, approval workflows, audit trails, role separation, change management, compliance mapping, exception handling.

**AMC Modules:** `amc.enforce.e1_policy`, `amc.watch.w1_receipts`

### L1 → L2 (Ad-hoc → Defined) · ~1–2 weeks

1. **Write an AI usage policy** — create `AMC_OS/POLICIES/AI_USAGE_POLICY.md` covering permitted models, data handling, and approval requirements.
2. **Define roles** — document who can deploy, approve, and audit AI systems. Put it in `AMC_OS/POLICIES/ROLES.md`.
3. **Create a change log** — start a simple `CHANGELOG.md` tracking policy updates with dates.
4. **Evidence tip:** Having these files gets you `CODE_PRESENT` (55%). Add a CI check that validates policy files exist to reach `IMPORT_VERIFIED` (70%).

### L2 → L3 (Defined → Managed) · ~2–4 weeks

1. **Enable `amc.enforce.e1_policy`** — configure policy enforcement so requests are checked against your rules at runtime.
2. **Enable `amc.watch.w1_receipts`** — capture audit receipts for every policy decision (approve/deny/exception).
3. **Implement approval workflows** — require sign-off for new model deployments or prompt template changes.
4. **Map compliance requirements** — document which regulations (SOC2, GDPR, ISO 42001) apply and link controls to policy sections.
5. **Evidence tip:** With e1_policy running and w1_receipts logging, you have `EXECUTION_VERIFIED` evidence for multiple controls.

### L3 → L4 (Managed → Optimized) · ~4–8 weeks

1. **Automate policy-as-code** — express all governance rules as machine-readable configs consumed by e1_policy (no manual interpretation).
2. **Continuous receipt verification** — set up monitoring that alerts if w1_receipts stops producing audit logs.
3. **Exception tracking** — log, review, and time-bound all policy exceptions. Auto-expire stale exceptions.
4. **Periodic access reviews** — schedule quarterly role/permission audits with automated reminders.
5. **Evidence tip:** Continuous monitoring of policy enforcement yields `CONTINUOUS_VERIFIED` (110%).

### L4 → L5 (Optimized → Autonomous) · ~8–12 weeks

1. **Self-healing policy enforcement** — if a policy violation is detected, auto-remediate (block, rollback, or quarantine).
2. **Drift detection** — automatically detect when actual behavior diverges from declared policy.
3. **Full audit chain** — every governance action from proposal to approval to execution has an unbroken, cryptographically verifiable receipt trail.
4. **Automated compliance reporting** — generate compliance reports on-demand from live receipt data.

---

## 2. Security (sec_1 – sec_6)

**Controls:** Input validation, prompt injection defense, output filtering, secret management, data loss prevention, threat detection.

**AMC Modules:** `amc.shield.s1_analyzer`, `amc.shield.s10_detector`, `amc.vault.v2_dlp`, `amc.watch.w2_assurance`

### L1 → L2 · ~1–2 weeks

1. **Document a threat model** — list top risks (prompt injection, data leakage, model abuse) in `AMC_OS/SECURITY/THREAT_MODEL.md`.
2. **Add basic input validation** — reject obviously malicious inputs (length limits, encoding checks).
3. **Inventory secrets** — ensure no API keys are hardcoded; use environment variables or a vault.
4. **Evidence tip:** Threat model doc = `CODE_PRESENT`. Add a pre-commit hook scanning for secrets to reach `IMPORT_VERIFIED`.

### L2 → L3 · ~2–4 weeks

1. **Deploy `amc.shield.s1_analyzer`** — analyze all LLM inputs for prompt injection, jailbreak attempts, and policy violations.
2. **Deploy `amc.shield.s10_detector`** — detect anomalous patterns across requests (unusual volume, topic drift, probing behavior).
3. **Enable `amc.vault.v2_dlp`** — scan outputs for PII, secrets, and sensitive data before they reach the user.
4. **Enable `amc.watch.w2_assurance`** — continuously verify that security controls are active and functioning.
5. **Evidence tip:** All four modules running with logs = `EXECUTION_VERIFIED` across sec_1 through sec_6.

### L3 → L4 · ~4–8 weeks

1. **Tune detection thresholds** — reduce false positives in s1_analyzer and s10_detector using production data.
2. **Red-team regularly** — run adversarial testing monthly; log results and track remediation.
3. **Layered defense** — ensure input filtering, output filtering, and DLP all operate independently (defense in depth).
4. **Incident response automation** — auto-block IPs or sessions when s10_detector flags active attacks.
5. **Evidence tip:** Red-team reports + automated response logs = strong `EXECUTION_VERIFIED` evidence.

### L4 → L5 · ~8–12 weeks

1. **Adaptive threat models** — s10_detector auto-updates detection rules based on observed attack patterns.
2. **Zero-trust architecture** — every component authenticates; no implicit trust between services.
3. **Continuous penetration testing** — automated security scanning runs on every deployment.
4. **Full kill chain coverage** — every stage from input to output to storage has verified, monitored controls.

---

## 3. Reliability (rel_1 – rel_6)

**Controls:** Error handling, fallback strategies, retry logic, graceful degradation, SLA compliance, chaos/resilience testing.

**AMC Module:** `amc.enforce.e1_policy`

### L1 → L2 · ~1–2 weeks

1. **Add basic error handling** — catch LLM API errors and return user-friendly messages instead of stack traces.
2. **Define SLOs** — document target uptime, latency, and error rates in `AMC_OS/RELIABILITY/SLOS.md`.
3. **Implement retries** — add exponential backoff for transient API failures.
4. **Evidence tip:** Error handling code in repo = `CODE_PRESENT`. Logs showing retries succeeding = `EXECUTION_VERIFIED`.

### L2 → L3 · ~2–4 weeks

1. **Configure fallback models** — use e1_policy to define fallback behavior (e.g., switch to a secondary model if primary is down).
2. **Add circuit breakers** — stop calling a failing service after N consecutive errors; recover automatically.
3. **Graceful degradation** — serve cached/simplified responses when the AI layer is unavailable.
4. **Track SLO compliance** — measure and report actual vs. target reliability weekly.

### L3 → L4 · ~4–8 weeks

1. **Chaos testing** — periodically inject failures (model timeout, rate limit, bad response) and verify graceful handling.
2. **Multi-region or multi-provider** — eliminate single points of failure in your LLM infrastructure.
3. **Automated rollback** — if a new deployment degrades reliability metrics, auto-revert.
4. **SLA dashboards** — real-time visibility into reliability metrics with automated alerting.

### L4 → L5 · ~8–12 weeks

1. **Self-healing systems** — auto-detect degraded components and reroute/restart without human intervention.
2. **Predictive scaling** — anticipate load spikes and pre-scale before they impact reliability.
3. **Continuous resilience verification** — automated chaos experiments run on a schedule with pass/fail tracking.
4. **Zero-downtime deployments** — blue-green or canary deployments with automatic health checks.

---

## 4. Evaluation (eval_1 – eval_6)

**Controls:** Output quality measurement, regression testing, human feedback loops, benchmark tracking, A/B testing, bias/fairness evaluation.

**AMC Module:** `amc.watch.w2_assurance`

### L1 → L2 · ~1–2 weeks

1. **Create a test suite** — write at least 20 input/expected-output pairs in `AMC_OS/EVALS/test_cases.jsonl`.
2. **Define quality metrics** — document what "good output" means (accuracy, relevance, safety) in `AMC_OS/EVALS/METRICS.md`.
3. **Run evals manually** — execute test suite against your system and record results.
4. **Evidence tip:** Test cases in repo = `CODE_PRESENT`. Results log = `EXECUTION_VERIFIED`.

### L2 → L3 · ~2–4 weeks

1. **Enable `amc.watch.w2_assurance`** — continuously evaluate output quality against your defined metrics.
2. **Automate eval runs** — run test suite on every deployment or prompt change (CI integration).
3. **Human feedback pipeline** — collect thumbs-up/down from users; store and analyze weekly.
4. **Regression detection** — alert when eval scores drop below baseline after a change.

### L3 → L4 · ~4–8 weeks

1. **Expand eval coverage** — 100+ test cases covering edge cases, adversarial inputs, and domain-specific scenarios.
2. **A/B testing framework** — compare model versions or prompt variants with statistical rigor.
3. **Bias and fairness evaluation** — test for disparate outcomes across demographic groups.
4. **Benchmark tracking** — maintain a historical record of eval scores; visualize trends.
5. **Evidence tip:** Continuous w2_assurance runs with historical data = `CONTINUOUS_VERIFIED`.

### L4 → L5 · ~8–12 weeks

1. **Auto-generated evals** — system creates new test cases from production edge cases automatically.
2. **Continuous quality gates** — every response is scored in real-time; low-quality responses trigger fallbacks.
3. **Model selection automation** — automatically route to the best-performing model per task type based on eval data.
4. **Eval-driven deployment** — no model or prompt change ships without passing the full eval suite with statistical significance.

---

## 5. Observability (obs_1 – obs_6)

**Controls:** Request logging, latency tracking, token usage monitoring, error rate dashboards, alerting, distributed tracing.

**AMC Modules:** `amc.watch.w1_receipts`, `amc.watch.w2_assurance`

### L1 → L2 · ~1 week

1. **Log all LLM calls** — capture request/response, model used, latency, and token count.
2. **Centralize logs** — send logs to a single location (file, database, or log service).
3. **Basic dashboard** — create a simple view of daily request volume, error rate, and average latency.
4. **Evidence tip:** Logging code = `CODE_PRESENT`. Actual log files with entries = `EXECUTION_VERIFIED`.

### L2 → L3 · ~2–3 weeks

1. **Enable `amc.watch.w1_receipts`** — structured receipt logging for every AI operation.
2. **Enable `amc.watch.w2_assurance`** — continuous monitoring of system health and output quality.
3. **Set up alerting** — notify on-call when error rate exceeds threshold or latency spikes.
4. **Add distributed tracing** — trace a request from user input through all processing stages to final response.
5. **Token usage tracking** — monitor consumption by model, user, and feature.

### L3 → L4 · ~3–6 weeks

1. **Anomaly detection** — auto-detect unusual patterns in latency, errors, or usage without manual thresholds.
2. **Drill-down dashboards** — slice metrics by model, prompt template, user segment, and time window.
3. **Log retention policy** — define and enforce how long logs are kept (compliance + cost balance).
4. **SLO burn-rate alerts** — alert not just on thresholds but on the rate of SLO budget consumption.

### L4 → L5 · ~6–10 weeks

1. **Predictive alerting** — warn before problems happen based on trend analysis.
2. **Auto-remediation triggers** — observability signals directly trigger scaling, failover, or rollback.
3. **Full-stack correlation** — correlate AI metrics with infrastructure, application, and business metrics.
4. **Continuous verification** — automated checks confirm observability pipeline itself is complete and functioning.

---

## 6. Cost Efficiency (cost_1 – cost_6)

**Controls:** Token usage optimization, model selection by cost/quality, caching, budget limits, cost allocation, ROI tracking.

**AMC Modules:** *(No dedicated module — manual process improvements and tooling)*

### L1 → L2 · ~1 week

1. **Track spending** — export API invoices; record monthly cost in a spreadsheet or `AMC_OS/COSTS/MONTHLY.md`.
2. **Set budget alerts** — configure provider-level spending alerts (e.g., OpenAI usage limits).
3. **Identify top cost drivers** — which models, features, or users consume the most tokens?
4. **Evidence tip:** Cost tracking doc = `KEYWORD_CLAIM` (40%). Add automated cost scraping script = `CODE_PRESENT` (55%).

### L2 → L3 · ~2–4 weeks

1. **Implement caching** — cache identical or semantically similar requests to avoid redundant LLM calls.
2. **Right-size models** — use cheaper/smaller models for simple tasks; reserve expensive models for complex ones.
3. **Prompt optimization** — shorten prompts, remove redundancy, use structured outputs to reduce token waste.
4. **Cost allocation** — attribute costs to teams, features, or customers for chargeback or awareness.
5. **Evidence tip:** Caching code + cost reports showing savings = `EXECUTION_VERIFIED`.

### L3 → L4 · ~4–8 weeks

1. **Dynamic model routing** — automatically select the cheapest model that meets quality thresholds per request.
2. **Token budgets per request** — enforce max token limits with graceful truncation.
3. **Batch processing** — group non-urgent requests for batch API pricing where available.
4. **ROI measurement** — track cost per business outcome (e.g., cost per resolved ticket, cost per generated lead).

### L4 → L5 · ~8–12 weeks

1. **Automated cost optimization** — system continuously adjusts model selection, caching, and batching based on live cost/quality data.
2. **Predictive budgeting** — forecast next month's costs based on growth trends and planned changes.
3. **Cost anomaly detection** — auto-alert on unexpected spending spikes with root cause analysis.
4. **Continuous ROI optimization** — automatically shift resources from low-ROI to high-ROI AI use cases.

---

## 7. Operating Model (ops_1 – ops_7)

**Controls:** API design, deployment process, environment management, documentation, team structure, incident management, capacity planning.

**AMC Module:** `amc.api.main`

### L1 → L2 · ~1–2 weeks

1. **Centralize AI access through `amc.api.main`** — all AI interactions go through a single API layer (no direct model calls scattered in code).
2. **Document your setup** — write a `README.md` covering architecture, how to deploy, and how to operate.
3. **Define environments** — separate dev, staging, and production configurations.
4. **Incident process** — create a simple incident template in `AMC_OS/OPS/INCIDENT_TEMPLATE.md`.

### L2 → L3 · ~2–4 weeks

1. **CI/CD pipeline** — automate testing and deployment of AI system changes.
2. **Runbooks** — document common operational procedures (scaling, rollback, debugging).
3. **On-call rotation** — define who responds to AI system issues and when.
4. **API versioning** — version your API to enable safe, non-breaking changes.
5. **Evidence tip:** CI/CD pipeline running + deployment logs = `EXECUTION_VERIFIED`.

### L3 → L4 · ~4–8 weeks

1. **Infrastructure as code** — define all infrastructure in version-controlled templates (Terraform, Pulumi, etc.).
2. **Canary deployments** — roll out changes to a small percentage of traffic first; auto-promote or rollback.
3. **Capacity planning** — model expected growth and plan infrastructure accordingly.
4. **Post-incident reviews** — conduct blameless retrospectives; track action items to completion.
5. **Cross-team documentation** — maintain an internal knowledge base accessible to all stakeholders.

### L4 → L5 · ~8–12 weeks

1. **GitOps** — all operational changes flow through git with automated reconciliation.
2. **Auto-scaling** — infrastructure scales up/down based on demand without manual intervention.
3. **Self-service platform** — teams can deploy and manage AI features without ops team involvement.
4. **Continuous improvement** — operational metrics drive automated process optimization.
5. **Full API lifecycle management** — deprecation, migration, and versioning are automated.

---

## Quick-Win Priority Matrix

| Effort | High Impact | Lower Impact |
|--------|-----------|-------------|
| **Low (1–2 weeks)** | Enable w1_receipts (obs, gov), Write policies (gov), Add error handling (rel) | Track costs (cost), Write docs (ops) |
| **Medium (2–4 weeks)** | Deploy shield modules (sec), Enable w2_assurance (eval, obs), Set up CI evals (eval) | Implement caching (cost), API versioning (ops) |
| **High (4–8 weeks)** | Policy-as-code (gov), Chaos testing (rel), A/B testing (eval) | Dynamic model routing (cost), IaC (ops) |

## Evidence Upgrade Path

The fastest way to increase your score is often not adding new controls, but **upgrading evidence quality** for existing ones:

1. **KEYWORD_CLAIM → CODE_PRESENT:** Turn documentation into config files or code.
2. **CODE_PRESENT → IMPORT_VERIFIED:** Wire modules into your application; verify imports.
3. **IMPORT_VERIFIED → EXECUTION_VERIFIED:** Produce logs/receipts proving the control ran.
4. **EXECUTION_VERIFIED → CONTINUOUS_VERIFIED:** Add monitoring that proves the control runs *continuously* without gaps.

> **Example:** You claim "we filter PII from outputs" in a doc (40%). Deploy `amc.vault.v2_dlp` (70% at import). Show DLP scan logs (100%). Add uptime monitoring for DLP (110%).

---

*Generated for AMC OS. See `AMC_OS/DOCS/SCORING.md` for score calculation details.*
