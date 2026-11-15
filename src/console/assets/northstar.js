import { renderPromptViewer } from "./components/promptViewer.js";
import { renderPromptStatusChip } from "./components/promptStatusChip.js";
import { renderPromptDiffViewer } from "./components/promptDiffViewer.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pickAgent(rows, fallback) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return fallback || "default";
  }
  const hit = rows.find((row) => row && row.agentId === fallback);
  if (hit && typeof hit.agentId === "string") {
    return hit.agentId;
  }
  return typeof rows[0]?.agentId === "string" ? rows[0].agentId : (fallback || "default");
}

export async function renderNorthstarPage(params) {
  const policyRes = await params.apiGet("/prompt/policy");
  const statusRes = await params.apiGet("/prompt/status");
  const scheduler = await params.apiGet("/prompt/scheduler").catch(() => null);
  const agents = Array.isArray(statusRes?.agents) ? statusRes.agents : [];
  const agentId = pickAgent(agents, params.currentAgent());
  const openai = await params.apiGet(`/prompt/pack/show?agentId=${encodeURIComponent(agentId)}&provider=openai&format=text`).catch(() => null);
  const packJson = await params.apiGet(`/prompt/pack/show?agentId=${encodeURIComponent(agentId)}&provider=openai&format=json`).catch(() => null);
  const diff = await params.apiGet(`/prompt/pack/diff?agentId=${encodeURIComponent(agentId)}`).catch(() => ({ status: "missing" }));

  const sigValid = policyRes?.signature?.valid === true;
  const enforcement = policyRes?.policy?.promptPolicy?.enforcement?.mode || "UNKNOWN";
  const lintFail = agents.some((row) => row?.lint === "FAIL");
  const sigFail = agents.some((row) => row?.signature === "FAIL");

  const warningLines = [];
  if (!sigValid) {
    warningLines.push("<div class='card status-bad'><strong>PROMPT POLICY UNTRUSTED</strong></div>");
  }
  if (sigFail) {
    warningLines.push("<div class='card status-bad'><strong>PROMPT PACK INVALID</strong></div>");
  }
  if (lintFail) {
    warningLines.push("<div class='card status-bad'><strong>PROMPT LINT FAILED</strong></div>");
  }
  if (String(enforcement).toUpperCase() === "OFF") {
    warningLines.push("<div class='card status-bad'><strong>ENFORCEMENT DISABLED</strong></div>");
  }

  const tableRows = agents
    .map((row) => {
      // The chosen agent's row is marked with the theme's own colours, so its text stays readable (C-19); ids are shortened.
      const selected = row.agentId === agentId ? ' class="selected" aria-current="true"' : "";
      const short = (value) => value ? `<code title="${escapeHtml(value)}">${escapeHtml(String(value).slice(0, 12))}…</code>` : "-";
      return `<tr${selected}>
        <td><code>${escapeHtml(row.agentId)}</code></td>
        <td>${short(row.packId)}</td>
        <td>${short(row.packSha256)}</td>
        <td>${renderPromptStatusChip("Sig", row.signature || "MISSING")}</td>
        <td>${renderPromptStatusChip("Lint", row.lint || "MISSING")}</td>
        <td>${escapeHtml(row.generatedTs ? new Date(row.generatedTs).toISOString() : "-")}</td>
        <td>${escapeHtml(String(row.findings ?? 0))}</td>
      </tr>`;
    })
    .join("");

  params.root.innerHTML = [
    ...warningLines,
    params.card(
      "Northstar Prompt Status",
      `
      <div class="row wrap">
        ${renderPromptStatusChip("Policy Signature", sigValid ? "PASS" : "FAIL")}
        ${renderPromptStatusChip("Enforcement", enforcement)}
        ${renderPromptStatusChip("Scheduler", scheduler?.state?.enabled ? "ENABLED" : "DISABLED")}
      </div>
      <p class="muted">A prompt pack is the signed set of instructions AMC adds to your agent's model calls, built from what AMC knows about the agent.</p>
      <div class="row">
        <button id="promptBuildNow">Build Pack For ${escapeHtml(agentId)}</button>
      </div>
      <div class="scroll"><table>
        <thead>
          <tr><th>Agent</th><th>Pack ID</th><th>Pack SHA</th><th>Signature</th><th>Lint</th><th>Generated</th><th>Findings</th></tr>
        </thead>
        <tbody>${tableRows || "<tr><td colspan='7' class='muted'>No prompt packs yet.</td></tr>"}</tbody>
      </table></div>
      `
    ),
    params.card(
      "Prompt Viewer",
      renderPromptViewer({
        provider: "openai",
        systemText: openai?.value ?? "",
        allowlists: packJson?.value?.allowlists ?? {},
        recurrence: packJson?.value?.northstar?.recurrence ?? {}
      })
    ),
    params.card("Prompt Diff", renderPromptDiffViewer(diff))
  ].join("");

  document.getElementById("promptBuildNow")?.addEventListener("click", async () => {
    const out = await params.apiPost("/prompt/pack/build", {
      agentId
    });
    await renderNorthstarPage(params);
    const done = document.getElementById("promptBuildNow");
    done?.insertAdjacentHTML("afterend", `<p class="status-ok" role="status">Prompt pack built${out.pack?.generatedTs ? ` at ${new Date(out.pack.generatedTs).toLocaleTimeString()}` : ""}.</p>`);
  });
}

