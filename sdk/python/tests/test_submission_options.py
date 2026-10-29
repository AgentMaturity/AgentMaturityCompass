"""PXB-24/25 SDK transport wiring; native inbox tests own durable deduplication."""
from pathlib import Path
import sys

import pytest

from amc_sdk import AmcAgent, AmcRefusedError, AmcProtocolError


@pytest.fixture
def peer(tmp_path):
    agents = []
    def start(mode="request-ids"):
        agent = AmcAgent(str(tmp_path), provider="stub", timeout=5,
                         amc_bin=[sys.executable, str(Path(__file__).with_name("P06_acp_peer.py")), mode, str(tmp_path / "requests.jsonl")])
        agents.append(agent)
        return agent
    yield start
    for agent in agents:
        agent.close()


def test_forwards_request_identity_and_withdraws_one_message(peer):
    session = peer().new_session()
    result = session.prompt("retry-safe input", client_request_id="request-1")
    assert result.meta["dev.agentmaturity.amc"]["clientRequestId"] == "request-1"
    assert session.withdraw("message-1") is True


def test_unsupported_runtime_is_refused_before_submission(peer):
    session = peer("no-request-ids").new_session()
    with pytest.raises(AmcRefusedError):
        session.prompt("must not send", client_request_id="request-1")
    with pytest.raises(AmcRefusedError):
        session.withdraw("message-1")


@pytest.mark.parametrize("client_request_id", ["", "has space", "line\nfeed", "x" * 129, "非ASCII"])
def test_bad_request_identity_is_refused_before_submission(peer, client_request_id):
    with pytest.raises(ValueError):
        peer().new_session().prompt("must not send", client_request_id=client_request_id)


@pytest.mark.parametrize("message_id", ["", "has space", "x" * 129, "非ASCII"])
def test_bad_withdrawal_identity_is_refused(peer, message_id):
    with pytest.raises(ValueError):
        peer().new_session().withdraw(message_id)


def test_bad_withdrawal_response_is_refused(peer):
    with pytest.raises(AmcProtocolError):
        peer("bad-withdraw").new_session().withdraw("message-1")


@pytest.mark.parametrize("options", [
    {"resync_on_overflow": "true"}, {"event_buffer": []}, {"event_buffer": {"invented": 2}},
    {"event_buffer": {"max_events": 0}}, {"event_buffer": {"max_events": 32769}}, {"event_buffer": {"max_bytes": True}},
])
def test_bad_recovery_options_fail_before_process_launch(tmp_path, options):
    with pytest.raises(ValueError):
        AmcAgent(str(tmp_path), provider="stub", amc_bin=["must-not-run"], **options)


def test_live_plans_require_negotiation_by_both_peers(peer):
    with pytest.raises(AmcProtocolError):
        peer("no-plan-cap").new_session().prompt("unnegotiated plan")


def test_negotiated_live_plan_remains_explicit_display_data(peer):
    result = peer("live-plan").new_session().prompt("plan")
    assert result.updates[0].update["sessionUpdate"] == "plan"
