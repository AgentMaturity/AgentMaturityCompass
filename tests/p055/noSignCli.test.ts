/**
 * P0-55 cases 4 (first-run), 12 (`amc monitor --stdin`) and 13 (68e8eec4) through the built CLI: an unsigned capture
 * writes nothing unsigned into `.amc/evidence.sqlite`, and the dry run names the store the next step scores.
 */
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "amc-p055-cli-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** No vault passphrase, as a first-run user. */
function cli(args: string[], extra: NodeJS.ProcessEnv = {}, input?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", AMC_CONTROL_CHECKPOINT_DIR: join(dir, "checkpoints"), ...extra };
  for (const name of ["AMC_VAULT_PASSPHRASE", "AMC_VAULT_PASSPHRASE_FILE", "AMC_NO_SIGN"]) if (!(name in extra)) delete env[name];
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], { cwd: dir, env, encoding: "utf8", input, timeout: 60_000 });
}

function rows(relative: string): { unsigned: number; total: number } {
  const path = join(dir, relative);
  if (!existsSync(path)) return { unsigned: 0, total: 0 };
  const db = new Database(path, { readonly: true });
  try {
    return { unsigned: (db.prepare("SELECT COUNT(*) AS n FROM evidence_events WHERE writer_sig = 'unsigned'").get() as { n: number }).n,
      total: (db.prepare("SELECT COUNT(*) AS n FROM evidence_events").get() as { n: number }).n };
  } finally { db.close(); }
}

test("case 13: an unsigned --first-run --dry-run prints the unsigned quickscore step and the store it reads", () => {
  const out = cli(["evidence", "collect", "--first-run", "--dry-run", "--agent", "demo-agent", "--runtime", "any", "--", "node", "agent.js"]);
  expect(out.status, out.stdout + out.stderr).toBe(0);
  expect(out.stdout).toContain("Next: AMC_NO_SIGN=1 amc quickscore --auto (the capture is in .amc/unsigned/evidence.sqlite)");
});

test("case 4: amc evidence collect --first-run without a passphrase writes no writer_sig='unsigned' row into the signed store", () => {
  const out = cli(["evidence", "collect", "--first-run", "--agent", "demo-agent", "--runtime", "any", "--", process.execPath, "-e", "console.log('p055')"]);
  expect(out.status, out.stdout + out.stderr).toBe(0);
  expect(rows(".amc/evidence.sqlite").unsigned).toBe(0);
  expect(rows(".amc/unsigned/evidence.sqlite").unsigned).toBeGreaterThan(0);
});

test("case 12: AMC_NO_SIGN=1 amc monitor --stdin writes its rows into the unsigned store, none unsigned into the signed one", () => {
  const init = cli(["init"], { AMC_VAULT_PASSPHRASE: "p055-cli-fixture" });
  expect(init.status, init.stdout + init.stderr).toBe(0);
  const out = cli(["monitor", "--stdin", "--runtime", "unknown"], { AMC_NO_SIGN: "1" }, "hello from stdin\n");
  expect(out.status, out.stdout + out.stderr).toBe(0);
  expect(rows(".amc/evidence.sqlite").unsigned).toBe(0);
  expect(rows(".amc/unsigned/evidence.sqlite").unsigned).toBeGreaterThan(0);
});
