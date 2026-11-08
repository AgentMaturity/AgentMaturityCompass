/**
 * H1: the .amc/.gitignore a new workspace gets. A committed .amc workspace is supported (the GitHub Action uses one as
 * it is, its passphrase from a repository secret: amc-action/README.md), so only secrets and per-machine runtime state
 * are ignored; signed configuration, public keys, the encrypted vault and the evidence stay committable. An existing
 * .amc/.gitignore is the operator's and is never rewritten.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const AMC_GITIGNORE = [
  "# Written by AMC when this workspace was created; AMC never rewrites it.",
  "# Secrets and per-machine runtime state stay out of git. The rest of .amc (signed configuration, public keys, the",
  "# encrypted vault, evidence) can be committed: the AMC GitHub Action uses a committed .amc workspace as it is.",
  "local-vault-passphrase",
  "license.key",
  "studio/",
  "studio-demo-host/",
  "blobs/unvaulted.key",
  "auth/api-keys.json",
  "bridge/pairing-codes.json",
  "dataflow/token-vault.sqlite*",
  "hooks/",
  "wire/",
  "diagnostics/",
  ".*-locks/",
  "*.sqlite-shm",
  ""
].join("\n");

/** The secrets those lines keep out of git (relative to .amc); `amc doctor` checks each is ignored and not tracked (LIVE-VAULT-11). */
export const AMC_SECRET_FILES = [
  "local-vault-passphrase", "studio/admin.token", "studio/sessions", "auth/api-keys.json", "license.key", "blobs/unvaulted.key",
  "bridge/pairing-codes.json"
] as const;

/** Creates .amc/.gitignore only where none exists ("wx"), so an operator's own file is never replaced. */
export function ensureAmcGitignore(amcDir: string): void {
  try {
    writeFileSync(join(amcDir, ".gitignore"), AMC_GITIGNORE, { flag: "wx", mode: 0o644 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}
