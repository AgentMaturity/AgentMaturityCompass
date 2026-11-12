# AMC Python SDK Adapter

Adapter ID: `python-amc-sdk`  
Python package: `amc-sdk` 0.2.0, import name `amc_sdk` (source: `sdk/python`)  
Python: 3.10+  
AMC runtime: 1.2.x (the SDK refuses any other runtime version)

## Overview

Two pieces share this name:

- The **`python-amc-sdk` adapter** launches a Python agent process under AMC with a lease. Like the other OpenAI-compatible adapters, it sets `OPENAI_BASE_URL` and `AMC_LLM_BASE_URL` to the AMC gateway route and puts the short-lived lease in `OPENAI_API_KEY`. Its default command is `python3 run_full_validation.py`, and detection runs `python3 -c "import amc; print(amc.__version__)"`.
- The **Python SDK** (`amc_sdk`) drives AMC's native agent from Python. It starts one `amc acp` process with a fixed workspace, provider and credential reference, sends prompts, and exports a proof of the recorded session afterwards. It has no dependencies outside the standard library.

The SDK supports AMC runtimes `>=1.2.0,<1.3.0`. The published 1.1.1 release is older, so the SDK refuses it at startup: use an AMC built from the current source, and point the SDK at it with `amc_bin=` or the `AMC_BIN` environment variable when more than one AMC is installed.

## Installation

The SDK is not on PyPI yet (publication is pending), so install it from this repository's `sdk/python` directory. Do not install a PyPI package with a similar name: none is published by AMC.

```bash
pip install "git+https://github.com/AgentMaturity/AgentMaturityCompass.git#subdirectory=sdk/python"
```

Or, from a clone: `pip install ./sdk/python`.

Initialize the workspace with the AMC CLI first (`amc init`); the SDK never initializes a workspace.

## Quick Start

`provider="stub"` is a local recording demonstration with a canned answer. It needs no model credentials and shows the lifecycle, not real model work.

```python
from amc_sdk import AmcAgent

with AmcAgent(workspace=".", provider="stub") as agent:
    session = agent.new_session()
    result = session.prompt("Summarise the changelog.")
    print(result.stop_reason, result.text)
    session_id = session.session_id
```

For real model work, select the provider and model explicitly and name a credential reference (never a key value): for example `AmcAgent(workspace=".", provider="openai", model="YOUR_MODEL_ID", credential="OPENAI_API_KEY")`. Supported providers are `openai` (Chat Completions), `openai-responses`, `anthropic` and `stub`; any other provider is refused. See `sdk/python/README.md` for every option.

## Stream committed updates

```python
from amc_sdk import AmcAgent

with AmcAgent(workspace=".", provider="stub") as agent:
    turn = agent.new_session().start_prompt("Show a local recording demonstration.")
    for event in turn:
        print(event.update)
    result = turn.result()
    print(result.stop_reason, result.verification)
```

Updates are completed blocks from committed session rows, not raw token deltas. `stop_reason == "end_turn"` is not a success verdict, and `result.verification` is always `"not-verified"`: use the signed record for the authoritative ending.

## Prove the run to someone else

```python
from amc_sdk import export_proof, verify_proof

# Export after the `with` block has closed the agent and sealed the session.
proof = export_proof(session_id, "run.amcproof.json", workspace=".")
print(proof.path, proof.auditor_key_fingerprint)

# Compare against a fingerprint you obtained through a trusted route, not the one in the bundle.
print(verify_proof("run.amcproof.json", expect_auditor_key=trusted_fingerprint, workspace="."))
```

The proof helpers call the installed AMC CLI. `export_proof` raises `AmcProofError` when the workspace's evidence ledger does not verify. A fingerprint taken only from the bundle itself does not authenticate that bundle.

## Run a Python agent through the adapter

```bash
amc adapters configure --agent my-python-agent --adapter python-amc-sdk --route /openai --model gpt-4o
amc adapters run --agent my-python-agent --adapter python-amc-sdk -- python3 my_agent.py
```

Any OpenAI-compatible client in the process that reads `OPENAI_BASE_URL` and `OPENAI_API_KEY` is routed through the gateway. Model evidence exists only for requests the gateway actually receives.

## See Also

- `sdk/python/README.md` for the complete SDK reference
- [LangChain Python Adapter](langchain-python.md)
- [Generic CLI Adapter](generic-cli.md)
