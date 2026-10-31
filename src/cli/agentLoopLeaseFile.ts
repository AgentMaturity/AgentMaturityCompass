import type { Command } from "commander";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { readPrivateTokenFile } from "../setup/nativeApprovalIdentity.js";

/**
 * `--lease-file` for `agent-loop run` and `chat` (AXR-20): an issued agent lease (`amc lease issue`) for a plan whose
 * identity-binding requires one. Read like an approval session token (private 0600 file owned by this user), verified
 * for this workspace and agent before use, and never logged.
 */
export function withLeaseFileOption(command: Command): Command {
  return command.option("--lease-file <path>", "issued agent lease (amc lease issue) for an identity-binding plan; a private 0600 file you own, never logged");
}

/** Spread into `runLease`: the verified lease token from `--lease-file`, or nothing when the flag is absent. */
export function leaseFileToken(workspace: string, agentId: string, path: string | undefined): { readonly leaseToken?: string } {
  if (path === undefined) return {};
  const token = readPrivateTokenFile(path, "Lease");
  const verified = verifyLeaseToken({ workspace, token, expectedAgentId: agentId });
  if (!verified.ok) throw new Error(`--lease-file holds no valid lease for agent ${agentId} in this workspace (${verified.error}); issue one with amc lease issue`);
  return { leaseToken: token };
}
