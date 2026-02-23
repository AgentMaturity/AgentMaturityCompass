import { renderRadar } from "./components/radar.js";
import { renderHeatmap } from "./components/heatmap.js";
import { renderTimeline } from "./components/timeline.js";
import { renderQuestionDetail } from "./components/questionDetail.js";
import { renderEoc } from "./components/eoc.js";

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSummary(data) {
  const summary = document.getElementById("summary");
  summary.textContent = `Agent ${data.agentId} | Overall ${data.overall.toFixed(2)} | Integrity ${data.latestRun.integrityIndex.toFixed(3)} (${data.latestRun.trustLabel})`;
}

function renderIndices(data) {
  const el = document.getElementById("indices");
  el.innerHTML = "";
  for (const index of data.indices.indices) {
    const row = document.createElement("div");
    row.innerHTML = `<strong>${esc(index.id)}</strong>: ${index.score0to100.toFixed(2)}/100`;
    el.appendChild(row);
  }
}

function renderAssurance(data) {
  const el = document.getElementById("assurance");
  el.innerHTML = "";
  if (!data.assurance || data.assurance.length === 0) {
    el.textContent = "No assurance runs in trend window.";
    return;
  }
  for (const pack of data.assurance) {
    const row = document.createElement("div");
    row.innerHTML = `<span class="badge">${esc(pack.packId)}</span> score ${pack.score0to100.toFixed(1)}`;
    el.appendChild(row);
  }
}

function renderValueSummary(data) {
  const el = document.getElementById("value-summary");
  const row = data.valueSummary || {
    valueScore: 0,
    economicSignificanceIndex: 0,
    valueRegressionRisk: 0,
    trustLabel: "UNTRUSTED CONFIG"
  };
  el.innerHTML = `
    <div>ValueScore: <strong>${Number(row.valueScore || 0).toFixed(2)}</strong></div>
    <div>EconomicSignificanceIndex: <strong>${Number(row.economicSignificanceIndex || 0).toFixed(2)}</strong></div>
    <div>ValueRegressionRisk: <strong>${Number(row.valueRegressionRisk || 0).toFixed(2)}</strong></div>
    <div>Trust Label: <strong>${esc(row.trustLabel || "UNTRUSTED CONFIG")}</strong></div>
  `;
  const trend = Array.isArray(data.valueTrend) ? data.valueTrend : [];
  const values = trend.length > 0 ? trend.map((rowItem) => Number(rowItem.valueScore || 0)) : [Number(row.valueScore || 0)];
  renderTimeline(document.getElementById("value-trend"), values.map((value, i) => ({ ts: i, overall: value, integrityIndex: value })));
}

function renderValueGaps(data) {
  const el = document.getElementById("value-gaps");
  el.innerHTML = "";
  const gaps = Array.isArray(data.topValueGaps) ? data.topValueGaps : [];
  for (const gap of gaps) {
    const li = document.createElement("li");
    li.textContent = `${gap.metricId}: ${gap.reason} (${gap.status})`;
    el.appendChild(li);
  }
  if (gaps.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No active value gaps.";
    el.appendChild(li);
  }
}

function renderEvidenceGaps(data) {
  const el = document.getElementById("evidence-gaps");
  el.innerHTML = "";
  for (const gap of data.evidenceGaps) {
    const li = document.createElement("li");
    li.textContent = `${gap.questionId}: ${gap.reason}`;
    el.appendChild(li);
  }
}

function parseViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("view") || "engineer").toLowerCase();
}

function renderSimpleTeamView(data) {
  const view = parseViewFromUrl();
  const mount = document.getElementById("team-view");
  if (!mount) return;
  const run = data.latestRun;
  const gaps = Array.isArray(data.evidenceGaps) ? data.evidenceGaps : [];
  if (view === "exec") {
    const trust = esc(run?.trustLabel || "N/A");
    const topRisks = gaps.slice(0, 3).map((g) => esc(g.questionId)).join(", ") || "none";
    mount.innerHTML = `<h3>Executive Summary</h3><p>Overall: ${Number(data.overall || 0).toFixed(2)} | Trust: ${trust}</p><p>Top Risks: ${topRisks}</p>`;
    return;
  }
  if (view === "product") {
    mount.innerHTML = `<h3>Product View</h3><p>Progress: current layer count ${run?.layerScores?.length || 0}</p><p>Score trend points: ${(data.trends || []).length}</p>`;
    return;
  }
  if (view === "ciso") {
    mount.innerHTML = `<h3>Risk View</h3><p>Trust Label: ${esc(run?.trustLabel || "N/A")}</p><p>Failure risk: ${Number(data.indices?.overallFailureRisk || 0).toFixed(3)}</p>`;
    return;
  }
  mount.innerHTML = `<h3>Engineer View</h3><p>Overall: ${Number(data.overall || 0).toFixed(2)}</p><p>Questions: ${run?.questionScores?.length || 0}</p>`;
}

function renderSimpleDomainBreakdown(data) {
  const mount = document.getElementById("domain-breakdown");
  if (!mount) return;
  const layers = Array.isArray(data.latestRun?.layerScores) ? data.latestRun.layerScores : [];
  mount.innerHTML = layers
    .map((layer) => `<div class="domain-row"><span class="domain-name">${esc(layer.layerName)}</span><div class="domain-bar"><div class="domain-fill" style="width:${(Number(layer.avgFinalLevel || 0) / 5) * 100}%"></div></div><span class="domain-score">${Number(layer.avgFinalLevel || 0).toFixed(1)}/5</span></div>`)
    .join("");
}

function renderApprovalsSummary(data) {
  const el = document.getElementById("approvals-summary");
  const row = data.approvalsSummary || {
    requested: 0,
    approved: 0,
    denied: 0,
    expired: 0,
    consumed: 0,
    replayAttempts: 0
  };
  el.innerHTML = `
    <div>Requested: <strong>${row.requested}</strong></div>
    <div>Approved: <strong>${row.approved}</strong></div>
    <div>Denied: <strong>${row.denied}</strong></div>
    <div>Expired: <strong>${row.expired}</strong></div>
    <div>Consumed: <strong>${row.consumed}</strong></div>
    <div>Replay Attempts: <strong>${row.replayAttempts}</strong></div>
  `;
}

function renderBenchmarkSummary(data) {
  const el = document.getElementById("benchmark-summary");
  const row = data.benchmarksSummary || {
    count: 0,
    percentileOverall: 0
  };
  el.innerHTML = `
    <div>Imported Benchmarks: <strong>${row.count}</strong></div>
    <div>Overall Percentile: <strong>${row.percentileOverall.toFixed(2)}%</strong></div>
  `;
}

function hashText(input) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function drawQrLike(canvas, text) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = 29;
  const cell = Math.floor(Math.min(canvas.width, canvas.height) / size);
  const offsetX = Math.floor((canvas.width - cell * size) / 2);
  const offsetY = Math.floor((canvas.height - cell * size) / 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const finder = (fx, fy) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(offsetX + fx * cell, offsetY + fy * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = "#fff";
    ctx.fillRect(offsetX + (fx + 1) * cell, offsetY + (fy + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = "#000";
    ctx.fillRect(offsetX + (fx + 2) * cell, offsetY + (fy + 2) * cell, 3 * cell, 3 * cell);
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);

  let seed = hashText(text || "amc");
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inFinder = (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
      if (inFinder) continue;
      if ((next() & 3) === 0) {
        ctx.fillStyle = "#000";
        ctx.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
      }
    }
  }
}

function renderStudioHome(data) {
  const el = document.getElementById("studio-home");
  const studio = data.studioHome || {};
  const agents = Array.isArray(studio.agents) ? studio.agents : [];
  const lines = [
    `Studio: ${studio.running ? "running" : "stopped"}`,
    `Vault: ${studio.vaultUnlocked ? "unlocked" : "locked"}`,
    `Config trust: ${studio.untrustedConfig ? "UNTRUSTED CONFIG" : "trusted"}`,
    `Action policy sig: ${studio.actionPolicySignature || "MISSING"}`,
    `Tools sig: ${studio.toolsSignature || "MISSING"}`,
    studio.gatewayUrl ? `Gateway: ${studio.gatewayUrl}` : "Gateway: n/a",
    studio.proxyUrl ? `Proxy: ${studio.proxyUrl}` : "Proxy: disabled",
    studio.dashboardUrl ? `Dashboard URL: ${studio.dashboardUrl}` : `Dashboard URL: ${window.location.origin}`
  ];
  const rows = agents
    .map((agent) => {
      const overall = typeof agent.overall === "number" ? agent.overall.toFixed(2) : "n/a";
      const trust = esc(agent.trustLabel || "n/a");
      const provider = esc(agent.lastProvider || "unknown");
      const model = esc(agent.lastModel || "unknown");
      return `<li><strong>${esc(agent.id)}</strong> score ${overall} trust ${trust} provider ${provider} model ${model}</li>`;
    })
    .join("");
  const executions = Array.isArray(studio.toolhubExecutions) ? studio.toolhubExecutions : [];
  const executionRows = executions
    .map((row) => {
      const when = row.ts ? new Date(row.ts).toISOString() : "unknown";
      return `<li><strong>${esc(row.toolName || "tool")}</strong> ${esc(row.effectiveMode || "SIMULATE")} (requested ${esc(row.requestedMode || "n/a")}) @ ${esc(when)}</li>`;
    })
    .join("");
  el.innerHTML = `<p>${lines.map((line) => esc(line)).join(" | ")}</p><ul class="list">${rows || "<li>No agents</li>"}</ul><h3>Recent ToolHub Executions</h3><ul class="list">${executionRows || "<li>No recent executions</li>"}</ul>`;
  const qrCanvas = document.getElementById("studio-qr");
  drawQrLike(qrCanvas, studio.dashboardUrl || window.location.href);
}

(async function bootstrap() {
  const data = await loadJson("./data.json");
  renderSummary(data);
  renderStudioHome(data);
  renderRadar(document.getElementById("radar"), data.latestRun.layerScores);
  renderTimeline(document.getElementById("timeline"), data.trends);
  renderHeatmap(document.getElementById("heatmap"), data.latestRun.questionScores, data.targetMapping, (qid) => {
    renderQuestionDetail(document.getElementById("question-detail"), data, qid);
  });
  renderQuestionDetail(document.getElementById("question-detail"), data, data.latestRun.questionScores[0]?.questionId);
  renderIndices(data);
  renderAssurance(data);
  renderValueSummary(data);
  renderValueGaps(data);
  renderApprovalsSummary(data);
  renderBenchmarkSummary(data);
  renderEvidenceGaps(data);
  renderEoc(document.getElementById("eoc"), data.eoc);
  renderSimpleTeamView(data);
  renderSimpleDomainBreakdown(data);
})();
