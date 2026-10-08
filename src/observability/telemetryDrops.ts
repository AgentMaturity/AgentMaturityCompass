/**
 * Telemetry the exporter dropped since the last take (P1-03, failure row `telemetry-exporter-down`): a record that
 * threw, or an item in a batch whose dispatch failed, counted once per failed target. Observability still never blocks
 * core workflows; the count lets the action journal write a `TELEMETRY_DROPPED` audit row, so a drop is not silent.
 */
let dropped = 0;

/** Count drops. Also gives back a count whose audit row could not be written, so the next row reports it. */
export function noteTelemetryDropped(count: number): void {
  dropped += count;
}

export function takeDroppedTelemetry(): number {
  const count = dropped;
  dropped = 0;
  return count;
}
