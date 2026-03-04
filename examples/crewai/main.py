"""
CrewAI Multi-Agent Crew with AMC Integration

Demonstrates a CrewAI crew where each agent's LLM calls are routed
through the AMC Gateway for evidence collection and maturity scoring.

CrewAI uses OPENAI_BASE_URL and OPENAI_API_KEY from the environment,
so AMC integration requires zero code changes.
"""

import os
from crewai import Agent, Task, Crew, Process

# ─── AMC Integration ───────────────────────────────────────────────
# AMC wraps LLM calls by setting OPENAI_BASE_URL to the AMC Gateway.
# CrewAI reads these env vars automatically — no code changes needed.
gateway_url = os.environ.get("AMC_GATEWAY_URL") or os.environ.get("OPENAI_BASE_URL")
if gateway_url:
    print(f"[AMC] Routing LLM calls through gateway: {gateway_url}")
# ────────────────────────────────────────────────────────────────────


def main() -> None:
    # Define agents — each gets scored individually by AMC
    researcher = Agent(
        role="Research Analyst",
        goal="Find accurate, concise information about a given topic",
        backstory="You are a senior research analyst with expertise in technical topics.",
        verbose=True,
        allow_delegation=False,
    )

    writer = Agent(
        role="Technical Writer",
        goal="Write clear, engaging summaries based on research",
        backstory="You are a skilled technical writer who makes complex topics accessible.",
        verbose=True,
        allow_delegation=False,
    )

    # Define tasks
    research_task = Task(
        description="Research the topic: 'How do AI agent frameworks compare?' "
                    "Provide 3 key findings in bullet points.",
        expected_output="3 bullet points summarizing key findings about AI agent frameworks.",
        agent=researcher,
    )

    write_task = Task(
        description="Using the research findings, write a 2-paragraph summary "
                    "suitable for a technical blog post.",
        expected_output="A 2-paragraph blog-style summary of AI agent frameworks.",
        agent=writer,
    )

    # Assemble and run the crew
    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, write_task],
        process=Process.sequential,
        verbose=True,
    )

    print("=== CrewAI Multi-Agent Crew ===")
    result = crew.kickoff()
    print(f"\nFinal output:\n{result}")

    print("\n[AMC] All agent LLM calls captured as evidence via gateway proxy.")


if __name__ == "__main__":
    main()
