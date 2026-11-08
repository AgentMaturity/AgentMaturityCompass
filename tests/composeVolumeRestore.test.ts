import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureSigningKeys } from "../src/crypto/keys.js";
import { runtimeFirewallStatus, writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { read } from "./helpers/deployPackFixtures.js";

// COMPOSE.md's volume archive and restore, run as written (the container's "/" mapped to a temp directory) against the real
// signed-control journal (skeptic 2026-11-08): `tar -x` over live volumes kept checkpoints newer than the restored journal,
// so a control published after the backup failed closed ("journal was truncated behind checkpoint revision 2").
const doc = read("docs/deploy/reference/COMPOSE.md").replace(/\\\n\s*/g, " ");

/** The documented `docker compose run ... --entrypoint <cmd> amc-studio <args> <redirect>` as a local shell command. */
function documented(redirect: string, root: string): string {
  const match = new RegExp(`--entrypoint (\\S+) amc-studio (.*?) ${redirect}`).exec(doc);
  expect(match, `COMPOSE.md command with ${redirect}`).not.toBeNull();
  return `${match![1]} ${match![2]}`
    .replace(/(^|[\s'"])\/(home|workspace)(?=[\s'"/]|$)/g, `$1${root}/$2`)
    .replace(/-C \/(?=[\s'"]|$)/g, `-C ${root}/`);
}

describe("Compose volume backup and restore as COMPOSE.md writes them (skeptic 2026-11-08)", () => {
  it("replaces the state and checkpoint volumes exactly, keeping only the kill-switch mirror", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-compose-restore-"));
    const checkpoints = join(root, "workspace", "control-checkpoints");
    const state = join(root, "home", "amc", ".config", "amc", "state");
    const previous = process.env.AMC_CONTROL_CHECKPOINT_DIR;
    process.env.AMC_CONTROL_CHECKPOINT_DIR = checkpoints;
    try {
      const workspace = mkdtempSync(join(root, "data-"));
      mkdirSync(state, { recursive: true });
      writeFileSync(join(state, "high-water.json"), "{}\n");
      ensureSigningKeys(workspace);
      writeRuntimeFirewallPolicy({ workspace, mode: "observe" }); // revision 1, before the backup
      cpSync(join(workspace, ".amc"), join(root, "bundle-amc"), { recursive: true }); // stands in for the signed bundle
      const archive = spawnSync("sh", ["-c", documented("> \\./amc-volumes-", root)]);
      expect(archive.status, archive.stderr.toString()).toBe(0);

      writeRuntimeFirewallPolicy({ workspace, mode: "block" }); // revision 2, after the backup
      writeFileSync(join(state, "written-after-backup.json"), "{}\n");
      const [workspaceHash] = readdirSync(checkpoints);
      mkdirSync(join(checkpoints, workspaceHash!, "kill-switch"));
      writeFileSync(join(checkpoints, workspaceHash!, "kill-switch", "kill-after-backup.json"), "{}\n");

      // Rollback step 3: the restored .amc replaces the live one, then the documented volume restore.
      renameSync(join(workspace, ".amc"), join(workspace, ".amc.rolled-back"));
      renameSync(join(root, "bundle-amc"), join(workspace, ".amc"));
      const restore = spawnSync("sh", ["-c", documented("< \\./amc-volumes-", root)], { input: archive.stdout });
      expect(restore.status, restore.stderr.toString()).toBe(0);

      const status = runtimeFirewallStatus(workspace);
      expect({ integrity: status.integrity, mode: status.mode, revision: status.policyRevision }, status.reason)
        .toEqual({ integrity: "trusted", mode: "observe", revision: 1 });
      expect(existsSync(join(state, "high-water.json"))).toBe(true);
      expect(existsSync(join(state, "written-after-backup.json"))).toBe(false);
      // Kill records only add stops: a kill issued after the backup stays until an owner releases it.
      expect(existsSync(join(checkpoints, workspaceHash!, "kill-switch", "kill-after-backup.json"))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.AMC_CONTROL_CHECKPOINT_DIR; else process.env.AMC_CONTROL_CHECKPOINT_DIR = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("takes the bundle and the volume archive at one point, with Studio stopped, and checks the controls after a restore", () => {
    const backup = doc.slice(doc.indexOf("## Backup\n"), doc.indexOf("## Upgrade (N-1 to N)\n"));
    const at = (pattern: RegExp) => backup.search(pattern);
    expect(at(/docker compose -f docker-compose\.tls\.yml stop amc-studio/)).toBeGreaterThanOrEqual(0);
    expect(at(/stop amc-studio/)).toBeLessThan(at(/ run --rm --no-deps -T -w \/data\/amc --entrypoint sh amc-studio -c '[^']*amc backup create/));
    expect(at(/amc backup create/)).toBeLessThan(at(/-czf - -C \/ home\/amc\/\.config\/amc\/state workspace\/control-checkpoints/));
    expect(at(/-czf - -C \//)).toBeLessThan(at(/docker compose -f docker-compose\.tls\.yml start amc-studio/));
    expect(backup).not.toMatch(/ exec -T -w \/data\/amc amc-studio sh -c '[^']*amc backup create/);
    const rollback = doc.slice(doc.indexOf("## Rollback\n"), doc.indexOf("## TLS for a public hostname\n"));
    expect(rollback).toMatch(/amc firewall status --json` must not report `"integrity": "invalid"`/);
  });
});
