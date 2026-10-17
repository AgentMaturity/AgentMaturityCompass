---
"agent-maturity-compass": minor
---

API errors now carry a request id, and 500 responses no longer include exception messages (P1-55, AMC-482).

- Every `/api/v1` response from Studio and the dashboard carries an `X-Request-Id` header, and error bodies from the shared API error helper are `{ "ok": false, "error": "...", "requestId": "..." }` with the same id. Studio's own 401, 403 and 429 replies and the A4 routes carry the header only. The id is a random UUID. Studio uses an inbound `X-Request-Id` only behind a trusted proxy (`AMC_TRUSTED_PROXY_HOPS` above 0 and an allowed peer) and only when it matches `^[A-Za-z0-9._:-]{8,128}$`. It is a correlation hint only.
- Each error response is logged as one JSON line on stderr with the id, method, pathname (no query string), status, duration and public error text. A 500 line also holds the exception's name, message (at most 2,000 characters) and stack (at most 10 lines), with secrets redacted. Headers, bodies, tokens and cookies are never logged.
- A 500 body is now always `Internal server error` plus the id, on every route. The exception text, file paths and storage errors stay in the log line. Deliberate 503 messages are unchanged. When a handler fails after its headers were sent, the error is logged and the connection closed.
- A request body over 1,048,576 bytes is 413 `JSON body exceeds 1048576 bytes` on every `/api/v1` route. A declared `Content-Length` over the limit is refused before the route runs. A streamed body without a length is cut off at the limit when the route reads it, and answered 413 even on routes that used to answer 400 or 500 for it, including the Action Policy evidence-logic and scope-template routes.
- `ErrorResponse` in the OpenAPI document gains `requestId`.
