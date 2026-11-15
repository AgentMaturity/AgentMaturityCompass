import { askInline } from "./pageKit.js";
import { renderRequestCard } from "./components/requestCard.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseItems(csv) {
  return String(csv || "")
    .split(",")
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
}

export async function renderAuditRequestsPage(params) {
  const listed = await params.apiGet("/audit/requests").catch(() => ({ requests: [] }));
  const requests = Array.isArray(listed?.requests) ? listed.requests : [];

  params.root.innerHTML = [
    params.card(
      "Evidence Requests",
      `
      <p class="muted">An auditor asks for evidence here; an owner approves the request and fulfils it with a binder.</p>
      <div class="row wrap">
        <label><span class="muted">Scope</span><select id="auditReqScope"><option>WORKSPACE</option><option>NODE</option><option>AGENT</option></select></label>
        <label><span class="muted">Which one (for the workspace: workspace)</span><input id="auditReqScopeId" value="workspace" /></label>
        <label><span class="muted">What to ask for, comma separated</span><input id="auditReqItems" value="control:ACCESS_CONTROL.SSO_SCIM" /></label>
      </div>
      <div class="row wrap">
        <button id="auditReqCreate" data-roles="AUDITOR">Ask for evidence (auditor)</button>
        <button id="auditReqRefresh" class="secondary">Refresh</button>
      </div>
      <p class="muted">Requests can include <code>control:&lt;id&gt;</code>, <code>proof:&lt;proofId&gt;</code>, or <code>artifact:&lt;id&gt;@&lt;sha256&gt;</code>. Fulfillment exports a restricted, privacy-safe binder.</p>
      `
    ),
    params.card(
      `Open/Closed Requests (${requests.length})`,
      requests.length > 0
        ? requests.map((request) => `
            ${renderRequestCard(request)}
            <div class="row wrap">
              <button data-action="approve" data-id="${esc(request.requestId)}">Approve</button>
              <button data-action="reject" data-id="${esc(request.requestId)}" class="secondary">Reject</button>
              <button data-action="fulfill" data-id="${esc(request.requestId)}" class="secondary">Fulfill</button>
            </div>
          `).join("")
        : "<div class='muted'>No requests.</div>"
    )
  ].join("");

  document.getElementById("auditReqRefresh")?.addEventListener("click", async () => {
    await renderAuditRequestsPage(params);
  });

  document.getElementById("auditReqCreate")?.addEventListener("click", async () => {
    const scopeType = (document.getElementById("auditReqScope")?.value || "WORKSPACE").trim();
    const scopeId = (document.getElementById("auditReqScopeId")?.value || "workspace").trim();
    const items = parseItems(document.getElementById("auditReqItems")?.value || "");
    if (items.length === 0) throw new Error("Name at least one thing to ask for, for example control:ACCESS_CONTROL.SSO_SCIM.");
    await params.apiPost("/audit/requests/create", {
      scopeType,
      scopeId,
      requestedItems: items
    });
    await renderAuditRequestsPage(params);
  });

  for (const button of Array.from(document.querySelectorAll("button[data-action][data-id]"))) {
    button.addEventListener("click", async () => {
      const action = button.getAttribute("data-action");
      const requestId = button.getAttribute("data-id");
      if (!action || !requestId) {
        return;
      }
      if (action === "approve") {
        await params.apiPost(`/audit/requests/${encodeURIComponent(requestId)}/approve`, {
          reason: "owner approved from audit console"
        });
      } else if (action === "reject") {
        await params.apiPost(`/audit/requests/${encodeURIComponent(requestId)}/reject`, {});
      } else if (action === "fulfill") {
        const outFile = await askInline(button, { label: "Save the binder for this request to (ending in .amcaudit)",
          value: `.amc/audit/binders/exports/workspace/workspace/request_${requestId}.amcaudit`, submit: "Save", check: (text) => text.endsWith(".amcaudit") ? null : "The file name must end in .amcaudit." });
        if (!outFile) {
          return;
        }
        await params.apiPost(`/audit/requests/${encodeURIComponent(requestId)}/fulfill`, {
          outFile: outFile.trim()
        });
      }
      await renderAuditRequestsPage(params);
    });
  }
}
