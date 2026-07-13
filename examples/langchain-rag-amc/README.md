# LangChain RAG + AMC Baseline

Runnable starter blueprint for a LangChain app evaluated with AMC.

## Uses these existing working assets

- `../langchain-node/`
- `../langchain-python/`

## Quick start (Python)

```bash
./setup.sh
./run-python.sh
```

Manual flow:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
amc up
amc wrap langchain-python -- python examples/langchain-python/main.py
amc quickscore
amc dataset create rag-baseline
amc dataset import rag-baseline --file examples/langchain-rag-amc/dataset-cases.example.jsonl
amc dataset run rag-baseline
amc trace list
```

## Quick start (Node)

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
amc up
amc wrap langchain-node -- node examples/langchain-node/index.ts
amc quickscore
```

## Goal

Move from "the demo worked once" to repeatable evals with:
- baseline score
- golden dataset cases
- trace inspection
- assurance runs

## Docs

- `../../docs/STARTER_BLUEPRINTS.md`
- `../../docs/QUICKSTART.md`
