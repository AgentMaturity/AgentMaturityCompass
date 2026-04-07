# CI/CD Integration Guide

This guide covers integrating AMC scoring into your CI/CD pipelines.

## GitHub Actions

### Option 1: Reusable Workflow (Recommended)

Use the built-in `amc-score.yml` workflow:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: npm test

  amc-gate:
    needs: test
    uses: ./.github/workflows/amc-score.yml
    with:
      agent-id: my-agent
      target-level: 3
      fail-below: true
```

### Option 2: Direct Integration

```yaml
- name: Install AMC
  run: npm i -g agent-maturity-compass

- name: Run AMC Score
  run: |
    amc quickscore --json --agent my-agent > amc-result.json
    LEVEL=$(jq -r '.level' amc-result.json | sed 's/L//')
    if [ "$LEVEL" -lt 3 ]; then
      echo "❌ AMC score below L3"
      exit 1
    fi
```

### Option 3: PR Gate with Comments

The `amc-pr-gate.yml` workflow automatically:
- Runs AMC scoring on every PR
- Posts results as a PR comment
- Generates badges
- Fails if score < L3

Enable by copying `.github/workflows/amc-pr-gate.yml` to your repo.

## pytest Integration

### Installation

```bash
pip install pytest-amc
```

### Basic Usage

```bash
# Run tests with AMC scoring
pytest --amc-score

# Fail if below L3
pytest --amc-score --amc-min-level 3 --amc-fail-below

# Custom agent ID
pytest --amc-score --amc-agent-id my-agent
```

### pytest.ini Configuration

```ini
[pytest]
addopts = --amc-score --amc-min-level 3 --amc-fail-below
```

### GitHub Actions with pytest

```yaml
- name: Install dependencies
  run: |
    pip install pytest pytest-amc
    npm i -g agent-maturity-compass

- name: Run tests with AMC gate
  run: pytest --amc-score --amc-min-level 3 --amc-fail-below
```

## Badge Generation

### Static Badge (shields.io)

```markdown
[![AMC Score](https://img.shields.io/badge/AMC-L3-green)](https://github.com/AgentMaturity/AgentMaturityCompass)
```

### Dynamic Badge (from CI)

The `amc-pr-gate.yml` workflow automatically generates badge markdown in PR comments.

## Best Practices

1. **Run AMC after tests pass** - Don't waste CI time scoring failed builds
2. **Use consistent agent IDs** - `pr-123`, `main`, `staging` for different contexts
3. **Set appropriate thresholds** - L2 for development, L3 for production
4. **Generate artifacts** - Save `amc-result.json` for historical tracking

## Next Steps

- [Scoring Guide](../scoring.md)
- [Improvement Guide](../improvement.md)
