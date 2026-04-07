# pytest-amc Quick Start

Get AMC scoring integrated into your pytest workflow in 5 minutes.

## 1. Install

```bash
pip install pytest-amc
npm i -g agent-maturity-compass
```

## 2. Initialize AMC

```bash
cd your-project
amc init --non-interactive --agent my-agent
```

## 3. Run Tests with AMC

```bash
pytest --amc-score
```

## 4. Add Threshold Gate

```bash
pytest --amc-score --amc-min-level 3 --amc-fail-below
```

## 5. Add to CI

**.github/workflows/test.yml:**

```yaml
- name: Install dependencies
  run: |
    pip install pytest pytest-amc
    npm i -g agent-maturity-compass

- name: Run tests with AMC gate
  run: pytest --amc-score --amc-min-level 3 --amc-fail-below
```

## Example Output

```
============================= test session starts ==============================
collected 42 items

tests/test_agent.py ........................................          [100%]

============================================================
🧭 AMC Score: 3.45 (L3)
============================================================

Dimension Scores:
  • governance: 3.20 (L3)
  • security: 3.80 (L3)
  • reliability: 3.40 (L3)
  • observability: 3.30 (L3)
  • evaluation: 3.50 (L3)

✅ AMC score L3 meets minimum L3
============================================================

============================== 42 passed in 2.34s ===============================
```

## Configuration

Add to **pytest.ini** or **pyproject.toml**:

```ini
[tool.pytest.ini_options]
addopts = "--amc-score --amc-min-level 3 --amc-fail-below"
```

## Troubleshooting

**"AMC CLI not found"**
```bash
npm i -g agent-maturity-compass
which amc  # Should show path
```

**"Score returns L0"**
```bash
amc init --non-interactive --agent my-agent
```

## Next Steps

- [Full Documentation](README.md)
- [CI/CD Integration](../../docs/integrations/ci-cd.md)
- [AMC Scoring Guide](https://github.com/AgentMaturity/AgentMaturityCompass)
