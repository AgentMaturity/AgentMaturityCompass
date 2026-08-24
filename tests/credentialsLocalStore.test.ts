import { randomUUID } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { EmptyCredentialValueError, ShadowedWriteError } from "../src/credentials/credentialsErrors.js";
import { CredentialsFileParseError } from "../src/credentials/credentialsStoreErrors.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { ControlFileLockError } from "../src/lifecycle/controlFileLock.js";

/**
 * P3.0 stage 2 — the layered store's mechanics.
 *
 * The secrecy rules live in credentialsStoreSecrecy.test.ts. This file covers
 * the behaviours that make the seam's promises true rather than merely stated:
 * precedence, restart-free rotation, and a write path that does not lose,
 * corrupt, or half-apply the file it edits.
 */

const KEY = credentialRef("AMC_TEST_API_KEY");
const NAME = "AMC_TEST_API_KEY";
const OTHER = credentialRef("AMC_TEST_OTHER_KEY");

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for the store to observe an external change");
}

describe("credentials store — precedence, rotation and the write path", () => {
  let home: string;
  let file: string;
  let projectDir: string;
  let userEnvFile: string;
  let open: (env?: NodeJS.ProcessEnv, overrides?: { watch?: boolean; lockTimeoutMs?: number }) => LocalCredentialsService;
  let opened: LocalCredentialsService[];

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "amc-credentials-"));
    file = join(home, ".credentials.yaml");
    projectDir = join(home, "project");
    userEnvFile = join(home, "user.env");
    mkdirSync(projectDir, { recursive: true });
    opened = [];
    open = (env = {}, overrides = {}) => {
      const service = new LocalCredentialsService({
        path: file,
        env,
        watch: overrides.watch ?? false,
        debounceMs: 10,
        lockTimeoutMs: overrides.lockTimeoutMs,
        projectDir,
        userEnvPath: userEnvFile
      });
      opened.push(service);
      return service;
    };
  });

  afterEach(async () => {
    for (const service of opened) await service.close();
    rmSync(home, { recursive: true, force: true });
  });

  describe("precedence — the inherited environment wins and is read-only", () => {
    it("ranks env over file over project .env over user .env", () => {
      writeFileSync(file, `${NAME}: "from-file"\n`, { mode: 0o600 });
      writeFileSync(join(projectDir, ".env"), `${NAME}=from-project\n`, { mode: 0o600 });
      writeFileSync(userEnvFile, `${NAME}=from-user\n`, { mode: 0o600 });

      expect(open({ [NAME]: "from-env" }).resolve(KEY)).toBe("from-env");
      expect(open({}).resolve(KEY)).toBe("from-file");

      rmSync(file);
      expect(open({}).resolve(KEY)).toBe("from-project");

      rmSync(join(projectDir, ".env"));
      expect(open({}).resolve(KEY)).toBe("from-user");

      rmSync(userEnvFile);
      expect(open({}).resolve(KEY)).toBeNull();
    });

    it("treats a blank layer as absent rather than as a shadow", () => {
      writeFileSync(file, `${NAME}: "from-file"\n`, { mode: 0o600 });
      // `export AMC_TEST_API_KEY=` in a shell profile is the case that matters:
      // the variable exists, so a presence test on `in env` would let it
      // outrank a perfectly good stored key and block writes to it forever.
      const service = open({ [NAME]: "   " });
      expect(service.resolve(KEY)).toBe("from-file");
      expect(service.describe(KEY)).toEqual({ configured: true, source: "file", writable: true });
    });

    it("reads the .env shapes operators actually write", () => {
      writeFileSync(
        join(projectDir, ".env"),
        [
          "# a comment line",
          "",
          `export ${NAME}=exported-value`,
          'AMC_TEST_OTHER_KEY="quoted value" ',
          "AMC_TEST_THIRD_KEY=plain # trailing note",
          "AMC_TEST_BLANK_KEY=",
          "not a valid line at all",
          "9_STARTS_WITH_DIGIT=ignored"
        ].join("\n"),
        { mode: 0o600 }
      );
      const service = open();
      expect(service.resolve(KEY)).toBe("exported-value");
      expect(service.resolve(OTHER)).toBe("quoted value");
      expect(service.resolve(credentialRef("AMC_TEST_THIRD_KEY"))).toBe("plain");
      // Blank is absent, exactly as it is in every other layer.
      expect(service.resolve(credentialRef("AMC_TEST_BLANK_KEY"))).toBeNull();
      // A `.env` is a foreign file: lines AMC cannot read are skipped, never
      // fatal. Refusing to start because some other tool's syntax is in there
      // would make AMC's credential layer a liability to the whole repo.
      expect(service.describe(credentialRef("AMC_TEST_THIRD_KEY")).source).toBe("project-env");
    });

    it("treats an empty stored value as no entry at all", () => {
      writeFileSync(file, `${NAME}: ""\nAMC_TEST_OTHER_KEY:\n`, { mode: 0o600 });
      const service = open();
      expect(service.resolve(KEY)).toBeNull();
      expect(service.resolve(OTHER)).toBeNull();
      expect(service.describe(KEY).configured).toBe(false);
    });

    it("refuses to store an empty value instead of creating an unreadable entry", async () => {
      const service = open();
      await expect(service.set(KEY, "   ")).rejects.toBeInstanceOf(EmptyCredentialValueError);
      expect(service.resolve(KEY)).toBeNull();
    });
  });

  describe("rotation without a restart", () => {
    it("picks up an external edit through the watcher, with no reopen", async () => {
      writeFileSync(file, `${NAME}: "old-key"\n`, { mode: 0o600 });
      const service = open({}, { watch: true });
      expect(service.watching).toBe(true);
      expect(service.resolve(KEY)).toBe("old-key");

      // Someone else rotates the key: `vi ~/.config/amc/.credentials.yaml`, a
      // config-management run, a second AMC process. The service object is
      // never touched.
      writeFileSync(file, `${NAME}: "new-key"\n`, { mode: 0o600 });

      await waitFor(() => service.resolve(KEY) === "new-key");
      expect(service.resolve(KEY)).toBe("new-key");
    });

    it("sees a rotated environment variable on the very next resolve", () => {
      const env: NodeJS.ProcessEnv = { [NAME]: "old-key" };
      const service = open(env);
      expect(service.resolve(KEY)).toBe("old-key");
      // Held by reference, not copied: a supervisor that rewrites the
      // environment mid-process does not need a reload, let alone a restart.
      env[NAME] = "new-key";
      expect(service.resolve(KEY)).toBe("new-key");
    });

    it("applies its own write to the very next resolve", async () => {
      const service = open();
      expect(service.resolve(KEY)).toBeNull();
      await service.set(KEY, "written-key");
      expect(service.resolve(KEY)).toBe("written-key");
      expect(service.describe(KEY)).toEqual({ configured: true, source: "file", writable: true });
    });
  });

  describe("a home it cannot create is a degraded store, not a dead one", () => {
    // Root ignores the mode bits, so the setup would not deny anything.
    const notRoot = process.getuid === undefined || process.getuid() !== 0;

    it.skipIf(!notRoot)("still starts, and still serves the environment layer", () => {
      const sealed = join(home, "sealed");
      mkdirSync(sealed, { recursive: true, mode: 0o500 });

      // A container with a read-only HOME whose credentials all arrive through
      // the environment is a valid deployment and needs no writable store. A
      // constructor that threw here would take AMC down over a directory it
      // was never going to write to.
      const service = new LocalCredentialsService({
        path: join(sealed, "amc", ".credentials.yaml"),
        env: { [NAME]: "from-env" },
        watch: true,
        projectDir,
        userEnvPath: userEnvFile
      });
      opened.push(service);

      expect(service.resolve(KEY)).toBe("from-env");
      // Degraded honestly: it says it is not watching rather than pretending.
      expect(service.watching).toBe(false);
    });
  });

  describe("a failed reload keeps the last good snapshot", () => {
    it("keeps serving after an explicit reload throws", () => {
      writeFileSync(file, `${NAME}: "good-key"\n`, { mode: 0o600 });
      const service = open();
      expect(service.resolve(KEY)).toBe("good-key");

      writeFileSync(file, `${NAME}: broken: value\n`, { mode: 0o600 });
      expect(() => service.reload()).toThrow(CredentialsFileParseError);

      // The point of the rule: one mistyped line must not take every provider
      // offline. A store that blanked itself here would turn a typo into an
      // outage, and would report the outage as "no credentials configured".
      expect(service.resolve(KEY)).toBe("good-key");
      expect(service.describe(KEY).source).toBe("file");
    });

    it("keeps serving after the watcher observes an unparsable edit", async () => {
      writeFileSync(file, `${NAME}: "good-key"\n`, { mode: 0o600 });
      const service = open({}, { watch: true });
      expect(service.resolve(KEY)).toBe("good-key");

      writeFileSync(file, `${NAME}: broken: value\n`, { mode: 0o600 });
      await waitFor(() => service.lastReloadError !== null);

      expect(service.lastReloadError).toBeInstanceOf(CredentialsFileParseError);
      expect(service.resolve(KEY)).toBe("good-key");

      // And it recovers on its own once the file is valid again.
      writeFileSync(file, `${NAME}: "fixed-key"\n`, { mode: 0o600 });
      await waitFor(() => service.resolve(KEY) === "fixed-key");
      expect(service.lastReloadError).toBeNull();
    });
  });

  describe("the write path edits one key and keeps everything else", () => {
    const ANNOTATED = [
      "# Managed by AMC. Every value below is a credential.",
      '_FIRST_KEY: "first-value" # rotated 2026-01-04',
      "",
      "# The provider for the staging tenant.",
      '_SECOND_KEY: "second-value"',
      ""
    ].join("\n");

    it("preserves comments and untouched keys when adding one", async () => {
      writeFileSync(file, ANNOTATED, { mode: 0o600 });
      const service = open();
      await service.set(credentialRef("_THIRD_KEY"), "third-value");

      const text = readFileSync(file, "utf8");
      expect(text).toContain("# Managed by AMC. Every value below is a credential.");
      expect(text).toContain("# rotated 2026-01-04");
      expect(text).toContain("# The provider for the staging tenant.");
      expect(text).toContain('_FIRST_KEY: "first-value"');
      expect(service.resolve(credentialRef("_FIRST_KEY"))).toBe("first-value");
      expect(service.resolve(credentialRef("_SECOND_KEY"))).toBe("second-value");
      expect(service.resolve(credentialRef("_THIRD_KEY"))).toBe("third-value");
    });

    it("preserves comments and untouched keys when replacing one", async () => {
      writeFileSync(file, ANNOTATED, { mode: 0o600 });
      const service = open();
      await service.set(credentialRef("_SECOND_KEY"), "rotated-value");

      const text = readFileSync(file, "utf8");
      expect(text).toContain("# Managed by AMC. Every value below is a credential.");
      expect(text).toContain("# rotated 2026-01-04");
      expect(text).toContain('_FIRST_KEY: "first-value"');
      expect(text).not.toContain("second-value");
      expect(service.resolve(credentialRef("_SECOND_KEY"))).toBe("rotated-value");
    });

    it("round-trips a numeric-looking value as a string, not a number", async () => {
      const service = open();
      // A store that let this come back as the number 12345 would fail its own
      // strict parse on the next read — corruption of its own entry.
      await service.set(KEY, "12345");
      expect(open().resolve(KEY)).toBe("12345");
    });

    it("keeps a multi-line value on one physical line", async () => {
      const service = open();
      const pem = "-----BEGIN KEY-----\nabc\n-----END KEY-----";
      await service.set(OTHER, pem);
      expect(open().resolve(OTHER)).toBe(pem);

      // Left to itself the stringifier writes this as a `|-` block, spreading
      // one credential across four lines. Escaped into one double-quoted
      // scalar instead, so "one line holds at most one secret" stays true —
      // which is what every position-only parse error in this store relies on
      // to be safe to print.
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("|-");
      expect(text.split("\n").filter((line) => line.includes("BEGIN KEY"))).toHaveLength(1);
    });

    it("reports whether an unset removed anything", async () => {
      const service = open();
      await service.set(KEY, "written-key");
      expect(await service.unset(KEY)).toBe(true);
      expect(service.resolve(KEY)).toBeNull();
      expect(await service.unset(KEY)).toBe(false);
    });

    it("patches the file on disk, not the copy it read at boot", async () => {
      const service = open();
      await service.set(KEY, "mine");

      // Another process adds a key while this store is holding an older copy —
      // it is not watching, so it has no idea. A write that re-serialised its
      // in-memory view here would silently delete the other process's entry.
      writeFileSync(
        file,
        `${readFileSync(file, "utf8")}AMC_TEST_EXTERNAL_KEY: "theirs"\n`,
        { mode: 0o600 }
      );

      await service.set(OTHER, "also-mine");

      const reopened = open();
      expect(reopened.resolve(credentialRef("AMC_TEST_EXTERNAL_KEY"))).toBe("theirs");
      expect(reopened.resolve(KEY)).toBe("mine");
      expect(reopened.resolve(OTHER)).toBe("also-mine");
    });

    it("creates the store owner-only, directory included", async () => {
      const nestedHome = join(home, "nested", "amc");
      const service = new LocalCredentialsService({
        path: join(nestedHome, ".credentials.yaml"),
        env: {},
        watch: false,
        projectDir,
        userEnvPath: userEnvFile
      });
      opened.push(service);
      await service.set(KEY, "written-key");

      expect(statSync(join(nestedHome, ".credentials.yaml")).mode & 0o777).toBe(0o600);
      expect(statSync(nestedHome).mode & 0o777).toBe(0o700);
    });
  });

  describe("writes serialise, in this process and across processes", () => {
    it("waits for the cross-process lock and gives up loudly", async () => {
      // Stand in for another AMC process holding the lock: the same hardlink
      // protocol, owned by a live pid so the stale-lock reaper cannot claim it.
      const contendersDir = join(home, ".credentials-locks");
      mkdirSync(contendersDir, { recursive: true });
      const token = randomUUID();
      const contender = join(contendersDir, `${token}.json`);
      writeFileSync(
        contender,
        JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }),
        { mode: 0o600 }
      );
      const lockPath = join(home, ".credentials.lock");
      linkSync(contender, lockPath);

      const service = open({}, { lockTimeoutMs: 120 });
      await expect(service.set(KEY, "written-key")).rejects.toBeInstanceOf(ControlFileLockError);
      // Nothing was written while the lock was held elsewhere.
      expect(service.resolve(KEY)).toBeNull();

      unlinkSync(lockPath);
      unlinkSync(contender);
      await service.set(KEY, "written-key");
      expect(service.resolve(KEY)).toBe("written-key");
    });

    it("keeps the queue usable after a QUEUED write rejects", async () => {
      const env: NodeJS.ProcessEnv = {};
      const service = open(env);

      // This rejection happens inside the queued operation, not at the door,
      // so it really does land on the queue's tail.
      const queued = service.set(KEY, "will-be-shadowed");
      env[NAME] = "from-env";
      await expect(queued).rejects.toBeInstanceOf(ShadowedWriteError);
      delete env[NAME];

      // A queue whose tail carried the rejection would fail every later write
      // with someone else's error — one bad call taking the store down.
      await service.set(OTHER, "other-value");
      expect(service.resolve(OTHER)).toBe("other-value");
    });

    it("applies concurrent writes in submission order without losing either", async () => {
      const service = open();
      await Promise.all([
        service.set(KEY, "first-write"),
        service.set(OTHER, "second-write"),
        service.set(KEY, "third-write")
      ]);

      const reopened = open();
      expect(reopened.resolve(KEY)).toBe("third-write");
      expect(reopened.resolve(OTHER)).toBe("second-write");
    });
  });
});
