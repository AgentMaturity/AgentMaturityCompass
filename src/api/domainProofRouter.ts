import type { IncomingMessage, ServerResponse } from "node:http";
import { bodyJson, apiError, apiSuccess } from "./apiHelpers.js";

export async function handleDomainProofRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith("/api/v1/proof")) return false;

  if (pathname === "/api/v1/proof/status" && method === "GET") {
    apiSuccess(res, {
      status: "available",
      lane: "Domain Proof Lane",
      surfaces: ["Enforce", "Comply", "Score", "Vault", "Watch"],
      supportedDomains: ["governance"],
      proofClasses: ["evidence_integrity", "runtime_policy", "domain_correctness"],
      correctnessProofStatuses: ["proven", "disproven", "unsupported", "not_applicable"],
      nonClaim: "P0 proof checks use local toy fixtures only and are not real legal, clinical, tax, policy, or benefits determinations.",
    });
    return true;
  }

  if (pathname === "/api/v1/proof/check" && method === "POST") {
    try {
      const body = await bodyJson<{ domain: string; manifest: string; input: string; outFile?: string }>(req);
      if (!body.domain || !body.manifest || !body.input) {
        apiError(res, 400, "domain, manifest, and input are required");
        return true;
      }
      const { domainProofCheckCli } = await import("../domainProof/domainProofCli.js");
      const out = domainProofCheckCli({
        workspace,
        domain: body.domain,
        manifest: body.manifest,
        input: body.input,
        outFile: body.outFile,
      });
      apiSuccess(res, out);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : "Domain proof check failed");
    }
    return true;
  }

  return false;
}
