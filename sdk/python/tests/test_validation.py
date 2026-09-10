"""Canonical Python public-validation contract: AUTHORED UNEXECUTED (task10).

These are client/decoder regressions, not signed-runtime or package acceptance.
No CLI discovery, imports of the native runtime, or provider calls at collection.
Install the canonical Python package in the eventual test environment first.
"""
from __future__ import annotations

import copy
import queue
import threading
from dataclasses import FrozenInstanceError
from types import SimpleNamespace

import pytest

import amc_sdk
from amc_sdk import (
    AmcAgent, AmcProtocolError, NativeValidationCheckResult, NativeValidationResult,
    RunResult, SessionUpdate, Turn,
)
from amc_sdk import client


DIGEST = "a" * 64
PIN = "b" * 64
EXTENSION = "dev.agentmaturity.amc"


def check(status="passed", **changes):
    value = {
        "id": "public-check", "title": "Public check", "status": status,
        "callId": "validation-call", "exitCode": 0, "timedOut": False,
        "reason": None, "outputEventId": "output-event",
    }
    if status == "failed":
        value.update(exitCode=2, reason="nonzero-exit")
    elif status == "pending":
        value.update(callId=None, exitCode=None, outputEventId=None)
    elif status == "unavailable":
        value.update(exitCode=None, reason="execution-denied", outputEventId=None)
    value.update(changes)
    return value


def validation(status="passed", **changes):
    value = {"status": status, "turn": 1, "configSha256": DIGEST,
             "checks": [check(status)]}
    if status == "not-requested":
        value.update(turn=None, configSha256=None, checks=[])
    value.update(changes)
    return value


def response(value, stop_reason="end_turn"):
    return {"stopReason": stop_reason, "_meta": {EXTENSION: {"validation": value}}}


def finish(value, stop_reason="end_turn"):
    turn = Turn(SimpleNamespace(_notify=lambda *_args: None), "session-native")
    turn._finish(response(value, stop_reason))
    return turn.result(timeout=0)


class CapturedLaunch(Exception):
    def __init__(self, argv, options):
        self.argv, self.options = argv, options


@pytest.fixture()
def launch(monkeypatch, tmp_path):
    calls = []

    def capture(argv, **options):
        calls.append((argv, options))
        # Intercept before any child or reader/writer thread is started.
        raise CapturedLaunch(argv, options)

    monkeypatch.setattr(client.subprocess, "Popen", capture)

    def construct(**options):
        return AmcAgent(workspace=str(tmp_path), amc_bin=["chosen-amc", "--selected-install"], **options)

    return construct, calls


def test_explicit_options_forward_exactly_once_without_shell_or_implicit_grants(launch):
    construct, calls = launch
    with pytest.raises(CapturedLaunch) as raised:
        construct(tools="workspace", expected_tools_digest=PIN,
                  validation_config="reviewed path/checks.json", validation_config_sha256=DIGEST,
                  validate=["unit", "lint-2"], approve_tools="WRITE_LOW", approve_risk="low",
                  mcp_config="mcp.json", mcp_config_sha256=PIN, max_tokens=64, max_steps=2)
    argv = raised.value.argv
    assert argv[:3] == ["chosen-amc", "--selected-install", "acp"]
    for flag, expected in [
        ("--validation-config", "reviewed path/checks.json"), ("--validation-config-sha256", DIGEST),
        ("--expected-tools-digest", PIN), ("--approve-tools", "WRITE_LOW"), ("--approve-risk", "low"),
        ("--mcp-config", "mcp.json"), ("--mcp-config-sha256", PIN),
        ("--max-tokens", "64"), ("--max-steps", "2"), ("--tools", "workspace"),
    ]:
        assert argv.count(flag) == 1
        assert argv[argv.index(flag) + 1] == expected
    assert argv[-4:] == ["--validate", "unit", "--validate", "lint-2"]
    assert len(calls) == 1
    assert raised.value.options.get("shell", False) is False


def test_legacy_options_do_not_select_checks_or_change_tool_mode(launch):
    construct, _calls = launch
    with pytest.raises(CapturedLaunch) as raised:
        construct()
    argv = raised.value.argv
    assert argv[argv.index("--tools") + 1] == "none"
    assert not any(flag in argv for flag in ["--validate", "--validation-config", "--validation-config-sha256", "--expected-tools-digest", "--approve-tools"])


@pytest.mark.parametrize("options", [
    {"validation_config": ""}, {"validation_config": True}, {"validation_config": []},
    {"validation_config": "checks\0.json"}, {"validation_config": "x" * 4097},
    {"validation_config": "\u00e9" * 2049}, {"validation_config": "\ud800"},
    {"validation_config_sha256": DIGEST},
    {"validation_config": "x", "validation_config_sha256": "A" * 64},
    {"validation_config": "x", "validation_config_sha256": "a" * 63},
    {"validation_config": "x", "validation_config_sha256": DIGEST + "\n"},
    {"validation_config": "x", "validation_config_sha256": True},
    {"validate": ["unit"]}, {"validation_config": "x", "validate": []},
    {"validation_config": "x", "validate": "unit"},
    {"validation_config": "x", "validate": ("unit",)},
    {"validation_config": "x", "validate": ["unit", "unit"]},
    {"validation_config": "x", "validate": [str(i) for i in range(9)]},
    {"validation_config": "x", "validate": [None]},
    {"validation_config": "x", "validate": [{}]},
    {"validation_config": "x", "validate": [True]},
    {"validation_config": "x", "validate": [""]},
    {"validation_config": "x", "validate": ["a" * 65]},
    {"validation_config": "x", "validate": ["unit\n"]},
    {"validation_config": "x", "validate": ["unit; command"]},
    {"validation_config": "x", "validate": ["\u00e9"]},
    {"expected_tools_digest": PIN},
    {"tools": "workspace", "expected_tools_digest": True},
    {"tools": "workspace", "expected_tools_digest": "B" * 64},
    {"tools": "workspace", "expected_tools_digest": "b" * 63},
    {"tools": "workspace", "expected_tools_digest": PIN + "\n"},
])
def test_invalid_public_options_refuse_before_launch(launch, options):
    construct, calls = launch
    with pytest.raises(ValueError):
        construct(**options)
    assert calls == []


def test_option_bounds_and_operator_selection_order_are_preserved(launch):
    construct, _calls = launch
    ids = ["a" * 64, "B_2", "c", "d", "e", "f", "g", "h"]
    with pytest.raises(CapturedLaunch) as raised:
        construct(validation_config="\u00e9" * 2048, validation_config_sha256=DIGEST, validate=ids)
    argv = raised.value.argv
    assert [argv[i + 1] for i, value in enumerate(argv) if value == "--validate"] == ids
    # Explicit check selection never silently enables workspace tools or approvals.
    assert argv[argv.index("--tools") + 1] == "none"
    assert "--approve-tools" not in argv


@pytest.mark.parametrize("options", [
    {"approve_tools": "WRITE_LOW"}, {"approve_risk": "low"},
    {"tools": "workspace", "mcp_config": "reviewed.json"},
    {"max_tokens": True}, {"max_tokens": 0}, {"max_steps": 1025},
])
def test_validation_does_not_bypass_existing_admission_and_budgets(launch, options):
    construct, calls = launch
    with pytest.raises(ValueError):
        construct(validation_config="checks.json", validate=["unit"], **options)
    assert calls == []


@pytest.mark.parametrize("status", ["not-requested", "pending", "passed", "failed", "unavailable"])
@pytest.mark.parametrize("stop_reason", ["end_turn", "max_tokens", "max_turn_requests", "refusal", "cancelled"])
def test_validation_states_are_independent_of_completion_and_verification(status, stop_reason):
    wire = validation(status)
    result = finish(wire, stop_reason)
    assert isinstance(result.validation, NativeValidationResult)
    assert result.validation.status == status
    assert result.validation.turn == wire["turn"]
    assert result.validation.config_sha256 == wire["configSha256"]
    assert result.stop_reason == stop_reason
    assert result.cancelled is (stop_reason == "cancelled")
    assert result.verification == "not-verified"
    assert result.meta[EXTENSION]["validation"] == wire
    if wire["checks"]:
        item = result.validation.checks[0]
        assert isinstance(item, NativeValidationCheckResult)
        assert (item.id, item.title, item.call_id, item.exit_code, item.timed_out, item.reason, item.output_event_id) == (
            "public-check", "Public check", wire["checks"][0]["callId"], wire["checks"][0]["exitCode"],
            False, wire["checks"][0]["reason"], wire["checks"][0]["outputEventId"],
        )


@pytest.mark.parametrize("meta", [None, {}, {"other-vendor": {"passed": True}},
    {EXTENSION: {}}, {EXTENSION: None}, {EXTENSION: []}, {EXTENSION: True}, {EXTENSION: "passed"}])
def test_absent_or_legacy_extension_is_unavailable_never_a_pass(meta):
    turn = Turn(SimpleNamespace(_notify=lambda *_args: None), "legacy")
    value = {"stopReason": "end_turn"}
    if meta is not None:  # Omitted _meta, not an explicitly null _meta.
        value["_meta"] = meta
    turn._finish(value)
    assert turn.result(timeout=0).validation == NativeValidationResult("unavailable", None, None, ())


@pytest.mark.parametrize("value", [None, False, 0, "passed", [], {},
    {"status": "passed"}, validation(status=True), validation(status={}), validation(status="verified"),
    validation(turn=True), validation(turn="1"), validation(turn=0), validation(turn=1.25),
    validation(turn=2**53), validation(turn=float("inf")), validation(turn=float("nan")),
    validation(turn=None), validation(configSha256=None), validation(configSha256="A" * 64),
    validation(configSha256=DIGEST + "\n"), validation(configSha256=False),
    validation(checks=None), validation(checks={}), validation(checks=[]), validation(checks=[None]),
    validation(checks=[check(), check()]), validation(checks=[check(id=str(i)) for i in range(9)]),
    validation(extra=True), validation("not-requested", configSha256=DIGEST),
    validation("not-requested", checks=[check()]),
])
def test_malformed_top_level_metadata_refuses(value):
    with pytest.raises(AmcProtocolError):
        finish(value)


@pytest.mark.parametrize("key", ["status", "turn", "configSha256", "checks"])
def test_every_top_level_field_is_required_even_when_nullable(key):
    value = validation()
    del value[key]
    with pytest.raises(AmcProtocolError):
        finish(value)


@pytest.mark.parametrize("changes", [
    {"id": ""}, {"id": "a" * 65}, {"id": True}, {"id": "unit\n"},
    {"title": ""}, {"title": "\ufeff"}, {"title": " \t"}, {"title": "text\x7f"},
    {"title": "a" * 161}, {"title": "\U0001f600" * 81}, {"title": 1},
    {"status": "not-requested"}, {"status": True}, {"status": []},
    {"callId": None}, {"callId": ""}, {"callId": "x" * 129}, {"callId": False},
    {"exitCode": True}, {"exitCode": "0"}, {"exitCode": 0.5}, {"exitCode": 2**53},
    {"exitCode": None}, {"exitCode": 1}, {"timedOut": 0}, {"timedOut": "false"},
    {"timedOut": True}, {"reason": "nonzero-exit"}, {"reason": False},
    {"outputEventId": None}, {"outputEventId": ""}, {"outputEventId": "\U0001f600" * 65},
    {"outputEventId": False}, {"unknown": "extension"},
])
def test_malformed_check_metadata_refuses_without_coercion(changes):
    with pytest.raises(AmcProtocolError):
        finish(validation(checks=[check(**changes)]))


@pytest.mark.parametrize("key", ["id", "title", "status", "callId", "exitCode", "timedOut", "reason", "outputEventId"])
def test_every_nullable_check_field_is_required_on_the_wire(key):
    item = check()
    del item[key]
    with pytest.raises(AmcProtocolError):
        finish(validation(checks=[item]))


@pytest.mark.parametrize("item", [
    check("failed", exitCode=None), check("failed", exitCode=0), check("failed", timedOut=True),
    check("failed", reason="other"), check("failed", callId=None), check("failed", outputEventId=None),
    check("pending", exitCode=0), check("pending", timedOut=True),
    check("pending", reason="queued"), check("pending", outputEventId="output"),
    check("unavailable", reason=None), check("unavailable", reason=""),
])
def test_negative_status_contracts_refuse(item):
    with pytest.raises(AmcProtocolError):
        finish(validation(item["status"], checks=[item]))


@pytest.mark.parametrize("status,items", [
    ("passed", [check("failed")]), ("failed", [check("passed")]),
    ("unavailable", [check("pending")]), ("failed", [check("unavailable")]),
])
def test_inconsistent_aggregates_refuse(status, items):
    with pytest.raises(AmcProtocolError):
        finish(validation(status, checks=items))


def test_native_aggregate_precedence_and_unfinished_turn_semantics():
    items = [check("unavailable", id="a"), check("pending", id="b"), check("failed", id="c")]
    assert finish(validation("failed", checks=items)).validation.status == "failed"
    assert finish(validation("pending", checks=items)).validation.status == "pending"
    assert finish(validation("pending", checks=items[:2])).validation.status == "pending"
    assert finish(validation("pending", checks=[check()])).validation.status == "pending"
    assert finish(validation("unavailable", checks=[], turn=None, configSha256=None)).validation.checks == ()
    assert finish(validation("unavailable", checks=[])).validation.config_sha256 == DIGEST
    assert finish(validation("not-requested", turn=1)).validation.turn == 1
    bounded = [check(id=str(index)) for index in range(8)]
    assert [item.id for item in finish(validation(checks=bounded)).validation.checks] == [str(index) for index in range(8)]


def test_native_numeric_unicode_and_nullable_wire_semantics():
    item = check(title="\U0001f600" * 80, callId="\U0001f600" * 64, exitCode=0.0)
    result = finish(validation(turn=1.0, checks=[item]))
    assert type(result.validation.turn) is int
    assert type(result.validation.checks[0].exit_code) is int
    # JS trim does not treat U+0085 as whitespace. Nullable short metadata is
    # bounded, but native schema intentionally adds no title-style control ban.
    assert finish(validation(checks=[check(title="\u0085", callId="\0")])).validation.checks[0].call_id == "\0"
    assert finish(validation("failed", checks=[check("failed", exitCode=-(2**53 - 1))])).validation.checks[0].exit_code == -(2**53 - 1)
    assert finish(validation("pending", checks=[check("pending", callId="started")])).validation.checks[0].call_id == "started"
    assert finish(validation("unavailable", checks=[check("unavailable", timedOut=True, reason="deadline-exceeded")])).validation.checks[0].timed_out is True


def test_result_is_detached_immutable_and_preserves_committed_output_and_provenance():
    wire = response(validation())
    wire["_meta"][EXTENSION]["policyDigest"] = PIN
    turn = Turn(SimpleNamespace(_notify=lambda *_args: None), "session-native")
    turn._receive(SessionUpdate("session-native", {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "committed"}}))
    turn._receive(SessionUpdate("session-native", {"sessionUpdate": "tool_call", "toolCallId": "tool-1", "title": "read", "status": "completed"}))
    turn._finish(wire)
    result = turn.result(timeout=0)
    wire["_meta"][EXTENSION]["validation"]["checks"][0]["status"] = "failed"
    assert result.text == "committed"
    assert result.tool_calls[0].tool_call_id == "tool-1"
    assert result.meta[EXTENSION]["policyDigest"] == PIN
    assert result.meta[EXTENSION]["validation"]["checks"][0]["status"] == "passed"
    result.meta[EXTENSION]["validation"]["checks"].clear()
    assert result.validation.checks[0].status == "passed"
    with pytest.raises(FrozenInstanceError):
        result.validation.status = "failed"
    with pytest.raises(FrozenInstanceError):
        result.validation.checks[0].status = "failed"


def test_malformed_metadata_is_rejected_before_removing_pending_request_or_turn():
    agent = AmcAgent.__new__(AmcAgent)
    agent._lock = threading.Lock()
    waiter = queue.Queue(maxsize=1)
    turn = Turn(agent, "session-native")
    agent._replies = {7: waiter}
    agent._request_context = {7: ("session/prompt", "session-native")}
    agent._turns = {"session-native": turn}
    with pytest.raises(AmcProtocolError):
        agent._route({"jsonrpc": "2.0", "id": 7, "result": response(None)})
    assert agent._replies[7] is waiter
    assert agent._request_context[7] == ("session/prompt", "session-native")
    assert agent._turns["session-native"] is turn
    assert not turn._done


@pytest.mark.parametrize("meta", [None, [], False, "metadata"])
def test_explicit_non_object_outer_metadata_refuses(meta):
    turn = Turn(SimpleNamespace(_notify=lambda *_args: None), "session-native")
    with pytest.raises(AmcProtocolError):
        turn._finish({"stopReason": "end_turn", "_meta": meta})


def test_canonical_exports_and_legacy_positional_result_default():
    for name in ["NativeValidationStatus", "NativeValidationCheckStatus", "NativeValidationCheckResult", "NativeValidationResult"]:
        assert name in amc_sdk.__all__
        assert getattr(amc_sdk, name) is getattr(client, name)
    legacy = RunResult("session", "end_turn", "text", [], {}, [], "not-verified")
    assert legacy.validation == NativeValidationResult("unavailable", None, None, ())
    assert copy.deepcopy(legacy) == legacy
