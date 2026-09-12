"""A bounded, correlated ACP client for the installed AMC native runtime.

Updates contain committed blocks, never raw provider token deltas. Results and
replayed history are not verification receipts. ``end_turn`` can also represent
blocked/error/interrupted endings; inspect metadata and verify separately.
"""
from __future__ import annotations

import base64
import binascii
import copy
import json
import math
import os
import queue
import re
import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Generator, Literal, Optional

__all__ = ["AmcAgent", "Session", "Turn", "SessionUpdate", "RunResult", "ToolCall",
           "NativeValidationStatus", "NativeValidationCheckStatus", "NativeValidationCheckResult",
           "NativeValidationResult", "NativeImageInput", "NativeInputPart", "NATIVE_ORDERED_INPUT_FORMAT",
           "NativeAudioInput", "NativeAudioPart", "NATIVE_AUDIO_INPUT_FORMAT",
           "AmcError", "AmcProtocolError", "AmcRefusedError", "AmcTimeoutError"]
DEFAULT_TIMEOUT_SECONDS = 120.0
MAX_FRAME_BYTES = 1024 * 1024
# Matches native NdjsonFramer ingress; response frames have a separate bound.
MAX_REQUEST_LINE_BYTES = 262144
MAX_OUTPUT_BYTES = 8 * 1024 * 1024
MAX_UPDATES = 32768
MAX_PENDING = 32
NATIVE_ORDERED_INPUT_FORMAT = "amc-image-input@2"
NATIVE_AUDIO_INPUT_FORMAT = "amc-audio-input@1"
MAX_NATIVE_INPUT_PARTS = 256
STOP_REASONS = {"end_turn", "max_tokens", "max_turn_requests", "refusal", "cancelled"}
UPDATE_KINDS = {"agent_message_chunk", "user_message_chunk", "tool_call", "tool_call_update"}
MAX_VALIDATION_CHECKS = 8
MAX_VALIDATION_CONFIG_PATH_BYTES = 4096
_CHECK_ID = re.compile(r"[a-zA-Z0-9_-]{1,64}")
_SHA256 = re.compile(r"[a-f0-9]{64}")
# Match JavaScript String.trim, rather than Python's broader Unicode whitespace.
_JS_WHITESPACE = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
NativeValidationStatus = Literal["not-requested", "pending", "passed", "failed", "unavailable"]
NativeValidationCheckStatus = Literal["pending", "passed", "failed", "unavailable"]


class AmcError(Exception):
    """Base class for client failures."""


class AmcProtocolError(AmcError):
    """A malformed, uncorrelated, oversized or failed transport; never retry blindly."""


class AmcRefusedError(AmcError):
    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(f"[{code}] {message}")
        self.code, self.message, self.data = code, message, data


class AmcTimeoutError(AmcProtocolError):
    """A deadline expired, not evidence that execution stopped.

    ``fatal`` means the transport is being shut down, not that cleanup already
    finished. A nonfatal consumer wait timeout leaves the turn's eventual result
    available. ``cancellation_requested`` records enqueueing, not acknowledgement.
    Existing callers catching AmcProtocolError remain compatible.
    """
    def __init__(self, message: str, *, operation: str, session_id: Optional[str] = None,
                 cancellation_requested: bool = False, fatal: bool = False) -> None:
        super().__init__(message)
        self.operation = operation
        self.session_id = session_id
        self.cancellation_requested = cancellation_requested
        self.fatal = fatal


def _timeout_seconds(value: Any, *, allow_zero: bool = False) -> float:
    minimum = 0 if allow_zero else 0.0
    if (type(value) not in (int, float) or value < minimum or (not allow_zero and value == 0)
            or value > threading.TIMEOUT_MAX or not math.isfinite(value)):
        raise ValueError("timeout must be finite, nonnegative" if allow_zero else "timeout must be finite and positive")
    return float(value)


@dataclass(frozen=True)
class NativeImageInput:
    """Original image bytes, copied on construction; never a path or URL.

    ACP v1 has data/mimeType, not a filename/digest field. The native runtime
    assigns a safe attachment name and commits the byte digest itself. Header
    checks are not full codec validation or a malware verdict; server admission
    and the signed inbox remain authoritative. ACP's 256 KiB request-line bound
    includes JSON and base64 overhead; incoming response frames allow 1 MiB.
    """
    data: bytes
    mime_type: str

    def __post_init__(self) -> None:
        if not isinstance(self.data, (bytes, bytearray, memoryview)) or not 0 < (self.data.nbytes if isinstance(self.data, memoryview) else len(self.data)) <= 4 * 1024 * 1024:
            raise ValueError("image input requires bounded original bytes (at most 4 MiB)")
        data = bytes(self.data)
        detected = None
        if (len(data) >= 33 and data[:8] == b"\x89PNG\r\n\x1a\n" and data[8:12] == b"\0\0\0\r"
                and data[12:16] == b"IHDR" and int.from_bytes(data[16:20], "big") > 0 and int.from_bytes(data[20:24], "big") > 0):
            detected = "image/png"
        elif len(data) >= 4 and data[:2] == b"\xff\xd8" and data[-2:] == b"\xff\xd9":
            detected = "image/jpeg"
        elif (len(data) >= 14 and data[:6] in (b"GIF87a", b"GIF89a") and data[-1:] == b";"
                and int.from_bytes(data[6:8], "little") > 0 and int.from_bytes(data[8:10], "little") > 0):
            detected = "image/gif"
        elif (len(data) >= 20 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
                and int.from_bytes(data[4:8], "little") + 8 == len(data) and data[12:16] in (b"VP8 ", b"VP8L", b"VP8X")):
            detected = "image/webp"
        if detected is None or self.mime_type != detected:
            raise ValueError("image MIME and original bytes disagree or the image format is unsupported")
        object.__setattr__(self, "data", data)


NativeInputPart = str | NativeImageInput


@dataclass(frozen=True)
class NativeAudioInput:
    """Original PCM16 WAV bytes, copied before submission; not a decoder or safety verdict.

    The native version accepts exactly RIFF/WAVE, fmt(16), then data, mono/stereo,
    8–192 kHz. Metadata chunks, compressed/float WAV, URLs and provider files are
    refused rather than transcoded. The server assigns its own safe attachment
    filename and signs original length/digest/order. ACP ingress remains 256 KiB
    including JSON/base64 overhead, below the separate 4 MiB local binary limit.
    """
    data: bytes
    mime_type: str

    def __post_init__(self) -> None:
        if not isinstance(self.data, (bytes, bytearray, memoryview)) or not 46 <= (self.data.nbytes if isinstance(self.data, memoryview) else len(self.data)) <= 4 * 1024 * 1024:
            raise ValueError("audio requires original bounded WAV bytes (at most 4 MiB)")
        data = bytes(self.data)
        u16 = lambda start: int.from_bytes(data[start:start + 2], "little")
        u32 = lambda start: int.from_bytes(data[start:start + 4], "little")
        channels, rate, align = u16(22), u32(24), u16(32)
        if (self.mime_type != "audio/wav" or data[:4] != b"RIFF" or u32(4) + 8 != len(data)
                or data[8:12] != b"WAVE" or data[12:16] != b"fmt " or u32(16) != 16 or u16(20) != 1
                or data[36:40] != b"data" or u32(40) != len(data) - 44 or channels not in (1, 2)
                or not 8000 <= rate <= 192000 or u16(34) != 16 or align != channels * 2
                or u32(28) != rate * align or (len(data) - 44) % align != 0):
            raise ValueError("audio MIME and original PCM16 WAV header/length disagree or the layout is unsupported")
        object.__setattr__(self, "data", data)


NativeAudioPart = str | NativeImageInput | NativeAudioInput


def _audio_blocks(parts: list[NativeAudioPart] | tuple[NativeAudioPart, ...]) -> list[dict[str, str]]:
    if not isinstance(parts, (list, tuple)) or not 1 <= len(parts) <= 256:
        raise ValueError("audio input requires one through 256 ordered parts")
    layout = tuple(parts)
    if any(not isinstance(part, (str, NativeImageInput, NativeAudioInput)) for part in layout):
        raise ValueError("audio parts must be original text/image/audio; unsupported content is not discarded")
    blocks: list[dict[str, str]] = []
    audio_count, image_count, media_bytes, text_bytes = 0, 0, 0, 0
    for part in layout:
        if isinstance(part, str):
            try:
                text_bytes += len(part.encode("utf-8"))
            except UnicodeError as error:
                raise ValueError("audio sequence text must be lossless UTF-8") from error
            if text_bytes > 16 * 1024 * 1024:
                raise ValueError("audio sequence text exceeds its bound")
            blocks.append({"type": "text", "text": part})
            continue
        if isinstance(part, NativeAudioInput):
            snapshot = NativeAudioInput(part.data, part.mime_type)
            audio_count += 1
            kind = "audio"
        else:
            snapshot = NativeImageInput(part.data, part.mime_type)
            image_count += 1
            kind = "image"
            if snapshot.mime_type not in ("image/png", "image/jpeg", "image/webp"):
                raise ValueError("Gemini audio input cannot convert unsupported image MIME types")
        media_bytes += len(snapshot.data)
        if audio_count > 8 or image_count > 8 or media_bytes > 8 * 1024 * 1024:
            raise ValueError("combined original audio/image input exceeds native count or 8 MiB bounds")
        blocks.append({"type": kind, "mimeType": snapshot.mime_type, "data": base64.b64encode(snapshot.data).decode("ascii")})
    if audio_count == 0:
        raise ValueError("amc-audio-input@1 requires audio; use the separate legacy text/image APIs otherwise")
    return blocks


def _advertises_audio(capabilities: Any) -> bool:
    if not isinstance(capabilities, dict):
        return False
    prompt, meta = capabilities.get("promptCapabilities"), capabilities.get("_meta")
    extension = meta.get("dev.agentmaturity.amc") if isinstance(meta, dict) else None
    contract = extension.get("audioInput") if isinstance(extension, dict) else None
    return (isinstance(prompt, dict) and prompt.get("audio") is True and isinstance(contract, dict)
            and contract.get("format") == NATIVE_AUDIO_INPUT_FORMAT and contract.get("encoderId") == "gemini-generate-content"
            and type(contract.get("encoderVersion")) is int and contract.get("encoderVersion") == 2
            and contract.get("mimeTypes") == ["audio/wav"])


def _read_audio_content(content: dict[str, Any]) -> None:
    data = content.get("data")
    if set(content) != {"type", "mimeType", "data"} or content.get("type") != "audio" or not isinstance(data, str) or len(data) > 4 * ((4 * 1024 * 1024 + 2) // 3):
        raise AmcProtocolError("invalid, annotated or oversized audio history update")
    try:
        decoded = base64.b64decode(data, validate=True)
        if base64.b64encode(decoded).decode("ascii") != data:
            raise ValueError("noncanonical base64")
        NativeAudioInput(decoded, content.get("mimeType"))
    except (ValueError, TypeError, binascii.Error) as error:
        raise AmcProtocolError("invalid original audio history bytes or MIME") from error


def _image_blocks(images: Optional[list[NativeImageInput] | tuple[NativeImageInput, ...]]) -> list[dict[str, str]]:
    if images is None:
        return []
    if not isinstance(images, (list, tuple)) or len(images) > 8:
        raise ValueError("submit at most eight native images")
    blocks: list[dict[str, str]] = []
    total = 0
    for image in images:
        if not isinstance(image, NativeImageInput):
            raise ValueError("images must contain NativeImageInput values")
        snapshot = NativeImageInput(image.data, image.mime_type)
        total += len(snapshot.data)
        if total > 8 * 1024 * 1024:
            raise ValueError("native image input exceeds the 8 MiB aggregate limit")
        blocks.append({"type": "image", "mimeType": snapshot.mime_type,
                       "data": base64.b64encode(snapshot.data).decode("ascii")})
    return blocks


def _ordered_blocks(parts: list[NativeInputPart] | tuple[NativeInputPart, ...]) -> list[dict[str, str]]:
    """Snapshot every part before submission; no joined text or mutable byte authority."""
    if not isinstance(parts, (list, tuple)) or not 1 <= len(parts) <= MAX_NATIVE_INPUT_PARTS:
        raise ValueError("ordered image input requires one through 256 parts")
    layout = tuple(parts)
    if any(not isinstance(part, (str, NativeImageInput)) for part in layout):
        raise ValueError("ordered parts must be text strings or NativeImageInput values; unsupported content is not discarded")
    images = _image_blocks([part for part in layout if isinstance(part, NativeImageInput)])
    if not images:
        raise ValueError("ordered image input requires an image; use the legacy text prompt API for text-only input")
    blocks: list[dict[str, str]] = []
    image_index, text_bytes = 0, 0
    for part in layout:
        if isinstance(part, str):
            try:
                text_bytes += len(part.encode("utf-8"))
            except UnicodeError as error:
                raise ValueError("ordered text must be losslessly representable UTF-8") from error
            if text_bytes > 16 * 1024 * 1024:
                raise ValueError("ordered text exceeds the native payload bound")
            blocks.append({"type": "text", "text": part})
        else:
            blocks.append(images[image_index])
            image_index += 1
    return blocks


def _read_image_content(content: dict[str, Any]) -> None:
    data = content.get("data")
    if not isinstance(data, str) or len(data) > 4 * ((4 * 1024 * 1024 + 2) // 3):
        raise AmcProtocolError("invalid or oversized image update")
    try:
        decoded = base64.b64decode(data, validate=True)
        if base64.b64encode(decoded).decode("ascii") != data:
            raise ValueError("noncanonical base64")
        NativeImageInput(decoded, content.get("mimeType"))
    except (ValueError, TypeError, binascii.Error) as error:
        raise AmcProtocolError("invalid image update bytes or MIME") from error


@dataclass(frozen=True)
class ToolCall:
    tool_call_id: str
    title: str
    status: str
    output: Optional[str] = None
    # Appended fields retain the original positional constructor. Raw values and
    # metadata are reported transport data, not execution authority or receipts.
    kind: Optional[str] = None
    raw_input: Any = None
    raw_output: Any = None
    content: tuple[dict[str, Any], ...] = ()
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SessionUpdate:
    """A committed ACP block notification, not a signature-verification result."""
    session_id: str
    update: dict[str, Any]


@dataclass(frozen=True)
class NativeValidationCheckResult:
    """One public check's reported outcome; its event identity is not a proof."""
    id: str
    title: str
    status: NativeValidationCheckStatus
    call_id: Optional[str]
    exit_code: Optional[int]
    timed_out: bool
    reason: Optional[str]
    output_event_id: Optional[str]


@dataclass(frozen=True)
class NativeValidationResult:
    """Strictly decoded native public checks, independent of completion/verification."""
    status: NativeValidationStatus
    turn: Optional[int]
    config_sha256: Optional[str]
    checks: tuple[NativeValidationCheckResult, ...]


def _unavailable_validation() -> NativeValidationResult:
    return NativeValidationResult("unavailable", None, None, ())


@dataclass(frozen=True)
class RunResult:
    """Completion, public validation and evidence verification are separate outcomes."""
    session_id: str
    stop_reason: str
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)
    updates: list[SessionUpdate] = field(default_factory=list)
    verification: str = "not-verified"
    # Append after legacy fields to preserve positional construction compatibility.
    validation: NativeValidationResult = field(default_factory=_unavailable_validation)

    @property
    def cancelled(self) -> bool:
        return self.stop_reason == "cancelled"


def _invalid_constant(_value: str) -> None:
    raise ValueError("JSON numeric constants must be finite")


def _finite_float(value: str) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("JSON numbers must be finite")
    return result


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON object member")
        result[key] = value
    return result


def _identity(value: Any) -> bool:
    return isinstance(value, str) and 0 < len(value) <= 1024 and not any(ord(c) < 32 or ord(c) == 127 for c in value)


def _wire_string(value: Any, maximum: int) -> bool:
    # Native Zod string limits count UTF-16 code units, not Python code points.
    return isinstance(value, str) and 1 <= len(value.encode("utf-16-le", errors="surrogatepass")) // 2 <= maximum


def _wire_integer(value: Any) -> bool:
    # JSON 1 and 1.0 are the same JS number. Reject booleans/strings, fractions,
    # non-finite numbers and values outside native Zod 4's safe integer range.
    return type(value) in (int, float) and -(2**53 - 1) <= value <= 2**53 - 1 and (type(value) is int or value.is_integer())


def _parse_native_validation_result(value: Any) -> NativeValidationResult:
    """Port of src/agent/nativeValidationResult.ts; wire validation, not authentication."""
    def refuse() -> None:
        raise AmcProtocolError("native prompt returned invalid validation metadata")

    if not isinstance(value, dict) or set(value) != {"status", "turn", "configSha256", "checks"}:
        refuse()
    status, turn, digest, raw_checks = value["status"], value["turn"], value["configSha256"], value["checks"]
    if not isinstance(status, str) or status not in {"not-requested", "pending", "passed", "failed", "unavailable"}:
        refuse()
    if turn is not None and (not _wire_integer(turn) or turn < 1):
        refuse()
    if digest is not None and (not isinstance(digest, str) or _SHA256.fullmatch(digest) is None):
        refuse()
    if not isinstance(raw_checks, list) or len(raw_checks) > MAX_VALIDATION_CHECKS:
        refuse()
    checks: list[NativeValidationCheckResult] = []
    ids: set[str] = set()
    for check in raw_checks:
        if not isinstance(check, dict) or set(check) != {"id", "title", "status", "callId", "exitCode", "timedOut", "reason", "outputEventId"}:
            refuse()
        check_id, title, check_status = check["id"], check["title"], check["status"]
        if not isinstance(check_id, str) or _CHECK_ID.fullmatch(check_id) is None or check_id in ids:
            refuse()
        if not _wire_string(title, 160) or not title.strip(_JS_WHITESPACE) or any(ord(c) < 32 or ord(c) == 127 for c in title):
            refuse()
        if not isinstance(check_status, str) or check_status not in {"pending", "passed", "failed", "unavailable"}:
            refuse()
        for key in ("callId", "reason", "outputEventId"):
            if check[key] is not None and not _wire_string(check[key], 128):
                refuse()
        exit_code, timed_out = check["exitCode"], check["timedOut"]
        if (exit_code is not None and not _wire_integer(exit_code)) or type(timed_out) is not bool:
            refuse()
        call_id, reason, output_id = check["callId"], check["reason"], check["outputEventId"]
        if check_status == "passed" and (exit_code != 0 or timed_out or reason is not None or call_id is None or output_id is None):
            refuse()
        if check_status == "failed" and (exit_code is None or exit_code == 0 or timed_out or reason != "nonzero-exit" or call_id is None or output_id is None):
            refuse()
        if check_status == "pending" and (exit_code is not None or timed_out or reason is not None or output_id is not None):
            refuse()
        if check_status == "unavailable" and reason is None:
            refuse()
        ids.add(check_id)
        checks.append(NativeValidationCheckResult(check_id, title, check_status, call_id,
                      None if exit_code is None else int(exit_code), timed_out, reason, output_id))
    if status == "not-requested":
        if digest is not None or checks:
            refuse()
    elif not (status == "unavailable" and not checks):
        if turn is None or digest is None or not checks:
            refuse()
        aggregate = ("failed" if any(check.status == "failed" for check in checks) else
                     "pending" if any(check.status == "pending" for check in checks) else
                     "unavailable" if any(check.status == "unavailable" for check in checks) else "passed")
        # Native ongoing turns may remain pending until the signed finished row.
        if status != aggregate and status != "pending":
            refuse()
    return NativeValidationResult(status, None if turn is None else int(turn), digest, tuple(checks))


def _prompt_validation(response: dict[str, Any]) -> NativeValidationResult:
    if not isinstance(response.get("stopReason"), str) or response["stopReason"] not in STOP_REASONS or not isinstance(response.get("_meta", {}), dict):
        raise AmcProtocolError("native prompt returned an invalid outcome")
    extension = response.get("_meta", {}).get("dev.agentmaturity.amc")
    # Match the native client's legacy/non-object extension behavior. An explicit
    # validation value (including null) must decode; absence is never a pass.
    if not isinstance(extension, dict) or "validation" not in extension:
        return _unavailable_validation()
    return _parse_native_validation_result(extension["validation"])


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

    Closing the iterator requests cancellation. Python does not guarantee that
    breaking a retained generator closes it: use ``with session.start_prompt(...)
    as turn`` or explicitly close the iterator/turn when leaving a stream early.
    The final response, not cancellation, determines whether the turn stopped.
    """
    def __init__(self, agent: AmcAgent, session_id: str) -> None:
        self._agent, self.session_id = agent, session_id
        self._condition = threading.Condition()
        self._updates = _Updates()
        self._done = False
        self._error: Optional[BaseException] = None
        self._result: Optional[RunResult] = None
        self._iterated = False
        self._cancel_requested = False
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
        validation = _prompt_validation(response)
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
                    # ACP content updates replace the reported content. Retain
                    # all blocks, not just the last text block; omission/null
                    # leaves the previous snapshot intact, while [] clears it.
                    content = (tuple(copy.deepcopy(update["content"])) if isinstance(update.get("content"), list)
                               else previous.content if previous else ())
                    texts = [item["content"]["text"] for item in content
                             if isinstance(item.get("content"), dict) and item["content"].get("type") == "text"]
                    output = "".join(texts) if texts else None
                    tools[key] = ToolCall(key, update.get("title", previous.title if previous else "tool"),
                                          update.get("status", previous.status if previous else "pending"), output,
                                          update.get("kind", previous.kind if previous else None),
                                          copy.deepcopy(update.get("rawInput", previous.raw_input if previous else None)),
                                          copy.deepcopy(update.get("rawOutput", previous.raw_output if previous else None)),
                                          content, copy.deepcopy(update.get("_meta", previous.meta if previous else {})))
            self._result = RunResult(self.session_id, response["stopReason"], "".join(chunks),
                                     list(tools.values()), copy.deepcopy(response.get("_meta", {})),
                                     copy.deepcopy(self._updates.items), validation=validation)
            self._done, self.state = True, "completed"
            self._condition.notify_all()

    def _fail(self, error: BaseException) -> None:
        with self._condition:
            if not self._done:
                self._done, self._error, self.state = True, error, "failed"
                self._condition.notify_all()

    def cancel(self) -> None:
        # Do not hold the turn condition while acquiring the client's lock.
        # Completion and cancellation both use client -> turn lock ordering.
        if not self.done:
            self._agent._cancel_turn(self)

    @property
    def done(self) -> bool:
        with self._condition:
            return self._done

    @property
    def updates(self) -> tuple[SessionUpdate, ...]:
        """Detached committed updates, also available after a refused/failed turn."""
        with self._condition:
            return tuple(copy.deepcopy(self._updates.items))

    def _wait_timeout(self, operation: str) -> AmcTimeoutError:
        self.cancel()
        with self._condition:
            requested = self._cancel_requested
        return AmcTimeoutError("waiting for the turn timed out; inspect its eventual result before resubmitting",
                               operation=operation, session_id=self.session_id,
                               cancellation_requested=requested)

    def result(self, timeout: Optional[float] = None) -> RunResult:
        """Wait for the outcome. A local wait deadline requests cancellation only.

        This is distinct from the request deadline configured at submission;
        after a local wait timeout, this method may be called again on this turn.
        Zero permits a nonblocking poll; invalid timeouts never cancel work.
        """
        if timeout is not None:
            timeout = _timeout_seconds(timeout, allow_zero=True)
        try:
            with self._condition:
                if self._condition.wait_for(lambda: self._done, timeout=timeout):
                    if self._error:
                        raise self._error
                    assert self._result is not None
                    return copy.deepcopy(self._result)
        except BaseException:
            # KeyboardInterrupt must not abandon a still-spending prompt, even
            # when the caller did not wrap the whole agent in a context manager.
            # Cancellation failure must not replace the original interruption.
            try:
                self.cancel()
            except AmcError:
                pass
            raise
        raise self._wait_timeout("turn/result")

    def __iter__(self) -> Generator[SessionUpdate, None, None]:
        return self.iter_updates()

    def iter_updates(self, timeout: Optional[float] = None) -> Generator[SessionUpdate, None, None]:
        """One committed-update iterator; optional total consumer wait deadline."""
        deadline = None if timeout is None else time.monotonic() + _timeout_seconds(timeout, allow_zero=True)
        with self._condition:
            if self._iterated:
                raise AmcError("a turn permits one update iterator; result() retains the updates")
            self._iterated = True
        cursor = 0
        failed = False
        try:
            while True:
                with self._condition:
                    ready = self._condition.wait_for(lambda: cursor < len(self._updates.items) or self._done,
                                                    timeout=None if deadline is None else max(0.0, deadline - time.monotonic()))
                    if cursor < len(self._updates.items):
                        item = copy.deepcopy(self._updates.items[cursor])
                        cursor += 1
                    elif self._error:
                        raise self._error
                    elif self._done:
                        return
                if not ready:
                    raise self._wait_timeout("turn/updates")
                yield item
        except GeneratorExit:
            raise
        except BaseException:
            failed = True
            raise
        finally:
            if not failed:
                # An explicit generator.close() must report a cancellation
                # enqueue failure instead of silently leaving work active.
                self.cancel()
            else:
                try:
                    self.cancel()
                except AmcError:
                    pass

    def close(self) -> None:
        """Request cancellation without releasing or sealing the parent session."""
        self.cancel()

    def __enter__(self) -> Turn:
        return self

    def __exit__(self, exc_type: Any, *_exc: object) -> None:
        if exc_type is None:
            self.close()
        else:
            try:
                self.close()
            except AmcError:
                pass


class AmcAgent:
    """Own one ``amc acp`` child. Workspace, provider and credentials are fixed at launch.

    ``stub`` remains the compatibility default and is only a local demonstration.
    Explicitly select a real provider and model for model work. No fallback is used.
    """
    def __init__(self, workspace: str = ".", *, provider: str = "stub", model: Optional[str] = None,
                 credential: Optional[str] = None, base_url: Optional[str] = None, agent_id: str = "default",
                 tools: str = "none", approve_tools: Optional[str] = None, approve_risk: Optional[str] = None,
                 mcp_config: Optional[str] = None, mcp_config_sha256: Optional[str] = None,
                 expected_tools_digest: Optional[str] = None,
                 validation_config: Optional[str] = None, validation_config_sha256: Optional[str] = None,
                 validate: Optional[list[str]] = None,
                 credentials_home: Optional[str] = None, credentials_file: Optional[str] = None,
                 credentials_mode: Optional[Literal["layered", "operator-only"]] = None,
                 thinking: Optional[Literal["enabled", "disabled"]] = None,
                 reasoning_effort: Optional[Literal["low", "high", "max"]] = None,
                 max_tokens: int = 512, max_steps: Optional[int] = None,
                 amc_bin: Optional[str | list[str]] = None, env: Optional[dict[str, str]] = None,
                 timeout: float = DEFAULT_TIMEOUT_SECONDS) -> None:
        timeout = _timeout_seconds(timeout)
        if not isinstance(tools, str) or tools not in {"none", "workspace"}:
            raise ValueError("tools must be none or workspace")
        if type(max_tokens) is not int or not 1 <= max_tokens <= 1_000_000 or (max_steps is not None and (type(max_steps) is not int or not 1 <= max_steps <= 1024)):
            raise ValueError("native token and step limits must be bounded positive integers")
        if approve_tools is not None and tools != "workspace":
            raise ValueError("signed tool approvals require tools='workspace'")
        if approve_tools is not None and (not isinstance(approve_tools, str) or approve_tools.strip(_JS_WHITESPACE).upper() not in {
                "READ_ONLY", "WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"}):
            raise ValueError("approve_tools requires a native signed-approval action class")
        if approve_risk is not None and (approve_tools is None or not isinstance(approve_risk, str) or approve_risk.lower() not in {"low", "medium", "high", "critical"}):
            raise ValueError("approve_risk requires an approval action class and a valid risk tier")
        if mcp_config is not None and (tools != "workspace" or approve_tools is None):
            raise ValueError("reviewed MCP requires workspace tools and signed approvals")
        if mcp_config_sha256 is not None and (mcp_config is None or not isinstance(mcp_config_sha256, str) or _SHA256.fullmatch(mcp_config_sha256) is None):
            raise ValueError("MCP digest requires an explicit config and lowercase SHA-256")
        if expected_tools_digest is not None and (tools != "workspace" or not isinstance(expected_tools_digest, str) or _SHA256.fullmatch(expected_tools_digest) is None):
            raise ValueError("a tool policy pin requires workspace tools and an exact lowercase SHA-256 digest")
        if validation_config is not None:
            if not isinstance(validation_config, str) or not validation_config or "\0" in validation_config:
                raise ValueError("validation_config must be an explicit nonempty path without NUL bytes")
            try:
                path_bytes = len(validation_config.encode("utf-8"))
            except UnicodeError as error:
                raise ValueError("validation_config must be a UTF-8 path") from error
            if path_bytes > MAX_VALIDATION_CONFIG_PATH_BYTES:
                raise ValueError("validation_config exceeds the 4096-byte client path limit")
        if validation_config_sha256 is not None and (validation_config is None or not isinstance(validation_config_sha256, str) or _SHA256.fullmatch(validation_config_sha256) is None):
            raise ValueError("a validation digest requires an explicit config and lowercase SHA-256")
        if validate is not None:
            if (not isinstance(validate, list) or not 1 <= len(validate) <= MAX_VALIDATION_CHECKS
                    or any(not isinstance(check_id, str) or _CHECK_ID.fullmatch(check_id) is None for check_id in validate)
                    or len(set(validate)) != len(validate)):
                raise ValueError("select one through eight distinct public validation check IDs")
            if validation_config is None:
                raise ValueError("public validation requires an explicit operator config file")
        if credentials_mode is not None and credentials_mode not in ("layered", "operator-only"):
            raise ValueError("credentials_mode must be layered or operator-only")
        if thinking is not None or reasoning_effort is not None:
            if provider != "deepseek":
                raise ValueError("thinking and reasoning_effort require provider='deepseek'; unused options are not ignored")
            if thinking is not None and thinking not in ("enabled", "disabled"):
                raise ValueError("thinking must be enabled or disabled")
            if reasoning_effort is not None and (thinking == "disabled" or reasoning_effort not in ("low", "high", "max")):
                raise ValueError("reasoning_effort requires enabled thinking and exact low/high/max")
        for value in (provider, agent_id):
            if not isinstance(value, str) or not value or "\0" in value:
                raise ValueError("provider and agent_id must be nonempty strings without NUL bytes")
        if not isinstance(workspace, (str, os.PathLike)) or not isinstance(os.fspath(workspace), str) or not os.fspath(workspace) or "\0" in os.fspath(workspace):
            raise ValueError("workspace must be a nonempty filesystem path without NUL bytes")
        # Match the child's physical cwd, including macOS /var and other aliases.
        # A caller cannot reassign the root after the process has been launched.
        self._workspace, self.timeout = os.path.realpath(os.path.abspath(workspace)), timeout
        resolved = amc_bin if amc_bin is not None else os.environ.get("AMC_BIN", "amc")
        if not isinstance(resolved, (str, list)):
            raise ValueError("amc_bin must name an executable and optional arguments")
        self._bin = list(resolved) if isinstance(resolved, list) else (["node", resolved] if resolved.endswith(".js") else [resolved])
        if not self._bin or any(not isinstance(arg, str) or not arg or "\0" in arg for arg in self._bin):
            raise ValueError("amc_bin must name an executable and optional arguments")
        if env is not None and (not isinstance(env, dict) or any(
                not isinstance(key, str) or not key or "=" in key or "\0" in key
                or not isinstance(value, str) or "\0" in value for key, value in env.items())):
            raise ValueError("env must contain valid string environment names and values")
        argv = [*self._bin, "acp", "--provider", provider, "--agent-id", agent_id, "--tools", tools, "--max-tokens", str(max_tokens)]
        for flag, value in [("--model", model), ("--credential", credential), ("--base-url", base_url),
                            ("--approve-tools", approve_tools), ("--approve-risk", approve_risk),
                            ("--mcp-config", mcp_config), ("--mcp-config-sha256", mcp_config_sha256),
                            ("--expected-tools-digest", expected_tools_digest),
                            ("--validation-config", validation_config), ("--validation-config-sha256", validation_config_sha256),
                            ("--credentials-home", credentials_home), ("--credentials-file", credentials_file),
                            ("--credentials-mode", credentials_mode), ("--thinking", thinking),
                            ("--reasoning-effort", reasoning_effort),
                            ("--max-steps", None if max_steps is None else str(max_steps))]:
            if value is not None:
                if not isinstance(value, str) or not value or "\0" in value:
                    raise ValueError("native launch options must be nonempty strings without NUL bytes")
                argv.extend([flag, value])
        for check_id in validate or []:
            argv.extend(["--validate", check_id])
        self._lock = threading.RLock()
        self._next_id = 1
        self._replies: dict[int, queue.Queue[Any]] = {}
        self._request_context: dict[int, tuple[str, Optional[str]]] = {}
        self._request_deadlines: dict[int, float] = {}
        self._turns: dict[str, Turn] = {}
        self._loading: dict[str, _Updates] = {}
        self._resuming: set[str] = set()
        self._sessions: set[str] = set()
        self._releasing: set[str] = set()
        self._fatal: Optional[BaseException] = None
        self._closing = False
        self._close_started = False
        self._closed = threading.Event()
        self._close_error: Optional[BaseException] = None
        self._capabilities: dict[str, Any] = {}
        self._wait_threads: set[threading.Thread] = set()
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
        try:
            for thread in [self._writer, self._reader, self._errors]:
                thread.start()
            result = self._call("initialize", {"protocolVersion": 1, "clientCapabilities": {}})
            if type(result.get("protocolVersion")) is not int or result["protocolVersion"] != 1:
                raise AmcProtocolError("the native agent negotiated an unsupported protocol version")
            if not isinstance(result.get("agentCapabilities"), dict) or not isinstance(result.get("agentInfo", {}), dict):
                raise AmcProtocolError("the native agent returned invalid capabilities")
            self.protocol_version, self.agent_info = 1, result.get("agentInfo", {})
            self._capabilities = copy.deepcopy(result["agentCapabilities"])
            if "loadSession" in self._capabilities and type(self._capabilities["loadSession"]) is not bool:
                raise AmcProtocolError("the native agent returned an invalid load capability")
            with self._lock:
                self._require_open_locked()
        except BaseException:
            self._close_safely()
            raise

    @property
    def workspace(self) -> str:
        return self._workspace

    @property
    def capabilities(self) -> dict[str, Any]:
        """Negotiated capabilities as a detached snapshot, never caller-granted authority."""
        return copy.deepcopy(self._capabilities)

    @property
    def closed(self) -> bool:
        """Whether the owned direct child was reaped and the close attempt settled.

        This is not a clean-shutdown or evidence-verification verdict; close()
        still raises its recorded cleanup error on subsequent calls.
        """
        return self._closed.is_set() and self._proc.poll() is not None

    def _require_open_locked(self) -> None:
        if self._fatal:
            raise self._fatal
        if self._close_started or self._closing:
            raise AmcProtocolError("native client is closed")

    def _cancel_turn(self, turn: Turn) -> bool:
        # ACP cancel is session-scoped. Keep the exact turn registered until its
        # result is settled, so an old turn can never cancel a subsequent prompt.
        with self._lock:
            if self._turns.get(turn.session_id) is not turn:
                return False
            with turn._condition:
                if turn._done:
                    return False
                if turn.state != "cancel-requested":
                    self._notify("session/cancel", {"sessionId": turn.session_id})
                    turn._cancel_requested = True
                    turn.state = "cancel-requested"
                    turn._condition.notify_all()
                return True

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
        finally:
            try:
                self._proc.stdin.close()
            except (OSError, ValueError):
                pass

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
                self._route(json.loads(line.decode("utf-8"), parse_constant=_invalid_constant,
                                       parse_float=_finite_float, object_pairs_hook=_unique_object))
        except (ValueError, TypeError, KeyError, UnicodeError, OSError, RecursionError, AmcProtocolError):
            self._fail(AmcProtocolError("native agent emitted an invalid or uncorrelated protocol frame"))
        finally:
            try:
                self._proc.stdout.close()
            except (OSError, ValueError):
                pass

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
            if kind not in UPDATE_KINDS:
                raise AmcProtocolError("unsupported native session update kind")
            if kind in {"user_message_chunk", "agent_message_chunk"}:
                content = update.get("content")
                if not isinstance(content, dict):
                    raise AmcProtocolError("invalid message update")
                if kind == "user_message_chunk" and content.get("type") == "image":
                    prompt_capabilities = self._capabilities.get("promptCapabilities")
                    if not isinstance(prompt_capabilities, dict) or prompt_capabilities.get("image") is not True:
                        raise AmcProtocolError("unnegotiated native image history")
                    _read_image_content(content)
                elif kind == "user_message_chunk" and content.get("type") == "audio":
                    if not _advertises_audio(self.capabilities):
                        raise AmcProtocolError("unnegotiated native audio history")
                    _read_audio_content(content)
                elif content.get("type") != "text" or not isinstance(content.get("text"), str):
                    raise AmcProtocolError("invalid text update")
            if kind in {"tool_call", "tool_call_update"}:
                if not _identity(update.get("toolCallId")) or update.get("status", "pending") not in {"pending", "in_progress", "completed", "failed"}:
                    raise AmcProtocolError("invalid tool update")
                if "title" in update and not isinstance(update["title"], str):
                    raise AmcProtocolError("invalid tool title")
                if "kind" in update and not isinstance(update["kind"], str):
                    raise AmcProtocolError("invalid tool kind")
                if "_meta" in update and not isinstance(update["_meta"], dict):
                    raise AmcProtocolError("invalid tool metadata")
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
            # Refuse before removing the waiter/turn: fatal transport handling
            # must still settle both rather than strand a malformed peer's turn.
            _prompt_validation(message["result"])
        with self._lock:
            # Registration and result settlement precede opening the next turn's
            # slot. Never expose an idle session with an unsettled old Turn.
            if self._replies.get(request_id) is not waiter:
                return  # The transport was failed concurrently; do not revive it.
            turn = self._turns.get(session_id) if method == "session/prompt" else None
            if method == "session/new" and "result" in message:
                new_id = message["result"].get("sessionId")
                if not _identity(new_id) or new_id in self._sessions or new_id in self._resuming:
                    raise AmcProtocolError("native agent returned an invalid or repeated session identity")
                self._sessions.add(new_id)
            if method == "session/load":
                self._loading.pop(session_id, None)
                if "result" in message:
                    self._sessions.add(session_id)
            if turn is not None:
                if "result" in message:
                    turn._finish(message["result"])
                else:
                    error = message["error"]
                    turn._fail(AmcRefusedError(error["code"], error["message"], error.get("data")))
                self._turns.pop(session_id, None)
            self._replies.pop(request_id, None)
            self._request_context.pop(request_id, None)
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
        finally:
            try:
                self._proc.stderr.close()
            except (OSError, ValueError):
                pass

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
        cleanup = threading.Thread(target=self._close_safely, daemon=True)
        try:
            cleanup.start()
        except RuntimeError:
            # Thread exhaustion must not orphan the process whose waiter failed
            # to start. close() skips joining its calling thread.
            self._close_safely()

    def _write(self, frame: dict[str, Any]) -> None:
        try:
            data = (json.dumps(frame, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
            if len(data) - 1 > MAX_REQUEST_LINE_BYTES:
                raise AmcProtocolError("native request exceeds the ACP ingress frame limit (256 KiB including JSON/base64 overhead)")
            with self._lock:
                if self._fatal:
                    raise self._fatal
                if self._closing:
                    raise AmcProtocolError("native client is closed")
                self._writes.put_nowait(data)
        except (ValueError, TypeError, UnicodeError, RecursionError, queue.Full) as error:
            raise AmcProtocolError("native request is invalid or the output queue is full") from error

    def _begin_call(self, method: str, params: dict[str, Any], *, timeout: Optional[float] = None) -> tuple[int, queue.Queue[Any]]:
        duration = _timeout_seconds(self.timeout if timeout is None else timeout)
        with self._lock:
            self._require_open_locked()
            if len(self._replies) >= MAX_PENDING:
                raise AmcProtocolError("too many native requests are outstanding")
            if self._next_id > 2**53 - 1:
                raise AmcProtocolError("native request identity space is exhausted; close this client")
            request_id, self._next_id = self._next_id, self._next_id + 1
            waiter: queue.Queue[Any] = queue.Queue(maxsize=1)
            self._replies[request_id] = waiter
            self._request_context[request_id] = (method, params.get("sessionId") if isinstance(params.get("sessionId"), str) else None)
            self._request_deadlines[request_id] = time.monotonic() + duration
            try:
                self._write({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    self._fail(AmcProtocolError(f"submission of {method} was interrupted; inspect the existing session before resubmitting"))
                self._replies.pop(request_id, None)
                self._request_context.pop(request_id, None)
                self._request_deadlines.pop(request_id, None)
                raise
        return request_id, waiter

    def _wait_call(self, method: str, request_id: int, waiter: queue.Queue[Any]) -> dict[str, Any]:
        try:
            with self._lock:
                deadline = self._request_deadlines.get(request_id, time.monotonic())
            try:
                message = waiter.get(timeout=max(0.0, deadline - time.monotonic()))
            except queue.Empty:
                with self._lock:
                    # A reply may have arrived between the queue deadline and
                    # acquiring the gate. Never poison a newly admitted turn
                    # because an old waiting thread was scheduled late.
                    try:
                        message = waiter.get_nowait()
                    except queue.Empty:
                        context = self._request_context.get(request_id)
                        session_id = context[1] if context else None
                        turn = self._turns.get(session_id) if method == "session/prompt" else None
                        requested = False
                        if turn is not None:
                            try:
                                requested = self._cancel_turn(turn)
                            except AmcError:
                                pass
                        error = AmcTimeoutError(f"no correlated reply to {method} within the request timeout",
                                                operation=method, session_id=session_id,
                                                cancellation_requested=requested, fatal=True)
                        self._fail(error)
                        raise error from None
            if isinstance(message, BaseException):
                raise message
            if "error" in message:
                error = message["error"]
                raise AmcRefusedError(error["code"], error["message"], error.get("data"))
            return message["result"]
        except (KeyboardInterrupt, SystemExit):
            # For initialize/new/load/release there may be no Turn handle to
            # cancel. An interrupted waiter must not simply forget an in-flight
            # ownership operation and leave the child running unobserved.
            self._fail(AmcProtocolError(f"waiting for {method} was interrupted; inspect the existing session before resubmitting"))
            raise
        finally:
            with self._lock:
                self._replies.pop(request_id, None)
                self._request_context.pop(request_id, None)
                self._request_deadlines.pop(request_id, None)

    def _call(self, method: str, params: dict[str, Any], *, timeout: Optional[float] = None) -> dict[str, Any]:
        request_id, waiter = self._begin_call(method, params, timeout=timeout)
        return self._wait_call(method, request_id, waiter)

    def _notify(self, method: str, params: dict[str, Any]) -> None:
        self._write({"jsonrpc": "2.0", "method": method, "params": params})

    def new_session(self, cwd: Optional[str] = None, *, timeout: Optional[float] = None) -> Session:
        if cwd is not None and os.path.realpath(os.path.abspath(cwd)) != self.workspace:
            raise AmcError("the workspace is fixed at process launch")
        result = self._call("session/new", {"cwd": self.workspace, "mcpServers": []}, timeout=timeout)
        return Session(self, result["sessionId"])

    def resume_session(self, session_id: str, *, timeout: Optional[float] = None) -> Session:
        if self.capabilities.get("loadSession") is not True:
            raise AmcRefusedError(-32601, "this installed ACP runtime does not support verified session loading")
        with self._lock:
            self._require_open_locked()
            if (not _identity(session_id) or session_id in self._sessions or session_id in self._resuming
                    or session_id in self._releasing):
                raise AmcError("choose an existing session not already owned by this client")
            history = _Updates()
            self._loading[session_id] = history
            self._resuming.add(session_id)
        try:
            self._call("session/load", {"sessionId": session_id, "cwd": self.workspace, "mcpServers": []}, timeout=timeout)
            return Session(self, session_id, copy.deepcopy(history.items))
        finally:
            with self._lock:
                self._loading.pop(session_id, None)
                self._resuming.discard(session_id)

    def _prompt(self, session_id: str, text: str, images: Optional[list[NativeImageInput] | tuple[NativeImageInput, ...]] = None,
                *, timeout: Optional[float] = None) -> Turn:
        image_blocks = _image_blocks(images)
        if not isinstance(text, str) or (not text.strip(_JS_WHITESPACE) and not image_blocks):
            raise ValueError("a prompt must contain text or a supported image")
        capabilities = self.capabilities.get("promptCapabilities")
        if image_blocks and (not isinstance(capabilities, dict) or capabilities.get("image") is not True):
            raise AmcRefusedError(-32602, "the selected ACP runtime does not advertise image input; choose a supported route or remove the images. No fallback was used.")
        return self._submit_prompt(session_id, [{"type": "text", "text": text}, *image_blocks], timeout=timeout)

    def _prompt_parts(self, session_id: str, parts: list[NativeInputPart] | tuple[NativeInputPart, ...],
                      *, timeout: Optional[float] = None) -> Turn:
        blocks = _ordered_blocks(parts)
        meta = self.capabilities.get("_meta")
        extension = meta.get("dev.agentmaturity.amc") if isinstance(meta, dict) else None
        capabilities = self.capabilities.get("promptCapabilities")
        if (not isinstance(extension, dict) or extension.get("orderedImageInput") != NATIVE_ORDERED_INPUT_FORMAT
                or not isinstance(capabilities, dict) or capabilities.get("image") is not True):
            raise AmcRefusedError(-32602, "the selected ACP runtime does not advertise amc-image-input@2; ordered content was not submitted or flattened")
        return self._submit_prompt(session_id, blocks, NATIVE_ORDERED_INPUT_FORMAT, timeout=timeout)

    def _prompt_audio_parts(self, session_id: str, parts: list[NativeAudioPart] | tuple[NativeAudioPart, ...],
                            *, timeout: Optional[float] = None) -> Turn:
        blocks = _audio_blocks(parts)
        prompt = self.capabilities.get("promptCapabilities")
        if (not _advertises_audio(self.capabilities) or (any(block["type"] == "image" for block in blocks)
                and (not isinstance(prompt, dict) or prompt.get("image") is not True))):
            raise AmcRefusedError(-32602, "the selected runtime does not advertise the exact amc-audio-input@1 Gemini v2/WAV contract; no submission, conversion or fallback was performed")
        return self._submit_prompt(session_id, blocks, NATIVE_AUDIO_INPUT_FORMAT, timeout=timeout)

    def _submit_prompt(self, session_id: str, blocks: list[dict[str, str]], input_format: Optional[str] = None,
                       *, timeout: Optional[float] = None) -> Turn:
        duration = _timeout_seconds(self.timeout if timeout is None else timeout)
        with self._lock:
            self._require_open_locked()
            if session_id not in self._sessions or session_id in self._turns or session_id in self._releasing:
                raise AmcError("session is not owned or already has an active prompt")
            turn = Turn(self, session_id)
            self._turns[session_id] = turn
            try:
                params: dict[str, Any] = {"sessionId": session_id, "prompt": blocks}
                if input_format is not None:
                    params["_meta"] = {"dev.agentmaturity.amc": {"inputFormat": input_format}}
                request_id, waiter = self._begin_call("session/prompt", params, timeout=duration)
            except BaseException:
                self._turns.pop(session_id, None)
                raise
        def work() -> None:
            try:
                # The reader settles the Turn and closes its update window. This
                # waiter enforces the original submission deadline, never a new
                # timeout starting when the thread happens to be scheduled.
                self._wait_call("session/prompt", request_id, waiter)
            except BaseException as error:
                turn._fail(error)
                if isinstance(error, AmcProtocolError):
                    self._fail(error)
            finally:
                with self._lock:
                    if self._turns.get(session_id) is turn:
                        self._turns.pop(session_id, None)
                    self._wait_threads.discard(threading.current_thread())
        worker = threading.Thread(target=work, daemon=True)
        with self._lock:
            self._wait_threads.add(worker)
            try:
                worker.start()
            except RuntimeError as cause:
                self._wait_threads.discard(worker)
                error = AmcProtocolError("could not start the native request deadline waiter")
                self._fail(error)
                raise error from cause
        return turn

    def _release(self, session_id: str, *, timeout: Optional[float] = None) -> None:
        meta = self.capabilities.get("_meta", {})
        extension = meta.get("dev.agentmaturity.amc", {}) if isinstance(meta, dict) else {}
        if not isinstance(extension, dict) or extension.get("releaseSession") is not True:
            raise AmcRefusedError(-32601, "this installed ACP runtime does not support explicit session handoff")
        with self._lock:
            self._require_open_locked()
            if session_id not in self._sessions or session_id in self._turns or session_id in self._releasing:
                raise AmcError("only an idle owned session can be released")
            self._releasing.add(session_id)
        try:
            self._call("_amc/session/release", {"sessionId": session_id}, timeout=timeout)
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
                # A writer may have drained the queue just before termination;
                # still wake it if it is now waiting for the next frame.
                try:
                    self._writes.put(None, timeout=0.25)
                except queue.Full:
                    pass
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
                if thread.ident is not None and thread is not threading.current_thread():
                    thread.join(timeout=1)
            if self._proc.returncode != 0 and self._fatal is None:
                self._close_error = AmcProtocolError("native agent shutdown did not complete cleanly; verify before continuing")
        except (OSError, subprocess.TimeoutExpired) as error:
            self._close_error = AmcProtocolError("could not reap the owned native agent process")
            self._close_error.__cause__ = error
        finally:
            # Settle every consumer even when terminate/wait/pipe cleanup failed.
            # Cleanup failure is not permission to strand a caller indefinitely.
            with self._lock:
                self._closing = True
                outstanding = list(self._replies.values())
                self._replies.clear()
                self._request_context.clear()
                self._request_deadlines.clear()
                active = list(self._turns.values())
                self._turns.clear()
                self._sessions.clear()
                self._loading.clear()
                self._resuming.clear()
                self._releasing.clear()
                waiting = list(self._wait_threads)
            error = self._fatal or AmcProtocolError("native client closed before the request completed")
            for waiter in outstanding:
                try:
                    waiter.put_nowait(error)
                except queue.Full:
                    pass
            for turn in active:
                turn._fail(error)
            deadline = time.monotonic() + 1.0
            for thread in waiting:
                if thread.ident is not None and thread is not threading.current_thread():
                    thread.join(timeout=max(0.0, deadline - time.monotonic()))
            for thread, stream in [(self._writer, self._proc.stdin), (self._reader, self._proc.stdout),
                                   (self._errors, self._proc.stderr)]:
                # Buffered stream.close() can block on a lock held by a reader
                # whose pipe was inherited by another process. Never report that
                # case as clean closure, and never turn a bounded join into an
                # unbounded close. The owning thread closes its stream on exit.
                if thread.is_alive() or self._proc.poll() is None:
                    self._close_error = self._close_error or AmcProtocolError("native process or pipe cleanup did not settle within its deadline")
                elif stream is not None:
                    try:
                        stream.close()
                    except (OSError, ValueError) as cause:
                        self._close_error = self._close_error or AmcProtocolError("could not close a native process pipe")
                        self._close_error.__cause__ = cause
            self._closed.set()
        if self._close_error:
            raise self._close_error

    def __enter__(self) -> AmcAgent:
        with self._lock:
            self._require_open_locked()
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
        self.history = copy.deepcopy(history) if history else []
        self._state = "accepted"
        self._state_lock = threading.RLock()

    @property
    def state(self) -> str:
        with self._state_lock:
            if self._state == "released":
                return self._state
            if self._agent.closed:
                return "closed"
            return "closing" if self._agent._close_started else "accepted"

    def _require_usable(self) -> None:
        if self._state == "released":
            raise AmcError("this session was released; resume it before submitting work")
        with self._agent._lock:
            self._agent._require_open_locked()

    def prompt(self, text: str, *, images: Optional[list[NativeImageInput] | tuple[NativeImageInput, ...]] = None,
               timeout: Optional[float] = None) -> RunResult:
        """Await a turn with an optional per-request deadline, including queue time."""
        return self.start_prompt(text, images=images, timeout=timeout).result()

    def start_prompt(self, text: str, *, images: Optional[list[NativeImageInput] | tuple[NativeImageInput, ...]] = None,
                     timeout: Optional[float] = None) -> Turn:
        with self._state_lock:
            self._require_usable()
            return self._agent._prompt(self.session_id, text, images, timeout=timeout)

    def prompt_parts(self, parts: list[NativeInputPart] | tuple[NativeInputPart, ...],
                     *, timeout: Optional[float] = None) -> RunResult:
        """Submit an image-bearing original sequence, retaining empty/adjacent text parts."""
        return self.start_prompt_parts(parts, timeout=timeout).result()

    def start_prompt_parts(self, parts: list[NativeInputPart] | tuple[NativeInputPart, ...],
                           *, timeout: Optional[float] = None) -> Turn:
        with self._state_lock:
            self._require_usable()
            return self._agent._prompt_parts(self.session_id, parts, timeout=timeout)

    def cancel(self) -> None:
        with self._state_lock:
            # An old released handle must not cancel a later handle that resumed
            # the same session identity on this client.
            if self._state == "released":
                return
            with self._agent._lock:
                turn = self._agent._turns.get(self.session_id)
            if turn is not None:
                turn.cancel()

    def prompt_audio_parts(self, parts: list[NativeAudioPart] | tuple[NativeAudioPart, ...],
                           *, timeout: Optional[float] = None) -> RunResult:
        """Preserve original audio/image bytes and every text boundary in caller order."""
        return self.start_prompt_audio_parts(parts, timeout=timeout).result()

    def start_prompt_audio_parts(self, parts: list[NativeAudioPart] | tuple[NativeAudioPart, ...],
                                 *, timeout: Optional[float] = None) -> Turn:
        with self._state_lock:
            self._require_usable()
            return self._agent._prompt_audio_parts(self.session_id, parts, timeout=timeout)

    def release(self, *, timeout: Optional[float] = None) -> None:
        """Commit an explicit owner handoff. A fresh client may then verify and resume it."""
        with self._state_lock:
            if self._state == "released":
                return
            self._require_usable()
            self._agent._release(self.session_id, timeout=timeout)
            self._state = "released"
