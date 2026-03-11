"""Score a LangChain agent with AMC.

Usage:
    pip install amc-sdk langchain-openai
    export OPENAI_API_KEY=sk-...
    python langchain_with_amc.py
"""

from amc_sdk import with_amc

# AMC transparently proxies all LLM calls
with with_amc("my-langchain-agent") as amc:
    # Import after context manager sets up env vars
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model="gpt-4o-mini")
    response = llm.invoke("What is the capital of France?")
    print(f"Agent response: {response.content}")

# Check the trust score
if amc.result:
    print(f"\n🧭 AMC Score: {amc.result.score} ({amc.result.level})")
    if not amc.result.meets("L3"):
        print("⚠️  Agent is below L3 — run `amc fix` to generate guardrails")
else:
    print("\n⚠️  Could not score agent (is AMC CLI installed?)")
