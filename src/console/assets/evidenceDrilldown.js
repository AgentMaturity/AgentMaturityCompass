function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function qs(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function localCard(params, title, body) {
  if (typeof params.card === "function") {
    return params.card(title, body);
  }
  return `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
}

function badge(value, bad = false) {
  return `<span class="badge ${bad ? "status-bad" : "status-ok"}">${esc(value)}</span>`;
}

function jsonBlock(value) {
  return `<pre class="json-block">${esc(JSON.stringify(value, null, 2))}</pre>`;
}

function linkList(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return `<p class="muted">No source artifact links are attached; the finding remains fail-closed until signed source links are present.</p>`;
  }
  return `<ul>${links.map((link) => {
    if (typeof link === "string") {
      return `<li><a href="${esc(link)}" target="_blank" rel="noreferrer noopener">${esc(link)}</a></li>`;
    }
    const href = link?.href;
    const label = link?.label || link?.kind || href || "artifact";
    const hash = link?.hash ? ` <code>${esc(link.hash)}</code>` : "";
    if (!href) {
      return `<li>${esc(label)}${hash} <span class="muted">not linked</span></li>`;
    }
    return `<li><a href="${esc(href)}" target="_blank" rel="noreferrer noopener">${esc(label)}</a>${hash}</li>`;
  }).join("")}</ul>`;
}

function evidenceRows(rows, stateLabel) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<tr><td colspan="6" class="muted">No ${esc(stateLabel)} evidence preview rows.</td></tr>`;
  }
  return rows.map((row) => `
    <tr>
      <td><code>${esc(row.evidenceId)}</code></td>
      <td><code>${esc(row.eventHash)}</code></td>
      <td><code>${esc(row.writerSig)}</code></td>
      <td>${esc(row.eventType)}</td>
      <td>${esc(row.trustTier)}</td>
      <td>${esc(row.reason || "")}</td>
    </tr>`).join("");
}

function criteriaRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<tr><td colspan="5" class="muted">No criterion preview rows.</td></tr>`;
  }
  return rows.map((row) => `
    <tr>
      <td><code>${esc(row.criterionId)}</code></td>
      <td>${esc(row.criterionType)}</td>
      <td>${badge(row.status, row.status !== "satisfied")}</td>
      <td>${esc([...(row.evidenceRefs || []), ...(row.rejectedEvidenceRefs || [])].join(", "))}</td>
      <td>${esc(row.repairHint || "")}</td>
    </tr>`).join("");
}

function scorableStudioRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<tr><td colspan="9" class="muted">No Scorable or Langfuse observability Studio drilldown rows are attached. Empty findings stay fail-closed until route, source artifact, preview, and signed evidence receipts are present.</td></tr>`;
  }
  return rows.map((row) => {
    const previewBad = row.evidencePreviewState !== "ready";
    const linkCount = row.sourceArtifactLinkCount ?? (row.sourceArtifactLinks || []).length;
    return `
      <tr>
        <td><code>${esc(row.drilldownId)}</code><br><span class="muted">${esc(row.repositoryRef)}</span></td>
        <td><a href="${esc(row.sourceRef)}" target="_blank" rel="noreferrer noopener">source</a><br><code>${esc(row.sourceCommitSha || "")}</code></td>
        <td>${esc(row.studioSurface)}</td>
        <td><code>${esc(row.uiRoutePath)}</code></td>
        <td>${badge(row.evidencePreviewState || "empty", previewBad)}<br>${esc(row.evidencePreviewCount ?? 0)} / ${esc(row.minEvidencePreviewCount ?? "?")}</td>
        <td>${esc(linkCount)} / ${esc(row.minSourceArtifactLinkCount ?? "?")}<br>${linkList(row.sourceArtifactLinks)}</td>
        <td>
          <div>trace <code>${esc(row.tracePreviewHash || "missing")}</code></div>
          <div>receipt <code>${esc(row.receiptPreviewHash || "missing")}</code></div>
          <div>policy <code>${esc(row.policyRulePreviewHash || "missing")}</code></div>
          <div>source artifact <code>${esc(row.sourceArtifactPreviewHash || "missing")}</code></div>
          <div>empty state <code>${esc(row.emptyStateHash || "missing")}</code></div>
          <div>error state <code>${esc(row.errorStateHash || "missing")}</code></div>
        </td>
        <td>${badge(row.status, row.status !== "satisfied")}<br><span class="muted">signed evidence: ${esc((row.evidenceRefs || []).join(", ") || "none")}</span></td>
        <td>${esc(row.repairHint || "")}</td>
      </tr>`;
  }).join("");
}

function obsStudioRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<tr><td colspan="9" class="muted">No observability Studio drilldown rows are attached. This empty state is fail-closed until an AMC route, source artifact links, evidence preview, and empty/error-state receipts are present.</td></tr>`;
  }
  return rows.map((row) => {
    const previewBad = row.evidencePreviewState !== "ready";
    const linkCount = row.sourceArtifactLinkCount ?? (row.sourceArtifactLinks || []).length;
    return `
      <tr>
        <td><code>${esc(row.drilldownId)}</code><br><span class="muted">${esc(row.sourceKind)}</span></td>
        <td><a href="${esc(row.sourceRef)}" target="_blank" rel="noreferrer noopener">source</a><br><span class="muted">${esc(row.titleRef || row.venueRef || "metadata")}</span></td>
        <td>${esc(row.openAlexWorkId || "")}</td>
        <td>${row.doi ? `<a href="${esc(row.doi)}" target="_blank" rel="noreferrer noopener">${esc(row.doi)}</a>` : ""}</td>
        <td><code>${esc(row.uiRoutePath)}</code></td>
        <td>${badge(row.evidencePreviewState || "empty", previewBad)}<br>${esc(row.evidencePreviewCount ?? 0)} / ${esc(row.minEvidencePreviewCount ?? "?")}</td>
        <td>${esc(linkCount)} / ${esc(row.minSourceArtifactLinkCount ?? "?")}<br>${linkList(row.sourceArtifactLinks)}</td>
        <td>
          <div>trace <code>${esc(row.tracePreviewHash || "missing")}</code></div>
          <div>reasoning <code>${esc(row.reasoningTracePreviewHash || "missing")}</code></div>
          <div>receipt <code>${esc(row.receiptPreviewHash || "missing")}</code></div>
          <div>evidence <code>${esc(row.evidencePreviewHash || "missing")}</code></div>
          <div>source artifact <code>${esc(row.sourceArtifactPreviewHash || "missing")}</code></div>
          <div>empty state <code>${esc(row.emptyStateHash || "missing")}</code></div>
          <div>error state <code>${esc(row.errorStateHash || "missing")}</code></div>
        </td>
        <td>${badge(row.status, row.status !== "satisfied")}<br><span class="muted">signed evidence: ${esc((row.evidenceRefs || []).join(", ") || "none")}</span><br>${esc(row.repairHint || "")}</td>
      </tr>`;
  }).join("");
}

function genericPreview(title, rows, idKey, fields) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  return `<details class="card"><summary>${esc(title)} (${rows.length})</summary><table><thead><tr>${fields.map((field) => `<th>${esc(field.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${fields.map((field) => `<td>${esc(field.render ? field.render(row) : row[field.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
}

function renderDrilldown(params, data) {
  const statusBad = data.failClosed || data.state !== "ready";
  const surfaceText = (data.surfaces || ["Score", "Shield", "Watch"]).join(" / ");
  const body = `
    <div class="grid two">
      <div>
        <p>${badge(data.state || "empty", statusBad)} ${badge(data.failClosed ? "fail-closed" : "replayable", data.failClosed)} ${badge(data.replayable ? "replayable" : "not replayable", !data.replayable)}</p>
        <p class="muted">${esc(data.message || "Evidence drilldown loaded.")}</p>
        <p><strong>Question:</strong> <code>${esc(data.questionId)}</code> ${esc(data.title || "")}</p>
        <p><strong>Surfaces:</strong> ${esc(surfaceText)}</p>
        <p><strong>Levels:</strong> claimed ${esc(data.levels?.claimed ?? "-")} · supported ${esc(data.levels?.supported ?? "-")} · final ${esc(data.levels?.final ?? "-")}</p>
        <p><strong>Manifest:</strong> <code>${esc(data.manifestHash || "missing")}</code></p>
        <p><strong>Row:</strong> <code>${esc(data.rowHash || "missing")}</code></p>
      </div>
      <div>
        <h4>Source artifact links</h4>
        ${linkList(data.sourceArtifacts)}
      </div>
    </div>
    ${data.repairHint ? `<p><strong>Repair hint:</strong> ${esc(data.repairHint)}</p>` : ""}
    ${(data.missingGateReasons || []).length ? `<h4>Missing gates</h4><ul>${data.missingGateReasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>` : ""}
  `;

  const evidence = `
    <h4>Accepted signed evidence preview</h4>
    <table><thead><tr><th>Evidence</th><th>Event hash</th><th>Writer sig</th><th>Type</th><th>Trust tier</th><th>Reason</th></tr></thead><tbody>${evidenceRows(data.evidencePreview?.accepted, "accepted")}</tbody></table>
    <h4>Rejected evidence preview</h4>
    <table><thead><tr><th>Evidence</th><th>Event hash</th><th>Writer sig</th><th>Type</th><th>Trust tier</th><th>Reason</th></tr></thead><tbody>${evidenceRows(data.evidencePreview?.rejected, "rejected")}</tbody></table>
  `;

  const criteria = `<table><thead><tr><th>Criterion</th><th>Type</th><th>Status</th><th>Evidence refs</th><th>Repair</th></tr></thead><tbody>${criteriaRows(data.criteriaPreview)}</tbody></table>`;

  const studio = `
    <p class="muted">Scorable Studio Drilldown rows use the same AMC-owned evidenceDrilldown route. Source links point to live repository artifacts; no upstream UI/prose/assets/code are embedded.</p>
    <table><thead><tr><th>Drilldown</th><th>Source</th><th>Surface</th><th>UI route</th><th>Evidence preview</th><th>Source artifact links</th><th>Preview hashes and states</th><th>Status</th><th>Repair</th></tr></thead><tbody>${scorableStudioRows(data.scorableStudioDrilldownPreview)}</tbody></table>
  `;

  const obsStudio = `
    <p class="muted">Observability Studio drilldown rows bind AMC-owned UI routes to source artifact links, evidence previews, and empty/error-state receipts for product, repository, and paper sources such as Literal AI or Langfuse. Source metadata is shown only as verified identity; no upstream UI/prose/assets/code, SDK, importer, or subsystem is embedded.</p>
    <table><thead><tr><th>Drilldown</th><th>Source</th><th>OpenAlex</th><th>DOI</th><th>UI route</th><th>Evidence preview</th><th>Source artifact links</th><th>Preview hashes and states</th><th>Status</th></tr></thead><tbody>${obsStudioRows(data.obsStudioDrilldownPreview)}</tbody></table>
  `;

  const extras = [
    genericPreview("Rubric lens", data.rubricLensPreview, "rubricId", [
      { label: "Rubric", key: "rubricId" },
      { label: "Score", key: "score0to100" },
      { label: "Grade", key: "grade" },
    ]),
    genericPreview("RAG flow", data.ragFlowPreview, "flowId", [
      { label: "Flow", key: "flowId" },
      { label: "Backend", key: "vectorSearchBackend" },
      { label: "Status", key: "status" },
    ]),
    genericPreview("Landscape lens", data.landscapeLensPreview, "landscapeId", [
      { label: "Source", key: "sourceRef" },
      { label: "Category", key: "category" },
      { label: "Status", key: "status" },
    ]),
  ].filter(Boolean).join("");

  params.root.innerHTML = [
    localCard(params, "Evidence Drilldown", body),
    localCard(params, "Evidence Preview", evidence),
    localCard(params, "Criterion Preview", criteria),
    localCard(params, "Scorable Studio Drilldown", studio),
    localCard(params, "Observability Studio Drilldown", obsStudio),
    extras,
    localCard(params, "Raw drilldown JSON", jsonBlock(data)),
  ].join("");
}

export async function renderEvidenceDrilldownPage(params) {
  const agentId = qs("agent") || params.currentAgent?.() || "default";
  const runId = qs("run") || qs("runId");
  const questionId = qs("question") || qs("questionId");

  if (!runId || !questionId) {
    params.root.innerHTML = localCard(params, "Evidence Drilldown", `
      <p class="muted">Select a Score finding to open its evidence drilldown.</p>
      <p>Required query parameters: <code>run</code> and <code>question</code>. Optional: <code>agent</code>.</p>
      <p>This empty state is intentional; no signed evidence is trusted until a run/question route is provided.</p>
    `);
    return;
  }

  const route = `/api/v1/score/evidence-drilldown/${encodeURIComponent(runId)}/${encodeURIComponent(questionId)}?agentId=${encodeURIComponent(agentId)}`;
  params.root.innerHTML = localCard(params, "Evidence Drilldown", `<p class="muted">Loading <code>${esc(route)}</code>…</p>`);
  try {
    const data = await params.apiGet(route);
    renderDrilldown(params, data);
  } catch (error) {
    params.root.innerHTML = localCard(params, "Evidence Drilldown Error", `
      <p>${badge("error", true)} Could not load the evidence drilldown.</p>
      <p class="muted">AMC fails closed when a signed drilldown route, source artifact links, or evidence preview cannot be loaded.</p>
      <pre>${esc(error?.message || String(error))}</pre>
    `);
  }
}
