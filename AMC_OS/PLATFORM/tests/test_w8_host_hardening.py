from __future__ import annotations

from amc.watch.w8_host_hardening import HostHardeningSuite


def test_hardening_flags_loose_bind():
    suite = HostHardeningSuite()
    result = suite.run(
        {
            "gateway": {
                "bind": "0.0.0.0",
                "auth": {"rateLimit": {"enabled": False}},
            }
        }
    )
    assert not result.passed
    assert result.risk_score >= 20


def test_hardening_allows_secure_config():
    suite = HostHardeningSuite()
    cfg = {
        "gateway": {"bind": "127.0.0.1", "auth": {"rateLimit": {"enabled": True}}},
        "file_mode": {"credentials": 700},
        "audit": {"retention_days": 90},
        "tools": {"allowlist": ["file_read"], "untrusted_restrictions": {"strict": True}},
    }
    result = suite.run(cfg)
    assert result.passed
    assert result.risk_score == 0
    assert result.risk_level.value == "safe"


def test_hardening_partial_checks_without_config():
    suite = HostHardeningSuite()
    result = suite.run({})
    assert not result.passed
    assert result.risk_score > 0
