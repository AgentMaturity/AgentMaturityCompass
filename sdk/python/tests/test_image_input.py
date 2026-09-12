"""AUTHORED UNEXECUTED: canonical Python public images, hostile ACP and real
source-native subprocess lifecycle. No installed-wheel, platform or model proof.
All subprocesses/workspaces below are created only when tests are eventually run.
"""
from __future__ import annotations

import base64
from dataclasses import FrozenInstanceError
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest
import amc_sdk
from amc_sdk import AmcAgent, AmcError, AmcProtocolError, AmcRefusedError, NativeImageInput

REPO = Path(__file__).resolve().parents[3]
PEER = REPO / "tests/fixtures/nativeAcpImageClientPeer.mjs"
RUNTIME = REPO / "tests/fixtures/nativeAcpImageRuntime.ts"
COLD = REPO / "tests/fixtures/nativeSignedImageCold.ts"
PNG64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII="
PNG = base64.b64decode(PNG64)
MARKER = "disposable native ACP image fixture\n"


def image():
    return NativeImageInput(PNG, "image/png")


@pytest.fixture
def node():
    executable = os.environ.get("AMC_IMAGE_NODE") or shutil.which("node")
    if not executable:
        pytest.skip("Node is required for the explicit subprocess fixture; not qualified")
    return executable


@pytest.fixture
def peers(tmp_path, node):
    agents = []

    def make(mode="good"):
        root = tmp_path / str(len(agents))
        root.mkdir()
        capture = root / "requests.jsonl"
        agent = AmcAgent(workspace=str(root), provider="anthropic", model="fixture-model",
                         amc_bin=[node, str(PEER), mode, str(capture)], timeout=10)
        agents.append(agent)

        def requests():
            return [json.loads(line) for line in capture.read_text().splitlines()]

        return agent, requests

    yield make
    for agent in reversed(agents):
        agent.close()
        assert agent._proc.poll() is not None
        assert agent._closed.is_set()
        assert not any(thread.is_alive() for thread in [agent._writer, agent._reader, agent._errors])
        assert not agent._replies and not agent._request_context


def test_public_image_export_snapshots_bytearray_and_memoryview():
    assert "NativeImageInput" in amc_sdk.__all__
    data = bytearray(PNG)
    value = NativeImageInput(data, "image/png")
    view = NativeImageInput(memoryview(data), "image/png")
    data[:] = b"\0" * len(data)
    assert value.data == view.data == PNG
    assert isinstance(value.data, bytes)
    with pytest.raises(FrozenInstanceError):
        value.data = b"changed"


def test_memoryview_byte_bound_is_not_an_element_count():
    data = bytearray(4 * 1024 * 1024 + 4)
    data[:len(PNG)] = PNG
    view = memoryview(data).cast("I")
    assert len(view) < 4 * 1024 * 1024 < view.nbytes
    with pytest.raises(ValueError, match="bounded original bytes"):
        NativeImageInput(view, "image/png")


@pytest.mark.parametrize("data,mime", [
    (b"", "image/png"), (b"https://never-fetch.invalid/a.png", "image/png"),
    (PNG, "image/jpeg"), (PNG, "image/svg+xml"), ("not bytes", "image/png")
])
def test_invalid_original_image_input_refuses(data, mime):
    with pytest.raises(ValueError):
        NativeImageInput(data, mime)


def test_public_prompt_and_start_prompt_forward_standard_blocks_only(peers):
    agent, requests = peers()
    session = agent.new_session()
    data = bytearray(PNG)
    images = [NativeImageInput(data, "image/png")]
    turn = session.start_prompt("Original text", images=images)
    data[:] = b"\0" * len(data)
    images.clear()
    result = turn.result(timeout=5)
    assert result.verification == "not-verified"
    session.prompt("", images=[image()])
    session.prompt("Legacy text only")
    prompts = [row["params"]["prompt"] for row in requests() if row["method"] == "session/prompt"]
    assert prompts == [
        [{"type": "text", "text": "Original text"}, {"type": "image", "mimeType": "image/png", "data": PNG64}],
        [{"type": "text", "text": ""}, {"type": "image", "mimeType": "image/png", "data": PNG64}],
        [{"type": "text", "text": "Legacy text only"}],
    ]


@pytest.mark.parametrize("mode", ["no-image", "truthy-image"])
def test_capability_refusal_does_not_send_images_or_choose_fallback(peers, mode):
    agent, requests = peers(mode)
    session = agent.new_session()
    with pytest.raises(AmcRefusedError, match="does not advertise image input"):
        session.start_prompt("Look", images=[image()])
    assert not any(row["method"] == "session/prompt" for row in requests())
    session.prompt("Text still works")
    assert len([row for row in requests() if row["method"] == "session/prompt"]) == 1


def test_bad_image_count_type_and_frame_size_do_not_strand_a_public_session(peers):
    agent, requests = peers()
    session = agent.new_session()
    for values in [[image()] * 9, [object()], "not an image list"]:
        with pytest.raises(ValueError):
            session.start_prompt("Look", images=values)
    data = bytearray(200_000)
    data[:len(PNG)] = PNG  # Header-only fixture for transport bound, not codec proof.
    with pytest.raises(AmcProtocolError, match="ACP ingress frame limit"):
        session.start_prompt("Frame bound", images=[NativeImageInput(data, "image/png")])
    assert not any(row["method"] == "session/prompt" for row in requests())
    assert not agent._turns and not agent._replies and not agent._request_context
    assert agent._proc.poll() is None
    session.prompt("Still usable")


def test_public_image_cancellation_and_concurrency(peers):
    agent, requests = peers("cancel")
    session = agent.new_session()
    turn = session.start_prompt("Cancelable", images=[image()])
    with pytest.raises(AmcError, match="active prompt"):
        session.start_prompt("Concurrent", images=[image()])
    iterator = iter(turn)
    assert next(iterator).update["content"]["text"] == "waiting for cancellation"
    turn.cancel()
    assert turn.result(timeout=5).cancelled
    iterator.close()
    assert len([row for row in requests() if row["method"] == "session/cancel"]) == 1


def test_released_image_history_is_not_new_output_or_verification(peers):
    agent, _ = peers()
    session = agent.new_session()
    session.prompt("Look", images=[image()])
    session.release()
    with pytest.raises(AmcError, match="released"):
        session.prompt("Must resume")
    loaded = agent.resume_session(session.session_id)
    assert len(loaded.history) == 1
    assert loaded.history[0].update["content"] == {"type": "image", "mimeType": "image/png", "data": PNG64}
    result = loaded.prompt("Continue")
    assert result.updates == [] and result.verification == "not-verified"


@pytest.mark.parametrize("mode", ["bad-base64", "mime", "uri-only", "assistant-image", "oversize-history"])
def test_hostile_image_history_is_a_protocol_failure_not_a_timeout(peers, mode):
    agent, _ = peers(mode)
    with pytest.raises(AmcProtocolError, match="invalid or uncorrelated protocol frame"):
        agent.resume_session("image-wire-session")
    agent.close()
    assert agent._proc.poll() is not None


def test_late_image_cannot_extend_the_load_response_window(peers):
    agent, _ = peers("late-image")
    try:
        loaded = agent.resume_session("image-wire-session")
        assert loaded.history == []
    except AmcProtocolError as error:
        assert "invalid or uncorrelated" in str(error)
    # Do not call close before detection: the hostile peer must cause this.
    assert agent._closed.wait(timeout=10)
    assert isinstance(agent._fatal, AmcProtocolError)
    assert "invalid or uncorrelated" in str(agent._fatal)


def test_unsolicited_user_image_during_a_prompt_refuses(peers):
    agent, _ = peers("unsolicited-image")
    with pytest.raises(AmcProtocolError, match="invalid or uncorrelated"):
        agent.new_session().prompt("Look", images=[image()])


@pytest.mark.parametrize("backend", ["sqlite", "jsonl"])
@pytest.mark.parametrize("provider", ["anthropic", "openai-responses", "openai"])
def test_public_python_to_real_native_signed_image_lifecycle_and_cold_bytes(tmp_path, node, backend, provider):
    # Resolve an installed development loader at the candidate checkout only at
    # execution time. This neither installs dependencies nor uses a runtime worker.
    loader = os.environ.get("AMC_IMAGE_TSX")
    if not loader:
        resolved = subprocess.run([node, "--input-type=module", "-e", "process.stdout.write(import.meta.resolve('tsx'))"],
                                  cwd=REPO, capture_output=True, text=True, timeout=10, check=True)
        loader = resolved.stdout
    root = tmp_path / "native"
    root.mkdir()
    (root / ".native-image-fixture").write_text(MARKER)
    env = {"AMC_NATIVE_IMAGE_FIXTURE": "1", "AMC_SESSION_STORE": backend,
           "AMC_VAULT_PASSPHRASE": "native-python-image-fixture-passphrase"}
    command = [node, "--import", loader, str(RUNTIME)]
    agents = []

    def connect():
        agent = AmcAgent(workspace=str(root), provider=provider, model="fixture-model",
                         amc_bin=command, env=env, timeout=30)
        agents.append(agent)
        return agent

    try:
        first = connect()
        session = first.new_session()
        result = session.prompt("Describe the actual image", images=[image()])
        assert result.text == "Native image fixture response"
        assert result.verification == "not-verified"
        session_id = session.session_id
        session.release()
        first.close()
        assert first._proc.poll() is not None
        second = connect()
        loaded = second.resume_session(session_id)
        images = [entry.update["content"] for entry in loaded.history
                  if entry.update.get("content", {}).get("type") == "image"]
        assert images == [{"type": "image", "mimeType": "image/png", "data": PNG64}]
        assert loaded.prompt("Continue using that image").text == "Native image fixture response"
        second.close()
        sent = [json.loads(line) for line in (root / ".native-image-http.jsonl").read_text().splitlines()]
        assert len(sent) == 2
        assert all(PNG64 in base64.b64decode(row["body"]).decode("utf-8") for row in sent)
        if provider == "openai-responses":
            for row in sent:
                body = json.loads(base64.b64decode(row["body"]))
                parts = [part for item in body["input"] if isinstance(item.get("content"), list)
                         for part in item["content"]]
                assert {"type": "input_image", "image_url": "data:image/png;base64," + PNG64,
                        "detail": "auto"} in parts
                assert body["store"] is False and body["stream"] is True
                assert body["max_output_tokens"] == 64 and "messages" not in body
        elif provider == "openai":
            for row in sent:
                body = json.loads(base64.b64decode(row["body"]))
                parts = [part for item in body["messages"] if isinstance(item.get("content"), list)
                         for part in item["content"]]
                assert {"type": "image_url", "image_url": {
                    "url": "data:image/png;base64," + PNG64, "detail": "auto"}} in parts
                assert body["stream"] is True and body["stream_options"] == {"include_usage": True}
                assert body["max_tokens"] == 64 and "input" not in body
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
