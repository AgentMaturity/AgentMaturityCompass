export function renderVerifyPanel() {
  return `
    <div class="card">
      <h4>Validate Artifact</h4>
      <div class="row wrap">
        <label>Schema <input id="standardValidateSchema" placeholder="e.g. amcpass" /></label>
        <label>File (relative to the workspace) <input id="standardValidateFile" placeholder="e.g. exports/agent.amcpass or artifact.json" /></label>
        <button id="standardValidateBtn" data-roles="OWNER,OPERATOR">Validate</button>
      </div>
      <pre id="standardValidateOut" class="scroll muted" role="status" aria-live="polite"></pre>
    </div>
  `;
}

