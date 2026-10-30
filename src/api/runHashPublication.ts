import type { ServerResponse } from "node:http";
import type { RunHashPublicationOptions } from "../ledger/runHashSignature.js";
import { apiError } from "./apiHelpers.js";

/** Only a trusted server callback selects async HTTP publication; request fields never select a signer. */
export function runHashHttpOptions(res: ServerResponse, revalidateAuthority?: () => boolean): RunHashPublicationOptions {
  if (!revalidateAuthority) return { synchronousSeal: true };
  return { beforePublish() {
    if (revalidateAuthority()) return;
    if (!res.headersSent) apiError(res, 401, "authenticated authority changed while signing");
    throw new Error("authenticated authority changed while signing");
  } };
}
