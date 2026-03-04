"""
LlamaIndex RAG Pipeline with AMC Integration

Demonstrates a LlamaIndex RAG (Retrieval-Augmented Generation) pipeline
that routes LLM calls through the AMC Gateway for evidence collection.

LlamaIndex uses OpenAI-compatible endpoints, so AMC integration is
transparent via environment variables.
"""

import os
from llama_index.core import VectorStoreIndex, Document, Settings
from llama_index.llms.openai import OpenAI as LlamaOpenAI
from llama_index.embeddings.openai import OpenAIEmbedding

# ─── AMC Integration ───────────────────────────────────────────────
# AMC sets OPENAI_BASE_URL to route LLM calls through the gateway.
# LlamaIndex's OpenAI LLM and embedding clients read this automatically.
gateway_url = os.environ.get("AMC_GATEWAY_URL") or os.environ.get("OPENAI_BASE_URL")
if gateway_url:
    print(f"[AMC] Routing LLM calls through gateway: {gateway_url}")
# ────────────────────────────────────────────────────────────────────


def main() -> None:
    # Configure LlamaIndex to use OpenAI (reads env vars for base_url)
    llm = LlamaOpenAI(model="gpt-4o-mini", temperature=0)
    embed_model = OpenAIEmbedding(model="text-embedding-3-small")

    Settings.llm = llm
    Settings.embed_model = embed_model

    # Create sample documents (in production, load from files/databases)
    documents = [
        Document(text=(
            "The Agent Maturity Compass (AMC) is an evidence-based scoring framework "
            "for AI agents. It evaluates agents across dimensions like safety, governance, "
            "reliability, and observability. Scores are based on observed behavior, not "
            "self-reported claims."
        )),
        Document(text=(
            "AMC uses a gateway proxy pattern to capture LLM interactions transparently. "
            "By setting environment variables like OPENAI_BASE_URL to the AMC Gateway, "
            "all API calls are routed through AMC for evidence collection without any "
            "code changes to the agent."
        )),
        Document(text=(
            "AMC supports 14 framework adapters including LangChain, CrewAI, AutoGen, "
            "LlamaIndex, Semantic Kernel, and more. Each adapter knows how to set the "
            "correct environment variables for its framework."
        )),
    ]

    # Build a vector index from documents
    print("=== LlamaIndex RAG Pipeline ===")
    print("Building vector index...")
    index = VectorStoreIndex.from_documents(documents)

    # Query the index
    query_engine = index.as_query_engine()

    print("\nQuerying: 'How does AMC score agents?'")
    response = query_engine.query("How does AMC score agents?")
    print(f"Response: {response}")

    print("\nQuerying: 'What frameworks does AMC support?'")
    response = query_engine.query("What frameworks does AMC support?")
    print(f"Response: {response}")

    print("\n[AMC] All LLM and embedding calls captured as evidence via gateway proxy.")


if __name__ == "__main__":
    main()
