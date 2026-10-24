import { captureRunHashAuthority } from "../ledger/runHashSignature.js";

/** Actual raw-report/forecast continuation; original request identity and raw purpose survive the primary await. */
export function captureReportSigningAuthority(workspace: string, actor: () => void): () => void {
  const unsigned = process.env.AMC_NO_SIGN === "1";
  const sameMode = () => { if ((process.env.AMC_NO_SIGN === "1") !== unsigned) throw new Error("original report signing mode changed while preparing publication"); };
  const originalActor = () => { sameMode(); actor(); sameMode(); };
  originalActor();
  const current = captureRunHashAuthority(workspace, unsigned);
  return () => { originalActor(); current(); };
}
