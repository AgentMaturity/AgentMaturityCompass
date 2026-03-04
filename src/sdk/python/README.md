# AMC Python SDK

Python client library for the [Agent Maturity Compass](https://github.com/thewisecrab/AgentMaturityCompass) Bridge HTTP API.

## Installation

```bash
pip install amc-sdk
```

For optional integrations:

```bash
# With httpx async support
pip install amc-sdk[httpx]

# With LangChain callback handler
pip install amc-sdk[langchain]

# With FastAPI middleware
pip install amc-sdk[fastapi]

# With Flask middleware
pip install amc-sdk[flask]

# Everything
pip install amc-sdk[all]
```

## Quick Start

```python
from amc_sdk import AMCClient

# Create client (reads AMC_BRIDGE_URL and AMC_TOKEN from env)
client = AMCClient()

# Or configure explicitly
client = AMCClient(
    bridge_url="http://localhost:3212",
    token="your-token"
)

# Send a chat completion through the AMC gateway
response = client.openai_chat({
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
})

print(response.ok)      # True
print(response.body)    # API response
print(response.receipt) # AMC evidence receipt
```

## Middleware Integration

### FastAPI

```python
from fastapi import FastAPI
from amc_sdk import AMCFastAPIMiddleware

app = FastAPI()
app.add_middleware(
    AMCFastAPIMiddleware,
    bridge_url="http://localhost:3212",
    token="your-token"
)
```

### Flask

```python
from flask import Flask
from amc_sdk import AMCFlaskMiddleware

app = Flask(__name__)
AMCFlaskMiddleware(app, bridge_url="http://localhost:3212", token="your-token")
```

### LangChain

```python
from langchain.llms import OpenAI
from amc_sdk import AMCLangChainCallback

callback = AMCLangChainCallback(
    bridge_url="http://localhost:3212",
    token="your-token"
)
llm = OpenAI(callbacks=[callback])
```

## Utilities

```python
from amc_sdk import hash_value, redact_text

# Hash output for evidence verification
h = hash_value("my agent output")

# Redact secrets from text
clean = redact_text("my key is sk-abc123xyz456")
# → "my key is [REDACTED]"
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AMC_BRIDGE_URL` | Bridge server URL | `http://localhost:3212` |
| `AMC_TOKEN` | Authentication token | _(empty)_ |
| `AMC_WORKSPACE_ID` | Workspace identifier | _(none)_ |

## License

MIT — see [LICENSE](https://github.com/thewisecrab/AgentMaturityCompass/blob/main/LICENSE).
