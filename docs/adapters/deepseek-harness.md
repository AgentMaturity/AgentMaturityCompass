# DeepSeek Harness capture

The `deepseek-harness` adapter launches an operator-installed DSH CLI in its headless profile. AMC records the process boundary and requests model routing through its gateway. The pinned source and packaged CLI completed local scripted-provider qualification on 2026-09-08. This checks interoperability and capture boundaries; it does not establish live-provider compatibility or model quality.

The launch contract follows [DSH revision c389f96b](https://github.com/deepseek-ai/deepseek-harness/tree/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8), whose CLI package is `0.1.3-alpha.2`. AMC does not install, download, build or update DSH. An executable/entrypoint hash approves those files only; it does not pin their transitive plugins, profile overlays or dependencies.

## Configure the installed artifact

Review your DSH installation first. Create a JSON launch configuration with these fields:

| Field | Meaning |
|---|---|
| `executable.path` | Absolute executable path; for example, the installed DSH launcher or Node runtime. |
| `executable.sha256` | Reviewed SHA-256 of that executable's bytes. |
| `entrypoint.path`, `entrypoint.sha256` | Optional absolute DSH JavaScript entrypoint and its reviewed hash when launching through Node. Omit the entire `entrypoint` object for an executable DSH launcher. |
| `sourceRevision` | Optional 40-character reviewed source revision; recorded as operator metadata, not independently attested source provenance. |

The file accepts no shell commands, arbitrary prefix arguments, environment values or credentials. For a source installation requiring a custom loader, review and pin an executable launcher script that supplies it. Keep its dependency tree and loader under your normal deployment controls. `amc adapters detect` can discover `dsh` on PATH; detection alone never approves it for execution.

Configure an OpenAI-compatible AMC gateway route to your intended DeepSeek endpoint, with the upstream credential referenced by the gateway's auth configuration. The gateway keeps that credential; DSH receives a short-lived AMC lease in `DEEPSEEK_API_KEY`. Use your existing gateway setup and start Studio before running the adapter.

Then select the route, model, and reviewed launch file explicitly. For example, where `/deepseek` is your configured route and `deepseek-v4-flash` is your intended model:

```sh
amc adapters configure --agent default --adapter deepseek-harness --route /deepseek --model deepseek-v4-flash --launch-config ./dsh-launch.json
amc adapters run --agent default --adapter deepseek-harness -- "Summarize the README and explain the main entry point."
```

Configuration validates file hashes and stores the launcher inside signed `adapters.yaml`. Each run checks the signature and hashes again, probes only that approved command's package version, and uses structured arguments with no shell. The task must be one quoted, nonempty argument beginning with ordinary text; extra DSH options are refused. The launcher receives its optional entrypoint followed by `--profile headless --patch <private file> <task>` and runs in the AMC workspace. Without interruption, its actual exit code is returned. SIGINT/SIGTERM are forwarded to that child, with a five-second forced-termination fallback. A requested interruption returns wrapper code 130/143 even if DSH handles the signal by exiting zero. Signed exit records preserve `requestedSignal`, `childExitCode`, and `childSignal` separately. This does not certify reaping every descendant created by external DSH plugins.

This slice supports `SUPERVISE` only. It does not represent DSH's internal tools as AMC-governed tools, change its sandbox/approval settings, or claim an outer process sandbox.

## Routing and settings

DSH's `llm-deepseek` and `agent-default-model` settings can override environment variables and plugin entry configuration. AMC writes a private per-launch settings document and final patch that select the gateway URL, `DEEPSEEK_API_KEY` credential reference, `deepseek-official` provider and chosen model. The patch points the native settings service at that document with watching disabled; it leaves the operator's settings file untouched and removes its temporary files afterward.

This handles the pinned profile's known settings precedence. Custom plugins, changed profiles, direct web requests and other provider services remain outside that routing assertion. The report keeps provider/proxy coverage **unverified**; only requests actually received and recorded by AMC's gateway establish observed model traffic. A successful DSH process exit without gateway receipts is not proof of model capture. HTTP proxy variables are advisory, not an egress sandbox. The signed lease restricts the chosen route and model when traffic reaches AMC.

## Evidence coverage

| Boundary | Captured by this adapter | Limits |
|---|---|---|
| Process launch/exit | Signed AMC process events, approved artifact metadata, version probe, task hash, wrapper outcome and actual child exit facts | Task text and temporary paths are omitted from launch receipts; no internal action success is inferred. |
| Standard output | Final output up to 1 MiB, redacted after collection using known lease/upstream credentials and gateway text rules | More than 1 MiB causes the entire body to be omitted. Unknown user/model secrets are not guaranteed removable; configure redaction before sensitive work. |
| Standard error | Byte count only | DSH streams private reasoning here. Neither reasoning nor error bodies are displayed or retained by this adapter. |
| Gateway model traffic | Existing signed gateway capture, only for requests AMC actually receives | The adapter summary does not infer these receipts from process output or configuration. |
| Proxy traffic | Existing proxy boundary when used | Direct traffic is not captured by proxy environment injection alone. |
| Native tools, approval, sandbox and session events | None | No native DSH hook is installed. Stdout/stderr and process exit are not tool lifecycle evidence. |
| DSH session-file import | None in the process adapter | Separately imported histories retain their import trust boundary; they are never relabeled observed because AMC launched DSH. |

The run summary includes a `captureCoverage` object with byte counts, `stdoutOmitted`, `spawnObserved`, and the separate interruption/child-exit fields. Its capability declaration remains conservative: a local conformance receipt does not verify every operator installation, dependency or overlay, and it deliberately has no native action capabilities. When a gateway stream is interrupted, AMC closes the unfinished response, records a request error and issues no successful response receipt. A downstream disconnect also closes the ongoing upstream stream.

Headless DSH starts no browser server. The adapter does not alter DSH's authenticated web/connection flow: launch-token exchange and authority-bound cookies remain required when those other surfaces are used. Never weaken that authentication to obtain capture.

## Qualified scope and importing actual sessions

The 2026-09-08 acceptance built the exact pinned DSH revision with its official build profile and release pack scripts, then installed the CLI's 237 local runtime packages. All 3,292 installed package files matched those source-built tarballs. Through the public AMC adapter command, a local HTTP/SSE provider drove a real DSH `read` call; separate requests exercised provider rejection and cancellation. The check also covered settings precedence without changing the original settings, unsigned-profile and extra-argument refusals, output credential redaction, reasoning omission, upstream cleanup and a cold ledger verification against the captured monitor-key fingerprint. AMC's own native agent does not require DSH.

Three actual DSH v2 logs supplied 51 events and six imported traces. Their session/sequence identities and surface references were preserved; durations remained unknown and imports remained `SELF_REPORTED` / `NOT_EVALUATED`, with empty maturity score sets. These runs had no parent session: nested delegation, fork ancestry, custom plugins, other platforms and live vendor endpoints remain outside this acceptance. The checkout-only receipt is `AMC_OS/RESEARCH/2026-09-08-dsh-pi/installed-dsh-capture-acceptance/final-summary.json`.

The neutral importer accepts plaintext DSH v2 JSONL as written at revision c389f96b. DSH's default files contain concatenated Zstandard frames; AMC refuses `.jsonl.zstd` and `.jsonl.zst` files and never decompresses them. Decode the whole file first and keep the compressed artifact and its digest yourself: AMC retains the decoded bytes it imports, not the compressed file. For example:

```sh
zstd -d -c /path/to/session.v2.jsonl.zstd > /reviewed/exported-session.jsonl
amc import /reviewed/exported-session.jsonl --agent default --dry-run --json
amc import /reviewed/exported-session.jsonl --agent default --expected-digest <reviewed-semantic-digest> --json
```

Do not substitute a header-only decompression or reconstruct missing events. Importing a DSH log is a separate operator action; launching DSH through AMC never upgrades that file's trust classification.

### Format versions

A first line with `type: "session"` and any DSH-only header key (`createdAt`, `isSeeded`, `delegationDepth`, `seedLength` or `agentPreset`) is treated as DSH whatever its version. Any version other than 2 is refused with an explicit message and is never imported as a generic event log. For example, a v4 header produces:

> DSH session format v4 is not supported; AMC imports DSH v2 (revision c389f96b). No migration is attempted.

Other DSH refusals (limits, malformed lines, noncontiguous sequences) are also shown by name in the import plan instead of a generic parse error. A Pi durable-storage header (`kind: "header"` with `v` or `storageVersion`) is refused in the same way: "Pi durable session format v4 is not supported; AMC imports Pi CLI session v3."

**DSH format v4 is refused, not qualified.** Qualifying it needs at least three recorded v4 sessions (a tool call, a tool error and an interruption) from a pinned DSH release with a local scripted provider, and every v4 event type documented at that pin. None have been recorded, and the v4 header shape has not been re-checked against DSH source for this release, so AMC ships the refusal. Re-export such sessions as v2 if your DSH version can, or keep them outside AMC.

### Original bytes and losses

`amc import` stores the exact bytes it read for every recognized file, before parsing or redaction. They are encrypted in the workspace blob store, addressed by SHA-256 and deduplicated through `.amc/imports/originals.jsonl`. A reused index row is trusted only after its blob decrypts to the same SHA-256. The import manifest (`amc imports show <import-id>`) lists each original with its SHA-256, size, media type, format, version, pinned source revision and blob reference.

The import is refused as a whole, before anything is written, with `IMPORT_ORIGINAL_NOT_RETAINABLE: <reason>; raise retention.maxBlobBytes or pass --no-retain-original.` when blob encryption is off in the ops policy, the blob key is unavailable (for example, a locked vault without `AMC_VAULT_PASSPHRASE`), or a file is larger than `retention.maxBlobBytes` (10,485,760 bytes by default, while DSH allows 32 MiB). With `AMC_NO_SIGN=1` set, the original is encrypted with a random workspace key kept beside the blobs (key version 0), a weaker protection than the vault. `--no-retain-original` keeps only the digest: the manifest records `not-retained` and the losses say "Original bytes not retained by operator choice; only the SHA-256 digest is kept." `amc imports rollback` removes the import's other files but keeps retained originals; retention policy governs their deletion.

Recognized session JSONL (DSH or Pi) may be up to 32 MiB, DSH's own limit; with retention on it may not exceed `retention.maxBlobBytes`. Other artifacts keep the 1,500,000-byte cap. Every file is read once, bounded, and that single read is what AMC hashes, parses and retains.

A retained original proves the bytes are unchanged since import. It does not prove the harness told the truth or that the recorded actions happened, and it never makes an import observed: imports stay `SELF_REPORTED` and `NOT_EVALUATED`. Originals can hold secrets or personal data; they are not included in external-evidence profiles. The record map (`amc-record-map/2`) lists per source the original SHA-256, format version and pinned revision, and the losses of each conversion stage (`redaction`, `projection`, `external-evidence`).

## Session-log uploads to DeepSeek

DSH's `session-log-deepseek` plugin uploads session logs to DeepSeek by default. AMC's reading of that plugin's README at DSH commit 5badb150 is below; it has not been re-checked for this release, so confirm it at the DSH version you deploy:

- The plugin adds a `dsh_session_log` field, up to 8 MiB (setting `maxBytes`), to requests sent to the official DeepSeek API.
- `enabled: false` stops it. The shipped profiles mount the plugin.
- Re-enabling it resends events recorded while it was off.
- OpenTelemetry feedback uploads have a separate setting.

A regulated deployment that must keep session logs local can follow this procedure:

1. Set the plugin's `enabled: false` and turn off the feedback upload.
2. Route DeepSeek traffic only through AMC's gateway, and deny direct egress to DeepSeek hosts in the proxy allowlist.
3. Turn on the gateway field guard for the DeepSeek route in `.amc/gateway.yaml`, then re-sign the file with `amc fix-signatures`:

   ```yaml
   routes:
     - prefix: /deepseek
       upstream: deepseek
       stripPrefix: true
       openaiCompatible: true
       refuseRequestFields: [dsh_session_log]
   ```

   The refusal belongs to the upstream host, compared by identity rather than spelling: when the gateway starts it resolves every upstream once, and every route whose upstream shares a canonical name or any resolved address with a guarded upstream enforces the union of the listed fields. A request whose top-level JSON object has a listed key (compared case-insensitively after Unicode compatibility folding) is refused with HTTP 403 and a signed `REQUEST_FIELD_REFUSED` audit event that records the route, the reason, the field names and the request byte count, never the content. The guard fails closed: on a guarded upstream, a non-empty body that is content-encoded (anything but `identity`), declares a charset other than UTF-8, starts with a byte-order mark, is not valid UTF-8, is not JSON or is not a JSON object is refused the same way, with its reason. Nested keys are not inspected. Route prefixes match on a path-segment boundary, so `/deepseek` never serves `/deepseek2`. The gateway's forward proxy refuses HTTP and `CONNECT` traffic to a guarded upstream, because a tunnel cannot be inspected. It resolves each allowlisted target once and refuses it when its canonical name equals or is a subdomain of a guarded name, or when any of its addresses (IPv4-mapped IPv6 and other spellings normalized) is a guarded address; it then connects only to a checked address, so a DNS change after the check cannot redirect the connection. A target that does not resolve is refused, and if a guarded upstream did not resolve at start, the proxy refuses every host. Guarded addresses are resolved only at start: an address the provider adds later is matched by name only, so keep direct egress to DeepSeek denied as well. A refused field fails the DeepSeek request (DSH keeps its upload cursor), so in practice operators must disable the plugin rather than rely on the guard alone.
4. Over the deployment window, show zero `REQUEST_FIELD_REFUSED` events, zero direct DeepSeek egress in the proxy evidence, and zero `session-log-deepseek/delivery-accepted` events in imported DSH logs. The importer counts those events and warns when any are present.

The guard is enforced at the AMC gateway, only for traffic that passes through it. Direct egress is covered only where the egress proxy denies it. Neither control proves that DSH never uploaded a session by another path.

See [adapter guides](README.md) and [adapter architecture](../ADAPTERS.md).
