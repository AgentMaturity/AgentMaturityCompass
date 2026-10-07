---
"agent-maturity-compass": minor
---

`amc import` now keeps the exact bytes it read for each imported file, encrypted in the workspace blob store and addressed by SHA-256, and the import manifest lists each original with its SHA-256, size, media type, format, version, pinned source revision and blob reference. The import is refused before anything is written with `IMPORT_ORIGINAL_NOT_RETAINABLE` when blob encryption is off, the blob key is unavailable or a file exceeds `retention.maxBlobBytes`; `--no-retain-original` keeps only the digest and records that loss. Rollback keeps retained originals. Each file is read once with a bounded read, and that read is what AMC hashes, parses and retains. Recognized DSH or Pi session JSONL may now be up to 32 MiB; other artifacts keep the 1,500,000-byte cap.

DSH session files with any version other than 2, including format v4, are refused with an explicit message that names the supported DSH v2 revision; other DSH refusals are also shown by name instead of a generic parse error. Pi durable-storage files (`kind: "header"`) are refused explicitly. Neither is imported as a generic event log. DSH v4 is not qualified. The importer warns with a count when a DSH log contains `session-log-deepseek/delivery-accepted` events.

The record map is now `amc-record-map/2`: each source carries `originalSha256` and `sourceRevision`, and `losses` lists what the redaction, projection and external-evidence stages dropped. External-evidence profiles are unchanged.

Gateway routes accept `refuseRequestFields`. The refusal applies to the route's upstream: every route to the same upstream name or host enforces the union. A request whose top-level JSON object has a listed key (for example `dsh_session_log`) is refused with HTTP 403 and a signed `REQUEST_FIELD_REFUSED` audit event with the route, reason, field names and byte count, never the content. This is enforced at the AMC gateway only for traffic that passes through it.

Gateway route prefixes now match on a path-segment boundary: `/openai` serves `/openai` and `/openai/...` but no longer `/openai2/...`.

Security: the field guard fails closed. On a guarded upstream, a non-empty body that is content-encoded, declares a non-UTF-8 charset, starts with a byte-order mark, is not valid UTF-8 JSON or is not a JSON object is refused, and keys are compared after case and Unicode compatibility folding, so an upstream parser cannot read a field the guard missed. The forward proxy refuses HTTP and CONNECT traffic to the host of any guarded upstream (every host when that host is unknown), so a tunnel or a sibling route cannot bypass the guard.

Security: hosts are compared by identity, not spelling. The gateway resolves every upstream once at start when a route refuses fields; routes whose upstreams share a canonical name or any address share the refused fields, and the forward proxy resolves each target once, refuses a guarded name, its subdomains or any guarded address (IP literals, aliases and IPv4-mapped IPv6 included) and connects only to the checked address. A target that does not resolve is refused.

Imports remain self-reported and not evaluated. A retained original shows the bytes are unchanged since import; it does not show the source is true.
