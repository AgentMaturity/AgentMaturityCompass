# AutoGen + AMC

AutoGen conversational agents with LLM calls routed through the AMC Gateway.

## What It Does

- Creates a **MathTutor** assistant and a **Student** user proxy
- Runs a multi-turn conversation to solve a calculus problem
- AMC captures all LLM interactions via the gateway proxy

## Prerequisites

- Python ≥ 3.10
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- An OpenAI API key

## Install

```bash
cd examples/autogen
pip install -r requirements.txt
```

## Run with AMC

```bash
amc up
amc wrap autogen-cli -- python main.py
```

## Expected Output

```
[AMC] Routing LLM calls through gateway: http://localhost:3700/v1
=== AutoGen Conversational Agents ===
Student (to MathTutor): What is the integral of x^2 from 0 to 3?
MathTutor (to Student): Let me solve this step by step...
[AMC] All LLM calls captured as evidence via gateway proxy.
```

## How AMC Integrates

AutoGen's `config_list` accepts a `base_url` parameter. AMC's `autogen-cli` adapter sets `OPENAI_BASE_URL` and `OPENAI_API_KEY` environment variables, which are read into the config. The adapter also sets `OPENAI_API_BASE` for older AutoGen versions.

The adapter definition is in `src/adapters/builtins/autogenCli.ts`.
