import { runRetention, runRetentionAsync, retentionStatus, verifyRetention } from "./retentionEngine.js";
import { runRetentionForStudioAsync } from "./retentionRun.js";

export function retentionStatusCli(workspace: string): ReturnType<typeof retentionStatus> {
  return retentionStatus(workspace);
}

export function retentionRunCli(workspace: string, dryRun: boolean): ReturnType<typeof runRetention> {
  return runRetention({
    workspace,
    dryRun
  });
}

export async function retentionVerifyCli(workspace: string): Promise<Awaited<ReturnType<typeof verifyRetention>>> {
  return verifyRetention(workspace);
}

export function retentionRunCliAsync(workspace: string, dryRun: boolean): ReturnType<typeof runRetentionAsync> {
  return runRetentionAsync({ workspace, dryRun });
}

/** Internal request-scoped Studio boundary; deliberately absent from root SDK exports. */
export function retentionRunStudioAsync(workspace: string, dryRun: boolean, beforePublish: () => void): ReturnType<typeof runRetentionAsync> {
  return runRetentionForStudioAsync({ workspace, dryRun }, beforePublish);
}

