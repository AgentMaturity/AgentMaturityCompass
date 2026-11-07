import type { Command } from "commander";
import { repairWorkspaceTrustStore, revokeWorkspaceTrust, trustWorkspace, workspaceTrustVerdict } from "./security/workspaceTrust.js";

/**
 * `amc trust workspace` (SH-SANDBOX-07): the operator's consent record for a workspace's signed configuration.
 *
 * Attached to the existing `trust` group. Consent is recorded outside the workspace, in the AMC home, so nothing a
 * repository ships can grant it. `--status` only reads; `--revoke` removes the record; `--repair-store` moves an
 * unreadable store aside (never deletes it) so a fresh one can be written.
 */
export function registerSandboxCommands(program: Command): void {
  const trust = program.commands.find(command => command.name() === "trust");
  if (trust === undefined) throw new Error("amc trust workspace needs the trust command group registered first");
  trust.command("workspace")
    .description("Trust this workspace's signed configuration (key set and tools policy) on this machine, or show, revoke or repair that record")
    .option("--workspace <dir>", "workspace directory (default: cwd)")
    .option("--status", "show the verdict without recording anything")
    .option("--revoke", "remove this machine's consent record for the workspace")
    .option("--repair-store", "move an unreadable trust store aside so it can be rewritten")
    .option("--json", "print JSON")
    .action((opts: { workspace?: string; status?: boolean; revoke?: boolean; repairStore?: boolean; json?: boolean }) => {
      const workspace = opts.workspace ?? process.cwd();
      const emit = (value: Record<string, unknown>, text: string): void => { console.log(opts.json ? JSON.stringify(value, null, 2) : text); };
      if (opts.repairStore) {
        const aside = repairWorkspaceTrustStore();
        emit({ repaired: aside !== null, movedTo: aside }, aside === null ? "The workspace trust store is readable; nothing to repair." : `Moved the unreadable trust store to ${aside}. Trust the workspace again to write a fresh one.`);
        return;
      }
      if (opts.revoke) {
        const removed = revokeWorkspaceTrust(workspace);
        emit({ workspace, revoked: removed }, removed ? `Revoked this machine's trust in ${workspace}.` : `No trust record for ${workspace} on this machine.`);
        return;
      }
      const before = workspaceTrustVerdict(workspace);
      if (opts.status || before.state === "trusted" || before.state === "refused") {
        const text = before.state === "trusted" ? `${workspace}: trusted (${before.reason}).`
          : before.state === "refused" ? `${workspace}: refused: ${before.reason}`
          : before.state === "first-use" ? `${workspace}: not trusted on this machine. It would apply ${before.surface.toolsSummary}.`
          : `${workspace}: ${before.changed.join(" and ")} changed since trusted; it would apply ${before.surface.toolsSummary}.`;
        emit({ workspace, ...before }, text);
        if (before.state === "refused") process.exitCode = 1;
        return;
      }
      const record = trustWorkspace(workspace, "command");
      emit({ workspace, state: "trusted", record }, `Trusted ${workspace} on this machine: key set generation ${record.keysetGeneration}, tools policy ${record.toolsDigestSha256 ?? "none"}.`);
    });
}
