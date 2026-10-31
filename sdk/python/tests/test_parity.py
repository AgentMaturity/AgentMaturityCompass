"""P2-13 execution API parity: the scripted scenario, driven through the Python wrapper.

The same scenario tests/executionApiParity.test.ts drives through the CLI, the TypeScript SDK and Studio: start, a first
turn whose fs.read call waits for a signed WRITE_HIGH approval (the run's initiator is refused; two other reviewers
approve), the streamed updates, dispose, resume of the same session, a lineage fork whose turn is cancelled while it
waits for its approval, cold verification of the parent, and a fork of the parent once tampered. Stub provider only: a synthetic demonstration, never a
real-model result.

Two ways to run it:
  - spawned by the TypeScript parity test with AMC_PARITY_WORKSPACE and AMC_PARITY_OUT set: it drives the workspace the
    test prepared and writes the normalized record for comparison;
  - as an ordinary pytest test (the python-sdk CI lane) with AMC_BIN naming the built CLI: it prepares its own workspace
    with `amc init --regulated` and checks the record against EXPECTED.
"""
from __future__ import annotations

import json
import os
import pwd
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pytest

from amc_sdk import EXECUTION_VERBS, AmcAgent, AmcRefusedError

READ = json.dumps({"tool": "fs.read", "arguments": {"path": "workspace/n.txt"}})
REVIEWERS = ("parity-reviewer-1", "parity-reviewer-2")


def _phases(model: str, evidence: str) -> dict[str, str]:
    return {"admission": "succeeded", "model-completion": model, "side-effect-completion": "succeeded", "evidence-verification": evidence}


#: The normalized record every surface must produce (tests/executionApiParity.test.ts holds the same value).
EXPECTED = {
    "verbs": sorted(EXECUTION_VERBS),
    "initiatorApproval": "refused",
    "streamed": True,
    "toolCalled": True,
    "approvedTurn": _phases("succeeded", "pending"),
    "cancelledTurn": _phases("failed", "pending"),
    "resumedSameSession": True,
    "verified": _phases("succeeded", "succeeded"),
    "receiptStates": [],
    "recheckFailures": [],
    "tamperedParentFork": "TAMPERED",
}


def _pending(agent: AmcAgent, exclude: set[str]) -> str:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        for approval in agent.pending_approvals():
            if approval.approval_request_id not in exclude:
                return approval.approval_request_id
        time.sleep(0.1)
    raise AssertionError("no pending approval was raised")


def tamper(workspace: str, session_id: str) -> None:
    """A hostile owner rewriting one of the session's signed rows beneath the storage triggers."""
    db = sqlite3.connect(os.path.join(workspace, ".amc", "evidence.sqlite"))
    try:
        for trigger in ("protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"):
            db.execute(f"DROP TRIGGER IF EXISTS {trigger}")
        db.execute("UPDATE evidence_events SET payload_sha256 = ? WHERE id = (SELECT id FROM evidence_events WHERE session_id = ? "
                   "ORDER BY rowid LIMIT 1 OFFSET 1)", ("0" * 64, session_id))
        db.commit()
    finally:
        db.close()


def run_scenario(workspace: str, amc_bin: list[str], env: dict[str, str]) -> dict:
    initiator = pwd.getpwuid(os.getuid()).pw_name
    options = {"provider": "stub", "tools": "workspace", "approve_tools": "WRITE_HIGH", "amc_bin": amc_bin, "env": env, "timeout": 120}
    verbs: set[str] = set()
    record: dict = {}
    agent = AmcAgent(workspace, **options)
    session = agent.new_session()
    verbs.add("start")
    turn = session.start_prompt(READ)
    first = _pending(agent, set())
    try:
        agent.approve(first, reason="parity: the initiator", username=initiator, roles=["APPROVER"])
        record["initiatorApproval"] = "accepted"
    except AmcRefusedError:
        record["initiatorApproval"] = "refused"
    for reviewer in REVIEWERS:
        agent.approve(first, reason="parity fixture reviewer, not a human decision", username=reviewer, roles=["APPROVER"])
    verbs.add("approve")
    approved = turn.result()
    record["streamed"] = any(True for _ in turn.iter_updates())
    record["toolCalled"] = len(approved.tool_calls) > 0
    verbs.add("stream")
    record["approvedTurn"] = approved.execution.phases
    record["receiptStates"] = list(approved.execution.receipt_states)
    record["recheckFailures"] = list(approved.execution.recheck_failures)

    agent.dispose()
    verbs.add("dispose")

    agent = AmcAgent(workspace, **options)
    resumed = agent.resume_session(session.session_id)
    record["resumedSameSession"] = resumed.session_id == session.session_id
    verbs.add("resume")
    resumed.prompt("hello")
    child = agent.fork_session(session.session_id)
    verbs.add("fork")
    # The stub asks for a tool only while its session holds no tool result, so the fork (no inherited context) asks again.
    second = child.start_prompt(READ)
    _pending(agent, {first})
    second.cancel()
    record["cancelledTurn"] = second.result().execution.phases
    verbs.add("cancel")
    agent.close()
    record["verified"] = agent.verify_session(session.session_id).execution.phases
    verbs.add("verify")

    tamper(workspace, session.session_id)
    forker = AmcAgent(workspace, **options)
    try:
        forker.fork_session(session.session_id)
        record["tamperedParentFork"] = "accepted"
    except AmcRefusedError as error:
        record["tamperedParentFork"] = (error.data or {}).get("reason")
    finally:
        forker.close()
    return {**record, "verbs": sorted(verbs), "ids": {"parent": session.session_id, "child": child.session_id}}


#: A consequential call the signed run purpose does not allow (P2-02): refused at authorization, before any network.
PURPOSE_CALL = json.dumps({"tool": "web_fetch", "arguments": {"url": "https://docs.example.org/"}})


def _status(execution) -> dict:
    return {"phases": execution.phases, "receiptStates": list(execution.receipt_states), "recheckFailures": list(execution.recheck_failures)}


def run_purpose(workspace: str, amc_bin: list[str], env: dict[str, str]) -> dict:
    """The authorization step's typed failure as this surface reports it, after the turn and after verification."""
    agent = AmcAgent(workspace, provider="stub", tools="workspace", amc_bin=amc_bin, env=env, timeout=120)
    session = agent.new_session()
    turn = _status(session.prompt(PURPOSE_CALL).execution)
    agent.close()
    return {"turn": turn, "verified": _status(agent.verify_session(session.session_id).execution)}


def _amc_bin() -> list[str] | None:
    explicit = os.environ.get("AMC_BIN")
    if not explicit:
        return None
    return ["node", explicit] if explicit.endswith(".js") else [explicit]


def _regulated_workspace(amc_bin: list[str]) -> tuple[str, dict[str, str]]:
    root = tempfile.mkdtemp(prefix="amc-parity-py-")
    workspace, home = os.path.join(root, "workspace"), os.path.join(root, "home")
    os.makedirs(workspace)
    os.makedirs(home, mode=0o700)
    env = {"AMC_HOME": home, "AMC_VAULT_PASSPHRASE": "parity-python-fixture-passphrase", "AMC_CONTROL_CHECKPOINT_DIR": os.path.join(root, "checkpoints"),
           "AMC_BOOTSTRAP_OWNER_USERNAME": "parity-owner", "AMC_BOOTSTRAP_OWNER_PASSWORD": "parity-owner-password"}
    started = subprocess.run([*amc_bin, "init", "--regulated"], cwd=workspace, env={**os.environ, **env}, capture_output=True, text=True, check=False)
    assert started.returncode == 0, started.stderr
    fingerprint = re.search(r"AMC_EXPECTED_MONITOR_FINGERPRINT=([a-f0-9]{64})", started.stdout)
    assert fingerprint, "amc init --regulated prints the monitor fingerprint to pin"
    Path(workspace, "workspace").mkdir()
    Path(workspace, "workspace", "n.txt").write_text("parity fixture\n", encoding="utf-8")
    return workspace, {**env, "AMC_EXPECTED_MONITOR_FINGERPRINT": fingerprint.group(1)}


@pytest.mark.skipif(_amc_bin() is None, reason="set AMC_BIN to the built CLI, e.g. AMC_BIN=$PWD/dist/cli.js")
def test_python_wrapper_runs_the_parity_scenario():
    amc_bin = _amc_bin()
    assert amc_bin is not None
    workspace, env = _regulated_workspace(amc_bin)
    record = run_scenario(workspace, amc_bin, env)
    assert {key: record[key] for key in EXPECTED} == EXPECTED


if __name__ == "__main__":
    # Spawned by tests/executionApiParity.test.ts: the workspace and environment are the TypeScript test's.
    amc_bin = _amc_bin()
    if amc_bin is None or not os.environ.get("AMC_PARITY_WORKSPACE") or not os.environ.get("AMC_PARITY_OUT"):
        sys.exit("AMC_BIN, AMC_PARITY_WORKSPACE and AMC_PARITY_OUT are required")
    run = run_purpose if os.environ.get("AMC_PARITY_MODE") == "purpose" else run_scenario
    result = run(os.environ["AMC_PARITY_WORKSPACE"], amc_bin, {})
    Path(os.environ["AMC_PARITY_OUT"]).write_text(json.dumps(result), encoding="utf-8")
