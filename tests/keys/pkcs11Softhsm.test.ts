/**
 * The PKCS#11 provider against a real SoftHSM2 token (P2-08). Runs when AMC_TEST_PKCS11_MODULE names libsofthsm2.so
 * and pkcs11js is resolvable (the CI job pkcs11-softhsm installs both, and its step fails when no test ran). The token, its PINs and its keys are created
 * in a temporary directory for this run only; nothing is committed and nothing reaches the network.
 */
import { spawnSync } from "node:child_process";
import { randomBytes, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { CK, pkcs11Provider } from "../../src/keys/providers/pkcs11.js";

const MODULE = process.env.AMC_TEST_PKCS11_MODULE;
const CKM_EC_KEY_PAIR_GEN = 0x1040;
const CKM_EC_EDWARDS_KEY_PAIR_GEN = 0x1055;
const CKM_AES_KEY_GEN = 0x1080;
const CKA = { TOKEN: 0x1, PRIVATE: 0x2, VALUE_LEN: 0x161, SIGN: 0x108, VERIFY: 0x10a, ENCRYPT: 0x104, DECRYPT: 0x105 } as const;

// Without the module the suite registers no test, as the conformance suites do: the release gate's full suite allows no skips.
const enabled = MODULE !== undefined;
const cases = enabled ? [""] : [];

describe.runIf(enabled)("PKCS#11 provider on SoftHSM2 (P2-08)", () => {
  let dir = "";
  const pin = randomBytes(8).toString("hex");
  const env = { AMC_PKCS11_MODULE: MODULE, AMC_PKCS11_PIN: pin, AMC_PKCS11_PROTECTION: "software" } as NodeJS.ProcessEnv;
  let eddsa = false;

  beforeAll(() => {
    expect(existsSync(MODULE!), `AMC_TEST_PKCS11_MODULE ${MODULE} does not exist`).toBe(true);
    dir = mkdtempSync(join(tmpdir(), "amc-softhsm-"));
    mkdirSync(join(dir, "tokens"));
    writeFileSync(join(dir, "softhsm2.conf"), `directories.tokendir = ${join(dir, "tokens")}\nobjectstore.backend = file\nlog.level = ERROR\n`);
    process.env.SOFTHSM2_CONF = join(dir, "softhsm2.conf");
    const init = spawnSync("softhsm2-util", ["--init-token", "--free", "--label", "amc", "--pin", pin, "--so-pin", randomBytes(8).toString("hex")], { encoding: "utf8" });
    expect(init.status, init.stderr).toBe(0);
    // Keys generated on the token through pkcs11js itself, then the library is finalized for the provider to initialize.
    const pkcs11js = createRequire(import.meta.url)("pkcs11js") as { PKCS11: new () => Record<string, (...args: unknown[]) => unknown> };
    const lib = new pkcs11js.PKCS11();
    lib.load!(MODULE);
    lib.C_Initialize!();
    try {
      const slot = (lib.C_GetSlotList!(true) as Buffer[]).find(candidate => (lib.C_GetTokenInfo!(candidate) as { label: string }).label.trim() === "amc")!;
      eddsa = (lib.C_GetMechanismList!(slot) as number[]).includes(CK.CKM_EDDSA);
      const session = lib.C_OpenSession!(slot, CK.CKF_SERIAL_SESSION | CK.CKF_RW_SESSION);
      lib.C_Login!(session, CK.CKU_USER, pin);
      const pair = (label: string, params: Buffer, mechanism: number, extractable: boolean) => lib.C_GenerateKeyPair!(session, { mechanism },
        [{ type: CKA.TOKEN, value: true }, { type: CK.CKA_LABEL, value: label }, { type: CK.CKA_EC_PARAMS, value: params }, { type: CKA.VERIFY, value: true }],
        [{ type: CKA.TOKEN, value: true }, { type: CK.CKA_LABEL, value: label }, { type: CKA.PRIVATE, value: true }, { type: CKA.SIGN, value: true },
          { type: CK.CKA_SENSITIVE, value: !extractable }, { type: CK.CKA_EXTRACTABLE, value: extractable }]);
      pair("seal-ec", Buffer.from("06082a8648ce3d030107", "hex"), CKM_EC_KEY_PAIR_GEN, false);
      pair("extractable-ec", Buffer.from("06082a8648ce3d030107", "hex"), CKM_EC_KEY_PAIR_GEN, true);
      if (eddsa) pair("seal-ed", Buffer.from("130c656477617264733235353139", "hex"), CKM_EC_EDWARDS_KEY_PAIR_GEN, false);
      lib.C_GenerateKey!(session, { mechanism: CKM_AES_KEY_GEN }, [{ type: CK.CKA_CLASS, value: CK.CKO_SECRET_KEY }, { type: CKA.TOKEN, value: true },
        { type: CK.CKA_LABEL, value: "dek-wrap" }, { type: CKA.VALUE_LEN, value: 32 }, { type: CKA.ENCRYPT, value: true }, { type: CKA.DECRYPT, value: true },
        { type: CK.CKA_SENSITIVE, value: true }, { type: CK.CKA_EXTRACTABLE, value: false }]);
      lib.C_CloseSession!(session);
    } finally {
      lib.C_Finalize!();
    }
  });
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it.each(cases)("describes a non-extractable P-256 key and signs; Node verifies the P1363 signature%s", async () => {
    const provider = pkcs11Provider({ env });
    const ref = { provider: "pkcs11" as const, id: "pkcs11:token=amc;object=seal-ec" };
    const description = await provider.describe(ref);
    expect(description).toMatchObject({ algorithm: "ecdsa-p256-sha256", protection: "software", protectionBasis: "configured", exportable: false });
    expect(description.keyId).toBe(signingKeyId(description.publicKeyPem));
    const message = Buffer.from("amc softhsm");
    const signature = await provider.sign(ref, message);
    expect(verify("sha256", message, { key: description.publicKeyPem, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
  });

  it.for(cases)("signs with Ed25519 only when the token lists CKM_EDDSA%s", async (_case, context) => {
    // A SoftHSM2 build without EdDSA (--enable-eddsa) reports this case as skipped, never as passed.
    if (!eddsa) context.skip();
    const provider = pkcs11Provider({ env });
    const ref = { provider: "pkcs11" as const, id: "pkcs11:token=amc;object=seal-ed" };
    const description = await provider.describe(ref);
    expect(description.algorithm).toBe("ed25519");
    expect(verify(null, Buffer.from("m"), description.publicKeyPem, await provider.sign(ref, Buffer.from("m")))).toBe(true);
  });

  it.each(cases)("refuses an extractable key, and wraps a data key under a token AES key%s", async () => {
    const provider = pkcs11Provider({ env });
    await expect(provider.describe({ provider: "pkcs11", id: "pkcs11:token=amc;object=extractable-ec" })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    const ref = { provider: "pkcs11" as const, id: "pkcs11:token=amc;object=dek-wrap" };
    const dek = randomBytes(32);
    const wrapped = await provider.wrapKey!(ref, dek);
    expect(Buffer.from(await provider.unwrapKey!(ref, wrapped))).toEqual(dek);
  });
});
