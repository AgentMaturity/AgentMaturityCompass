"""Installed canonical consumer regressions: AUTHORED UNEXECUTED (task10).

The isolated consumer must import an actual installed wheel, never the checkout
or an editable install. Scripted ACP peers test wire behavior, not native trust.
An optional pre-provisioned native lane uses the real explicit installed CLI;
this file never builds/installs, initializes/signs a workspace, or starts a provider.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

import pytest


EXTENSION = "dev.agentmaturity.amc"
DIGEST = "a" * 64
PIN = "b" * 64

# A deliberately untrusted wire peer, not a substitute AMC implementation.
PEER = r'''
import json
import sys
from pathlib import Path
case = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
Path(sys.argv[2]).write_text(json.dumps(sys.argv[3:]), encoding="utf-8")
for line in sys.stdin:
    request = json.loads(line)
    if "id" not in request:
        continue
    method = request["method"]
    if method == "initialize":
        result = {"protocolVersion": 1, "agentCapabilities": {"loadSession": False}, "agentInfo": {"name": "untrusted-fixture"}}
    elif method == "session/new":
        result = {"sessionId": "fixture-session"}
    elif method == "session/prompt":
        print(json.dumps({"jsonrpc": "2.0", "method": "session/update", "params": {
            "sessionId": "fixture-session", "update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "committed fixture block"}}
        }}), flush=True)
        result = case["response"]
    else:
        raise RuntimeError("unexpected fixture request")
    print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)
'''

CONSUMER = r'''
import hashlib
import json
from dataclasses import asdict
from pathlib import Path
import sys
import sysconfig
import amc_sdk
from amc_sdk import AmcAgent, AmcProtocolError, NativeValidationResult
from amc_sdk import client

assert sys.flags.isolated == 1
site = Path(sysconfig.get_path("purelib")).resolve()
expected = json.loads(sys.argv[4])
for name, module in [("__init__.py", amc_sdk), ("client.py", client)]:
    installed = Path(module.__file__).resolve()
    assert installed.is_relative_to(site), "consumer imported source/editable code instead of the installed wheel"
    assert hashlib.sha256(installed.read_bytes()).hexdigest() == expected[name], "wheel does not match the candidate Python source"
for name in ["NativeValidationStatus", "NativeValidationCheckStatus", "NativeValidationCheckResult", "NativeValidationResult"]:
    assert name in amc_sdk.__all__ and getattr(amc_sdk, name) is getattr(client, name)

case = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
command = case.get("native_command") or [sys.executable, "-I", sys.argv[1], sys.argv[2], sys.argv[3]]
options = {"provider": "stub", "timeout": 8, **case.get("options", {})}
agent = AmcAgent(workspace=case.get("workspace", str(Path.cwd())), amc_bin=command, **options)
try:
    with agent:
        session = agent.new_session()
        result = session.prompt(case.get("prompt", "Local validation contract fixture."))
        assert not case.get("expect_protocol_error", False), "invalid validation metadata was accepted"
        assert isinstance(result.validation, NativeValidationResult)
        assert result.verification == "not-verified", "peer outcome was promoted to verification"
        report = {"outcome": "result", "stop_reason": result.stop_reason,
                  "text": result.text,
                  "validation": asdict(result.validation), "verification": result.verification,
                  "meta": result.meta, "session_id": result.session_id}
except AmcProtocolError as error:
    assert case.get("expect_protocol_error", False), "unexpected client protocol failure"
    assert str(error) == "native agent emitted an invalid or uncorrelated protocol frame", "a timeout/cleanup failure is not the expected malformed-wire refusal"
    report = {"outcome": "protocol-refused"}
finally:
    agent.close()
assert agent._proc.poll() is not None and agent._closed.is_set(), "owned ACP child was not reaped"
assert not any(thread.is_alive() for thread in [agent._writer, agent._reader, agent._errors]), "owned transport thread leaked"
assert not agent._replies and not agent._request_context, "pending request was stranded"
report["closed"] = True
report["installed_package"] = str(Path(amc_sdk.__file__).resolve())
print(json.dumps(report))
'''


def wire(status):
    value = {"status": status, "turn": 1, "configSha256": DIGEST, "checks": []}
    if status == "not-requested":
        value.update(turn=None, configSha256=None)
    else:
        item = {"id": "unit", "title": "Unit check", "status": status,
                "callId": "validation-unit", "exitCode": 0, "timedOut": False,
                "reason": None, "outputEventId": "event-unit"}
        if status == "failed":
            item.update(exitCode=2, reason="nonzero-exit")
        elif status == "pending":
            item.update(callId=None, exitCode=None, outputEventId=None)
        elif status == "unavailable":
            item.update(exitCode=None, timedOut=True, reason="deadline-exceeded", outputEventId=None)
        value["checks"] = [item]
    return value


def run_consumer(tmp_path, case):
    if os.name != "posix":
        pytest.skip("installed fixture supervision requires POSIX process groups; other platform qualification is separate")
    interpreter = os.environ.get("AMC_PYTHON_INSTALLED", sys.executable)
    assert Path(interpreter).is_absolute(), "select the installed wheel's absolute Python interpreter"
    source = Path(__file__).resolve().parents[1] / "amc_sdk"
    expected = {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                for name in ["__init__.py", "client.py"]}
    peer, case_path, argv_path = tmp_path / "peer.py", tmp_path / "case.json", tmp_path / "argv.json"
    peer.write_text(PEER, encoding="utf-8")
    case_path.write_text(json.dumps(case), encoding="utf-8")
    with subprocess.Popen(
        [interpreter, "-I", "-c", CONSUMER, str(peer), str(case_path), str(argv_path), json.dumps(expected)],
        cwd=tmp_path, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True,
    ) as process:
        try:
            stdout, stderr = process.communicate(timeout=45)
            try:
                os.killpg(process.pid, 0)
            except ProcessLookupError:
                pass
            else:
                raise AssertionError("consumer exited but its owned process group still exists")
        except BaseException:
            # Only this newly-created group; a forced cleanup remains a failure,
            # not the malformed-wire outcome or a native acceptance result.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.communicate(timeout=5)
            raise
    assert process.returncode == 0, stderr
    report = json.loads(stdout)
    assert report["closed"] is True
    return report, json.loads(argv_path.read_text()) if argv_path.exists() else None


@pytest.mark.parametrize("status", ["not-requested", "pending", "passed", "failed", "unavailable"])
def test_installed_wheel_decodes_public_states_and_preserves_explicit_argv(tmp_path, status):
    result = {"stopReason": "end_turn", "_meta": {EXTENSION: {"validation": wire(status)}}}
    report, argv = run_consumer(tmp_path, {"response": result, "options": {
        "tools": "workspace", "expected_tools_digest": PIN, "validation_config": "reviewed checks.json",
        "validation_config_sha256": DIGEST, "validate": ["unit", "lint"],
        "approve_tools": "WRITE_LOW", "approve_risk": "low", "max_tokens": 64, "max_steps": 2,
    }})
    assert report["outcome"] == "result"
    assert report["validation"]["status"] == status
    assert report["meta"] == result["_meta"]
    assert report["stop_reason"] == "end_turn"
    assert report["text"] == "committed fixture block"
    assert report["verification"] == "not-verified"
    assert argv[0] == "acp"
    for flag, value in [("--validation-config", "reviewed checks.json"), ("--validation-config-sha256", DIGEST),
                        ("--expected-tools-digest", PIN), ("--approve-tools", "WRITE_LOW"), ("--approve-risk", "low")]:
        assert argv.count(flag) == 1 and argv[argv.index(flag) + 1] == value
    assert argv[-4:] == ["--validate", "unit", "--validate", "lint"]
    # This is an untrusted wire fixture. Even a structurally valid check list
    # differing from our requested IDs is only reported, never authenticated.


@pytest.mark.parametrize("result", [
    {"stopReason": "end_turn"}, {"stopReason": "end_turn", "_meta": {}},
    {"stopReason": "end_turn", "_meta": {EXTENSION: False}},
    {"stopReason": "cancelled", "_meta": {EXTENSION: {"validation": {"status": "unavailable", "turn": None, "configSha256": None, "checks": []}}}},
])
def test_installed_legacy_and_cancelled_metadata_never_infer_a_pass(tmp_path, result):
    report, argv = run_consumer(tmp_path, {"response": result})
    assert report["validation"] == {"status": "unavailable", "turn": None, "config_sha256": None, "checks": []}
    assert report["stop_reason"] == result["stopReason"]
    assert "--validate" not in argv and "--expected-tools-digest" not in argv


@pytest.mark.parametrize("invalid", [None, True, {}, {"status": "passed"},
    {**wire("passed"), "turn": True}, {**wire("passed"), "configSha256": "A" * 64},
    {**wire("passed"), "checks": [{**wire("passed")["checks"][0], "timedOut": "false"}]},
    {**wire("passed"), "checks": [{**wire("passed")["checks"][0], "exitCode": False}]},
    {**wire("passed"), "checks": [{**wire("passed")["checks"][0], "outputEventId": None}]},
    {**wire("passed"), "checks": wire("failed")["checks"]},
    {**wire("passed"), "checks": wire("passed")["checks"] * 2},
    {**wire("passed"), "extra": True},
])
def test_installed_malformed_wire_refuses_settles_waiters_and_reaps_child(tmp_path, invalid):
    report, _argv = run_consumer(tmp_path, {"expect_protocol_error": True,
        "response": {"stopReason": "end_turn", "_meta": {EXTENSION: {"validation": invalid}}}})
    assert report["outcome"] == "protocol-refused"


def test_installed_real_native_preprovisioned_validation_contract(tmp_path):
    """Opt-in native lane; setup/signing and cold verification are separate gates.

    AMC_PYTHON_NATIVE_VALIDATION_FIXTURES names {"cases": [...]} where each case
    supplies an absolute native_command argv, a disposable already-initialized
    workspace, options with tools/workspace and reviewed config+policy pins,
    expected_status and expected_checks [[id, status], ...]. Include genuinely
    passing, nonzero and unavailable fixtures; no runtime/config discovery here.
    """
    manifest = os.environ.get("AMC_PYTHON_NATIVE_VALIDATION_FIXTURES")
    if manifest is None:
        pytest.skip("native signed fixtures not supplied; wire checks do not replace installed native acceptance")
    data = json.loads(Path(manifest).read_text(encoding="utf-8"))
    cases = data["cases"]
    assert isinstance(cases, list) and 3 <= len(cases) <= 8
    assert {case["expected_status"] for case in cases} >= {"passed", "failed", "unavailable"}
    repo = Path(__file__).resolve().parents[3]
    for index, case in enumerate(cases):
        command, workspace, options = case["native_command"], Path(case["workspace"]), case["options"]
        assert isinstance(command, list) and command and all(isinstance(arg, str) and arg for arg in command)
        assert Path(command[0]).is_absolute() and Path(command[0]).is_file()
        assert workspace.is_absolute() and workspace.is_dir() and workspace.resolve() != repo
        assert (workspace / ".amc").is_dir(), "fixture must be provisioned independently, never initialized by this test"
        assert options.get("provider", "stub") == "stub", "this lane is not real-provider qualification"
        assert options["tools"] == "workspace" and options["expected_tools_digest"]
        assert options["validation_config"] and options["validation_config_sha256"] and options["validate"]
        assert not case.get("expect_protocol_error", False)
        case_dir = tmp_path / str(index)
        case_dir.mkdir()
        report, argv = run_consumer(case_dir, case)
        assert argv is None, "native lane unexpectedly used the scripted peer"
        assert report["outcome"] == "result" and report["verification"] == "not-verified"
        assert report["validation"]["status"] == case["expected_status"]
        assert report["validation"]["config_sha256"] == options["validation_config_sha256"]
        checks = report["validation"]["checks"]
        assert [item["id"] for item in checks] == options["validate"]
        assert [[item["id"], item["status"]] for item in checks] == case["expected_checks"]
        assert report["validation"]["turn"] >= 1
