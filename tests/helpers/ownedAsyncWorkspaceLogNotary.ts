import { createServer } from "node:http";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import YAML from "yaml";
import { loadNotarySignerAsync, notarySignResponse } from "../../src/notary/notarySigner.js";
import { signNotaryAttestationAsync } from "../../src/notary/notaryAttestation.js";
import { verifyNotaryRequestAuth } from "../../src/notary/notaryAuth.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { enableNotaryTrust, loadTrustConfig, resolveNotaryAuthSecret, trustConfigPath, trustConfigSigPath,
  trustConfigSchema, verifyTrustConfigSignature } from "../../src/trust/trustConfig.js";
import { withPins } from "../../src/trust/trustContext.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { writeFileAtomic } from "../../src/utils/fs.js";
import { AWS_ARN, awsFake, fakeKey } from "../keys/providerFakes.js";
import { workspaceKeyTrust } from "./trustContext.js";

/** Real native transport + real owned P256 provider, shared by two actual archive producer families. */
export async function ownedAsyncWorkspaceLogNotary(workspace: string, root: string) {
  const id = AWS_ARN("owned-archive-log"), fake = awsFake({ [id]: fakeKey("p256") });
  const signer = await loadNotarySignerAsync({ notaryDir: join(root, "notary"), backend: { type: "KEY_PROVIDER", ref: { provider: "aws-kms", id } }, provider: awsKmsProvider(fake.call) });
  const pin = join(root, "owned-log-notary.pub"); writeFileSync(pin, signer.pubkeyPem());
  const requests: Array<{ kind: string; payload: Buffer }> = [], dispatches: Promise<void>[] = [];
  let beforeReply: ((kind: string) => void | Promise<void>) | undefined;
  const server = createServer((req, res) => {
    const work = (async () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "GET" && req.url === "/readyz") { res.end(JSON.stringify({ ok: true })); return; }
      if (req.method === "GET" && req.url === "/pubkey") { res.end(JSON.stringify({ pubkeyPem: signer.pubkeyPem(), fingerprint: signer.pubkeyFingerprint() })); return; }
      if (req.method === "GET" && req.url === "/attest/current") { res.end(JSON.stringify(await signNotaryAttestationAsync({ signer }))); return; }
      if (req.method !== "POST" || req.url !== "/sign") { res.writeHead(404); res.end(); return; }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks);
      const config = loadTrustConfig(workspace), auth = verifyNotaryRequestAuth({ req, bodyBytes: body,
        secret: resolveNotaryAuthSecret(workspace, config.trust.notary.auth.secretRef), headerName: config.trust.notary.auth.headerName,
        tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30, path: "/sign" });
      if (!auth.ok) { res.writeHead(401); res.end(); return; }
      const parsed = JSON.parse(body.toString("utf8")), payload = Buffer.from(parsed.payloadB64, "base64");
      requests.push({ kind: parsed.kind, payload });
      const signed = await signer.sign(parsed.kind, payload); await beforeReply?.(parsed.kind);
      res.end(JSON.stringify(notarySignResponse(parsed.kind, sha256Hex(payload), signed)));
    })();
    dispatches.push(work); void work.catch(error => res.destroy(error instanceof Error ? error : undefined));
  });
  await new Promise<void>((done, reject) => { server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); done(); }); });
  const close = async () => { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); await Promise.all(dispatches); };
  try {
    const address = server.address(); if (!address || typeof address === "string") throw new Error("owned archive log notary did not bind");
    await enableNotaryTrust({ workspace, baseUrl: `http://127.0.0.1:${address.port}`, pinPubkeyPath: pin, requiredAttestationLevel: "HARDWARE" });
    const config = trustConfigSchema.parse(loadTrustConfig(workspace));
    config.trust.enforcement.requireNotaryFor = ["TRANSPARENCY_ROOT", "MERKLE_ROOT"];
    config.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false;
    const bytes = Buffer.from(YAML.stringify(config)), signed = signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
    writeFileAtomic(trustConfigPath(workspace), bytes, 0o644);
    writeFileAtomic(trustConfigSigPath(workspace), JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
      signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2), 0o644);
    if (!verifyTrustConfigSignature(workspace).valid) throw new Error("owned archive log policy did not verify");
    return { requests, publicKeyPem: signer.pubkeyPem(), keyId: signer.pubkeyFingerprint(), close,
      trust: withPins(workspaceKeyTrust(workspace), [{ keyId: signer.pubkeyFingerprint(), purposes: ["artifact-seal"], origin: "independent owned archive-log operator" }]),
      setBeforeReply(value: typeof beforeReply) { beforeReply = value; } };
  } catch (error) { await close(); throw error; }
}
