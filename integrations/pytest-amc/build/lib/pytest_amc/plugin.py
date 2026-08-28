"""pytest plugin for AMC scoring and threshold gates"""
import json
import subprocess
import sys
from pathlib import Path
from typing import Optional

import pytest


def pytest_addoption(parser):
    """Add AMC-specific command line options"""
    group = parser.getgroup("amc", "Agent Maturity Compass")
    group.addoption(
        "--amc-score",
        action="store_true",
        default=False,
        help="Run AMC scoring after tests",
    )
    group.addoption(
        "--amc-min-level",
        type=int,
        default=0,
        help="Minimum AMC level required (0-5). Fails if score is below this level.",
    )
    group.addoption(
        "--amc-agent-id",
        type=str,
        default="default",
        help="Agent ID to score",
    )
    group.addoption(
        "--amc-fail-below",
        action="store_true",
        default=False,
        help="Fail the test run if AMC score is below minimum level",
    )


class AMCPlugin:
    """Plugin to run AMC scoring after pytest completes"""

    def __init__(self, config):
        self.config = config
        self.amc_enabled = config.getoption("--amc-score")
        self.min_level = config.getoption("--amc-min-level")
        self.agent_id = config.getoption("--amc-agent-id")
        self.fail_below = config.getoption("--amc-fail-below")
        self.amc_result = None

    def pytest_sessionfinish(self, session, exitstatus):
        """Run AMC scoring after all tests complete"""
        if not self.amc_enabled:
            return

        try:
            # Run AMC quickscore
            result = subprocess.run(
                ["amc", "quickscore", "--json", "--agent", self.agent_id],
                capture_output=True,
                text=True,
                check=False,
            )

            if result.returncode != 0:
                print(f"\n⚠️  AMC scoring failed: {result.stderr}", file=sys.stderr)
                return

            self.amc_result = json.loads(result.stdout)
            score = self.amc_result.get("score", 0)
            level_str = self.amc_result.get("level", "L0")
            level_num = int(level_str.replace("L", ""))

            # Print results
            print(f"\n{'='*60}")
            print(f"🧭 AMC Score: {score:.2f} ({level_str})")
            print(f"{'='*60}")

            dimensions = self.amc_result.get("dimensions", {})
            if dimensions:
                print("\nDimension Scores:")
                for dim_name, dim_data in dimensions.items():
                    dim_score = dim_data.get("score", 0)
                    dim_level = dim_data.get("level", "L0")
                    print(f"  • {dim_name}: {dim_score:.2f} ({dim_level})")

            # Check threshold
            if self.fail_below and level_num < self.min_level:
                print(f"\n❌ AMC score {level_str} is below minimum L{self.min_level}")
                print(f"{'='*60}\n")
                session.exitstatus = 1
            elif self.min_level > 0:
                print(f"\n✅ AMC score {level_str} meets minimum L{self.min_level}")
                print(f"{'='*60}\n")
            else:
                print(f"{'='*60}\n")

        except FileNotFoundError:
            print("\n⚠️  AMC CLI not found. Install with: npm i -g agent-maturity-compass", file=sys.stderr)
        except json.JSONDecodeError as e:
            print(f"\n⚠️  Failed to parse AMC output: {e}", file=sys.stderr)
        except Exception as e:
            print(f"\n⚠️  AMC scoring error: {e}", file=sys.stderr)


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config):
    """Register the AMC plugin"""
    if config.getoption("--amc-score"):
        plugin = AMCPlugin(config)
        config.pluginmanager.register(plugin, "amc_plugin")
