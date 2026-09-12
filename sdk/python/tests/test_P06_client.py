"""P06 canonical Python client regressions — authored, not executed in this task.

The explicit peer exercises subprocess framing/lifecycle only. It is neither an
AMC runtime nor provider, package, signed-evidence or task-success qualification.
Existing installed-runtime/media/validation suites remain separate and unchanged.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path
import queue
import struct
import sys
import threading
import time

import pytest

from amc_sdk import (AmcAgent, AmcError, AmcProtocolError, AmcRefusedError, AmcTimeoutError,
                     NativeAudioInput, NativeImageInput, NativeValidationResult, SessionUpdate, ToolCall, Turn)
from amc_sdk import client


EXT = "dev.agentmaturity.amc"
PEER = Path(__file__).with_name("P06_acp_peer.py").resolve()
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=")
WAV = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", 38, b"WAVE", b"fmt ", 16,
                  1, 1, 8000, 16000, 2, 16, b"data", 2) + b"\0\0"


@pytest.fixture
def peers(tmp_path):
    agents = []

    def make(mode="normal", *, workspace=None, **options):
        root = Path(workspace) if workspace is not None else tmp_path / f"peer-{len(agents)}"
        root.mkdir(parents=True, exist_ok=True)
        capture = root / f"requests-{len(agents)}.jsonl"
        agent = AmcAgent(workspace=str(root), amc_bin=[sys.executable, str(PEER), mode, str(capture)],
                         timeout=5, **options)
        agents.append(agent)

        def records():
            return [json.loads(line) for line in capture.read_text(encoding="utf-8").splitlines()]

        return agent, records

    yield make
    for agent in reversed(agents):
        agent.close()
        assert agent.closed and agent._proc.poll() is not None
        assert not any(thread.is_alive() for thread in (agent._writer, agent._reader, agent._errors))
        assert not agent._replies and not agent._request_context and not agent._request_deadlines
        assert not agent._turns and not agent._sessions and not agent._loading and not agent._resuming
        assert not agent._wait_threads


def requests(records, method):
    return [row for row in records() if row.get("method") == method]


def test_canonical_workspace_alias_and_fixed_root(peers, tmp_path):
    physical = tmp_path / "physical"
    physical.mkdir()
    alias = tmp_path / "alias"
    alias.symlink_to(physical, target_is_directory=True)
    agent, records = peers(workspace=alias)
    assert agent.workspace == str(physical.resolve())
    assert records()[0]["cwd"] == agent.workspace
    session = agent.new_session(cwd=str(alias))
    assert requests(records, "session/new")[0]["params"]["cwd"] == agent.workspace
    with pytest.raises(AttributeError):
        agent.workspace = str(tmp_path)
    with pytest.raises(AmcError, match="workspace is fixed"):
        agent.new_session(cwd=str(tmp_path))
    assert len(requests(records, "session/new")) == 1
    agent.close()
    assert session.state == "closed"
    with pytest.raises(AmcProtocolError, match="closed"):
        session.start_prompt("no new process or session")
    with pytest.raises(AmcProtocolError, match="closed"):
        with agent:
            pytest.fail("closed client entered")


def test_capability_snapshots_cannot_enable_unnegotiated_images(peers):
    agent, records = peers("image-disabled")
    snapshot = agent.capabilities
    snapshot["promptCapabilities"]["image"] = True
    assert agent.capabilities["promptCapabilities"]["image"] is False
    session = agent.new_session()
    with pytest.raises(AmcRefusedError, match="does not advertise image"):
        session.start_prompt("describe", images=[NativeImageInput(PNG, "image/png")])
    assert requests(records, "session/prompt") == []
    assert session.prompt("text still available").verification == "not-verified"


def test_committed_stream_and_complete_detached_tool_snapshots(peers):
    agent, _records = peers()
    turn = agent.new_session().start_prompt("text")
    updates = list(turn)
    result = turn.result(timeout=0)
    assert turn.done and result.text == "committed block" and result.updates == updates
    assert result.verification == "not-verified"
    assert result.validation == NativeValidationResult("not-requested", 1, None, ())
    tool = result.tool_calls[0]
    assert isinstance(tool, ToolCall)
    assert (tool.title, tool.kind, tool.status, tool.output) == ("Read fixture", "read", "completed", "first\nsecond\n")
    assert tool.raw_input == {"path": "fixture"} and tool.raw_output == {"example": True}
    assert len(tool.content) == 3 and tool.content[-1]["type"] == "diff"
    assert tool.meta == {"fixture": {"notEvidence": True}}
    tool.raw_input.clear()
    tool.content[0]["content"]["text"] = "caller edit"
    tool.meta.clear()
    result.meta[EXT]["validation"]["status"] = "passed"
    result.updates.clear()
    snapshot = turn.updates
    snapshot[0].update["content"]["text"] = "caller edit"
    again = turn.result()
    assert again.tool_calls[0].output == "first\nsecond\n"
    assert again.tool_calls[0].raw_input == {"path": "fixture"}
    assert again.tool_calls[0].content[0]["content"]["text"] == "first\n"
    assert again.tool_calls[0].meta == {"fixture": {"notEvidence": True}}
    assert again.meta[EXT]["validation"]["status"] == "not-requested" and again.updates
    assert turn.updates[0].update["content"]["text"] == "committed "
    with pytest.raises(AmcError, match="one update iterator"):
        list(turn)


def test_explicit_empty_tool_content_clears_prior_output(peers):
    agent, _records = peers("clear-tool-content")
    tool = agent.new_session().prompt("text").tool_calls[0]
    assert tool.content == () and tool.output is None
    assert tool.raw_output == {"example": True} and tool.title == "Read fixture"


def test_context_closes_stream_even_when_iterator_is_retained(peers):
    agent, records = peers()
    with agent.new_session().start_prompt("@hold") as turn:
        iterator = iter(turn)
        assert next(iterator).update["content"]["text"] == "committed "
        assert not turn.done
    result = turn.result(timeout=3)
    assert result.cancelled and result.verification == "not-verified"
    iterator.close()
    turn.close()
    assert len(requests(records, "session/cancel")) == 1


def test_iterator_close_requests_cancellation(peers):
    agent, _records = peers()
    turn = agent.new_session().start_prompt("@hold")
    iterator = iter(turn)
    next(iterator)
    iterator.close()
    assert turn.result(timeout=3).cancelled


def test_wait_timeout_is_typed_nonfatal_and_turn_remains_awaitable(peers):
    agent, records = peers()
    turn = agent.new_session().start_prompt("@hold")
    with pytest.raises(AmcTimeoutError) as raised:
        turn.result(timeout=0)
    error = raised.value
    assert isinstance(error, AmcProtocolError) and not error.fatal
    assert error.operation == "turn/result" and error.session_id == turn.session_id
    assert error.cancellation_requested
    assert turn.result(timeout=3).cancelled
    assert len(requests(records, "session/prompt")) == len(requests(records, "session/cancel")) == 1
    assert not agent.closed


def test_stream_wait_timeout_cancels_without_fabricating_completion(peers):
    agent, _records = peers()
    turn = agent.new_session().start_prompt("@hold")
    with pytest.raises(AmcTimeoutError) as raised:
        list(turn.iter_updates(timeout=0))
    assert raised.value.operation == "turn/updates" and not raised.value.fatal
    assert raised.value.cancellation_requested
    assert turn.result(timeout=3).cancelled


@pytest.mark.parametrize("timeout", [True, -1, float("nan"), float("inf"), "1", threading.TIMEOUT_MAX * 2])
def test_invalid_consumer_deadline_never_cancels_work(peers, timeout):
    agent, records = peers()
    turn = agent.new_session().start_prompt("@hold")
    with pytest.raises(ValueError, match="timeout"):
        turn.result(timeout=timeout)
    assert not turn.done and turn.state != "cancel-requested"
    turn.cancel()
    assert turn.result(timeout=3).cancelled
    assert len(requests(records, "session/cancel")) == 1


@pytest.mark.parametrize("modality", ["text", "ordered-image", "ordered-audio"])
def test_all_modalities_use_the_request_deadline_and_do_not_replay(peers, modality):
    agent, records = peers("ignore-cancel")
    session = agent.new_session()
    if modality == "text":
        turn = session.start_prompt("@hold", timeout=0.2)
    elif modality == "ordered-image":
        turn = session.start_prompt_parts(["@hold", NativeImageInput(PNG, "image/png"), ""], timeout=0.2)
    else:
        turn = session.start_prompt_audio_parts([NativeAudioInput(WAV, "audio/wav"), "@hold", "",
                                                NativeImageInput(PNG, "image/png")], timeout=0.2)
    with pytest.raises(AmcTimeoutError) as raised:
        turn.result(timeout=3)
    assert raised.value.fatal and raised.value.operation == "session/prompt"
    assert raised.value.session_id == session.session_id and turn.done
    agent.close()
    # Deadline includes queue time; a frame need not have reached the peer.
    assert len(requests(records, "session/prompt")) <= 1
    with pytest.raises(AmcTimeoutError):
        session.start_prompt("do not replay")


def test_invalid_request_deadline_does_not_claim_the_session(peers):
    agent, records = peers()
    session = agent.new_session()
    for value in (0, -1, True, "1", float("nan")):
        with pytest.raises(ValueError, match="timeout"):
            session.start_prompt("not submitted", timeout=value)
    assert requests(records, "session/prompt") == []
    assert session.prompt("next request").text == "committed block"


def test_refusal_preserves_exact_data_partial_updates_and_next_turn(peers):
    agent, records = peers()
    session = agent.new_session()
    turn = session.start_prompt("@refuse")
    with pytest.raises(AmcRefusedError) as raised:
        turn.result(timeout=3)
    assert raised.value.code == -32602 and raised.value.message == "fixture refusal retained exactly"
    assert raised.value.data == {"reason": "P06_REFUSED"}
    assert turn.updates[0].update["content"]["text"] == "committed "
    assert turn.state == "failed"
    assert session.prompt("next explicit request").verification == "not-verified"
    assert len(requests(records, "session/prompt")) == 2


@pytest.mark.parametrize("mode", ["duplicate-keys", "nonfinite", "deep-json", "unknown-update", "bad-validation", "exit"])
def test_bad_wire_and_process_exit_settle_as_protocol_errors_not_timeout(peers, mode):
    agent, _records = peers(mode)
    turn = agent.new_session().start_prompt("text")
    with pytest.raises(AmcProtocolError) as raised:
        turn.result(timeout=3)
    assert not isinstance(raised.value, AmcTimeoutError)
    assert turn.done and turn.state == "failed"
    agent.close()
    assert agent.closed


@pytest.mark.parametrize("mode", ["image-disabled", "audio-disabled"])
def test_unnegotiated_history_is_not_replayed_or_silently_dropped(peers, mode):
    agent, records = peers(mode)
    with pytest.raises(AmcProtocolError) as raised:
        agent.resume_session("existing-session")
    assert not isinstance(raised.value, AmcTimeoutError)
    agent.close()
    assert requests(records, "session/new") == []
    assert len(requests(records, "session/load")) == 1


def test_ordered_audio_history_and_stale_released_handle_isolation(peers):
    agent, records = peers()
    original = agent.new_session()
    parts = ["before", NativeAudioInput(WAV, "audio/wav"), "", "adjacent",
             NativeImageInput(PNG, "image/png"), "after"]
    result = original.prompt_audio_parts(parts)
    original.release()
    assert original.state == "released"
    resumed = agent.resume_session(original.session_id)
    sent = requests(records, "session/prompt")[0]["params"]
    assert sent["_meta"][EXT]["inputFormat"] == "amc-audio-input@1"
    assert [item.update["content"] for item in resumed.history] == sent["prompt"]
    assert result.verification == "not-verified"
    active = resumed.start_prompt("@hold")
    original.cancel()
    original.release()  # Idempotent: must not release the resumed writer.
    with pytest.raises(AmcError, match="was released"):
        original.start_prompt("stale handle")
    assert active.state != "cancel-requested" and not active.done
    resumed.cancel()
    assert active.result(timeout=3).cancelled
    assert len(requests(records, "_amc/session/release")) == 1
    assert len(requests(records, "session/cancel")) == 1


def test_duplicate_session_identity_fails_before_registering_a_new_handle(peers):
    agent, _records = peers("duplicate-session")
    agent.new_session()
    with pytest.raises(AmcProtocolError) as raised:
        agent.new_session()
    assert not isinstance(raised.value, AmcTimeoutError)
    agent.close()


def bare_agent():
    """Exercise the actual gate/decoder without starting a process for unit races."""
    agent = AmcAgent.__new__(AmcAgent)
    agent._lock = threading.RLock()
    agent._fatal = None
    agent._closing = agent._close_started = False
    agent._writes = queue.Queue(maxsize=client.MAX_PENDING)
    agent._replies = {}
    agent._request_context = {}
    agent._request_deadlines = {}
    agent._turns = {}
    return agent


def test_cancel_is_bound_to_exact_turn_not_just_session_id():
    agent = bare_agent()
    old, current = Turn(agent, "same-session"), Turn(agent, "same-session")
    agent._turns["same-session"] = current
    old.cancel()
    assert agent._writes.empty() and old.state == "submitted"
    current.cancel()
    current.cancel()
    assert agent._writes.qsize() == 1
    frame = json.loads(agent._writes.get_nowait())
    assert frame == {"jsonrpc": "2.0", "method": "session/cancel", "params": {"sessionId": "same-session"}}


def test_keyboard_interrupt_preserves_exception_and_requests_cancel(monkeypatch):
    agent = bare_agent()
    turn = Turn(agent, "session")
    agent._turns["session"] = turn
    interruption = KeyboardInterrupt("caller interrupted")

    def interrupt(*_args, **_kwargs):
        raise interruption

    monkeypatch.setattr(turn._condition, "wait_for", interrupt)
    with pytest.raises(KeyboardInterrupt) as raised:
        turn.result()
    assert raised.value is interruption and turn.state == "cancel-requested"
    assert json.loads(agent._writes.get_nowait())["method"] == "session/cancel"


def test_explicit_iterator_close_does_not_hide_cancel_enqueue_failure():
    agent = bare_agent()
    turn = Turn(agent, "session")
    agent._turns["session"] = turn
    turn._receive(SessionUpdate("session", {"sessionUpdate": "agent_message_chunk",
                                           "content": {"type": "text", "text": "committed"}}))
    iterator = iter(turn)
    next(iterator)
    for _ in range(client.MAX_PENDING):
        agent._writes.put_nowait(b"pending\n")
    with pytest.raises(AmcProtocolError, match="queue is full"):
        iterator.close()
    assert not turn.done and not turn._cancel_requested


def test_completion_settles_turn_before_opening_its_slot(monkeypatch):
    agent = bare_agent()
    turn = Turn(agent, "session")
    waiter = queue.Queue(maxsize=1)
    agent._turns["session"] = turn
    agent._replies[7] = waiter
    agent._request_context[7] = ("session/prompt", "session")
    original = turn._finish

    def finish(value):
        assert agent._turns.get("session") is turn
        original(value)

    monkeypatch.setattr(turn, "_finish", finish)
    frame = {"jsonrpc": "2.0", "id": 7, "result": {"stopReason": "end_turn"}}
    agent._route(frame)
    assert turn.done and "session" not in agent._turns
    assert waiter.get_nowait() == frame
    turn.cancel()
    assert agent._writes.empty()


def test_late_waiter_uses_queued_reply_not_a_fresh_deadline():
    agent = bare_agent()
    waiter = queue.Queue(maxsize=1)
    waiter.put_nowait({"jsonrpc": "2.0", "id": 7, "result": {"sessionId": "already-returned"}})
    agent._request_deadlines[7] = time.monotonic() - 1
    assert agent._wait_call("session/new", 7, waiter) == {"sessionId": "already-returned"}
    assert agent._request_deadlines == {} and agent._fatal is None


def test_interrupted_lifecycle_waiter_fails_transport_without_masking_interrupt(monkeypatch):
    agent = bare_agent()
    waiter = queue.Queue(maxsize=1)
    agent._request_deadlines[7] = time.monotonic() + 5
    agent._replies[7] = waiter
    agent._request_context[7] = ("session/load", "session")
    interruption = KeyboardInterrupt("caller interrupted load")
    failures = []

    def interrupt(*_args, **_kwargs):
        raise interruption

    monkeypatch.setattr(waiter, "get", interrupt)
    monkeypatch.setattr(agent, "_fail", failures.append)
    with pytest.raises(KeyboardInterrupt) as raised:
        agent._wait_call("session/load", 7, waiter)
    assert raised.value is interruption
    assert len(failures) == 1 and isinstance(failures[0], AmcProtocolError)
    assert "session/load was interrupted" in str(failures[0])
    assert not agent._replies and not agent._request_context and not agent._request_deadlines


def test_shutdown_intake_gate_does_not_admit_another_request():
    agent = bare_agent()
    agent._close_started = True
    agent.timeout = 5
    with pytest.raises(AmcProtocolError, match="closed"):
        agent._begin_call("session/new", {"cwd": ".", "mcpServers": []})
    assert agent._writes.empty() and not agent._replies


class CapturedLaunch(Exception):
    def __init__(self, argv, options):
        self.argv, self.options = argv, options


def test_launch_parity_for_native_provider_controls_and_signed_approvals(monkeypatch, tmp_path):
    def capture(argv, **options):
        raise CapturedLaunch(argv, options)

    monkeypatch.setattr(client.subprocess, "Popen", capture)
    with pytest.raises(CapturedLaunch) as raised:
        AmcAgent(workspace=str(tmp_path), amc_bin=["selected-amc"], provider="deepseek", model="explicit-model",
                 credentials_mode="operator-only", thinking="enabled", reasoning_effort="max",
                 tools="workspace", approve_tools="WRITE_LOW", approve_risk="low")
    argv = raised.value.argv
    for flag, value in (("--credentials-mode", "operator-only"), ("--thinking", "enabled"),
                        ("--reasoning-effort", "max"), ("--approve-tools", "WRITE_LOW"), ("--approve-risk", "low")):
        assert argv.count(flag) == 1 and argv[argv.index(flag) + 1] == value
    assert raised.value.options.get("shell", False) is False


@pytest.mark.parametrize("options", [
    {"timeout": True}, {"timeout": float("inf")}, {"timeout": "1"},
    {"amc_bin": []}, {"amc_bin": ""}, {"amc_bin": ["amc\0"]}, {"amc_bin": 42},
    {"tools": []}, {"tools": "workspace", "approve_tools": "ALL"},
    {"tools": "workspace", "approve_tools": "WRITE_LOW", "approve_risk": []},
    {"tools": "workspace", "approve_tools": "WRITE_LOW", "mcp_config": "reviewed.json", "mcp_config_sha256": True},
    {"credentials_mode": "automatic"}, {"provider": "stub", "thinking": "enabled"},
    {"provider": "deepseek", "thinking": "disabled", "reasoning_effort": "high"},
    {"provider": "deepseek", "reasoning_effort": "medium"}, {"provider": "deepseek", "thinking": "auto"},
    {"provider": "bad\0provider"}, {"agent_id": ""}, {"env": {"bad=name": "value"}}, {"env": {"NAME": None}},
])
def test_invalid_launch_options_refuse_before_any_child(monkeypatch, tmp_path, options):
    def forbidden(*_args, **_kwargs):
        pytest.fail("invalid options reached subprocess launch")

    monkeypatch.setattr(client.subprocess, "Popen", forbidden)
    agent_options = {"workspace": str(tmp_path), "amc_bin": ["selected-amc"], **options}
    with pytest.raises(ValueError):
        AmcAgent(**agent_options)
