import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { closeAllSqlitePools } from "../src/storage/sqlitePool.js";
import YAML from "yaml";

/**
 * Power-loss durability is opt-in.
 *
 * synchronous=FULL is process/OS-crash durable but, on macOS/APFS, its fsync()
 * does not flush the drive write cache; only PRAGMA fullfsync=1 (F_FULLFSYNC)
 * does, at ~96x the per-commit cost. So the default is the fast, crash-durable
 * setting, and a deployment that needs true power-loss durability turns it on
 * — via amc.config.yaml security.durability or the AMC_LEDGER_FULLFSYNC env.
 *
 * These assert the pragma actually flips, because a config knob that does not
 * reach the database is worse than none: it promises a durability the storage
 * is not delivering.
 */
const PASS = "ledger-durability-passphrase";

function withWorkspace<T>(fn: (workspace: string) => T): T {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const workspace = mkdtempSync(join(tmpdir(), "amc-durability-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  try {
    return fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
    if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
    else process.env["AMC_VAULT_PASSPHRASE"] = prior;
  }
}

function setDurability(workspace: string, durability: "crash" | "power-loss"): void {
  const configPath = join(workspace, ".amc", "amc.config.yaml");
  const config = (YAML.parse(readFileSync(configPath, "utf8")) ?? {}) as {
    security?: Record<string, unknown>;
  };
  config.security = { ...(config.security ?? {}), durability };
  writeFileSync(configPath, YAML.stringify(config));
}

function fullfsyncOf(workspace: string): number {
  // Durability is resolved when the pooled connection is created, so force a
  // fresh pool to pick up a changed setting — mirroring a process restart,
  // which is when a deployment's durability choice actually takes effect.
  closeAllSqlitePools();
  const ledger = openLedger(workspace);
  try {
    return ledger.db.pragma("fullfsync", { simple: true }) as number;
  } finally {
    ledger.close();
  }
}

describe("ledger power-loss durability is opt-in", () => {
  it("defaults to fullfsync OFF — the fast, crash-durable setting", () => {
    withWorkspace((workspace) => {
      expect(fullfsyncOf(workspace)).toBe(0);
    });
  });

  it("turns fullfsync ON when the config asks for power-loss durability", () => {
    withWorkspace((workspace) => {
      // A real deployment would re-sign the config; this test drives only the
      // pragma resolution, which reads the file directly.
      setDurability(workspace, "power-loss");
      expect(fullfsyncOf(workspace)).toBe(1);
    });
  });

  it("lets the environment override the config, both directions", () => {
    withWorkspace((workspace) => {
      setDurability(workspace, "power-loss");

      const prior = process.env["AMC_LEDGER_FULLFSYNC"];
      try {
        // Ops can force it off even when the config asks for it (e.g. a
        // throughput incident) ...
        process.env["AMC_LEDGER_FULLFSYNC"] = "0";
        expect(fullfsyncOf(workspace)).toBe(0);
        // ... and on even when the config does not.
        process.env["AMC_LEDGER_FULLFSYNC"] = "1";
        expect(fullfsyncOf(workspace)).toBe(1);
      } finally {
        if (prior === undefined) delete process.env["AMC_LEDGER_FULLFSYNC"];
        else process.env["AMC_LEDGER_FULLFSYNC"] = prior;
      }
    });
  });
});
