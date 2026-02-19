"""
AMC Score — L5 Requirements Specification
==========================================
Defines what L5 (Autonomous & Self-Improving) ACTUALLY requires for each
dimension, with executable evidence criteria and honest effort estimates.

L5 is NOT about adding more code patterns. It's about production-grade
autonomous operation: self-healing, self-improving, predictive systems
that run without human intervention.
"""
from __future__ import annotations

L5_REQUIREMENTS: dict[str, dict[str, dict[str, object]]] = {
    "governance": {
        "gov_6": {
            "description": "Automated continuous governance reviews",
            "what_it_actually_means": (
                "A scheduled process (cron, event-driven, or continuous) that automatically "
                "reviews agent behavior against governance policies — without a human triggering it. "
                "Think: every hour, the system checks 'did any agent violate policy?' and generates "
                "a report or alert. Not a human reading logs quarterly."
            ),
            "executable_proof": (
                "Run the governance review scheduler, wait for it to trigger, verify it produces "
                "a compliance report with specific violations or all-clear status. "
                "Test: `assert review_system.run_automated_check().completed_at is not None`"
            ),
            "minimum_viable_impl": (
                "A cron job or event hook that: (1) queries the ReceiptsLedger for recent actions, "
                "(2) checks each against ToolPolicyFirewall rules, (3) flags violations, "
                "(4) writes a governance report to a known location. ~200 lines of code."
            ),
            "amc_module": "amc.watch.w1_receipts + amc.enforce.e1_policy",
            "infrastructure_needed": [
                "Persistent receipt storage (not :memory:)",
                "Scheduler (cron, Celery, or event loop)",
                "Alert delivery channel (email, Slack, PagerDuty)",
            ],
            "estimated_effort": "3-5 days for MVP, 2 weeks for production-grade",
        },
        "gov_7": {
            "description": "Incident-driven governance feedback loop",
            "what_it_actually_means": (
                "When an incident occurs (policy violation, security breach, agent failure), "
                "the system automatically updates governance policies based on lessons learned. "
                "Not just logging the incident — actually changing the rules to prevent recurrence."
            ),
            "executable_proof": (
                "Simulate an incident (e.g., agent accesses forbidden resource). Verify that after "
                "incident resolution, the policy rules are tighter than before. "
                "Test: `policy_before = firewall.rules.copy(); handle_incident(event); assert firewall.rules != policy_before`"
            ),
            "minimum_viable_impl": (
                "An incident handler that: (1) receives incident reports, (2) categorizes the root cause, "
                "(3) generates a policy rule update (e.g., add a new deny pattern), (4) applies it to "
                "ToolPolicyFirewall, (5) logs the change with rationale."
            ),
            "amc_module": "amc.enforce.e1_policy + amc.watch.w1_receipts",
            "infrastructure_needed": [
                "Incident management system (even a simple queue)",
                "Policy version control (to track rule changes over time)",
                "Human approval for policy changes (ironic but necessary for safety)",
            ],
            "estimated_effort": "1-2 weeks",
        },
    },
    "security": {
        "sec_5": {
            "description": "Automated adaptive threat modeling",
            "what_it_actually_means": (
                "The system automatically adjusts its threat detection based on observed attack patterns. "
                "If it sees a new injection technique, it adds a detection rule without human intervention. "
                "This is genuinely hard — it's automated security research."
            ),
            "executable_proof": (
                "Feed the system a novel attack pattern not in its current ruleset. Verify that after "
                "processing, the InjectionDetector has a new rule that catches similar patterns. "
                "Test: `assert detector.rules_count_after > detector.rules_count_before`"
            ),
            "minimum_viable_impl": (
                "A feedback loop from InjectionDetector findings to rule generation: "
                "(1) Collect blocked/suspicious inputs, (2) Cluster similar patterns, "
                "(3) Generate regex or classifier update, (4) Deploy to detector. "
                "The 'generate rule' step is the hard part — needs LLM or ML."
            ),
            "amc_module": "amc.shield.s10_detector + amc.shield.s15_threat_intel",
            "infrastructure_needed": [
                "Threat intelligence feed or attack pattern database",
                "ML pipeline for pattern clustering",
                "Safe rule deployment with rollback",
                "Sandboxed testing of new rules against false-positive corpus",
            ],
            "estimated_effort": "2-4 weeks for basic version, months for production",
        },
        "sec_6": {
            "description": "Continuous red-team / adversarial simulation",
            "what_it_actually_means": (
                "Automated adversarial testing that runs continuously (not just pre-release). "
                "The system attacks itself on a schedule, discovers weaknesses, and reports them. "
                "Like having a security researcher on payroll who never sleeps."
            ),
            "executable_proof": (
                "Start the continuous red-team process. Wait for one cycle. Verify it ran attack "
                "scenarios and produced a vulnerability report. "
                "Test: `report = red_team_scheduler.run_cycle(); assert len(report.findings) >= 0`"
            ),
            "minimum_viable_impl": (
                "Schedule SafetyTestKit.run_suite() on a cron. Collect results. Diff against "
                "previous run to detect regressions. Alert on new vulnerabilities."
            ),
            "amc_module": "amc.watch.w4_safety_testkit",
            "infrastructure_needed": [
                "Scheduler",
                "Results storage and diffing",
                "Alert channel for new vulnerabilities",
            ],
            "estimated_effort": "3-5 days (SafetyTestKit already exists, just needs scheduling)",
        },
    },
    "reliability": {
        "rel_5": {
            "description": "Self-healing autonomous recovery",
            "what_it_actually_means": (
                "When the agent fails, it automatically recovers without human intervention. "
                "Not just retry logic (that's L3) — actual diagnosis, fix, and restart. "
                "If a dependency is down, it switches to a fallback. If it's in a bad state, it resets."
            ),
            "executable_proof": (
                "Kill a dependency the agent relies on. Verify the agent detects the failure, "
                "switches to fallback, and continues operating. Then restore the dependency and "
                "verify the agent switches back. "
                "Test: `kill_dep(); assert agent.status == 'degraded-but-running'; restore_dep(); assert agent.status == 'healthy'`"
            ),
            "minimum_viable_impl": (
                "Health check loop that: (1) probes dependencies, (2) on failure triggers "
                "CircuitBreaker, (3) switches to fallback mode, (4) periodically retries primary, "
                "(5) auto-recovers when primary returns."
            ),
            "amc_module": "amc.enforce.e5_circuit_breaker",
            "infrastructure_needed": [
                "Health check endpoints for all dependencies",
                "Fallback implementations for critical paths",
                "State machine for degraded operation modes",
            ],
            "estimated_effort": "1-2 weeks",
        },
        "rel_6": {
            "description": "Predictive reliability with proactive alerting",
            "what_it_actually_means": (
                "The system predicts failures BEFORE they happen using trends in metrics. "
                "If error rate is trending up, it alerts before SLA breach. If latency is "
                "increasing, it scales before timeout. This requires ML on metrics."
            ),
            "executable_proof": (
                "Feed the system a gradually degrading metric series. Verify it alerts BEFORE "
                "the threshold is crossed. "
                "Test: `inject_degrading_metrics(); alerts = collector.get_alerts(); assert any(a.type == 'predictive' for a in alerts)`"
            ),
            "minimum_viable_impl": (
                "Simple linear regression on error rate over last N minutes. If predicted "
                "rate in T minutes exceeds threshold, fire proactive alert. ~100 lines + metrics store."
            ),
            "amc_module": "amc.enforce.e5_circuit_breaker + custom ML",
            "infrastructure_needed": [
                "Time-series metrics storage (Prometheus, InfluxDB, or SQLite)",
                "ML model for trend prediction (even simple linear regression)",
                "Alert delivery system",
            ],
            "estimated_effort": "1-2 weeks for linear regression, 1 month for real ML",
        },
    },
    "evaluation": {
        "eval_5": {
            "description": "Continuous evaluation on production traffic",
            "what_it_actually_means": (
                "Every agent response in production is automatically evaluated for quality — "
                "not just pre-release testing. Shadow evaluation: run the eval suite on real "
                "inputs/outputs without blocking the response."
            ),
            "executable_proof": (
                "Process 100 real requests. Verify that each has an associated eval score stored. "
                "Test: `scores = eval_store.get_scores(last_n=100); assert len(scores) == 100`"
            ),
            "minimum_viable_impl": (
                "Async post-processing hook: after each agent response, queue an eval job that "
                "scores the output. Store scores. Alert on quality drops."
            ),
            "amc_module": "amc.watch.w2_assurance",
            "infrastructure_needed": [
                "Async job queue (even threading.Thread works for MVP)",
                "Eval results storage",
                "Production traffic (real users)",
            ],
            "estimated_effort": "3-5 days for the hook, needs production traffic to be meaningful",
        },
        "eval_6": {
            "description": "Automated eval-driven improvement loop",
            "what_it_actually_means": (
                "When eval scores drop, the system automatically adjusts to improve. "
                "This is the holy grail of autonomous AI: the agent improves itself based on "
                "production eval results. In practice: prompt tuning, few-shot example selection, "
                "or model routing based on eval feedback."
            ),
            "executable_proof": (
                "Deliberately degrade agent quality. Verify the system detects the drop, "
                "makes an adjustment, and quality improves. "
                "Test: `inject_quality_drop(); wait_for_improvement_cycle(); assert new_score > degraded_score`"
            ),
            "minimum_viable_impl": (
                "When eval scores for a category drop below threshold: (1) collect failing examples, "
                "(2) add them as few-shot examples to the prompt, (3) re-evaluate. "
                "This is essentially what this self-improvement loop does, but in production."
            ),
            "amc_module": "amc.product.improvement",
            "infrastructure_needed": [
                "Production eval pipeline (eval_5)",
                "Prompt management system",
                "A/B testing for prompt changes",
                "Guardrails to prevent improvement loops from degrading quality",
            ],
            "estimated_effort": "2-4 weeks, depends heavily on agent architecture",
        },
    },
    "observability": {
        "obs_5": {
            "description": "AI-powered anomaly detection on observability data",
            "what_it_actually_means": (
                "Instead of fixed threshold alerts (error rate > 5%), the system uses ML to "
                "detect anomalies: unusual patterns, seasonal deviations, sudden changes in "
                "distribution. Catches problems that fixed thresholds miss."
            ),
            "executable_proof": (
                "Feed normal metrics for a week, then inject an anomaly. Verify detection "
                "without any threshold being explicitly set. "
                "Test: `inject_anomaly(); alerts = anomaly_detector.check(); assert len(alerts) > 0`"
            ),
            "minimum_viable_impl": (
                "Z-score anomaly detection on key metrics (error rate, latency, throughput). "
                "Rolling window of 1 hour, alert if any metric is >3 standard deviations from mean. "
                "~50 lines of Python + numpy."
            ),
            "amc_module": "Custom (no existing AMC module)",
            "infrastructure_needed": [
                "Metrics time-series storage",
                "numpy or scipy for statistics",
                "Rolling window computation",
            ],
            "estimated_effort": "2-3 days for Z-score, 2 weeks for proper ML",
        },
        "obs_6": {
            "description": "Distributed tracing with root cause analysis",
            "what_it_actually_means": (
                "Every request through the agent system gets a trace ID that follows it across "
                "all components. When something fails, you can trace the full path and identify "
                "exactly where it broke. OpenTelemetry is the standard."
            ),
            "executable_proof": (
                "Send a request that touches 3+ components. Verify a complete trace exists "
                "linking all components. "
                "Test: `trace = tracer.get_trace(request_id); assert len(trace.spans) >= 3`"
            ),
            "minimum_viable_impl": (
                "Add OpenTelemetry SDK, instrument key methods with spans, export to Jaeger or "
                "console. ~100 lines of instrumentation code."
            ),
            "amc_module": "Custom (OpenTelemetry SDK)",
            "infrastructure_needed": [
                "OpenTelemetry SDK",
                "Trace collector (Jaeger, Zipkin, or Datadog)",
                "Instrumentation on all components",
            ],
            "estimated_effort": "3-5 days for basic, 2 weeks for comprehensive",
        },
    },
    "cost_efficiency": {
        "cost_5": {
            "description": "Automated cost-optimized model routing",
            "what_it_actually_means": (
                "The system automatically chooses the cheapest model that meets quality requirements "
                "for each request. Not manual tier mapping — dynamic routing based on actual "
                "quality/cost tradeoff data from production."
            ),
            "executable_proof": (
                "Send 100 requests of varying complexity. Verify that simple requests went to "
                "cheap models and complex ones to expensive models, and total cost is lower "
                "than always using the expensive model. "
                "Test: `assert mixed_routing_cost < always_gpt4_cost`"
            ),
            "minimum_viable_impl": (
                "Complexity classifier (keyword/heuristic based) that routes to model tiers. "
                "Track quality per tier. Automatically promote requests to higher tier if quality drops."
            ),
            "amc_module": "amc.enforce.e35_model_switchboard + amc.product.cost_latency_router",
            "infrastructure_needed": [
                "Multiple model endpoints (GPT-3.5, GPT-4, local model)",
                "Quality evaluation per response",
                "Cost tracking per model",
                "Routing decision log for optimization",
            ],
            "estimated_effort": "1-2 weeks",
        },
        "cost_6": {
            "description": "Automated budget enforcement for runaway agents",
            "what_it_actually_means": (
                "If an agent starts spending too fast (loop bug, adversarial input causing "
                "infinite retries), the system automatically throttles or kills it before it "
                "blows the budget. Like a financial circuit breaker."
            ),
            "executable_proof": (
                "Start an agent with a $10 budget. Simulate rapid spending. Verify the agent "
                "is throttled/killed before reaching $10. "
                "Test: `simulate_spending_spree(); assert total_spent < budget_cap`"
            ),
            "minimum_viable_impl": (
                "Hook into CircuitBreaker: track cumulative cost per session, trigger OPEN state "
                "when spending rate exceeds threshold. Already partially implemented via "
                "budget_cap + circuit breaker."
            ),
            "amc_module": "amc.enforce.e5_circuit_breaker",
            "infrastructure_needed": [
                "Real-time cost tracking (not just estimated)",
                "Per-session and per-agent budget limits",
                "Alert before kill (soft limit + hard limit)",
            ],
            "estimated_effort": "3-5 days (circuit breaker exists, needs cost integration)",
        },
    },
    "operating_model": {
        "ops_6": {
            "description": "Automated runbook execution for known incident types",
            "what_it_actually_means": (
                "When a known type of incident occurs (e.g., 'database connection timeout'), "
                "instead of paging a human, the system automatically executes a runbook: "
                "restart connection pool, clear cache, retry, escalate if still failing."
            ),
            "executable_proof": (
                "Simulate a known incident type. Verify the runbook executes automatically "
                "and resolves it without human intervention. "
                "Test: `simulate_db_timeout(); assert incident.resolved_automatically is True`"
            ),
            "minimum_viable_impl": (
                "Incident classifier + runbook mapping: (1) Detect incident type from error pattern, "
                "(2) Look up runbook, (3) Execute steps, (4) Verify resolution, (5) Escalate if not."
            ),
            "amc_module": "Custom (would need runbook engine)",
            "infrastructure_needed": [
                "Runbook definitions (YAML/JSON)",
                "Incident classifier",
                "Execution engine with rollback",
                "Escalation path to humans",
            ],
            "estimated_effort": "2-4 weeks",
        },
        "ops_7": {
            "description": "OKR framework with measured continuous improvement cadence",
            "what_it_actually_means": (
                "The AI platform has quarterly objectives (e.g., 'reduce p50 latency by 20%') "
                "with measured key results, reviewed regularly. This is an organizational "
                "practice, not a code feature. You can't 'implement' OKRs in Python."
            ),
            "executable_proof": (
                "Show: (1) Written OKRs for the AI platform, (2) Metric dashboards tracking KRs, "
                "(3) Evidence of quarterly reviews with outcomes documented."
            ),
            "minimum_viable_impl": (
                "A markdown doc with OKRs + a dashboard tracking the metrics. "
                "The hard part is the organizational discipline to actually review and act."
            ),
            "amc_module": "None — organizational practice",
            "infrastructure_needed": [
                "OKR tracking tool or document",
                "Metrics dashboard",
                "Regular review cadence (humans required)",
            ],
            "estimated_effort": "Ongoing organizational commitment, not a one-time implementation",
        },
    },
}


def get_achievable_in_code() -> list[str]:
    """Return L5 QIDs that can be meaningfully implemented in agent code."""
    achievable = []
    for dim, qids in L5_REQUIREMENTS.items():
        for qid, req in qids.items():
            infra = req["infrastructure_needed"]
            # Achievable if infrastructure needs are minimal
            if len(infra) <= 2 and "organizational" not in str(req.get("estimated_effort", "")).lower():
                achievable.append(qid)
    return achievable


def get_needs_infrastructure() -> list[str]:
    """Return L5 QIDs that need significant infrastructure beyond agent code."""
    needs_infra = []
    for dim, qids in L5_REQUIREMENTS.items():
        for qid, req in qids.items():
            if len(req["infrastructure_needed"]) >= 3:
                needs_infra.append(qid)
    return needs_infra


def summary() -> str:
    """Print a human-readable summary of L5 requirements."""
    lines = ["# L5 Requirements Summary\n"]
    for dim, qids in L5_REQUIREMENTS.items():
        lines.append(f"\n## {dim.title()}")
        for qid, req in qids.items():
            lines.append(f"\n### {qid}: {req['description']}")
            lines.append(f"**What it means**: {req['what_it_actually_means'][:200]}...")
            lines.append(f"**Effort**: {req['estimated_effort']}")
            lines.append(f"**Infrastructure**: {', '.join(req['infrastructure_needed'])}")
    return "\n".join(lines)
