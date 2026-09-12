"""AUTHORED UNEXECUTED. Canonical Python -> actual registered ACP CLI -> HTTP.
Only an explicitly local HTTP server supplies model bytes. Source/package/platform
qualification and real Gemini/model capability remain unclaimed.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from amc_sdk import AmcAgent, AmcError, NativeImageInput

REPO = Path(__file__).resolve().parents[3]
CLI = REPO / "tests/fixtures/nativeGeminiCli.ts"
COLD = REPO / "tests/fixtures/nativeSignedImageCold.ts"
PNG64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII="
GIF64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
PNG = base64.b64decode(PNG64)
EXPECTED = [{"text": "  before\n"}, {"inlineData": {"mimeType": "image/png", "data": PNG64}}, {"text": ""}, {"text": "after α  "}]
BLOCKS = [{"type": "text", "text": "  before\n"}, {"type": "image", "mimeType": "image/png", "data": PNG64},
          {"type": "text", "text": ""}, {"type": "text", "text": "after α  "}]


@pytest.fixture
def native_command():
    node = os.environ.get("AMC_IMAGE_NODE") or shutil.which("node")
    if not node:
        pytest.skip("Node unavailable for source CLI fixture; no qualification")
    loader = os.environ.get("AMC_IMAGE_TSX")
    if not loader:
        loader = subprocess.run([node, "--input-type=module", "-e", "process.stdout.write(import.meta.resolve('tsx'))"],
                                cwd=REPO, capture_output=True, text=True, timeout=10, check=True).stdout
    return [node, "--import", loader, str(CLI)]


@pytest.fixture
def http_fixture():
    servers = []

    def create(hang=False):
        sent, errors = [], []
        stop, entered, disconnected = threading.Event(), threading.Event(), threading.Event()

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args):
                pass

            def do_POST(self):
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 < length <= 32 * 1024 * 1024:
                        raise AssertionError("Fixture body bound")
                    raw = self.rfile.read(length)
                    assert len(raw) == length
                    sent.append({"body": raw, "path": self.path, "key": self.headers.get("x-goog-api-key")})
                    frame = {"responseId": "python-" + str(len(sent)), "modelVersion": "fixture-model",
                             "candidates": [{"index": 0, "content": {"role": "model", "parts": [{"text": "Gemini Python fixture answer"}]}}]}
                    if not hang:
                        frame["candidates"][0]["finishReason"] = "STOP"
                        frame["usageMetadata"] = {"promptTokenCount": 12, "cachedContentTokenCount": 5,
                                                  "candidatesTokenCount": 4, "thoughtsTokenCount": 3, "totalTokenCount": 19}
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Connection", "close")
                    self.end_headers()
                    wire = ("data: " + json.dumps(frame, ensure_ascii=False) + "\r\n\r\n").encode()
                    for at in range(0, len(wire), 3):
                        self.wfile.write(wire[at:at + 3])
                    self.wfile.flush()
                    entered.set()
                    while hang and not stop.wait(0.05):
                        self.wfile.write(b": heartbeat\n\n")
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    disconnected.set()
                except BaseException as error:
                    errors.append(error)
                finally:
                    self.close_connection = True

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.daemon_threads = False
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        servers.append((server, thread, stop))
        return "http://127.0.0.1:" + str(server.server_port), sent, errors, entered, disconnected

    yield create
    for server, thread, stop in reversed(servers):
        stop.set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=10)
        assert not thread.is_alive()


def start(tmp_path, command, backend, origin, agents):
    root = tmp_path / "native-gemini"
    root.mkdir(exist_ok=True)
    (root / ".native-gemini-fixture").write_text("disposable native Gemini fixture\n")
    environment = {"AMC_NATIVE_GEMINI_FIXTURE": "1", "AMC_SESSION_STORE": backend,
                   "AMC_GEMINI_FIXTURE_KEY": "disposable-not-a-provider-key", "AMC_VAULT_PASSPHRASE": "gemini-python-fixture-passphrase"}
    agent = AmcAgent(workspace=str(root), provider="gemini", model="fixture-model", base_url=origin,
                     credential="AMC_GEMINI_FIXTURE_KEY", credentials_home=str(root / "empty-home"), max_tokens=64,
                     amc_bin=command, env=environment, timeout=30)
    agents.append(agent)
    return agent, root, environment


def close_agents(agents):
    for agent in reversed(agents):
        agent.close()
        assert agent._proc.poll() is not None
        assert not any(thread.is_alive() for thread in [agent._writer, agent._reader, agent._errors])
        assert not agent._replies and not agent._request_context


@pytest.mark.parametrize("backend", ["sqlite", "jsonl"])
def test_canonical_python_native_gemini_ordered_http_resume_and_cold(tmp_path, native_command, http_fixture, backend):
    origin, sent, errors, _, _ = http_fixture()
    agents = []
    try:
        first, root, environment = start(tmp_path, native_command, backend, origin, agents)
        session = first.new_session()
        data = bytearray(PNG)
        parts = ["  before\n", NativeImageInput(memoryview(data), "image/png"), "", "after α  "]
        turn = session.start_prompt_parts(parts)
        data[:] = b"\0" * len(data)
        parts.clear()
        answer = turn.result(timeout=20)
        assert answer.text == "Gemini Python fixture answer" and answer.verification == "not-verified"
        session_id = session.session_id
        session.release()
        first.close()
        second, _, _ = start(tmp_path, native_command, backend, origin, agents)
        loaded = second.resume_session(session_id)
        assert [row.update["content"] for row in loaded.history if row.update["sessionUpdate"] == "user_message_chunk"] == BLOCKS
        assert loaded.prompt("Continue originals").text == "Gemini Python fixture answer"
        second.close()
        assert not errors and len(sent) == 2
        for request in sent:
            assert request["path"] == "/v1beta/models/fixture-model:streamGenerateContent?alt=sse"
            assert request["key"] == "disposable-not-a-provider-key"
            body = json.loads(request["body"])
            assert body["contents"][0]["parts"] == EXPECTED
            assert body["generationConfig"] == {"maxOutputTokens": 64}
            assert not {"messages", "model", "stream"}.intersection(body)
        cold = subprocess.run([*native_command[:3], str(COLD), str(root), session_id], cwd=root,
                              env={**os.environ, **environment}, capture_output=True, text=True, timeout=30, check=True)
        rows = json.loads(cold.stdout)
        assert [row["status"] for row in rows] == ["reconstructed", "reconstructed"]
        assert [row["bytes"] for row in rows] == [base64.b64encode(request["body"]).decode() for request in sent]
    finally:
        close_agents(agents)


def test_python_gemini_refuses_unsupported_gif_without_dispatch_or_fallback(tmp_path, native_command, http_fixture):
    origin, sent, errors, _, _ = http_fixture()
    agents = []
    try:
        agent, _, _ = start(tmp_path, native_command, "sqlite", origin, agents)
        session = agent.new_session()
        with pytest.raises(AmcError):
            session.prompt_parts([NativeImageInput(base64.b64decode(GIF64), "image/gif"), "after"])
        assert not sent
        assert session.prompt("Text still works").text == "Gemini Python fixture answer"
        assert len(sent) == 1 and not errors
    finally:
        close_agents(agents)


def test_python_public_cancel_has_one_request_and_closes_child_and_socket(tmp_path, native_command, http_fixture):
    origin, sent, errors, entered, disconnected = http_fixture(hang=True)
    agents = []
    try:
        agent, _, _ = start(tmp_path, native_command, "sqlite", origin, agents)
        turn = agent.new_session().start_prompt_parts([NativeImageInput(PNG, "image/png"), "after"])
        assert entered.wait(timeout=10)
        turn.cancel()
        assert turn.result(timeout=20).stop_reason == "cancelled"
        assert disconnected.wait(timeout=10)
        assert len(sent) == 1 and not errors
    finally:
        close_agents(agents)
