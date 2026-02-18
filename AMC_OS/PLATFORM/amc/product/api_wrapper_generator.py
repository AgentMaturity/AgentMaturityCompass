"""API Wrapper Generator — Tool wrapper generator from OpenAPI/Postman specs.

Parses OpenAPI 3.x or Postman Collection v2.1 specs into typed tool wrappers
with retry logic, validation, and sane defaults. SQLite-backed history.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import textwrap
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS api_wrappers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    wrapper_id      TEXT NOT NULL UNIQUE,
    tool_name       TEXT NOT NULL,
    spec_format     TEXT NOT NULL,
    endpoint_count  INTEGER NOT NULL DEFAULT 0,
    generated_code  TEXT NOT NULL DEFAULT '',
    spec_hash       TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    generated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wrappers_tool ON api_wrappers(tool_name);
CREATE INDEX IF NOT EXISTS idx_wrappers_ts   ON api_wrappers(generated_at);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_content(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field


class ParameterDef(BaseModel):
    name: str
    type: str = "string"  # string | integer | boolean | number | array | object
    required: bool = True
    default: Any = None
    description: str = ""
    enum_values: list[str] = Field(default_factory=list)
    validation_pattern: str = ""


class ToolEndpoint(BaseModel):
    endpoint_id: str
    name: str
    description: str
    method: str  # GET | POST | PUT | DELETE | PATCH
    path: str
    base_url: str
    parameters: list[ParameterDef] = Field(default_factory=list)
    headers: dict[str, str] = Field(default_factory=dict)
    response_schema: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    retry_config: dict[str, Any] = Field(default_factory=lambda: {
        "max_retries": 3,
        "backoff_factor": 2,
        "retry_on": [429, 500, 502, 503],
    })
    timeout_seconds: int = 30


class GeneratedWrapper(BaseModel):
    wrapper_id: str
    tool_name: str
    spec_format: str  # openapi | postman
    endpoints: list[ToolEndpoint] = Field(default_factory=list)
    generated_code: str = ""
    generated_at: str
    spec_hash: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class WrapperGenerateRequest(BaseModel):
    spec_content: str
    spec_format: str = "openapi"  # openapi | postman
    tool_name: str = ""
    base_url: str = ""
    default_timeout: int = 30
    default_retries: int = 3
    include_type_hints: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class WrapperGenerateResult(BaseModel):
    wrapper: GeneratedWrapper
    warnings: list[str] = Field(default_factory=list)
    endpoint_count: int = 0
    duration_ms: int = 0


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


def _safe_name(raw: str) -> str:
    """Convert arbitrary string to a valid Python identifier."""
    name = raw.strip().lower()
    for ch in (" ", "-", "/", ".", "{", "}", ":", ","):
        name = name.replace(ch, "_")
    # Remove leading digits
    while name and name[0].isdigit():
        name = "_" + name
    return name or "endpoint"


def _py_type(openapi_type: str) -> str:
    return {
        "string": "str",
        "integer": "int",
        "boolean": "bool",
        "number": "float",
        "array": "list",
        "object": "dict",
    }.get(openapi_type, "Any")


class APIWrapperGenerator:
    """Generates typed Python tool wrappers from OpenAPI or Postman specs."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA)
        conn.commit()
        return conn

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate(self, request: WrapperGenerateRequest) -> WrapperGenerateResult:
        t0 = time.monotonic()
        warnings: list[str] = []

        try:
            spec = json.loads(request.spec_content)
        except json.JSONDecodeError as exc:
            warnings.append(f"Could not parse spec as JSON: {exc}")
            spec = {}

        spec_hash = _hash_content(request.spec_content)
        fmt = request.spec_format.lower()

        if fmt == "openapi":
            tool_name, endpoints, parse_warnings = self._parse_openapi(
                spec, request.base_url or "", request.default_timeout, request.default_retries
            )
        elif fmt == "postman":
            tool_name, endpoints, parse_warnings = self._parse_postman(
                spec, request.base_url or "", request.default_timeout, request.default_retries
            )
        else:
            tool_name, endpoints, parse_warnings = "", [], [f"Unknown spec_format: {fmt!r}"]

        warnings.extend(parse_warnings)
        tool_name = request.tool_name or tool_name or "generated_tool"
        code = self._generate_python_code(tool_name, endpoints, request.include_type_hints)

        wrapper_id = str(uuid.uuid4())
        ts = _utc_now()
        wrapper = GeneratedWrapper(
            wrapper_id=wrapper_id,
            tool_name=tool_name,
            spec_format=fmt,
            endpoints=endpoints,
            generated_code=code,
            generated_at=ts,
            spec_hash=spec_hash,
            metadata=request.metadata,
        )

        self._conn.execute(
            """
            INSERT OR IGNORE INTO api_wrappers
                (wrapper_id, tool_name, spec_format, endpoint_count,
                 generated_code, spec_hash, metadata_json, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                wrapper_id, tool_name, fmt, len(endpoints),
                code, spec_hash, json.dumps(request.metadata), ts,
            ),
        )
        self._conn.commit()

        duration_ms = int((time.monotonic() - t0) * 1000)
        log.info("api_wrapper.generated", tool=tool_name, endpoints=len(endpoints), fmt=fmt)
        return WrapperGenerateResult(
            wrapper=wrapper,
            warnings=warnings,
            endpoint_count=len(endpoints),
            duration_ms=duration_ms,
        )

    def get_history(self, limit: int = 20) -> list[dict]:
        rows = self._conn.execute(
            "SELECT wrapper_id, tool_name, spec_format, endpoint_count, spec_hash, generated_at "
            "FROM api_wrappers ORDER BY generated_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # OpenAPI 3.x parser
    # ------------------------------------------------------------------

    def _parse_openapi(
        self,
        spec: dict,
        base_url: str,
        timeout: int,
        max_retries: int,
    ) -> tuple[str, list[ToolEndpoint], list[str]]:
        warnings: list[str] = []
        endpoints: list[ToolEndpoint] = []

        # Tool name from info.title
        info = spec.get("info", {})
        tool_name = _safe_name(info.get("title", "api_tool"))

        # Base URL from servers
        if not base_url:
            servers = spec.get("servers", [])
            if servers:
                base_url = servers[0].get("url", "")
            else:
                warnings.append("No servers array found in OpenAPI spec; base_url will be empty")

        paths = spec.get("paths", {})
        for path, path_item in paths.items():
            for method in ("get", "post", "put", "delete", "patch", "head", "options"):
                op = path_item.get(method)
                if not op or not isinstance(op, dict):
                    continue

                op_id = op.get("operationId", "")
                name = _safe_name(op_id or f"{method}_{path}")
                description = op.get("summary", "") or op.get("description", "")
                tags = op.get("tags", [])

                # Parameters
                params: list[ParameterDef] = []
                for p in op.get("parameters", []):
                    schema = p.get("schema", {})
                    params.append(ParameterDef(
                        name=p.get("name", "param"),
                        type=schema.get("type", "string"),
                        required=p.get("required", False),
                        default=schema.get("default"),
                        description=p.get("description", ""),
                        enum_values=[str(v) for v in schema.get("enum", [])],
                        validation_pattern=schema.get("pattern", ""),
                    ))

                # Request body params
                req_body = op.get("requestBody", {})
                content = req_body.get("content", {})
                for mime, mime_val in content.items():
                    body_schema = mime_val.get("schema", {})
                    props = body_schema.get("properties", {})
                    required_props = body_schema.get("required", [])
                    for prop_name, prop_schema in props.items():
                        params.append(ParameterDef(
                            name=prop_name,
                            type=prop_schema.get("type", "string"),
                            required=prop_name in required_props,
                            default=prop_schema.get("default"),
                            description=prop_schema.get("description", ""),
                        ))
                    break  # only first content type

                # Response schema
                responses = op.get("responses", {})
                resp_schema: dict = {}
                for code in ("200", "201", "default"):
                    if code in responses:
                        resp_content = responses[code].get("content", {})
                        for mime, mime_val in resp_content.items():
                            resp_schema = mime_val.get("schema", {})
                            break
                        break

                ep = ToolEndpoint(
                    endpoint_id=str(uuid.uuid4()),
                    name=name,
                    description=description,
                    method=method.upper(),
                    path=path,
                    base_url=base_url,
                    parameters=params,
                    tags=tags,
                    response_schema=resp_schema,
                    retry_config={
                        "max_retries": max_retries,
                        "backoff_factor": 2,
                        "retry_on": [429, 500, 502, 503],
                    },
                    timeout_seconds=timeout,
                )
                endpoints.append(ep)

        return tool_name, endpoints, warnings

    # ------------------------------------------------------------------
    # Postman Collection v2.1 parser
    # ------------------------------------------------------------------

    def _parse_postman(
        self,
        spec: dict,
        base_url: str,
        timeout: int,
        max_retries: int,
    ) -> tuple[str, list[ToolEndpoint], list[str]]:
        warnings: list[str] = []
        endpoints: list[ToolEndpoint] = []

        info = spec.get("info", {})
        tool_name = _safe_name(info.get("name", "postman_tool"))

        def _collect_items(items: list, prefix: str = "") -> None:
            for item in items:
                if "item" in item:
                    # folder
                    _collect_items(item["item"], prefix=item.get("name", ""))
                elif "request" in item:
                    req = item["request"]
                    method = (req.get("method") or "GET").upper()
                    url_obj = req.get("url", {})
                    if isinstance(url_obj, str):
                        raw_url = url_obj
                        path = raw_url
                        resolved_base = base_url
                    else:
                        raw_url = url_obj.get("raw", "")
                        path_parts = url_obj.get("path", [])
                        path = "/" + "/".join(path_parts)
                        host = url_obj.get("host", [])
                        protocol = url_obj.get("protocol", "https")
                        resolved_base = base_url or (f"{protocol}://" + ".".join(host) if host else "")

                    name = _safe_name(item.get("name", f"{method}_{path}"))
                    description = ""
                    if isinstance(req.get("description"), str):
                        description = req["description"]
                    elif isinstance(req.get("description"), dict):
                        description = req["description"].get("content", "")

                    # Query params
                    params: list[ParameterDef] = []
                    if isinstance(url_obj, dict):
                        for qp in url_obj.get("query", []):
                            params.append(ParameterDef(
                                name=qp.get("key", "param"),
                                type="string",
                                required=False,
                                default=qp.get("value"),
                                description=qp.get("description", ""),
                            ))

                    # Body params
                    body = req.get("body", {})
                    if body:
                        mode = body.get("mode", "")
                        if mode == "raw":
                            try:
                                body_data = json.loads(body.get("raw", "{}"))
                                for k, v in body_data.items():
                                    params.append(ParameterDef(
                                        name=k,
                                        type="string" if isinstance(v, str) else "object",
                                        required=True,
                                    ))
                            except json.JSONDecodeError:
                                pass
                        elif mode == "urlencoded":
                            for fld in body.get("urlencoded", []):
                                params.append(ParameterDef(
                                    name=fld.get("key", "field"),
                                    type="string",
                                    required=False,
                                ))

                    # Headers
                    headers: dict[str, str] = {}
                    for h in req.get("header", []):
                        headers[h.get("key", "")] = h.get("value", "")

                    ep = ToolEndpoint(
                        endpoint_id=str(uuid.uuid4()),
                        name=name,
                        description=description,
                        method=method,
                        path=path,
                        base_url=resolved_base,
                        parameters=params,
                        headers=headers,
                        retry_config={
                            "max_retries": max_retries,
                            "backoff_factor": 2,
                            "retry_on": [429, 500, 502, 503],
                        },
                        timeout_seconds=timeout,
                    )
                    endpoints.append(ep)

        _collect_items(spec.get("item", []))
        return tool_name, endpoints, warnings

    # ------------------------------------------------------------------
    # Python code generator
    # ------------------------------------------------------------------

    def _generate_python_code(
        self,
        tool_name: str,
        endpoints: list[ToolEndpoint],
        include_type_hints: bool,
    ) -> str:
        class_name = "".join(w.capitalize() for w in tool_name.split("_"))
        lines: list[str] = [
            '"""Auto-generated API wrapper.',
            f"Tool: {tool_name}",
            f"Generated by AMC APIWrapperGenerator.",
            '"""',
            "from __future__ import annotations",
            "",
            "import time",
            "import urllib.request",
            "import urllib.error",
            "import json",
            "from typing import Any",
            "",
            "",
            f"class {class_name}:",
            f'    """Typed wrapper for {tool_name}."""',
            "",
            "    def __init__(self, base_url: str = \"\", headers: dict | None = None) -> None:",
            "        self.base_url = base_url",
            "        self.headers = headers or {}",
            "",
        ]

        for ep in endpoints:
            params = ep.parameters
            req_params = [p for p in params if p.required]
            opt_params = [p for p in params if not p.required]

            # Method signature
            sig_parts = ["self"]
            for p in req_params:
                t = _py_type(p.type) if include_type_hints else ""
                ann = f": {t}" if t else ""
                sig_parts.append(f"{p.name}{ann}")
            for p in opt_params:
                t = _py_type(p.type) if include_type_hints else ""
                ann = f": {t}" if t else ""
                default = repr(p.default) if p.default is not None else "None"
                sig_parts.append(f"{p.name}{ann} = {default}")

            ret = " -> dict" if include_type_hints else ""
            sig = f"    def {ep.name}({', '.join(sig_parts)}){ret}:"
            lines.append(sig)
            lines.append(f'        """[{ep.method}] {ep.path} — {ep.description or ep.name}"""')

            # Build payload/query
            if ep.method in ("GET", "DELETE", "HEAD"):
                lines.append("        params = {}")
                for p in params:
                    lines.append(f"        if {p.name} is not None:")
                    lines.append(f"            params[{p.name!r}] = {p.name}")
                lines.append(f"        query = '&'.join(f'{{k}}={{v}}' for k, v in params.items())")
                lines.append(f"        url = (self.base_url or {ep.base_url!r}) + {ep.path!r}")
                lines.append("        if query: url += '?' + query")
                lines.append("        data = None")
            else:
                lines.append("        payload = {}")
                for p in params:
                    lines.append(f"        if {p.name} is not None:")
                    lines.append(f"            payload[{p.name!r}] = {p.name}")
                lines.append(f"        url = (self.base_url or {ep.base_url!r}) + {ep.path!r}")
                lines.append("        data = json.dumps(payload).encode()")

            # Retry loop
            max_r = ep.retry_config.get("max_retries", 3)
            backoff = ep.retry_config.get("backoff_factor", 2)
            retry_on = ep.retry_config.get("retry_on", [429, 500, 502, 503])
            lines += [
                f"        retry_on = {retry_on!r}",
                f"        for attempt in range({max_r + 1}):",
                "            try:",
                f"                req = urllib.request.Request(url, data=data, method={ep.method!r})",
                "                req.add_header('Content-Type', 'application/json')",
                "                for k, v in self.headers.items(): req.add_header(k, v)",
                f"                with urllib.request.urlopen(req, timeout={ep.timeout_seconds}) as resp:",
                "                    body = resp.read().decode()",
                "                    try:",
                "                        return json.loads(body)",
                "                    except json.JSONDecodeError:",
                "                        return {'raw': body}",
                "            except urllib.error.HTTPError as exc:",
                "                if exc.code in retry_on and attempt < " + str(max_r) + ":",
                f"                    time.sleep({backoff} ** attempt)",
                "                    continue",
                "                raise",
                "        raise RuntimeError('Max retries exceeded')",
                "",
            ]

        # __all__
        method_names = [ep.name for ep in endpoints]
        lines += [
            "",
            f"__all__ = [{class_name!r}]",
        ]
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_generator: APIWrapperGenerator | None = None


def get_api_wrapper_generator(db_path: str | Path | None = None) -> APIWrapperGenerator:
    global _generator
    if _generator is None:
        _generator = APIWrapperGenerator(db_path=db_path)
    return _generator


__all__ = [
    "ParameterDef",
    "ToolEndpoint",
    "GeneratedWrapper",
    "WrapperGenerateRequest",
    "WrapperGenerateResult",
    "APIWrapperGenerator",
    "get_api_wrapper_generator",
]
