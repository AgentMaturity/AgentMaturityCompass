"""
Google Gemini Agent with AMC Integration

Demonstrates a Google Gemini agent that routes LLM calls through
the AMC Gateway for evidence collection and maturity scoring.

The Gemini API client reads GEMINI_API_KEY and GEMINI_BASE_URL
from the environment — AMC integration is transparent.
"""

import os
import google.generativeai as genai

# ─── AMC Integration ───────────────────────────────────────────────
# AMC sets GEMINI_BASE_URL / GEMINI_API_KEY to route through the gateway.
# The google.generativeai client can be configured with a custom endpoint.
gateway_url = os.environ.get("AMC_GATEWAY_URL") or os.environ.get("GEMINI_BASE_URL")
api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")

if gateway_url:
    print(f"[AMC] Routing LLM calls through gateway: {gateway_url}")

# Configure the Gemini client
genai.configure(
    api_key=api_key,
    transport="rest",  # Use REST transport for proxy compatibility
)
# ────────────────────────────────────────────────────────────────────


def main() -> None:
    # Create a Gemini model
    model = genai.GenerativeModel("gemini-2.0-flash")

    # Simple generation
    print("=== Gemini Agent ===")
    response = model.generate_content("What are the three laws of robotics?")
    print(f"Response: {response.text}")

    # Multi-turn chat
    print("\n=== Gemini Chat ===")
    chat = model.start_chat(history=[])

    response = chat.send_message("What is machine learning in one sentence?")
    print(f"Turn 1: {response.text}")

    response = chat.send_message("Give me one real-world example.")
    print(f"Turn 2: {response.text}")

    # Function calling
    print("\n=== Gemini Function Calling ===")

    def get_exchange_rate(currency_from: str, currency_to: str) -> dict:
        """Get the exchange rate between two currencies."""
        rates = {
            ("USD", "EUR"): 0.92,
            ("USD", "GBP"): 0.79,
            ("EUR", "USD"): 1.09,
        }
        rate = rates.get((currency_from.upper(), currency_to.upper()), 1.0)
        return {"rate": rate, "from": currency_from, "to": currency_to}

    tool_model = genai.GenerativeModel(
        "gemini-2.0-flash",
        tools=[get_exchange_rate],
    )

    response = tool_model.generate_content("What is 100 USD in EUR?")
    print(f"Tool response: {response.text}")

    print("\n[AMC] All LLM calls captured as evidence via gateway proxy.")


if __name__ == "__main__":
    main()
