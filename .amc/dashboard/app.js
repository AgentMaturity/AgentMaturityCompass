/* AMC Dashboard v14 — State-of-the-Art */
const G = { data:null, section:'overview', view:'engineer', hm:false, af:false, ef:false, ff:false, df:false, gf:false, studioOnline:null };
const esc = v => String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt = (n,d=2) => typeof n==='number' ? n.toFixed(d) : '—';
const escJs = v => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/* ── SEMANTIC COLOR SYSTEM ────────────────────────── */
function scoreColor(score, max = 5) {
  const pct = score / max;
  if (pct >= 0.6) return 'var(--green)';
  if (pct >= 0.4) return 'var(--amber)';
  return 'var(--red)';
}
function scoreClass(score, max = 5) {
  const pct = score / max;
  if (pct >= 0.6) return 'hi';
  if (pct >= 0.4) return 'md';
  return 'lo';
}
/* Legacy aliases */
const score_hi = () => 'var(--green)';
const score_mid = () => 'var(--amber)';
const score_lo = () => 'var(--red)';

function tc(lbl) {
  const l = (lbl||'').toUpperCase();
  if (l.includes('HIGH')||l.includes('RELIABLE')) return 'hi';
  if (l.includes('LOW')||l.includes('UNRELIABLE')||l.includes('DO NOT')) return 'lo';
  return 'md';
}

async function xfetch(p) { const r=await fetch(p); if(!r.ok) throw new Error(p+':'+r.status); return r.json(); }

/* ── ONBOARDING ───────────────────────────────────── */
const ONBOARD_STEPS = [
  { icon: '🧭', title: 'What is AMC?', body: 'AMC scores your AI agents on trustworthiness from actual behavior — not self-reported claims. Think of it as a credit score for AI agents.' },
  { icon: '📊', title: 'Your Trust Score', body: 'The overall score (0–5) reflects how mature and trustworthy your agent is across 5 dimensions: Strategy, Leadership, Culture, Resilience, and Skills. The L0→L5 maturity journey tracks your progress.' },
  { icon: '🔍', title: 'Evidence-Based', body: 'Unlike other frameworks, AMC verifies claims with cryptographic evidence chains. A claimed score of 5/5 might actually be 1/5 without evidence.' },
  { icon: '🏭', title: 'Industry Domains', body: '<strong>40 industry packs</strong> across 7 domains (Health, Education, Environment, Mobility, Governance, Technology, Wealth). Each pack includes regulatory frameworks like HIPAA, GDPR, and EU AI Act. Click <strong>Domains</strong> in the sidebar to browse and apply them.' },
  { icon: '🛡️', title: 'Guardrails & Views', body: 'Toggle <strong>14 runtime guardrails</strong> (prompt injection, toxicity, PII, etc.) from the Guardrails section. Use the <strong>Engineer / CISO / Exec</strong> buttons (top-right) to switch views — each role sees only what matters to them.' },
  { icon: '🚀', title: 'Get Started', body: 'Run <code style="color:var(--accent);font-family:\'JetBrains Mono\',monospace">amc quickscore</code> to get your first score in under 2 minutes. Use <strong>Priority Actions</strong> to improve, or open the <strong>Terminal</strong> to run any AMC command. Press <kbd style="background:var(--bg-overlay);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-size:11px">⌘K</kbd> to search actions.' },
];

let G_onboardStep = 0;

function buildOnboarding() {
  if (localStorage.getItem('amc_onboarded') === '1') return;
  const overlay = document.getElementById('onboard');
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderOnboardStep(0);
  document.getElementById('onboard-skip').addEventListener('click', closeOnboarding);
  document.getElementById('onboard-next').addEventListener('click', () => {
    G_onboardStep++;
    if (G_onboardStep >= ONBOARD_STEPS.length) { closeOnboarding(); return; }
    renderOnboardStep(G_onboardStep);
  });
}

function renderOnboardStep(idx) {
  const step = ONBOARD_STEPS[idx];
  const bodyEl = document.getElementById('onboard-body');
  const dotsEl = document.getElementById('onboard-dots');
  const nextBtn = document.getElementById('onboard-next');
  if (!bodyEl || !dotsEl || !nextBtn) return;

  bodyEl.innerHTML = `
    <div style="transition:all .3s;opacity:0;transform:scale(.88);font-size:32px;margin-bottom:14px" class="ob-icon">${step.icon}</div>
    <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:10px;letter-spacing:-.02em">${esc(step.title)}</div>
    <div style="font-size:13px;color:var(--text-secondary);line-height:1.65">${step.body}</div>
  `;
  requestAnimationFrame(() => {
    const icon = bodyEl.querySelector('.ob-icon');
    if (icon) { icon.style.opacity = '1'; icon.style.transform = 'scale(1)'; }
  });

  nextBtn.textContent = idx === ONBOARD_STEPS.length - 1 ? "Let's Go →" : 'Next →';

  dotsEl.innerHTML = ONBOARD_STEPS.map((_, i) =>
    `<div class="onboard-dot ${i === idx ? 'on' : ''}" data-step="${i}" style="cursor:pointer"></div>`
  ).join('');
  dotsEl.querySelectorAll('.onboard-dot').forEach(d => {
    d.addEventListener('click', () => { G_onboardStep = +d.dataset.step; renderOnboardStep(G_onboardStep); });
  });
}

function closeOnboarding() {
  localStorage.setItem('amc_onboarded', '1');
  const ov = document.getElementById('onboard');
  if (ov) {
    ov.style.opacity = '0'; ov.style.transition = 'opacity .25s ease';
    setTimeout(() => { ov.style.display = 'none'; ov.style.opacity = ''; }, 250);
  }
}

function resetOnboarding() {
  localStorage.removeItem('amc_onboarded');
  G_onboardStep = 0;
  const overlay = document.getElementById('onboard');
  if (overlay) { overlay.style.display = 'flex'; overlay.style.opacity = '1'; renderOnboardStep(0); }
}

/* ── COMMAND PALETTE ──────────────────────────────── */
const CMD_ACTIONS = [
  { label: 'Run quickscore', desc: 'Get a score in under 2 minutes', cmd: 'amc quickscore', nav: 'overview' },
  { label: 'View evidence gaps', desc: 'See what evidence is missing', cmd: 'amc mechanic gap', nav: 'evidence' },
  { label: 'Check assurance packs', desc: 'Review all assurance pack results', cmd: 'amc assurance list', nav: 'assurance' },
  { label: 'Browse domain packs', desc: 'Open industry domain packs', cmd: null, nav: 'domains' },
  { label: 'Manage guardrails', desc: 'Enable or disable runtime guardrails', cmd: 'amc guardrails list', nav: 'guardrails' },
  { label: 'Open terminal', desc: 'View all registered agents', cmd: null, nav: 'fleet' },
  { label: 'View dimensions', desc: 'Explore dimension heatmap', cmd: null, nav: 'dimensions' },
  { label: 'Collect evidence', desc: 'Capture execution evidence logs', cmd: 'amc evidence collect', nav: 'evidence' },
  { label: 'Run formal score', desc: 'Full cryptographic evidence score', cmd: 'amc score formal-spec default', nav: 'overview' },
  { label: 'Fix denied approvals', desc: 'Review and replay denied actions', cmd: 'amc approvals list --denied', nav: 'evidence' },
  { label: 'Export report', desc: 'Generate Markdown report', cmd: 'amc report md', nav: null },
  { label: 'Run mechanic gap', desc: 'Find weakest dimension gaps', cmd: 'amc mechanic gap', nav: 'dimensions' },
];

function buildCommandPalette() {
  if (document.getElementById('cmd-palette')) return;
  const modal = document.createElement('div');
  modal.id = 'cmd-palette';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,.7);
    backdrop-filter:blur(8px);display:none;align-items:flex-start;
    justify-content:center;padding-top:80px;
  `;
  modal.innerHTML = `
    <div style="
      background:var(--bg-raised);border:1px solid var(--border-strong);border-radius:12px;
      width:min(560px,92vw);box-shadow:0 32px 80px rgba(0,0,0,.4);
      overflow:hidden;
    ">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border)">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="var(--text-tertiary)" style="flex-shrink:0">
          <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
        </svg>
        <input id="cmd-input" type="text" placeholder="Search actions…" style="
          flex:1;background:none;border:none;outline:none;
          font:400 14px/1 'Inter',sans-serif;color:var(--text-primary);
        " autocomplete="off" spellcheck="false"/>
        <span style="font:400 11px/1 'JetBrains Mono',monospace;color:var(--text-tertiary)">ESC</span>
      </div>
      <div id="cmd-results" style="max-height:340px;overflow-y:auto;padding:6px"></div>
      <div style="padding:8px 16px 12px;border-top:1px solid var(--border);display:flex;gap:16px;flex-wrap:wrap">
        <span style="font:400 10px/1 'JetBrains Mono',monospace;color:var(--text-tertiary)"><kbd style="background:var(--bg-overlay);border:1px solid var(--border);border-radius:3px;padding:1px 4px;font-size:9px">1</kbd>–<kbd style="background:var(--bg-overlay);border:1px solid var(--border);border-radius:3px;padding:1px 4px;font-size:9px">7</kbd> navigate</span>
        <span style="font:400 10px/1 'JetBrains Mono',monospace;color:var(--text-tertiary)"><kbd style="background:var(--bg-overlay);border:1px solid var(--border);border-radius:3px;padding:1px 4px;font-size:9px">D</kbd> toggle theme</span>
        <span style="font:400 10px/1 'JetBrains Mono',monospace;color:var(--text-tertiary)"><kbd style="background:var(--bg-overlay);border:1px solid var(--border);border-radius:3px;padding:1px 4px;font-size:9px">S</kbd> settings</span>
        <span style="font:400 10px/1 'JetBrains Mono',monospace;color:var(--text-tertiary)"><kbd style="background:var(--bg-overlay);border:1px solid var(--border);border-radius:3px;padding:1px 4px;font-size:9px">?</kbd> tour</span>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const input = modal.querySelector('#cmd-input');
  const results = modal.querySelector('#cmd-results');

  function renderCmdResults(query) {
    const q = query.toLowerCase();
    const filtered = CMD_ACTIONS.filter(a =>
      !q || a.label.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)
    );
    results.innerHTML = filtered.length ? filtered.map((a, i) => `
      <div class="cmd-item" data-i="${i}" data-nav="${a.nav||''}" data-cmd="${esc(a.cmd||'')}" style="
        display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:8px;
        cursor:pointer;transition:background .1s;
      ">
        <div style="flex:1">
          <div style="font:500 13px/1.3 'Inter',sans-serif;color:var(--text-primary)">${esc(a.label)}</div>
          <div style="font:400 11px/1.4 'Inter',sans-serif;color:var(--text-tertiary);margin-top:2px">${esc(a.desc)}</div>
        </div>
        ${a.cmd ? `<code style="font:400 10px/1 'JetBrains Mono',monospace;color:var(--accent);white-space:nowrap">${esc(a.cmd)}</code>` : ''}
      </div>
    `).join('') : `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">No actions found</div>`;

    results.querySelectorAll('.cmd-item').forEach(item => {
      item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-overlay)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('click', () => {
        closeCmdPalette();
        if (item.dataset.nav) nav(item.dataset.nav);
      });
    });
  }

  let cmdActiveIdx = -1;
  function updateCmdActive(items) {
    items.forEach((item, i) => {
      item.style.background = i === cmdActiveIdx ? 'var(--bg-overlay)' : '';
    });
    if (cmdActiveIdx >= 0 && cmdActiveIdx < items.length) {
      items[cmdActiveIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  input.addEventListener('keydown', e => {
    const items = [...results.querySelectorAll('.cmd-item')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cmdActiveIdx = Math.min(cmdActiveIdx + 1, items.length - 1);
      updateCmdActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cmdActiveIdx = Math.max(cmdActiveIdx - 1, 0);
      updateCmdActive(items);
    } else if (e.key === 'Enter' && cmdActiveIdx >= 0 && items[cmdActiveIdx]) {
      items[cmdActiveIdx].click();
    }
  });

  input.addEventListener('input', () => { cmdActiveIdx = -1; renderCmdResults(input.value); });
  modal.addEventListener('click', e => { if (e.target === modal) closeCmdPalette(); });
  renderCmdResults('');
}

function openCmdPalette() {
  const pal = document.getElementById('cmd-palette');
  if (!pal) return;
  pal.style.display = 'flex';
  setTimeout(() => document.getElementById('cmd-input')?.focus(), 50);
}
function closeCmdPalette() {
  const pal = document.getElementById('cmd-palette');
  if (pal) { pal.style.display = 'none'; const inp = document.getElementById('cmd-input'); if (inp) inp.value = ''; }
}

/* ── TOOLTIP SYSTEM ───────────────────────────────── */
let G_tooltip = null;
function initTooltip() {
  const tt = document.createElement('div');
  tt.id = 'g-tooltip';
  tt.style.cssText = `
    position:fixed;z-index:7000;pointer-events:none;opacity:0;
    background:var(--bg-overlay);border:1px solid var(--border-strong);border-radius:8px;
    padding:8px 12px;font:500 11px/1.5 'Inter',sans-serif;color:var(--text-primary);
    box-shadow:0 8px 24px rgba(0,0,0,.3);transition:opacity .12s;
    max-width:240px;white-space:normal;
  `;
  document.body.appendChild(tt);
  G_tooltip = tt;
}
function showTooltip(e, html) {
  if (!G_tooltip) return;
  G_tooltip.innerHTML = html;
  G_tooltip.style.opacity = '1';
  moveTooltip(e);
}
function moveTooltip(e) {
  if (!G_tooltip) return;
  const x = e.clientX + 14, y = e.clientY - 10;
  G_tooltip.style.left = Math.min(x, window.innerWidth - 260) + 'px';
  G_tooltip.style.top = y + 'px';
}
function hideTooltip() {
  if (G_tooltip) G_tooltip.style.opacity = '0';
}

/* ── VIEW TOAST ───────────────────────────────────── */
function showViewToast(text, tone = 'info') {
  let toast = document.getElementById('view-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'view-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = `
      position:fixed;top:64px;left:50%;transform:translateX(-50%) translateY(-8px);
      background:var(--bg-overlay);border:1px solid var(--border-strong);border-radius:8px;
      padding:8px 16px;font:500 12px/1 'Inter',sans-serif;color:var(--text-primary);
      box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:9000;
      opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;
    `;
    document.body.appendChild(toast);
  }
  const errorTone = tone === 'error';
  toast.style.borderColor = errorTone ? 'rgba(248,113,113,.4)' : 'var(--border-strong)';
  toast.style.background = errorTone ? 'rgba(75,18,18,.95)' : 'var(--bg-overlay)';
  toast.style.color = errorTone ? '#fecaca' : 'var(--text-primary)';
  toast.textContent = text;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-8px)';
  }, 1200);
}

/* ── ROLE-BASED VIEW FILTERING ─────────────────────── */
function applyViewFilter(view) {
  /* Sidebar nav: show/hide sections based on role */
  const ROLE_SECTIONS = {
    engineer: ['overview','dimensions','assurance','evidence','domains','guardrails','fleet','settings'],
    ciso:     ['overview','domains','guardrails','assurance','evidence','settings'],
    exec:     ['overview','assurance','settings'],
  };
  const allowed = ROLE_SECTIONS[view] || ROLE_SECTIONS.engineer;
  document.querySelectorAll('.sb-link[data-s]').forEach(link => {
    const sec = link.dataset.s;
    link.style.display = allowed.includes(sec) ? '' : 'none';
  });

  /* Overview: filter detail cards by role */
  const details = document.getElementById('details-body');
  if (details) details.style.display = view === 'exec' ? 'none' : '';

  /* Hero KPIs: exec sees only score + approved */
  document.querySelectorAll('.hero-kpi').forEach((kpi, i) => {
    if (view === 'exec') kpi.style.display = (i === 0 || i === 3) ? '' : 'none';
    else kpi.style.display = '';
  });

  /* Maturity track: always visible for all roles */
  /* Dim bars: hide for exec */
  const dimBars = document.getElementById('score-dim-bars');
  if (dimBars) dimBars.style.display = view === 'exec' ? 'none' : '';

  /* Actions: CISO sees compliance-focused, exec sees summary */
  /* (action list regenerated dynamically by renderNextActions — roles affect which items appear) */

  /* If current section is hidden by new view, navigate to overview */
  if (!allowed.includes(G.section)) nav('overview');
}

/* ── NAV ──────────────────────────────────────────── */
function nav(section) {
  document.querySelectorAll('.sec').forEach(s => {
    s.classList.add('h');
    s.style.opacity = '0';
  });
  const el = document.getElementById('s-' + section);
  if (el) {
    el.classList.remove('h');
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .2s ease';
      el.style.opacity = '1';
    });
  }
  document.querySelectorAll('.sb-link,.bn').forEach(a =>
    a.classList.toggle('on', a.dataset.s === section)
  );
  G.section = section;
  if (section === 'dimensions' && !G.hm) { buildHm(); buildDimCards(); }
  if (section === 'assurance'  && !G.af) { buildAf(); }
  if (section === 'evidence'   && !G.ef) { buildEv(); }
  if (section === 'domains'    && !G.df) { if (typeof window.buildDomains === 'function') window.buildDomains(); G.df = true; }
  if (section === 'guardrails' && !G.gf) { if (typeof window.buildGuardrails === 'function') window.buildGuardrails(); G.gf = true; }
  if (section === 'fleet'      && !G.ff) { buildFleet(); }
}

function initNav() {
  document.querySelectorAll('.sb-link,.bn').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); nav(a.dataset.s); });
  });

  const sbTog = document.getElementById('sb-tog');
  if (sbTog) {
    // Restore sidebar state
    if (localStorage.getItem('amc_sb_collapsed') === '1') {
      document.querySelector('.sidebar')?.classList.add('c');
    }
    sbTog.addEventListener('click', () => {
      const sb = document.querySelector('.sidebar');
      sb.classList.toggle('c');
      localStorage.setItem('amc_sb_collapsed', sb.classList.contains('c') ? '1' : '0');
    });
  }

  const hamBtn = document.getElementById('tb-ham');
  if (hamBtn) hamBtn.addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  document.querySelectorAll('.tb-v').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tb-v').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected','false'); });
      b.classList.add('on'); b.setAttribute('aria-selected','true');
      G.view = b.dataset.v;
      const labels = { engineer: 'Engineering view', product: 'Product view', ciso: 'Governance view', exec: 'Executive view' };
      showViewToast(labels[b.dataset.v] || b.dataset.v);
      applyViewFilter(b.dataset.v);
    });
  });

  /* ⌘K / Ctrl+K */
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const pal = document.getElementById('cmd-palette');
      if (pal && pal.style.display === 'flex') { closeCmdPalette(); } else { openCmdPalette(); }
    }
    if (e.key === 'Escape') { closeCmdPalette(); closeOnboarding(); }
  });

  const helpBtn = document.getElementById('tb-help');
  if (helpBtn) helpBtn.addEventListener('click', resetOnboarding);

  const cmdTrigger = document.getElementById('tb-cmd-trigger');
  if (cmdTrigger) cmdTrigger.addEventListener('click', openCmdPalette);

  const tbSearch = document.getElementById('tb-search');
  if (tbSearch) tbSearch.addEventListener('click', openCmdPalette);

  document.querySelectorAll('.sb-quick-score').forEach(btn => {
    btn.addEventListener('click', () => { handleQuickScore(); });
  });

  /* Details collapsible */
  const detailsToggle = document.getElementById('details-toggle');
  const detailsBody = document.getElementById('details-body');
  if (detailsToggle && detailsBody) {
    detailsToggle.addEventListener('click', () => {
      const collapsed = detailsBody.classList.toggle('hidden');
      detailsToggle.classList.toggle('collapsed', collapsed);
    });
  }
}

/* ── THEME ────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('amc_theme') || 'dark';
  applyTheme(saved);
  const btn = document.getElementById('tb-theme');
  if (btn) btn.addEventListener('click', () => toggleTheme());
  document.querySelectorAll('.theme-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      applyTheme(opt.dataset.t);
      document.querySelectorAll('.theme-opt').forEach(x => x.classList.toggle('on', x.dataset.t === opt.dataset.t));
    });
  });
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('amc_theme', theme);
  const btn = document.getElementById('tb-theme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  document.querySelectorAll('.theme-opt').forEach(x => x.classList.toggle('on', x.dataset.t === theme));
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ── ANIMATE COUNT ────────────────────────────────── */
function animateCount(el, target, duration = 1100) {
  const start = performance.now();
  const from = parseFloat(el.textContent) || 0;
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    /* spring-like easing: overshoot then settle */
    const ease = 1 - Math.pow(1 - p, 4);
    const val = from + (target - from) * ease;
    el.textContent = val.toFixed(1);
    if (p < 1) requestAnimationFrame(step);
    else {
      el.textContent = target.toFixed(1);
      el.style.animation = 'countFlash .6s ease';
    }
  }
  requestAnimationFrame(step);
}

/* ── KEYBOARD SHORTCUTS PANEL ─────────────────────── */
/* ── MOBILE GESTURES ──────────────────────────────── */
function initMobileGestures() {
  const SECTIONS = ['overview','dimensions','assurance','evidence','domains','guardrails','fleet','settings'];
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  const content = document.getElementById('content');
  if (!content) return;

  content.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  content.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    /* Must be a fast horizontal swipe (>80px, <300ms, more horizontal than vertical) */
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 300) {
      const curIdx = SECTIONS.indexOf(G.section);
      if (curIdx < 0) return;
      if (dx < 0 && curIdx < SECTIONS.length - 1) {
        nav(SECTIONS[curIdx + 1]); /* swipe left → next */
      } else if (dx > 0 && curIdx > 0) {
        nav(SECTIONS[curIdx - 1]); /* swipe right → prev */
      }
    }
  }, { passive: true });

  /* Pull-to-refresh */
  let pullStartY = 0, pulling = false;
  content.addEventListener('touchstart', e => {
    if (content.scrollTop === 0) {
      pullStartY = e.changedTouches[0].clientY;
      pulling = true;
    }
  }, { passive: true });
  content.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dy = e.changedTouches[0].clientY - pullStartY;
    if (dy > 120) {
      pulling = false;
      location.reload();
    }
  }, { passive: true });
  content.addEventListener('touchend', () => { pulling = false; }, { passive: true });
}

function buildShortcutsPanel() {
  if (document.getElementById('kb-panel')) return;
  const shortcuts = [
    ['⌘K / Ctrl+K', 'Open command palette'],
    ['?', 'Show onboarding tour'],
    ['1–7', 'Navigate to section (Overview, Dims, Assurance, Evidence, Domains, Guardrails, Terminal)'],
    ['D', 'Toggle dark/light mode'],
    ['Esc', 'Close any modal'],
    ['S', 'Go to Settings'],
  ];
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key;
    if (key === '1') nav('overview');
    if (key === '2') nav('dimensions');
    if (key === '3') nav('assurance');
    if (key === '4') nav('evidence');
    if (key === '5') nav('domains');
    if (key === '6') nav('guardrails');
    if (key === '7') nav('fleet');
    if (key === 'd' || key === 'D') toggleTheme();
    if (key === 's' || key === 'S') nav('settings');
  });
}

/* ── SCORE RENDER ─────────────────────────────────── */
const DIM_DESCRIPTIONS = {
  'Strategic Agent Operations': 'Planning, reasoning, and multi-step task execution',
  'Leadership & Autonomy': 'Self-direction and escalation judgment',
  'Culture & Alignment': 'Value alignment and ethical behavior',
  'Resilience': 'Error recovery and adversarial robustness',
  'Skills': 'Tool use, code generation, knowledge retrieval',
};

const DIM_SHORT = {
  'Strategic Agent Operations': 'Strategy',
  'Leadership & Autonomy': 'Leadership',
  'Culture & Alignment': 'Culture',
  'Resilience': 'Resilience',
  'Skills': 'Skills',
};

function renderScore(d) {
  const overall = d.overall || 0;
  const label = d.latestRun?.trustLabel || '—';
  const trends = d.trends || [];
  const layers = d.latestRun?.layerScores || [];
  const TARGET = 3.0;

  /* Zero-state: first run with no data */
  if (!overall && !layers.length) {
    const cardInner = document.getElementById('score-card-inner');
    if (cardInner) {
      cardInner.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:32px 0">
          <div style="font-size:48px;margin-bottom:16px;opacity:.6">🧭</div>
          <div style="font-size:20px;font-weight:600;color:var(--text-primary);margin-bottom:8px">No score yet</div>
          <div style="font-size:14px;color:var(--text-secondary);max-width:360px;margin:0 auto 20px;line-height:1.6">
            Run your first assessment to see how trustworthy your AI agent really is. Takes under 2 minutes.
          </div>
          <button class="action-btn action-btn-lg" onclick="executeAction('quickscore', this, 'amc quickscore')">
            Run Quickscore ▸
          </button>
        </div>`;
    }
    return;
  }

  /* Animate score ring */
  const ringFill = document.getElementById('score-ring-fill');
  if (ringFill) {
    const pct = Math.min(overall / 5, 1);
    const circ = 2 * Math.PI * 68; // r=68 → 427.26
    const offset = pct > 0 ? circ * (1 - pct) : circ; // stay empty at 0
    ringFill.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.16,1,.3,1)';
    ringFill.setAttribute('stroke-dasharray', circ.toFixed(2));
    ringFill.setAttribute('stroke-dashoffset', circ.toFixed(2));
    requestAnimationFrame(() => setTimeout(() => { ringFill.style.strokeDashoffset = offset.toFixed(2); }, 100));
  }

  /* At zero, ring bg gets a dashed accent treatment */
  const ringBg = document.querySelector('.score-ring-bg');
  if (ringBg) {
    if (overall === 0) {
      ringBg.setAttribute('stroke-dasharray', '8 6');
      ringBg.style.stroke = 'var(--accent)';
      ringBg.style.opacity = '0.25';
    } else {
      ringBg.removeAttribute('stroke-dasharray');
      ringBg.style.stroke = '';
      ringBg.style.opacity = '0.2';
    }
  }

  /* Big number */
  const numEl = document.getElementById('score-num');
  if (numEl) animateCount(numEl, overall);

  /* Trust label */
  const labelEl = document.getElementById('score-label');
  if (labelEl) {
    // Capitalize properly
    const words = label.toLowerCase().split(' ');
    labelEl.textContent = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /* Agent id */
  const agentIdEl = document.getElementById('score-agent-id');
  if (agentIdEl) agentIdEl.textContent = d.agentId || 'default';

  /* Trust badge */
  const badgeEl = document.getElementById('score-trust-badge');
  if (badgeEl) {
    badgeEl.textContent = label;
    badgeEl.className = 'tb-badge ' + scoreClass(overall);
  }

  /* Legacy badge compat */
  document.querySelectorAll('.score-badge').forEach(b => {
    b.textContent = label;
    b.className = 'tb-badge score-badge ' + scoreClass(overall);
  });

  /* Trend */
  const trendEl = document.getElementById('score-trend');
  if (trendEl && trends.length >= 2) {
    const d2 = trends[trends.length-1].overall, d1 = trends[trends.length-2].overall;
    const delta = d2 - d1;
    if (delta > 0.05) trendEl.innerHTML = `<span class="t-up">↑ +${delta.toFixed(2)} since last run</span>`;
    else if (delta < -0.05) trendEl.innerHTML = `<span class="t-dn">↓ ${delta.toFixed(2)} since last run</span>`;
    else trendEl.innerHTML = `<span style="color:var(--text-tertiary)">→ Stable</span>`;
  }

  /* Topbar agent id + freshness */
  document.getElementById('tb-id').textContent = d.agentId || 'default';

  const lastTs = d.trends?.slice(-1)[0]?.ts;
  if (lastTs) {
    const mins = Math.round((Date.now() - lastTs) / 60000);
    const agoStr = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins/60)}h ago` : `${Math.round(mins/1440)}d ago`;
    const fr = document.getElementById('tb-freshness');
    if (fr) fr.textContent = agoStr;
    const sl = document.getElementById('score-last');
    if (sl) sl.textContent = `Last scored: ${agoStr}`;
  }

  /* Dimension bars on right side of score card */
  const dimBarContainer = document.getElementById('score-dim-bars');
  if (dimBarContainer && layers.length) {
    const tgtPct = (TARGET / 5) * 100;
    dimBarContainer.innerHTML = layers.map(l => {
      const pct = (l.avgFinalLevel / 5) * 100;
      const col = scoreColor(l.avgFinalLevel);
      const isWarn = l.avgFinalLevel < TARGET;
      const short = DIM_SHORT[l.layerName] || l.layerName.split(' ')[0];
      return `
        <div class="dim-row-v2">
          <div class="dim-name-v2">
            ${esc(short)}${isWarn ? '<span class="dim-warn">⚠</span>' : ''}
          </div>
          <div class="dim-bar-wrap">
            <div class="dim-bar-fill" style="width:0%;background:${col}" data-pct="${pct}"></div>
            <div class="dim-target-tick" style="left:${tgtPct}%" title="Target: ${TARGET}/5"></div>
          </div>
          <div class="dim-val-v2" style="color:${col}">${l.avgFinalLevel.toFixed(1)}</div>
        </div>`;
    }).join('') +
    `<div class="dim-target-label">
      <span class="dim-target-line"></span>
      <span>Target ${TARGET.toFixed(1)}/5</span>
    </div>`;

    /* Animate bars after a frame */
    requestAnimationFrame(() => {
      dimBarContainer.querySelectorAll('.dim-bar-fill').forEach(bar => {
        const pct = bar.dataset.pct;
        bar.style.transition = 'width 1.2s cubic-bezier(.4,0,.2,1)';
        bar.style.width = pct + '%';
      });
    });
  } else if (dimBarContainer) {
    /* Zero-state: show dim stubs so hero doesn't look empty */
    const DIMS = ['Strategy', 'Leadership', 'Culture', 'Resilience', 'Skills'];
    dimBarContainer.innerHTML = DIMS.map(d => `
      <div class="dim-row-v2">
        <div class="dim-name-v2">${d}</div>
        <div class="dim-bar-wrap">
          <div class="dim-bar-fill" style="width:0%;background:var(--border-strong)"></div>
          <div class="dim-target-tick" style="left:60%" title="Target: 3.0/5"></div>
        </div>
        <div class="dim-val-v2" style="color:var(--text-tertiary)">—</div>
      </div>`).join('') +
      `<div class="dim-target-label"><span class="dim-target-line"></span><span>Target 3.0/5</span></div>`;
  }

  /* Maturity journey track L0–L5 */
  const LEVEL_PCT = [0, 20, 40, 60, 80, 100]; // L0 thru L5
  const levelIndex = Math.min(Math.floor(overall / 5 * 6), 5);
  const levelPct = Math.min((overall / 5) * 100, 100);
  const mtFill = document.getElementById('mt-fill');
  const mtThumb = document.getElementById('mt-thumb');
  if (mtFill && mtThumb) {
    const col = scoreColor(overall);
    mtFill.style.background = `linear-gradient(90deg, var(--accent), ${col})`;
    requestAnimationFrame(() => {
      mtFill.style.transition = 'width 1.6s cubic-bezier(.16,1,.3,1)';
      mtFill.style.width = levelPct + '%';
      mtThumb.style.transition = 'left 1.6s cubic-bezier(.16,1,.3,1)';
      mtThumb.style.left = levelPct + '%';
      mtThumb.style.background = col;
      mtThumb.style.boxShadow = `0 0 10px ${col}`;
    });
  }

  /* KPI sidebar column */
  const kpiCol = document.getElementById('hero-kpis');
  if (kpiCol) {
    const gaps = d.evidenceGaps?.length ?? 0;
    const packs = d.assurance?.length ?? 0;
    const questions = d.latestRun?.questionScores?.length ?? 0;
    const approved = d.approvalsSummary?.approved ?? 0;
    const kpis = [
      { label: 'Questions', value: questions, color: 'var(--accent)', tip: 'Total diagnostic questions scored in latest run' },
      { label: 'Evidence Gaps', value: gaps, color: gaps > 0 ? 'var(--red)' : 'var(--green)', tip: gaps > 0 ? `${gaps} claims lack cryptographic proof — collect evidence to close them` : 'All claims backed by execution evidence' },
      { label: 'Packs Run', value: packs, color: 'var(--amber)', tip: 'Assurance packs completed (sycophancy, hallucination, toxicity, etc.)' },
      { label: 'Approved', value: approved, color: 'var(--green)', tip: 'Human-reviewed decisions that confirm agent behavior' },
    ];
    kpiCol.innerHTML = kpis.map(k => `
      <div class="hero-kpi" title="${esc(k.tip)}">
        <div class="hero-kpi-value" style="color:${k.color}">${k.value}</div>
        <div class="hero-kpi-label">${k.label}</div>
      </div>`).join('');
  }

  /* Legacy ring compat (hidden) */
  const ringN = document.querySelector('.ring-n');
  if (ringN) { ringN.style.color = scoreColor(overall); animateCount(ringN, overall); }

  /* Show getting-started in sidebar if no score */
  const hasScore = overall > 0 || layers.length > 0;
  const sbGs = document.getElementById('sb-getstarted');
  if (sbGs) sbGs.style.display = hasScore ? 'none' : 'block';
}

/* ── DIM BARS (legacy — overview card hidden) ──────── */
function renderDims(d) {
  /* Legacy mount point — populate silently for compat */
  const el = document.getElementById('dim-bars');
  if (!el) return;
  const layers = d.latestRun?.layerScores || [];
  const TARGET = 3.0;
  el.innerHTML = layers.map((l, i) => {
    const pct = (l.avgFinalLevel / 5) * 100;
    const col = scoreColor(l.avgFinalLevel);
    return `<div class="dim-row">
      <div><span class="dim-nm">${esc(l.layerName)}</span></div>
      <div class="dim-trk"><div class="dim-fill" style="width:${pct}%;background:${col}"></div><div class="dim-tgt" style="left:60%"></div></div>
      <span class="dim-v" style="color:${col}">${l.avgFinalLevel.toFixed(1)}</span>
    </div>`;
  }).join('');
}

/* ── DIMENSION CARDS (dimensions page) ─────────────── */
function buildDimCards() {
  const layers = G.data.latestRun?.layerScores || [];
  const grid = document.getElementById('dim-cards-grid');
  if (!grid || !layers.length) return;

  const TARGET = 3.0;
  grid.innerHTML = layers.map((l, i) => {
    const pct = (l.avgFinalLevel / 5) * 100;
    const col = scoreColor(l.avgFinalLevel);
    const desc = DIM_DESCRIPTIONS[l.layerName] || '';
    const isLast = i === layers.length - 1;
    return `<div class="card ${isLast ? 'dim-card-last' : ''}" style="animation-delay:${i*60}ms">
      <div class="sec-label">${esc(DIM_SHORT[l.layerName] || l.layerName.split(' ')[0])}</div>
      <div class="dim-card-name" style="margin-top:4px">${esc(l.layerName)}</div>
      <div class="dim-card-desc">${esc(desc)}</div>
      <div class="dim-card-score-row">
        <div class="dim-card-score-num" style="color:${col}">${l.avgFinalLevel.toFixed(1)}</div>
        <div class="dim-card-bar-wrap">
          <div class="dim-card-bar-fill" style="width:${pct}%;background:${col};transition:width 1s ease"></div>
          <div class="dim-target-tick" style="left:${(TARGET/5)*100}%" title="Target: ${TARGET}/5"></div>
        </div>
      </div>
      <div class="dim-card-target" style="margin-top:6px">
        <span style="color:${l.avgFinalLevel >= TARGET ? 'var(--green)' : 'var(--amber)'}">
          ${l.avgFinalLevel >= TARGET ? '✓ Above target' : `⚠ Target: ${TARGET.toFixed(1)}/5`}
        </span>
      </div>
    </div>`;
  }).join('');
}

async function reloadDashboardData() {
  G.data = await xfetch(`./data.json?ts=${Date.now()}`);
  renderScore(G.data);
  renderDims(G.data);
  renderStats(G.data);
  renderNextActions(G.data);
  renderRadar(G.data);
  renderTimeline(G.data);
  renderAsrSummary(G.data);
  renderApprovals(G.data);
  renderValue(G.data);

  if (G.hm) { buildHm(); buildDimCards(); }
  if (G.af) { buildAf(); }
  if (G.ef) { buildEv(); }
  if (G.df && typeof window.buildDomains === 'function') { window.buildDomains(); }
  if (G.gf && typeof window.buildGuardrails === 'function') { window.buildGuardrails(); }
  if (G.ff) { buildFleet(); }
}

function quickscoreSummary(result) {
  const out = typeof result === 'object' && result ? result : {};
  const nested = typeof out.result === 'object' && out.result ? out.result : out;
  const overall = typeof nested.overall === 'number'
    ? nested.overall
    : typeof nested.overallScore === 'number'
      ? nested.overallScore
      : (G.data?.overall ?? 0);
  const label = typeof nested.trustLabel === 'string'
    ? nested.trustLabel
    : typeof nested.label === 'string'
      ? nested.label
      : (G.data?.latestRun?.trustLabel || 'UPDATED');
  return { overall, label };
}

async function executeAction(action, buttonEl, fallbackCmd = '') {
  const btn = buttonEl && typeof buttonEl === 'object' ? buttonEl : null;
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.classList.add('busy');
    btn.innerHTML = '<span class="spin"></span> Running…';
  }

  try {
    if (action === 'quickscore') {
      if (typeof window.runQuickscore !== 'function') {
        throw new Error('Studio API unavailable. Start with: amc up');
      }
      const result = await window.runQuickscore((G.data && G.data.agentId) || 'default');
      await reloadDashboardData();
      const summary = quickscoreSummary(result);
      showViewToast(`Score updated: ${summary.label} (${summary.overall.toFixed(1)}/5)`);
      return;
    }

    if (action.startsWith('assurance:')) {
      if (typeof window.runAssurancePack !== 'function') {
        throw new Error('Studio API unavailable. Start with: amc up');
      }
      const packId = action.slice('assurance:'.length);
      await window.runAssurancePack(packId, (G.data && G.data.agentId) || 'default');
      await reloadDashboardData();
      showViewToast(`Assurance updated: ${packId}`);
      return;
    }

    if (action === 'guide') {
      if (typeof window.getGuide !== 'function') {
        throw new Error('Studio API unavailable. Start with: amc up');
      }
      await window.getGuide((G.data && G.data.agentId) || 'default');
      showViewToast('Guide refreshed');
      return;
    }

    throw new Error('This action is not wired to API yet.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const fallback = fallbackCmd ? ` — fallback: ${fallbackCmd}` : '';
    showViewToast(`${msg}${fallback}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('busy');
      btn.innerHTML = originalHtml;
    }
  }
}

async function handleQuickScore() {
  const btn = document.querySelector('.sb-quickscore');
  if (!btn) return;
  const label = btn.querySelector('.lbl');
  btn.disabled = true;
  if (label) label.textContent = '⏳ Scoring...';
  try {
    const result = await window.runQuickscore((G.data && G.data.agentId) || 'default');
    await reloadDashboardData();
    const summary = quickscoreSummary(result);
    showViewToast(`Score: ${summary.overall.toFixed(1)}/5.0 — ${summary.label}`);
  } catch (err) {
    showViewToast('Studio not running. Run: amc up', 'error');
  } finally {
    if (label) label.textContent = '⚡ Quick Score';
    btn.disabled = false;
  }
}

async function checkStudioConnectionOnInit() {
  if (typeof window.checkStudio !== 'function') return;
  try {
    const online = await window.checkStudio();
    G.studioOnline = online;
    if (!online) {
      showViewToast('Studio not running. Run: amc up', 'error');
    }
  } catch {
    G.studioOnline = false;
  }
  /* Start continuous monitoring with reconnection badge */
  if (typeof window.startStudioMonitor === 'function') {
    window.startStudioMonitor(15000);
  }
}

window.executeAction = executeAction;
window.handleQuickScore = handleQuickScore;
window.showViewToast = showViewToast;
window.nav = nav;
window.G = G;

/* ── TASK CARDS (new Next Steps render) ────────────── */
function renderNextActions(d) {
  const taskGrid = document.getElementById('task-grid-mount');
  if (!taskGrid) return;

  const actions = [];
  const gaps = d.evidenceGaps?.length || 0;
  const denied = d.approvalsSummary?.denied || 0;
  const score = d.overall || 0;
  const layers = d.latestRun?.layerScores || [];
  const weakest = layers.reduce((min, l) => l.avgFinalLevel < (min?.avgFinalLevel ?? 99) ? l : min, null);

  if (!score || !d.latestRun?.questionScores?.length) {
    actions.push({
      title: 'Run your first quickscore',
      body: 'Kick off a live trust score from Studio in under 2 minutes.',
      cmd: 'amc quickscore',
      action: 'quickscore',
      button: 'Run Quickscore ▸',
      nav: 'overview',
    });
  }
  if (gaps > 0) {
    actions.push({
      title: `Fix ${gaps} evidence gap${gaps > 1 ? 's' : ''}`,
      body: 'Your agent claims capabilities but lacks proof. Collect execution logs to back them up.',
      cmd: 'amc evidence collect',
      action: 'manual',
      button: 'Collect Evidence ▸',
      nav: 'evidence',
    });
  }
  if (denied > 0) {
    actions.push({
      title: `Review ${denied} denied approval${denied > 1 ? 's' : ''}`,
      body: 'Some agent actions were blocked by policy. Review them to fix or update your rules.',
      cmd: 'amc approvals list --denied',
      action: 'manual',
      button: 'Review Approvals ▸',
      nav: 'evidence',
    });
  }
  if (weakest && weakest.avgFinalLevel < 3) {
    const dimShort = DIM_SHORT[weakest.layerName] || weakest.layerName.split(' ')[0];
    actions.push({
      title: `Improve ${dimShort} (${weakest.avgFinalLevel.toFixed(1)}/5)`,
      body: 'This dimension is your weakest area. Run targeted tests to find specific gaps.',
      cmd: `amc mechanic gap --dim ${dimShort.toLowerCase()}`,
      action: 'manual',
      button: 'Run Gap Check ▸',
      nav: 'dimensions',
    });
  }
  const lowPacks = (d.assurance || []).filter(p => p.score0to100 < 75);
  if (lowPacks.length > 0) {
    const candidatePack = lowPacks[0]?.packId;
    actions.push({
      title: `${lowPacks.length} pack${lowPacks.length > 1 ? 's' : ''} below target`,
      body: 'Assurance packs test specific behaviors (like hallucination, injection resistance).',
      cmd: candidatePack ? `amc assurance run ${candidatePack}` : 'amc assurance run --failing',
      action: candidatePack ? `assurance:${candidatePack}` : 'manual',
      button: 'Run Assurance ▸',
      nav: 'assurance',
    });
  }
  if (score < 4 && actions.length < 4) {
    actions.push({
      title: 'Refresh growth guide',
      body: 'Get an updated quick guide for your next maturity step.',
      cmd: 'amc guide --quick',
      action: 'guide',
      button: 'Get Guide ▸',
      nav: 'overview',
    });
  }

  if (!actions.length) {
    taskGrid.innerHTML = `<div class="task-card" style="border-left:2px solid var(--green)">
      <div class="task-num">✓</div>
      <div class="task-title">All clear</div>
      <div class="task-body">Score ${score.toFixed(1)}/5.0 — looking good.</div>
      <div class="task-cmd"><button class="action-btn" onclick="event.stopPropagation();executeAction('quickscore', this, 'amc quickscore')">Run Quickscore ▸</button></div>
    </div>`;
    return;
  }

  const PRIORITY_COLORS = ['var(--red)', 'var(--amber)', 'var(--accent)', 'var(--text-tertiary)'];

  taskGrid.innerHTML = actions.slice(0, 5).map((a, i) => `
    <div class="action-row ${i === 0 ? 'action-row--hot' : ''}" onclick="nav('${escJs(a.nav)}')">
      <div class="action-num" style="background:${PRIORITY_COLORS[i] ?? 'var(--text-tertiary)'}22;color:${PRIORITY_COLORS[i] ?? 'var(--text-tertiary)'};">${i + 1}</div>
      <div class="action-content">
        <div class="action-title">${esc(a.title)}</div>
        <div class="action-body">${esc(a.body)}</div>
      </div>
      <div class="action-cta">
        <button class="action-btn" onclick="event.stopPropagation();executeAction('${escJs(a.action)}', this, '${escJs(a.cmd)}')">${esc(a.button)}</button>
      </div>
    </div>`).join('');

}

/* ── STATS STRIP ──────────────────────────────────── */
function renderStats(d) {
  const gaps = d.evidenceGaps?.length || 0;
  const s = [
    { n: (d.latestRun?.questionScores?.length || 0), l: 'questions', nav: 'dimensions' },
    { n: (d.assurance?.length || 0), l: 'packs', nav: 'assurance' },
    { n: gaps, l: 'gaps', color: gaps > 0 ? 'var(--red)' : undefined, nav: 'evidence' },
    { n: (d.approvalsSummary?.approved || 0), l: 'approved', nav: 'evidence' },
  ];
  const el = document.getElementById('stats-strip');
  if (!el) return;
  el.innerHTML = s.map((x, i) =>
    `<div class="stats-bar-item" data-nav="${x.nav}" style="cursor:pointer">
      <span class="stats-bar-n" ${x.color ? `style="color:${x.color}"` : ''}>${x.n}</span>
      <span class="stats-bar-l">${x.l}</span>
    </div>` + (i < s.length-1 ? '<span class="task-meta-sep">·</span>' : '')
  ).join('');
  el.querySelectorAll('.stats-bar-item[data-nav]').forEach(item => {
    item.addEventListener('click', () => nav(item.dataset.nav));
  });
}

/* ── RADAR ────────────────────────────────────────── */
function renderRadar(d) {
  const layers = d.latestRun?.layerScores || [];
  if (!layers.length) return;
  const el = document.getElementById('radar-mount');
  if (!el) return;
  el.style.position = 'relative';
  const W = 280, H = 300, cx = W / 2, cy = H / 2 + 4, R = 110, n = layers.length;
  const angle = i => (2 * Math.PI * i / n) - Math.PI / 2;
  const pt = (r, i) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];

  const rings = [1,2,3,4,5].map(ring => {
    const r = (R / 5) * ring;
    const pts = layers.map((_, i) => pt(r, i).join(','));
    return `<polygon class="radar-grid-ring" points="${pts.join(' ')}"/>`;
  }).join('');

  const axes = layers.map((_, i) => {
    const [x, y] = pt(R, i);
    return `<line class="radar-axis-line" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
  }).join('');

  const dpts = layers.map((l, i) => {
    const [x, y] = pt((l.avgFinalLevel / 5) * R, i);
    return `${x},${y}`;
  });

  const overallColor = scoreColor(d.overall || 0);
  const dots = layers.map((l, i) => {
    const [x, y] = pt((l.avgFinalLevel / 5) * R, i);
    const dc = scoreColor(l.avgFinalLevel);
    return `<circle class="radar-dot" cx="${x}" cy="${y}" r="4" fill="${dc}" stroke="${dc}" stroke-width="2"
      data-name="${esc(l.layerName)}" data-score="${l.avgFinalLevel.toFixed(2)}" data-color="${dc}"
      style="cursor:pointer"/>`;
  }).join('');

  const labels = layers.map((l, i) => {
    const [x, y] = pt(R + 26, i);
    const anch = x < cx - 4 ? 'end' : x > cx + 4 ? 'start' : 'middle';
    const short = DIM_SHORT[l.layerName] || l.layerName.split(' ')[0];
    const vc = scoreColor(l.avgFinalLevel);
    return `<text class="radar-lbl" x="${x}" y="${y + 3}" text-anchor="${anch}">${esc(short)}</text>
      <text x="${x}" y="${y + 14}" text-anchor="${anch}" font-size="9" font-family="'JetBrains Mono',monospace" fill="${vc}" opacity=".8">${l.avgFinalLevel.toFixed(1)}</text>`;
  }).join('');

  const ariaRadar = layers.map(l => `${DIM_SHORT[l.layerName]||l.layerName}: ${l.avgFinalLevel.toFixed(1)}/5`).join(', ');
  el.innerHTML = `<div class="radar-tip" id="radar-tip"></div>
    <svg viewBox="-32 -16 ${W + 64} ${H + 32}" style="width:100%;max-width:380px;max-height:320px;overflow:visible"
      role="img" aria-label="Trust radar chart showing 5 dimensions: ${ariaRadar}">
    <title>Trust Radar — ${ariaRadar}</title>
    ${rings}${axes}
    <polygon class="radar-shape" id="radar-poly" points="${dpts.join(' ')}"
      style="fill:color-mix(in srgb, ${overallColor} 10%, transparent);stroke:${overallColor};stroke-opacity:.6;"/>
    ${dots}${labels}
  </svg>`;
  requestAnimationFrame(() => document.getElementById('radar-poly')?.classList.add('show'));

  const tip = document.getElementById('radar-tip');
  el.querySelectorAll('.radar-dot').forEach(dot => {
    dot.addEventListener('mouseenter', function(e) {
      this.setAttribute('r', '6');
      if (tip) {
        tip.innerHTML = `<strong style="color:${this.dataset.color}">${this.dataset.score}/5.0</strong><br><span style="font-size:10px;color:var(--text-tertiary)">${esc(this.dataset.name)}</span>`;
        tip.classList.add('show');
      }
    });
    dot.addEventListener('mousemove', function(e) {
      if (!tip) return;
      const rect = el.getBoundingClientRect();
      tip.style.left = (e.clientX - rect.left + 14) + 'px';
      tip.style.top  = (e.clientY - rect.top  - 8)  + 'px';
    });
    dot.addEventListener('mouseleave', function() {
      this.setAttribute('r', '4');
      if (tip) tip.classList.remove('show');
    });
  });
}

/* ── TIMELINE ─────────────────────────────────────── */
function renderTimeline(d) {
  const trends = d.trends || [];
  const el = document.getElementById('tl-mount');
  if (!el) return;
  if (!trends.length) {
    el.innerHTML = '<div class="empty"><span class="empty-i">📈</span><span class="empty-t">No trend data yet — score your agent a few times to see the chart</span><button class="empty-cta" onclick="nav(\'fleet\')">Open Terminal →</button></div>';
    return;
  }
  el.innerHTML = `<div class="tl-outer" style="position:relative"><div class="tl-tip" id="tl-tip"></div></div>`;
  const wrap = el.querySelector('.tl-outer');
  const W = wrap.clientWidth || 680, H = 200;
  const P = { t: 10, r: 16, b: 28, l: 32 };
  const cw = W - P.l - P.r, ch = H - P.t - P.b, n = trends.length;
  const sx = i => P.l + (i / (n - 1 || 1)) * cw;
  const sy = v => P.t + (1 - v / 5) * ch;

  const area = trends.map((t, i) => `${sx(i)},${sy(t.overall)}`).join(' ');
  const areaPts = `${sx(0)},${P.t + ch} ${area} ${sx(n-1)},${P.t + ch}`;

  const ygrid = [1,3,5].map(v =>
    `<line class="tl-grid-l" x1="${P.l}" y1="${sy(v)}" x2="${P.l + cw}" y2="${sy(v)}"/>
     <text class="tl-lbl" x="${P.l - 4}" y="${sy(v) + 3}" text-anchor="end">${v}</text>`).join('');

  const step = Math.max(1, Math.floor(n / 5));
  const xlbls = trends.map((t, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const dd = new Date(t.ts);
    return `<text class="tl-lbl" x="${sx(i)}" y="${H - 6}" text-anchor="middle">${dd.getDate()}/${dd.getMonth() + 1}</text>`;
  }).join('');

  const hdots = trends.map((t, i) => {
    const dd = new Date(t.ts);
    const dateStr = `${dd.getDate()}/${dd.getMonth()+1}/${dd.getFullYear()}`;
    return `<circle class="tl-dot" cx="${sx(i)}" cy="${sy(t.overall)}" r="3" data-i="${i}" style="animation-delay:${0.3 + i * 0.08}s"><title>${t.overall.toFixed(2)} / 5.0 — ${dateStr}</title></circle>`;
  }).join('');

  // Start/end annotations
  const firstVal = trends[0].overall, lastVal = trends[n-1].overall;
  const annotations = n > 1 ? `
    <text x="${sx(0)}" y="${sy(firstVal) - 10}" text-anchor="start" font-size="10" font-family="'JetBrains Mono',monospace" fill="var(--text-tertiary)">${firstVal.toFixed(1)}</text>
    <text x="${sx(n-1)}" y="${sy(lastVal) - 10}" text-anchor="end" font-size="11" font-weight="600" font-family="'JetBrains Mono',monospace" fill="var(--accent)">${lastVal.toFixed(1)}</text>
  ` : '';

  const targetY = sy(3.0);
  const targetLine = `<line x1="${P.l}" y1="${targetY}" x2="${P.l + cw}" y2="${targetY}" stroke="rgba(245,158,11,.2)" stroke-width="1" stroke-dasharray="4,3"/>
    <text x="${P.l + cw + 4}" y="${targetY + 3}" font-size="8" font-family="'JetBrains Mono',monospace" fill="rgba(245,158,11,.4)" text-anchor="start">3.0</text>`;

  const ariaTimeline = `Score trend chart with ${n} data point${n>1?'s':''}. Latest score: ${trends[n-1].overall.toFixed(2)} out of 5.0${n>1?`. Previous: ${trends[n-2].overall.toFixed(2)}`:''}`;
  wrap.insertAdjacentHTML('afterbegin', `<svg class="tl-svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px" role="img" aria-label="${ariaTimeline}"><title>${ariaTimeline}</title>
    <line class="tl-axis" x1="${P.l}" y1="${P.t}" x2="${P.l}" y2="${P.t + ch}"/>
    <line class="tl-axis" x1="${P.l}" y1="${P.t + ch}" x2="${P.l + cw}" y2="${P.t + ch}"/>
    ${ygrid}${targetLine}
    <polygon class="tl-area" points="${areaPts}"/>
    <polyline class="tl-line" points="${area}"/>
    ${hdots}${annotations}${xlbls}
  </svg>`);

  const tip = document.getElementById('tl-tip');
  const xhair = document.createElement('div');
  xhair.className = 'tl-crosshair';
  xhair.style.cssText = `position:absolute;pointer-events:none;width:1px;background:var(--accent);opacity:.3;top:${P.t}px;height:${ch}px;display:none;transition:left .05s ease;`;
  wrap.appendChild(xhair);

  wrap.querySelectorAll('.tl-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      const i = +dot.dataset.i, t = trends[i];
      const lft = sx(i) > cw / 2 ? sx(i) - 160 : sx(i) + 10;
      const dateStr = new Date(t.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      let deltaHtml = '';
      if (i > 0) {
        const prev = trends[i-1].overall;
        const delta = t.overall - prev;
        if (Math.abs(delta) > 0.01) {
          const sign = delta > 0 ? '+' : '';
          const col = delta > 0 ? 'var(--green)' : 'var(--red)';
          deltaHtml = `<br><span style="color:${col};font-size:10px">${sign}${delta.toFixed(2)} from previous</span>`;
        }
      }
      tip.innerHTML = `<strong style="font-size:13px">${t.overall.toFixed(2)}</strong><span style="color:var(--text-tertiary);font-size:10px"> / 5.0</span><br><span style="color:var(--text-tertiary);font-size:10px">${dateStr}</span>${deltaHtml}`;
      tip.style.left = lft + 'px'; tip.style.top = '8px';
      tip.classList.add('v');
      xhair.style.display = 'block';
      xhair.style.left = sx(i) + 'px';
    });
    dot.addEventListener('mouseleave', () => {
      tip.classList.remove('v');
      xhair.style.display = 'none';
    });
  });
}

/* ── ASSURANCE SUMMARY ─────────────────────────────── */
function renderAsrSummary(d) {
  const el = document.getElementById('asr-summary');
  if (!el) return;
  const packs = d.assurance || [];
  if (!packs.length) {
    const KEY_PACKS = [
      { id: 'sycophancy', label: 'Sycophancy', icon: '🤖' },
      { id: 'hallucination', label: 'Hallucination', icon: '🌀' },
      { id: 'toxicity', label: 'Toxicity', icon: '⚠️' },
      { id: 'privacy', label: 'Privacy', icon: '🔒' },
      { id: 'security', label: 'Security', icon: '🛡️' },
    ];
    el.innerHTML = `<div style="margin-bottom:10px">
      ${KEY_PACKS.map(p => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px">${p.icon}</span>
        <span style="font-size:11px;color:var(--text-secondary);flex:1">${p.label}</span>
        <span style="font-size:9px;font-weight:700;color:var(--text-tertiary);letter-spacing:.04em;padding:2px 6px;border-radius:4px;background:var(--bg-overlay);border:1px solid var(--border)">NOT RUN</span>
      </div>`).join('')}
    </div>
    <button class="action-btn" style="width:100%;justify-content:center" onclick="executeAction('assurance:sycophancy',this,'amc assurance run sycophancy')">Run First Pack ▸</button>`;
    return;
  }
  el.innerHTML = packs.slice(0, 5).map(p => {
    const pct = p.score0to100;
    const col = scoreColor(pct, 100);
    const short = p.packId.replace(/Pack$/, '').replace(/([A-Z])/g, ' $1').trim();
    return `<div class="asr-bar-item">
      <span class="asr-bar-nm" title="${esc(p.packId)}">${esc(short)}</span>
      <div class="asr-bar-trk"><div class="asr-bar-fill" style="width:${pct}%;background:${col}"></div></div>
      <span class="asr-bar-pct" style="color:${col}">${Math.round(pct)}%</span>
    </div>`;
  }).join('') +
  `<div class="card-action"><a href="#assurance" class="card-action-link" data-s="assurance">View all packs →</a></div>`;
  const aLink = el.querySelector('.card-action-link');
  if (aLink) aLink.addEventListener('click', e => { e.preventDefault(); nav(aLink.dataset.s); });
}

/* ── APPROVALS ────────────────────────────────────── */
function renderApprovals(d) {
  const a = d.approvalsSummary || {};
  const denied = a.denied || 0;
  const deniedColor = denied > 0 ? 'var(--red)' : 'var(--text-primary)';
  document.getElementById('ap-mount').innerHTML = `<div class="ap-row">
    <div class="ap-c"><div class="ap-n" style="color:var(--green)">${a.approved || 0}</div><div class="ap-l">Approved</div></div>
    <div class="ap-c"><div class="ap-n" style="color:${deniedColor}">${denied}</div><div class="ap-l">Denied</div></div>
    <div class="ap-c"><div class="ap-n" style="color:var(--amber)">${a.replayAttempts || 0}</div><div class="ap-l">Replays</div></div>
  </div>
  <div class="card-action"><a href="#evidence" class="card-action-link" data-s="evidence">Review approvals →</a></div>`;
  document.querySelectorAll('#ap-mount a[data-s]').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); nav('evidence'); });
  });
}

/* ── VALUE ────────────────────────────────────────── */
function renderValue(d) {
  const v = d.valueSummary || {};
  const keys = [
    ['valueScore', 'Value Score'],
    ['economicSignificanceIndex', 'Economic Sig.'],
    ['valueRegressionRisk', 'Regression Risk'],
  ];
  const rows = keys.map(([k, lbl]) => {
    const val = typeof v[k] === 'number' ? v[k].toFixed(2) : '—';
    const col = k === 'valueRegressionRisk'
      ? (parseFloat(val) > 0.3 ? 'var(--amber)' : 'var(--green)')
      : 'var(--text-primary)';
    return `<div class="val-row"><span class="val-k">${esc(lbl)}</span><span class="val-v" style="color:${col}">${esc(val)}</span></div>`;
  }).join('');
  const vs = typeof v.valueScore === 'number' ? v.valueScore : 0;
  const vsPct = Math.min(100, vs);
  const vsCol = scoreColor(vs, 100);
  const valEl = document.getElementById('val-mount');
  valEl.innerHTML = rows +
    `<div style="margin-top:8px"><div class="asr-bar-trk"><div class="asr-bar-fill" style="width:${vsPct}%;background:${vsCol}"></div></div></div>` +
    `<div class="card-action"><a href="#evidence" class="card-action-link" data-s="evidence">Investigate gaps →</a></div>`;
  const valLink = valEl.querySelector('.card-action-link[data-s]');
  if (valLink) valLink.addEventListener('click', e => { e.preventDefault(); nav('evidence'); });
}

/* ── HEATMAP ──────────────────────────────────────── */
function buildHm() {
  G.hm = true;
  const qs = G.data.latestRun?.questionScores || [];
  const tm = G.data.targetMapping || {};
  const el = document.getElementById('hm-mount');
  if (!el) return;
  if (!qs.length) {
    el.innerHTML = '<div class="empty"><span class="empty-i">🗺️</span><span class="empty-t">No question scores yet — run <code style="color:var(--accent)">amc quickscore</code></span></div>';
    return;
  }
  const grps = {};
  qs.forEach(q => { const p = q.questionId.split('.')[0] || 'Other'; if (!grps[p]) grps[p] = []; grps[p].push(q); });
  const layerNames = (G.data.latestRun?.layerScores || []).reduce((m, l, i) => {
    const k = Object.keys(grps)[i]; if (k) m[k] = l.layerName; return m;
  }, {});
  const hdr = `<div class="hm-hdr"><span>QID</span><span style="text-align:center">Score</span><span style="text-align:center">Target</span><span style="text-align:center">Gap</span><span>Conf</span></div>`;
  el.innerHTML = hdr + Object.entries(grps).map(([p, rows]) => {
    const nm = layerNames[p] || p;
    const body = rows.map(q => {
      const tgt = tm[q.questionId] ?? 0, gap = tgt - q.finalLevel;
      const gc = gap <= 0 ? 'g0' : gap === 1 ? 'g1' : gap === 2 ? 'g2c' : 'g3';
      const conf = Math.round((q.confidence || 0) * 100);
      const sc = scoreColor(q.finalLevel);
      return `<div class="hm-row" data-qid="${esc(q.questionId)}" tabindex="0">
        <span class="hm-qid">${esc(q.questionId)}</span>
        <span class="hm-n" style="color:${sc}">${q.finalLevel}</span>
        <span class="hm-n" style="color:var(--text-tertiary)">${tgt}</span>
        <span class="hm-n ${gc}">${gap > 0 ? '+' : ''}${gap}</span>
        <div class="hm-conf"><div class="hm-cf" style="width:${conf}%;background:${sc}"></div></div>
        <button class="hm-explain" onclick="event.stopPropagation();explainQ('${escJs(q.questionId)}',this)" title="Explain this question">? Explain</button>
      </div>`;
    }).join('');
    return `<div class="hm-grp">
      <div class="hm-ghdr">${esc(nm)}<span style="color:var(--text-tertiary);font-size:9px">${rows.length}q</span></div>
      <div class="hm-gbody">${body}</div>
    </div>`;
  }).join('');
  el.querySelectorAll('.hm-row').forEach(r => {
    const fn = () => selQ(r.dataset.qid);
    r.addEventListener('click', fn);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fn(); });
  });
  el.querySelectorAll('.hm-ghdr').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('c')));
}

function selQ(qid) {
  document.querySelectorAll('.hm-row').forEach(r => r.classList.toggle('sel', r.dataset.qid === qid));
  const q = G.data.latestRun?.questionScores?.find(x => x.questionId === qid);
  const el = document.getElementById('qd-mount');
  if (!q || !el) return;
  const tgt = G.data.targetMapping?.[qid] ?? 0;
  const conf = Math.round((q.confidence || 0) * 100);
  const sp = (q.finalLevel / 5) * 100;
  const sc = scoreColor(q.finalLevel);
  const flags = (q.flags || []).map(f => `<span class="qd-flag">${esc(f)}</span>`).join(' ');
  el.innerHTML = `<div class="qd fade">
    <div class="qd-head"><span class="qd-id">${esc(qid)}</span>${flags}</div>
    <div class="qd-txt">${esc(q.narrative || 'No narrative available.')}</div>
    <div class="qd-f"><span class="qd-fl">Score</span><span class="qd-fv" style="color:${sc}">${q.finalLevel} / 5</span>
      <div class="qd-bar"><div class="qd-bfill" style="width:${sp}%;background:${sc}"></div></div></div>
    <div class="qd-f"><span class="qd-fl">Target</span><span class="qd-fv">${tgt} / 5</span></div>
    <div class="qd-f"><span class="qd-fl">Claimed</span><span class="qd-fv">${q.claimedLevel ?? '—'}</span></div>
    <div class="qd-f"><span class="qd-fl">Supported Max</span><span class="qd-fv">${q.supportedMaxLevel ?? '—'}</span></div>
    <div class="qd-f"><span class="qd-fl">Confidence</span><span class="qd-fv">${conf}%</span>
      <div class="qd-bar"><div class="qd-bfill" style="width:${conf}%;background:var(--accent)"></div></div></div>
    <div class="qd-f"><span class="qd-fl">Evidence Events</span><span class="qd-fv">${(q.evidenceEventIds || []).length}</span></div>
  </div>`;
}

/* ── EXPLAIN QUESTION (inline via API) ────────────── */
async function explainQ(qid, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const res = await amcApi('/exec', { method: 'POST', body: JSON.stringify({ command: `amc explain ${qid}` }) });
    const text = typeof res === 'string' ? res : (res.output || res.stdout || res.raw || JSON.stringify(res, null, 2));
    const el = document.getElementById('qd-mount');
    if (el) el.innerHTML = `<div class="qd fade">
      <div class="qd-head"><span class="qd-id">${esc(qid)}</span><span class="qd-flag">EXPLAIN</span></div>
      <pre class="cli-pre" style="white-space:pre-wrap;font-size:11px;line-height:1.6;margin-top:8px;color:var(--text-secondary)">${ansiToHtml(text)}</pre>
    </div>`;
    selQ(qid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showViewToast(`Explain failed: ${msg}. Run: amc explain ${qid}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '? Explain';
  }
}

/* ── ASSURANCE FULL ─────────────────────────────────── */
function asrCard(p) {
  const pct = p.score0to100 / 100, circ = 2 * Math.PI * 17, off = circ * (1 - pct);
  const col = scoreColor(p.score0to100, 100);
  const short = p.packId.replace(/Pack$/, '').replace(/([A-Z])/g, ' $1').trim();
  return `<div class="asr-card">
    <svg class="asr-donut" viewBox="0 0 40 40">
      <circle class="donut-bg" cx="20" cy="20" r="17" stroke-width="4"/>
      <circle class="donut-fill" cx="20" cy="20" r="17" stroke-width="4" stroke="${col}"
        stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
        transform="rotate(-90 20 20)"/>
      <text class="donut-pct" x="20" y="21" fill="${col}">${Math.round(pct * 100)}%</text>
    </svg>
    <div class="asr-info">
      <div class="asr-name" title="${esc(p.packId)}">${esc(short)}</div>
      <div class="asr-sub" style="color:var(--text-tertiary)">✓${p.passCount}&nbsp;✗${p.failCount}</div>
      <button class="action-btn" style="margin-top:6px;font-size:10px;padding:4px 8px" onclick="event.stopPropagation();executeAction('assurance:${escJs(p.packId)}', this, 'amc assurance run ${escJs(p.packId)}')">Run Pack ▸</button>
    </div>
  </div>`;
}

function buildAf() {
  G.af = true;
  const packs = G.data.assurance || [];
  const el = document.getElementById('af-mount');
  if (!el) return;
  if (packs.length) {
    const failing = packs.filter(p => p.score0to100 < 75);
    const passing = packs.filter(p => p.score0to100 >= 75);
    const avgScore = Math.round(packs.reduce((s,p) => s + p.score0to100, 0) / packs.length);
    const failBtnHtml = failing.length
      ? `<button class="action-btn" style="font-size:10px;padding:5px 10px" onclick="event.stopPropagation();(async()=>{for(const p of ${esc(JSON.stringify(failing.map(p=>p.packId)))}){await executeAction('assurance:'+p,this,'amc assurance run '+p);}})()">Run ${failing.length} Failing ▸</button>`
      : '';
    const runAllBtn = `<button class="action-btn" style="font-size:10px;padding:5px 10px;background:var(--bg-overlay);border-color:var(--border);color:var(--text-secondary)" onclick="event.stopPropagation();(async()=>{for(const p of ${esc(JSON.stringify(packs.map(p=>p.packId)))}){await executeAction('assurance:'+p,this,'amc assurance run '+p);}})()">Run All ▸</button>`;
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
      <span style="font-size:12px;color:var(--text-secondary)">${packs.length} packs · <strong style="color:var(--green)">${passing.length} passing</strong> · <strong style="color:${failing.length ? 'var(--red)' : 'var(--text-tertiary)'}">${failing.length} failing</strong> · avg <strong style="color:${scoreColor(avgScore, 100)}">${avgScore}%</strong></span>
      <div style="display:flex;gap:6px">${failBtnHtml}${runAllBtn}</div>
    </div><div class="asr-grid">${packs.map(asrCard).join('')}</div>`;
  } else {
    el.innerHTML = '<div class="empty"><span class="empty-i">🛡️</span><span class="empty-t">No assurance runs yet</span><button class="action-btn" style="margin-top:10px" onclick="executeAction(\'assurance:sycophancy\', this, \'amc assurance run sycophancy\')">Run First Pack ▸</button></div>';
  }
  const idx = G.data.indices?.indices || [];
  const idxEl = document.getElementById('idx-mount');
  if (!idxEl) return;
  idxEl.innerHTML = idx.length ? idx.map(x => {
    const col = scoreColor(x.score0to100, 100);
    const nm = x.id.replace(/([A-Z])/g, ' $1').replace(/Risk$/, ' Risk').trim();
    return `<div class="idx-row"><span class="idx-nm">${esc(nm)}</span>
      <div class="idx-trk"><div class="idx-fill" style="width:${x.score0to100}%;background:${col}"></div></div>
      <span class="idx-pct" style="color:${col}">${x.score0to100.toFixed(0)}</span></div>`;
  }).join('') : '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0">No index data</div>';
}

/* ── EVIDENCE ─────────────────────────────────────── */
function buildEv() {
  G.ef = true;
  const gaps = G.data.evidenceGaps || [];
  const el = document.getElementById('ev-mount');
  if (!el) return;
  if (gaps.length) {
    const critGaps = gaps.filter(g => (g.severity || '').toLowerCase() === 'critical' || (g.gap ?? 99) >= 3);
    const highGaps = gaps.filter(g => !critGaps.includes(g) && ((g.severity || '').toLowerCase() === 'high' || (g.gap ?? 0) === 2));
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:12px;color:var(--text-secondary)">${gaps.length} evidence gap${gaps.length > 1 ? 's' : ''}${critGaps.length ? ` · <strong style="color:var(--red)">${critGaps.length} critical</strong>` : ''}${highGaps.length ? ` · <strong style="color:var(--amber)">${highGaps.length} high</strong>` : ''}</span>
      <div style="display:flex;gap:6px">
        <button class="action-btn" style="font-size:10px;padding:5px 10px" onclick="executeAction('manual', this, 'amc evidence collect')">Collect Evidence ▸</button>
        <button class="action-btn" style="font-size:10px;padding:5px 10px;background:var(--bg-overlay);border-color:var(--border);color:var(--text-secondary)" onclick="executeAction('manual', this, 'amc evidence ingest')">Ingest File ▸</button>
      </div>
    </div>${gaps.map(g => {
      const sev = (g.severity || '').toLowerCase() === 'critical' || (g.gap ?? 99) >= 3 ? 'crit' : (g.severity || '').toLowerCase() === 'high' || (g.gap ?? 0) === 2 ? 'high' : 'med';
      const sevLabel = sev === 'crit' ? 'Critical' : sev === 'high' ? 'High' : 'Medium';
      return `<div class="ev-item">
      <div class="ev-dot" style="background:${sev === 'crit' ? 'var(--red)' : sev === 'high' ? 'var(--amber)' : 'var(--text-tertiary)'}"></div>
      <span class="ev-qid">${esc(g.questionId)}</span>
      <span class="ev-sev ${sev}">${sevLabel}</span>
      <span class="ev-r">${esc(g.reason)}</span>
    </div>`;
    }).join('')}`;
  } else {
    el.innerHTML = '<div class="empty"><span class="empty-i">✅</span><span class="empty-t">No evidence gaps — full execution proof for all scored questions.</span></div>';
  }
  const eoc = G.data.eoc || {};
  const cols = [['Education', eoc.education || []], ['Ownership', eoc.ownership || []], [`Commitment (${eoc.days || 14}d)`, eoc.commitment || []]];
  const eocEl = document.getElementById('eoc-mount');
  if (!eocEl) return;
  eocEl.innerHTML = `<div class="eoc">${cols.map(([t, items]) => `
    <div class="eoc-col">
      <div class="eoc-h">${esc(t)}</div>
      ${items.map(i => `<div class="eoc-item"><input type="checkbox" class="eoc-cb"/><span>${esc(i)}</span></div>`).join('')}
      ${!items.length ? '<span style="color:var(--text-tertiary);font-size:11px">—</span>' : ''}
    </div>`).join('')}</div>`;
}

/* ── TERMINAL COMMAND EXECUTION ────────────────────── */
/* ANSI escape code → HTML span converter */
function ansiToHtml(text) {
  const COLORS = {
    '30':'#6b7280','31':'#f87171','32':'#34d399','33':'#fbbf24','34':'#60a5fa',
    '35':'#c084fc','36':'#22d3ee','37':'#e5e7eb','90':'#9ca3af','91':'#fca5a5',
    '92':'#6ee7b7','93':'#fde68a','94':'#93c5fd','95':'#d8b4fe','96':'#67e8f9','97':'#f9fafb'
  };
  let out = '', openSpans = 0;
  const parts = text.split(/\x1b\[([0-9;]*)m/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) { out += esc(parts[i]); continue; }
    const codes = parts[i].split(';');
    for (const c of codes) {
      if (c === '0' || c === '') { while (openSpans > 0) { out += '</span>'; openSpans--; } }
      else if (COLORS[c]) { out += `<span style="color:${COLORS[c]}">`; openSpans++; }
      else if (c === '1') { out += '<span style="font-weight:700">'; openSpans++; }
      else if (c === '2') { out += '<span style="opacity:.6">'; openSpans++; }
      else if (c === '3') { out += '<span style="font-style:italic">'; openSpans++; }
      else if (c === '4') { out += '<span style="text-decoration:underline">'; openSpans++; }
    }
  }
  while (openSpans > 0) { out += '</span>'; openSpans--; }
  return out;
}

function initTerminal() {
  const input = document.getElementById('cli-input');
  const runBtn = document.getElementById('cli-run');
  const output = document.getElementById('cli-output');
  if (!input || !runBtn || !output) return;

  const history = [];
  let histIdx = -1;

  async function runCommand() {
    const cmd = input.value.trim();
    if (!cmd) return;
    history.unshift(cmd);
    histIdx = -1;
    input.value = '';

    const fullCmd = cmd.startsWith('amc ') ? cmd : `amc ${cmd}`;
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    output.innerHTML += `<div class="cli-entry"><span class="cli-ts">${ts}</span> <span class="cli-cmd-echo">$ ${esc(fullCmd)}</span></div>`;

    const spinner = document.createElement('div');
    spinner.className = 'cli-entry cli-running';
    spinner.innerHTML = '<span class="spin" style="display:inline-block;width:10px;height:10px;border:2px solid rgba(99,102,241,.3);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite"></span> Running…';
    output.appendChild(spinner);
    output.scrollTop = output.scrollHeight;

    try {
      const res = await amcApi('/exec', {
        method: 'POST',
        body: JSON.stringify({ command: fullCmd })
      });
      spinner.remove();
      const text = typeof res === 'string' ? res : (res.output || res.stdout || res.raw || JSON.stringify(res, null, 2));
      const exitCode = res.exitCode ?? res.code ?? 0;
      const cls = exitCode === 0 ? 'cli-ok' : 'cli-err';
      output.innerHTML += `<div class="cli-entry ${cls}"><pre class="cli-pre">${ansiToHtml(text)}</pre></div>`;
      if (exitCode !== 0) {
        output.innerHTML += `<div class="cli-entry cli-err" style="font-size:10px;opacity:.7">exit ${exitCode}</div>`;
      }
    } catch (err) {
      spinner.remove();
      const msg = err instanceof Error ? err.message : String(err);
      output.innerHTML += `<div class="cli-entry cli-err"><pre class="cli-pre">${esc(msg)}</pre><div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Tip: Start Studio with <code>amc up</code> to enable remote execution</div></div>`;
    }
    output.scrollTop = output.scrollHeight;
  }

  runBtn.addEventListener('click', runCommand);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runCommand(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (history.length) { histIdx = Math.min(histIdx + 1, history.length - 1); input.value = history[histIdx] ?? ''; } }
    if (e.key === 'ArrowDown') { e.preventDefault(); histIdx = Math.max(histIdx - 1, -1); input.value = histIdx >= 0 ? (history[histIdx] ?? '') : ''; }
  });

  /* Quick action buttons above output */
  const quickCmds = ['quickscore','doctor --json','improve','assurance list','mechanic gap','domain assess --domain health','guardrails list','history'];
  const qwrap = document.createElement('div');
  qwrap.className = 'term-quick';
  qwrap.innerHTML = quickCmds.map(c => `<button class="term-qbtn" data-cmd="${esc(c)}">${esc(c)}</button>`).join('');
  output.parentElement.insertBefore(qwrap, output);
  qwrap.querySelectorAll('.term-qbtn').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.cmd; runCommand(); }));

  /* Show helpful commands on first load */
  output.innerHTML = `<div class="cli-entry" style="color:var(--text-tertiary);font-size:11px">Type a command or click a quick action above. Press <kbd style="background:var(--bg-overlay);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-size:10px">↑</kbd><kbd style="background:var(--bg-overlay);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-size:10px">↓</kbd> for history.</div>`;
}

/* ── FLEET ────────────────────────────────────────── */
function buildFleet() {
  G.ff = true;
  initTerminal();
  const st = G.data.studioHome || {};
  const sfields = [
    { l: 'Studio', v: st.running ? 'Running' : 'Stopped', c: st.running ? 'ok' : 'bad' },
    { l: 'Vault', v: st.vaultUnlocked ? 'Unlocked' : 'Locked', c: st.vaultUnlocked ? 'ok' : 'warn' },
    { l: 'Action Policy', v: st.actionPolicySignature || '—', c: st.actionPolicySignature === 'VALID' ? 'ok' : 'bad' },
    { l: 'Tools Sig', v: st.toolsSignature || '—', c: st.toolsSignature === 'VALID' ? 'ok' : 'bad' },
    { l: 'Gateway', v: st.gatewayUrl || 'n/a', c: 'def' },
    { l: 'Dashboard', v: st.dashboardUrl || window.location.origin, c: 'def' },
  ];
  const stEl = document.getElementById('studio-mount');
  if (stEl) stEl.innerHTML = `<div class="studio-grid">${sfields.map(f => `
    <div class="ss"><div class="ss-l">${esc(f.l)}</div><div class="ss-v ${f.c}">${esc(f.v)}</div></div>`).join('')}</div>`;

  const agents = st.agents || [];
  const ftEl = document.getElementById('fleet-mount');
  if (ftEl) ftEl.innerHTML = agents.length ? `<table class="fleet-t">
    <thead><tr><th>Agent</th><th>Score</th><th>Trust</th><th>Provider</th><th>Model</th><th>Frozen</th></tr></thead>
    <tbody>${agents.map(a => {
      const sc = a.overall != null ? scoreColor(a.overall) : 'var(--text-secondary)';
      return `<tr>
        <td>${esc(a.id)}</td>
        <td style="color:${sc}">${a.overall != null ? a.overall.toFixed(2) : '—'}</td>
        <td><span class="tb-badge ${a.overall != null ? scoreClass(a.overall) : 'md'}">${esc(a.trustLabel || '—')}</span></td>
        <td>${esc(a.lastProvider || '—')}</td>
        <td>${esc(a.lastModel || '—')}</td>
        <td>${a.freezeActive ? `<span style="color:var(--amber)">Yes</span>` : '—'}</td>
      </tr>`;
    }).join('')}</tbody></table>` :
    '<div class="empty"><span class="empty-i">🤖</span><span class="empty-t">No agents registered — run <code style="color:var(--accent)">amc init</code> to create one</span></div>';

  const bm = G.data.benchmarksSummary || {};
  const bmEl = document.getElementById('bm-mount');
  if (bmEl) bmEl.innerHTML = [
    { k: 'Total Benchmarks', v: bm.count || 0 },
    { k: 'Overall Percentile', v: (bm.percentileOverall || 0).toFixed(1) + '%' }
  ].map(x => `<div class="val-row"><span class="val-k">${esc(x.k)}</span><span class="val-v">${esc(String(x.v))}</span></div>`).join('');

  const exs = st.toolhubExecutions || [];
  const thEl = document.getElementById('th-mount');
  if (thEl) thEl.innerHTML = exs.length
    ? exs.slice(0, 8).map(e => `<div class="val-row"><span class="val-k">${esc(e.toolName || 'tool')}</span><span class="val-v" style="color:var(--text-secondary)">${esc(e.effectiveMode || '—')}</span></div>`).join('')
    : '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0">No recent executions</div>';
}

/* ── SETTINGS ─────────────────────────────────────── */
function buildSettings() {
  const container = document.getElementById('settings-mount');
  if (!container) return;
  const agentId = G.data?.agentId || 'default';
  const d = G.data || {};
  const qs = d.latestRun?.questionScores?.length || 0;
  const packs = d.assurance?.length || 0;
  const gaps = d.evidenceGaps?.length || 0;
  const domains = (d.domains || []).length;
  const guardrails = (d.guardrails || []).length;
  const runId = d.latestRun?.runId || '—';
  const runTs = d.latestRun?.timestamp ? new Date(d.latestRun.timestamp).toLocaleString() : '—';
  const version = d.version || d.latestRun?.amcVersion || '—';
  container.innerHTML = `
    <div style="display:grid;gap:16px;max-width:640px">
      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot"></span>Appearance</div>
        <div class="settings-group">
          <label class="settings-label">Theme</label>
          <div class="theme-toggle" role="group">
            <button class="theme-opt on" data-t="dark">🌙 Dark</button>
            <button class="theme-opt" data-t="light">☀️ Light</button>
          </div>
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot"></span>Agent</div>
        <div class="settings-group">
          <label class="settings-label">Active Agent ID</label>
          <div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:500;color:var(--text-primary);padding:8px 0">${esc(agentId)}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">Switch agents using: <code style="color:var(--accent)">amc agent use &lt;id&gt;</code></div>
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot"></span>Data Summary</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-top:10px;font:400 12px/1.8 'Inter',sans-serif;color:var(--text-secondary)">
          <div>Questions scored: <strong style="color:var(--text-primary)">${qs}</strong></div>
          <div>Assurance packs: <strong style="color:var(--text-primary)">${packs}</strong></div>
          <div>Evidence gaps: <strong style="color:${gaps > 0 ? 'var(--red)' : 'var(--green)'}">${gaps}</strong></div>
          <div>Domains: <strong style="color:var(--text-primary)">${domains}</strong></div>
          <div>Guardrails: <strong style="color:var(--text-primary)">${guardrails}</strong></div>
          <div>Version: <strong style="color:var(--text-primary)">${esc(version)}</strong></div>
        </div>
        <div style="margin-top:10px;font:400 11px/1.5 'Inter',sans-serif;color:var(--text-tertiary)">
          Run: <code style="font-size:10px">${esc(runId.slice(0,8))}</code> · ${esc(runTs)}
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot"></span>Export</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          <button onclick="executeAction('manual', this, 'amc report md')" style="
            display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
            background:var(--accent-dim);border:1px solid var(--accent-border);border-radius:8px;
            font:500 12px/1 'Inter',sans-serif;color:var(--accent);cursor:pointer;transition:background .15s;
          ">📄 Generate Report</button>
          <button onclick="navigator.clipboard?.writeText(JSON.stringify(G.data,null,2)).then(()=>showViewToast('JSON copied to clipboard'))" style="
            display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
            background:var(--bg-overlay);border:1px solid var(--border);border-radius:8px;
            font:500 12px/1 'Inter',sans-serif;color:var(--text-secondary);cursor:pointer;transition:all .15s;
          ">📋 Copy JSON</button>
          <button onclick="executeAction('manual', this, 'amc export sarif')" style="
            display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
            background:var(--bg-overlay);border:1px solid var(--border);border-radius:8px;
            font:500 12px/1 'Inter',sans-serif;color:var(--text-secondary);cursor:pointer;transition:all .15s;
          ">🔒 Export SARIF</button>
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot"></span>Keyboard Shortcuts</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin-top:10px;font:400 12px/1.8 'Inter',sans-serif;color:var(--text-secondary)">
          <kbd class="s-kbd">⌘K</kbd><span>Command palette</span>
          <kbd class="s-kbd">?</kbd><span>Shortcuts panel</span>
          <kbd class="s-kbd">1-7</kbd><span>Navigate sections</span>
          <kbd class="s-kbd">D</kbd><span>Toggle dark / light</span>
          <kbd class="s-kbd">S</kbd><span>Focus terminal</span>
          <kbd class="s-kbd">Esc</kbd><span>Close overlays</span>
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot"></span>Actions</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          <button onclick="resetOnboarding()" style="
            display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
            background:var(--bg-overlay);border:1px solid var(--border);border-radius:8px;
            font:500 12px/1 'Inter',sans-serif;color:var(--text-secondary);cursor:pointer;transition:all .15s;
          ">🧭 Replay Tour</button>
          <button onclick="executeAction('manual', this, 'amc doctor --json')" style="
            display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
            background:var(--bg-overlay);border:1px solid var(--border);border-radius:8px;
            font:500 12px/1 'Inter',sans-serif;color:var(--text-secondary);cursor:pointer;transition:all .15s;
          ">🩺 Run Doctor</button>
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot" style="background:var(--green)"></span>About AMC</div>
        <div style="font:400 13px/1.7 'Inter',sans-serif;color:var(--text-secondary);margin-top:8px">
          <strong style="color:var(--text-primary)">Agent Maturity Compass</strong> — the open-source trust scoring framework for AI agents.<br>
          Evidence-based. Cryptographically verifiable. Zero fluff.<br>
          <span style="color:var(--text-tertiary)">Built by the wise crab. MIT licensed.</span>
        </div>
        <div style="display:flex;gap:16px;margin-top:12px">
          <a href="https://github.com/thewisecrab/AgentMaturityCompass" target="_blank" style="font:500 12px/1 'Inter',sans-serif;color:var(--accent)">GitHub →</a>
          <a href="https://thewisecrab.github.io/AgentMaturityCompass" target="_blank" style="font:500 12px/1 'Inter',sans-serif;color:var(--text-secondary)">Docs →</a>
        </div>
      </div>
    </div>
  `;

  /* Apply current theme to theme-opts */
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  container.querySelectorAll('.theme-opt').forEach(opt => {
    opt.classList.toggle('on', opt.dataset.t === currentTheme);
    opt.addEventListener('click', () => {
      applyTheme(opt.dataset.t);
      container.querySelectorAll('.theme-opt').forEach(x => x.classList.toggle('on', x.dataset.t === opt.dataset.t));
    });
  });
}

/* ── LOADING SKELETON ─────────────────────────────── */
function showLoadingSkeleton() {
  const scoreCard = document.getElementById('score-card-inner');
  if (scoreCard) {
    /* Dim the hero while loading */
    scoreCard.style.opacity = '0.5';
    scoreCard._hadSkeleton = true;
  }
  const taskGrid = document.getElementById('task-grid-mount');
  if (taskGrid) {
    taskGrid.innerHTML = `
      <div class="skeleton" style="width:100%;height:120px;border-radius:12px"></div>
      <div class="skeleton" style="width:100%;height:120px;border-radius:12px"></div>
      <div class="skeleton" style="width:100%;height:120px;border-radius:12px"></div>`;
    taskGrid._hadSkeleton = true;
  }
}
function removeLoadingSkeleton() {
  /* Restore original score card structure so renderScore can populate it */
  const scoreCard = document.getElementById('score-card-inner');
  if (scoreCard && scoreCard._hadSkeleton) {
    scoreCard.style.opacity = '';
    delete scoreCard._hadSkeleton;
  }
  /* Task grid will be overwritten by renderNextActions */
}

/* ── INIT ─────────────────────────────────────────── */
(async function init() {
  try {
    initTheme();
    initTooltip();
    buildCommandPalette();
    buildShortcutsPanel();
    initMobileGestures();
    initNav();

    /* Show loading skeletons while fetching */
    showLoadingSkeleton();

    G.data = await xfetch('./data.json');

    /* Remove skeletons */
    removeLoadingSkeleton();

    renderScore(G.data);
    renderDims(G.data);
    renderStats(G.data);
    renderNextActions(G.data);
    renderRadar(G.data);
    renderTimeline(G.data);
    renderAsrSummary(G.data);
    renderApprovals(G.data);
    renderValue(G.data);

    /* Onboarding banner */
    const orientBanner = document.getElementById('orient-banner');
    if (orientBanner) {
      const visits = parseInt(localStorage.getItem('amc_seen') || '0', 10) + 1;
      localStorage.setItem('amc_seen', String(visits));
      const dismissed = localStorage.getItem('amc_orient_dismissed') === '1';
      if (!dismissed) {
        orientBanner.style.display = 'flex';
        if (visits >= 3) {
          setTimeout(() => {
            orientBanner.style.opacity = '0';
            orientBanner.style.transition = 'opacity .4s';
            setTimeout(() => { orientBanner.style.display = 'none'; }, 400);
            localStorage.setItem('amc_orient_dismissed', '1');
          }, 2000);
        }
        document.getElementById('orient-dismiss')?.addEventListener('click', () => {
          orientBanner.style.opacity = '0';
          orientBanner.style.transition = 'opacity .2s';
          setTimeout(() => { orientBanner.style.display = 'none'; }, 200);
          localStorage.setItem('amc_orient_dismissed', '1');
        });
      }
    }

    /* Settings */
    if (document.getElementById('settings-mount')) buildSettings();

    /* Studio API status */
    await checkStudioConnectionOnInit();

    /* Onboarding tour (slight delay) */
    setTimeout(() => buildOnboarding(), 500);

  } catch (err) {
    const content = document.getElementById('content');
    if (content) content.innerHTML = `<div class="empty" style="margin-top:80px">
      <span class="empty-i">⚠️</span>
      <span class="empty-t">Failed to load data: <code style="color:var(--amber)">${esc(err.message)}</code><br>
      Run <code style="color:var(--accent)">amc dashboard build</code> first.</span>
    </div>`;
  }
})();
