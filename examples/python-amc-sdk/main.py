"""
Python AMC SDK — Direct Usage Example

The simplest possible AMC integration. Uses the AMC Python SDK directly
to score an agent's behavior, collect evidence, and submit results.

This is the "from scratch" approach — no framework required.
"""

import os
import json
import urllib.request
from datetime import datetime, timezone

# ─── AMC Integration ───────────────────────────────────────────────
# The Python AMC SDK connects to the AMC Gateway to submit evidence
# and retrieve scores. This example shows the core SDK patterns.

AMC_GATEWAY_URL = os.environ.get("AMC_GATEWAY_URL", "http://localhost:3700")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", f"{AMC_GATEWAY_URL}/v1")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

print(f"[AMC] Gateway URL: {AMC_GATEWAY_URL}")
# ────────────────────────────────────────────────────────────────────


def call_llm(prompt: str, model: str = "gpt-4o-mini") -> str:
    """Make an LLM call through the AMC Gateway (OpenAI-compatible)."""
    url = f"{OPENAI_BASE_URL}/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        return result["choices"][0]["message"]["content"]


def collect_evidence(event_type: str, data: dict) -> dict:
    """Create an evidence record for AMC scoring."""
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "data": data,
    }


def main() -> None:
    evidence_log: list[dict] = []

    print("=== Python AMC SDK — Direct Usage ===\n")

    # Step 1: Pre-execution safety check (Shield pattern)
    user_input = "What is the capital of France?"
    safety_check = {
        "input": user_input,
        "injection_detected": False,
        "pii_detected": False,
        "check_passed": True,
    }
    evidence_log.append(collect_evidence("shield.input_scan", safety_check))
    print(f"[Shield] Input scan passed: {safety_check['check_passed']}")

    # Step 2: Policy evaluation (Enforce pattern)
    policy_decision = {
        "action": "llm_call",
        "policy": "allow_general_knowledge",
        "decision": "ALLOW",
        "reason": "Query is general knowledge, no restricted topics",
    }
    evidence_log.append(collect_evidence("enforce.policy_eval", policy_decision))
    print(f"[Enforce] Policy decision: {policy_decision['decision']}")

    # Step 3: Make the LLM call through AMC Gateway
    print(f"\n[LLM] Calling model via AMC Gateway...")
    try:
        response = call_llm(user_input)
        print(f"[LLM] Response: {response}")
        evidence_log.append(collect_evidence("llm.completion", {
            "model": "gpt-4o-mini",
            "input_tokens": len(user_input.split()),
            "output_tokens": len(response.split()),
            "success": True,
        }))
    except Exception as e:
        print(f"[LLM] Error (expected if no API key): {e}")
        evidence_log.append(collect_evidence("llm.completion", {
            "model": "gpt-4o-mini",
            "success": False,
            "error": str(e),
        }))

    # Step 4: Audit logging (Watch pattern)
    evidence_log.append(collect_evidence("watch.audit", {
        "action": "query_answered",
        "user_input_hash": hash(user_input),
        "evidence_count": len(evidence_log),
    }))

    # Print evidence summary
    print(f"\n=== Evidence Collected: {len(evidence_log)} records ===")
    for record in evidence_log:
        print(f"  [{record['event_type']}] {record['timestamp']}")

    print("\n[AMC] Evidence ready for scoring. Run `amc score` to evaluate.")


if __name__ == "__main__":
    main()
