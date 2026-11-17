import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, expect, test } from "vitest";
import { desktopFile } from "../scripts/desktop/files.mjs";

// The macOS app's own-workspace path (launch-studio.sh workspace), run against stubs: a Keychain kept in files by a fake
// security(1), an amc that records what it got, and a console that answers POST /auth/login.

const appSource = resolve("scripts/desktop/StudioApp.m");
const dirs: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise((done) => server.close(done));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function launcher(resources: string): string {
  writeFileSync(join(resources, "amc.tgz"), "packaged amc");
  const digest = createHash("sha256").update("packaged amc").digest("hex");
  const path = join(resources, "launch-studio.sh");
  writeFileSync(path, desktopFile("launch-studio.sh", { STUDIO_OS: "mac", PACKAGE_NAME: "amc.tgz", PACKAGE_SHA256: digest, NODE_MIN_MAJOR: 20 }));
  return path;
}

/** A console that signs in `sid` with the password the Keychain stub holds for amc-console, and counts sign-ins. */
async function consoleServer(passwordFor: () => string): Promise<{ port: number; logins: string[] }> {
  const logins: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; }).on("end", () => {
      const { username, password } = JSON.parse(body || "{}") as { username?: string; password?: string };
      logins.push(String(username));
      if (req.url !== "/auth/login" || req.method !== "POST" || password !== passwordFor()) { res.writeHead(401).end(); return; }
      res.writeHead(200, { "set-cookie": "amc_session=session-token-0123456789abcdef; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800" }).end("{}");
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { port: (server.address() as { port: number }).port, logins };
}

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "amc-app-own-"));
  dirs.push(dir);
  const resources = join(dir, "Resources");
  const stubs = join(dir, "stubs");
  const keychain = join(dir, "keychain");
  const calls = join(dir, "calls.log");
  const support = join(dir, "support");
  for (const path of [resources, stubs, keychain]) mkdirSync(path);
  // security(1): -i reads "add-generic-password -U -a ACCOUNT -s SERVICE -w SECRET" on stdin; find prints the secret.
  writeFileSync(join(stubs, "security"), `#!/bin/sh
echo "security $*" >>"${calls}"
if [ "$1" = -i ]; then
  read -r cmd u a account s service w secret
  printf '%s' "$secret" > "${keychain}/$service.$account"
  exit 0
fi
[ "$1" = find-generic-password ] && [ -f "${keychain}/$5.$3" ] && { cat "${keychain}/$5.$3"; echo; exit 0; }
exit 44
`, { mode: 0o755 });
  writeFileSync(join(stubs, "npm"), `#!/bin/sh
mkdir -p "$3/node_modules/.bin"
cp "${stubs}/amc-stub" "$3/node_modules/.bin/amc"
`, { mode: 0o755 });
  // amc up writes the state Studio writes, with the console port; user init records the password it read from its file.
  writeFileSync(join(stubs, "amc-stub"), `#!/bin/sh
echo "amc $* vault=\${AMC_VAULT_PASSPHRASE:-unset}" >>"${calls}"
if [ "$1" = up ]; then mkdir -p .amc/studio; printf '{"pid":1,"apiPort":%s}' "$CONSOLE_PORT" > .amc/studio/state.json; fi
if [ "$1 $2" = "user init" ]; then printf '%s' "$(cat "$6")" > "${dir}/user-init-password"; mkdir -p .amc; echo users > .amc/users.yaml; fi
if [ "$1 $2" = "user password" ]; then printf '%s' "$(cat "$5")" > "${dir}/server-password"; fi
exit 0
`, { mode: 0o755 });
  const script = launcher(resources);
  const run = (mode: string, env: Record<string, string> = {}, path = `${stubs}:${dirname(process.execPath)}:/usr/bin:/bin`) =>
    new Promise<{ status: number | null; lines: string[] }>((done) => {
    let out = "";
    const child = spawn("/bin/sh", [script, mode], {
      env: { HOME: join(dir, "home"), PATH: path, AMC_STUDIO_SUPPORT_DIR: support, ...env },
      stdio: ["ignore", "pipe", "ignore"]
    });
    child.stdout.on("data", (chunk) => { out += String(chunk); });
    child.on("close", (status) => done({ status, lines: out.trim().split("\n") }));
  });
  const secret = (service: string) => readFileSync(join(keychain, `${service}.${workspaceKey()}`), "utf8");
  // The remembered-passphrase store's account (src/vault/passphraseStore.ts): sha256 of the resolved workspace path.
  const workspaceKey = () => createHash("sha256").update(realpathSync(join(support, "workspace"))).digest("hex").slice(0, 32);
  return { dir, support, calls, run, secret, workspaceKey };
}

test.skipIf(process.platform === "win32")("first launch creates the own workspace, keeps both secrets in the Keychain only, and signs the owner in", async () => {
  const box = sandbox();
  const server = await consoleServer(() => box.secret("amc-console"));
  const first = await box.run("workspace", { CONSOLE_PORT: String(server.port) });
  expect(first.status).toBe(0);
  expect(first.lines).toEqual([
    expect.stringMatching(/^AMC_PACKAGE_DIGEST=[0-9a-f]{64}$/),
    expect.stringMatching(/^AMC_NODE=Node\.js v\d+\.\d+\.\d+ \(\/.+\/node\)$/),
    "AMC_STATUS=Installing AMC (first launch only). This takes a minute or two.",
    "AMC_STATUS=Creating your workspace (first launch only).",
    "AMC_STARTED=1",
    "AMC_STATUS=Creating your owner account.",
    "AMC_SESSION=session-token-0123456789abcdef",
    "AMC_TITLE=My workspace",
    `AMC_STUDIO_URL=http://127.0.0.1:${server.port}/console/`
  ]);
  const vault = box.secret("amc-vault");
  const consolePassword = box.secret("amc-console");
  expect(vault).toMatch(/^[A-Za-z0-9]{32}$/);
  expect(consolePassword).toMatch(/^[A-Za-z0-9]{32}$/);
  expect(readFileSync(join(box.dir, "user-init-password"), "utf8")).toBe(consolePassword);
  const calls = readFileSync(box.calls, "utf8");
  // amc up got the new passphrase in its environment; the owner account was made for this OS user, from stdin.
  expect(calls).toContain(`amc up --no-open vault=${vault}`);
  expect(calls).toMatch(/amc user init --username [A-Za-z0-9._-]+ --password-file \/dev\/stdin vault=/);
  // No secret reached a process argument, the launcher log or a file in the support folder.
  const argv = calls.split("\n").filter((line) => line.startsWith("security"));
  expect(argv.length).toBeGreaterThan(0);
  for (const value of [vault, consolePassword]) {
    expect(argv.join("\n")).not.toContain(value);
    expect(readFileSync(join(box.support, "Logs", "studio-launcher.log"), "utf8")).not.toContain(value);
  }
  expect(readFileSync(join(box.support, "console-user"), "utf8").trim()).toBe(server.logins[0]);
  expect((await box.run("info")).lines).toContain("AMC_SETUP_DONE=1");

  // A later launch: no new secrets, no account creation, amc up reads the remembered passphrase itself.
  rmSync(box.calls);
  const later = await box.run("workspace", { CONSOLE_PORT: String(server.port) });
  expect(later.status).toBe(0);
  expect(later.lines).toContain("AMC_SESSION=session-token-0123456789abcdef");
  expect(box.secret("amc-vault")).toBe(vault);
  const laterCalls = readFileSync(box.calls, "utf8");
  expect(laterCalls).toContain("amc up --no-open vault=unset");
  expect(laterCalls).not.toContain("user init");
  expect(laterCalls).not.toContain("security -i");
});

// S-14: the app never lands on a sign-in page whose password only the Keychain knows. A refused password is replaced
// once (Keychain and account, with the vault passphrase from the Keychain, never in an argument); if signing in still
// fails the app is told why.
test.skipIf(process.platform === "win32")("a console that refuses the stored password gets a new one, and a vault without its Keychain entry is not replaced", async () => {
  const box = sandbox();
  const serverPassword = join(box.dir, "server-password");
  writeFileSync(serverPassword, "a password set elsewhere");
  const server = await consoleServer(() => readFileSync(serverPassword, "utf8"));
  const run = await box.run("workspace", { CONSOLE_PORT: String(server.port) });
  expect(run.status).toBe(0);
  expect(run.lines).toContain("AMC_SESSION=session-token-0123456789abcdef");
  // The person is told: a password they set themselves no longer works.
  expect(run.lines).toContain("AMC_NOTICE=Your console password did not match the one in your macOS Keychain, so AMC set a new one. It is in your Keychain as amc-console (open Keychain Access to see it). A password you set yourself no longer works.");
  const consolePassword = box.secret("amc-console");
  expect(readFileSync(serverPassword, "utf8")).toBe(consolePassword);
  const calls = readFileSync(box.calls, "utf8");
  expect(calls).toMatch(/amc user password [A-Za-z0-9._-]+ --password-file \/dev\/stdin vault=[A-Za-z0-9]{32}/);
  expect(calls.split("\n").filter((line) => line.startsWith("security")).join("\n")).not.toContain(consolePassword);
  expect(readFileSync(join(box.support, "Logs", "studio-launcher.log"), "utf8")).not.toContain(consolePassword);

  // A console that refuses every password: the launcher stops with words the app shows, not a sign-in page.
  writeFileSync(serverPassword, "");
  const refusedServer = await consoleServer(() => "never matches");
  const stuck = await box.run("workspace", { CONSOLE_PORT: String(refusedServer.port) });
  expect(stuck.status).toBe(1);
  expect(stuck.lines.some((line) => line.startsWith("AMC_STUDIO_URL="))).toBe(false);
  expect(stuck.lines.at(-1)).toMatch(/^AMC_ERROR=AMC started, but could not sign you in to the Compass Console\./);

  // Setup interrupted after the vault was made, and the Keychain entry is gone: the launcher stops instead of generating
  // a passphrase that could never open that vault.
  rmSync(join(box.support, "workspace", ".amc", "users.yaml"));
  writeFileSync(join(box.support, "workspace", ".amc", "vault.amcvault"), "vault");
  rmSync(join(box.dir, "keychain", `amc-vault.${box.workspaceKey()}`));
  const refused = await box.run("workspace", { CONSOLE_PORT: String(server.port) });
  expect(refused.status).toBe(1);
  expect(refused.lines.at(-1)).toMatch(/^AMC_ERROR=Your workspace has a vault, but its passphrase is not in your macOS Keychain/);
  // The way out names the app's own amc by its full path: an app user has no amc on PATH.
  expect(refused.lines.at(-1)).toContain(`"${join(box.support, "runtime", "node_modules", ".bin", "amc")}" up`);
  expect(refused.lines.at(-1)).not.toContain("local-vault-passphrase");
  expect(existsSync(join(box.dir, "keychain", `amc-vault.${box.workspaceKey()}`))).toBe(false);
});

test.skipIf(process.platform === "win32")("first-launch failures say what to do: Node.js missing or too old, npm failing", async () => {
  const box = sandbox();
  // The launcher appends Finder's usual Node folders to PATH, so "no Node at all" is checked only where none exists.
  const finderNode = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node", "/bin/node"].some((path) => existsSync(path));
  if (!finderNode) {
    const missing = await box.run("workspace", {}, "/usr/bin:/bin");
    expect(missing.lines.at(-1)).toMatch(/^AMC_ERROR=AMC needs Node.js 20 or newer, and none was found on this Mac. Install Node.js from https:\/\/nodejs.org/);
  }
  // A Node too old for AMC is named, with the fix.
  const oldNode = join(box.dir, "old-node");
  mkdirSync(oldNode);
  writeFileSync(join(oldNode, "node"), "#!/bin/sh\n[ \"$1\" = -p ] && { echo 18; exit 0; }\necho v18.20.0\n", { mode: 0o755 });
  const tooOld = await box.run("workspace", {}, `${oldNode}:${join(box.dir, "stubs")}:/usr/bin:/bin`);
  expect(tooOld.status).toBe(1);
  // S-10: one rule (package.json engines, >=20), and the message names the node it found.
  expect(tooOld.lines.at(-1)).toBe(`AMC_ERROR=AMC needs Node.js 20 or newer, and the one found on this Mac is Node.js v18.20.0 (${join(oldNode, "node")}). Install a newer Node.js from https://nodejs.org, then click Retry.`);

  writeFileSync(join(box.dir, "stubs", "npm"), "#!/bin/sh\necho 'npm ERR! network' >&2\nexit 1\n", { mode: 0o755 });
  const npmFailed = await box.run("workspace");
  expect(npmFailed.status).toBe(1);
  expect(npmFailed.lines.at(-1)).toBe(`AMC_ERROR=Installing AMC failed: npm could not finish, often because this Mac is offline. Details are in ${join(box.support, "Logs", "studio-launcher.log")}. Check the network connection, then click Retry.`);
  expect(readFileSync(join(box.support, "Logs", "studio-launcher.log"), "utf8")).toContain("npm ERR! network");
});

// 2026-11-14 review: cookies are not port-scoped, so the app must treat only the launcher's exact origin as the console.
test("the app keeps the owner session to the console's own port and drops it on stop and switch", () => {
  const source = readFileSync(appSource, "utf8");
  const isConsole = source.match(/- \(BOOL\)isConsoleURL:\(NSURL \*\)url \{([\s\S]*?)\n\}/)?.[1] ?? "";
  expect(isConsole).toContain("[url.port isEqualToNumber:studio.port]");
  expect(isConsole).toContain("studio != nil");
  expect(source).toContain("- (void)forgetSessionCookieThen:");
  expect(source.match(/forgetSessionCookieThen:\^/g)?.length).toBeGreaterThanOrEqual(2);
});
