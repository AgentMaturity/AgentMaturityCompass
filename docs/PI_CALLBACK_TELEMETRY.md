# Pi callback telemetry

AMC implements the passive telemetry context shape pinned to Pi `b2602be77cb7b0de45dd616407fd210daa48aa75`. It records a bounded operational subset without changing callback results or rejection objects. It can also bind Pi event listeners. This implementation is awaiting the final combined validation pass.

```ts
import { writeFile } from "node:fs/promises";
import { createPiTelemetryBridge } from "agent-maturity-compass/telemetry/pi";

const bridge = createPiTelemetryBridge({ maxSpans: 512, maxBytes: 1_000_000 });

// Supply bridge.telemetryContext to the corresponding Pi telemetry context hook.
// The context is also usable directly for an explicitly reported operation.
const result = await bridge.telemetryContext.startSpan({
  name: "pi.operation.example",
  attributes: { "pi.operation.id": "example-1" }
}, async span => {
  // Your operation runs exactly once. Recording does not execute an exporter.
  span.setAttributes({ "pi.operation.outcome": "completed" });
  return "example result";
});

const receipt = await bridge.capture.flush(async document => {
  await writeFile("callback-batch.json", JSON.stringify(document), { mode: 0o600 });
});
console.log(result, receipt.ok, receipt.remaining);
bridge.capture.close();
```

The example is an explicit source report, not independently observed execution. `onEvent` is the passive listener for a supplied Pi event bus. `bindWatch(handle)` attaches to an implemented handle and returns explicit unsubscribe/cleanup state. At the pinned revision, Pi's experimental `watchSession()` still throws `SliceNotImplemented`; the bridge does not make that stub operational. Use a working event bus or implemented handle. Unsubscribe before closing capture, and inspect `cleanupPending` if unsubscribe fails.

Source times and durations remain null unless provided. A callback's fulfilled promise is recorded as fulfilled callback settlement, not inferred task success. Rejections, explicit error statuses and cancellation retain separate fields. Parent span IDs remain explicit; parents flushed in earlier batches are disclosed as absent rather than reconstructed. Final usage remains attributed to its source event; overlapping parent/event totals are not summed.

Default attributes exclude prompt/completion content, tool arguments/results, credentials and free-form error details. Explicit attribute extensions still reject sensitive content keys and credential patterns. Bounds and unreadable inputs increment loss counters; they do not prevent the original callback from running. Closing capture leaves unfinished callbacks without an asserted outcome. Writes occur only on explicit `flush`; failed sinks retain records for retry. An uncertain sink failure can cause at-least-once delivery, so consumers deduplicate by capture ID and span ID.

Review the exported file using `amc import callback-batch.json --dry-run --json`, then apply its reviewed semantic digest. The importer refuses malformed recognized callback versions and preserves `SELF_REPORTED` / `NOT_EVALUATED`. Local artifact signing cannot upgrade that provenance. [Portable external-evidence exports](EXTERNAL_EVIDENCE_PROFILE.md) provide a common operational projection separately from the fuller redacted callback source.
