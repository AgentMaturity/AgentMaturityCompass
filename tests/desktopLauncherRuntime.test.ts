import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { expect, test } from "vitest";

const packager = resolve("scripts/package-desktop-installers.mjs");

test.skipIf(process.platform === "win32")("macOS launcher preserves an operator-selected runtime before Finder fallbacks", () => {
  const directory = mkdtempSync(join(tmpdir(), "amc-launcher-runtime-"));
  try {
    const selectedNode = join(directory, "node");
    writeFileSync(selectedNode, "#!/bin/sh\nprintf '%s' selected-runtime\n", { mode: 0o755 });
    const source = readFileSync(packager, "utf8");
    const pathSetup = source.match(/^export PATH="[^"]+"$/m)?.[0];
    expect(pathSetup).toBeDefined();
    // Execute the production launcher's PATH setup and a real executable lookup.
    // Prepending a globally installed Node used to override this explicit choice.
    const result = spawnSync("/bin/sh", ["-c", `${pathSetup}\nnode`], {
      env: { PATH: `${directory}:/usr/bin:/bin` }, encoding: "utf8"
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("selected-runtime");
    expect(result.stderr).toBe("");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === "win32")("moved macOS app installs from its own tarball, stops the old Studio on upgrade and names a taken port", async () => {
  const directory = mkdtempSync(join(tmpdir(), "amc-launcher-flow-"));
  const server = createServer();
  let daemon: ChildProcess | undefined;
  let other: ChildProcess | undefined;
  try {
    // The app alone, moved away from the extracted archive folder that also holds a tarball.
    const resources = join(directory, "Applications", "Agent Maturity Compass Studio.app", "Contents", "Resources");
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, "amc.tgz"), "packaged amc");
    const digest = createHash("sha256").update("packaged amc").digest("hex");
    const template = readFileSync(packager, "utf8").match(/const launchScript = `([\s\S]*?)`;\n/)?.[1];
    expect(template).toBeDefined();
    // Evaluate the production template literal with the two values the generator substitutes.
    writeFileSync(join(resources, "launch-studio.sh"), new Function("tarballName", "tarballDigest", `return \`${template}\`;`)("amc.tgz", digest));

    const stubs = join(directory, "stubs");
    const calls = join(directory, "calls.log");
    mkdirSync(stubs);
    writeFileSync(join(stubs, "npm"), `#!/bin/sh\necho "npm $1 $6" >>"${calls}"\nmkdir -p "$3/node_modules/.bin"\ncp "${stubs}/amc-stub" "$3/node_modules/.bin/amc"\n`, { mode: 0o755 });
    writeFileSync(join(stubs, "osascript"), `#!/bin/sh\necho dialog >>"${calls}"\n`, { mode: 0o755 });
    writeFileSync(join(stubs, "amc-stub"), `#!/bin/sh
old=gone
[ -n "\${STUDIO_PID:-}" ] && kill -0 "$STUDIO_PID" 2>/dev/null && old=alive
echo "amc $1 $old $(basename "$PWD")" >>"${calls}"
[ "$1" = down ] && kill "$STUDIO_PID"
[ "$1" = up ] && exit "\${AMC_UP_STATUS:-0}"
exit 0
`, { mode: 0o755 });
    const home = join(directory, "home");
    const support = join(home, "Library", "Application Support", "Agent Maturity Compass");
    // Asynchronous, so this process keeps reaping its children and serving its listener while the launcher runs.
    const launch = (env: Record<string, string> = {}) => new Promise<{ status: number | null; calls: string[] }>((done) => {
      rmSync(calls, { force: true });
      spawn("/bin/sh", [join(resources, "launch-studio.sh")], {
        env: { HOME: home, PATH: `${stubs}:${dirname(process.execPath)}:/usr/bin:/bin`, ...env }, stdio: "ignore"
      }).on("exit", (status) => done({ status, calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [] }));
    });

    expect(await launch()).toEqual({ status: 0, calls: [`npm install ${join(resources, "amc.tgz")}`, "amc up gone studio-workspace"] });
    expect(readFileSync(join(support, "runtime", "package.sha256"), "utf8").trim()).toBe(digest);

    // An upgrade while the previous runtime's Studio runs: a daemon that needs a moment to exit after SIGTERM.
    // Its command line carries the daemon entry, as `cli.js _studio-daemon --workspace …` does.
    writeFileSync(join(directory, "daemon.sh"), "trap 'sleep 1; exit 0' TERM\nwhile :; do sleep 1; done\n");
    daemon = spawn("/bin/sh", [join(directory, "daemon.sh"), "_studio-daemon"], { stdio: "ignore" });
    const stateFile = join(support, "studio-workspace", ".amc", "studio", "state.json");
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ pid: daemon.pid }));
    writeFileSync(join(support, "runtime", "package.sha256"), "previous-package-digest\n");
    expect((await launch({ STUDIO_PID: String(daemon.pid) })).calls).toEqual([
      "amc down alive studio-workspace",
      `npm install ${join(resources, "amc.tgz")}`,
      "amc up gone studio-workspace"
    ]);

    // A stale state file whose pid now belongs to another program: the old runtime's amc down would signal it,
    // so the launcher leaves that program alone and drops the stale file before the new runtime starts.
    other = spawn("/bin/sh", ["-c", "while :; do sleep 1; done"], { stdio: "ignore" });
    writeFileSync(stateFile, JSON.stringify({ pid: other.pid }));
    writeFileSync(join(support, "runtime", "package.sha256"), "previous-package-digest\n");
    expect((await launch({ STUDIO_PID: String(other.pid) })).calls).toEqual([
      `npm install ${join(resources, "amc.tgz")}`,
      "amc up alive studio-workspace"
    ]);
    expect(existsSync(stateFile)).toBe(false);

    // A failed start explains a taken Studio port, and only then.
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const port = String((server.address() as { port: number }).port);
    expect(await launch({ AMC_UP_STATUS: "1", AMC_HOST_PORT: port })).toEqual({ status: 1, calls: ["amc up gone studio-workspace", "dialog"] });
    await new Promise<void>((done) => server.close(() => done()));
    expect(await launch({ AMC_UP_STATUS: "1", AMC_HOST_PORT: port })).toEqual({ status: 1, calls: ["amc up gone studio-workspace"] });
  } finally {
    if (server.listening) server.close();
    daemon?.kill();
    other?.kill();
    rmSync(directory, { recursive: true, force: true });
  }
}, 60_000);

test.skipIf(process.platform === "win32")("macOS launcher reports the console URL with the port Studio bound, from state.json (coordinator P2)", () => {
  const directory = mkdtempSync(join(tmpdir(), "amc-launcher-port-"));
  try {
    const resources = join(directory, "Resources");
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, "amc.tgz"), "packaged amc");
    const digest = createHash("sha256").update("packaged amc").digest("hex");
    const template = readFileSync(packager, "utf8").match(/const launchScript = `([\s\S]*?)`;\n/)?.[1];
    writeFileSync(join(resources, "launch-studio.sh"), new Function("tarballName", "tarballDigest", `return \`${template}\`;`)("amc.tgz", digest));
    const home = join(directory, "home");
    const runtime = join(home, "Library", "Application Support", "Agent Maturity Compass", "runtime");
    mkdirSync(join(runtime, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(runtime, "package.sha256"), `${digest}\n`);
    // amc up writes the state file the way Studio does, with the port it bound.
    writeFileSync(join(runtime, "node_modules", ".bin", "amc"), `#!/bin/sh
[ "$1" = up ] || exit 0
mkdir -p .amc/studio
[ -n "\${STATE_JSON:-}" ] && printf '%s' "$STATE_JSON" > .amc/studio/state.json
exit 0
`, { mode: 0o755 });
    const launch = (stateJson: string) => spawnSync("/bin/sh", [join(resources, "launch-studio.sh")], {
      env: { HOME: home, PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, STATE_JSON: stateJson }, encoding: "utf8"
    });
    const bound = launch(JSON.stringify({ pid: 1, apiPort: 47123, host: "127.0.0.1" }));
    expect(bound.status, bound.stderr).toBe(0);
    expect(bound.stdout.trim().split("\n").at(-1)).toBe("AMC_STUDIO_URL=http://127.0.0.1:47123/w/demo/console/");
    // An unreadable or implausible state falls back to the default port.
    for (const state of ["not json", JSON.stringify({ apiPort: 70000 }), JSON.stringify({ apiPort: "3213" })]) {
      expect(launch(state).stdout.trim().split("\n").at(-1)).toBe("AMC_STUDIO_URL=http://127.0.0.1:3212/w/demo/console/");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([".", ".."])("desktop packager refuses AMC_DESKTOP_PACKAGE_OUT=%s, which contains the checkout", (out) => {
  const directory = mkdtempSync(join(tmpdir(), "amc-package-out-"));
  try {
    const checkout = join(directory, "checkout");
    mkdirSync(checkout);
    writeFileSync(join(checkout, "package.json"), "{}");
    const result = spawnSync(process.execPath, [packager], {
      cwd: checkout, env: { ...process.env, AMC_DESKTOP_PACKAGE_OUT: out, AMC_DESKTOP_NPM_TARBALL: "" }, encoding: "utf8", timeout: 30_000
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("AMC_DESKTOP_PACKAGE_OUT must not contain the repository");
    expect(existsSync(join(checkout, "package.json"))).toBe(true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
