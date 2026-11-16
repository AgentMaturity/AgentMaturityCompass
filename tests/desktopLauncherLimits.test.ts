import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { afterEach, expect, test } from "vitest";
import { desktopFile } from "../scripts/desktop/files.mjs";

// The desktop launchers' time limits, signal handling and wording (site report S-05, S-10, S-14, S-15, S-16), run
// headless against stubs: no window, no Keychain, no network.

const dirs: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGKILL");
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitFor = async (check: () => boolean, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((done) => setTimeout(done, 100))) if (check()) return true;
  return check();
};

function box(studioOs: "mac" | "linux" = "mac") {
  const dir = mkdtempSync(join(tmpdir(), "amc-launcher-limits-"));
  dirs.push(dir);
  const stubs = join(dir, "stubs");
  mkdirSync(stubs);
  writeFileSync(join(dir, "amc.tgz"), "packaged amc");
  const digest = createHash("sha256").update("packaged amc").digest("hex");
  const script = join(dir, "launch-studio.sh");
  writeFileSync(script, desktopFile("launch-studio.sh", { STUDIO_OS: studioOs, PACKAGE_NAME: "amc.tgz", PACKAGE_SHA256: digest, NODE_MIN_MAJOR: 20 }));
  const support = join(dir, "support");
  const log = () => readFileSync(join(support, "Logs", "studio-launcher.log"), "utf8");
  const start = (mode: string, env: Record<string, string> = {}) => {
    const child = spawn("/bin/sh", [script, mode], {
      env: { HOME: join(dir, "home"), PATH: `${stubs}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin`, AMC_STUDIO_SUPPORT_DIR: support, ...env },
      stdio: ["ignore", "pipe", "ignore"]
    });
    children.push(child);
    let out = "";
    child.stdout.on("data", (chunk) => { out += String(chunk); });
    const done = new Promise<{ status: number | null; lines: string[] }>((finish) =>
      child.on("close", (status) => finish({ status, lines: out.trim().split("\n") })));
    return { child, done };
  };
  return { dir, stubs, support, log, start };
}

test.skipIf(process.platform === "win32")("S-05: an npm that never finishes is stopped at the time limit, with its children, and the app is told why", async () => {
  const b = box();
  const pidFile = join(b.dir, "npm-child.pid");
  writeFileSync(join(b.stubs, "npm"), `#!/bin/sh\nsleep 600 &\necho $! >"${pidFile}"\nwait\n`, { mode: 0o755 });
  const run = await b.start("workspace", { AMC_LAUNCHER_INSTALL_LIMIT: "2" }).done;
  expect(run.status).toBe(1);
  expect(run.lines.at(-1)).toBe(`AMC_ERROR=Installing AMC took longer than 2 seconds, so it was stopped. On first launch AMC downloads its parts from the internet. Check the network connection, then click Retry. Details are in ${join(b.support, "Logs", "studio-launcher.log")}.`);
  expect(await waitFor(() => !alive(Number(readFileSync(pidFile, "utf8"))), 3_000)).toBe(true);
  // npm's own network limits are set too, so one request cannot wait for the whole budget.
  expect(readFileSync(resolve("scripts/desktop/launch-studio.sh"), "utf8")).toContain("--fetch-timeout=30000 --fetch-retries=2");
}, 30_000);

test.skipIf(process.platform === "win32")("S-05/S-14: stopping the launcher during the install (the app quitting) stops npm and everything under it", async () => {
  const b = box();
  const pidFile = join(b.dir, "npm-child.pid");
  writeFileSync(join(b.stubs, "npm"), `#!/bin/sh\nsleep 600 &\necho $! >"${pidFile}"\nwait\n`, { mode: 0o755 });
  const { child, done } = b.start("workspace");
  expect(await waitFor(() => existsSync(pidFile))).toBe(true);
  const npmChild = Number(readFileSync(pidFile, "utf8"));
  child.kill("SIGTERM");
  const run = await done;
  expect(run.status).toBe(143);
  expect(run.lines.some((line) => line.startsWith("AMC_STUDIO_URL="))).toBe(false);
  expect(await waitFor(() => !alive(npmChild), 3_000)).toBe(true);
  expect(b.log()).toContain("Stopped before it finished");
}, 30_000);

test.skipIf(process.platform === "win32")("S-14: stopping the launcher while amc up runs leaves no Studio behind", async () => {
  const b = box();
  const runtime = join(b.support, "runtime");
  const daemonPid = join(b.dir, "daemon.pid");
  mkdirSync(join(runtime, "node_modules", ".bin"), { recursive: true });
  writeFileSync(join(runtime, "package.sha256"), `${createHash("sha256").update("packaged amc").digest("hex")}\n`);
  writeFileSync(join(b.dir, "daemon.sh"), "while :; do sleep 1; done\n");
  // amc up starts a Studio daemon (its command line names _studio-daemon) and is still busy when the signal comes.
  writeFileSync(join(runtime, "node_modules", ".bin", "amc"), `#!/bin/sh
if [ "$1" = up ]; then
  sh "${join(b.dir, "daemon.sh")}" _studio-daemon &
  mkdir -p .amc/studio; printf '{"pid":%s}' "$!" > .amc/studio/state.json; echo $! >"${daemonPid}"
  sleep 600
fi
[ "$1" = down ] && kill "$(cat "${daemonPid}")"
exit 0
`, { mode: 0o755 });
  const { child, done } = b.start("demo");
  expect(await waitFor(() => existsSync(daemonPid))).toBe(true);
  const daemon = Number(readFileSync(daemonPid, "utf8"));
  child.kill("SIGTERM");
  expect((await done).status).toBe(143);
  expect(await waitFor(() => !alive(daemon), 5_000)).toBe(true);
}, 30_000);

test.skipIf(process.platform === "win32")("S-14: a port held by another AMC Studio is named as AMC, and amc is named only when it is on PATH", async () => {
  const b = box();
  const runtime = join(b.support, "runtime");
  mkdirSync(join(runtime, "node_modules", ".bin"), { recursive: true });
  writeFileSync(join(runtime, "package.sha256"), `${createHash("sha256").update("packaged amc").digest("hex")}\n`);
  writeFileSync(join(runtime, "node_modules", ".bin", "amc"), "#!/bin/sh\n[ \"$1\" = up ] && exit 1\nexit 0\n", { mode: 0o755 });
  const holder = spawn(process.execPath, ["-e", "const s = require('node:net').createServer().listen(0, '127.0.0.1', () => console.log(s.address().port))", "_studio-daemon"], { stdio: ["ignore", "pipe", "ignore"] });
  children.push(holder);
  const port = await new Promise<string>((done) => holder.stdout!.once("data", (chunk) => done(String(chunk).trim())));
  const ports = Object.fromEntries(["AMC_STUDIO_PORT", "AMC_HOST_PORT", "AMC_GATEWAY_PORT", "AMC_PROXY_PORT", "AMC_DASHBOARD_PORT", "AMC_METRICS_PORT"].map((name) => [name, port]));
  writeFileSync(join(b.stubs, "amc"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const withAmc = await b.start("demo", ports).done;
  expect(withAmc.lines.at(-1)).toBe(`AMC_ERROR=AMC could not start because another AMC Studio on this Mac already uses port ${port}, probably one started from a terminal. To stop it, type amc down in Terminal in the folder where it was started, then click Retry.`);
  // Finder's PATH has no amc unless one is installed in the folders the launcher adds.
  if (!["/opt/homebrew/bin/amc", "/usr/local/bin/amc"].some((path) => existsSync(path))) {
    rmSync(join(b.stubs, "amc"));
    const withoutAmc = await b.start("demo", ports).done;
    expect(withoutAmc.lines.at(-1)).toContain("Stop that Studio, or quit the program that started it, then click Retry.");
    expect(withoutAmc.lines.at(-1)).not.toContain("amc down");
  }
}, 30_000);

test.skipIf(process.platform === "win32")("S-16: on Linux the launcher keeps its data under XDG_DATA_HOME and --add-to-menu installs a .desktop file with the icons", async () => {
  const dir = mkdtempSync(join(tmpdir(), "amc-linux-menu-"));
  dirs.push(dir);
  const app = join(dir, "amc 1.2.0 linux");
  for (const size of [48, 128, 256, 512]) {
    mkdirSync(join(app, "icons", "hicolor", `${size}x${size}`, "apps"), { recursive: true });
    writeFileSync(join(app, "icons", "hicolor", `${size}x${size}`, "apps", "agent-maturity-compass-studio.png"), `png ${size}`);
  }
  writeFileSync(join(app, "amc-studio.sh"), desktopFile("amc-studio-linux.sh", {}), { mode: 0o755 });
  const data = join(dir, "data");
  const added = spawnSync("/bin/sh", [join(app, "amc-studio.sh"), "--add-to-menu"], { env: { HOME: dir, XDG_DATA_HOME: data, PATH: "/usr/bin:/bin" }, encoding: "utf8" });
  expect(added.status, added.stderr).toBe(0);
  const entry = readFileSync(join(data, "applications", "agent-maturity-compass-studio.desktop"), "utf8");
  expect(entry.split("\n")).toEqual(expect.arrayContaining([
    "[Desktop Entry]", "Type=Application", "Name=Agent Maturity Compass Studio", `Exec="${app}/amc-studio.sh"`,
    "Icon=agent-maturity-compass-studio", "Terminal=true"
  ]));
  for (const size of [48, 128, 256, 512]) {
    expect(readFileSync(join(data, "icons", "hicolor", `${size}x${size}`, "apps", "agent-maturity-compass-studio.png"), "utf8")).toBe(`png ${size}`);
  }
  expect(statSync(join(data, "applications", "agent-maturity-compass-studio.desktop")).mode & 0o777).toBe(0o644);
  // A folder whose path a quoted Exec value cannot hold is refused, not written half-escaped.
  const odd = join(dir, "a$b");
  mkdirSync(odd);
  writeFileSync(join(odd, "amc-studio.sh"), desktopFile("amc-studio-linux.sh", {}), { mode: 0o755 });
  const refused = spawnSync("/bin/sh", [join(odd, "amc-studio.sh"), "--add-to-menu"], { env: { HOME: dir, XDG_DATA_HOME: join(dir, "data2"), PATH: "/usr/bin:/bin" }, encoding: "utf8" });
  expect(refused.status).toBe(1);
  expect(existsSync(join(dir, "data2", "applications"))).toBe(false);

  // The shared launcher on Linux: its data under XDG_DATA_HOME, words for "this computer", no Keychain.
  const b = box("linux");
  const linux = spawnSync("/bin/sh", [join(b.dir, "launch-studio.sh"), "info"], { env: { HOME: dir, XDG_DATA_HOME: data, PATH: "/usr/bin:/bin" }, encoding: "utf8" });
  expect(linux.stdout).toContain(`AMC_WORKSPACE_DIR=${join(data, "agent-maturity-compass", "workspace")}`);
  expect(linux.stdout).toContain(`AMC_LOG_FILE=${join(data, "agent-maturity-compass", "Logs", "studio-launcher.log")}`);
});

// No PowerShell host runs here or in CI: these pin the generated Windows text. Untested on a real Windows machine.
test("S-15: the Windows launcher uses the app's ports, checks Node, starts your own workspace and adds a shortcut with the AMC icon", () => {
  const ps1 = desktopFile("studio-windows.ps1", { PACKAGE_NAME: "amc.tgz", PACKAGE_SHA256: "a".repeat(64), NODE_MIN_MAJOR: 20 });
  expect(ps1).toContain('AMC_STUDIO_PORT = "3232"');
  expect(ps1).not.toMatch(/:3212\b|"3212"/);
  expect(ps1).toContain("$NodeMinMajor = 20");
  expect(ps1).toContain("AMC needs Node.js $NodeMinMajor or newer, and the one found on this computer is Node.js $NodeVersion ($($Node.Source))");
  expect(ps1).toContain("param([switch]$Demo, [switch]$Stop, [switch]$NoShortcut)");
  expect(ps1).toContain('Start-Studio $WorkspaceDir @()');
  expect(ps1).toContain("& $AmcBin user init --username $UserName");
  expect(ps1).toContain('$Icon = Join-Path $PSScriptRoot "amc-studio.ico"');
  expect(ps1).toContain('$Shortcut.IconLocation = "$Icon,0"');
  expect(ps1).toContain("& taskkill.exe /PID $ProcessId /T /F");
  expect(ps1).toContain("$script:Child.WaitForExit($Seconds * 1000)");
  expect(ps1).toContain('"--fetch-timeout=30000", "--fetch-retries=2"');
  expect(ps1).toContain('$Owner.CommandLine.Contains("_studio-daemon")');
  // Every placeholder is filled, and no step tells a launcher user to type amc unless amc is on PATH.
  expect(ps1).not.toMatch(/__AMC_[A-Z0-9_]+__/);
  expect(ps1).toContain('if (Get-Command amc -ErrorAction SilentlyContinue) { "To stop it, type amc down');
  expect(() => desktopFile("studio-windows.ps1", { PACKAGE_NAME: 'x" ; calc', PACKAGE_SHA256: "a", NODE_MIN_MAJOR: 20 })).toThrow(/unsafe/);
});

test("S-10: every installer and launcher states the one Node rule from package.json engines", () => {
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { engines: { node: string } };
  expect(pkg.engines.node).toBe(">=20");
  const sources = ["scripts/package-desktop-installers.mjs", "scripts/desktop/launch-studio.sh", "scripts/desktop/studio-windows.ps1"]
    .map((path) => readFileSync(resolve(path), "utf8")).join("\n");
  expect(sources).not.toMatch(/Node\.js 22 or 24/);
  expect(readFileSync(resolve("scripts/package-desktop-installers.mjs"), "utf8")).toContain("Node.js ${nodeMajor} or newer");
});
