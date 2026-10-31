import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIndustryPackLicenseKey } from "../../src/domains/industryPackEntitlement.js";
import { operatorTrustHome } from "./trustContext.js";

export interface TestIndustryPackLicence {
  /** An AMC home whose signed trust list pins the licence key for artifact-seal (or pins nothing, with `pinned: false`). */
  amcHome: string;
  licenseKey: string;
  publicKeyPem: string;
  privateKeyPem: string;
  /** AMC_HOME plus the licence, for a subprocess or vi.stubEnv. */
  env: { AMC_HOME: string; AMC_INDUSTRY_PACKS_LICENSE_KEY: string };
  cleanup(): void;
}

/**
 * An Industry Packs licence whose signing key the operator pinned in a signed trust list (P1-51): the only key a
 * licence gate accepts. The key pair is generated here, in memory, and the AMC home is a temp directory.
 */
export function testIndustryPackLicence(opts: { expiresAt?: string | null; pinned?: boolean } = {}): TestIndustryPackLicence {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const amcHome = opts.pinned === false
    ? mkdtempSync(join(tmpdir(), "amc-unpinned-home-"))
    : operatorTrustHome([{ publicKeyPem, purposes: ["artifact-seal"] }]);
  const licenseKey = createIndustryPackLicenseKey({
    customerId: "cus_test",
    subscriptionId: "sub_test",
    expiresAt: opts.expiresAt === undefined ? "2099-01-01T00:00:00.000Z" : opts.expiresAt,
    env: { AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY: privateKeyPem } as NodeJS.ProcessEnv
  });
  return {
    amcHome, licenseKey, publicKeyPem, privateKeyPem,
    env: { AMC_HOME: amcHome, AMC_INDUSTRY_PACKS_LICENSE_KEY: licenseKey },
    cleanup: () => rmSync(amcHome, { recursive: true, force: true })
  };
}
