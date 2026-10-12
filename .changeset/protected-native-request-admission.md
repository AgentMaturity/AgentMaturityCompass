---
"agent-maturity-compass": minor
---

Experimental protected-data admission for native model requests (partial P2-02 source). It is opt-in: it runs only in a workspace that has a processor registry, `.amc/dataflow/processors.yaml` or its detached `.sig`. A workspace with neither file keeps the existing flow and is not scanned.

In an opted-in workspace, `LlmRuntime.prepare` scans the committed request (model, system prompt, params, tool schemas, message text, thinking, tool results, tool names and tool-call arguments) before the request header is written. It refuses with a typed `DataFlowRefused` error (code `DATA_FLOW_REFUSED`, with a static reason) in four cases:

- A protected class is detected, and the signed registry does not bind the route's provider and exact base URL to a processor and purpose that permit every detected class under an effective, unexpired covering contract. PHI also needs a declared BAA. Clock times such as `12:30:45` and bare 10-digit runs not preceded by `+` (Unix-seconds timestamps, counters) are not counted, so a phone number written as a bare 10-digit run, including a JSON number such as `4155552671`, is not detected; E.164 (`+14155552671`) and 11-digit (`14155552671`) forms are. A clock-shaped tail right after `::` (`2001:db8::10:20:30`) is counted as an IPv6 address, and a dropped clock time does not hide an address that overlaps it. The refusing detectors are:
  - `pii`: email addresses, North American phone numbers (formatted, E.164 or 11-digit), US SSNs, IPv4 and colon-hex IPv6 addresses, and keyword-bound EU VAT, national ID and passport numbers.
  - `phi`: keyword-bound medical record, health record, NHS and EHIC numbers.
  - `card_number`: Luhn-valid card numbers.
  - `bank_account`: mod-97-valid IBANs.
  - `credential`: OpenAI, GitHub and AWS key shapes, and JSON `password` values.
- The registry is present but unreadable, unsigned, wrongly signed or malformed. This refuses only a request in which something was detected.
- Detection itself refuses (`detector_invalid`): a single text leaf over 1,048,576 characters, more than 16,777,216 characters scanned across the request, nesting deeper than 32 (including tool-call arguments nested too deeply to parse), or an unsupported value shape. The request budget is far above any provider context window; it bounds how long hostile text can occupy the scan. Empty or malformed tool-call arguments are scanned as text after decoding their JSON escapes (`\n`, `\u0040`) rather than refused. A number in the arguments that overflows to Infinity (`1e999`) is treated as null, and the rest of those arguments are scanned leaf by leaf.
- The aggregate detection audit row cannot be written (`audit_failed`).

A permitted request is sent with unchanged content and digest. Before an admission decision is enforced, a `PROTECTED_DATA_DETECTED` audit row records only the classes, counts, detector-set digest and processor ID, never plaintext or spans. No DLP pattern backtracks quadratically on hostile text any more. The email pattern bounds its lengths (RFC 5321: local part 64, domain 253 and TLD 63 characters). That also changes `scanForPII`, which the vault API uses: an email whose local part, domain or TLD is longer is no longer reported or redacted (a longer dotted local part is redacted only from a later dot). The unbounded pattern was quadratic on hostile text. This departs from slice 1's design, which kept `scanForPII` byte-identical. The VAT, national ID, passport and health-record patterns use an unambiguous whitespace separator that matches exactly the text the earlier patterns matched, so their results are unchanged. Span detection retries a rejected card or IBAN match, which recovers cards and IBANs that a greedy match had merged with a neighbouring number or word; a dropped noise span is retried the same way.

Known gaps (debt):

- There is no CLI to create or sign the registry. `initProcessorRegistry` and `signProcessorRegistry` are owner-mode source helpers with no command yet.
- Opting in through classes declared in the compiled policy is not built.
- Compaction and request retry do not yet classify `DataFlowRefused`.
- Model-emitted tool-call arguments that are valid JSON nested deeper than 32 still refuse as `detector_invalid`, and because every later prepare re-scans the committed history, that session cannot send again. The same holds for a session whose committed history exceeds the request scan budget.
- Scanning is synchronous. Hostile text costs up to about 0.55 s per MiB, so a request near the scan budget can block preparation for several seconds before it is admitted or refused.
- Tokenized redaction, final-hop and other transport coverage, detector qualification and expert legal review remain outstanding.

This is partial, unqualified source.
