/**
 * `amc observe otel-preview` (SH-OBS-01): fold one recorded session into the exact OTLP/HTTP JSON bodies the exporter
 * would send, with no network. Endpoints are shown as host only; header values are never printed.
 */
import type { Command } from "commander";
import chalk from "chalk";

interface PreviewOptions { session: string; json?: boolean }

export function registerOtelPreviewCommand(observe: Command): void {
  observe
    .command("otel-preview")
    .description("Print the OTLP traces and metrics a recorded native session would export (offline, GenAI span tree)")
    .requiredOption("--session <id>", "session id")
    .option("--json", "Print the OTLP request bodies as JSON")
    .action(async (opts: PreviewOptions) => {
      const { readNativeSessionEvents } = await import("./session/readNativeSessionEvents.js");
      const { NativeSpanFolder } = await import("./observability/nativeSessionSpans.js");
      const { ObservabilityOTELExporter, recordFoldOutput } = await import("./observability/otelExporter.js");
      const { endpointHostOnly, resolveOtelEnvConfig } = await import("./observability/otelEnvConfig.js");
      const events = readNativeSessionEvents(process.cwd(), opts.session);
      if (events.length === 0) {
        console.error(chalk.red(`No events found for session ${opts.session}.`));
        process.exitCode = 1;
        return;
      }
      const resolved = resolveOtelEnvConfig();
      // The preview always folds, even with export off: it shows what would be sent, against a default OTLP target.
      const targets = resolved.config.targets.length > 0 ? resolved.config.targets : [{ kind: "otlp" as const, endpoint: "http://127.0.0.1:4318" }];
      const exporter = new ObservabilityOTELExporter({ ...resolved.config, enabled: true, targets: targets.map((target) => ({ ...target, headers: {} })) });
      const folder = new NativeSpanFolder();
      const folded = events.map((event) => folder.ingest(event)).filter((output) => output !== null);
      for (const output of [...folded, folder.drain(events[events.length - 1]!.ts)]) recordFoldOutput(exporter, output);
      const requests = exporter.previewRequests().map((request) => ({ ...request, endpoint: endpointHostOnly(request.endpoint) }));
      if (opts.json) {
        console.log(JSON.stringify({ sessionId: opts.session, export: resolved.config.enabled ? "enabled" : "disabled", disabledReason: resolved.disabledReason, requests }, null, 2));
        return;
      }
      console.log(chalk.bold(`OTel preview for session ${opts.session}`));
      console.log(chalk.gray(`  export ${resolved.config.enabled ? "enabled" : `disabled${resolved.disabledReason ? ` (${resolved.disabledReason})` : " (AMC_OTEL_ENABLED unset)"}`}`));
      const spans = folded.flatMap((output) => output.spans);
      const byParent = new Map<string | undefined, typeof spans>();
      for (const span of spans) byParent.set(span.parentSpanId, [...(byParent.get(span.parentSpanId) ?? []), span]);
      const print = (parent: string | undefined, depth: number): void => {
        for (const span of byParent.get(parent) ?? []) {
          const ms = (Number(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1e6).toFixed(0);
          const notes = span.attributes.filter((a) => ["amc.usage.status", "amc.cost.basis", "amc.turn.reason", "amc.tool.outcome", "error.type", "amc.span.unterminated"].includes(a.key))
            .map((a) => `${a.key}=${a.value.stringValue ?? a.value.boolValue ?? a.value.intValue ?? a.value.doubleValue}`).join(" ");
          console.log(`${"  ".repeat(depth + 1)}${span.name}  ${chalk.gray(`${ms} ms${notes ? `  ${notes}` : ""}`)}`);
          print(span.spanId, depth + 1);
        }
      };
      print(undefined, 0);
      const points = folded.flatMap((output) => output.metrics);
      console.log(chalk.bold(`  metrics: ${points.length} point(s)`));
      for (const point of points) console.log(`    ${point.name} ${point.value} ${point.unit}`);
      for (const request of requests) console.log(chalk.gray(`  ${request.signal} -> ${request.endpoint}`));
    });
}
