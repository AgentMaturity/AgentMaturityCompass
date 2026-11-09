/**
 * AMC_EXPECTED_MONITOR_FINGERPRINT as a pin, read the same way everywhere (follow-up 4): an empty value (a chart, a
 * Compose .env or `docker run -e` with no pin yet) is no pin, not an invalid one. An explicit empty option (for example
 * `--expect-monitor ""`) is not read here and stays refused by its caller.
 */
export function monitorPinFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.AMC_EXPECTED_MONITOR_FINGERPRINT || undefined;
}
