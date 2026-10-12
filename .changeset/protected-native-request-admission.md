---
"agent-maturity-compass": minor
---

Experimental protected-data admission for native model requests (partial P2-02 source). It is opt-in: it runs only in a workspace that has a processor registry, `.amc/dataflow/processors.yaml` or its detached `.sig`. A workspace with neither file keeps the existing flow and is not scanned.

In an opted-in workspace, `LlmRuntime.prepare` scans the committed request (model, system prompt, params, tool schemas, message text, thinking, tool results, tool names and tool-call arguments) before the request header is written. It refuses with a typed `DataFlowRefused` error (code `DATA_FLOW_REFUSED`, with a static reason) in four cases:

- A protected class is detected, and the signed registry does not bind the route's provider and exact base URL to a processor and purpose that permit every detected class under an effective, unexpired covering contract. PHI also needs a declared BAA. Clock times such as `12:30:45` and bare 10-digit runs not preceded by `+` (Unix-seconds timestamps, counters) are not counted, so a phone number written as a bare 10-digit run is not detected; E.164 (`+14155552671`) and 11-digit (`14155552671`) forms are. The refusing detectors are:
  - `pii`: email addresses, North American phone numbers (formatted, E.164 or 11-digit), US SSNs, IPv4 and colon-hex IPv6 addresses, and keyword-bound EU VAT, national ID and passport numbers.
  - `phi`: keyword-bound medical record, health record, NHS and EHIC numbers.
  - `card_number`: Luhn-valid card numbers.
  - `bank_account`: mod-97-valid IBANs.
  - `credential`: OpenAI, GitHub and AWS key shapes, and JSON `password` values.
- The registry is present but unreadable, unsigned, wrongly signed or malformed. This refuses only a request in which something was detected.
- Detection itself refuses (`detector_invalid`): a single text leaf over 1,048,576 characters, nesting deeper than 32, or an unsupported value shape. There are no request-wide size or node totals, and empty or malformed tool-call arguments, and arguments with a number that overflows to Infinity (`1e999`), are scanned as text rather than refused.
- The aggregate detection audit row cannot be written (`audit_failed`).

A permitted request is sent with unchanged content and digest. Before an admission decision is enforced, a `PROTECTED_DATA_DETECTED` audit row records only the classes, counts, detector-set digest and processor ID, never plaintext or spans. The DLP email and keyword patterns now bound their quantifiers (RFC 5321 email lengths, at most 16 whitespace characters around keywords), which also applies to `scanForPII`. Span detection retries a rejected card or IBAN match, which recovers cards and IBANs that a greedy match had merged with a neighbouring number or word.

Known gaps (debt):

- There is no CLI to create or sign the registry. `initProcessorRegistry` and `signProcessorRegistry` are owner-mode source helpers with no command yet.
- Opting in through classes declared in the compiled policy is not built.
- Compaction and request retry do not yet classify `DataFlowRefused`.
- Model-emitted tool-call arguments that are valid JSON nested deeper than 32 still refuse as `detector_invalid`, and because every later prepare re-scans the committed history, that session cannot send again.
- Arguments scanned as text are scanned as raw JSON, so JSON escapes such as `\u0040` are not decoded first.
- Tokenized redaction, final-hop and other transport coverage, detector qualification and expert legal review remain outstanding.

This is partial, unqualified source.
