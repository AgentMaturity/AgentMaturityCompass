/**
 * The workload trust config (P2-25): `.amc/workload-trust.yaml`, signed by the auditor key like every other policy file.
 * It pins what AMC trusts (SPIFFE trust bundles, OIDC agent-token issuers, declared service principals) and which
 * verified workload subject may act as which AMC agent id. It is configuration, not a directory: nothing in AMC creates,
 * updates or deletes identities, and the operator's identity system (SPIRE, Entra, AgentCore) stays the source of truth.
 */
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { prepareFileSignatureWithAuditor } from "../../org/orgSigner.js";
import { verifyAuditorSignatureBytes } from "../../org/orgSignatureBytes.js";
import { readContainedOrNull } from "../../utils/containedFs.js";
import { ensureDir, writeFileAtomic } from "../../utils/fs.js";

const WORKLOAD_TRUST_FILE = ".amc/workload-trust.yaml";
const MAX_BYTES = 1_048_576;
const jwk = z.record(z.string(), z.unknown());
const https = z.string().url().startsWith("https://");

export const workloadTrustConfigSchema = z.strictObject({
  v: z.literal(1),
  spiffe: z.strictObject({
    trustDomains: z.array(z.strictObject({
      trustDomain: z.string().regex(/^[a-z0-9._-]+$/),
      /** PEM X.509 authorities from the trust domain's bundle (X509-SVID verification). */
      x509Authorities: z.array(z.string().includes("BEGIN CERTIFICATE")).default([]),
      /** JWKs from the trust domain's bundle (JWT-SVID verification). */
      jwtAuthorities: z.array(jwk).default([]),
      /** The audience a JWT-SVID presented to AMC must carry. */
      audience: z.string().min(1)
    })).default([])
  }).default({ trustDomains: [] }),
  oidcAgentIssuers: z.array(z.strictObject({
    issuer: https,
    audience: z.string().min(1),
    /** Labels the vendor profile for docs and evidence only; verification is the same for every profile. */
    profile: z.enum(["entra-agent-id", "agentcore", "generic"]).default("generic"),
    jwks: z.array(jwk).min(1).optional(),
    jwksUri: https.optional()
  }).refine((entry) => (entry.jwks === undefined) !== (entry.jwksUri === undefined), "pin exactly one of jwks or jwksUri")).default([]),
  /** Service principals a delegation chain may start from (P2-25 delegation roots). */
  services: z.array(z.string().min(1)).default([]),
  /** Which verified workload subject may act as which agent id. A subject not listed here verifies as nobody. */
  bindings: z.array(z.strictObject({
    agentId: z.string().min(1),
    spiffeIds: z.array(z.string().startsWith("spiffe://")).default([]),
    oidcSubjects: z.array(z.strictObject({ issuer: https, subject: z.string().min(1) })).default([])
  })).default([])
});
export type WorkloadTrustConfig = z.infer<typeof workloadTrustConfigSchema>;

/**
 * The verified config, or null when the workspace has none. A config that is present but unsigned, tampered or invalid
 * throws: callers refuse every credential then, and never fall back to "no config" (which would also refuse, but for a
 * reason that hides the tampering).
 */
export function loadWorkloadTrustConfig(workspace: string): WorkloadTrustConfig | null {
  const body = readContainedOrNull(workspace, WORKLOAD_TRUST_FILE, MAX_BYTES);
  if (body === null) return null;
  const sidecar = readContainedOrNull(workspace, `${WORKLOAD_TRUST_FILE}.sig`, MAX_BYTES);
  if (sidecar === null) throw new Error("workload trust config is not signed");
  const verified = verifyAuditorSignatureBytes(workspace, "BUNDLE", body, sidecar);
  if (!verified.valid) throw new Error(`workload trust config signature does not verify (${verified.reason ?? "unknown"})`);
  return workloadTrustConfigSchema.parse(YAML.parse(body.toString("utf8")));
}

/** Write and sign the config through the auditor's P2-08 provider path; nothing is written before the signature exists. */
export async function publishWorkloadTrustConfig(workspace: string, config: WorkloadTrustConfig): Promise<{ readonly path: string }> {
  const bytes = Buffer.from(YAML.stringify(workloadTrustConfigSchema.parse(config)), "utf8");
  const path = join(workspace, WORKLOAD_TRUST_FILE);
  const prepared = await prepareFileSignatureWithAuditor(workspace, path, bytes, "BUNDLE");
  prepared.assertCurrent();
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(path, bytes, 0o644);
  writeFileAtomic(`${path}.sig`, prepared.signatureBytes, 0o644);
  return { path };
}
