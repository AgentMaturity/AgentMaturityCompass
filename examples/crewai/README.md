# CrewAI + AMC

A CrewAI multi-agent crew where each agent's LLM calls are scored by AMC.

## What It Does

- Creates a **Research Analyst** and a **Technical Writer** agent
- Runs a sequential crew: research → write
- AMC captures all LLM calls from both agents via the gateway proxy

## Prerequisites

- Python ≥ 3.10
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- An OpenAI API key

## Install

```bash
cd examples/crewai
pip install -r requirements.txt
```

## Run with AMC

```bash
amc up
amc wrap crewai-cli -- python main.py
```

## Expected Output

```
[AMC] Routing LLM calls through gateway: http://localhost:3700/v1
=== CrewAI Multi-Agent Crew ===
[Research Analyst] Working on research task...
[Technical Writer] Working on writing task...
Final output: <2-paragraph summary>
[AMC] All agent LLM calls captured as evidence via gateway proxy.
```

## How AMC Integrates

CrewAI uses OpenAI-compatible clients under the hood, reading `OPENAI_BASE_URL` and `OPENAI_API_KEY` from the environment. AMC's `crewai-cli` adapter sets these to the gateway — **zero code changes needed**.

The adapter definition is in `src/adapters/builtins/crewaiCli.ts`.
