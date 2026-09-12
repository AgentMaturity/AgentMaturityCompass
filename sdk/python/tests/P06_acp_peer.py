"""P06 transport regression peer, not an AMC runtime or a verification oracle.

Only launched explicitly by test_P06_client.py at the later validation boundary.
No providers, credentials, tool execution or signed evidence are involved.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import struct
import sys


EXT = "dev.agentmaturity.amc"
PNG64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII="
WAV = struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", 38, b"WAVE", b"fmt ", 16,
                  1, 1, 8000, 16000, 2, 16, b"data", 2) + b"\0\0"


def main() -> None:
    mode, capture = sys.argv[1:3]
    pending: dict[str, int] = {}
    history: dict[str, list[dict]] = {}
    sequence = 0

    def send(value: dict) -> None:
        print(json.dumps(value), flush=True)

    def reply(request_id: int, value: dict) -> None:
        send({"jsonrpc": "2.0", "id": request_id, "result": value})

    def update(session_id: str, value: dict) -> None:
        send({"jsonrpc": "2.0", "method": "session/update",
              "params": {"sessionId": session_id, "update": value}})

    with Path(capture).open("w", encoding="utf-8") as record:
        record.write(json.dumps({"launch": sys.argv[3:], "cwd": os.getcwd()}) + "\n")
        record.flush()
        for line in sys.stdin:
            request = json.loads(line)
            record.write(json.dumps(request) + "\n")
            record.flush()
            method, params = request["method"], request["params"]
            request_id = request.get("id")
            session_id = params.get("sessionId")
            if method == "initialize":
                extension = {"releaseSession": True, "committedUpdates": "live-completed-blocks",
                             "orderedImageInput": "amc-image-input@2",
                             "audioInput": {"format": "amc-audio-input@1", "encoderId": "gemini-generate-content",
                                            "encoderVersion": 2, "mimeTypes": ["audio/wav"]}}
                reply(request_id, {"protocolVersion": 1, "agentInfo": {"name": "P06-regression-peer"},
                    "agentCapabilities": {"loadSession": True, "_meta": {EXT: extension},
                        "promptCapabilities": {"image": mode != "image-disabled", "audio": mode != "audio-disabled"}}})
            elif method == "session/new":
                sequence += 1
                identity = "p06-1" if mode == "duplicate-session" else f"p06-{sequence}"
                history.setdefault(identity, [])
                reply(request_id, {"sessionId": identity})
            elif method == "_amc/session/release":
                reply(request_id, {})
            elif method == "session/load":
                blocks = history.get(session_id, [])
                if mode == "image-disabled":
                    blocks = [{"type": "image", "data": PNG64, "mimeType": "image/png"}]
                if mode == "audio-disabled":
                    blocks = [{"type": "audio", "data": base64.b64encode(WAV).decode("ascii"), "mimeType": "audio/wav"}]
                for block in blocks:
                    update(session_id, {"sessionUpdate": "user_message_chunk", "content": block})
                reply(request_id, {})
            elif method == "session/cancel":
                if session_id in pending and mode != "ignore-cancel":
                    reply(pending.pop(session_id), {"stopReason": "cancelled"})
            elif method == "session/prompt":
                if mode == "exit":
                    sys.exit(4)
                if mode == "duplicate-keys":
                    print('{"jsonrpc":"2.0","id":%d,"result":{"stopReason":"end_turn","stopReason":"refusal"}}' % request_id, flush=True)
                    continue
                if mode == "nonfinite":
                    print('{"jsonrpc":"2.0","id":%d,"result":{"stopReason":"end_turn","_meta":{"overflow":1e999}}}' % request_id, flush=True)
                    continue
                if mode == "deep-json":
                    print('{"jsonrpc":"2.0","id":%d,"result":{"deep":' % request_id + "[" * 2000 + "0" + "]" * 2000 + "}}", flush=True)
                    continue
                if mode == "unknown-update":
                    update(session_id, {"sessionUpdate": "invented_completion", "verified": True})
                    continue
                if mode == "bad-validation":
                    reply(request_id, {"stopReason": "end_turn", "_meta": {EXT: {"validation": None}}})
                    continue
                blocks = params["prompt"]
                text = "".join(block.get("text", "") for block in blocks if block["type"] == "text")
                update(session_id, {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "committed "}})
                if text == "@refuse":
                    send({"jsonrpc": "2.0", "id": request_id,
                          "error": {"code": -32602, "message": "fixture refusal retained exactly", "data": {"reason": "P06_REFUSED"}}})
                    continue
                history.setdefault(session_id, []).extend(blocks)
                if text == "@hold":
                    pending[session_id] = request_id
                    continue
                tool_id = f"tool-{request_id}"
                update(session_id, {"sessionUpdate": "tool_call", "toolCallId": tool_id,
                    "title": "Read fixture", "status": "pending", "kind": "read", "rawInput": {"path": "fixture"},
                    "_meta": {"fixture": {"notEvidence": True}}})
                update(session_id, {"sessionUpdate": "tool_call_update", "toolCallId": tool_id,
                    "status": "completed", "rawOutput": {"example": True}, "content": [
                        {"type": "content", "content": {"type": "text", "text": "first\n"}},
                        {"type": "content", "content": {"type": "text", "text": "second\n"}},
                        {"type": "diff", "path": "fixture", "oldText": "a", "newText": "b"}]})
                if mode == "clear-tool-content":
                    update(session_id, {"sessionUpdate": "tool_call_update", "toolCallId": tool_id, "content": []})
                update(session_id, {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "block"}})
                reply(request_id, {"stopReason": "end_turn", "_meta": {EXT: {"validation": {
                    "status": "not-requested", "turn": 1, "configSha256": None, "checks": []}}}})


if __name__ == "__main__":
    main()
