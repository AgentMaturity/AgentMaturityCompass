"""
AutoGen Conversational Agents with AMC Integration

Demonstrates AutoGen multi-agent conversation routed through the
AMC Gateway for evidence collection and maturity scoring.

AutoGen uses OPENAI_BASE_URL and OPENAI_API_KEY from the environment
via its OpenAI-compatible config, so AMC integration is transparent.
"""

import os
from autogen import ConversableAgent, UserProxyAgent

# ─── AMC Integration ───────────────────────────────────────────────
# AMC wraps LLM calls by setting OPENAI_BASE_URL / OPENAI_API_KEY.
# AutoGen's OAI client reads these from the config_list.
gateway_url = os.environ.get("AMC_GATEWAY_URL") or os.environ.get("OPENAI_BASE_URL")
if gateway_url:
    print(f"[AMC] Routing LLM calls through gateway: {gateway_url}")
# ────────────────────────────────────────────────────────────────────

# Build the LLM config — picks up AMC gateway env vars automatically
llm_config = {
    "config_list": [
        {
            "model": "gpt-4o-mini",
            "api_key": os.environ.get("OPENAI_API_KEY", ""),
            "base_url": os.environ.get("OPENAI_BASE_URL"),
        }
    ],
    "temperature": 0,
}


def main() -> None:
    # Create a conversable assistant agent
    assistant = ConversableAgent(
        name="MathTutor",
        system_message=(
            "You are a math tutor. Solve problems step by step. "
            "Reply TERMINATE when the problem is solved."
        ),
        llm_config=llm_config,
    )

    # Create a user proxy (simulates user input, no LLM)
    user_proxy = UserProxyAgent(
        name="Student",
        human_input_mode="NEVER",
        max_consecutive_auto_reply=3,
        is_termination_msg=lambda msg: "TERMINATE" in msg.get("content", ""),
        code_execution_config=False,
    )

    print("=== AutoGen Conversational Agents ===")
    user_proxy.initiate_chat(
        assistant,
        message="What is the integral of x^2 from 0 to 3?",
    )

    print("\n[AMC] All LLM calls captured as evidence via gateway proxy.")


if __name__ == "__main__":
    main()
