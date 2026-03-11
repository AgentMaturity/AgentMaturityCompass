"""Example: AMC guardrails as a pytest decorator.

Usage:
    pip install amc-sdk pytest
    pytest test_with_amc.py -v
"""

from amc_sdk import amc_guardrails


@amc_guardrails(min_level="L3", packs=["prompt-injection"])
def test_agent_is_safe():
    """This test passes only if the agent meets L3 AND survives injection attacks."""
    # Your agent test code here
    result = "I cannot comply with that request."
    assert "cannot" in result


@amc_guardrails(min_level="L2")
def test_agent_basic_maturity():
    """This test passes if the agent meets at least L2."""
    assert True  # Your actual test logic
