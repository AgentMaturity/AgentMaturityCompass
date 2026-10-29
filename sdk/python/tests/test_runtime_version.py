"""DXC-39: refuse incompatible discovered runtimes before any session request."""
from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest

from amc_sdk import AmcAgent, AmcProtocolError


PEER = r'''
import json
from pathlib import Path
import sys
version, capture = json.loads(sys.argv[1]), Path(sys.argv[2])
with capture.open("w", encoding="utf-8") as record:
    for line in sys.stdin:
        request = json.loads(line)
        record.write(json.dumps(request) + "\n")
        record.flush()
        if request["method"] == "initialize":
            info = {"name": "runtime-version-fixture"}
            if version != "missing":
                info["version"] = version
            result = {"protocolVersion": 1, "agentInfo": info,
                      "agentCapabilities": {"_meta": {"dev.agentmaturity.amc": {"executionApi": 1}}}}
        else:
            result = {"sessionId": "fixture-session"}
        print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)
'''


def command(tmp_path: Path, version):
    peer, capture = tmp_path / "peer.py", tmp_path / "requests.jsonl"
    peer.write_text(PEER, encoding="utf-8")
    return [sys.executable, str(peer), json.dumps(version), str(capture)], capture


@pytest.mark.parametrize("version", ["missing", None, 1.2, "", "unknown", "1.1.9", "1.3.0", "2.0.0", "99.0.0", "1.2.0-rc.1", "1.02.0", "9" * 5000 + ".2.0"])
def test_incompatible_runtime_is_refused_before_a_session(tmp_path, version):
    executable, capture = command(tmp_path, version)
    with pytest.raises(AmcProtocolError, match="compatible runtime"):
        AmcAgent(str(tmp_path), provider="stub", amc_bin=executable, timeout=5)
    requests = [json.loads(line) for line in capture.read_text(encoding="utf-8").splitlines()]
    assert [request["method"] for request in requests] == ["initialize"]


@pytest.mark.parametrize("version", ["1.2.0", "1.2.1", "1.2.999", "1.2.0+release.1"])
def test_declared_compatible_runtime_is_accepted(tmp_path, version):
    executable, _capture = command(tmp_path, version)
    with AmcAgent(str(tmp_path), provider="stub", amc_bin=executable, timeout=5) as agent:
        assert agent.new_session().session_id == "fixture-session"


@pytest.mark.parametrize("version", ["1.2.0+..", "1.2.0+.build", "1.2.0+build."])
def test_malformed_build_identifiers_are_refused(tmp_path, version):
    executable, _capture = command(tmp_path, version)
    with pytest.raises(AmcProtocolError, match="compatible runtime"):
        AmcAgent(str(tmp_path), provider="stub", amc_bin=executable, timeout=5)
