import type { IncomingMessage, ServerResponse } from "node:http";
import { bodyJson, apiError, apiSuccess, isRequestBodyError } from "./apiHelpers.js";
import { checkDomainProof } from "../domainProof/domainProofCheck.js";
import {
  DomainProofApiRequestError,
  materializeDomainProofApiRequest,
} from "../domainProof/domainProofApiRequest.js";

const LEGACY_PATH_DEPRECATION =
  "Legacy fixture path strings are deprecated for the HTTP API; send inline manifest and input objects instead.";

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
      preferredInputMode: "inline_json",
      legacyFixturePaths: "deprecated",
      apiFileWrites: "disabled",
      nonClaim: "P0 proof checks use local toy fixtures only and are not real legal, clinical, tax, policy, or benefits determinations.",
    });
    return true;
  }

  if (pathname === "/api/v1/proof/check" && method === "POST") {
    try {
      const body = await bodyJson<unknown>(req);
      const materialized = materializeDomainProofApiRequest(workspace, body);
      const out = checkDomainProof({
        domain: materialized.domain,
        manifest: materialized.manifest,
        input: materialized.input,
      });
      apiSuccess(res, {
        ...out,
        requestMode: materialized.requestMode,
        ...(materialized.requestMode === "legacy_fixture_path"
          ? { deprecation: LEGACY_PATH_DEPRECATION }
          : {}),
      });
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
      } else if (err instanceof DomainProofApiRequestError) {
        apiError(res, 400, err.message);
      } else {
        apiError(res, 400, "Domain Proof request rejected invalid manifest or input data.");
      }
    }
    return true;
  }

  return false;
}
