"""
OpenAI Agents SDK with AMC Integration

Demonstrates the OpenAI Agents SDK (formerly Swarm-like patterns) with
LLM calls routed through the AMC Gateway for evidence collection.

The Agents SDK uses the OpenAI client, which reads OPENAI_BASE_URL
from the environment — AMC integration is automatic.
"""

import os
from openai import OpenAI
from agents import Agent, Runner, function_tool

# ─── AMC Integration ───────────────────────────────────────────────
# AMC sets OPENAI_BASE_URL to route all API calls through the gateway.
# The OpenAI client and Agents SDK read this automatically.
gateway_url = os.environ.get("AMC_GATEWAY_URL") or os.environ.get("OPENAI_BASE_URL")
if gateway_url:
    print(f"[AMC] Routing LLM calls through gateway: {gateway_url}")
# ────────────────────────────────────────────────────────────────────


@function_tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    # Simulated weather data for demo
    weather_data = {
        "london": "Cloudy, 12°C",
        "tokyo": "Sunny, 24°C",
        "new york": "Rainy, 8°C",
    }
    return weather_data.get(city.lower(), f"No data for {city}")


@function_tool
def get_population(city: str) -> str:
    """Get the population of a city."""
    pop_data = {
        "london": "8.8 million",
        "tokyo": "13.9 million",
        "new york": "8.3 million",
    }
    return pop_data.get(city.lower(), f"No data for {city}")


def main() -> None:
    # Create an agent with tools
    travel_agent = Agent(
        name="TravelAdvisor",
        instructions=(
            "You are a travel advisor. Use the available tools to get weather "
            "and population data, then give a brief travel recommendation."
        ),
        tools=[get_weather, get_population],
        model="gpt-4o-mini",
    )

    print("=== OpenAI Agents SDK ===")

    # Run the agent
    result = Runner.run_sync(
        travel_agent,
        "Should I visit Tokyo or London this weekend?",
    )

    print(f"Agent response: {result.final_output}")
    print(f"Tool calls made: {len(result.raw_responses)}")

    print("\n[AMC] All LLM calls captured as evidence via gateway proxy.")


if __name__ == "__main__":
    main()
