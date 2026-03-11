# 📋 AMC Recipes

Copy-paste examples for common tasks. Each recipe is self-contained — run it as-is.

---

## 🏃 5-Minute Recipes

### Score your agent (30 seconds)

```bash
npx agent-maturity-compass quickscore
```

### Score + auto-fix (2 minutes)

```bash
npm i -g agent-maturity-compass
amc init
amc quickscore
amc fix                    # generates guardrails.yaml, AGENTS.md, CI gate
```

### Score via Docker (1 minute, no Node required)

```bash
docker run -it --rm ghcr.io/thewisecrab/amc-quickstart amc quickscore
```

### Score in the browser (0 minutes)

[→ Web Playground](https://thewisecrab.github.io/AgentMaturityCompass/playground.html)

---

## 🔌 Framework Recipes (2-5 minutes each)

### LangChain (Python)

```bash
cd your-langchain-project
amc init --agent my-langchain-agent
amc wrap langchain -- python my_agent.py
amc quickscore
```

### LangChain (Node.js)

```bash
cd your-langchain-project
amc init --agent my-langchain-agent
amc wrap langchain-node -- node agent.js
amc quickscore
```

### CrewAI

```bash
cd your-crewai-project
amc init --agent my-crew
amc wrap crewai -- python crew.py
amc quickscore
```

### AutoGen

```bash
cd your-autogen-project
amc init --agent my-autogen
amc wrap autogen -- python autogen_app.py
amc quickscore
```

### OpenAI Agents SDK

```bash
cd your-openai-project
amc init --agent my-openai-agent
amc wrap openai-agents -- python agent.py
amc quickscore
```

### OpenClaw

```bash
amc init --agent my-openclaw
amc wrap openclaw-cli -- openclaw run
amc quickscore
```

### Claude Code

```bash
amc init --agent my-claude
amc wrap claude-code -- claude "analyze this codebase"
amc quickscore
```

### Any CLI agent

```bash
amc init --agent my-agent
amc wrap generic-cli -- python my_bot.py
amc quickscore
```

---

## 🛡️ Security Recipes (5-10 minutes)

### Full red-team (all 85 attack packs)

```bash
amc assurance run --scope full --verbose
```

### Prompt injection test only

```bash
amc assurance run --pack prompt-injection --verbose
```

### Adversarial robustness (TAP/PAIR/Crescendo)

```bash
amc assurance run --pack adversarial-robustness --verbose
```

### Export to SARIF (for security tools)

```bash
amc assurance run --scope full --format sarif > results.sarif
```

### Domain-specific security (healthcare)

```bash
amc domain assess --domain health --agent my-agent
amc domain gaps --domain health --agent my-agent
```

---

## 📊 CI/CD Recipes (5 minutes)

### GitHub Actions — basic gate

```yaml
# .github/workflows/amc.yml
name: AMC Score
on: [push, pull_request]
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: thewisecrab/AgentMaturityCompass/amc-action@main
        with:
          target-level: 3
```

### GitHub Actions — full (fail on drop + PR comment + artifacts)

```yaml
# .github/workflows/amc.yml
name: AMC Trust Gate
on:
  pull_request:
  push:
    branches: [main]
jobs:
  amc-score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: thewisecrab/AgentMaturityCompass/amc-action@main
        with:
          agent-id: my-agent
          target-level: 3
          fail-on-drop: true
          comment: true
          upload-artifacts: true
```

### GitLab CI

```yaml
# .gitlab-ci.yml
amc-score:
  image: node:20
  script:
    - npm i -g agent-maturity-compass
    - amc init --non-interactive --agent my-agent
    - amc quickscore --json > amc-result.json
    - |
      LEVEL=$(cat amc-result.json | jq -r '.level' | sed 's/L//')
      if [ "$LEVEL" -lt 3 ]; then
        echo "AMC score below L3!"
        exit 1
      fi
  artifacts:
    paths:
      - amc-result.json
```

### CircleCI

```yaml
# .circleci/config.yml
version: 2.1
jobs:
  amc-score:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run:
          name: Install AMC
          command: npm i -g agent-maturity-compass
      - run:
          name: Score agent
          command: |
            amc init --non-interactive --agent my-agent
            amc quickscore --json > amc-result.json
            LEVEL=$(jq -r '.level' amc-result.json | sed 's/L//')
            [ "$LEVEL" -ge 3 ] || (echo "Below L3!" && exit 1)
      - store_artifacts:
          path: amc-result.json
```

---

## 📝 Compliance Recipes (10 minutes)

### EU AI Act audit binder

```bash
amc audit binder create --framework eu-ai-act --agent my-agent
# Generates evidence binder with article-by-article mapping
```

### ISO 42001 compliance report

```bash
amc compliance report --framework iso-42001 --agent my-agent
```

### NIST AI RMF alignment

```bash
amc compliance report --framework nist-ai-rmf --agent my-agent
```

### OWASP LLM Top 10 check

```bash
amc assurance run --pack owasp-llm-top10 --verbose
```

### Full compliance dashboard

```bash
amc studio    # opens web dashboard with compliance status
```

---

## 🐍 Python SDK Recipes

### Score in Python

```python
from amc_sdk import score

result = score("my-agent")
print(f"{result.level}: {result.score}")
```

### Wrap a LangChain agent

```python
from amc_sdk import with_amc

with with_amc("my-agent"):
    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI()
    llm.invoke("Hello!")
```

### pytest decorator

```python
from amc_sdk import amc_guardrails

@amc_guardrails(min_level="L3", packs=["prompt-injection"])
def test_agent():
    assert my_agent.run("test") == "expected"
```

---

## 🐳 Docker Recipes

### Quick score (no install)

```bash
docker run -it --rm ghcr.io/thewisecrab/amc-quickstart amc quickscore
```

### Full studio with dashboard

```bash
docker run -p 3212:3212 -p 4173:4173 \
  -e AMC_VAULT_PASSPHRASE=demo \
  ghcr.io/thewisecrab/amc-studio
```

### Docker Compose (AMC + your agent)

```yaml
version: "3.9"
services:
  amc:
    image: ghcr.io/thewisecrab/amc-studio:latest
    ports:
      - "3210:3210"
      - "4173:4173"
  your-agent:
    build: .
    environment:
      - OPENAI_BASE_URL=http://amc:3210/v1
    depends_on:
      - amc
```

---

## 🔗 Badge Recipe

Add to your README:

```markdown
[![AMC Score](https://img.shields.io/badge/AMC-L3-green)](https://github.com/thewisecrab/AgentMaturityCompass)
```

Auto-generate with:

```bash
amc badge    # outputs markdown for your README
```
