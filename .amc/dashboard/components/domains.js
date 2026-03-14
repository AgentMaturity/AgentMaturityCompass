(function () {
  const DOMAIN_VISUALS = {
    environment: { icon: '🌿', desc: 'Farm-to-fork, textiles, materials, utilities' },
    health: { icon: '🏥', desc: 'Digital health, wellness, clinical, pharma' },
    wealth: { icon: '💰', desc: 'Future of work, payments, circular economy' },
    education: { icon: '📚', desc: 'K-12, higher ed, skills, differently abled' },
    mobility: { icon: '🚀', desc: 'Communities, ports, real estate, virtual' },
    technology: { icon: '🔬', desc: 'AI, networked ecosystems, infotainment' },
    governance: { icon: '⚖️', desc: 'Digital rights, democracy, citizen services' }
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function titleize(id) {
    return String(id || '')
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function riskClass(tier) {
    if (tier === 'critical') return 'critical';
    if (tier === 'very-high') return 'very-high';
    if (tier === 'high') return 'high';
    return 'elevated';
  }

  function getDomainData() {
    const data = (window.G && window.G.data) || {};
    const domains = Array.isArray(data.domains) ? data.domains : [];
    const packs = Array.isArray(data.industryPacks) ? data.industryPacks : [];

    if (domains.length) {
      return { domains, packs };
    }

    const fallback = [
      { id: 'environment', name: 'Environment', packCount: 6, description: DOMAIN_VISUALS.environment.desc },
      { id: 'health', name: 'Health', packCount: 7, description: DOMAIN_VISUALS.health.desc },
      { id: 'wealth', name: 'Wealth', packCount: 5, description: DOMAIN_VISUALS.wealth.desc },
      { id: 'education', name: 'Education', packCount: 5, description: DOMAIN_VISUALS.education.desc },
      { id: 'mobility', name: 'Mobility', packCount: 5, description: DOMAIN_VISUALS.mobility.desc },
      { id: 'technology', name: 'Technology', packCount: 5, description: DOMAIN_VISUALS.technology.desc },
      { id: 'governance', name: 'Governance', packCount: 5, description: DOMAIN_VISUALS.governance.desc }
    ];

    return { domains: fallback, packs: [] };
  }

  function renderAssessResult(container, pack, result) {
    if (!container) return;
    const score = typeof result.score === 'number'
      ? result.score
      : typeof result.percentage === 'number'
        ? result.percentage / 20
        : 0;
    const level = result.level || (score >= 4.2 ? 'L5' : score >= 3.6 ? 'L4' : score >= 3 ? 'L3' : score >= 2 ? 'L2' : 'L1');
    const gaps = Array.isArray(result.complianceGaps) ? result.complianceGaps : [];
    const warnings = Array.isArray(result.regulatoryWarnings) ? result.regulatoryWarnings : [];

    container.innerHTML = `
      <div class="assess-result">
        <div class="assess-top">
          <div>
            <div class="assess-title">Assessment: ${esc(pack.name)}</div>
            <div class="assess-sub">Domain: ${esc(titleize(pack.domain || pack.stationId || 'general'))}</div>
          </div>
          <div class="assess-score-wrap">
            <div class="assess-score">${score.toFixed(1)}</div>
            <div class="assess-level">${esc(String(level))}</div>
          </div>
        </div>
        <div class="assess-metrics">
          <span><strong>${gaps.length}</strong> compliance gaps</span>
          <span><strong>${warnings.length}</strong> regulatory warnings</span>
        </div>
        <div class="assess-gaps">
          ${(gaps.length ? gaps : ['No critical gaps returned from this assessment.']).slice(0, 6).map((gap, idx) => {
            const text = typeof gap === 'string' ? gap : (gap && gap.message) || JSON.stringify(gap);
            const severity = typeof gap === 'object' && gap && gap.severity ? String(gap.severity) : (idx < 2 ? 'high' : 'elevated');
            return `<div class="assess-gap"><span class="risk-badge ${esc(riskClass(severity))}">${esc(severity)}</span><span>${esc(text)}</span></div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function localAssess(pack) {
    const base = {
      critical: 2.8,
      'very-high': 3.1,
      high: 3.4,
      elevated: 3.8
    };
    const score = base[pack.riskTier] || 3.2;
    const complianceGaps = (pack.regulatoryBasis || []).slice(0, 3).map((ref) => `Need stronger evidence linkage for ${ref}.`);
    const regulatoryWarnings = (pack.regulatoryBasis || []).slice(0, 2).map((ref) => `Validate controls against ${ref}.`);
    return {
      score,
      level: score >= 4 ? 'L4' : score >= 3 ? 'L3' : 'L2',
      complianceGaps,
      regulatoryWarnings
    };
  }

  function getApplyPreview(pack, domain) {
    const refs = (pack.regulatoryBasis || []).slice(0, 3);
    return [
      `Enable ${domain.name || titleize(domain.id)} guardrails and policy profile`,
      `Add ${pack.name} pack configuration and target hints`,
      `Activate framework checks: ${refs.length ? refs.join(', ') : 'domain defaults'}`
    ];
  }

  function openApplyModal(pack, domain) {
    const modal = document.getElementById('domain-apply-modal');
    if (!modal) return;

    const preview = getApplyPreview(pack, domain);
    modal.innerHTML = `
      <div class="apply-modal-card">
        <div class="apply-modal-header">
          <div>
            <div class="apply-modal-title">Apply ${esc(pack.name)} to agent?</div>
            <div class="apply-modal-sub">Domain: ${esc(domain.name || titleize(domain.id))}</div>
          </div>
          <button class="apply-modal-close" data-close="1" aria-label="Close">×</button>
        </div>
        <div class="apply-modal-body">
          <div class="apply-modal-label">This will configure:</div>
          <ul class="apply-preview-list">
            ${preview.map((item) => `<li>${esc(item)}</li>`).join('')}
          </ul>
          <div class="apply-modal-label">Dry-run preview</div>
          <pre class="apply-preview-code">{
  "domain": "${esc(domain.id)}",
  "pack": "${esc(pack.id)}",
  "agent": "${esc((window.G && window.G.data && window.G.data.agentId) || 'default')}",
  "dryRun": true
}</pre>
        </div>
        <div class="apply-modal-actions">
          <button class="action-btn ghost" data-close="1">Cancel</button>
          <button class="action-btn" id="domain-apply-confirm">Apply</button>
        </div>
      </div>
    `;
    modal.classList.add('open');

    modal.querySelectorAll('[data-close="1"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modal.classList.remove('open');
      });
    });

    const applyBtn = document.getElementById('domain-apply-confirm');
    if (!applyBtn) return;
    applyBtn.addEventListener('click', async () => {
      const original = applyBtn.textContent;
      applyBtn.textContent = 'Applying…';
      applyBtn.disabled = true;
      try {
        if (typeof window.applyDomain !== 'function') {
          throw new Error('Studio API unavailable. Run: amc up');
        }
        await window.applyDomain(domain.id, (window.G && window.G.data && window.G.data.agentId) || 'default', { packId: pack.id, dryRun: false });
        modal.classList.remove('open');
        if (typeof window.showViewToast === 'function') {
          window.showViewToast(`Applied ${pack.name} to ${(window.G && window.G.data && window.G.data.agentId) || 'default'}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (typeof window.showViewToast === 'function') {
          window.showViewToast(`${msg} — fallback: amc domain apply ${domain.id}`);
        }
      } finally {
        applyBtn.textContent = original;
        applyBtn.disabled = false;
      }
    });
  }

  function buildDomains() {
    const el = document.getElementById('sec-domains');
    if (!el) return;

    const { domains, packs } = getDomainData();
    if (!domains.length) {
      el.innerHTML = '<div class="empty"><span class="empty-i">🏭</span><span class="empty-t">No domain metadata available yet.</span></div>';
      return;
    }

    const state = window.__amcDomainState || { selectedDomain: domains[0].id };
    if (!domains.some((domain) => domain.id === state.selectedDomain)) {
      state.selectedDomain = domains[0].id;
    }
    window.__amcDomainState = state;

    const selectedDomain = domains.find((domain) => domain.id === state.selectedDomain) || domains[0];
    const selectedPacks = packs.filter((pack) => (pack.domain || pack.stationId) === selectedDomain.id);

    el.innerHTML = `
      <div class="dim-page-header" style="margin-bottom:14px">
        <div class="dim-page-title">Domains</div>
        <div class="dim-page-sub">Industry packs, regulatory basis, and one-click domain actions</div>
      </div>

      <div class="domain-grid">
        ${domains.map((domain) => {
          const visual = DOMAIN_VISUALS[domain.id] || { icon: '🏭', desc: domain.description || '' };
          const packCount = domain.packCount != null ? domain.packCount : packs.filter((p) => (p.domain || p.stationId) === domain.id).length;
          return `
            <button class="domain-card ${domain.id === selectedDomain.id ? 'on' : ''}" data-domain="${esc(domain.id)}">
              <div class="domain-card-top">
                <span class="domain-icon">${visual.icon}</span>
                <span class="domain-pack-count">${packCount} packs</span>
              </div>
              <div class="domain-name">${esc(domain.name || titleize(domain.id))}</div>
              <div class="domain-desc">${esc(visual.desc || domain.description || '')}</div>
            </button>
          `;
        }).join('')}
      </div>

      <div class="row c1" style="margin-top:14px">
        <div class="card">
          <div class="ch"><span class="ch-dot"></span>${esc(selectedDomain.name || titleize(selectedDomain.id))} Packs</div>
          <div class="ch-sub">Assess readiness and apply guardrailed domain settings</div>
          <div class="pack-grid" id="domain-pack-grid">
            ${selectedPacks.map((pack) => `
              <div class="pack-card">
                <div class="pack-card-top">
                  <div class="pack-name">${esc(pack.name || titleize(pack.id))}</div>
                  <span class="risk-badge ${esc(riskClass(pack.riskTier))}">${esc(pack.riskTier || 'elevated')}</span>
                </div>
                <div class="pack-desc">${esc(pack.description || '')}</div>
                <div class="pack-meta">
                  <span>${Number(pack.questionCount || 0)} questions</span>
                </div>
                <div class="pack-regs">
                  ${(pack.regulatoryBasis || []).slice(0, 4).map((ref) => `<span class="reg-tag">${esc(ref)}</span>`).join('')}
                </div>
                <div class="pack-actions">
                  <button class="action-btn" data-pack-action="assess" data-pack-id="${esc(pack.id)}">Assess</button>
                  <button class="action-btn ghost" data-pack-action="apply" data-pack-id="${esc(pack.id)}">Apply to Agent</button>
                </div>
              </div>
            `).join('') || '<div class="empty"><span class="empty-i">📦</span><span class="empty-t">No packs found for this domain.</span></div>'}
          </div>
          <div id="domain-assess-result"></div>
        </div>
      </div>
      <div class="apply-modal" id="domain-apply-modal"></div>
    `;

    el.querySelectorAll('.domain-card[data-domain]').forEach((card) => {
      card.addEventListener('click', () => {
        state.selectedDomain = card.getAttribute('data-domain');
        buildDomains();
      });
    });

    el.querySelectorAll('[data-pack-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const packId = btn.getAttribute('data-pack-id');
        const action = btn.getAttribute('data-pack-action');
        const pack = selectedPacks.find((row) => row.id === packId);
        if (!pack) return;

        if (action === 'apply') {
          openApplyModal(pack, selectedDomain);
          return;
        }

        const original = btn.textContent;
        btn.textContent = 'Assessing…';
        btn.disabled = true;
        try {
          let result = null;
          if (typeof window.assessDomain === 'function') {
            result = await window.assessDomain(selectedDomain.id, (window.G && window.G.data && window.G.data.agentId) || 'default');
          }
          if (!result || (typeof result !== 'object')) {
            result = localAssess(pack);
          }
          if (typeof window.showViewToast === 'function') {
            const score = typeof result.score === 'number' ? result.score : (typeof result.percentage === 'number' ? result.percentage / 20 : 0);
            window.showViewToast(`Domain assessed: ${(selectedDomain.name || titleize(selectedDomain.id))} (${score.toFixed(1)}/5)`);
          }
          renderAssessResult(document.getElementById('domain-assess-result'), pack, result);
        } catch (err) {
          const local = localAssess(pack);
          renderAssessResult(document.getElementById('domain-assess-result'), pack, local);
          const msg = err instanceof Error ? err.message : String(err);
          if (typeof window.showViewToast === 'function') {
            window.showViewToast(`${msg} — fallback: amc domain assess ${selectedDomain.id}`);
          }
        } finally {
          btn.textContent = original;
          btn.disabled = false;
        }
      });
    });
  }

  window.buildDomains = buildDomains;
})();
