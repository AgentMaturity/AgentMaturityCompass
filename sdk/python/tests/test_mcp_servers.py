"""WP21d: several reviewed MCP servers per session, per-mount status, and coded startup refusals.

Parity with the TypeScript SDK (tests/nativeSdkMcpServers.test.ts): lists of configs and pins are paired
before anything is spawned; ``mcp_status`` returns the ``/mcp`` projection and nothing else; a refused
startup raises ``AmcStartupRefusedError`` with the runtime's reason, not a generic closed-output error.
The end-to-end cases drive the built CLI named by AMC_BIN.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess

import pytest

from amc_sdk import MCP_STATUS_FORMAT, AmcAgent, AmcError, AmcStartupRefusedError
from amc_sdk.mcp_status import admit_mcp_status, mcp_config_argv

PIN = "a" * 64
SECRET = "sk-live-NEVER-LEAVES-THE-RUNTIME"
AMC_BIN = os.environ.get("AMC_BIN")
needs_cli = pytest.mark.skipif(not AMC_BIN or not AMC_BIN.endswith(".js") or not os.path.exists(AMC_BIN) or shutil.which("node") is None,
                               reason="set AMC_BIN to the built dist/cli.js")


def _server(**overrides):
    return {"serverId": "first", "catalogDigest": "c" * 64,
            "protocol": {"negotiatedVersion": "2025-11-25", "mode": "legacy", "serverInfo": None},
            "auth": None, "toolNames": ["mcp_first_" + "b" * 16], "state": "registered", "execution": "not-evaluated", **overrides}


def test_configs_and_pins_pair_in_order():
    assert mcp_config_argv("one.json", None) == ["--mcp-config", "one.json"]
    assert mcp_config_argv(["one.json", "two.json"], [PIN, "b" * 64]) == [
        "--mcp-config", "one.json", "--mcp-config-sha256", PIN, "--mcp-config", "two.json", "--mcp-config-sha256", "b" * 64]


@pytest.mark.parametrize("configs, pins", [
    (["one.json", "two.json"], [PIN]),            # unpaired
    (None, [PIN]),                                # a pin without a config
    ([], None),                                   # empty list
    (["one.json", ""], None),                     # malformed path
    (["one.json", "a\0b"], None),                 # NUL byte
    (["one.json"], ["NOT-A-DIGEST"]),             # malformed pin
    ({"one.json": PIN}, None),                    # not a list
])
def test_unpaired_or_malformed_entries_are_refused_before_spawning(configs, pins):
    with pytest.raises(ValueError):
        mcp_config_argv(configs, pins)
    # A spawn would raise AmcProtocolError for this executable; ValueError proves nothing was launched.
    with pytest.raises(ValueError):
        AmcAgent(".", tools="workspace", approve_tools="READ_ONLY", mcp_config=configs, mcp_config_sha256=pins,
                 amc_bin=["/nonexistent/amc-never-spawned"])


def test_status_keeps_only_the_mcp_projection():
    reply = {"format": MCP_STATUS_FORMAT, "refused": 1, "servers": [_server(
        env={"API_KEY": SECRET}, args=[SECRET],
        auth={"issuer": "https://issuer.example", "scopes": ["read"], "tokenExpiresAt": None, "accessToken": SECRET},
        protocol={"negotiatedVersion": "2025-11-25", "mode": "legacy", "serverInfo": None, "sessionSecret": SECRET})]}
    status = admit_mcp_status(reply)
    assert SECRET not in json.dumps(status)
    assert status == {"format": MCP_STATUS_FORMAT, "refused": 1, "servers": [_server(
        auth={"issuer": "https://issuer.example", "scopes": ["read"], "tokenExpiresAt": None})]}
    assert admit_mcp_status({"format": MCP_STATUS_FORMAT, "servers": None, "refused": 0})["servers"] is None


@pytest.mark.parametrize("reply", [
    {"format": "amc-mcp-status-v2", "servers": [], "refused": 0},
    {"format": MCP_STATUS_FORMAT, "servers": [], "refused": 0, "extra": SECRET},
    {"format": MCP_STATUS_FORMAT, "servers": [_server(state="healthy")], "refused": 0},
    {"format": MCP_STATUS_FORMAT, "servers": [_server(catalogDigest=SECRET)], "refused": 0},
    {"format": MCP_STATUS_FORMAT, "servers": [], "refused": -1},
])
def test_status_outside_the_contract_is_refused(reply):
    with pytest.raises(ValueError):
        admit_mcp_status(reply)


def _start(workspace, configs, pins, **extra):
    return AmcAgent(workspace, provider="stub", tools="workspace", approve_tools="READ_ONLY", mcp_config=configs,
                    mcp_config_sha256=pins, amc_bin=["node", AMC_BIN], timeout=60, **extra)


@needs_cli
@pytest.mark.parametrize("reason, write", [
    ("mcp-config-tampered", lambda path: (path.write_text('{"schemaVersion": 1}'), PIN)[1]),
    ("mcp-config-invalid", lambda path: (path.write_text(SECRET), None)[1]),
    ("mcp-config-unreviewed", lambda path: (path.write_text(json.dumps(
        {"schemaVersion": 1, "server": {"id": "first", "command": "node", "args": [SECRET]}})), None)[1]),
])
def test_refused_startup_raises_the_runtime_reason(tmp_path, reason, write):
    config = tmp_path / "server.json"
    pin = write(config)
    with pytest.raises(AmcStartupRefusedError) as raised:
        _start(str(tmp_path), [str(config)], None if pin is None else [pin])
    assert raised.value.reason == reason and raised.value.code == -32003 and raised.value.data == {"reason": reason}
    assert SECRET not in str(raised.value)


@pytest.fixture()
def reviewed(tmp_path):
    """The TypeScript e2e's two reviewed servers, built with the dist modules beside AMC_BIN.

    One AMC_HOME for the builder and the CLI (vitest's guardWorkspace setup gives the TypeScript twin one): the key set
    the builder commits is marked there, and a CLI under any other home rightly sees a first-use workspace and refuses.
    """
    env = {**os.environ, "AMC_VAULT_PASSPHRASE": "wp21d-python-mcp", "AMC_CONTROL_CHECKPOINT_DIR": str(tmp_path / "controls"),
           "AMC_HOME": str(tmp_path / "amc-home")}
    built = subprocess.run(["node", os.path.join(os.path.dirname(__file__), "mcp_workspace_fixture.mjs"),
                            os.path.dirname(os.path.abspath(AMC_BIN)), str(tmp_path)], env=env, capture_output=True, text=True, check=True)
    fixture = json.loads(built.stdout)
    fixture["env"] = {"HOME": fixture["home"], "AMC_VAULT_PASSPHRASE": env["AMC_VAULT_PASSPHRASE"],
                      "AMC_CONTROL_CHECKPOINT_DIR": env["AMC_CONTROL_CHECKPOINT_DIR"], "AMC_HOME": env["AMC_HOME"]}
    return fixture


def _received(fixture):
    return [[line for line in open(log, encoding="utf-8").read().split("\n") if line] for log in fixture["logs"]]


@needs_cli
def test_one_session_mounts_every_reviewed_server_and_reports_each(reviewed):
    with _start(reviewed["workspace"], reviewed["paths"], reviewed["pins"], credentials_mode="operator-only",
                credentials_home=reviewed["home"], env=reviewed["env"]) as agent:
        session = agent.new_session()
        status = agent.mcp_status(session.session_id)
        with pytest.raises(AmcError):
            agent.mcp_status("not-owned")
    assert [(server["serverId"], server["state"], server["execution"]) for server in status["servers"]] == [
        ("first", "registered", "not-evaluated"), ("second", "registered", "not-evaluated")]
    assert status["refused"] == 0 and status["servers"][0]["protocol"]["serverInfo"] == {"name": "sdk-fixture", "version": "1"}
    wire = json.dumps(status)
    for secret in ["readline", "wp21d-python-mcp", "command", "args", *reviewed["logs"]]:
        assert secret not in wire
    for requests in _received(reviewed):
        assert "initialize" in requests and "tools/list" in requests


@needs_cli
@pytest.mark.parametrize("reason, damage", [
    ("mcp-config-duplicate", lambda f: (f["paths"].__setitem__(1, f["paths"][0]), f["pins"].__setitem__(1, f["pins"][0]))),
    ("mcp-grant-class-mismatch", lambda f: f["pins"].__setitem__(1, _rewrite(f["paths"][1], "WRITE_HIGH", "READ_ONLY"))),
])
def test_reviewed_refusals_reach_the_caller_before_any_server_starts(reviewed, reason, damage):
    damage(reviewed)
    with pytest.raises(AmcStartupRefusedError) as raised:
        _start(reviewed["workspace"], reviewed["paths"], reviewed["pins"], credentials_mode="operator-only",
               credentials_home=reviewed["home"], env=reviewed["env"])
    assert raised.value.reason == reason
    assert _received(reviewed) == [[], []]


def _rewrite(path, old, new):
    with open(path, encoding="utf-8") as handle:
        text = handle.read().replace(old, new)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@needs_cli
def test_unresolved_credential_at_new_session_raises_the_runtime_reason(reviewed):
    with open(reviewed["paths"][1], encoding="utf-8") as handle:
        config = json.load(handle)
    config["server"]["envRefs"] = {"AMC_FIXTURE_SECRET": "AMC_ABSENT_MCP_FIXTURE_REFERENCE_9B32"}
    text = json.dumps(config)
    with open(reviewed["paths"][1], "w", encoding="utf-8") as handle:
        handle.write(text)
    reviewed["pins"][1] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    with _start(reviewed["workspace"], reviewed["paths"], reviewed["pins"], credentials_mode="operator-only",
                credentials_home=reviewed["home"], env=reviewed["env"]) as agent:
        with pytest.raises(AmcStartupRefusedError) as raised:
            agent.new_session()
    assert raised.value.reason == "mcp-credential-unavailable" and raised.value.code == -32003
    assert "AMC_ABSENT_MCP_FIXTURE_REFERENCE_9B32" not in str(raised.value)
