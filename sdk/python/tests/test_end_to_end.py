"""End-to-end: drive a real agent, then prove it ran.

These tests spawn the actual `amc` CLI. They are skipped when it cannot be found,
because a client whose tests pass without ever launching an agent would be
testing its own mock — and the whole claim of this package is that a turn really
executes and leaves a checkable record.

Run from the repository with:

    AMC_BIN=$(pwd)/dist/cli.js  python3 -m pytest sdk/python/tests -q

`AMC_BIN` may name the built `dist/cli.js`; it is invoked through `node` when it
ends in `.js`.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from amc_sdk import AmcAgent, AmcRefusedError, export_proof, verify_proof  # noqa: E402
from amc_sdk.proof import AmcProofError  # noqa: E402

PASSPHRASE = "amc-python-sdk-test-passphrase"


def _amc_bin() -> list[str] | None:
    """The CLI to drive, as an argv prefix, or None when there is no usable one.

    A bare `amc` on the PATH is NOT assumed to be the right one. An older AMC
    installed system-wide has no `acp` command at all, and driving it would fail
    somewhere deep in the protocol rather than saying so — so the candidate is
    probed for the command these tests need before being accepted.
    """
    explicit = os.environ.get("AMC_BIN")
    candidates = []
    if explicit:
        candidates.append(["node", explicit] if explicit.endswith(".js") else [explicit])
    found = shutil.which("amc")
    if found:
        candidates.append([found])

    for candidate in candidates:
        probe = subprocess.run([*candidate, "acp", "--help"], capture_output=True, text=True)
        if probe.returncode == 0 and "Agent Client Protocol" in (probe.stdout + probe.stderr):
            return candidate
    return None


BIN = _amc_bin()
needs_amc = pytest.mark.skipif(
    BIN is None,
    reason="no amc CLI supporting `acp` found; set AMC_BIN to a build, e.g. AMC_BIN=$PWD/dist/cli.js",
)


@pytest.fixture()
def workspace(tmp_path):
    """An initialised AMC workspace, with the CLI it should be driven by."""
    os.environ["AMC_VAULT_PASSPHRASE"] = PASSPHRASE
    root = str(tmp_path)
    subprocess.run(
        [*BIN, "init", "--trust-boundary", "isolated"],
        cwd=root, capture_output=True, text=True, check=True,
    )
    return root


def _agent(workspace: str) -> AmcAgent:
    """An agent driven by the probed CLI, not by whatever the PATH offers."""
    return AmcAgent(workspace=workspace, provider="stub", amc_bin=BIN,
                    env={"AMC_VAULT_PASSPHRASE": PASSPHRASE})


@needs_amc
def test_drives_a_turn_and_reports_a_stop_reason(workspace):
    with _agent(workspace) as agent:
        assert agent.protocol_version == 1
        # Declared capabilities are checked, not assumed: loadSession is false
        # because AMC has no resume path, and a client that believed otherwise
        # would build a feature on a promise nobody made.
        assert agent.capabilities.get("loadSession") is False

        session = agent.new_session()
        result = session.prompt("hello")

        assert result.stop_reason == "end_turn"
        assert result.session_id == session.session_id
        # The turn produced words, and they came over the update stream rather
        # than in the response: PromptResponse carries no content field.
        assert result.text != ""


@needs_amc
def test_a_session_carries_a_conversation(workspace):
    with _agent(workspace) as agent:
        session = agent.new_session()
        first = session.prompt("one")
        second = session.prompt("two")

        # Same session across both prompts — the thing openAgentSession exists
        # for. A per-prompt implementation would mint a new id here.
        assert first.session_id == second.session_id
        # And the second answer is not the first quoted back.
        assert second.text != first.text or first.text == ""


@needs_amc
def test_refuses_mcp_servers_rather_than_ignoring_them(workspace):
    with _agent(workspace) as agent:
        with pytest.raises(AmcRefusedError) as raised:
            agent._call("session/new", {"cwd": workspace, "mcpServers": [
                {"name": "x", "command": "y", "args": [], "env": []}
            ]})
        # Accepting the array and never connecting the servers is the dishonest
        # form; the client surfaces the refusal rather than hiding it.
        assert "MCP server" in raised.value.message


@needs_amc
def test_the_run_can_be_proved_to_a_third_party(workspace):
    """The claim that makes this an evidence client rather than a chat client."""
    with _agent(workspace) as agent:
        session = agent.new_session()
        session.prompt("hello")
        session_id = session.session_id

    proof = export_proof(session_id, "run.amcproof.json", workspace=workspace, amc_bin=BIN)
    assert os.path.exists(proof.path)
    assert proof.session_id == session_id

    bundle = json.load(open(proof.path, encoding="utf-8"))
    assert bundle["descriptor"]["sessionId"] == session_id

    # Verified from a directory with NO workspace, holding only the bundle and a
    # fingerprint obtained separately. That is what "a third party can check it"
    # means; verifying inside the workspace that produced it would prove much
    # less.
    with tempfile.TemporaryDirectory() as holder:
        carried = os.path.join(holder, "carried.amcproof.json")
        shutil.copyfile(proof.path, carried)
        assert verify_proof(carried, expect_auditor_key=proof.auditor_key_fingerprint, workspace=holder, amc_bin=BIN)


@needs_amc
def test_a_forged_fingerprint_does_not_verify(workspace):
    """Non-vacuity for the test above: verification must be capable of failing."""
    with _agent(workspace) as agent:
        session = agent.new_session()
        session.prompt("hello")
        session_id = session.session_id

    proof = export_proof(session_id, "run2.amcproof.json", workspace=workspace, amc_bin=BIN)
    with pytest.raises(AmcProofError):
        verify_proof(proof.path, expect_auditor_key="0" * 64, workspace=workspace, amc_bin=BIN)
