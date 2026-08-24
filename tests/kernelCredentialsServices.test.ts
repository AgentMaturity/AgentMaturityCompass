import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@amc/cordis";
import { credentialRef } from "../src/credentials/credentialRef.js";
import {
  credentialsServices,
  CREDENTIALS_SEAM,
  type CredentialsSeamService
} from "../src/kernel/services/credentialsServices.js";

/**
 * P3.0: the credentials seam on the composed tree.
 *
 * Same shape as the P2.1 evidence services test, and for the same reason: the
 * value of the wrap is that a consumer declaring `inject: ["amcCredentials"]`
 * stays PENDING when no provider is composed, rather than falling through to
 * `process.env` and behaving as though a credential source were configured.
 *
 * The extra concern here is disposal. This provider owns a file watcher, so a
 * fiber that unloaded without releasing it would leave a watch descriptor and a
 * publish path alive for the life of the process.
 */
const REF_NAME = "AMC_TEST_SEAM_KEY";
const REF = credentialRef(REF_NAME);
const FIXTURE = "seam-fixture-token";

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for the watcher to publish an external change");
}

const homes: string[] = [];

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop();
    if (home) rmSync(home, { recursive: true, force: true });
  }
});

function newHome(entries: Record<string, string>): string {
  const home = mkdtempSync(join(tmpdir(), "amc-cred-seam-"));
  homes.push(home);
  const file = join(home, ".credentials.yaml");
  writeFileSync(
    file,
    Object.entries(entries)
      .map(([name, value]) => `${name}: ${value}\n`)
      .join(""),
    { mode: 0o600 }
  );
  chmodSync(file, 0o600);
  chmodSync(home, 0o700);
  return home;
}

function serviceOn(ctx: Context): CredentialsSeamService {
  return (ctx as unknown as Record<string, CredentialsSeamService>)[CREDENTIALS_SEAM.name]!;
}

describe("credentials service on the composed tree", () => {
  it("gates a consumer until a credentials provider is composed", async () => {
    const ctx = new Context();
    const seen: string[] = [];
    ctx.plugin({
      name: "credentials-consumer",
      inject: [CREDENTIALS_SEAM.name],
      apply: () => {
        seen.push("applied");
      }
    });
    await settle();
    expect(seen, "a consumer must not run without a credential source").toEqual([]);

    const fiber = ctx.plugin(credentialsServices, {
      homeDir: newHome({}),
      env: {},
      watch: false
    });
    await fiber.await();
    await settle();
    expect(seen).toEqual(["applied"]);
  });

  it("resolves and describes through the seam without a second implementation", async () => {
    const ctx = new Context();
    const fiber = ctx.plugin(credentialsServices, {
      homeDir: newHome({ [REF_NAME]: FIXTURE }),
      env: {},
      watch: false
    });
    await fiber.await();
    await settle();

    const credentials = serviceOn(ctx);
    expect(credentials.describe(REF)).toEqual({ configured: true, source: "file", writable: true });
    expect(credentials.names().map(String)).toEqual([REF_NAME]);
    // The one method that returns a value is asserted only for presence: the
    // fixture is never compared, so a failure message cannot print it.
    expect(credentials.resolve(REF)).not.toBeNull();
  });

  it("re-resolves per call, so a write applies without re-registering the service", async () => {
    const ctx = new Context();
    const home = newHome({});
    const fiber = ctx.plugin(credentialsServices, { homeDir: home, env: {}, watch: false });
    await fiber.await();
    await settle();

    const credentials = serviceOn(ctx);
    expect(credentials.describe(REF).configured).toBe(false);
    await credentials.set(REF, FIXTURE);
    // No reload, no re-registration: a facade that cached its answers would
    // still be reporting "not configured" here.
    expect(credentials.describe(REF)).toEqual({ configured: true, source: "file", writable: true });
  });

  it("refuses a write the process environment shadows", async () => {
    const ctx = new Context();
    const fiber = ctx.plugin(credentialsServices, {
      homeDir: newHome({}),
      env: { [REF_NAME]: FIXTURE },
      watch: false
    });
    await fiber.await();
    await settle();

    const credentials = serviceOn(ctx);
    expect(credentials.describe(REF)).toEqual({ configured: true, source: "env", writable: false });
    await expect(credentials.set(REF, "replacement-fixture")).rejects.toMatchObject({
      code: "AMC_CREDENTIAL_SHADOWED_WRITE"
    });
  });

  it("never registers a store whose permissions it cannot trust", async () => {
    const home = newHome({ [REF_NAME]: FIXTURE });
    chmodSync(join(home, ".credentials.yaml"), 0o644);

    const ctx = new Context();
    const applied: string[] = [];
    ctx.plugin({
      name: "credentials-consumer",
      inject: [CREDENTIALS_SEAM.name],
      apply: () => {
        applied.push("applied");
      }
    });
    ctx.plugin(credentialsServices, { homeDir: home, env: {}, watch: false });
    await settle();

    // A provider that registered anyway would be indistinguishable, to every
    // consumer, from a correctly configured store on a machine with nothing set.
    expect((ctx as unknown as Record<string, unknown>)[CREDENTIALS_SEAM.name]).toBeFalsy();
    expect(applied, "a consumer must not run against an untrusted store").toEqual([]);
  });

  it("releases the file watcher when the fiber unloads", async () => {
    const ctx = new Context();
    const home = newHome({ [REF_NAME]: FIXTURE });
    const file = join(home, ".credentials.yaml");
    const causes: string[] = [];
    const fiber = ctx.plugin(credentialsServices, {
      homeDir: home,
      env: {},
      watch: true,
      debounceMs: 10,
      onUpdate: (update) => causes.push(update.cause)
    });
    await fiber.await();
    await settle();

    const credentials = serviceOn(ctx);
    expect(credentials.watching, "this test is vacuous unless a watch really attached").toBe(true);
    expect(existsSync(credentials.paths.file)).toBe(true);

    // Prove the watcher is live first. Without this, the silence asserted after
    // disposal would prove nothing — a watcher that never worked is silent too.
    writeFileSync(file, `${REF_NAME}: ${FIXTURE}\nAMC_TEST_SEAM_SECOND: another\n`, { mode: 0o600 });
    await waitFor(() => causes.includes("watch"));

    await fiber.dispose();
    await settle();
    expect(
      (ctx as unknown as Record<string, unknown>)[CREDENTIALS_SEAM.name],
      "amcCredentials outlived its fiber"
    ).toBeFalsy();

    const afterDispose = causes.length;
    writeFileSync(file, `${REF_NAME}: ${FIXTURE}\nAMC_TEST_SEAM_THIRD: third\n`, { mode: 0o600 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    // A watcher that outlived its fiber would keep parsing a file of secrets
    // and publishing into a service nobody can reach.
    expect(causes.length, "the watcher outlived its fiber").toBe(afterDispose);
  });
});
