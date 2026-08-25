import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { wrapAny } from "../src/ledger/monitor.js";

/**
 * What `amc wrap` gained by moving onto the execution substrate, and what it
 * had to keep.
 *
 * KEEP: the event vocabulary. `profileResolver` distinguishes a wrap-style
 * session from an adapter-style one by counting `stdin` events against
 * `agent_process_started`, so a fold that "cleaned up" the vocabulary would
 * silently reclassify every historical session.
 *
 * GAIN: termination, bounding, scrubbing, and a sealed session when the spawn
 * fails. `spawnMonitoredProcess` had none of these — no kill path at all, no
 * cap on what it wrote to the signed ledger, no redaction of child output, and
 * a spawn error that rejected before `sealSession`.
 */
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = prior ?? "monitor-fold-passphrase";
  const dir = mkdtempSync(join(tmpdir(), "amc-fold-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function readSession(dir: string, sessionId: string): {
  types: string[];
  metas: Array<Record<string, unknown>>;
  sealed: boolean;
} {
  const ledger = openLedger(dir);
  try {
    const events = ledger.getAllEvents().filter((e) => e.session_id === sessionId);
    const session = ledger.getAllSessions().find((r) => r.session_id === sessionId);
    return {
      types: events.map((e) => e.event_type),
      metas: events.map((e) => JSON.parse(e.meta_json) as Record<string, unknown>),
      sealed: Boolean(session?.session_seal_sig)
    };
  } finally {
    ledger.close();
  }
}

describe("the wrap path after the fold", () => {
  it("still emits the event vocabulary downstream consumers count", async () => {
    const dir = workspace();
    const sessionId = await wrapAny("/bin/sh", ["-c", "echo hello; echo oops 1>&2; exit 3"], { workspace: dir });
    const { types, metas, sealed } = readSession(dir, sessionId);

    expect(types, "the start marker profileResolver keys on").toContain("gateway");
    expect(types).toContain("stdout");
    expect(types).toContain("stderr");
    expect(types).toContain("metric");
    expect(sealed, "a completed run seals its session").toBe(true);

    const exit = metas.find((m) => m["metricKey"] === "runtime_exit_code");
    expect(exit?.["value"], "the exit code survives the fold").toBe(3);
  });

  it("records the new termination facts alongside the exit code", async () => {
    // These did not exist before: nothing could terminate a wrapped process,
    // so nothing could describe having done so.
    const dir = workspace();
    const controller = new AbortController();
    const run = wrapAny("/bin/sh", ["-c", "sleep 30"], { workspace: dir, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 300));
    controller.abort();
    const sessionId = await run;

    const { metas } = readSession(dir, sessionId);
    const exit = metas.find((m) => m["metricKey"] === "runtime_exit_code");
    expect(exit?.["terminatedBy"], "a cancel is an audit fact, not an exit code").toBe("cancel");
    expect(exit).toHaveProperty("treeExitProven");
  });

  it("seals the session when the binary does not exist", async () => {
    // Before the fold the promise rejected before sealSession, leaving a
    // session open forever with no explanation in the chain.
    const dir = workspace();
    let sessionId: string | null = null;
    await expect(wrapAny("/definitely/not/a/binary", [], { workspace: dir })).rejects.toThrow();

    const ledger = openLedger(dir);
    const sessions = ledger.getAllSessions();
    const events = ledger.getAllEvents();
    ledger.close();
    sessionId = sessions[0]?.session_id ?? null;

    expect(sessionId, "the session was opened before the spawn was attempted").not.toBeNull();
    expect(sessions[0]?.session_seal_sig, "a failed spawn still closes its session").toBeTruthy();
    expect(
      events.some((e) => (JSON.parse(e.meta_json) as Record<string, unknown>)["metricKey"] === "runtime_spawn_failed"),
      "and says why"
    ).toBe(true);
  });

  it("does not leak the provider keys in AMC's own environment to the child", async () => {
    const dir = workspace();
    const prior = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "sk-parent-key-must-not-reach-child";
    try {
      const sessionId = await wrapAny("/bin/sh", ["-c", "echo \"[$OPENAI_API_KEY]\""], { workspace: dir });
      const ledger = openLedger(dir);
      const text = ledger
        .getAllEvents()
        .filter((e) => e.session_id === sessionId && e.event_type === "stdout")
        .map((e) => e.payload_inline ?? "")
        .join("");
      ledger.close();
      expect(text).not.toContain("must-not-reach-child");
    } finally {
      if (prior === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = prior;
    }
  });

  it("marks the child as an evaluated agent so it cannot write to the ledger", async () => {
    // AMC_EVALUATED_AGENT=1 is the ledger's trusted-writer fence. The wrap path
    // has always set it; pinned here because the fold rebuilt the environment
    // and dropping it would silently unfence every observed agent.
    const dir = workspace();
    const sessionId = await wrapAny("/bin/sh", ["-c", "echo \"[$AMC_EVALUATED_AGENT]\""], { workspace: dir });
    const ledger = openLedger(dir);
    const text = ledger
      .getAllEvents()
      .filter((e) => e.session_id === sessionId && e.event_type === "stdout")
      .map((e) => e.payload_inline ?? "")
      .join("");
    ledger.close();
    expect(text).toContain("[1]");
  });
});
