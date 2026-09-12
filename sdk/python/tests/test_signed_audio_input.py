"""AUTHORED UNEXECUTED. Canonical Python -> actual registered CLI -> local HTTP.
The HTTP-only fixture is shared with Gemini1 tests; it never supplies core success.
Original binary samples are not speech/codec/security/provider qualification.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from amc_sdk import AmcAgent, AmcError, NativeAudioInput, NativeImageInput, NATIVE_AUDIO_INPUT_FORMAT
from test_gemini_protocol import http_fixture, close_agents

REPO = Path(__file__).resolve().parents[3]
CLI = REPO / "tests/fixtures/nativeSignedAudioCli.ts"
COLD = REPO / "tests/fixtures/nativeSignedAudioCold.ts"
PNG64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII="


def wav(sample=0xff81, size=4):
    return (b"RIFF" + struct.pack("<I", 36 + size) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
            + b"data" + struct.pack("<I", size) + struct.pack("<H", sample) + bytes(size - 2))


@pytest.fixture
def audio_command():
    node = os.environ.get("AMC_IMAGE_NODE") or shutil.which("node")
    if not node:
        pytest.skip("Node unavailable; native audio subprocess qualification is absent")
    loader = os.environ.get("AMC_IMAGE_TSX")
    if not loader:
        loader = subprocess.run([node, "--input-type=module", "-e", "process.stdout.write(import.meta.resolve('tsx'))"], cwd=REPO,
                                capture_output=True, text=True, timeout=10, check=True).stdout
    return [node, "--import", loader, str(CLI)]


def start(tmp_path, command, backend, origin, agents, provider="gemini-audio"):
    root = tmp_path / "native-audio"
    root.mkdir(exist_ok=True)
    (root / ".native-audio-fixture").write_text("disposable native audio fixture\n")
    environment = {"AMC_NATIVE_AUDIO_FIXTURE": "1", "AMC_SESSION_STORE": backend, "AMC_AUDIO_FIXTURE_KEY": "disposable-not-a-provider-key",
                   "AMC_VAULT_PASSPHRASE": "audio-python-fixture-passphrase"}
    agent = AmcAgent(workspace=str(root), provider=provider, model="fixture-model", base_url=origin, credential="AMC_AUDIO_FIXTURE_KEY",
                     credentials_home=str(root / "empty-home"), max_tokens=64, amc_bin=command, env=environment, timeout=30)
    agents.append(agent)
    return agent, root, environment


def test_original_python_audio_snapshot_and_hostile_framing():
    source = bytearray(wav())
    original = NativeAudioInput(memoryview(source), "audio/wav")
    source[:] = b"\0" * len(source)
    assert original.data == wav() and NATIVE_AUDIO_INPUT_FORMAT == "amc-audio-input@1"
    for mime in ["audio/mpeg", "audio/x-wav", "application/octet-stream"]:
        with pytest.raises(ValueError):
            NativeAudioInput(wav(), mime)
    for data in [b"AAAA", wav() + b"x", bytes([0xd2]) + wav()[1:], wav()[:20] + b"\x03\0" + wav()[22:]]:
        with pytest.raises(ValueError):
            NativeAudioInput(data, "audio/wav")


@pytest.mark.parametrize("backend", ["sqlite", "jsonl"])
def test_python_original_audio_http_resume_and_default_cold(tmp_path, audio_command, http_fixture, backend):
    origin, sent, errors, _, _ = http_fixture()
    agents = []
    try:
        agent, root, environment = start(tmp_path, audio_command, backend, origin, agents)
        session = agent.new_session()
        source = bytearray(wav())
        parts = ["  before\n", NativeAudioInput(memoryview(source), "audio/wav"), "", NativeImageInput(base64.b64decode(PNG64), "image/png"), "after  "]
        turn = session.start_prompt_audio_parts(parts)
        source[:] = b"\0" * len(source)
        parts.clear()
        answer = turn.result(timeout=20)
        assert answer.text == "Gemini Python fixture answer" and answer.verification == "not-verified"
        session_id = session.session_id
        session.release()
        agent.close()
        second, _, _ = start(tmp_path, audio_command, backend, origin, agents)
        loaded = second.resume_session(session_id)
        data64 = base64.b64encode(wav()).decode()
        expected_blocks = [{"type": "text", "text": "  before\n"}, {"type": "audio", "mimeType": "audio/wav", "data": data64},
                           {"type": "text", "text": ""}, {"type": "image", "mimeType": "image/png", "data": PNG64}, {"type": "text", "text": "after  "}]
        assert [row.update["content"] for row in loaded.history if row.update["sessionUpdate"] == "user_message_chunk"] == expected_blocks
        assert loaded.prompt("Continue originals").text == "Gemini Python fixture answer"
        second.close()
        expected_wire = [{"text": "  before\n"}, {"inlineData": {"mimeType": "audio/wav", "data": data64}}, {"text": ""},
                         {"inlineData": {"mimeType": "image/png", "data": PNG64}}, {"text": "after  "}]
        assert len(sent) == 2 and not errors
        for request in sent:
            assert request["path"] == "/v1beta/models/fixture-model:streamGenerateContent?alt=sse"
            assert request["key"] == "disposable-not-a-provider-key"
            body = json.loads(request["body"])
            assert body["contents"][0]["parts"] == expected_wire and body["generationConfig"] == {"maxOutputTokens": 64}
            assert not {"messages", "stream", "model", "fileData"}.intersection(body)
        cold = subprocess.run([*audio_command[:3], str(COLD), str(root), session_id], env={**os.environ, **environment}, cwd=root,
                              capture_output=True, text=True, timeout=30, check=True)
        rows = json.loads(cold.stdout)
        assert [row["status"] for row in rows] == ["reconstructed", "reconstructed"]
        assert [row["bytes"] for row in rows] == [base64.b64encode(request["body"]).decode() for request in sent]
    finally:
        close_agents(agents)


def test_python_public_audio_cancel_closes_socket_and_owned_threads(tmp_path, audio_command, http_fixture):
    origin, sent, errors, entered, disconnected = http_fixture(hang=True)
    agents = []
    try:
        agent, _, _ = start(tmp_path, audio_command, "sqlite", origin, agents)
        turn = agent.new_session().start_prompt_audio_parts([NativeAudioInput(wav(), "audio/wav"), "after"])
        assert entered.wait(timeout=10)
        turn.cancel()
        assert turn.result(timeout=20).stop_reason == "cancelled"
        assert disconnected.wait(timeout=10) and len(sent) == 1 and not errors
    finally:
        close_agents(agents)


def test_python_missing_negotiation_and_lower_frame_bound_never_dispatch(tmp_path, audio_command, http_fixture):
    origin, sent, errors, _, _ = http_fixture()
    agents = []
    try:
        old, _, _ = start(tmp_path, audio_command, "sqlite", origin, agents, provider="gemini")
        with pytest.raises(AmcError):
            old.new_session().prompt_audio_parts([NativeAudioInput(wav(), "audio/wav")])
        old.close()
        agent, _, _ = start(tmp_path, audio_command, "sqlite", origin, agents)
        session = agent.new_session()
        with pytest.raises((AmcError, ValueError)):
            session.prompt_audio_parts([NativeAudioInput(wav(size=300000), "audio/wav")])
        with pytest.raises((AmcError, ValueError)):
            session.prompt_audio_parts([NativeAudioInput(wav(), "audio/wav"), {"type": "resource", "uri": "unowned"}])
        assert not sent and not errors
    finally:
        close_agents(agents)
