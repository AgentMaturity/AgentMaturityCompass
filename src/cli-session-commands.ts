/**
 * CLI surface for the turn-sealed session spine (P2.2): verify a workspace's
 * per-session lifecycle, inspect a single session's projected conversation and
 * event spine, and recover a crashed session by appending synthetic closers.
 *
 * Native sessions are operator-visible. Compaction extends the existing signed
 * spine and never delegates execution or storage to another harness.
 */
import type { Command } from "commander";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import chalk from "chalk";
import { registerSessionCompactionCommands } from "./cli-session-compaction-commands.js";
import { registerSessionSpillReadCommand } from "./cli-session-spill-read-command.js";

export function registerSessionCommands(program: Command): void {
  const session = program
    .command("session")
    .description("Native signed sessions: inspect, compact, verify, replay and recover");

  registerSessionCompactionCommands(session);
  registerSessionSpillReadCommand(session);

  session
    .command("verify")
    .description("Verify the ledger and report per-session lifecycle verdicts (open / released / interrupted / closed)")
    .option("--json", "Output as JSON")
    .option(
      "--expect-monitor <fingerprint>",
      "Expected monitor public-key fingerprint, supplied out of band (sha256 of the monitor .pub)"
    )
    .action(async (opts: { json?: boolean; expectMonitor?: string }) => {
      const { verifyLedgerIntegrity } = await import("./ledger/ledger.js");
      const { renderLedgerVerdict } = await import("./cli-evidence-store-commands.js");
      const result = await verifyLedgerIntegrity(process.cwd(), {
        ...(opts.expectMonitor ? { expectedMonitorFingerprint: opts.expectMonitor } : {})
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.ok ? 0 : 1);
        return;
      }
      console.log(renderLedgerVerdict(result));
      const { open, released, interrupted, closed } = result.sessions;
      console.log("");
      console.log(chalk.bold("Agent sessions"));
      console.log(`  ${chalk.green("closed")}      ${closed.length}`);
      console.log(`  ${chalk.cyan("open")}        ${open.length}`);
      console.log(`  ${chalk.cyan("released")}    ${released.length} (handed off; resumable)`);
      console.log(`  ${chalk.yellow("interrupted")} ${interrupted.length}`);
      for (const id of interrupted) {
        // Surfaced, never laundered: an interrupted session is reported distinctly
        // so an operator can decide whether to `session recover` it.
        console.log(chalk.yellow(`    interrupted: ${id}`));
      }
      process.exit(result.ok ? 0 : 1);
    });

  session
    .command("show")
    .description("Show a session's projected conversation and its event spine")
    .argument("<id>", "session id")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      const { openLedger } = await import("./ledger/ledger.js");
      const { projectSurface } = await import("./session/surfaceProjection.js");
      const { extractEnvelope } = await import("./session/sessionTypes.js");
      const ledger = openLedger(process.cwd());
      try {
        const events = ledger.getAllEvents().filter((event) => event.session_id === id);
        if (events.length === 0) {
          console.error(chalk.red(`No events found for session ${id}.`));
          process.exit(1);
          return;
        }
        const history = projectSurface(events);
        const spine = events.map((event) => {
          const envelope = extractEnvelope(event.meta_json);
          return {
            seq: envelope?.seq ?? null,
            turn: envelope?.turn ?? null,
            step: envelope?.step ?? null,
            eventType: event.event_type,
            eventId: event.id,
            surface: envelope?.surface.op ?? "n/a"
          };
        });
        if (opts.json) {
          console.log(JSON.stringify({ sessionId: id, spine, history }, null, 2));
          return;
        }
        console.log(chalk.bold(`Session ${id}`));
        console.log(chalk.gray(`  ${events.length} events`));
        console.log("");
        console.log(chalk.bold("Projected conversation (model-visible)"));
        for (const message of history) {
          console.log(`  ${chalk.cyan(message.role)}:`);
          for (const part of message.parts) {
            console.log(`    - ${part.kind} ${chalk.gray(part.sha256.slice(0, 16))}…`);
          }
        }
        console.log("");
        console.log(chalk.bold("Event spine"));
        for (const row of spine) {
          const label = `seq ${String(row.seq).padStart(3)} · turn ${row.turn ?? "-"} · step ${row.step ?? "-"}`;
          console.log(`  ${chalk.gray(label)}  ${row.eventType}  ${chalk.gray(row.surface)}`);
        }
      } finally {
        ledger.close();
      }
    });

  session
    .command("recover")
    .description("Recover a crashed session by appending synthetic closers under a fenced claim (append-only)")
    .argument("<id>", "session id")
    .option("--force", "Bypass the liveness gate (recover even a session that is not yet stale)")
    .option("--close", "Also append session/close and seal the row (a synthetic, clearly-marked close)")
    .option("--stale-after <ms>", "Staleness window in milliseconds before a session is deemed crashed")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { force?: boolean; close?: boolean; staleAfter?: string; json?: boolean }) => {
      const { recoverSession } = await import("./session/sessionRecovery.js");
      const staleAfterMs = opts.staleAfter === undefined ? undefined : Number.parseInt(opts.staleAfter, 10);
      if (staleAfterMs !== undefined && (!Number.isFinite(staleAfterMs) || staleAfterMs < 0)) {
        console.error(chalk.red(`Invalid --stale-after value: ${opts.staleAfter}`));
        process.exit(1);
        return;
      }
      const report = recoverSession({
        workspace: process.cwd(),
        sessionId: id,
        claimant: {
          pid: process.pid,
          hostId: hostname(),
          bootId: process.env.AMC_BOOT_ID ?? randomUUID(),
          startedAt: Math.round(Date.now() - process.uptime() * 1000)
        },
        force: Boolean(opts.force),
        close: Boolean(opts.close),
        ...(staleAfterMs !== undefined ? { staleAfterMs } : {})
      });
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        process.exit(report.verdict === "TAMPERED" ? 1 : 0);
        return;
      }
      const verdictColor =
        report.verdict === "RECOVERED"
          ? chalk.green
          : report.verdict === "TAMPERED"
            ? chalk.red
            : chalk.yellow;
      console.log(verdictColor(`Recovery ${report.verdict}`));
      if (report.reason) {
        console.log(chalk.gray(`  ${report.reason}`));
      }
      console.log(`  won claim:            ${report.wonClaim ? "yes" : "no"}`);
      console.log(`  synthetic turn ends:  ${report.syntheticTurnEnds}`);
      console.log(`  synthetic step ends:  ${report.syntheticStepEnds}`);
      console.log(`  unknown tool results: ${report.unknownToolOutcomes}`);
      console.log(`  unsealed tail before: ${report.unsealedTailCountBefore}`);
      console.log(`  closed:               ${report.closed ? "yes" : "no"}`);
      // A broken per-session chain is a tamper finding, never a crash; make it a
      // non-zero exit so an operator or CI treats it as the alarm it is.
      process.exit(report.verdict === "TAMPERED" ? 1 : 0);
    });

  // ── Anchoring: the operator-reachable half of P2.4 ──────────────────────
  //
  // Without these, anchorSessionRoot / exportSessionAnchorProof /
  // verifySessionAnchorProofFile had no non-test caller, so "sessions are
  // externally verifiable" was true of the library and of nobody's workflow.
  // A guarantee nobody can invoke is not a guarantee.
  session
    .command("anchor")
    .description("Anchor a closed session's root into the transparency log")
    .argument("<id>", "session id")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      const { anchorSessionRoot } = await import("./transparency/sessionAnchor.js");
      try {
        const result = anchorSessionRoot({ workspace: process.cwd(), sessionId: id });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(chalk.green(`Anchored session ${id}`));
        console.log(chalk.gray("  descriptor sha256: "), result.descriptorSha256);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  session
    .command("proof")
    .description("Export a session's inclusion proof (verifiable offline, without this workspace)")
    .argument("<id>", "session id")
    .requiredOption("--out <path>", "file to write the proof bundle to")
    .action(async (id: string, opts: { out: string }) => {
      const { exportSessionAnchorProof } = await import("./transparency/sessionAnchorProof.js");
      try {
        const exported = exportSessionAnchorProof({
          workspace: process.cwd(),
          sessionId: id,
          outFile: opts.out
        });
        console.log(chalk.green(`Wrote ${exported.outFile}`));
        // The fingerprint must travel out of band, not inside the bundle it
        // authenticates — a proof that carries its own trust anchor proves only
        // that it is self-consistent.
        console.log(chalk.gray("  auditor key fingerprint (share out of band):"));
        console.log(`    ${exported.auditorKeyFingerprint}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // The operator-facing half of "requests are reconstructable": rebuild every
  // request this session sent, from the log alone, and say whether the bytes
  // still hash to what the signed row committed to. A digest nobody can check is
  // not evidence, and until this command there was no way to check one.
  session
    .command("replay-request")
    .description("Rebuild each request this session sent from its signed rows and check it against the recorded digest")
    .argument("<id>", "session id")
    .option("--json", "Output as JSON")
    .option("--out <path>", "Write the reconstructed bytes of the first request to a file")
    .action(async (id: string, opts: { json?: boolean; out?: string }) => {
      const { deriveSessionRequests } = await import("./llm/request/deriveRequest.js");
      const { verifyLedgerIntegrity } = await import("./ledger/ledgerVerification.js");
      const { writeFileSync } = await import("node:fs");
      const workspace = process.cwd();

      // Verify the log BEFORE pronouncing anything reconstructed. Derivation
      // folds rows without checking them — deliberately, since integrity is
      // verifyLedgerIntegrity's job — but this command speaks to an operator,
      // and "reconstructed" over a log whose rows fail event_hash would tell
      // them the bytes are trustworthy when nothing established that. Reporting
      // success over evidence whose integrity was never checked is the same
      // false green this project has now had to close three times.
      const integrity = await verifyLedgerIntegrity(workspace);
      if (!integrity.chain.ok) {
        console.error(chalk.red("Refusing to replay: this workspace's evidence chain does not verify."));
        for (const problem of integrity.chain.errors.slice(0, 5)) console.error(`  - ${problem}`);
        console.error(chalk.gray("  A reconstructed request proves nothing over a log that does not verify."));
        process.exit(1);
        return;
      }
      if (!integrity.trustRoot.anchored) {
        // Not fatal — unanchored verification is the documented default — but
        // the operator must not read the verdict below as proof of authorship.
        console.error(
          chalk.yellow(
            "Note: verification is unanchored (no expected monitor key pinned), so this confirms\n" +
              "internal consistency, not authorship. Pin AMC_EXPECTED_MONITOR_FINGERPRINT to anchor it."
          )
        );
      }

      const derivations = deriveSessionRequests({ workspace, sessionId: id });
      if (derivations.length === 0) {
        console.error(chalk.red(`Session ${id} recorded no request/header events.`));
        process.exit(1);
        return;
      }
      // A pruned payload is a LAWFUL deletion, so it must not set the failure
      // exit code — conflating retention with tampering is its own defect.
      const alarms = derivations.filter(
        (entry) => entry.status !== "reconstructed" && entry.status !== "payload-pruned"
      );
      if (opts.out !== undefined) {
        const first = derivations.find((entry) => entry.bytes !== null);
        if (first?.bytes != null) {
          writeFileSync(opts.out, first.bytes);
        }
      }
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              sessionId: id,
              requests: derivations.map((entry) => ({ ...entry, bytes: entry.bytes === null ? null : entry.bytes.length }))
            },
            null,
            2
          )
        );
        process.exit(alarms.length === 0 ? 0 : 1);
        return;
      }
      console.log(chalk.bold(`Recorded requests in session ${id}`));
      for (const entry of derivations) {
        const colour =
          entry.status === "reconstructed" ? chalk.green : entry.status === "payload-pruned" ? chalk.yellow : chalk.red;
        console.log(`  ${colour(entry.status.padEnd(22))} ${chalk.gray(entry.headerEventId)}`);
        if (entry.detail !== null) console.log(`    ${chalk.gray(entry.detail)}`);
        for (const problem of entry.inconsistencies) console.log(`    ${chalk.yellow(problem)}`);
      }
      process.exit(alarms.length === 0 ? 0 : 1);
    });

  session
    .command("verify-proof")
    .description("Verify a session inclusion proof offline — needs only the bundle and a pinned fingerprint")
    .argument("<file>", "proof bundle path")
    .requiredOption("--expect-auditor-key <sha256>", "auditor public key fingerprint, obtained out of band")
    .option("--json", "Output as JSON")
    .action(async (file: string, opts: { expectAuditorKey: string; json?: boolean }) => {
      const { verifySessionAnchorProofFile } = await import("./transparency/sessionAnchorVerify.js");
      const verdict = verifySessionAnchorProofFile({
        file,
        expectedAuditorKeyFingerprint: opts.expectAuditorKey
      });
      if (opts.json) {
        console.log(JSON.stringify(verdict, null, 2));
        process.exit(verdict.ok ? 0 : 1);
        return;
      }
      if (verdict.ok) {
        console.log(chalk.green("Session inclusion proof VERIFIED"));
      } else {
        console.log(chalk.red("Session inclusion proof FAILED"));
        for (const err of verdict.errors) console.log(`  - ${err}`);
      }
      process.exit(verdict.ok ? 0 : 1);
    });
}
