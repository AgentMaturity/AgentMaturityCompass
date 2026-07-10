(function () {
  const GROUP_ORDER = ['Security', 'Privacy', 'Safety', 'Quality', 'Compliance'];

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function prettyName(id) {
    return String(id || '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function mapGroup(guardrail) {
    const id = String(guardrail.id || guardrail.name || '').toLowerCase();
    const category = String(guardrail.category || '').toLowerCase();

    if (id.includes('pii') || id.includes('data-exfiltration')) {
      return 'Privacy';
    }
    if (category === 'security') return 'Security';
    if (category === 'compliance') return 'Compliance';
    if (category === 'quality' || category === 'cost') return 'Quality';
    if (category === 'safety') return 'Safety';
    return 'Quality';
  }

  function guardrailId(guardrail) {
    return String(guardrail.id || guardrail.name || 'guardrail');
  }

  function normalizeGuardrails(rows) {
    return (rows || []).map((row) => ({
      id: guardrailId(row),
      name: prettyName(row.id || row.name),
      description: row.description || 'No description available.',
      category: row.category || 'quality',
      enabled: !!row.effective,
      effective: !!row.effective,
      requestedEnabled: !!row.requestedEnabled,
      mutable: !!row.mutable,
      trusted: !!row.trusted,
      binding: row.binding || null,
      source: row.source || 'none',
      reason: row.reason || 'No effective runtime binding.',
      triggeredCount: Number(row.triggeredCount || row.triggered || 0)
    }));
  }

  function catalogFallbackGuardrails() {
    return normalizeGuardrails((window.G && window.G.data && window.G.data.guardrails) || []).map((row) => ({
      ...row,
      enabled: false,
      effective: false,
      requestedEnabled: false,
      mutable: false,
      trusted: false,
      source: 'catalog-only',
      reason: 'Live integrity verification is unavailable; this build snapshot cannot establish effective runtime state.'
    }));
  }

  async function loadGuardrails() {
    if (typeof window.getGuardrails !== 'function') {
      throw new Error('Live guardrail API is unavailable.');
    }

    try {
      const apiRows = await window.getGuardrails();
      const normalized = normalizeGuardrails(apiRows);
      if (!normalized.length) {
        throw new Error('Live guardrail API returned no catalog rows.');
      }
      window.__amcGuardrailsCache = normalized;
      return normalized;
    } catch (error) {
      window.__amcGuardrailsCache = null;
      throw error;
    }
  }

  function renderGuardrails(root, guardrails, integrityError) {
    const grouped = new Map(GROUP_ORDER.map((name) => [name, []]));
    for (const guardrail of guardrails) {
      const group = mapGroup(guardrail);
      if (!grouped.has(group)) {
        grouped.set(group, []);
      }
      grouped.get(group).push(guardrail);
    }

    const enabledCount = guardrails.filter((g) => g.effective).length;
    const boundCount = guardrails.filter((g) => g.mutable).length;
    const triggeredCount = guardrails.filter((g) => g.triggeredCount > 0).length;
    const totalTriggers = guardrails.reduce((s, g) => s + g.triggeredCount, 0);

    root.innerHTML = `
      <div class="dim-page-header" style="margin-bottom:14px">
        <div class="dim-page-title">Guardrails</div>
        <div class="dim-page-sub">Signed control intent, effective runtime bindings, and catalog boundaries</div>
      </div>

      ${integrityError ? `<div class="guardrail-integrity-error" role="alert"><strong>Live integrity unavailable.</strong> ${esc(integrityError)} Controls are read-only until signed runtime state verifies.</div>` : ''}

      <div style="display:flex;gap:16px;margin-bottom:14px;font:400 12px/1 'Inter',sans-serif;color:var(--text-secondary)">
        <span><strong style="color:var(--green)">${enabledCount}</strong> effective</span>
        <span><strong>${boundCount}</strong> runtime-bound / ${guardrails.length} cataloged</span>
        <span><strong style="color:${triggeredCount > 0 ? 'var(--amber)' : 'var(--text-tertiary)'}">${totalTriggers}</strong> triggers across <strong>${triggeredCount}</strong> guardrails</span>
      </div>

      ${GROUP_ORDER.map((group) => {
        const rows = grouped.get(group) || [];
        return `
          <div class="row c1" style="margin-bottom:14px">
            <div class="card">
              <div class="ch"><span class="ch-dot"></span>${esc(group)}</div>
              <div class="guardrail-grid">
                ${rows.length ? rows.map((item) => {
                  const statusClass = item.triggeredCount > 0 ? 'triggered' : (item.effective ? 'enabled' : 'disabled');
                  const statusText = item.triggeredCount > 0
                    ? `Triggered ${item.triggeredCount}x`
                    : !item.mutable
                      ? 'Catalog only'
                      : item.effective
                        ? `Effective · ${item.trusted ? 'verified' : 'unverified'}`
                        : item.requestedEnabled
                          ? 'Requested · not effective'
                          : 'Inactive';
                  const toggleTitle = item.mutable
                    ? `${item.requestedEnabled ? 'Remove' : 'Add'} signed control request`
                    : item.reason;
                  return `
                    <div class="guardrail-card" data-guardrail-id="${esc(item.id)}">
                      <div class="guardrail-head">
                        <div>
                          <div class="guardrail-name">${esc(item.name)}</div>
                          <div class="guardrail-desc">${esc(item.description)}</div>
                        </div>
                        <button class="guardrail-toggle ${item.requestedEnabled ? 'on' : ''}" data-toggle-id="${esc(item.id)}" role="switch" aria-checked="${item.requestedEnabled ? 'true' : 'false'}" aria-label="Request ${esc(item.name)}" title="${esc(toggleTitle)}" ${item.mutable ? '' : 'disabled'}>${item.mutable ? (item.requestedEnabled ? 'On' : 'Off') : 'N/A'}</button>
                      </div>
                      <div class="guardrail-status ${statusClass}">
                        <span class="guardrail-dot"></span>
                        <span>${esc(statusText)}</span>
                      </div>
                      <div class="guardrail-desc" style="margin-top:7px">${esc(item.reason)}</div>
                      ${item.binding ? `<div class="guardrail-desc" style="margin-top:4px;font-family:'Space Mono',monospace">${esc(item.binding)}</div>` : ''}
                    </div>
                  `;
                }).join('') : '<div class="empty"><span class="empty-i">🛡️</span><span class="empty-t">No guardrails in this category.</span></div>'}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    `;
  }

  const SECURITY_GUARDRAILS = ['prompt-injection-detection', 'data-exfiltration-guard', 'rate-limiter', 'output-toxicity-filter'];

  async function onToggle(id, button) {
    const guardrails = window.__amcGuardrailsCache || [];
    const item = guardrails.find((row) => row.id === id);
    if (!item || !item.mutable) return;

    const nextEnabled = !item.requestedEnabled;

    /* Confirm before disabling security-critical guardrails */
    if (!nextEnabled && SECURITY_GUARDRAILS.includes(id)) {
      const ok = confirm(`Remove the signed request for "${item.name}"?\n\nA separately signed Runtime Firewall policy remains authoritative.`);
      if (!ok) return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '…';

    try {
      if (typeof window.toggleGuardrail === 'function') {
        await window.toggleGuardrail(id, nextEnabled);
      }
      if (typeof window.showViewToast === 'function') {
        window.showViewToast(`${item.name}: signed request ${nextEnabled ? 'added' : 'removed'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (typeof window.showViewToast === 'function') {
        const fallback = nextEnabled ? `amc guardrails enable ${id}` : `amc guardrails disable ${id}`;
        window.showViewToast(`${msg} — fallback: ${fallback}`);
      }
    } finally {
      window.__amcGuardrailsCache = null;
      button.disabled = false;
      button.textContent = originalText;
      buildGuardrails(true);
    }
  }

  async function buildGuardrails(forceRefresh) {
    const root = document.getElementById('sec-guardrails');
    if (!root) return;

    let guardrails;
    let integrityError = null;
    try {
      guardrails = await loadGuardrails(!!forceRefresh);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      integrityError = message || 'The live guardrail state could not be verified.';
      guardrails = catalogFallbackGuardrails();
    }
    if (!guardrails.length) {
      root.innerHTML = `<div class="guardrail-integrity-error" role="alert"><strong>Live integrity unavailable.</strong> ${esc(integrityError || 'No guardrail metadata is available.')} Controls are disabled.</div>`;
      return;
    }

    renderGuardrails(root, guardrails, integrityError);

    root.querySelectorAll('[data-toggle-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-toggle-id');
        if (!id) return;
        onToggle(id, button);
      });
    });
  }

  window.buildGuardrails = buildGuardrails;
})();
