import { apiGet, apiPost, whoami, onClaims } from "./api.js";
import { installClaimStrip } from "./components/claimBadge.js";
import { benchCard } from "./components/benchCard.js";
import { requestBenchPublish, executeBenchPublish } from "./components/benchPublishFlow.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function card(title, body) {
  return `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
}

async function loadData() {
  const [exportsRes, importsRes, comparisonRes] = await Promise.all([
    apiGet("/bench/exports").catch(() => ({ exports: [] })),
    apiGet("/bench/imports").catch(() => ({ imports: [] })),
    apiGet("/bench/comparison/latest").catch(() => ({ latest: null, exists: false }))
  ]);
  return {
    exports: Array.isArray(exportsRes.exports) ? exportsRes.exports : [],
    imports: Array.isArray(importsRes.imports) ? importsRes.imports : [],
    latestComparison: comparisonRes.latest ?? null
  };
}

function render(root, data) {
  const exported = data.exports.map((row) => benchCard(row)).join("");
  const imported = data.imports.map((row) => benchCard(row)).join("");
  const comparison = data.latestComparison ? `<pre class="scroll">${esc(JSON.stringify(data.latestComparison, null, 2))}</pre>` : `<p class="muted">No comparison yet.</p>`;
  root.innerHTML = `
    ${card("Exports", exported || `<p class="muted">No local exports.</p>`)}
    ${card("Imports", imported || `<p class="muted">No imported benches.</p>`)}
    ${card(
      "Publish",
      `
      <div class="row wrap">
        <input id="benchPubAgent" placeholder="agentId" />
        <input id="benchPubFile" placeholder="path/to/file.amcbench" />
        <input id="benchPubRegDir" placeholder="registry directory" />
        <input id="benchPubRegKey" placeholder="registry key path" />
      </div>
      <div class="row wrap">
        <label><input id="benchPubAck" type="checkbox" /> irreversible sharing acknowledged</label>
        <button id="benchPubReqBtn">Request Publish</button>
      </div>
      <div class="row wrap">
        <input id="benchPubApproval" placeholder="approvalRequestId" />
        <button id="benchPubExecBtn">Execute Publish</button>
      </div>
      <pre id="benchPubOut" class="scroll muted"></pre>
    `
    )}
    ${card("Latest Comparison", comparison)}
  `;
}

function wirePublishHandlers() {
  const out = document.getElementById("benchPubOut");
  document.getElementById("benchPubReqBtn")?.addEventListener("click", async () => {
    try {
      const payload = {
        agentId: document.getElementById("benchPubAgent")?.value || "",
        file: document.getElementById("benchPubFile")?.value || "",
        registryDir: document.getElementById("benchPubRegDir")?.value || "",
        registryKeyPath: document.getElementById("benchPubRegKey")?.value || "",
        explicitOwnerAck: Boolean(document.getElementById("benchPubAck")?.checked)
      };
      const result = await requestBenchPublish(apiPost, payload);
      out.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      out.textContent = String(error);
    }
  });
  document.getElementById("benchPubExecBtn")?.addEventListener("click", async () => {
    try {
      const approvalRequestId = document.getElementById("benchPubApproval")?.value || "";
      const result = await executeBenchPublish(apiPost, { approvalRequestId });
      out.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      out.textContent = String(error);
    }
  });
}

async function main() {
  const status = document.getElementById("status");
  const app = document.getElementById("app");
  const me = await whoami().catch(() => null);
  if (!me) {
    status.textContent = "Authentication required.";
    return;
  }
  status.textContent = `Signed in as ${me.username ?? me.userId ?? "user"}`;
  const data = await loadData();
  render(app, data);
  wirePublishHandlers();
}

installClaimStrip(document.body.dataset.page, onClaims);
void main();
