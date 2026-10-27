import { expect, it } from "vitest";
import { validateRecord, verifyArtifact } from "../../packages/verifier/src/index.js";
import { scopedAttestationV2Schema } from "../../src/contracts/v2/scopedAttestation.js";
import { loadCase } from "./fixtures.js";
import { canonicalize } from "../../src/utils/json.js";
it.each(["configured", "provider-metadata", "provider-reported"] as const)("retains standalone parity for optional notary basis %s without changing signed body bytes", basis => {
  const fixture = loadCase("valid-attestation"); const original = JSON.parse(fixture.bytes.toString("utf8"));
  const profile = { ...original, signature: { ...original.signature, signer: { ...original.signature.signer, attestationBasis: basis } } };
  expect(scopedAttestationV2Schema.parse(profile).signature.signer.attestationBasis).toBe(basis);
  expect(validateRecord("scoped-attestation", profile)).toEqual({ ok: true });
  const verified = verifyArtifact(Buffer.from(canonicalize(profile)), fixture.options);
  expect(verified.integrity.status, JSON.stringify(verified.integrity)).toBe("pass");
  const invalid = { ...profile, signature: { ...profile.signature, signer: { ...profile.signature.signer, attestationBasis: "hardware-attested" } } };
  expect(scopedAttestationV2Schema.safeParse(invalid).success).toBe(false);
  expect(validateRecord("scoped-attestation", invalid).ok).toBe(false);
  expect(verifyArtifact(fixture.bytes, fixture.options).integrity.status).toBe("pass");
});
