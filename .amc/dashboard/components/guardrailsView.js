(function () {
  const GROUP_ORDER = ['Security', 'Privacy', 'Quality', 'Compliance'];

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

    if (id.includes('pii') || id.includes('data-exfiltration') || id.includes('credential') || id.includes('compliance-boundary')) {
      return 'Privacy';
    }
    if (category === 'security') return 'Security';
    if (category === 'compliance') return 'Compliance';
    if (category === 'quality' || category === 'cost') return 'Quality';
    if (category === 'safety') return 'Privacy';
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
      enabled: !!row.enabled,
      triggeredCount: Number(row.triggeredCount || row.triggered || 0)
    }));
  }

  async function loadGuardrails(forceRefresh) {
    if (!forceRefresh && Array.isArray(window.__amcGuardrailsCache)) {
      return window.__amcGuardrailsCache;
    }

    const dataGuardrails = normalizeGuardrails((window.G && window.G.data && window.G.data.guardrails) || []);
    if (dataGuardrails.length) {
      window.__amcGuardrailsCache = dataGuardrails;
    }

    if (typeof window.getGuardrails !== 'function') {
      return window.__amcGuardrailsCache || [];
    }

    try {
      const apiRows = await window.getGuardrails();
      const normalized = normalizeGuardrails(apiRows);
      if (normalized.length) {
        window.__amcGuardrailsCache = normalized;
      }
      return window.__amcGuardrailsCache || [];
    } catch {
      return window.__amcGuardrailsCache || [];
    }
  }

  function renderGuardrails(root, guardrails) {
    const grouped = new Map(GROUP_ORDER.map((name) => [name, []]));
    for (const guardrail of guardrails) {
      const group = mapGroup(guardrail);
      if (!grouped.has(group)) {
        grouped.set(group, []);
      }
      grouped.get(group).push(guardrail);
    }

    const enabledCount = guardrails.filter((g) => g.enabled).length;
    const triggeredCount = guardrails.filter((g) => g.triggeredCount > 0).length;
    const totalTriggers = guardrails.reduce((s, g) => s + g.triggeredCount, 0);

    root.innerHTML = `
      <div class="dim-page-header" style="margin-bottom:14px">
        <div class="dim-page-title">Guardrails</div>
        <div class="dim-page-sub">Toggle runtime protections and monitor status by category</div>
      </div>

      <div style="display:flex;gap:16px;margin-bottom:14px;font:400 12px/1 'Inter',sans-serif;color:var(--text-secondary)">
        <span><strong style="color:var(--green)">${enabledCount}</strong> / ${guardrails.length} enabled</span>
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
                  const statusClass = item.triggeredCount > 0 ? 'triggered' : (item.enabled ? 'enabled' : 'disabled');
                  const statusText = item.triggeredCount > 0
                    ? `Triggered ${item.triggeredCount}x`
                    : item.enabled
                      ? 'Enabled'
                      : 'Disabled';
                  return `
                    <div class="guardrail-card" data-guardrail-id="${esc(item.id)}">
                      <div class="guardrail-head">
                        <div>
                          <div class="guardrail-name">${esc(item.name)}</div>
                          <div class="guardrail-desc">${esc(item.description)}</div>
                        </div>
                        <button class="guardrail-toggle ${item.enabled ? 'on' : ''}" data-toggle-id="${esc(item.id)}" role="switch" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="Toggle ${esc(item.name)}">${item.enabled ? 'On' : 'Off'}</button>
                      </div>
                      <div class="guardrail-status ${statusClass}">
                        <span class="guardrail-dot"></span>
                        <span>${esc(statusText)}</span>
                      </div>
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
    if (!item) return;

    const nextEnabled = !item.enabled;

    /* Confirm before disabling security-critical guardrails */
    if (!nextEnabled && SECURITY_GUARDRAILS.includes(id)) {
      const ok = confirm(`⚠️ Disable "${item.name}"?\n\nThis is a security guardrail. Disabling it may expose your agent to risks.`);
      if (!ok) return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '…';

    try {
      if (typeof window.toggleGuardrail === 'function') {
        await window.toggleGuardrail(id, nextEnabled);
      }
      item.enabled = nextEnabled;
      if (typeof window.showViewToast === 'function') {
        window.showViewToast(`${item.name}: ${nextEnabled ? 'enabled' : 'disabled'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (typeof window.showViewToast === 'function') {
        const fallback = nextEnabled ? `amc guardrails enable ${id}` : `amc guardrails disable ${id}`;
        window.showViewToast(`${msg} — fallback: ${fallback}`);
      }
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      buildGuardrails();
    }
  }

  async function buildGuardrails() {
    const root = document.getElementById('sec-guardrails');
    if (!root) return;

    const guardrails = await loadGuardrails(false);
    if (!guardrails.length) {
      root.innerHTML = '<div class="empty"><span class="empty-i">🛡️</span><span class="empty-t">No guardrail metadata available yet.</span></div>';
      return;
    }

    renderGuardrails(root, guardrails);

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
