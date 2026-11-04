import { join } from "node:path";
import { pathExists } from "../../utils/fs.js";
import { openLedger } from "../../ledger/ledger.js";
import { loadBlobMetadata, loadBlobPlaintext, verifyBlobIndexChain } from "./blobStore.js";

import type { TrustContext } from "../../trust/trustContext.js";

export interface BlobVerifyOptions {
  trust?: TrustContext;
  decrypt?: boolean;
  verifyLedgerReferences?: boolean;
}

export interface BlobVerifyResult {
  ok: boolean;
  errors: string[];
  checkedBlobRefs: number;
  checkedRows: number;
}

export function verifyBlobStore(
  workspace: string,
  options: BlobVerifyOptions = {}
): BlobVerifyResult {
  const decrypt = options.decrypt ?? true;
  const verifyLedgerRefs = options.verifyLedgerReferences ?? true;
  const errors: string[] = [];
  const chain = verifyBlobIndexChain(workspace, options.trust);
  errors.push(...chain.errors);

  let checkedBlobRefs = 0;
  let checkedRows = 0;
  if (verifyLedgerRefs) {
    const ledger = openLedger(workspace);
    try {
      const events = ledger.getAllEvents().filter((row) => typeof row.payload_path === "string" && row.payload_path.length > 0);
      for (const event of events) {
        checkedRows += 1;
        const payloadPath = event.payload_path!;
        const full = join(workspace, payloadPath);
        if (!pathExists(full)) {
          const meta = (() => {
            try {
              return JSON.parse(event.meta_json) as Record<string, unknown>;
            } catch {
              return {};
            }
          })();
          const pruned = meta.payload_pruned === true || meta.payloadPruned === true || meta.payloadPrunedTs;
          if (!pruned) {
            errors.push(`missing blob file for event ${event.id}: ${payloadPath}`);
          }
          continue;
        }
        checkedBlobRefs += 1;
        const metadata = loadBlobMetadata(workspace, payloadPath);
        if (metadata.payloadSha256 !== event.payload_sha256) {
          errors.push(`payload sha mismatch for event ${event.id}`);
        }
        if (decrypt && metadata.encrypted) {
          const decrypted = loadBlobPlaintext(workspace, payloadPath);
          if (decrypted.payloadSha256 !== event.payload_sha256) {
            errors.push(`decrypted payload sha mismatch for event ${event.id}`);
          }
        }
      }
    } finally {
      ledger.close();
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    checkedBlobRefs,
    checkedRows
  };
}

