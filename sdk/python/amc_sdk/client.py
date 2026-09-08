"""A bounded, correlated ACP client for the installed AMC native runtime.

Updates contain committed blocks, never raw provider token deltas. Results and
replayed history are not verification receipts. ``end_turn`` can also represent
blocked/error/interrupted endings; inspect metadata and verify separately.
"""
from __future__ import annotations

import copy
import json
import math
import os
import queue
import subprocess
import threading
from dataclasses import dataclass, field
from typing import Any, Iterator, Optional

__all__ = ["AmcAgent", "Session", "Turn", "SessionUpdate", "RunResult", "ToolCall",
           "AmcError", "AmcProtocolError", "AmcRefusedError"]
DEFAULT_TIMEOUT_SECONDS = 120.0
MAX_FRAME_BYTES = 1024 * 1024
MAX_OUTPUT_BYTES = 8 * 1024 * 1024
MAX_UPDATES = 32768
MAX_PENDING = 32
STOP_REASONS = {"end_turn", "max_tokens", "max_turn_requests", "refusal", "cancelled"}


class AmcError(Exception):
    """Base class for client failures."""


class AmcProtocolError(AmcError):
    """A malformed, uncorrelated, oversized or failed transport; never retry blindly."""


class AmcRefusedError(AmcError):
    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(f"[{code}] {message}")
        self.code, self.message, self.data = code, message, data


@dataclass(frozen=True)
class ToolCall:
    tool_call_id: str
    title: str
    status: str
    output: Optional[str] = None


@dataclass(frozen=True)
class SessionUpdate:
    """A committed ACP block notification, not a signature-verification result."""
    session_id: str
    update: dict[str, Any]


@dataclass(frozen=True)
class RunResult:
    session_id: str
    stop_reason: str
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)
    updates: list[SessionUpdate] = field(default_factory=list)
    verification: str = "not-verified"

    @property
    def cancelled(self) -> bool:
        return self.stop_reason == "cancelled"


def _invalid_constant(_value: str) -> None:
    raise ValueError("JSON numeric constants must be finite")


def _identity(value: Any) -> bool:
    return isinstance(value, str) and 0 < len(value) <= 1024 and not any(ord(c) < 32 or ord(c) == 127 for c in value)


class _Updates:
    def __init__(self) -> None:
        self.items: list[SessionUpdate] = []
        self.bytes = 0

    def append(self, update: SessionUpdate) -> None:
        self.bytes += len(json.dumps(update.update, ensure_ascii=False, allow_nan=False).encode("utf-8"))
        if self.bytes > MAX_OUTPUT_BYTES or len(self.items) >= MAX_UPDATES:
            raise AmcProtocolError("native output exceeded the client limit")
        self.items.append(update)


class Turn:
    """One submitted prompt. Iterate committed updates, then call ``result()``.

    Breaking the iterator requests cancellation. The final response, not the
    cancellation request, determines whether the turn actually stopped.
    """
    def __init__(self, agent: AmcAgent, session_id: str) -> None:
        self._agent, self.session_id = agent, session_id
        self._condition = threading.Condition()
        self._updates = _Updates()
        self._done = False
        self._error: Optional[BaseException] = None
        self._result: Optional[RunResult] = None
        self._iterated = False
        self.state = "submitted"

    def _receive(self, update: SessionUpdate) -> None:
        with self._condition:
            if self._done:
                raise AmcProtocolError("received an update after the prompt result")
            self._updates.append(update)
            if self.state != "cancel-requested":
                self.state = "receiving"
            self._condition.notify_all()

    def _finish(self, response: dict[str, Any]) -> None:
        if not isinstance(response.get("stopReason"), str) or response["stopReason"] not in STOP_REASONS or not isinstance(response.get("_meta", {}), dict):
            raise AmcProtocolError("native prompt returned an invalid outcome")
        with self._condition:
            if self._done:
                return
            chunks: list[str] = []
            tools: dict[str, ToolCall] = {}
            for event in self._updates.items:
                update = event.update
                kind = update["sessionUpdate"]
                if kind == "agent_message_chunk":
                    chunks.append(update["content"]["text"])
                elif kind in {"tool_call", "tool_call_update"}:
                    key = update["toolCallId"]
                    previous = tools.get(key)
                    output = previous.output if previous else None
                    for item in update.get("content", []) or []:
                        content = item.get("content", {})
                        if content.get("type") == "text":
                            output = content["text"]
                    tools[key] = ToolCall(key, update.get("title", previous.title if previous else "tool"),
                                          update.get("status", previous.status if previous else "pending"), output)
            self._result = RunResult(self.session_id, response["stopReason"], "".join(chunks),
                                     list(tools.values()), copy.deepcopy(response.get("_meta", {})),
                                     copy.deepcopy(self._updates.items))
            self._done, self.state = True, "completed"
            self._condition.notify_all()

    def _fail(self, error: BaseException) -> None:
        with self._condition:
            if not self._done:
                self._done, self._error, self.state = True, error, "failed"
                self._condition.notify_all()

    def cancel(self) -> None:
        with self._condition:
            if self._done or self.state == "cancel-requested":
                return
            self._agent._notify("session/cancel", {"sessionId": self.session_id})
            self.state = "cancel-requested"

    def result(self, timeout: Optional[float] = None) -> RunResult:
        with self._condition:
            if not self._condition.wait_for(lambda: self._done, timeout=timeout):
                self.cancel()
                raise AmcProtocolError("waiting for the turn result timed out; cancellation was requested")
            if self._error:
                raise self._error
            assert self._result is not None
            return self._result

    def __iter__(self) -> Iterator[SessionUpdate]:
        with self._condition:
            if self._iterated:
                raise AmcError("a turn permits one update iterator; result() retains the updates")
            self._iterated = True
        cursor = 0
        try:
            while True:
                with self._condition:
                    self._condition.wait_for(lambda: cursor < len(self._updates.items) or self._done)
                    if cursor < len(self._updates.items):
                        item = copy.deepcopy(self._updates.items[cursor])
                        cursor += 1
                    elif self._error:
                        raise self._error
                    else:
                        return
                yield item
        finally:
            self.cancel()


class AmcAgent:
    """Own one ``amc acp`` child. Workspace, provider and credentials are fixed at launch.

    ``stub`` remains the compatibility default and is only a local demonstration.
    Explicitly select a real provider and model for model work. No fallback is used.
    """
    def __init__(self, workspace: str = ".", *, provider: str = "stub", model: Optional[str] = None,
                 credential: Optional[str] = None, base_url: Optional[str] = None, agent_id: str = "default",
                 tools: str = "none", approve_tools: Optional[str] = None, approve_risk: Optional[str] = None,
                 mcp_config: Optional[str] = None, mcp_config_sha256: Optional[str] = None,
                 credentials_home: Optional[str] = None, credentials_file: Optional[str] = None,
                 max_tokens: int = 512, max_steps: Optional[int] = None,
                 amc_bin: Optional[str | list[str]] = None, env: Optional[dict[str, str]] = None,
                 timeout: float = DEFAULT_TIMEOUT_SECONDS) -> None:
        if isinstance(timeout, bool) or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be finite and positive")
        if tools not in {"none", "workspace"}:
            raise ValueError("tools must be none or workspace")
        if type(max_tokens) is not int or not 1 <= max_tokens <= 1_000_000 or (max_steps is not None and (type(max_steps) is not int or not 1 <= max_steps <= 1024)):
            raise ValueError("native token and step limits must be bounded positive integers")
        if approve_tools is not None and tools != "workspace":
            raise ValueError("signed tool approvals require tools='workspace'")
        if approve_risk is not None and (approve_tools is None or approve_risk.lower() not in {"low", "medium", "high", "critical"}):
            raise ValueError("approve_risk requires an approval action class and a valid risk tier")
        if mcp_config is not None and (tools != "workspace" or approve_tools is None):
            raise ValueError("reviewed MCP requires workspace tools and signed approvals")
        if mcp_config_sha256 is not None and (mcp_config is None or len(mcp_config_sha256) != 64 or any(c not in "0123456789abcdef" for c in mcp_config_sha256)):
            raise ValueError("MCP digest requires an explicit config and lowercase SHA-256")
        self.workspace, self.timeout = os.path.abspath(workspace), timeout
        resolved = amc_bin or os.environ.get("AMC_BIN") or "amc"
        self._bin = list(resolved) if isinstance(resolved, list) else (["node", resolved] if resolved.endswith(".js") else [resolved])
        if not self._bin or any(not isinstance(arg, str) or not arg for arg in self._bin):
            raise ValueError("amc_bin must name an executable and optional arguments")
        argv = [*self._bin, "acp", "--provider", provider, "--agent-id", agent_id, "--tools", tools, "--max-tokens", str(max_tokens)]
        for flag, value in [("--model", model), ("--credential", credential), ("--base-url", base_url),
                            ("--approve-tools", approve_tools), ("--approve-risk", approve_risk),
                            ("--mcp-config", mcp_config), ("--mcp-config-sha256", mcp_config_sha256),
                            ("--credentials-home", credentials_home), ("--credentials-file", credentials_file),
                            ("--max-steps", None if max_steps is None else str(max_steps))]:
            if value is not None:
                if not isinstance(value, str) or not value or "\0" in value:
                    raise ValueError("native launch options must be nonempty strings without NUL bytes")
                argv.extend([flag, value])
        self._lock = threading.Lock()
        self._next_id = 1
        self._replies: dict[int, queue.Queue[Any]] = {}
        self._request_context: dict[int, tuple[str, Optional[str]]] = {}
        self._turns: dict[str, Turn] = {}
        self._loading: dict[str, _Updates] = {}
        self._sessions: set[str] = set()
        self._releasing: set[str] = set()
        self._fatal: Optional[BaseException] = None
        self._closing = False
        self._close_started = False
        self._closed = threading.Event()
        self._close_error: Optional[BaseException] = None
        self._stderr = bytearray()
        self._writes: queue.Queue[Optional[bytes]] = queue.Queue(maxsize=MAX_PENDING)
        try:
            self._proc = subprocess.Popen(argv, cwd=self.workspace, stdin=subprocess.PIPE,
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                          env={**os.environ, **(env or {})})
        except OSError as error:
            raise AmcProtocolError("could not launch the selected AMC executable") from error
        self._writer = threading.Thread(target=self._write_loop, daemon=True)
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._errors = threading.Thread(target=self._stderr_loop, daemon=True)
        for thread in [self._writer, self._reader, self._errors]:
            thread.start()
        try:
            result = self._call("initialize", {"protocolVersion": 1, "clientCapabilities": {}})
            if type(result.get("protocolVersion")) is not int or result["protocolVersion"] != 1:
                raise AmcProtocolError("the native agent negotiated an unsupported protocol version")
            if not isinstance(result.get("agentCapabilities"), dict) or not isinstance(result.get("agentInfo", {}), dict):
                raise AmcProtocolError("the native agent returned invalid capabilities")
            self.protocol_version, self.agent_info = 1, result.get("agentInfo", {})
            self.capabilities = result["agentCapabilities"]
            if "loadSession" in self.capabilities and type(self.capabilities["loadSession"]) is not bool:
                raise AmcProtocolError("the native agent returned an invalid load capability")
        except BaseException:
            self._close_safely()
            raise

    def _write_loop(self) -> None:
        assert self._proc.stdin is not None
        try:
            while True:
                frame = self._writes.get()
                if frame is None:
                    self._proc.stdin.close()
                    return
                self._proc.stdin.write(frame)
                self._proc.stdin.flush()
        except (OSError, ValueError):
            if not self._closing:
                self._fail(AmcProtocolError("the native agent input pipe failed"))

    def _read_loop(self) -> None:
        assert self._proc.stdout is not None
        try:
            while True:
                line = self._proc.stdout.readline(MAX_FRAME_BYTES + 1)
                if not line:
                    if not self._closing or self._replies:
                        self._fail(AmcProtocolError("the native agent closed its output before completion"))
                    return
                if len(line) > MAX_FRAME_BYTES or not line.endswith(b"\n"):
                    raise AmcProtocolError("native agent emitted an oversized or unterminated frame")
                if not line.strip():
                    continue
                self._route(json.loads(line.decode("utf-8"), parse_constant=_invalid_constant))
        except (ValueError, TypeError, KeyError, UnicodeError, OSError, AmcProtocolError):
            self._fail(AmcProtocolError("native agent emitted an invalid or uncorrelated protocol frame"))

    def _route(self, message: Any) -> None:
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            raise AmcProtocolError("invalid JSON-RPC envelope")
        if message.get("method") == "session/update" and "id" not in message:
            params = message.get("params")
            if not isinstance(params, dict) or not _identity(params.get("sessionId")) or not isinstance(params.get("update"), dict):
                raise AmcProtocolError("invalid session update")
            update, session_id = params["update"], params["sessionId"]
            kind = update.get("sessionUpdate")
            if not isinstance(kind, str):
                raise AmcProtocolError("missing update kind")
            if kind in {"user_message_chunk", "agent_message_chunk"}:
                content = update.get("content")
                if not isinstance(content, dict) or content.get("type") != "text" or not isinstance(content.get("text"), str):
                    raise AmcProtocolError("invalid text update")
            if kind in {"tool_call", "tool_call_update"}:
                if not _identity(update.get("toolCallId")) or update.get("status", "pending") not in {"pending", "in_progress", "completed", "failed"}:
                    raise AmcProtocolError("invalid tool update")
                if "title" in update and not isinstance(update["title"], str):
                    raise AmcProtocolError("invalid tool title")
                content = update.get("content", [])
                if content is not None and (not isinstance(content, list) or any(not isinstance(item, dict) for item in content)):
                    raise AmcProtocolError("invalid tool content")
                for item in content or []:
                    inner = item.get("content", {})
                    if not isinstance(inner, dict) or (inner.get("type") == "text" and not isinstance(inner.get("text"), str)):
                        raise AmcProtocolError("invalid tool text")
            event = SessionUpdate(session_id, update)
            with self._lock:
                loading, turn = self._loading.get(session_id), self._turns.get(session_id)
                if loading is not None:
                    loading.append(event)
                    return
            if turn is None or kind == "user_message_chunk":
                raise AmcProtocolError("unsolicited session update")
            turn._receive(event)
            return
        request_id = message.get("id")
        if type(request_id) is not int or not 0 < request_id <= 2**53 - 1 or "method" in message:
            raise AmcProtocolError("unsolicited protocol frame")
        if ("result" in message) == ("error" in message):
            raise AmcProtocolError("reply must contain exactly one outcome")
        if "error" in message:
            error = message["error"]
            if not isinstance(error, dict) or type(error.get("code")) is not int or not isinstance(error.get("message"), str):
                raise AmcProtocolError("invalid error response")
        elif not isinstance(message["result"], dict):
            raise AmcProtocolError("invalid response result")
        with self._lock:
            waiter = self._replies.get(request_id)
            context = self._request_context.get(request_id)
        if waiter is None or context is None:
            raise AmcProtocolError("uncorrelated or repeated response")
        method, session_id = context
        if method == "session/prompt" and "result" in message:
            result = message["result"]
            if not isinstance(result.get("stopReason"), str) or result["stopReason"] not in STOP_REASONS or not isinstance(result.get("_meta", {}), dict):
                raise AmcProtocolError("native prompt returned an invalid outcome")
        with self._lock:
            self._replies.pop(request_id, None)
            self._request_context.pop(request_id, None)
            turn = self._turns.pop(session_id, None) if method == "session/prompt" else None
            if method == "session/load":
                self._loading.pop(session_id, None)
        # A response closes its update window on the reader thread, before the
        # next frame can be routed; a worker's scheduling cannot extend it.
        if turn is not None:
            if "result" in message:
                turn._finish(message["result"])
            else:
                error = message["error"]
                turn._fail(AmcRefusedError(error["code"], error["message"], error.get("data")))
        waiter.put_nowait(message)

    def _stderr_loop(self) -> None:
        assert self._proc.stderr is not None
        try:
            while True:
                chunk = self._proc.stderr.read1(4096)
                if not chunk:
                    return
                with self._lock:
                    self._stderr.extend(chunk)
                    del self._stderr[:-65536]
        except (OSError, ValueError):
            return

    def _fail(self, error: BaseException) -> None:
        with self._lock:
            if self._fatal is not None:
                return
            self._fatal = error
            waiters = list(self._replies.values())
            self._replies.clear()
            self._request_context.clear()
            turns = list(self._turns.values())
        for waiter in waiters:
            try:
                waiter.put_nowait(error)
            except queue.Full:
                pass
        for turn in turns:
            turn._fail(error)
        threading.Thread(target=self._close_safely, daemon=True).start()

    def _write(self, frame: dict[str, Any]) -> None:
        try:
            data = (json.dumps(frame, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
            if len(data) > MAX_FRAME_BYTES:
                raise AmcProtocolError("native request exceeds the frame limit")
            with self._lock:
                if self._fatal:
                    raise self._fatal
                if self._closing:
                    raise AmcProtocolError("native client is closed")
                self._writes.put_nowait(data)
        except (ValueError, UnicodeError, queue.Full) as error:
            raise AmcProtocolError("native request is invalid or the output queue is full") from error

    def _begin_call(self, method: str, params: dict[str, Any]) -> tuple[int, queue.Queue[Any]]:
        with self._lock:
            if self._fatal:
                raise self._fatal
            if self._closing:
                raise AmcProtocolError("native client is closed")
            if len(self._replies) >= MAX_PENDING:
                raise AmcProtocolError("too many native requests are outstanding")
            request_id, self._next_id = self._next_id, self._next_id + 1
            waiter: queue.Queue[Any] = queue.Queue(maxsize=1)
            self._replies[request_id] = waiter
            self._request_context[request_id] = (method, params.get("sessionId") if isinstance(params.get("sessionId"), str) else None)
        try:
            self._write({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
        except BaseException:
            with self._lock:
                self._replies.pop(request_id, None)
                self._request_context.pop(request_id, None)
            raise
        return request_id, waiter

    def _wait_call(self, method: str, request_id: int, waiter: queue.Queue[Any]) -> dict[str, Any]:
        try:
            try:
                message = waiter.get(timeout=self.timeout)
            except queue.Empty:
                error = AmcProtocolError(f"no correlated reply to {method} within the request timeout")
                self._fail(error)
                raise error from None
            if isinstance(message, BaseException):
                raise message
            if "error" in message:
                error = message["error"]
                raise AmcRefusedError(error["code"], error["message"], error.get("data"))
            return message["result"]
        finally:
            with self._lock:
                self._replies.pop(request_id, None)
                self._request_context.pop(request_id, None)

    def _call(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        request_id, waiter = self._begin_call(method, params)
        return self._wait_call(method, request_id, waiter)

    def _notify(self, method: str, params: dict[str, Any]) -> None:
        self._write({"jsonrpc": "2.0", "method": method, "params": params})

    def new_session(self, cwd: Optional[str] = None) -> Session:
        if cwd is not None and os.path.abspath(cwd) != self.workspace:
            raise AmcError("the workspace is fixed at process launch")
        result = self._call("session/new", {"cwd": self.workspace, "mcpServers": []})
        session_id = result.get("sessionId")
        with self._lock:
            invalid = not _identity(session_id) or session_id in self._sessions
            if not invalid:
                self._sessions.add(session_id)
        if invalid:
            error = AmcProtocolError("native agent returned an invalid or repeated session identity")
            self._fail(error)
            raise error
        return Session(self, session_id)

    def resume_session(self, session_id: str) -> Session:
        if self.capabilities.get("loadSession") is not True:
            raise AmcRefusedError(-32601, "this installed ACP runtime does not support verified session loading")
        with self._lock:
            if not _identity(session_id) or session_id in self._sessions or session_id in self._loading:
                raise AmcError("choose an existing session not already owned by this client")
            history = _Updates()
            self._loading[session_id] = history
        try:
            self._call("session/load", {"sessionId": session_id, "cwd": self.workspace, "mcpServers": []})
            with self._lock:
                self._sessions.add(session_id)
            return Session(self, session_id, copy.deepcopy(history.items))
        finally:
            with self._lock:
                self._loading.pop(session_id, None)

    def _prompt(self, session_id: str, text: str) -> Turn:
        if not isinstance(text, str) or not text.strip():
            raise ValueError("a prompt must contain text")
        with self._lock:
            if session_id not in self._sessions or session_id in self._turns or session_id in self._releasing:
                raise AmcError("session is not owned or already has an active prompt")
            turn = Turn(self, session_id)
            self._turns[session_id] = turn
        try:
            request_id, waiter = self._begin_call("session/prompt", {"sessionId": session_id, "prompt": [{"type": "text", "text": text}]})
        except BaseException:
            with self._lock:
                self._turns.pop(session_id, None)
            raise
        def work() -> None:
            try:
                response = self._wait_call("session/prompt", request_id, waiter)
                with self._lock:
                    if self._turns.get(session_id) is turn:
                        self._turns.pop(session_id, None)
                turn._finish(response)
            except BaseException as error:
                turn._fail(error)
                if isinstance(error, AmcProtocolError):
                    self._fail(error)
            finally:
                with self._lock:
                    if self._turns.get(session_id) is turn:
                        self._turns.pop(session_id, None)
        threading.Thread(target=work, daemon=True).start()
        return turn

    def _release(self, session_id: str) -> None:
        meta = self.capabilities.get("_meta", {})
        extension = meta.get("dev.agentmaturity.amc", {}) if isinstance(meta, dict) else {}
        if not isinstance(extension, dict) or extension.get("releaseSession") is not True:
            raise AmcRefusedError(-32601, "this installed ACP runtime does not support explicit session handoff")
        with self._lock:
            if session_id not in self._sessions or session_id in self._turns or session_id in self._releasing:
                raise AmcError("only an idle owned session can be released")
            self._releasing.add(session_id)
        try:
            self._call("_amc/session/release", {"sessionId": session_id})
            with self._lock:
                self._sessions.discard(session_id)
        finally:
            with self._lock:
                self._releasing.discard(session_id)

    @property
    def stderr(self) -> list[str]:
        """At most the last 64 KiB; never appended automatically to errors."""
        with self._lock:
            return bytes(self._stderr).decode("utf-8", errors="replace").splitlines()

    def _close_safely(self) -> None:
        try:
            self.close()
        except AmcError:
            pass

    def close(self) -> None:
        with self._lock:
            already = self._close_started
            self._close_started = True
            turns = list(self._turns.values())
        if already:
            if not self._closed.wait(timeout=15):
                raise AmcProtocolError("native process cleanup has not settled within its deadline")
            if self._close_error:
                raise self._close_error
            return
        try:
            for turn in turns:
                try:
                    turn.cancel()
                except AmcError:
                    pass
            try:
                with self._lock:
                    self._closing = True
                    self._writes.put_nowait(None)
            except queue.Full:
                self._proc.terminate()
            if self._fatal is not None and self._proc.poll() is None:
                self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.terminate()
                try:
                    self._proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self._proc.kill()
                    self._proc.wait(timeout=2)
            for thread in [self._writer, self._reader, self._errors]:
                if thread is not threading.current_thread():
                    thread.join(timeout=1)
            with self._lock:
                outstanding = list(self._replies.values())
                self._replies.clear()
                self._request_context.clear()
                active = list(self._turns.values())
                self._sessions.clear()
            error = self._fatal or AmcProtocolError("native client closed before the request completed")
            for waiter in outstanding:
                try:
                    waiter.put_nowait(error)
                except queue.Full:
                    pass
            for turn in active:
                turn._fail(error)
            for stream in [self._proc.stdin, self._proc.stdout, self._proc.stderr]:
                if stream is not None:
                    stream.close()
            if self._proc.returncode != 0 and self._fatal is None:
                self._close_error = AmcProtocolError("native agent shutdown did not complete cleanly; verify before continuing")
        except (OSError, subprocess.TimeoutExpired) as error:
            self._close_error = AmcProtocolError("could not reap the owned native agent process")
            self._close_error.__cause__ = error
        finally:
            self._closed.set()
        if self._close_error:
            raise self._close_error

    def __enter__(self) -> AmcAgent:
        return self

    def __exit__(self, exc_type: Any, *_exc: object) -> None:
        if exc_type is None:
            self.close()
        else:
            self._close_safely()


class Session:
    """A process-owned native session; historical updates are separate from new turns."""
    def __init__(self, agent: AmcAgent, session_id: str, history: Optional[list[SessionUpdate]] = None) -> None:
        self._agent, self.session_id = agent, session_id
        self.history = history or []
        self.state = "accepted"

    def prompt(self, text: str) -> RunResult:
        return self.start_prompt(text).result()

    def start_prompt(self, text: str) -> Turn:
        if self.state == "released":
            raise AmcError("this session was released; resume it before submitting work")
        return self._agent._prompt(self.session_id, text)

    def cancel(self) -> None:
        with self._agent._lock:
            turn = self._agent._turns.get(self.session_id)
        if turn is not None:
            turn.cancel()

    def release(self) -> None:
        """Commit an explicit owner handoff. A fresh client may then verify and resume it."""
        self._agent._release(self.session_id)
        self.state = "released"
