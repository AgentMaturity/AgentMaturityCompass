#!/usr/bin/env node
// Post-deploy governed-turn probe. Liveness and readiness are necessary but not
// sufficient: this logs in as the bootstrap owner, runs one stub-provider native
// task with tools "none" through /api/v1/native-tasks, waits for the turn to
// finish and asks Studio to verify the recorded evidence. Only a closed task
// whose verification is externally-anchored (the pinned monitor key admitted it) counts as "verified". Studio's
// "anchored-prefix" (the task's session sealed, a running gateway's session named as unfinalized) is reported
// as the separate status "verified-prefix", never as "verified".
//
//   node governed-turn-probe.mjs --base-url http://amc-amc:3212 \
//     --username-file /run/secrets/amc_owner_username --password-file /run/secrets/amc_owner_password \
//     [--pairing-code-file <path>] [--agent-id default] [--ready-timeout-ms 0] [--timeout-ms 120000] [--out receipt.json]
//
// A workspace in LAN mode (the image and chart default) refuses login until the
// client claims a one-time pairing code (`amc pair create` inside the workspace).
// With --pairing-code-file the probe claims it first; an absent file means no code.
//
// Plain Node (>=20), no npm dependencies, so it runs inside the runtime image.
// Credentials are read from files and never printed. Exit 0 only on "verified" or "verified-prefix".
// Contract: docs/NATIVE_STUDIO_TASKS.md "API clients and hosted workspaces".
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = "/api/v1/native-tasks";
const INTENT = "task-workspace-v1";
// An unanchored "workspace-key-consistency" verdict never counts: an unpinned key does not verify (P0-51).
const VERIFIED = new Set(["externally-anchored"]);
const PREFIX = "anchored-prefix";
const SETTLED = new Set(["idle", "failed", "closed", "released"]);
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

class ProbeFailure extends Error {}

/** Run the probe; never throws. Returns {status: "verified"|"verified-prefix"|"failed", steps, ...}. */
export async function governedTurnProbe(options) {
  const { baseUrl, username, password, pairingCode, agentId = "default", fetchImpl = fetch,
    timeoutMs = 120_000, readyTimeoutMs = 0, pollMs = 500 } = options;
  const origin = new URL(baseUrl).origin;
  const steps = [];
  const result = { kind: "amc.governed-turn-probe/1", status: "failed", failedStep: null, baseUrl: origin, agentId, taskId: null, verification: null, verificationScope: null, steps };
  const deadline = Date.now() + timeoutMs;
  let cookie = "";
  let csrf = "";

  async function call(path, { method = "GET", body } = {}) {
    const headers = { accept: "application/json", connection: "close" };
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    if (method !== "GET" && path.startsWith(API)) Object.assign(headers, { origin, "x-amc-native-intent": INTENT, "x-amc-native-csrf": csrf });
    const response = await fetchImpl(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(30_000, deadline - Date.now()))) });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON bodies are reported by status only */ }
    return { status: response.status, json, headers: response.headers };
  }
  async function step(id, run) {
    try {
      const detail = await run();
      steps.push({ id, status: "passed", ...detail });
    } catch (error) {
      steps.push({ id, status: "failed", detail: error instanceof ProbeFailure ? error.message : `request error: ${error.message}` });
      throw new ProbeFailure(id);
    }
  }
  const expect = (condition, message) => { if (!condition) throw new ProbeFailure(message); };

  try {
    // One ready window for liveness and readiness: a container that is still starting refuses connections.
    const until = Date.now() + readyTimeoutMs;
    await step("healthz", async () => {
      for (;;) {
        let status;
        try { ({ status } = await call("/healthz")); } catch (error) { if (Date.now() >= until) throw error; }
        if (status === 200) return { httpStatus: status };
        expect(status === undefined || Date.now() < until, `GET /healthz answered ${status}`);
        await delay(pollMs);
      }
    });
    await step("readyz", async () => {
      for (;;) {
        const { status, json } = await call("/readyz");
        if (status === 200) return { httpStatus: status };
        if (Date.now() >= until) throw new ProbeFailure(`GET /readyz answered ${status}${json?.reasons ? `: ${JSON.stringify(json.reasons)}` : ""}`);
        await delay(pollMs);
      }
    });
    // pairingCode: a string, or a function that mints one once Studio is ready (the rollback drill).
    if (pairingCode) await step("pair", async () => {
      const code = typeof pairingCode === "function" ? await pairingCode() : pairingCode;
      const { status, headers } = await call("/pair/claim", { method: "POST", body: { code } });
      expect(status === 200, `POST /pair/claim answered ${status}`);
      const paired = (headers.getSetCookie?.() ?? []).find((value) => value.startsWith("amc_pairing="));
      expect(paired, "pair claim set no amc_pairing cookie");
      cookie = paired.split(";")[0];
      return { httpStatus: status };
    });
    await step("login", async () => {
      const { status, headers } = await call("/auth/login", { method: "POST", body: { username, password } });
      expect(status === 200, `POST /auth/login answered ${status}`);
      const session = (headers.getSetCookie?.() ?? []).find((value) => value.startsWith("amc_session="));
      expect(session, "login set no amc_session cookie");
      cookie = session.split(";")[0];
      return { httpStatus: status };
    });
    await step("csrf", async () => {
      const { status, json } = await call("/auth/me");
      expect(status === 200 && /^[a-f0-9]{64}$/.test(json?.nativeCsrfToken ?? ""), `GET /auth/me answered ${status} without a native CSRF token`);
      csrf = json.nativeCsrfToken;
      return { httpStatus: status };
    });
    let admittedAgent = agentId;
    await step("options", async () => {
      const { status, json } = await call(`${API}/options?agentId=${encodeURIComponent(agentId)}`);
      expect(status === 200 && json?.ok, `GET ${API}/options answered ${status}`);
      const data = json.data;
      expect(data.executionBlocked !== true, "workspace is read-only: native execution is blocked");
      expect((data.providers ?? []).some((provider) => provider.id === "stub"), "the stub provider is not admitted");
      admittedAgent = data.agentId ?? agentId;
      return { httpStatus: status, agentId: admittedAgent };
    });
    result.agentId = admittedAgent;
    const query = `agentId=${encodeURIComponent(admittedAgent)}`;
    await step("submit", async () => {
      const body = { clientRequestId: randomUUID(), agentId: admittedAgent, provider: "stub", tools: "none",
        prompt: "AMC post-deploy governed-turn probe.", maxSteps: 1, maxTokens: 64 };
      const { status, json } = await call(API, { method: "POST", body });
      expect(status === 202 && typeof json?.data?.taskId === "string", `POST ${API} answered ${status}${json?.error ? `: ${json.error}` : ""}`);
      result.taskId = json.data.taskId;
      return { httpStatus: status, taskId: result.taskId };
    });
    let task;
    await step("turn", async () => {
      for (;;) {
        const { status, json } = await call(`${API}/${result.taskId}?${query}&cursor=0`);
        expect(status === 200, `GET ${API}/:taskId answered ${status}`);
        task = json.data.task;
        if (SETTLED.has(task.state)) break;
        expect(Date.now() < deadline, `task still ${task.state} at the timeout`);
        await delay(pollMs);
      }
      expect(task.state === "idle", `turn ended in state ${task.state}${task.error ? `: ${task.error}` : ""}`);
      return { state: task.state, revision: task.revision };
    });
    await step("verify", async () => {
      let { status, json } = await call(`${API}/${result.taskId}/verify?${query}`, { method: "POST", body: { expectedRevision: task.revision } });
      expect(status === 200, `POST ${API}/:taskId/verify answered ${status}${json?.error ? `: ${json.error}` : ""}`);
      let view = json.data;
      while (view.state === "verifying") {
        expect(Date.now() < deadline, "verification did not finish before the timeout");
        await delay(pollMs);
        ({ status, json } = await call(`${API}/${result.taskId}?${query}&cursor=0`));
        view = json?.data?.task ?? view;
      }
      result.verification = view.verification;
      // What the verdict covers: "verified-prefix" names the live sessions (a running gateway's) it did not finalize.
      result.verificationScope = view.verificationScope ?? null;
      expect(VERIFIED.has(view.verification) || view.verification === PREFIX, `verification is ${view.verification}${view.error ? `: ${view.error}` : ""}`);
      return { httpStatus: status, state: view.state, verification: view.verification, verificationScope: result.verificationScope };
    });
    result.status = result.verification === PREFIX ? "verified-prefix" : "verified";
  } catch (error) {
    result.status = "failed";
    result.failedStep = error instanceof ProbeFailure ? error.message : "probe";
  }
  return result;
}

function parseArgs(argv) {
  const known = ["base-url", "username-file", "password-file", "pairing-code-file", "agent-id", "ready-timeout-ms", "timeout-ms", "out"];
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!known.includes(key) || argv[i + 1] === undefined) throw new Error(`unknown or incomplete option ${argv[i]}`);
    args[key] = argv[i + 1];
  }
  for (const key of ["base-url", "username-file", "password-file"]) if (!args[key]) throw new Error(`--${key} is required`);
  return args;
}

// realpath: Kubernetes mounts ConfigMap files as symlinks, and import.meta.url names the resolved file.
const invokedDirectly = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`governed-turn-probe: ${error.message}`);
    process.exit(2);
  }
  const secret = (path) => readFileSync(path, "utf8").replace(/\r?\n$/, "");
  const result = await governedTurnProbe({
    baseUrl: args["base-url"], username: secret(args["username-file"]), password: secret(args["password-file"]),
    pairingCode: args["pairing-code-file"] && existsSync(args["pairing-code-file"]) ? secret(args["pairing-code-file"]) : undefined,
    agentId: args["agent-id"] ?? "default", readyTimeoutMs: Number(args["ready-timeout-ms"] ?? 0), timeoutMs: Number(args["timeout-ms"] ?? 120_000)
  });
  const text = JSON.stringify(result, null, 2);
  if (args.out) writeFileSync(args.out, `${text}\n`);
  console.log(text);
  // Exit 0 for both; the printed status says which (a helm test log shows "verified-prefix" explicitly).
  process.exit(result.status === "verified" || result.status === "verified-prefix" ? 0 : 1);
}
