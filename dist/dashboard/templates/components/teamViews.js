/**
 * Team-aware dashboard views for AMC
 * Engineer (detailed), Product (progress), CISO (risk), Exec (summary)
 */

export function renderTeamView(data, viewType) {
  const container = document.getElementById('team-view') || document.createElement('div');
  container.id = 'team-view';
  container.innerHTML = '';

  switch (viewType) {
    case 'engineer': return renderEngineerView(container, data);
    case 'product': return renderProductView(container, data);
    case 'ciso': return renderCISOView(container, data);
    case 'exec': return renderExecView(container, data);
    default: return renderEngineerView(container, data);
  }
}

function renderEngineerView(container, data) {
  const run = data.latestRun;
  const html = `
    <div class="view-header"><h2>🔧 Engineer View — Detailed Assessment</h2></div>
    <div class="score-grid">
      <div class="metric"><span class="label">Overall Score</span><span class="value">${data.overall?.toFixed(2) ?? 'N/A'}</span></div>
      <div class="metric"><span class="label">Trust Label</span><span class="value">${run?.trustLabel ?? 'N/A'}</span></div>
      <div class="metric"><span class="label">Integrity Index</span><span class="value">${run?.integrityIndex?.toFixed(3) ?? 'N/A'}</span></div>
      <div class="metric"><span class="label">Questions</span><span class="value">${run?.questionScores?.length ?? 0}</span></div>
    </div>
    <div class="section">
      <h3>Evidence Gaps</h3>
      <ul>${(data.evidenceGaps || []).map(g => `<li><code>${g.questionId}</code>: ${g.reason}</li>`).join('')}</ul>
    </div>
    <div class="section">
      <h3>Layer Breakdown</h3>
      <table><thead><tr><th>Layer</th><th>Avg Level</th><th>Questions</th></tr></thead>
      <tbody>${(run?.layerScores || []).map(l => `<tr><td>${l.layerName}</td><td>${l.avgFinalLevel?.toFixed(2)}</td><td>${l.questionCount}</td></tr>`).join('')}</tbody></table>
    </div>
  `;
  container.innerHTML = html;
  return container;
}

function renderProductView(container, data) {
  const trends = data.trends || [];
  const html = `
    <div class="view-header"><h2>📈 Product View — Progress</h2></div>
    <div class="score-grid">
      <div class="metric"><span class="label">Current Score</span><span class="value">${data.overall?.toFixed(2) ?? 'N/A'}</span></div>
      <div class="metric"><span class="label">Runs Tracked</span><span class="value">${trends.length}</span></div>
      <div class="metric"><span class="label">Trend</span><span class="value">${trends.length >= 2 ? (trends[trends.length-1].overall > trends[0].overall ? '↑ Improving' : '↓ Declining') : '—'}</span></div>
    </div>
    <div class="section">
      <h3>Score Trend</h3>
      <div class="trend-chart">${trends.map(t => {
        const pct = Math.round((t.overall / 5) * 100);
        return `<div class="bar" style="height:${pct}%" title="${t.overall.toFixed(2)}"></div>`;
      }).join('')}</div>
    </div>
    <div class="section">
      <h3>Top Improvement Areas (EOC)</h3>
      <ul>${(data.eoc?.education || []).map(e => `<li>${e}</li>`).join('')}</ul>
    </div>
  `;
  container.innerHTML = html;
  return container;
}

function renderCISOView(container, data) {
  const indices = data.indices || {};
  const html = `
    <div class="view-header"><h2>🛡️ CISO View — Risk Assessment</h2></div>
    <div class="score-grid">
      <div class="metric"><span class="label">Trust Label</span><span class="value ${data.latestRun?.trustLabel === 'HIGH TRUST' ? 'trust-high' : 'trust-low'}">${data.latestRun?.trustLabel ?? 'N/A'}</span></div>
      <div class="metric"><span class="label">Failure Risk</span><span class="value">${indices.overallFailureRisk?.toFixed(3) ?? 'N/A'}</span></div>
      <div class="metric"><span class="label">Assurance Packs</span><span class="value">${(data.assurance || []).length}</span></div>
    </div>
    <div class="section">
      <h3>Security Posture</h3>
      <ul>
        <li>Action Policy Signature: <strong>${data.studioHome?.actionPolicySignature ?? 'UNKNOWN'}</strong></li>
        <li>Tools Signature: <strong>${data.studioHome?.toolsSignature ?? 'UNKNOWN'}</strong></li>
        <li>Vault Unlocked: <strong>${data.studioHome?.vaultUnlocked ? 'Yes' : 'No'}</strong></li>
        <li>Active Freezes: <strong>${(data.studioHome?.activeFreezes || []).length}</strong></li>
      </ul>
    </div>
    <div class="section">
      <h3>Assurance Pack Results</h3>
      <table><thead><tr><th>Pack</th><th>Score</th><th>Pass</th><th>Fail</th></tr></thead>
      <tbody>${(data.assurance || []).map(a => `<tr><td>${a.packId}</td><td>${a.score0to100}%</td><td>${a.passCount}</td><td>${a.failCount}</td></tr>`).join('')}</tbody></table>
    </div>
  `;
  container.innerHTML = html;
  return container;
}

function renderExecView(container, data) {
  const html = `
    <div class="view-header"><h2>📊 Executive Summary</h2></div>
    <div class="exec-score">
      <div class="big-number">${data.overall?.toFixed(1) ?? '—'}<span class="max">/5</span></div>
      <div class="trust-badge ${data.latestRun?.trustLabel === 'HIGH TRUST' ? 'trust-high' : 'trust-low'}">${data.latestRun?.trustLabel ?? 'N/A'}</div>
    </div>
    <div class="score-grid">
      <div class="metric"><span class="label">Value Score</span><span class="value">${data.valueSummary?.valueScore?.toFixed(2) ?? 'N/A'}</span></div>
      <div class="metric"><span class="label">Agents</span><span class="value">${(data.studioHome?.agents || []).length}</span></div>
      <div class="metric"><span class="label">Benchmarks</span><span class="value">${data.benchmarksSummary?.count ?? 0}</span></div>
    </div>
    <div class="section">
      <h3>Key Risks</h3>
      <ul>
        ${(data.evidenceGaps || []).slice(0, 3).map(g => `<li>${g.questionId}: ${g.reason}</li>`).join('')}
        ${data.evidenceGaps?.length === 0 ? '<li>No critical gaps identified</li>' : ''}
      </ul>
    </div>
    <div class="section">
      <h3>30-Day Focus</h3>
      <ul>${(data.eoc?.education || []).slice(0, 3).map(e => `<li>${e}</li>`).join('')}</ul>
    </div>
  `;
  container.innerHTML = html;
  return container;
}

export function renderDomainBreakdown(data) {
  const run = data.latestRun;
  if (!run || !run.layerScores) return '<p style="color:#4a7a52">No data available</p>';
  
  return `
    <div class="domain-breakdown">
      <h3>Domain Breakdown</h3>
      ${run.layerScores.map(layer => {
        const pct = (layer.avgFinalLevel / 5) * 100;
        return `
          <div class="domain-row">
            <span class="domain-name">${layer.layerName}</span>
            <div class="domain-bar"><div class="domain-fill" style="width:${pct}%"></div></div>
            <span class="domain-score">${layer.avgFinalLevel.toFixed(1)}/5</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function renderExportButtons() {
  return `
    <div class="export-actions">
      <button onclick="window.amcExportMarkdown()">📄 Export Markdown</button>
      <button onclick="window.print()">🖨️ Export PDF</button>
    </div>
  `;
}
