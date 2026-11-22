import { esc, recordDetails } from "./pageKit.js";
import { plainCodeHtml } from "./plainError.js";
import { renderCgxViewer } from "./components/cgxViewer.js";

export async function renderContextGraphPage(params) {
  const agentId = params.currentAgent();
  const [graph, pack, verify] = await Promise.all([
    params.apiGet(`/cgx/graph/latest?scope=agent&targetId=${encodeURIComponent(agentId)}`).catch(() => null),
    params.apiGet(`/cgx/pack/latest?agentId=${encodeURIComponent(agentId)}`).catch(() => null),
    params.apiGet("/cgx/verify").catch(() => null)
  ]);

  params.root.innerHTML = `
    ${params.card("Context graph", `
      <p class="muted">What AMC knows about how this agent's parts, tools and data connect, and whether those records are signed.</p>
      <div class="grid">
        <div><div class="muted">Agent</div><div class="tile-value">${esc(agentId)}</div></div>
        <div><div class="muted">Graph signature</div><div class="tile-value">${plainCodeHtml(verify?.workspaceGraph?.valid ? "PASS" : "UNVERIFIED")}</div></div>
        <div><div class="muted">Pack signature</div><div class="tile-value">${plainCodeHtml(verify?.agentPacks?.find?.((row) => row.agentId === agentId)?.verify?.valid ? "PASS" : "UNVERIFIED")}</div></div>
        <div><div class="muted">Pack Hash</div><div class="tile-value">${pack ? "present" : "missing"}</div></div>
      </div>
      ${recordDetails(verify, "Show the signature checks")}
      ${recordDetails(pack, "Show the context pack")}
    `)}
    <div id="cgxViewer"></div>
  `;
  renderCgxViewer(document.getElementById("cgxViewer"), graph);
}
