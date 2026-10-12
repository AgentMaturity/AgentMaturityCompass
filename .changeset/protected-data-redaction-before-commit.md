---
"agent-maturity-compass": minor
---

Experimental redaction of protected data before a native session row is committed (partial P2-02 source, slice 2). Tokenization reduces the identifiers that reach model context and logs. It is not de-identification or anonymization under any standard or regulation, and detection is heuristic.

**Opt-in, per workspace.** Redaction applies only where the processor registry `.amc/dataflow/processors.yaml` or its `.sig` exists, the same opt-in as protected-request admission. Other workspaces are unchanged. In an opted-in workspace, native sessions composed by `amc agent run`, scheduled passes, ACP, the SDK, A4 Assemble and delegated child sessions tokenize the following before any row, spill or model-visible part is written: queued inbox text, user messages, text attachments (content and file name), and tool results.

- A token is `[[amc:<class>:<16 hex>]]`: the first 64 bits of HMAC-SHA256 under a per-workspace key. The same value gives the same token within a workspace; another workspace gives a different token.
- The keys are one vault secret, `dataflow.token-keys.v1`, created on first use. Values are kept AES-256-GCM encrypted in `.amc/dataflow/token-vault.sqlite`, which the default `.amc` backup scope includes.
- Tool definitions in the signed tools config can declare `protectedFields` (dot paths into the JSON result, for example `patient.name: phi`). These are tokenized first, for `OK` results; the existing detectors are the backstop.
- Each redaction writes one `PROTECTED_DATA_REDACTED` audit row whose payload is the new public contract `redaction-receipt` (`amc.redaction-receipt/v1`, `spec/schemas/v1/redaction-receipt.schema.json`). It holds classes, detector names, counts, the matched declared paths, the detector-set digest and the SHA-256 of the redacted text, never a raw value.
- The new deletion target kind `token-vault` lets `deleteTokens` remove rows only through the legal-hold deletion gate.

**Refusals.** Every failure refuses the commit with `RedactionRefused` (code `REDACTION_REFUSED`) and a static reason; the raw value is never committed:

- `vault_unavailable`: a locked vault or unavailable keys.
- `vault_integrity`: a vault row that does not verify.
- `token_collision`: a different value under an existing token.
- `receipt_failed`: the receipt row could not be written.
- `detector_invalid`: text over 1,048,576 characters.
- `content_not_text`: tool output or queued input that is not UTF-8.
- `attachment_not_redactable`: image and audio attachments, media inbox input and non-UTF-8 text attachments, refused in opted-in sessions whatever the provider's processor contract covers.
- `declared_fields_unparseable`: a declaring tool's `OK` result that is not JSON.
- `declared_fields_unverifiable`: a signed tools config that no longer verifies, or an `OK` result whose call the session never recorded while some tool declares fields.

**Every workspace (no opt-in).** The same detectors now run over the evidence the gateway stores (`redactBody`: request and response bodies, ToolHub evidence payloads) and the bridge text that passes through `redactBridgeText` (stored stdout and stderr telemetry, request summaries, hook identifier fields). A detected card number, IBAN, SSN, email, phone number, IP address, keyword-bound ID, health-record number or credential shape becomes `[REDACTED]` (gateway, with a `protectedData:<class>` redaction reason, so `originalPayloadSha256` is omitted) or `<AMC_REDACTED>` (bridge). Text over 1,048,576 characters is replaced whole. Gateway JSON bodies stay valid JSON, and a detected number leaf becomes the marker string. Forwarded gateway traffic is unchanged, and `amc wrap` keeps writing the wrapped agent's own terminal output with secrets-only redaction.

**Admission detectors.** A detector span inside an AMC token is no longer a detection, and a JSON `password` value that is a token no longer counts as a credential. Both change the detector-set digest.

**Privacy redaction rules.** `getBuiltInRedactionRules` and `applyRedaction` keep the same six rule IDs and replacements but delegate to the shared detectors instead of a second rule set. Email, phone, SSN, card and IP use the protected-data detectors: card numbers must now pass the Luhn check, IPv6 addresses are matched, clock times and bare 10-digit runs are no longer redacted as IP addresses or phone numbers, and text over 1,048,576 characters is replaced whole. The API-key rule uses the shared secret table, so `token=` and `secret=` keyword forms are no longer redacted by it, while provider keys, bearer tokens, JWTs and `api_key`/`apikey`/`api_secret` forms are. A built-in rule's `pattern` now shows the shared regexes for reference. A caller's own rule, or a built-in rule with a changed pattern, still applies as a regex.

Known gaps (debt): no restoration path yet (the detokenization gate, processors on destinations and purpose binding are slice 3); opt-in through classes declared in the compiled policy; the system prompt, tool schemas, model output and approval questions are recorded unredacted; names outside declared fields are missed; synthetic fixtures, the labelled corpus, the detector quality report and the issue's tests are not written. This is partial, unqualified source; nothing was run beyond build-level checks and local probes.
