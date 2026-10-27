import { generateKeyPairSync, sign } from "node:crypto";
import { expect, it } from "vitest";
import { pae, signDsse, verifyDsse } from "../src/attest/dsse.js";
import { lowS, signingKeyId } from "../src/keys/algorithmPolicy.js";

it.each(["ed25519", "ecdsa-p256-sha256"] as const)("checks %s DSSE using the key's canonical signature encoding", algorithm => {
  const pair = algorithm === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKeyPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString(); const keyid = signingKeyId(publicKeyPem)!;
  const payloadType = "application/vnd.in-toto+json"; const payload = Buffer.from("{\"synthetic\":true}");
  const envelope = signDsse(payloadType, payload, { publicKeyPem, keyid, sign: bytes => algorithm === "ed25519"
    ? sign(null, bytes, pair.privateKey) : lowS(sign("sha256", bytes, { key: pair.privateKey, dsaEncoding: "ieee-p1363" })) });
  const keys = new Map([[keyid, publicKeyPem]]);
  expect(verifyDsse(envelope, payloadType, keys)).toMatchObject({ ok: true, keyid, payload });
  expect(verifyDsse(envelope, "another-type", keys).ok).toBe(false);
  expect(verifyDsse(envelope, payloadType, new Map()).ok).toBe(false);
  if (algorithm === "ecdsa-p256-sha256") {
    const bytes = pae(payloadType, payload);
    const der = sign("sha256", bytes, { key: pair.privateKey, dsaEncoding: "der" });
    const good = Buffer.from(envelope.signatures[0]!.sig, "base64");
    const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
    const high = Buffer.concat([good.subarray(0, 32), Buffer.from((order - BigInt(`0x${good.subarray(32).toString("hex")}`)).toString(16).padStart(64, "0"), "hex")]);
    for (const sig of [der, high]) expect(verifyDsse({ ...envelope, signatures: [{ keyid, sig: sig.toString("base64") }] }, payloadType, keys).ok).toBe(false);
  }
});
