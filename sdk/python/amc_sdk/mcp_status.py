"""Reviewed MCP launch arguments and per-mount status, the same contract as the TypeScript SDK.

``mcp_config_argv`` pairs each config with its pin before anything is spawned; the runtime
still reviews and refuses every one. ``admit_mcp_status`` admits ``_amc/session/mcp`` replies
through the ``/mcp`` projection: only the listed public fields are kept, so an env value,
header, token or config content a peer adds never reaches the caller.
"""
from __future__ import annotations

import re
from typing import Any, Optional, Union

MCP_STATUS_FORMAT = "amc-mcp-status-v1"
_SHA256 = re.compile(r"[a-f0-9]{64}")
_SERVER_ID = re.compile(r"[A-Za-z0-9_-]{1,32}")
_TOOL_NAME = re.compile(r"mcp_[A-Za-z0-9_-]{1,32}_[a-f0-9]{16}")


def mcp_config_argv(configs: Union[str, list[str], tuple[str, ...], None],
                    pins: Union[str, list[str], tuple[str, ...], None]) -> list[str]:
    """One non-empty config path per server and, when pinning, one SHA-256 pin per config in the same order."""
    def listed(value: Any) -> Optional[list[Any]]:
        return [] if value is None else [value] if isinstance(value, str) else list(value) if isinstance(value, (list, tuple)) else None
    paths, digests = listed(configs), listed(pins)
    if (paths is None or digests is None or (configs is not None and not paths) or (pins is not None and len(digests) != len(paths))
            or any(not isinstance(path, str) or not path or "\0" in path for path in paths)
            or any(not isinstance(pin, str) or _SHA256.fullmatch(pin) is None for pin in digests)):
        raise ValueError("give one non-empty mcp_config path per server and, when pinning, one lowercase SHA-256 "
                         "mcp_config_sha256 per config in the same order")
    argv: list[str] = []
    for index, path in enumerate(paths):
        argv.extend(["--mcp-config", path, *(["--mcp-config-sha256", digests[index]] if digests else [])])
    return argv


def _text(value: Any, maximum: int, *, empty: bool = False) -> str:
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value):
        raise ValueError("invalid MCP status text")
    return value


def _server(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("invalid MCP server status")
    protocol, auth, tools = value.get("protocol"), value.get("auth"), value.get("toolNames")
    if (not isinstance(value.get("serverId"), str) or _SERVER_ID.fullmatch(value["serverId"]) is None
            or not isinstance(value.get("catalogDigest"), str) or _SHA256.fullmatch(value["catalogDigest"]) is None
            or not isinstance(protocol, dict) or protocol.get("mode") not in ("stateless", "legacy")
            or not isinstance(tools, list) or not 1 <= len(tools) <= 256
            or any(not isinstance(name, str) or _TOOL_NAME.fullmatch(name) is None for name in tools)
            or value.get("state") not in ("registered", "unavailable") or value.get("execution") != "not-evaluated"):
        raise ValueError("invalid MCP server status")
    info = protocol.get("serverInfo")
    projected_auth = None
    if auth is not None:
        scopes = auth.get("scopes") if isinstance(auth, dict) else None
        if not isinstance(scopes, list) or len(scopes) > 256:
            raise ValueError("invalid MCP auth receipt")
        expiry = auth.get("tokenExpiresAt")
        projected_auth = {"issuer": _text(auth.get("issuer"), 2048), "scopes": [_text(scope, 256) for scope in scopes],
                          "tokenExpiresAt": None if expiry is None else _text(expiry, 128)}
    if info is not None and not isinstance(info, dict):
        raise ValueError("invalid MCP server information")
    return {
        "serverId": value["serverId"], "catalogDigest": value["catalogDigest"],
        "protocol": {"negotiatedVersion": _text(protocol.get("negotiatedVersion"), 32), "mode": protocol["mode"],
                     "serverInfo": None if info is None else {"name": _text(info.get("name"), 256, empty=True),
                                                              "version": _text(info.get("version"), 256, empty=True)}},
        "auth": projected_auth, "toolNames": list(tools), "state": value["state"], "execution": "not-evaluated",
    }


def admit_mcp_status(value: Any) -> dict[str, Any]:
    """The projected status, or ValueError for a reply outside the contract."""
    if (not isinstance(value, dict) or set(value) != {"format", "servers", "refused"} or value["format"] != MCP_STATUS_FORMAT
            or type(value["refused"]) is not int or value["refused"] < 0
            or (value["servers"] is not None and not isinstance(value["servers"], list))):
        raise ValueError("invalid MCP status reply")
    servers = None if value["servers"] is None else [_server(server) for server in value["servers"]]
    return {"format": MCP_STATUS_FORMAT, "servers": servers, "refused": value["refused"]}
