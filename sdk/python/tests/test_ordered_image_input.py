"""AUTHORED UNEXECUTED: canonical Python ordered input, hostile peers and actual
native subprocess lifecycle. No installed-wheel, model or acceptance claim.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest
import amc_sdk
from amc_sdk import AmcAgent, AmcError, AmcProtocolError, AmcRefusedError, NativeImageInput, NATIVE_ORDERED_INPUT_FORMAT

REPO = Path(__file__).resolve().parents[3]
PEER = REPO / "tests/fixtures/nativeOrderedImageClientPeer.mjs"
RUNTIME = REPO / "tests/fixtures/nativeAcpImageRuntime.ts"
COLD = REPO / "tests/fixtures/nativeSignedImageCold.ts"
PNG64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII="
GIF64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
PNG = base64.b64decode(PNG64)
MARKER = "disposable native ACP image fixture\n"


def parts():
    return ["  before\n", NativeImageInput(PNG, "image/png"), "", "after first",
            NativeImageInput(base64.b64decode(GIF64), "image/gif"), "after second  "]


def blocks():
    return [{"type": "text", "text": "  before\n"}, {"type": "image", "mimeType": "image/png", "data": PNG64},
            {"type": "text", "text": ""}, {"type": "text", "text": "after first"},
            {"type": "image", "mimeType": "image/gif", "data": GIF64}, {"type": "text", "text": "after second  "}]


@pytest.fixture
def node():
    executable = os.environ.get("AMC_IMAGE_NODE") or shutil.which("node")
    if not executable:
        pytest.skip("Node is required for the explicitly scoped subprocess fixture; not qualified")
    return executable


@pytest.fixture
def peers(tmp_path, node):
    agents = []

    def make(mode="good"):
        root = tmp_path / str(len(agents))
        root.mkdir()
        capture = root / "requests.jsonl"
        agent = AmcAgent(workspace=str(root), provider="openai", model="fixture-model",
                         amc_bin=[node, str(PEER), mode, str(capture)], timeout=10)
        agents.append(agent)
        return agent, lambda: [json.loads(line) for line in capture.read_text().splitlines()]

    yield make
    for agent in reversed(agents):
        agent.close()
        assert agent._proc.poll() is not None
        assert not any(thread.is_alive() for thread in [agent._writer, agent._reader, agent._errors])
        assert not agent._replies and not agent._request_context


def test_public_parts_export_original_snapshot_and_namespaced_format(peers):
    assert {"NativeInputPart", "NATIVE_ORDERED_INPUT_FORMAT"} <= set(amc_sdk.__all__)
    assert NATIVE_ORDERED_INPUT_FORMAT == "amc-image-input@2"
    agent, requests = peers()
    session = agent.new_session()
    data = bytearray(PNG)
    original = parts()
    original[1] = NativeImageInput(memoryview(data), "image/png")
    turn = session.start_prompt_parts(original)
    original.clear()
    data[:] = b"\0" * len(data)
    assert turn.result(timeout=5).verification == "not-verified"
    sent = next(row["params"] for row in requests() if row["method"] == "session/prompt")
    assert sent == {"sessionId": session.session_id, "prompt": blocks(),
                    "_meta": {"dev.agentmaturity.amc": {"inputFormat": NATIVE_ORDERED_INPUT_FORMAT}}}
    session.release()
    with pytest.raises(AmcError, match="released"):
        session.prompt_parts(parts())
    loaded = agent.resume_session(session.session_id)
    assert [row.update["content"] for row in loaded.history] == blocks()
    loaded.prompt("Legacy prefix", images=[NativeImageInput(PNG, "image/png")])
    legacy = [row["params"] for row in requests() if row["method"] == "session/prompt"][-1]
    assert legacy == {"sessionId": session.session_id, "prompt": [
        {"type": "text", "text": "Legacy prefix"}, {"type": "image", "mimeType": "image/png", "data": PNG64}]}


@pytest.mark.parametrize("mode", ["missing", "truthy", "future", "no-image"])
def test_exact_capability_refusal_has_no_submission_or_fallback(peers, mode):
    agent, requests = peers(mode)
    session = agent.new_session()
    with pytest.raises(AmcRefusedError, match="does not advertise amc-image-input@2"):
        session.start_prompt_parts(parts())
    assert not any(row["method"] == "session/prompt" for row in requests())
    session.prompt("Legacy text still works")


def test_invalid_content_and_lower_ingress_bound_leave_session_usable(peers):
    agent, requests = peers()
    session = agent.new_session()
    image = NativeImageInput(PNG, "image/png")
    for value in [[], ["text-only"], [image, object()], [image] * 9, [image] + [""] * 256, [image, "\ud800"], "not a sequence"]:
        with pytest.raises(ValueError):
            session.start_prompt_parts(value)
    data = bytearray(200_000)
    data[:len(PNG)] = PNG  # Header-only fixture for the transport bound.
    with pytest.raises(AmcProtocolError, match="ACP ingress frame limit"):
        session.start_prompt_parts([NativeImageInput(data, "image/png"), "after image"])
    assert not any(row["method"] == "session/prompt" for row in requests())
    assert not agent._turns and not agent._replies and not agent._request_context
    assert agent._proc.poll() is None
    session.prompt_parts(parts())


def test_ordered_and_legacy_share_public_concurrency_cancellation_and_release(peers):
    agent, requests = peers("cancel")
    session = agent.new_session()
    turn = session.start_prompt_parts(parts())
    with pytest.raises(AmcError, match="active prompt"):
        session.start_prompt("Concurrent legacy")
    with pytest.raises(AmcError):
        session.release()
    iterator = iter(turn)
    assert next(iterator).update["content"]["text"] == "waiting"
    turn.cancel()
    assert turn.result(timeout=5).cancelled
    iterator.close()
    assert len([row for row in requests() if row["method"] == "session/cancel"]) == 1


@pytest.mark.parametrize("mode", ["malformed", "oversize"])
def test_hostile_ordered_history_is_not_partial_success(peers, mode):
    agent, _ = peers(mode)
    with pytest.raises(AmcProtocolError, match="invalid or uncorrelated"):
        agent.resume_session("ordered-wire-session")
    agent.close()
    assert agent._proc.poll() is not None


def test_late_ordered_history_cannot_extend_load_lifetime(peers):
    agent, _ = peers("late")
    try:
        loaded = agent.resume_session("ordered-wire-session")
        assert loaded.history == []
    except AmcProtocolError:
        pass
    assert agent._closed.wait(timeout=10)
    assert isinstance(agent._fatal, AmcProtocolError)


def test_unsolicited_input_image_cannot_be_model_output(peers):
    agent, _ = peers("unsolicited")
    with pytest.raises(AmcProtocolError, match="invalid or uncorrelated"):
        agent.new_session().prompt_parts(parts())


def expected_wire(provider):
    result = []
    for part in blocks():
        if part["type"] == "text":
            result.append({"type": "input_text" if provider == "openai-responses" else "text", "text": part["text"]})
        elif provider == "anthropic":
            result.append({"type": "image", "source": {"type": "base64", "media_type": part["mimeType"], "data": part["data"]}})
        else:
            url = "data:" + part["mimeType"] + ";base64," + part["data"]
            result.append({"type": "input_image", "image_url": url, "detail": "auto"} if provider == "openai-responses"
                          else {"type": "image_url", "image_url": {"url": url, "detail": "auto"}})
    return result


@pytest.mark.parametrize("backend", ["sqlite", "jsonl"])
@pytest.mark.parametrize("provider", ["anthropic", "openai-responses", "openai"])
def test_real_canonical_python_ordered_native_lifecycle_and_independent_cold_bytes(tmp_path, node, backend, provider):
    loader = os.environ.get("AMC_IMAGE_TSX")
    if not loader:
        resolved = subprocess.run([node, "--input-type=module", "-e", "process.stdout.write(import.meta.resolve('tsx'))"],
                                  cwd=REPO, capture_output=True, text=True, timeout=10, check=True)
        loader = resolved.stdout
    root = tmp_path / "native"
    root.mkdir()
    (root / ".native-image-fixture").write_text(MARKER)
    env = {"AMC_NATIVE_IMAGE_FIXTURE": "1", "AMC_SESSION_STORE": backend,
           "AMC_VAULT_PASSPHRASE": "ordered-python-image-fixture-passphrase"}
    agents = []

    def connect():
        agent = AmcAgent(workspace=str(root), provider=provider, model="fixture-model", timeout=30,
                         amc_bin=[node, "--import", loader, str(RUNTIME)], env=env)
        agents.append(agent)
        return agent

    try:
        first = connect()
        session = first.new_session()
        assert session.prompt_parts(parts()).text == "Native image fixture response"
        session_id = session.session_id
        session.release()
        first.close()
        assert first._proc.poll() is not None
        second = connect()
        loaded = second.resume_session(session_id)
        assert [row.update["content"] for row in loaded.history if row.update["sessionUpdate"] == "user_message_chunk"] == blocks()
        result = loaded.prompt("Continue using the original order")
        assert result.text == "Native image fixture response" and result.verification == "not-verified"
        second.close()
        sent = [json.loads(line) for line in (root / ".native-image-http.jsonl").read_text().splitlines()]
        assert len(sent) == 2
        for row in sent:
            body = json.loads(base64.b64decode(row["body"]))
            messages = body["input"] if provider == "openai-responses" else body["messages"]
            content = next(item["content"] for item in messages if item.get("role") == "user")
            assert isinstance(content, list)
            if provider == "anthropic":
                for part in content:
                    if "cache_control" in part:
                        assert part["cache_control"] == {"type": "ephemeral"}
                content = [{key: value for key, value in part.items() if key != "cache_control"} for part in content]
            assert content == expected_wire(provider)
        cold = subprocess.run([node, "--import", loader, str(COLD), str(root), session_id],
                              env={**os.environ, **env}, capture_output=True, text=True, timeout=30, check=True)
        derived = json.loads(cold.stdout)
        assert [row["status"] for row in derived] == ["reconstructed", "reconstructed"]
        assert [row["bytes"] for row in derived] == [row["body"] for row in sent]
    finally:
        for agent in reversed(agents):
            agent.close()
            assert agent._proc.poll() is not None
            assert not any(thread.is_alive() for thread in [agent._writer, agent._reader, agent._errors])
