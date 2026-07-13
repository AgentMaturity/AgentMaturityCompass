# pytest-amc

pytest plugin for Agent Maturity Compass (AMC) scoring and threshold gates.

## Installation

```bash
pip install pytest-amc
```

Or install from source:

```bash
cd integrations/pytest-amc
pip install -e .
```

## Prerequisites

The AMC CLI must be installed:

```bash
curl -fsSL https://agentmaturity.co/install.sh | sh
```

## Usage

### Basic Scoring

Run tests with AMC scoring:

```bash
pytest --amc-score
```

### Threshold Gates

Fail the test run if AMC score is below L3:

```bash
pytest --amc-score --amc-min-level 3 --amc-fail-below
```

### Custom Agent ID

Score a specific agent:

```bash
pytest --amc-score --amc-agent-id my-agent
```

### CI/CD Integration

Example GitHub Actions workflow:

```yaml
- name: Run tests with AMC gate
  run: |
    pip install pytest-amc
    pytest --amc-score --amc-min-level 3 --amc-fail-below
```

## Options

- `--amc-score`: Enable AMC scoring after tests complete
- `--amc-min-level N`: Minimum AMC level required (0-5)
- `--amc-fail-below`: Fail if score is below minimum level
- `--amc-agent-id ID`: Agent ID to score (default: "default")

## Example Output

```
============================= test session starts ==============================
...
collected 42 items

tests/test_agent.py::test_basic PASSED                                   [100%]

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

## License

MIT
