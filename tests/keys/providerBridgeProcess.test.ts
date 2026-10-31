/** P2-08: real owned child-process failures cannot authenticate a provider response. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { callProviderSync } from "../../src/keys/providerBridge.js";
import { KeyProviderError, type KeyDescription, type KeyRef } from "../../src/keys/provider.js";
import { fakeKey, publicPem } from "./providerFakes.js";

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const ref: KeyRef = { provider: "aws-kms", id: "arn:aws:kms:eu-west-1:111122223333:key/synthetic" };
const pem = publicPem(fakeKey("ed25519"));
const description: KeyDescription = { ref, algorithm: "ed25519", publicKeyPem: pem, keyId: signingKeyId(pem)!, protection: "hsm", protectionBasis: "provider-metadata", exportable: false };
const secret = "PIN=642807 /private/token/module.so https://private-kms.example account-998877";

function child(mode: "success" | "exit-one" | "signal" | "timeout") {
  const dir = mkdtempSync(join(tmpdir(), "amc-bridge-process-"));
  dirs.push(dir);
  const script = join(dir, "owned-bridge.mjs");
  const marker = join(dir, "answer-emitted.txt");
  const reply = JSON.stringify({ ok: true, description }) + "\n";
  const ending = mode === "success" ? "process.exit(0);"
    : mode === "exit-one" ? "process.exit(1);"
    : mode === "signal" ? 'process.kill(process.pid, "SIGTERM");'
    : "setInterval(() => {}, 1000);";
  writeFileSync(script, 'import { writeSync, writeFileSync } from "node:fs";\n'
    + `writeSync(2, ${JSON.stringify(secret)});\n`
    + `writeSync(1, ${JSON.stringify(reply)});\n`
    + `writeFileSync(${JSON.stringify(marker)}, "answer emitted");\n`
    + ending + "\n");
  return { script, marker };
}

describe("provider bridge requires a successfully completed child", () => {
  it("accepts a complete success reply from an owned exit-zero child", () => {
    const { script, marker } = child("success");
    expect(callProviderSync({ op: "describe", ref }, { script })).toEqual({ ok: true, description });
    expect(readFileSync(marker, "utf8")).toBe("answer emitted");
  });

  it.each(["exit-one", "signal", "timeout"] as const)("refuses success JSON emitted before %s", mode => {
    const { script, marker } = child(mode);
    const error: unknown = (() => {
      try { callProviderSync({ op: "describe", ref }, { script, timeoutMs: mode === "timeout" ? 2000 : 5000 }); }
      catch (failure) { return failure; }
      return null;
    })();
    // This proves the child emitted the plausible success before its non-success completion.
    expect(readFileSync(marker, "utf8")).toBe("answer emitted");
    expect(error).toBeInstanceOf(KeyProviderError);
    expect(error).toMatchObject({
      code: "KEY_PROVIDER_UNAVAILABLE", status: 503,
      message: "KEY_PROVIDER_UNAVAILABLE: aws-kms: describe: the provider bridge did not complete successfully"
    });
    expect(String(error)).not.toMatch(/642807|private-kms|account-998877|module\.so/);
  }, 10000);
});
