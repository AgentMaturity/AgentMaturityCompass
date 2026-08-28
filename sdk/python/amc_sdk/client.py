"""Drive a governed AMC agent from Python, over the Agent Client Protocol.

The client spawns ``amc acp`` and speaks newline-delimited JSON-RPC 2.0 down the
pipe. That is the only AMC surface where a message from a client causes a turn to
actually execute: the NDJSON wire (``amc wire``) accepts work and records the
acceptance, but nothing there ever runs it.

WHY PURE STANDARD LIBRARY. ``subprocess`` + ``json`` + ``threading`` is the whole
transport. A dependency would be a supply-chain question asked on behalf of every
user of a client whose job is to talk to a local process over a pipe.

WHAT A RESULT DOES AND DOES NOT PROMISE, because this is a governance product and
the difference matters:

  ``stop_reason == "end_turn"`` does NOT mean the turn succeeded. ACP has five
  stop reasons and AMC has seven turn endings, so ``blocked`` (a governance hook
  vetoed the turn), ``error`` and ``interrupted`` all arrive as ``end_turn``.
  The real ending is in the signed log, and in ``meta`` when the mapping lost
  something. A caller that treats ``end_turn`` as success is asserting more than
  the protocol said.

  ``text`` is assembled from ``session/update`` notifications, which AMC emits
  per completed BLOCK of a completed model response — not per token. Rows are the
  only signed artifact, so a token stream would have to bypass the ledger.

  Nothing here verifies anything. Text arriving over a pipe is bytes from a
  subprocess. :meth:`Session.prove` is what produces a checkable artifact, and it
  shells out to the CLI rather than pretending the protocol carries one.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import queue
from dataclasses import dataclass, field
from typing import Any, Iterator, Optional

__all__ = [
    "AmcAgent",
    "Session",
    "RunResult",
    "ToolCall",
    "AmcError",
    "AmcProtocolError",
    "AmcRefusedError",
]

#: How long any single request waits before giving up. A hang is the worst
#: failure to diagnose, because nothing anywhere reports it.
DEFAULT_TIMEOUT_SECONDS = 120.0


class AmcError(Exception):
    """Base class for everything this client raises."""


class AmcProtocolError(AmcError):
    """The transport failed, or the far end broke the protocol."""


class AmcRefusedError(AmcError):
    """The agent refused a request, carrying the JSON-RPC code it refused with.

    Distinct from :class:`AmcProtocolError` on purpose: a refusal is an answer
    and must not be retried blindly, whereas a transport fault may be.
    """

    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.data = data


@dataclass(frozen=True)
class ToolCall:
    """A tool the agent invoked, as reported by the session update stream."""

    tool_call_id: str
    title: str
    status: str
    output: Optional[str] = None


@dataclass(frozen=True)
class RunResult:
    """What one prompt produced.

    ``stop_reason`` is the protocol's word, not a verdict — see the module note.
    """

    session_id: str
    stop_reason: str
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def cancelled(self) -> bool:
        return self.stop_reason == "cancelled"


class AmcAgent:
    """A running ``amc acp`` process.

    Use as a context manager so the child is always reaped::

        with AmcAgent(workspace=".") as agent:
            session = agent.new_session()
            print(session.prompt("hello").text)
    """

    def __init__(
        self,
        workspace: str = ".",
        *,
        provider: str = "stub",
        model: Optional[str] = None,
        amc_bin: Optional[str | list[str]] = None,
        env: Optional[dict[str, str]] = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.workspace = workspace
        self.timeout = timeout
        # Resolved from AMC_BIN or the PATH. Named explicitly because
        # `platform/python` also declares an `amc` console script; a pip install
        # of that package shadows the CLI this client means, and the failure
        # looks like a protocol error rather than the wrong binary.
        # A list so a build can be driven directly: ["node", "dist/cli.js"].
        # Bare "amc" resolves through the PATH, which on a machine with an older
        # AMC installed is how a client silently drives a binary that has no
        # `acp` command at all.
        resolved = amc_bin or os.environ.get("AMC_BIN") or "amc"
        self._bin: list[str] = (
            list(resolved) if isinstance(resolved, list)
            else (["node", resolved] if resolved.endswith(".js") else [resolved])
        )
        argv = [*self._bin, "acp", "--provider", provider]
        if model is not None:
            argv += ["--model", model]

        self._proc = subprocess.Popen(
            argv,
            cwd=workspace,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env={**os.environ, **(env or {})},
        )
        self._next_id = 1
        self._replies: dict[int, queue.Queue[dict[str, Any]]] = {}
        self._updates: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._fatal: Optional[BaseException] = None
        self._stderr: list[str] = []

        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        self._errors = threading.Thread(target=self._stderr_loop, daemon=True)
        self._errors.start()

        self._initialize()

    # ── transport ────────────────────────────────────────────────────────────

    def _read_loop(self) -> None:
        """Read frames forever, routing replies by ID and buffering updates.

        Replies are correlated by ID rather than by arrival order. The server
        answers in order today, but a client that ASSUMED that would misattribute
        a reply rather than fail the day anything answers concurrently — and a
        wrong answer that looks right is worse than an error.
        """
        assert self._proc.stdout is not None
        try:
            for line in self._proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    # Stdout is the protocol stream; anything unparseable means
                    # the stream is no longer trustworthy.
                    self._fail(AmcProtocolError("agent wrote a non-JSON line to stdout"))
                    return
                self._route(message)
        finally:
            self._fail(AmcProtocolError("the agent process closed its output"))

    def _route(self, message: dict[str, Any]) -> None:
        if "id" in message and message["id"] is not None:
            with self._lock:
                waiter = self._replies.get(message["id"])
            if waiter is not None:
                waiter.put(message)
            return
        if message.get("method") == "session/update":
            with self._lock:
                self._updates.append(message.get("params", {}))
            return
        if "error" in message:
            # A null-id error is the server's own diagnostic about the stream —
            # it is addressed to no request, and carries the reason.
            error = message["error"]
            self._fail(AmcProtocolError(f"agent rejected the stream: {error.get('message')}"))

    def _stderr_loop(self) -> None:
        assert self._proc.stderr is not None
        for line in self._proc.stderr:
            self._stderr.append(line.rstrip())

    def _fail(self, error: BaseException) -> None:
        with self._lock:
            if self._fatal is None:
                self._fatal = error
            waiters = list(self._replies.values())
        # Everything outstanding is woken, so no caller waits on a dead process.
        for waiter in waiters:
            waiter.put({"__closed__": True})

    def _call(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        if self._fatal is not None:
            raise self._fatal
        with self._lock:
            request_id = self._next_id
            self._next_id += 1
            waiter: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
            self._replies[request_id] = waiter

        frame = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
        try:
            assert self._proc.stdin is not None
            self._proc.stdin.write(json.dumps(frame) + "\n")
            self._proc.stdin.flush()
        except (BrokenPipeError, ValueError) as exc:
            raise AmcProtocolError(f"could not send {method}: {exc}") from exc

        try:
            message = waiter.get(timeout=self.timeout)
        except queue.Empty:
            raise AmcProtocolError(
                f"no reply to {method} within {self.timeout}s"
                + (f"; agent stderr: {self._stderr[-1]}" if self._stderr else "")
            ) from None
        finally:
            with self._lock:
                self._replies.pop(request_id, None)

        if message.get("__closed__"):
            raise self._fatal or AmcProtocolError("the agent stopped")
        if "error" in message:
            error = message["error"]
            raise AmcRefusedError(error.get("code", -32603), error.get("message", ""), error.get("data"))
        return message.get("result", {})

    def _notify(self, method: str, params: dict[str, Any]) -> None:
        try:
            assert self._proc.stdin is not None
            self._proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": method, "params": params}) + "\n")
            self._proc.stdin.flush()
        except (BrokenPipeError, ValueError):
            # A notification has no reply; a peer that has gone is not waiting.
            pass

    # ── protocol ─────────────────────────────────────────────────────────────

    def _initialize(self) -> None:
        result = self._call("initialize", {"protocolVersion": 1, "clientCapabilities": {}})
        self.protocol_version = result.get("protocolVersion")
        self.agent_info = result.get("agentInfo", {})
        self.capabilities = result.get("agentCapabilities", {})

    def new_session(self, cwd: Optional[str] = None) -> "Session":
        """Open a conversation. Several prompts may run on one session, in turn.

        ``mcpServers`` is always empty: this agent refuses non-empty ones rather
        than accepting servers it will never connect, which is the one place it
        knowingly departs from the protocol and says so.
        """
        result = self._call("session/new", {"cwd": cwd or os.path.abspath(self.workspace), "mcpServers": []})
        return Session(self, result["sessionId"])

    def close(self) -> None:
        if self._proc.poll() is None:
            try:
                if self._proc.stdin is not None:
                    self._proc.stdin.close()
            except (BrokenPipeError, ValueError):
                pass
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
                self._proc.wait(timeout=5)

    @property
    def stderr(self) -> list[str]:
        """Whatever the agent reported out of band. Useful when a call fails."""
        return list(self._stderr)

    def __enter__(self) -> "AmcAgent":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


class Session:
    """One AMC session: a real, ledger-backed conversation."""

    def __init__(self, agent: AmcAgent, session_id: str) -> None:
        self._agent = agent
        self.session_id = session_id
        self._seen_updates = 0

    def prompt(self, text: str) -> RunResult:
        """Run one prompt to an idle boundary and return what it produced."""
        before = len(self._agent._updates)
        result = self._agent._call(
            "session/prompt",
            {"sessionId": self.session_id, "prompt": [{"type": "text", "text": text}]},
        )
        chunks, tools = self._drain(before)
        return RunResult(
            session_id=self.session_id,
            stop_reason=result.get("stopReason", "end_turn"),
            text="".join(chunks),
            tool_calls=tools,
            meta=result.get("_meta", {}),
        )

    def cancel(self) -> None:
        """Ask the agent to stop the running prompt.

        A notification, so there is nothing to wait for: the only signal it took
        effect is the in-flight :meth:`prompt` returning ``cancelled``.
        """
        self._agent._notify("session/cancel", {"sessionId": self.session_id})

    def _drain(self, since: int) -> tuple[list[str], list[ToolCall]]:
        """Read the updates this prompt produced, and only this prompt's."""
        with self._agent._lock:
            updates = self._agent._updates[since:]
        chunks: list[str] = []
        tools: dict[str, ToolCall] = {}
        for params in updates:
            if params.get("sessionId") != self.session_id:
                continue
            update = params.get("update", {})
            kind = update.get("sessionUpdate")
            if kind == "agent_message_chunk":
                content = update.get("content", {})
                if content.get("type") == "text":
                    chunks.append(content.get("text", ""))
            elif kind == "tool_call":
                tools[update["toolCallId"]] = ToolCall(
                    tool_call_id=update["toolCallId"],
                    title=update.get("title", "tool"),
                    status=update.get("status", "pending"),
                )
            elif kind == "tool_call_update":
                existing = tools.get(update["toolCallId"])
                output = None
                for item in update.get("content", []) or []:
                    inner = item.get("content", {})
                    if inner.get("type") == "text":
                        output = inner.get("text")
                tools[update["toolCallId"]] = ToolCall(
                    tool_call_id=update["toolCallId"],
                    title=existing.title if existing else "tool",
                    status=update.get("status", "completed"),
                    output=output,
                )
        return chunks, list(tools.values())
