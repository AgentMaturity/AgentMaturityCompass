import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SandboxRunner, widenPolicy } from "../src/sandbox/sandboxRunner.js";
import { buildSeatbeltProfile, isRunnerFailure } from "../src/sandbox/seatbeltBackend.js";
import { runProcess } from "../src/exec/runProcess.js";
import type { SandboxBackend, SandboxPolicy } from "../src/sandbox/sandboxTypes.js";

/**
 * P4.4's verification, as far as this machine can prove it.
 *
 * These run REAL commands under a REAL kernel sandbox. A mocked backend would
 * prove that AMC calls a function, which is not the claim — the claim is that
 * the operating system refuses the write.
 *
 * The confinement tests are darwin-only, and skipped rather than faked
 * elsewhere. A confinement test that passes on a platform with no sandbox is
 * worse than no test: it reports a boundary nobody established.
 */
const dirs: string[] = [];
const onDarwin = process.platform === "darwin";

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** Real path, because Seatbelt matches resolved paths and /var is a link. */
function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

const policyFor = (roots: readonly string[]): SandboxPolicy => ({
  writableRoots: roots,
  timeoutMs: 15_000
});

describe.runIf(onDarwin)("the kernel actually refuses the write", () => {
  it("permits a write inside the workspace", async () => {
    const workspace = tempDir("amc-sbx-ws-");
    const runner = new SandboxRunner();

    const outcome = await runner.run(
      ["/bin/sh", "-c", `echo inside > ${join(workspace, "ok.txt")}`],
      workspace,
      policyFor([workspace])
    );

    expect(outcome.confined, "a sandbox that blocks the permitted case is a wall").toBe(true);
    expect(outcome.exitCode).toBe(0);
    expect(readFileSync(join(workspace, "ok.txt"), "utf8").trim()).toBe("inside");
  });

  it("DENIES a write outside the workspace", async () => {
    // The criterion P4.4 exists for. Every control before this one was AMC
    // asking a process to behave; this is the kernel refusing.
    const workspace = tempDir("amc-sbx-ws-");
    const outside = tempDir("amc-sbx-out-");
    const target = join(outside, "leak.txt");

    const outcome = await new SandboxRunner().run(
      ["/bin/sh", "-c", `echo escaped > ${target}`],
      workspace,
      policyFor([workspace])
    );

    expect(existsSync(target), "the write must not have happened").toBe(false);
    expect(outcome.confined).toBe(true);
    // The denial reaches the command as EPERM. That IS the backend's own
    // denial signature on darwin -- sandbox-exec itself says nothing.
    expect(outcome.stderr).toContain("Operation not permitted");
  });

  it("denies a write to the user's home directory", async () => {
    const workspace = tempDir("amc-sbx-ws-");
    const target = join(process.env["HOME"] ?? "/Users/nobody", "amc-sandbox-should-not-exist.txt");
    try {
      await new SandboxRunner().run(
        ["/bin/sh", "-c", `echo x > ${target}`],
        workspace,
        policyFor([workspace])
      );
      expect(existsSync(target)).toBe(false);
    } finally {
      // If confinement ever fails, the leaked file would make every LATER run
      // of this file fail too, and the cascade reads as many broken tests
      // instead of one broken boundary.
      rmSync(target, { force: true });
    }
  });

  it("resolves a symlinked workspace path before writing the profile", async () => {
    // The single easiest way to ship a sandbox that does nothing. On darwin
    // `mkdtemp` hands back `/var/folders/...`, `/var` is a link to
    // `/private/var`, and Seatbelt matches the RESOLVED path -- so a profile
    // naming the unresolved form matches nothing, silently, and the workspace
    // is not writable even though the operator granted it.
    const unresolved = mkdtempSync(join(tmpdir(), "amc-sbx-link-"));
    dirs.push(realpathSync(unresolved));
    expect(realpathSync(unresolved), "precondition: this path really is a link")
      .not.toBe(unresolved);

    const outcome = await new SandboxRunner().run(
      ["/bin/sh", "-c", `echo inside > ${join(unresolved, "ok.txt")}`],
      unresolved,
      policyFor([unresolved])
    );

    expect(outcome.exitCode, "granting the unresolved path must still grant the directory").toBe(0);
    expect(existsSync(join(realpathSync(unresolved), "ok.txt"))).toBe(true);
  });

  it("still allows reads, because a toolchain loads from everywhere", async () => {
    // Stated as a limit rather than implied. Confining reads well enough to
    // run Node would need an allowlist so wide it is not a boundary.
    const workspace = tempDir("amc-sbx-ws-");
    const outcome = await new SandboxRunner().run(
      ["/bin/sh", "-c", "ls /usr/bin > /dev/null && echo read-ok"],
      workspace,
      policyFor([workspace])
    );
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain("read-ok");
  });

  it("confines a write made through a symlink pointing outside", async () => {
    // The kernel resolves the path; a lexical check would not. This is the
    // same trap that defeated the fs tools' containment, one layer down.
    const workspace = tempDir("amc-sbx-ws-");
    const outside = tempDir("amc-sbx-out-");
    writeFileSync(join(outside, "target.txt"), "original");

    const outcome = await new SandboxRunner().run(
      ["/bin/sh", "-c", `ln -s ${join(outside, "target.txt")} ${join(workspace, "link.txt")} && echo CLOBBERED > ${join(workspace, "link.txt")}`],
      workspace,
      policyFor([workspace])
    );

    expect(readFileSync(join(outside, "target.txt"), "utf8"), "writing through the link must be refused").toBe("original");
    expect(outcome.confined).toBe(true);
  });

  it("kills a confined command that outruns its timeout", async () => {
    const workspace = tempDir("amc-sbx-ws-");
    const outcome = await new SandboxRunner().run(
      ["/bin/sh", "-c", "sleep 30"],
      workspace,
      { writableRoots: [workspace], timeoutMs: 500 }
    );
    expect(outcome.timedOut).toBe(true);
  });
});

describe.runIf(onDarwin)("runner failure is not the command's fault", () => {
  it("pins the signature the attribution depends on: exit 65 and a sandbox-exec message", async () => {
    // The whole attribution rests on this being distinguishable from anything
    // a command can produce. Measured directly against the real binary rather
    // than assumed, because if macOS ever changed it the backend would start
    // blaming commands for the harness's own broken configuration.
    const workspace = tempDir("amc-sbx-ws-");
    const outcome = await runProcess({
      argv: ["/usr/bin/sandbox-exec", "-f", join(workspace, "does-not-exist.sb"), "/bin/sh", "-c", "echo hi"],
      cwd: workspace,
      env: { PATH: process.env["PATH"] ?? "" },
      stdin: "ignore",
      stdout: "capture",
      stderr: "capture",
      maxCaptureBytes: 8_000,
      scrubValues: [],
      graceMs: 1_000
    }).done;

    expect(outcome.exitCode, "the runner's own failure code").toBe(65);
    // `runProcess` returns CapturedStream, not a string. The sandbox backend's
    // own outcome flattens these to text; this one does not.
    expect(outcome.stderr.text, "and its own prefix on stderr").toContain("sandbox-exec:");
    expect(outcome.stdout.text, "the command never ran").toBe("");
  });

  it("requires BOTH halves of the runner's signature", () => {
    // A command may legitimately exit 65 -- EX_DATAERR is a normal choice for
    // a linter -- and a command may print "sandbox-exec:" for any reason. Only
    // the pair is the runner speaking, and treating either alone as a runner
    // failure would erase a real command failure from the record.
    expect(isRunnerFailure(65, "sandbox-exec: /x/y.sb: No such file or directory")).toBe(true);
    expect(isRunnerFailure(65, "error: 3 problems found"), "a linter's own exit 65").toBe(false);
    expect(isRunnerFailure(1, "sandbox-exec: mentioned by the command"), "a command echoing the word").toBe(false);
    expect(isRunnerFailure(0, "sandbox-exec:")).toBe(false);
    expect(isRunnerFailure(null, "sandbox-exec:"), "a killed process is not a runner failure").toBe(false);
  });

  it("does not let a writable root inject into the profile", async () => {
    // A root is a string that lands inside an SBPL literal. Unescaped, a
    // quote closes the literal and everything after it is policy -- so a path
    // could turn `(deny file-write*)` into `(allow file-write*)` and the
    // sandbox would report itself as confined while confining nothing.
    const profile = buildSeatbeltProfile(['/tmp/evil") (allow file-write*) ;']);
    const afterDeny = profile.slice(profile.indexOf("(deny file-write*)"));
    expect(afterDeny, "the injected allow must not survive as syntax").not.toMatch(/\n\(allow file-write\*\)/);
    expect(profile).toContain('\\"');
  });

  it("still confines when a root contains quote characters", async () => {
    const workspace = tempDir("amc-sbx-ws-");
    const outside = tempDir("amc-sbx-out-");
    const target = join(outside, "leak.txt");

    const outcome = await new SandboxRunner().run(
      ["/bin/sh", "-c", `echo escaped > ${target}`],
      workspace,
      { writableRoots: [workspace, '/tmp/evil") (allow file-write*) ;'], timeoutMs: 15_000 }
    );

    expect(existsSync(target), "an injected allow would have permitted this").toBe(false);
    expect(outcome.confined).toBe(true);
  });
});

describe("failing closed when nothing can enforce", () => {
  const noBackend: SandboxBackend = {
    kind: "seatbelt",
    available: () => ({ ok: false, reason: "no sandbox on this test machine" }),
    run: async () => { throw new Error("must not be reached"); }
  };

  it("REFUSES to run rather than running unconfined", async () => {
    // Silent passthrough is what makes a sandbox worse than none: the operator
    // believes there is a boundary, the evidence says a command ran, and
    // nothing records that the boundary was absent.
    const workspace = tempDir("amc-sbx-ws-");
    const marker = join(workspace, "should-not-exist.txt");

    const outcome = await new SandboxRunner({ backends: [noBackend] }).run(
      ["/bin/sh", "-c", `echo ran > ${marker}`],
      workspace,
      policyFor([workspace])
    );

    expect(existsSync(marker), "the command must not have run at all").toBe(false);
    expect(outcome.confined).toBe(false);
    expect(outcome.failure?.kind).toBe("unavailable");
    expect(outcome.exitCode, "nothing ran, so there is no exit status").toBeNull();
  });

  it("names WHY each backend was unavailable", async () => {
    // A diagnostic that says "no sandbox" is less useful than one that says
    // which backend was missing and on what platform.
    const runner = new SandboxRunner({ backends: [noBackend] });
    expect(runner.select()).toBeNull();
    expect(runner.unavailableReasons().join(" ")).toContain("no sandbox on this test machine");
  });

  it("runs unconfined ONLY when a caller explicitly opts in, and says so", async () => {
    const workspace = tempDir("amc-sbx-ws-");
    const marker = join(workspace, "ran.txt");

    const outcome = await new SandboxRunner({ backends: [noBackend], allowUnconfined: true }).run(
      ["/bin/sh", "-c", `echo ran > ${marker}`],
      workspace,
      policyFor([workspace])
    );

    expect(existsSync(marker)).toBe(true);
    expect(outcome.confined, "a run without a boundary must be legible as one").toBe(false);
    expect(outcome.backend).toBe("none");
    expect(outcome.failure?.kind).toBe("unavailable");
  });
});

describe("the profile", () => {
  it("names the REAL path, because /var is a symlink to /private/var", async () => {
    // A profile naming the unresolved path matches nothing at all -- silently,
    // with no error and no confinement where the operator believed there was
    // some. This is the single easiest way to ship a sandbox that does nothing.
    const workspace = tempDir("amc-sbx-ws-");
    const profile = buildSeatbeltProfile([workspace]);
    expect(profile).toContain(realpathSync(workspace));
  });

  it("denies writes before re-allowing the workspace", async () => {
    const profile = buildSeatbeltProfile(["/tmp/example"]);
    expect(profile.indexOf("(deny file-write*)")).toBeLessThan(profile.indexOf("/tmp/example"));
  });

  it("confines writes without claiming to confine reads or network", async () => {
    const profile = buildSeatbeltProfile(["/tmp/example"]);
    expect(profile).toContain("(allow default)");
    expect(profile, "reads are open; saying otherwise would be a claim we cannot keep")
      .not.toContain("(deny file-read");
    expect(profile).not.toContain("(deny network");
  });
});

describe("escalation widens strictly", () => {
  it("adds a root without dropping the ones already granted", async () => {
    // A "widening" that replaced the set could quietly remove a root the
    // operator granted -- an escalation protocol that can narrow is a protocol
    // for laundering a revocation as a grant.
    const base = policyFor(["/a", "/b"]);
    const wider = widenPolicy(base, ["/c"]);

    expect(wider.writableRoots).toEqual(["/a", "/b", "/c"]);
    expect(base.writableRoots, "the original is untouched").toEqual(["/a", "/b"]);
  });

  it("does not duplicate a root that was already granted", async () => {
    expect(widenPolicy(policyFor(["/a"]), ["/a", "/b"]).writableRoots).toEqual(["/a", "/b"]);
  });

  it("carries the rest of the policy through unchanged", async () => {
    const widened = widenPolicy({ writableRoots: ["/a"], timeoutMs: 1234 }, ["/b"]);
    expect(widened.timeoutMs).toBe(1234);
  });
});
