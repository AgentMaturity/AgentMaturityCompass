# LlamaIndex Adapter

Adapter ID: `llamaindex-python`  
Runtime: Python 3.11+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

LlamaIndex is a data framework for LLM applications. The AMC adapter captures indexing operations, query execution, retrieval steps, and LLM calls within LlamaIndex pipelines.

## Prerequisites

- Python 3.11+
- `llama-index` package installed
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-index --adapter llamaindex-python -- python index_agent.py
```

## Setup

```bash
amc adapters configure \
  --agent my-index \
  --adapter llamaindex-python \
  --route /openai
```

## SDK Integration

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from llama_index.llms.openai import OpenAI

# AMC injects OPENAI_BASE_URL and OPENAI_API_KEY
llm = OpenAI(model="gpt-4o")

documents = SimpleDirectoryReader("./docs").load_data()
index = VectorStoreIndex.from_documents(documents)

query_engine = index.as_query_engine(llm=llm)
response = query_engine.query("What is agent maturity?")
```

## Evidence Captured

- Document loading and parsing
- Index construction and updates
- Query execution and retrieval
- LLM calls for synthesis
- Embedding generation
- Retrieval scores and rankings

## See Also

- [LangChain Python Adapter](langchain-python.md)
- [Semantic Kernel Adapter](semantic-kernel.md)
