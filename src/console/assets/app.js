import { apiGet, apiPost, getAdminToken, getCurrentUser, login, logout, setAdminToken, whoami } from "./api.js";
import { renderBars, renderLine } from "./charts.js";
import { renderQrLike } from "./qr.js";
import { renderPluginTable } from "./components/pluginTable.js";
import { renderPluginDetail } from "./components/pluginDetail.js";
import { renderRegistryManager } from "./components/registryManager.js";
import { renderPluginDiff } from "./components/pluginDiff.js";
import { renderTrustPage } from "./trust.js";
import { renderForecastScopePage } from "./forecast.js";
import { renderAdvisoriesPage } from "./advisories.js";
import { renderPortfolioForecastPage } from "./portfolioForecast.js";
import { renderCompassPage } from "./compass.js";
import { renderContextGraphPage } from "./contextGraph.js";
import { renderDiagnosticViewPage } from "./diagnosticView.js";
import { renderNorthstarPage } from "./northstar.js";
import { renderAssurancePage } from "./assurance.js";
import { renderAssuranceRunPage } from "./assuranceRun.js";
import { renderAssuranceCertPage } from "./assuranceCert.js";
import { renderAuditPage } from "./audit.js";
import { renderAuditBinderPage } from "./auditBinder.js";
import { renderAuditRequestsPage } from "./auditRequests.js";
import { renderValuePage } from "./value.js";
import { renderValueAgentPage } from "./valueAgent.js";
import { renderValueKpisPage } from "./valueKpis.js";
import { renderPassportPage } from "./passport.js";
import { renderStandardPage } from "./standard.js";

const page = document.body.dataset.page || "home";
const root = document.getElementById("app");
const statusEl = document.getElementById("status");
const bannerEl = document.getElementById("ucBanner");
const OFFLINE_BANNER_ID = "offlineBanner";

function workspacePrefixFromPath() {
  const path = window.location.pathname || "/";
  const match = path.match(/^\/w\/([^/]+)/);
  if (!match) {
    return "";
  }
  return `/w/${match[1]}`;
}

function consoleBasePath() {
  return `${workspacePrefixFromPath()}/console`;
}

function withConsolePath(path) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${consoleBasePath()}${suffix}`;
}

function orgEventsPath() {
  const prefix = workspacePrefixFromPath();
  return prefix ? `${prefix}/events/org` : "/events/org";
}

function qs(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function currentAgent() {
  return qs("agent") || "default";
}

function setStatus(text, bad = false) {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = text;
  statusEl.className = bad ? "status-bad" : "status-ok";
}

function errText(error) {
  if (!error) {
    return "Unknown error";
  }
  return typeof error.message === "string" ? error.message : String(error);
}

function htmlEscape(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function card(title, body) {
  return `<section class="card"><h3>${htmlEscape(title)}</h3>${body}</section>`;
}

function renderOfflineBanner(offline) {
  let node = document.getElementById(OFFLINE_BANNER_ID);
  if (!offline) {
    if (node) {
      node.remove();
    }
    return;
  }
  if (!node) {
    node = document.createElement("div");
    node.id = OFFLINE_BANNER_ID;
    node.className = "card status-bad";
    node.textContent = "OFFLINE MODE: showing last-known read-only snapshot.";
    const main = document.querySelector("main");
    if (main) {
      main.prepend(node);
    }
  }
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const entries = Object.entries(value)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
  return `{${entries.join(",")}}`;
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const parts = [];
  for (const byte of new Uint8Array(digest)) {
    parts.push(byte.toString(16).padStart(2, "0"));
  }
  return parts.join("");
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function pemToSpkiBytes(pem) {
  const b64 = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replaceAll(/\s+/g, "");
  return base64ToBytes(b64).buffer;
}

async function verifySealSignatureClientSide(raw) {
  if (!raw?.seal || !raw?.sig || !raw?.auditorPub) {
    return { ok: false, reason: "missing seal/sig/pubkey" };
  }
  if (!crypto?.subtle?.importKey) {
    return { ok: false, reason: "WebCrypto unavailable" };
  }
  try {
    const sealText = JSON.stringify(raw.seal);
    const digestHex = await sha256Hex(sealText);
    if (digestHex !== raw.sig.digestSha256) {
      return { ok: false, reason: "seal digest mismatch" };
    }
    const key = await crypto.subtle.importKey("spki", pemToSpkiBytes(raw.auditorPub), { name: "Ed25519" }, false, ["verify"]);
    const verified = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      base64ToBytes(raw.sig.signature),
      Uint8Array.from(digestHex.match(/.{1,2}/g).map((h) => Number.parseInt(h, 16)))
    );
    return { ok: verified, reason: verified ? null : "signature verification failed" };
  } catch (error) {
    return { ok: false, reason: errText(error) };
  }
}

async function verifyTransparencyClientSide(raw) {
  const errors = [];
  let prev = "";
  for (const entry of raw.entries || []) {
    if (entry.prev !== prev) {
      errors.push(`chain mismatch at ${entry.hash}`);
    }
    const expected = await sha256Hex(
      canonicalize({
        v: 1,
        ts: entry.ts,
        type: entry.type,
        agentId: entry.agentId,
        artifact: entry.artifact,
        prev: entry.prev
      })
    );
    if (expected !== entry.hash) {
      errors.push(`hash mismatch at ${entry.hash}`);
    }
    prev = entry.hash;
  }
  if (raw.seal && raw.seal.lastHash !== prev) {
    errors.push("seal lastHash mismatch");
  }
  const sig = await verifySealSignatureClientSide(raw);
  if (!sig.ok) {
    errors.push(`seal signature check failed: ${sig.reason || "unknown"}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    signatureVerified: sig.ok
  };
}

async function refreshUnifiedBanner() {
  if (!bannerEl) {
    return;
  }
  try {
    const status = await apiGet("/status");
    const transparency = await apiGet("/transparency/verify");
    const agentId = currentAgent();
    let integrity = null;
    let trustLabel = "N/A";
    const agentStatus = await apiGet(`/agents/${encodeURIComponent(agentId)}/status`).catch(() => null);
    if (agentStatus?.latestRun?.runId) {
      const report = await apiGet(`/runs/${encodeURIComponent(agentStatus.latestRun.runId)}/report`).catch(() => null);
      if (report) {
        integrity = Number(report.integrityIndex || 0);
        trustLabel = String(report.trustLabel || "N/A");
      }
    }
    const freezes = Array.isArray(status?.studio?.activeFreezes) ? status.studio.activeFreezes.length : 0;
    const trustMode = status?.trust?.mode || "UNKNOWN";
    const trustOk = status?.trust?.ok === true;
    bannerEl.innerHTML = `
      <strong>Unified Clarity</strong>
      <div class="row wrap">
        <span><strong>Agent:</strong> ${htmlEscape(agentId)}</span>
        <span><strong>Trust:</strong> ${htmlEscape(trustLabel)}</span>
        <span><strong>Integrity:</strong> ${integrity === null ? "N/A" : integrity.toFixed(3)}</span>
        <span><strong>Active freezes:</strong> ${freezes}</span>
        <span><strong>Config:</strong> ${status.readOnlyMode ? "UNTRUSTED CONFIG (READ-ONLY)" : "SIGNED"}</span>
        <span><strong>Trust:</strong> ${htmlEscape(`${trustMode}${trustMode === "NOTARY" ? trustOk ? " (OK)" : " (BROKEN)" : ""}`)}</span>
        <span><strong>Transparency:</strong> ${transparency.ok ? "OK" : "BROKEN"}</span>
      </div>
    `;
  } catch {
    try {
      const snapshot = await fetch(withConsolePath("/snapshot")).then((res) => res.json());
      bannerEl.innerHTML = `
        <strong>Unified Clarity (Offline Snapshot)</strong>
        <div class="row wrap">
          <span><strong>Studio:</strong> ${snapshot?.studio?.running ? "RUNNING" : "STOPPED"}</span>
          <span><strong>Current agent:</strong> ${htmlEscape(snapshot?.studio?.currentAgent || "default")}</span>
        </div>
      `;
    } catch {
      bannerEl.innerHTML = `<strong>Unified Clarity</strong> <span class="muted">Unavailable.</span>`;
    }
  }
}

async function ensureAuthenticated() {
  const me = await whoami();
  if (me) {
    return true;
  }
  if (getAdminToken()) {
    try {
      await apiGet("/status");
      return true;
    } catch {
      setAdminToken(null);
    }
  }
  return false;
}

function renderAuthScreen() {
  if (!root) {
    return;
  }
  root.innerHTML = `
    <div class="card">
      <h2>Compass Console Login</h2>
      <p class="muted">Login with username/password. Admin token fallback is available for emergency CLI access.</p>
      <div class="row wrap">
        <input id="loginUser" placeholder="username" />
        <input id="loginPass" type="password" placeholder="password" />
      </div>
      <div class="row wrap">
        <input id="pairCode" placeholder="pairing code (LAN mode only)" />
        <button id="loginBtn">Login</button>
      </div>
      <details>
        <summary>Emergency: use admin token</summary>
        <div class="row wrap">
          <input id="adminTokenInput" type="password" placeholder="x-amc-admin-token" />
          <button id="adminTokenBtn" class="secondary">Use Admin Token</button>
        </div>
      </details>
      <div class="row wrap">
        <button id="pairCodeCreateBtn" class="secondary">Create Pairing Code</button>
        <span class="muted">OWNER role required</span>
      </div>
      <pre id="authOut" class="muted"></pre>
      <div id="pairQr" class="card"></div>
    </div>
  `;
  const qr = document.getElementById("pairQr");
  if (qr) {
    renderQrLike(qr, `${window.location.origin}${withConsolePath("/login")}`);
  }
  document.getElementById("loginBtn")?.addEventListener("click", async () => {
    const username = document.getElementById("loginUser")?.value || "";
    const password = document.getElementById("loginPass")?.value || "";
    const pairingCode = document.getElementById("pairCode")?.value || "";
    try {
      await login({
        username: username.trim(),
        password,
        pairingCode: pairingCode.trim() || undefined
      });
      setStatus("Login successful.");
      await renderPage();
    } catch (error) {
      setStatus(`Login failed: ${errText(error)}`, true);
    }
  });
  document.getElementById("adminTokenBtn")?.addEventListener("click", async () => {
    const token = document.getElementById("adminTokenInput")?.value || "";
    setAdminToken(token.trim());
    try {
      await apiGet("/status");
      setStatus("Admin token accepted.");
      await renderPage();
    } catch (error) {
      setStatus(`Admin token rejected: ${errText(error)}`, true);
    }
  });
  document.getElementById("pairCodeCreateBtn")?.addEventListener("click", async () => {
    const out = document.getElementById("authOut");
    try {
      const created = await apiPost("/pair/create", { ttlSeconds: 600 });
      if (out) {
        out.textContent = `Pairing code: ${created.code}\nExpires: ${new Date(created.expiresTs).toISOString()}`;
      }
    } catch (error) {
      if (out) {
        out.textContent = `Pairing code creation failed: ${errText(error)}`;
      }
    }
  });
}

async function renderHome() {
  const status = await apiGet("/status");
  const agentsResp = await apiGet("/agents");
  const benchmarkStats = await apiGet("/benchmarks/stats").catch(() => ({ count: 0, groups: [], scatter: [] }));
  const agents = agentsResp.agents || [];
  const activeFreezes = Array.isArray(status.studio?.activeFreezes) ? status.studio.activeFreezes.length : 0;
  root.innerHTML = `
    ${card("Studio Status", `
      <div class="grid">
        <div><div class="muted">Gateway</div><div class="tile-value">${status.studio?.gatewayPort || "-"}</div></div>
        <div><div class="muted">Proxy</div><div class="tile-value">${status.studio?.proxyPort || "-"}</div></div>
        <div><div class="muted">ToolHub/API</div><div class="tile-value">${status.studio?.apiPort || "-"}</div></div>
        <div><div class="muted">Vault</div><div class="tile-value">${status.vaultLocked ? "LOCKED" : "UNLOCKED"}</div></div>
      </div>
    `)}
    ${card("Fleet Summary", `
      <div class="grid">
        <div><div class="muted">Agents</div><div class="tile-value">${agents.length}</div></div>
        <div><div class="muted">Active Freezes</div><div class="tile-value">${activeFreezes}</div></div>
        <div><div class="muted">Benchmarks</div><div class="tile-value">${benchmarkStats.count || 0}</div></div>
        <div><div class="muted">Current Agent</div><div class="tile-value">${status.studio?.currentAgent || "-"}</div></div>
      </div>
    `)}
    <div class="grid">
      ${card("Overall Trend", `<canvas id="overallTrend" width="360" height="140"></canvas>`)}
      ${card("Integrity Trend", `<canvas id="integrityTrend" width="360" height="140"></canvas>`)}
    </div>
  `;
  const agentId = status.studio?.currentAgent || "default";
  const agentStatus = await apiGet(`/agents/${encodeURIComponent(agentId)}/status`).catch(() => ({ latestRun: null }));
  const latestRun = agentStatus.latestRun;
  renderLine(document.getElementById("overallTrend"), latestRun ? [latestRun.integrityIndex, latestRun.integrityIndex] : [0]);
  renderLine(document.getElementById("integrityTrend"), latestRun ? [latestRun.integrityIndex, latestRun.integrityIndex] : [0], "#7c3aed");
}

async function renderAgent() {
  const agentId = currentAgent();
  const row = await apiGet(`/agents/${encodeURIComponent(agentId)}/status`);
  let report = null;
  if (row.latestRun?.runId) {
    report = await apiGet(`/runs/${encodeURIComponent(row.latestRun.runId)}/report`);
  }
  root.innerHTML = `
    ${card(`Agent ${agentId}`, report
      ? `
      <p>Overall: <strong>${((report.layerScores || []).reduce((s, x) => s + x.avgFinalLevel, 0) / Math.max(1, (report.layerScores || []).length)).toFixed(3)}</strong></p>
      <p>IntegrityIndex: <strong>${Number(report.integrityIndex || 0).toFixed(3)}</strong> (${report.trustLabel})</p>
      <p>Evidence Coverage: ${(Number(report.evidenceCoverage || 0) * 100).toFixed(1)}%</p>
      <canvas id="layerBars" width="520" height="170"></canvas>
      `
      : "<p class='muted'>No run found.</p>"
    )}
  `;
  if (report) {
    renderBars(document.getElementById("layerBars"), (report.layerScores || []).map((rowItem) => rowItem.avgFinalLevel), "#0f766e");
  }
}

async function renderEqualizer() {
  const agentId = currentAgent();
  const targetResp = await apiGet(`/agents/${encodeURIComponent(agentId)}/targets`);
  const rows = targetResp.questions || [];
  root.innerHTML = `
    ${card(`Equalizer What-If (${agentId})`, `
      <p class="muted">Tune 67 sliders and preview policy impact before signing target.</p>
      <div id="sliderList" class="scroll" style="max-height:420px;"></div>
      <div class="row">
        <button id="whatifBtn">Preview What-If</button>
        <button id="applyBtn">Apply & Sign</button>
      </div>
      <pre id="whatifOut" class="card muted"></pre>
    `)}
  `;
  const list = document.getElementById("sliderList");
  list.innerHTML = rows.map((row) => `
    <div class="card">
      <div class="row spaced"><strong>${row.questionId}</strong><span>${row.title}</span></div>
      <div class="row">
        <input type="range" min="0" max="5" step="1" value="${row.target}" data-qid="${row.questionId}" />
        <span>${row.target}</span>
      </div>
      <small class="muted">Current: ${row.current} | Effective: ${row.effective}</small>
    </div>
  `).join("");
  list.querySelectorAll("input[type=range]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const el = event.currentTarget;
      const span = el.parentElement.querySelector("span");
      span.textContent = el.value;
    });
  });
  const gather = () => {
    const target = {};
    list.querySelectorAll("input[type=range]").forEach((input) => {
      target[input.dataset.qid] = Number(input.value);
    });
    return target;
  };
  document.getElementById("whatifBtn")?.addEventListener("click", async () => {
    const out = await apiPost(`/agents/${encodeURIComponent(agentId)}/targets/whatif`, { mapping: gather() });
    document.getElementById("whatifOut").textContent = JSON.stringify(out.summary, null, 2);
  });
  document.getElementById("applyBtn")?.addEventListener("click", async () => {
    const out = await apiPost(`/agents/${encodeURIComponent(agentId)}/targets/apply`, { mapping: gather() });
    document.getElementById("whatifOut").textContent = JSON.stringify(out, null, 2);
  });
}

async function renderApprovals() {
  const agentId = currentAgent();
  const data = await apiGet(`/approvals/requests?agentId=${encodeURIComponent(agentId)}&status=PENDING`);
  const rows = data.requests || [];
  root.innerHTML = `
    ${card("Approvals Inbox", `
      <p class="muted">Pending approvals with quorum progress.</p>
      <div class="scroll"><table><thead><tr><th>Request</th><th>Intent</th><th>Action</th><th>Quorum</th><th>Decisions</th><th>Decision</th></tr></thead><tbody id="apprRows"></tbody></table></div>
    `)}
  `;
  const body = document.getElementById("apprRows");
  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.approvalRequestId}</td>
      <td>${row.intentId}</td>
      <td>${row.actionClass}</td>
      <td>${row.quorum?.received || 0}/${row.quorum?.required || 0} (${row.quorum?.status || "PENDING"})</td>
      <td>${(row.decisions || []).map((d) => `${d.username}:${d.decision}`).join(", ") || "-"}</td>
      <td>
        <div class="row">
          <button data-approve="${row.approvalRequestId}">Approve</button>
          <button class="secondary" data-sim="${row.approvalRequestId}">Simulate</button>
          <button class="danger" data-deny="${row.approvalRequestId}">Deny</button>
        </div>
      </td>
    </tr>
  `).join("");
  body.querySelectorAll("button[data-approve]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-approve");
      const reason = window.prompt("Reason for EXECUTE approval:", "Approved execute");
      if (!reason) return;
      await apiPost(`/approvals/requests/${encodeURIComponent(id)}/decide`, {
        decision: "APPROVE_EXECUTE",
        reason
      });
      await renderApprovals();
    });
  });
  body.querySelectorAll("button[data-sim]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-sim");
      const reason = window.prompt("Reason for SIMULATE approval:", "Approved simulate");
      if (!reason) return;
      await apiPost(`/approvals/requests/${encodeURIComponent(id)}/decide`, {
        decision: "APPROVE_SIMULATE",
        reason
      });
      await renderApprovals();
    });
  });
  body.querySelectorAll("button[data-deny]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-deny");
      const reason = window.prompt("Reason for denial:", "Denied");
      if (!reason) return;
      await apiPost(`/approvals/requests/${encodeURIComponent(id)}/decide`, {
        decision: "DENY",
        reason
      });
      await renderApprovals();
    });
  });
}

async function renderUsers() {
  const users = await apiGet("/users");
  root.innerHTML = `
    ${card("Users", `
      <div class="scroll"><table><thead><tr><th>Username</th><th>Roles</th><th>Status</th><th>Actions</th></tr></thead><tbody id="userRows"></tbody></table></div>
      <h4>Add User</h4>
      <div class="row wrap">
        <input id="addUserName" placeholder="username" />
        <input id="addUserPass" type="password" placeholder="password" />
        <input id="addUserRoles" placeholder="roles CSV (e.g. APPROVER,VIEWER)" />
        <button id="addUserBtn">Add</button>
      </div>
      <pre id="usersOut" class="muted"></pre>
    `)}
  `;
  const body = document.getElementById("userRows");
  body.innerHTML = (users.users || []).map((row) => `
    <tr>
      <td>${row.username}</td>
      <td>${row.roles.join(",")}</td>
      <td>${row.status}</td>
      <td>
        <div class="row">
          <button class="secondary" data-role="${row.username}">Set Roles</button>
          <button class="danger" data-revoke="${row.username}">Revoke</button>
        </div>
      </td>
    </tr>
  `).join("");
  body.querySelectorAll("button[data-revoke]").forEach((button) => {
    button.addEventListener("click", async () => {
      const username = button.getAttribute("data-revoke");
      await apiPost("/users/revoke", { username });
      await renderUsers();
    });
  });
  body.querySelectorAll("button[data-role]").forEach((button) => {
    button.addEventListener("click", async () => {
      const username = button.getAttribute("data-role");
      const roles = window.prompt("Enter roles CSV:", "VIEWER");
      if (!roles) return;
      await apiPost("/users/roles", {
        username,
        roles: roles
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      });
      await renderUsers();
    });
  });
  document.getElementById("addUserBtn")?.addEventListener("click", async () => {
    const username = document.getElementById("addUserName")?.value || "";
    const password = document.getElementById("addUserPass")?.value || "";
    const roles = document.getElementById("addUserRoles")?.value || "";
    const out = document.getElementById("usersOut");
    try {
      await apiPost("/users/add", {
        username,
        password,
        roles: roles
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      });
      if (out) out.textContent = "User added.";
      await renderUsers();
    } catch (error) {
      if (out) out.textContent = errText(error);
    }
  });
}

async function renderTransparency() {
  const serverVerify = await apiGet("/transparency/verify");
  const raw = await apiGet("/transparency/raw?n=100");
  const merkleVerify = await apiGet("/transparency/merkle/verify").catch(() => null);
  const merkleRoot = await apiGet("/transparency/merkle/root").catch(() => null);
  const clientVerify = await verifyTransparencyClientSide(raw);
  root.innerHTML = `
    ${card("Transparency Verify", `
      <p>Server verify: <strong>${serverVerify.ok ? "OK" : "FAILED"}</strong></p>
      <p>Client verify: <strong>${clientVerify.ok ? "OK" : "FAILED"}</strong></p>
      <p>Client seal signature: <strong>${clientVerify.signatureVerified ? "VERIFIED" : "FAILED"}</strong></p>
      <pre class="scroll">${JSON.stringify({ serverVerify, clientVerify }, null, 2)}</pre>
    `)}
    ${card("Merkle Root", `
      <p>Merkle verify: <strong>${merkleVerify?.ok ? "OK" : "FAILED"}</strong></p>
      <p>Current root: <code>${htmlEscape(merkleRoot?.current?.root || "n/a")}</code></p>
      <p>Leaf count: ${Number(merkleRoot?.current?.leafCount || 0)}</p>
      <pre class="scroll">${JSON.stringify(merkleRoot?.history || [], null, 2)}</pre>
    `)}
    ${card("Last 100 Entries", `<pre class="scroll">${JSON.stringify(raw.entries || [], null, 2)}</pre>`)}
  `;
}

async function renderPolicyPacks() {
  const packs = await apiGet("/policy-packs/list");
  root.innerHTML = `
    ${card("Policy Packs", `
      <div id="packRows" class="scroll"></div>
      <pre id="packOut" class="muted"></pre>
    `)}
  `;
  const rows = document.getElementById("packRows");
  rows.innerHTML = (packs.packs || [])
    .map(
      (pack) => `
      <div class="card">
        <div class="row spaced"><strong>${pack.id}</strong><span>${pack.riskTier}</span></div>
        <p class="muted">${pack.description}</p>
        <div class="row">
          <button data-describe="${pack.id}" class="secondary">Describe</button>
          <button data-diff="${pack.id}" class="secondary">Diff</button>
          <button data-apply="${pack.id}">Apply</button>
        </div>
      </div>
    `
    )
    .join("");
  const out = document.getElementById("packOut");
  rows.querySelectorAll("button[data-describe]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-describe");
      const desc = await apiGet(`/policy-packs/${encodeURIComponent(id)}`);
      out.textContent = JSON.stringify(desc, null, 2);
    });
  });
  rows.querySelectorAll("button[data-diff]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-diff");
      const diff = await apiPost(`/policy-packs/${encodeURIComponent(id)}/diff`, {
        agentId: currentAgent()
      });
      out.textContent = JSON.stringify(diff, null, 2);
    });
  });
  rows.querySelectorAll("button[data-apply]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-apply");
      if (!window.confirm(`Apply policy pack ${id}?`)) {
        return;
      }
      const applied = await apiPost(`/policy-packs/${encodeURIComponent(id)}/apply`, {
        agentId: currentAgent(),
        confirm: true
      });
      out.textContent = JSON.stringify(applied, null, 2);
      await refreshUnifiedBanner();
    });
  });
}

async function renderCompliance() {
  const frameworks = ["SOC2", "NIST_AI_RMF", "ISO_27001"];
  const framework = frameworks.includes(qs("framework")) ? qs("framework") : "SOC2";
  const agentId = currentAgent();
  const verify = await apiGet("/compliance/verify").catch(() => ({ valid: false, reason: "unavailable" }));
  const report = await apiGet(
    `/compliance/report?agentId=${encodeURIComponent(agentId)}&framework=${encodeURIComponent(framework)}&window=14d`
  );
  const fleet = await apiGet(`/compliance/fleet?framework=${encodeURIComponent(framework)}&window=30d`).catch(() => null);
  root.innerHTML = `
    ${card("Compliance Coverage", `
      <div class="row wrap">
        ${frameworks
          .map((item) => `<a class="pill" href="./compliance?agent=${encodeURIComponent(agentId)}&framework=${encodeURIComponent(item)}">${item}</a>`)
          .join("")}
      </div>
      <p>Config signature: <strong>${verify.valid ? "VALID" : "INVALID"}</strong></p>
      <p>Coverage score: <strong>${Number(report.coverage?.score || 0).toFixed(3)}</strong></p>
      <p>Trust coverage (OBS/ATT/SELF): ${((report.trustTierCoverage?.observed || 0) * 100).toFixed(1)}% /
      ${((report.trustTierCoverage?.attested || 0) * 100).toFixed(1)}% /
      ${((report.trustTierCoverage?.selfReported || 0) * 100).toFixed(1)}%</p>
      <pre class="scroll">${JSON.stringify(report.categories || [], null, 2)}</pre>
    `)}
    ${card("Fleet Compliance Summary", `<pre class="scroll">${JSON.stringify(fleet || {}, null, 2)}</pre>`)}
  `;
}

async function renderIntegrations() {
  const status = await apiGet("/integrations/status");
  root.innerHTML = `
    ${card("Integration Hub", `
      <p>Signature: <strong>${status.signature?.valid ? "VALID" : "INVALID"}</strong></p>
      <div class="row wrap">
        <button id="integrationTestBtn">Dispatch Test Event</button>
      </div>
      <pre id="integrationOut" class="scroll">${JSON.stringify(status.status || status, null, 2)}</pre>
    `)}
  `;
  document.getElementById("integrationTestBtn")?.addEventListener("click", async () => {
    const out = await apiPost("/integrations/test", {});
    document.getElementById("integrationOut").textContent = JSON.stringify(out, null, 2);
  });
}

async function renderOutcomes() {
  const agentId = currentAgent();
  const verify = await apiGet(`/outcomes/verify?agentId=${encodeURIComponent(agentId)}`).catch(() => ({
    valid: false,
    reason: "unavailable"
  }));
  const reportEnvelope = await apiGet(`/outcomes/report?agentId=${encodeURIComponent(agentId)}&window=14d`);
  const history = await apiGet(`/outcomes/history?agentId=${encodeURIComponent(agentId)}&limit=12`).catch(() => ({ rows: [] }));
  const report = reportEnvelope.report || {};
  const metricRows = Array.isArray(report.metrics) ? report.metrics : [];
  const unsatisfiedChecklist = metricRows
    .filter((row) => row.status !== "SATISFIED")
    .flatMap((row) => (Array.isArray(row.checklist) ? row.checklist.map((item) => `${row.metricId}: ${item}`) : []))
    .slice(0, 12);
  root.innerHTML = `
    ${card("Outcome Contract + Value Summary", `
      <p>Contract signature: <strong>${verify.valid ? "VALID" : "INVALID"}</strong>${verify.reason ? ` (${verify.reason})` : ""}</p>
      <div class="grid">
        <div><div class="muted">ValueScore</div><div class="tile-value">${Number(report.valueScore || 0).toFixed(2)}</div></div>
        <div><div class="muted">EconomicSignificanceIndex</div><div class="tile-value">${Number(report.economicSignificanceIndex || 0).toFixed(2)}</div></div>
        <div><div class="muted">ValueRegressionRisk</div><div class="tile-value">${Number(report.valueRegressionRisk || 0).toFixed(2)}</div></div>
        <div><div class="muted">Observed Coverage</div><div class="tile-value">${(Number(report.observedCoverageRatio || 0) * 100).toFixed(1)}%</div></div>
      </div>
      <canvas id="outcomeTrend" width="640" height="160"></canvas>
    `)}
    ${card("Category Scores", `
      <pre class="scroll">${JSON.stringify(report.categoryScores || {}, null, 2)}</pre>
    `)}
    ${card("Metric Status", `
      <div class="scroll"><table><thead><tr><th>Metric</th><th>Category</th><th>Status</th><th>Value</th><th>Sample</th><th>Trust Coverage</th><th>Evidence Refs</th></tr></thead>
      <tbody>
      ${metricRows
        .map(
          (row) => `<tr>
            <td>${htmlEscape(row.metricId || "-")}</td>
            <td>${htmlEscape(row.category || "-")}</td>
            <td>${htmlEscape(row.status || "UNKNOWN")}</td>
            <td>${htmlEscape(String(row.measuredValue ?? "-"))}</td>
            <td>${Number(row.sampleSize || 0)}</td>
            <td>obs=${Number(row.trustCoverage?.observed || 0).toFixed(2)} att=${Number(row.trustCoverage?.attested || 0).toFixed(2)} self=${Number(row.trustCoverage?.selfReported || 0).toFixed(2)}</td>
            <td>${htmlEscape((row.evidenceRefs || []).slice(0, 4).join(", ") || "-")}</td>
          </tr>`
        )
        .join("")}
      </tbody></table></div>
    `)}
    ${card("What Would Make This SATISFIED?", `
      <ul class="list">${unsatisfiedChecklist.map((item) => `<li>${htmlEscape(item)}</li>`).join("") || "<li>All tracked metrics are SATISFIED.</li>"}</ul>
    `)}
    ${card("Report Metadata", `
      <pre class="scroll">${JSON.stringify({
        reportId: report.reportId,
        trustLabel: report.trustLabel,
        nonClaims: report.nonClaims || [],
        history: history.rows || []
      }, null, 2)}</pre>
    `)}
  `;
  const trendRows = Array.isArray(history.rows) ? history.rows : [];
  const values = trendRows.length > 0 ? trendRows.map((row) => Number(row.valueScore || 0)) : [Number(report.valueScore || 0)];
  renderLine(document.getElementById("outcomeTrend"), values, "#0ea5e9");
}

async function renderExperiments() {
  const agentId = currentAgent();
  const listed = await apiGet(`/experiments/list?agentId=${encodeURIComponent(agentId)}`).catch(() => ({ experiments: [] }));
  const history = await apiGet(`/experiments/history?agentId=${encodeURIComponent(agentId)}`).catch(() => ({ rows: [] }));
  const rows = Array.isArray(history.rows) ? history.rows : [];
  root.innerHTML = `
    ${card("Experiments", `
      <p class="muted">Deterministic baseline vs candidate comparisons for release readiness.</p>
      <div class="row wrap">
        <button id="expCreateBtn">Create Experiment</button>
        <button id="expRefreshBtn" class="secondary">Refresh</button>
      </div>
      <div class="scroll"><table><thead><tr><th>ID</th><th>Name</th><th>Casebook</th><th>Uplift Success</th><th>Uplift Value</th><th>Cost Ratio</th><th>Verdict</th><th>Actions</th></tr></thead><tbody id="expRows"></tbody></table></div>
      <pre id="expOut" class="muted"></pre>
    `)}
    ${card("Experiment Registry", `<pre class="scroll">${JSON.stringify(listed.experiments || listed, null, 2)}</pre>`)}
  `;
  const tbody = document.getElementById("expRows");
  tbody.innerHTML = rows
    .map((row) => {
      const latest = row.latestRun || {};
      const upliftSuccess = Number(latest.upliftSuccessRate || 0);
      const upliftValue = Number(latest.upliftValuePoints || 0);
      const baselineCost = Number(latest.baselineCostPerSuccess || 0);
      const candidateCost = Number(latest.candidateCostPerSuccess || 0);
      const costRatio = baselineCost > 0 ? candidateCost / baselineCost : 0;
      const verdict = upliftSuccess > 0 && upliftValue > 0 ? "READY" : "NOT READY";
      return `<tr>
        <td>${htmlEscape(row.experimentId)}</td>
        <td>${htmlEscape(row.name)}</td>
        <td>${htmlEscape(row.casebookId)}</td>
        <td>${upliftSuccess.toFixed(4)}</td>
        <td>${upliftValue.toFixed(4)}</td>
        <td>${costRatio.toFixed(4)}</td>
        <td><strong>${verdict}</strong></td>
        <td>
          <div class="row">
            <button data-run="${row.experimentId}">Run</button>
            <button class="secondary" data-analyze="${row.experimentId}">Analyze</button>
            <button class="secondary" data-gate="${row.experimentId}">Gate</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
  const out = document.getElementById("expOut");
  document.getElementById("expCreateBtn")?.addEventListener("click", async () => {
    const name = window.prompt("Experiment name:", "candidate-vs-baseline");
    if (!name) return;
    const casebookId = window.prompt("Casebook ID:", "default");
    if (!casebookId) return;
    const created = await apiPost("/experiments/create", { agentId, name, casebookId });
    out.textContent = JSON.stringify(created, null, 2);
  });
  document.getElementById("expRefreshBtn")?.addEventListener("click", async () => {
    await renderExperiments();
  });
  tbody.querySelectorAll("button[data-run]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-run");
      const mode = window.prompt("Mode (sandbox|supervise):", "sandbox") || "sandbox";
      const run = await apiPost(`/experiments/${encodeURIComponent(id)}/run`, { agentId, mode });
      out.textContent = JSON.stringify(run, null, 2);
      await renderExperiments();
    });
  });
  tbody.querySelectorAll("button[data-analyze]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-analyze");
      const analyzed = await apiGet(`/experiments/${encodeURIComponent(id)}/analyze?agentId=${encodeURIComponent(agentId)}`);
      out.textContent = JSON.stringify(analyzed, null, 2);
    });
  });
  tbody.querySelectorAll("button[data-gate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-gate");
      const policyPath =
        window.prompt("Experiment gate policy path:", `.amc/agents/${agentId}/experimentGate.json`) ||
        `.amc/agents/${agentId}/experimentGate.json`;
      const gated = await apiPost(`/experiments/${encodeURIComponent(id)}/gate`, { agentId, policyPath });
      out.textContent = JSON.stringify(gated, null, 2);
    });
  });
}

let orgEventStream = null;
function subscribeOrgSse(onUpdate) {
  if (orgEventStream || typeof EventSource === "undefined") {
    return;
  }
  try {
    orgEventStream = new EventSource(orgEventsPath(), { withCredentials: true });
    const handler = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        window.__amcOrgSseVersion = Number(window.__amcOrgSseVersion || 0) + 1;
        window.__amcOrgSseLastEvent = payload.type || "UNKNOWN";
        if (typeof onUpdate === "function") {
          onUpdate(payload);
        }
      } catch {
        // ignore malformed events
      }
    };
    [
      "ORG_SCORECARD_UPDATED",
      "AGENT_RUN_COMPLETED",
      "ASSURANCE_RUN_COMPLETED",
      "OUTCOMES_UPDATED",
      "FORECAST_UPDATED",
      "ADVISORY_CREATED",
      "ADVISORY_ACKNOWLEDGED",
      "VALUE_UPDATED",
      "VALUE_REGRESSION_DETECTED",
      "VALUE_EVIDENCE_INSUFFICIENT",
      "DRIFT_DETECTED",
      "ANOMALY_DETECTED",
      "INCIDENT_CREATED",
      "FREEZE_APPLIED",
      "FREEZE_LIFTED",
      "POLICY_PACK_APPLIED",
      "BENCHMARK_INGESTED",
      "FEDERATION_IMPORTED"
    ].forEach((type) => orgEventStream.addEventListener(type, handler));
  } catch {
    // Ignore SSE setup errors.
  }
}

function topRows(rows, n) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, n);
}

async function loadLatestOrgScorecard() {
  const existing = await apiGet("/org/scorecards/latest").catch(() => null);
  if (existing) {
    return existing;
  }
  const recomputed = await apiPost("/org/scorecards/recompute", { window: "14d" }).catch(() => null);
  return recomputed?.scorecard || null;
}

async function renderOrg() {
  const scorecard = await loadLatestOrgScorecard();
  if (!scorecard) {
    root.innerHTML = card("Org Compass", "<p class='muted'>No org scorecard available yet.</p>");
    return;
  }
  const nodes = Array.isArray(scorecard.nodes) ? scorecard.nodes : [];
  const treeResp = await apiGet("/org").catch(() => ({ tree: [] }));
  const tree = Array.isArray(treeResp.tree) ? treeResp.tree : [];
  const selectedNodeId = qs("node") || nodes[0]?.nodeId || "";
  const selected = nodes.find((node) => node.nodeId === selectedNodeId) || nodes[0] || null;

  root.innerHTML = `
    ${card("Org Tree", `
      <div class="row wrap">
        <select id="orgNodeSelect">
          ${nodes
            .map(
              (node) =>
                `<option value="${htmlEscape(node.nodeId)}" ${node.nodeId === selectedNodeId ? "selected" : ""}>${htmlEscape(node.name)} (${htmlEscape(node.nodeType)})</option>`
            )
            .join("")}
        </select>
        <button id="orgRefreshBtn">Refresh</button>
      </div>
      <div class="scroll">
        <table>
          <thead><tr><th>Node</th><th>Type</th><th>Depth</th><th>Headline</th><th>Trust</th><th>Value</th></tr></thead>
          <tbody>
            ${tree
              .map((row) => {
                const node = nodes.find((n) => n.nodeId === row.nodeId);
                const indent = "&nbsp;".repeat(Math.max(0, Number(row.depth || 0)) * 2);
                return `<tr>
                  <td>${indent}${htmlEscape(row.name)}</td>
                  <td>${htmlEscape(row.nodeType)}</td>
                  <td>${Number(row.depth || 0)}</td>
                  <td>${node ? Number(node.headline?.median || 0).toFixed(3) : "-"}</td>
                  <td>${node ? htmlEscape(node.trustLabel || "UNKNOWN") : "-"}</td>
                  <td>${node && typeof node.valueScore === "number" ? node.valueScore.toFixed(2) : "n/a"}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `)}
    ${card("Node Detail", `
      <div id="orgNodeBanner"></div>
      <div class="grid">
        <div>
          <h4>Layers</h4>
          <canvas id="orgLayerBars" width="520" height="160"></canvas>
        </div>
        <div>
          <h4>Distribution (P10/P50/P90)</h4>
          <canvas id="orgDistLine" width="520" height="160"></canvas>
        </div>
      </div>
      <div class="grid">
        <div>
          <h4>Top Risks</h4>
          <ul id="orgRiskList"></ul>
        </div>
        <div>
          <h4>Top Gaps</h4>
          <ul id="orgGapList"></ul>
        </div>
      </div>
      <h4>67-Question Heatmap (median vs target)</h4>
      <div class="scroll">
        <table>
          <thead><tr><th>Question</th><th>Median</th><th>Target</th><th>Gap</th></tr></thead>
          <tbody id="orgHeatRows"></tbody>
        </table>
      </div>
    `)}
    ${card("Ecosystem Percentiles", `
      <div id="orgEco"></div>
    `)}
  `;

  function renderNode(node) {
    if (!node) {
      return;
    }
    const observed = Number(node.evidenceCoverage?.observedRatio || 0);
    const corr = Number(node.evidenceCoverage?.medianCorrelationRatio || 0);
    const evidenceGap = observed < 0.5 || corr < 0.9;
    const banner = document.getElementById("orgNodeBanner");
    if (banner) {
      banner.innerHTML = evidenceGap
        ? `<div class="card status-bad"><strong>Evidence Gap:</strong> OBSERVED coverage ${(observed * 100).toFixed(1)}%, median correlation ${corr.toFixed(3)}. Headline capped.</div>`
        : `<div class="card status-ok">Evidence coverage healthy: OBSERVED ${(observed * 100).toFixed(1)}%, median correlation ${corr.toFixed(3)}.</div>`;
    }
    const layerValues = (node.layerScores || []).map((row) => Number(row.median || 0));
    renderBars(document.getElementById("orgLayerBars"), layerValues, "#0f766e");
    renderLine(
      document.getElementById("orgDistLine"),
      [
        Number(node.headlineDistribution?.p10 || 0),
        Number(node.headlineDistribution?.p50 || 0),
        Number(node.headlineDistribution?.p90 || 0)
      ],
      "#b45309"
    );
    const riskList = document.getElementById("orgRiskList");
    if (riskList) {
      riskList.innerHTML = topRows(node.topSystemicRisks || [], 5)
        .map((row) => `<li>${htmlEscape(row.id)}: ${Number(row.score0to100 || 0).toFixed(2)}</li>`)
        .join("");
    }
    const gapList = document.getElementById("orgGapList");
    if (gapList) {
      gapList.innerHTML = topRows(node.topGapQuestions || [], 10)
        .map(
          (row) =>
            `<li>${htmlEscape(row.questionId)} gap ${Number(row.gap || 0).toFixed(2)} (current ${Number(row.currentMedian || 0).toFixed(2)} / target ${Number(row.targetMedian || 0).toFixed(2)})</li>`
        )
        .join("");
    }
    const heatRows = document.getElementById("orgHeatRows");
    if (heatRows) {
      heatRows.innerHTML = (node.questionScores || [])
        .map((row) => {
          const median = Number(row.median || 0);
          const target = Number(row.targetMedian || 0);
          const gap = target - median;
          return `<tr>
            <td>${htmlEscape(row.questionId)}</td>
            <td>${median.toFixed(3)}</td>
            <td>${target.toFixed(3)}</td>
            <td>${gap.toFixed(3)}</td>
          </tr>`;
        })
        .join("");
    }
  }

  const eco = document.getElementById("orgEco");
  if (eco) {
    const rollup = scorecard.summary?.ecosystemRollup;
    eco.innerHTML = rollup
      ? `<div class="grid">
          <div><div class="muted">Peers</div><div class="tile-value">${Number(rollup.peerCount || 0)}</div></div>
          <div><div class="muted">Overall Percentile</div><div class="tile-value">${Number(rollup.percentiles?.overall || 0).toFixed(1)}</div></div>
          <div><div class="muted">Integrity Percentile</div><div class="tile-value">${Number(rollup.percentiles?.integrity || 0).toFixed(1)}</div></div>
          <div><div class="muted">Value Percentile</div><div class="tile-value">${rollup.percentiles?.value === null ? "n/a" : Number(rollup.percentiles.value || 0).toFixed(1)}</div></div>
        </div>`
      : "<p class='muted'>No ecosystem benchmark rollup available yet.</p>";
  }

  renderNode(selected);
  document.getElementById("orgNodeSelect")?.addEventListener("change", (event) => {
    const nextId = event?.target?.value || "";
    const next = nodes.find((node) => node.nodeId === nextId) || null;
    renderNode(next);
  });
  document.getElementById("orgRefreshBtn")?.addEventListener("click", async () => {
    await renderOrg();
  });
  subscribeOrgSse(() => {
    renderOrg().catch(() => {});
  });
}

async function renderCompare() {
  const scorecard = await loadLatestOrgScorecard();
  if (!scorecard) {
    root.innerHTML = card("Org Compare", "<p class='muted'>No org scorecard available yet.</p>");
    return;
  }
  const nodes = Array.isArray(scorecard.nodes) ? scorecard.nodes : [];
  const a = qs("a") || nodes[0]?.nodeId || "";
  const b = qs("b") || nodes[1]?.nodeId || nodes[0]?.nodeId || "";
  root.innerHTML = `
    ${card("Node Compare", `
      <div class="row wrap">
        <select id="cmpA">
          ${nodes.map((node) => `<option value="${htmlEscape(node.nodeId)}" ${node.nodeId === a ? "selected" : ""}>${htmlEscape(node.name)}</option>`).join("")}
        </select>
        <select id="cmpB">
          ${nodes.map((node) => `<option value="${htmlEscape(node.nodeId)}" ${node.nodeId === b ? "selected" : ""}>${htmlEscape(node.name)}</option>`).join("")}
        </select>
        <button id="cmpRun">Compare</button>
      </div>
      <pre id="cmpOut" class="scroll muted"></pre>
    `)}
  `;
  const out = document.getElementById("cmpOut");
  async function runCompare() {
    const nodeA = document.getElementById("cmpA")?.value || "";
    const nodeB = document.getElementById("cmpB")?.value || "";
    if (!nodeA || !nodeB) {
      return;
    }
    const comparison = await apiGet(
      `/org/nodes/${encodeURIComponent(nodeA)}/scorecard?compareTo=${encodeURIComponent(nodeB)}`
    );
    out.textContent = JSON.stringify(comparison.comparison || comparison, null, 2);
  }
  document.getElementById("cmpRun")?.addEventListener("click", async () => {
    await runCompare();
  });
  await runCompare();
  subscribeOrgSse(() => {
    runCompare().catch(() => {});
  });
}

async function renderSystemic() {
  const scorecard = await loadLatestOrgScorecard();
  if (!scorecard) {
    root.innerHTML = card("Systemic Risks", "<p class='muted'>No org scorecard available yet.</p>");
    return;
  }
  const enterprise = scorecard.summary?.enterpriseRollup;
  if (!enterprise) {
    root.innerHTML = card("Systemic Risks", "<p class='muted'>No enterprise node rollup found in org graph.</p>");
    return;
  }
  const risks = (enterprise.riskIndices || [])
    .slice()
    .sort((a, b) => Number(b.score0to100 || 0) - Number(a.score0to100 || 0));
  root.innerHTML = `
    ${card("Enterprise Systemic Risk Map", `
      <p><strong>${htmlEscape(enterprise.name)}</strong> (${htmlEscape(enterprise.nodeId)})</p>
      <p>Headline ${Number(enterprise.headline?.median || 0).toFixed(3)} | Integrity ${Number(enterprise.integrityIndex || 0).toFixed(3)} | Trust ${htmlEscape(enterprise.trustLabel || "UNKNOWN")}</p>
      <table>
        <thead><tr><th>Index</th><th>Score</th></tr></thead>
        <tbody>
          ${risks.map((row) => `<tr><td>${htmlEscape(row.id)}</td><td>${Number(row.score0to100 || 0).toFixed(2)}</td></tr>`).join("")}
        </tbody>
      </table>
      <h4>Root-Cause Contributors</h4>
      <ul>
        ${topRows(enterprise.topGapQuestions || [], 10).map((row) => `<li>${htmlEscape(row.questionId)} gap ${Number(row.gap || 0).toFixed(2)}</li>`).join("")}
      </ul>
      <h4>4C Remediation</h4>
      <ul>
        <li>Concept: tighten mission clarity and measurable success criteria.</li>
        <li>Culture: enforce truthfulness, dissent, and governance consistency.</li>
        <li>Capabilities: improve verification, assurance packs, and reproducibility.</li>
        <li>Configuration: enforce policy, leases, budgets, and CI gates.</li>
      </ul>
    `)}
  `;
  subscribeOrgSse(() => {
    renderSystemic().catch(() => {});
  });
}

async function renderOrgCommitments() {
  const org = await apiGet("/org");
  const tree = Array.isArray(org.tree) ? org.tree : [];
  root.innerHTML = `
    ${card("Org E/O/C Planner", `
      <div class="row wrap">
        <select id="orgCommitNode">
          ${tree.map((row) => `<option value="${htmlEscape(row.nodeId)}">${htmlEscape(row.name)} (${htmlEscape(row.nodeType)})</option>`).join("")}
        </select>
        <select id="orgCommitKind">
          <option value="learn">Education</option>
          <option value="own">Ownership</option>
          <option value="commit">Commitment</option>
        </select>
        <select id="orgCommitDays">
          <option value="14">14 days</option>
          <option value="30" selected>30 days</option>
          <option value="90">90 days</option>
        </select>
        <button id="orgCommitGenerate">Generate</button>
      </div>
      <pre id="orgCommitOut" class="scroll muted"></pre>
    `)}
  `;
  const out = document.getElementById("orgCommitOut");
  document.getElementById("orgCommitGenerate")?.addEventListener("click", async () => {
    const nodeId = document.getElementById("orgCommitNode")?.value || "";
    const kind = document.getElementById("orgCommitKind")?.value || "commit";
    const days = Number(document.getElementById("orgCommitDays")?.value || "30");
    const created = await apiPost("/org/commitments/generate", { nodeId, kind, days });
    out.textContent = JSON.stringify(created, null, 2);
  });
}

async function renderPlugins() {
  const installed = await apiGet("/plugins/installed");
  const registries = await apiGet("/plugins/registries");
  root.innerHTML = `
    ${card("Installed Plugins", `<div id="pluginTable"></div>`)}
    ${card("Registry Configuration", `<div id="registryTable"></div>`)}
    ${card("Registry Browser", `
      <div class="row wrap">
        <input id="pluginRegistryId" placeholder="registry id" />
        <input id="pluginQuery" placeholder="search query" />
        <button id="pluginBrowseBtn">Browse</button>
      </div>
      <pre id="pluginBrowseOut" class="scroll muted"></pre>
    `)}
    ${card("Install / Upgrade / Remove", `
      <div class="row wrap">
        <input id="pluginActionRegistry" placeholder="registry id" />
        <input id="pluginRef" placeholder="pluginId@version" />
        <button id="pluginInstallBtn">Install</button>
        <button id="pluginUpgradeBtn" class="secondary">Upgrade</button>
      </div>
      <div class="row wrap">
        <input id="pluginRemoveId" placeholder="pluginId" />
        <button id="pluginRemoveBtn" class="secondary">Remove</button>
      </div>
      <div class="row wrap">
        <input id="pluginApprovalExecute" placeholder="approvalRequestId" />
        <button id="pluginExecuteBtn">Execute Approved Action</button>
      </div>
      <pre id="pluginActionOut" class="scroll muted"></pre>
    `)}
    ${card("Plugin Detail", `<div id="pluginDetail"></div>`)}
    ${card("Plugin Diff", `
      <div class="row wrap">
        <input id="pluginDiffCurrent" placeholder="current version (e.g. 1.0.0)" />
        <input id="pluginDiffCandidate" placeholder="candidate version (e.g. 1.1.0)" />
        <input id="pluginDiffId" placeholder="plugin id" />
        <button id="pluginDiffBtn">Render Local Diff Hint</button>
      </div>
      <div id="pluginDiffOut"></div>
    `)}
  `;
  renderPluginTable(document.getElementById("pluginTable"), installed.items || []);
  renderRegistryManager(document.getElementById("registryTable"), registries.config || registries);
  renderPluginDetail(document.getElementById("pluginDetail"), {
    lockPath: installed.lockPath,
    lockSignatureValid: installed.lockSignatureValid,
    loader: installed.loader || null
  });

  const browseOut = document.getElementById("pluginBrowseOut");
  document.getElementById("pluginBrowseBtn")?.addEventListener("click", async () => {
    const id = document.getElementById("pluginRegistryId")?.value || "";
    const query = document.getElementById("pluginQuery")?.value || "";
    if (!id) {
      browseOut.textContent = "registry id is required";
      return;
    }
    try {
      const out = await apiGet(`/plugins/registry/browse?id=${encodeURIComponent(id)}&query=${encodeURIComponent(query)}`);
      browseOut.textContent = JSON.stringify(out, null, 2);
    } catch (error) {
      browseOut.textContent = `browse failed: ${errText(error)}`;
    }
  });

  const actionOut = document.getElementById("pluginActionOut");
  document.getElementById("pluginInstallBtn")?.addEventListener("click", async () => {
    const registryId = document.getElementById("pluginActionRegistry")?.value || "";
    const pluginRef = document.getElementById("pluginRef")?.value || "";
    if (!registryId || !pluginRef) {
      actionOut.textContent = "registry and pluginRef are required";
      return;
    }
    try {
      const out = await apiPost("/plugins/install", { agentId: currentAgent(), registryId, pluginRef });
      actionOut.textContent = JSON.stringify(out, null, 2);
    } catch (error) {
      actionOut.textContent = `install request failed: ${errText(error)}`;
    }
  });
  document.getElementById("pluginUpgradeBtn")?.addEventListener("click", async () => {
    const registryId = document.getElementById("pluginActionRegistry")?.value || "";
    const pluginRef = document.getElementById("pluginRef")?.value || "";
    if (!registryId || !pluginRef) {
      actionOut.textContent = "registry and pluginRef are required";
      return;
    }
    const [pluginId, to] = pluginRef.includes("@") ? pluginRef.split("@") : [pluginRef, "latest"];
    try {
      const out = await apiPost("/plugins/upgrade", { agentId: currentAgent(), registryId, pluginId, to });
      actionOut.textContent = JSON.stringify(out, null, 2);
    } catch (error) {
      actionOut.textContent = `upgrade request failed: ${errText(error)}`;
    }
  });
  document.getElementById("pluginRemoveBtn")?.addEventListener("click", async () => {
    const pluginId = document.getElementById("pluginRemoveId")?.value || "";
    if (!pluginId) {
      actionOut.textContent = "pluginId is required";
      return;
    }
    try {
      const out = await apiPost("/plugins/remove", { agentId: currentAgent(), pluginId });
      actionOut.textContent = JSON.stringify(out, null, 2);
    } catch (error) {
      actionOut.textContent = `remove request failed: ${errText(error)}`;
    }
  });
  document.getElementById("pluginExecuteBtn")?.addEventListener("click", async () => {
    const approvalRequestId = document.getElementById("pluginApprovalExecute")?.value || "";
    if (!approvalRequestId) {
      actionOut.textContent = "approvalRequestId is required";
      return;
    }
    try {
      const out = await apiPost("/plugins/execute", { approvalRequestId });
      actionOut.textContent = JSON.stringify(out, null, 2);
      await renderPlugins();
    } catch (error) {
      actionOut.textContent = `execute failed: ${errText(error)}`;
    }
  });

  document.getElementById("pluginDiffBtn")?.addEventListener("click", () => {
    const pluginId = document.getElementById("pluginDiffId")?.value || "";
    const currentVersion = document.getElementById("pluginDiffCurrent")?.value || "";
    const candidateVersion = document.getElementById("pluginDiffCandidate")?.value || "";
    const diff = {
      added: candidateVersion && currentVersion !== candidateVersion ? [{ pluginId, version: candidateVersion }] : [],
      changed: currentVersion && candidateVersion && currentVersion !== candidateVersion ? [{ pluginId, from: currentVersion, to: candidateVersion }] : [],
      removed: currentVersion && !candidateVersion ? [{ pluginId, version: currentVersion }] : []
    };
    renderPluginDiff(document.getElementById("pluginDiffOut"), diff);
  });
}

async function renderGeneric(title, endpoint) {
  const data = await apiGet(endpoint);
  root.innerHTML = card(title, `<pre class="scroll">${JSON.stringify(data, null, 2)}</pre>`);
}

async function renderPage() {
  renderOfflineBanner(!navigator.onLine);
  if (page === "login") {
    renderAuthScreen();
    return;
  }

  if (!(await ensureAuthenticated())) {
    renderAuthScreen();
    return;
  }

  const me = getCurrentUser();
  if (me) {
    setStatus(`Logged in as ${me.username} (${(me.roles || []).join(",")})`);
  } else if (getAdminToken()) {
    setStatus("Using admin token session.");
  }
  await refreshUnifiedBanner();

  try {
    if (page === "home") return await renderHome();
    if (page === "agent") return await renderAgent();
    if (page === "equalizer") return await renderEqualizer();
    if (page === "approvals") return await renderApprovals();
    if (page === "users") return await renderUsers();
    if (page === "transparency") return await renderTransparency();
    if (page === "policypacks") return await renderPolicyPacks();
    if (page === "governor") {
      const actionClasses = ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY"];
      const rows = [];
      for (const actionClass of actionClasses) {
        const decision = await apiPost("/governor/check", {
          agentId: currentAgent(),
          actionClass,
          riskTier: "med",
          mode: "EXECUTE"
        }).catch((error) => ({ error: errText(error) }));
        rows.push({ actionClass, decision });
      }
      root.innerHTML = card("Governor", `<pre>${JSON.stringify(rows, null, 2)}</pre>`);
      return;
    }
    if (page === "toolhub") {
      const tools = await apiGet("/toolhub/tools");
      const intents = await apiGet("/toolhub/pending-intents").catch(() => ({ intents: [] }));
      root.innerHTML = `
        ${card("Allowed Tools", `<pre>${JSON.stringify(tools, null, 2)}</pre>`)}
        ${card("Pending Intents", `<pre>${JSON.stringify(intents, null, 2)}</pre>`)}
      `;
      return;
    }
    if (page === "leases") {
      const leaseState = await apiGet("/leases/status");
      root.innerHTML = card("Leases", `
        <pre>${JSON.stringify(leaseState, null, 2)}</pre>
        <div class="row">
          <button id="issueLeaseBtn">Issue Lease For ${currentAgent()}</button>
          <button id="logoutBtn" class="secondary">Logout</button>
        </div>
        <pre id="leaseOut" class="muted"></pre>
      `);
      document.getElementById("issueLeaseBtn")?.addEventListener("click", async () => {
        const issued = await apiPost(`/agents/${encodeURIComponent(currentAgent())}/lease`, {
          ttl: "60m",
          scopes: "gateway:llm,toolhub:intent,toolhub:execute,governor:check,receipt:verify",
          routes: "/openai,/anthropic,/gemini,/grok,/openrouter,/local",
          models: "*",
          rpm: 60,
          tpm: 200000
        });
        document.getElementById("leaseOut").textContent = `Lease token (copy once): ${issued.lease}`;
      });
      document.getElementById("logoutBtn")?.addEventListener("click", async () => {
        await logout();
        setAdminToken(null);
        await renderPage();
      });
      return;
    }
    if (page === "budgets") {
      const data = await apiGet(`/budgets?agentId=${encodeURIComponent(currentAgent())}`);
      root.innerHTML = card("Budgets", `
        <p class="muted">Edit draft budgets config and apply signed update.</p>
        <textarea id="budgetsDraft" rows="18">${JSON.stringify(data.config, null, 2)}</textarea>
        <div class="row"><button id="applyBudgets">Apply Budgets</button></div>
        <pre id="budgetOut" class="muted"></pre>
      `);
      document.getElementById("applyBudgets")?.addEventListener("click", async () => {
        const raw = document.getElementById("budgetsDraft").value;
        const parsed = JSON.parse(raw);
        const out = await apiPost("/budgets/apply", { config: parsed });
        document.getElementById("budgetOut").textContent = JSON.stringify(out, null, 2);
        await refreshUnifiedBanner();
      });
      return;
    }
    if (page === "drift") {
      const agentId = currentAgent();
      const status = await apiGet(`/agents/${encodeURIComponent(agentId)}/status`);
      root.innerHTML = card("Drift", `
        <pre>${JSON.stringify(status, null, 2)}</pre>
        <button id="driftCheck">Run Drift Check Now</button>
        <pre id="driftOut" class="muted"></pre>
      `);
      document.getElementById("driftCheck")?.addEventListener("click", async () => {
        const out = await apiPost(`/agents/${encodeURIComponent(agentId)}/drift/check`, { against: "previous" });
        document.getElementById("driftOut").textContent = JSON.stringify(out, null, 2);
        await refreshUnifiedBanner();
      });
      return;
    }
    if (page === "benchmarks") {
      const list = await apiGet("/benchmarks/list");
      const stats = await apiGet("/benchmarks/stats");
      const federation = await apiGet("/federation/status").catch(() => null);
      root.innerHTML = `
        ${card("Benchmark Stats", `<pre>${JSON.stringify(stats, null, 2)}</pre>`)}
        ${card("Benchmarks", `<pre>${JSON.stringify(list, null, 2)}</pre>`)}
        ${card("Federation", `<pre>${JSON.stringify(federation || {}, null, 2)}</pre>`)}
      `;
      return;
    }
    if (page === "org") return await renderOrg();
    if (page === "compare") return await renderCompare();
    if (page === "systemic") return await renderSystemic();
    if (page === "commitments-org") return await renderOrgCommitments();
    if (page === "outcomes") return await renderOutcomes();
    if (page === "experiments") return await renderExperiments();
    if (page === "compass") {
      return await renderCompassPage({
        root,
        card,
        apiGet,
        currentAgent
      });
    }
    if (page === "contextGraph") {
      return await renderContextGraphPage({
        root,
        card,
        apiGet,
        currentAgent
      });
    }
    if (page === "diagnosticView") {
      return await renderDiagnosticViewPage({
        root,
        card,
        apiGet,
        currentAgent
      });
    }
    if (page === "forecast") {
      return await renderForecastScopePage({
        root,
        card,
        apiGet,
        scope: "workspace"
      });
    }
    if (page === "forecastAgent") {
      return await renderForecastScopePage({
        root,
        card,
        apiGet,
        scope: "agent",
        targetId: currentAgent()
      });
    }
    if (page === "forecastNode") {
      const nodeId = qs("node") || "enterprise";
      return await renderForecastScopePage({
        root,
        card,
        apiGet,
        scope: "node",
        targetId: nodeId
      });
    }
    if (page === "advisories") {
      return await renderAdvisoriesPage({
        root,
        card,
        apiGet,
        apiPost,
        currentAgent
      });
    }
    if (page === "portfolioForecast") {
      return await renderPortfolioForecastPage({
        root,
        card,
        apiGet
      });
    }
    if (page === "compliance") return await renderCompliance();
    if (page === "integrations") return await renderIntegrations();
    if (page === "trust") {
      return await renderTrustPage({
        root,
        apiGet,
        card,
        htmlEscape
      });
    }
    if (page === "plugins") return await renderPlugins();
    if (page === "northstar") {
      return await renderNorthstarPage({
        root,
        card,
        apiGet,
        apiPost,
        currentAgent
      });
    }
    if (page === "assurance") {
      return await renderAssurancePage({
        root,
        card,
        apiGet,
        apiPost
      });
    }
    if (page === "assuranceRun") {
      return await renderAssuranceRunPage({
        root,
        card,
        apiGet
      });
    }
    if (page === "assuranceCert") {
      return await renderAssuranceCertPage({
        root,
        card,
        apiGet
      });
    }
    if (page === "audit") {
      return await renderAuditPage({
        root,
        card,
        apiGet,
        apiPost
      });
    }
    if (page === "auditBinder") {
      return await renderAuditBinderPage({
        root,
        card,
        apiGet,
        apiPost
      });
    }
    if (page === "auditRequests") {
      return await renderAuditRequestsPage({
        root,
        card,
        apiGet,
        apiPost
      });
    }
    if (page === "value") {
      return await renderValuePage({
        root,
        card,
        apiGet,
        apiPost,
        subscribe: subscribeOrgSse
      });
    }
    if (page === "valueAgent") {
      return await renderValueAgentPage({
        root,
        card,
        apiGet,
        apiPost,
        currentAgent,
        subscribe: subscribeOrgSse
      });
    }
    if (page === "valueKpis") {
      return await renderValueKpisPage({
        root,
        card,
        apiGet,
        currentAgent,
        subscribe: subscribeOrgSse
      });
    }
    if (page === "passport") {
      return await renderPassportPage({
        root,
        card,
        apiGet,
        apiPost,
        currentAgent
      });
    }
    if (page === "standard") {
      return await renderStandardPage({
        root,
        card,
        apiGet,
        apiPost
      });
    }
    if (page === "workorders") return await renderGeneric("Work Orders", `/agents/${encodeURIComponent(currentAgent())}/status`);
    return await renderGeneric("Console", "/status");
  } catch (error) {
    root.innerHTML = `<div class="card status-bad">${htmlEscape(errText(error))}</div>`;
    setStatus(errText(error), true);
  }
}

async function installPwa() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register(withConsolePath("/assets/sw.js"), {
      scope: `${consoleBasePath()}/`
    });
  } catch {
    // Ignore registration errors in unsupported environments.
  }
}

window.addEventListener("online", () => {
  renderOfflineBanner(false);
});
window.addEventListener("offline", () => {
  renderOfflineBanner(true);
});

document.addEventListener("DOMContentLoaded", async () => {
  await installPwa();
  await renderPage();
});
