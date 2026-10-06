import { createBackup, printBackup, restoreBackup, verifyBackup } from "./backupEngine.js";

export function backupCreateCli(workspace: string, outFile: string): ReturnType<typeof createBackup> {
  return createBackup({
    workspace,
    outFile
  });
}

export function backupVerifyCli(params: Parameters<typeof verifyBackup>[0]): ReturnType<typeof verifyBackup> {
  return verifyBackup(params);
}

export function backupPrintCli(backupFile: string): ReturnType<typeof printBackup> {
  return printBackup(backupFile);
}

export async function backupRestoreCli(params: Parameters<typeof restoreBackup>[0]): Promise<Awaited<ReturnType<typeof restoreBackup>>> {
  return restoreBackup(params);
}

