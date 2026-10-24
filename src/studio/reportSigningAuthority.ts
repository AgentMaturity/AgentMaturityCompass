import { captureRunHashAuthority } from "../ledger/runHashSignature.js";

/** Actual raw-report/forecast continuation; original request identity and raw purpose survive the primary await. */
export function captureReportSigningAuthority(workspace: string, actor: () => void): () => void {
  actor();
  const current = captureRunHashAuthority(workspace, process.env.AMC_NO_SIGN === "1");
  return () => { actor(); current(); };
}
