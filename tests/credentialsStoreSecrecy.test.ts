import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { credentialRef } from "../src/credentials/credentialRef.js";
import {
  CredentialsFileParseError,
  CredentialsFilePermissionsError
} from "../src/credentials/credentialsStoreErrors.js";
import { ShadowedWriteError } from "../src/credentials/credentialsErrors.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";

/**
 * P3.0 stage 2 — the rules that exist so a secret cannot escape.
 *
 * Every test here is written to go red when its rule is deleted, because the
 * failure mode of a credentials store is silent: a store that leaks, or that
 * accepts a write nobody will ever read, passes every happy-path test there is.
 * So the assertions are on the things that must NOT happen — the secret absent
 * from a message, the write refused, the file rejected — and each is paired
 * with the observation that makes the check load-bearing rather than incidental.
 */

/**
 * A value shaped like a real key and unique enough that finding it anywhere is
 * unambiguous. Asserted only by absence; nothing here asserts it is returned.
 */
const SECRET = "sk-amc-test-0000-DO-NOT-LEAK-9f3a71c4";

/** A second, distinguishable secret for the layer that must not answer. */
const OTHER_SECRET = "sk-amc-test-1111-DO-NOT-LEAK-4b8e02da";

function haystack(error: unknown): string {
  const value = error as { message?: unknown; stack?: unknown };
  return [
    String(value?.message ?? ""),
    String(value?.stack ?? ""),
    JSON.stringify(error, Object.getOwnPropertyNames(Object(error)))
  ].join("\n");
}

describe("credentials store — a secret never leaves through an error, a description or a refusal", () => {
  let home: string;
  let file: string;

  beforeEach(() => {
    // mkdtemp creates at 0700, which is the mode the store demands.
    home = mkdtempSync(join(tmpdir(), "amc-credentials-"));
    file = join(home, ".credentials.yaml");
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function open(env: NodeJS.ProcessEnv = {}): LocalCredentialsService {
    return new LocalCredentialsService({
      path: file,
      env,
      watch: false,
      // Point both `.env` layers at paths inside the throwaway home so the
      // developer's real ~/.env can never make a test pass or fail.
      projectDir: join(home, "project"),
      userEnvPath: join(home, "user.env")
    });
  }

  describe("a world-readable store is refused, and the error names the fix", () => {
    it("refuses a group- or world-readable file and prints the exact chmod", () => {
      writeFileSync(file, `API_KEY: "${SECRET}"\n`, { mode: 0o600 });
      chmodSync(file, 0o644);

      let caught: unknown = null;
      try {
        open();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(CredentialsFilePermissionsError);
      const failure = caught as CredentialsFilePermissionsError;
      expect(failure.kind).toBe("file");
      expect(failure.mode).toBe(0o644);
      // The actionable half: an operator must be able to copy a command, not
      // infer one. `chmod 600 <path>` verbatim.
      expect(failure.fixCommand).toBe(`chmod 600 ${file}`);
      expect(failure.message).toContain(`chmod 600 ${file}`);
      // Refusing must not itself disclose what it was protecting.
      expect(haystack(failure)).not.toContain(SECRET);
    });

    it("refuses a group-readable directory and names the directory chmod", () => {
      writeFileSync(file, `API_KEY: "${SECRET}"\n`, { mode: 0o600 });
      chmodSync(home, 0o750);

      let caught: unknown = null;
      try {
        open();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(CredentialsFilePermissionsError);
      const failure = caught as CredentialsFilePermissionsError;
      expect(failure.kind).toBe("directory");
      expect(failure.fixCommand).toBe(`chmod 700 ${home}`);

      // Restore so the temp directory can be removed.
      chmodSync(home, 0o700);
    });

    it("re-asserts permissions on every reload, not only at boot", () => {
      writeFileSync(file, `API_KEY: "${SECRET}"\n`, { mode: 0o600 });
      const service = open();
      expect(service.resolve(credentialRef("API_KEY"))).toBe(SECRET);

      // The realistic case: a file that was private at boot and stopped being
      // private an hour later. A boot-only check calls this store safe forever.
      chmodSync(file, 0o604);
      expect(() => service.reload()).toThrow(CredentialsFilePermissionsError);
    });

    it("refuses to WRITE into a file that went world-readable since boot", async () => {
      writeFileSync(file, `API_KEY: "${SECRET}"\n`, { mode: 0o600 });
      const service = open();
      chmodSync(file, 0o644);

      await expect(service.set(credentialRef("OTHER_KEY"), OTHER_SECRET)).rejects.toBeInstanceOf(
        CredentialsFilePermissionsError
      );
      await service.close();
    });
  });

  describe("a parse error quotes a position, never the line", () => {
    /**
     * The hazard is not hypothetical, and this test proves it before proving
     * the defence: the YAML library's own error message embeds a source frame,
     * so any implementation that surfaces `error.message` — the obvious thing
     * to do — prints the credential. The assertion below on the library is what
     * makes the assertion on our error meaningful.
     */
    it("does not carry the secret-bearing line that the parser itself would print", () => {
      // A realistic break: an unquoted value that happens to contain `: `,
      // which YAML reads as a nested mapping. The parser's caret lands on the
      // secret's own line, which is exactly the case that must not be printed.
      const source = `GOOD_KEY: ok\nBROKEN_KEY: ${SECRET}: trailing\n`;
      writeFileSync(file, source, { mode: 0o600 });

      const libraryMessage = YAML.parseDocument(source, { uniqueKeys: true }).errors
        .map((error) => error.message)
        .join("\n");
      expect(libraryMessage).toContain(SECRET);

      let caught: unknown = null;
      try {
        open();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(CredentialsFileParseError);
      const failure = caught as CredentialsFileParseError;
      expect(haystack(failure)).not.toContain(SECRET);
      // Position and code, so the operator can still find and fix it.
      expect(failure.position).not.toBeNull();
      expect(failure.message).toMatch(/line \d+, column \d+/);
      expect(failure.detail).toBe("BLOCK_AS_IMPLICIT_KEY");
    });

    it("does not carry the line for a duplicate reference either", () => {
      const source = `API_KEY: "${SECRET}"\nAPI_KEY: "${OTHER_SECRET}"\n`;
      writeFileSync(file, source, { mode: 0o600 });

      const libraryMessage = YAML.parseDocument(source, { uniqueKeys: true }).errors
        .map((error) => error.message)
        .join("\n");
      expect(libraryMessage).toContain(SECRET);

      let caught: unknown = null;
      try {
        open();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(CredentialsFileParseError);
      expect(haystack(caught)).not.toContain(SECRET);
      expect(haystack(caught)).not.toContain(OTHER_SECRET);
      expect((caught as CredentialsFileParseError).detail).toBe("DUPLICATE_KEY");
    });

    it("withholds a key that is not a reference, because it is probably a value", () => {
      // The realistic mistake: pasting the secret into the key position.
      writeFileSync(file, `"${SECRET}": something\n`, { mode: 0o600 });

      let caught: unknown = null;
      try {
        open();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(CredentialsFileParseError);
      expect((caught as CredentialsFileParseError).reason).toBe("key-not-a-reference");
      expect(haystack(caught)).not.toContain(SECRET);
      // Named only by position, so it is still findable.
      expect((caught as CredentialsFileParseError).position).toEqual({ line: 1, column: 1 });
    });
  });

  describe("describe() reports about a credential, never a credential", () => {
    it("returns exactly three non-value fields, whatever layer answers", () => {
      writeFileSync(file, `API_KEY: "${SECRET}"\n`, { mode: 0o600 });
      const service = open();
      const description = service.describe(credentialRef("API_KEY"));

      // The seal: any added field — `value`, `preview`, `hint` — turns this red
      // (and turns `npm run typecheck` red, via the ExactKeys assertion in
      // credentialSources.ts). Two independent guards for one rule.
      expect(Object.keys(description).sort()).toEqual(["configured", "source", "writable"]);
      expect(description).toEqual({ configured: true, source: "file", writable: true });
      expect(JSON.stringify(description)).not.toContain(SECRET);
    });

    it("reports an env-supplied credential as source env and NOT writable", () => {
      writeFileSync(file, `API_KEY: "${OTHER_SECRET}"\n`, { mode: 0o600 });
      const service = open({ API_KEY: SECRET });

      expect(service.describe(credentialRef("API_KEY"))).toEqual({
        configured: true,
        source: "env",
        writable: false
      });
      // The file layer is present but does not answer; nothing about either
      // value appears in the description.
      expect(JSON.stringify(service.describe(credentialRef("API_KEY")))).not.toContain(SECRET);
    });

    it("reports an unconfigured reference as unconfigured and writable", () => {
      const service = open();
      expect(service.describe(credentialRef("NEVER_SET"))).toEqual({
        configured: false,
        source: null,
        writable: true
      });
    });
  });

  describe("a write the environment would shadow is refused, loudly", () => {
    it("refuses at the door when the environment already answers", async () => {
      const service = open({ API_KEY: SECRET });

      await expect(service.set(credentialRef("API_KEY"), OTHER_SECRET)).rejects.toBeInstanceOf(
        ShadowedWriteError
      );
      // The refusal names the reference and the fix, never a value.
      await service.set(credentialRef("OTHER_KEY"), OTHER_SECRET).catch(() => undefined);
      const failure = await service
        .set(credentialRef("API_KEY"), OTHER_SECRET)
        .then(() => null)
        .catch((error: unknown) => error as ShadowedWriteError);
      expect(failure?.shadowingSource).toBe("env");
      expect(failure?.message).toContain("unset API_KEY");
      expect(haystack(failure)).not.toContain(SECRET);
      expect(haystack(failure)).not.toContain(OTHER_SECRET);
      await service.close();
    });

    it("refuses when the environment changes AFTER the write is queued", async () => {
      const env: NodeJS.ProcessEnv = {};
      const service = open(env);

      // The door check passes here: nothing shadows API_KEY yet. `set` runs
      // synchronously up to its first await, so the write is now queued and has
      // not run.
      const queued = service.set(credentialRef("API_KEY"), OTHER_SECRET);
      // The environment changes while the write waits its turn — a supervisor
      // exporting a rotated key, an operator's shell. A store that only checked
      // at the door would store a value no resolve would ever return.
      env["API_KEY"] = SECRET;

      await expect(queued).rejects.toBeInstanceOf(ShadowedWriteError);
      // And nothing was written: the refusal is real, not cosmetic.
      expect(service.describe(credentialRef("API_KEY")).source).toBe("env");
      delete env["API_KEY"];
      service.reload();
      expect(service.describe(credentialRef("API_KEY"))).toEqual({
        configured: false,
        source: null,
        writable: true
      });
      await service.close();
    });

    it("refuses to unset a reference the environment supplies", async () => {
      writeFileSync(file, `API_KEY: "${OTHER_SECRET}"\n`, { mode: 0o600 });
      const service = open({ API_KEY: SECRET });

      await expect(service.unset(credentialRef("API_KEY"))).rejects.toBeInstanceOf(
        ShadowedWriteError
      );
      // Clearing the writable layer would have reported a rotation that did not
      // happen: the environment would keep answering with the old key.
      expect(statSync(file).size).toBeGreaterThan(0);
      await service.close();
    });
  });
});
