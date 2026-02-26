/* AMC Dashboard v3 App — Awwwards Quality Rewrite */
const G = { data:null, section:'overview', view:'engineer', hm:false, af:false, ef:false, ff:false };
const esc = v => String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt = (n,d=2) => typeof n==='number' ? n.toFixed(d) : '—';

/* ── SEMANTIC COLOR SYSTEM ────────────────────────── */
function scoreColor(score, max = 5) {
  const pct = score / max;
  if (pct >= 0.8) return 'var(--score-hi)';
  if (pct >= 0.5) return 'var(--score-mid)';
  if (pct >= 0.3) return 'var(--score-lo)';
  return 'var(--score-crit)';
}
function scoreClass(score, max = 5) {
  const pct = score / max;
  if (pct >= 0.8) return 'hi';
  if (pct >= 0.5) return 'md';
  return 'lo';
}
/* Legacy tc() — kept for badge compatibility */
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
  { icon: '📊', title: 'Your Trust Score', body: 'The overall score (0–5) reflects how mature and trustworthy your agent is across 5 dimensions: Strategy, Leadership, Culture, Resilience, and Skills.' },
  { icon: '🔍', title: 'Evidence-Based', body: 'Unlike other frameworks, AMC verifies claims with cryptographic evidence chains. A claimed score of 5/5 might actually be 1/5 without evidence.' },
  { icon: '🚀', title: 'Get Started', body: 'Run <code style="color:var(--score-hi);background:rgba(0,255,65,.08);padding:2px 6px;border-radius:3px">amc quickscore</code> to get your first score in under 2 minutes. Then use the Recommended Actions panel to improve.' },
];

let G_onboardStep = 0;

function buildOnboarding() {
  if (localStorage.getItem('amc_onboarded') === '1') return;
  // Use the HTML onboard overlay — just populate it and show
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
    <div class="onboard-step-icon" style="transition:all .3s;opacity:0;transform:scale(.8)">${step.icon}</div>
    <div class="onboard-step-title">${esc(step.title)}</div>
    <div class="onboard-step-body">${step.body}</div>
  `;
  requestAnimationFrame(() => {
    const icon = bodyEl.querySelector('.onboard-step-icon');
    if (icon) { icon.style.opacity = '1'; icon.style.transform = 'scale(1)'; }
  });

  nextBtn.textContent = idx === ONBOARD_STEPS.length - 1 ? "Let's Go →" : 'Next →';

  dotsEl.innerHTML = ONBOARD_STEPS.map((_, i) =>
    `<div class="onboard-dot ${i === idx ? 'on' : ''}" data-step="${i}"></div>`
  ).join('');
  dotsEl.querySelectorAll('.onboard-dot').forEach(d => {
    d.addEventListener('click', () => { G_onboardStep = +d.dataset.step; renderOnboardStep(G_onboardStep); });
  });
}

function closeOnboarding() {
  localStorage.setItem('amc_onboarded', '1');
  const ov = document.getElementById('onboard');
  if (ov) {
    ov.style.opacity = '0'; ov.style.transition = 'opacity .3s ease';
    setTimeout(() => { ov.style.display = 'none'; ov.style.opacity = ''; }, 300);
  }
}

/* Re-trigger onboarding from ? button */
function resetOnboarding() {
  localStorage.removeItem('amc_onboarded');
  G_onboardStep = 0;
  const overlay = document.getElementById('onboard');
  if (overlay) { overlay.style.display = 'flex'; overlay.style.opacity = '1'; renderOnboardStep(0); }
}

/* ── COMMAND PALETTE ──────────────────────────────── */
const CMD_ACTIONS = [
  { label: 'Run quickscore', desc: 'Get a score in under 2 minutes', cmd: 'amc quickscore', nav: 'overview' },
  { label: 'View evidence gaps', desc: 'See what evidence is missing', cmd: 'amc evidence gaps', nav: 'evidence' },
  { label: 'Check assurance packs', desc: 'Review all assurance pack results', cmd: 'amc assurance list', nav: 'assurance' },
  { label: 'Open fleet view', desc: 'View all registered agents', cmd: null, nav: 'fleet' },
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
    position:fixed;inset:0;z-index:8000;background:rgba(2,5,10,.8);
    backdrop-filter:blur(6px);display:none;align-items:flex-start;
    justify-content:center;padding-top:80px;
  `;
  modal.innerHTML = `
    <div style="
      background:var(--card);border:1px solid var(--g-line);border-radius:12px;
      width:min(560px,92vw);box-shadow:0 0 40px rgba(0,255,65,.1),0 24px 48px rgba(0,0,0,.5);
      overflow:hidden;
    ">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--bdr)">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="var(--t2)" style="flex-shrink:0">
          <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
        </svg>
        <input id="cmd-input" type="text" placeholder="Search actions… (⌘K to close)" style="
          flex:1;background:none;border:none;outline:none;
          font:500 14px/1 var(--mono);color:var(--t0);
        " autocomplete="off" spellcheck="false"/>
        <span style="font:400 11px/1 var(--mono);color:var(--t3)">ESC to close</span>
      </div>
      <div id="cmd-results" style="max-height:340px;overflow-y:auto;padding:6px"></div>
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
        display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;
        cursor:pointer;transition:background .15s;
      ">
        <div style="flex:1">
          <div style="font:500 13px/1.2 var(--mono);color:var(--t0)">${esc(a.label)}</div>
          <div style="font:400 11px/1.4 var(--sans);color:var(--t2);margin-top:3px">${esc(a.desc)}</div>
        </div>
        ${a.cmd ? `<code style="font:400 10px/1 var(--mono);color:var(--score-hi);background:var(--g-dim);padding:3px 7px;border-radius:4px;white-space:nowrap">${esc(a.cmd)}</code>` : ''}
        ${a.nav ? `<svg width="12" height="12" viewBox="0 0 20 20" fill="var(--t3)"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>` : ''}
      </div>
    `).join('') : `<div style="padding:24px;text-align:center;color:var(--t3);font:400 13px/1 var(--mono)">No actions found</div>`;

    results.querySelectorAll('.cmd-item').forEach(item => {
      item.addEventListener('mouseenter', () => item.style.background = 'var(--g-dim)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('click', () => {
        closeCmdPalette();
        if (item.dataset.nav) nav(item.dataset.nav);
      });
    });
  }

  input.addEventListener('input', () => renderCmdResults(input.value));
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
  if (pal) { pal.style.display = 'none'; document.getElementById('cmd-input').value = ''; }
}

/* ── TOOLTIP SYSTEM ───────────────────────────────── */
let G_tooltip = null;
function initTooltip() {
  const tt = document.createElement('div');
  tt.id = 'g-tooltip';
  tt.style.cssText = `
    position:fixed;z-index:7000;pointer-events:none;opacity:0;
    background:var(--card2);border:1px solid var(--g-line);border-radius:6px;
    padding:7px 11px;font:500 11px/1.4 var(--mono);color:var(--t0);
    box-shadow:0 8px 24px rgba(0,0,0,.5);transition:opacity .15s;
    white-space:nowrap;max-width:220px;white-space:normal;
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
  G_tooltip.style.left = Math.min(x, window.innerWidth - 230) + 'px';
  G_tooltip.style.top = y + 'px';
}
function hideTooltip() {
  if (G_tooltip) G_tooltip.style.opacity = '0';
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
      el.style.transition = 'opacity .25s ease';
      el.style.opacity = '1';
    });
  }
  document.querySelectorAll('.sb-link,.bn').forEach(a =>
    a.classList.toggle('on', a.dataset.s === section)
  );
  G.section = section;
  if (section === 'dimensions' && !G.hm) { buildHm(); }
  if (section === 'assurance'  && !G.af) { buildAf(); }
  if (section === 'evidence'   && !G.ef) { buildEv(); }
  if (section === 'fleet'      && !G.ff) { buildFleet(); }
}

function initNav() {
  document.querySelectorAll('.sb-link,.bn').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); nav(a.dataset.s); });
  });
  document.getElementById('sb-tog').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('c');
  });
  document.querySelectorAll('.tb-v').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tb-v').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected','false'); });
      b.classList.add('on'); b.setAttribute('aria-selected','true');
      G.view = b.dataset.v;
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

  /* Help button → reset onboarding */
  const helpBtn = document.getElementById('tb-help');
  if (helpBtn) helpBtn.addEventListener('click', resetOnboarding);

  /* Command palette trigger button */
  const cmdTrigger = document.getElementById('tb-cmd-trigger');
  if (cmdTrigger) cmdTrigger.addEventListener('click', openCmdPalette);

  /* Quick Score button */
  document.querySelectorAll('.sb-quick-score').forEach(btn => {
    btn.addEventListener('click', () => nav('fleet'));
  });
}

/* ── SCORE RING ───────────────────────────────────── */
function animateCount(el, target, duration = 900) {
  const start = performance.now();
  const from = parseFloat(el.textContent) || 0;
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = (from + (target - from) * ease).toFixed(1);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target.toFixed(1);
  }
  requestAnimationFrame(step);
}

function renderScore(d) {
  const overall = d.overall || 0, label = d.latestRun?.trustLabel || '—';
  const trends = d.trends || [];
  const ringColor = scoreColor(overall);

  const circ = 408.41, fill = document.querySelector('.r-fill');
  if (fill) {
    fill.style.stroke = ringColor;
    fill.style.filter = `drop-shadow(0 0 8px ${ringColor})`;
    setTimeout(() => { fill.style.strokeDashoffset = circ * (1 - (overall / 5)); }, 50);
  }

  const ringN = document.querySelector('.ring-n');
  if (ringN) {
    ringN.style.color = ringColor;
    animateCount(ringN, overall);
  }

  const badge = document.querySelector('.score-badge');
  badge.textContent = label; badge.className = 'tb-badge ' + tc(label);

  const trendEl = document.getElementById('score-trend');
  if (trends.length >= 2) {
    const d2 = trends[trends.length-1].overall, d1 = trends[trends.length-2].overall, delta = d2 - d1;
    if (delta > 0.05) trendEl.innerHTML = `<span class="t-up">↑ +${delta.toFixed(2)}</span>`;
    else if (delta < -0.05) trendEl.innerHTML = `<span class="t-dn">↓ ${delta.toFixed(2)}</span>`;
    else trendEl.innerHTML = `<span class="t-fl">→ Stable</span>`;
  }

  const integrity = d.latestRun?.integrityIndex;
  if (integrity != null) document.getElementById('score-int').textContent = `Integrity: ${integrity.toFixed(3)}`;

  document.getElementById('tb-id').textContent = d.agentId || 'default';

  const lastTs = d.trends?.slice(-1)[0]?.ts;
  if (lastTs) {
    const mins = Math.round((Date.now() - lastTs) / 60000);
    const fr = document.getElementById('tb-freshness');
    if (fr) fr.textContent = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins/60)}h ago` : `${Math.round(mins/1440)}d ago`;
  }
}

/* ── DIM BARS — SEMANTIC COLORS ───────────────────── */
function renderDims(d) {
  const layers = d.latestRun?.layerScores || [];
  const el = document.getElementById('dim-bars');
  if (!layers.length) {
    el.innerHTML = '<div class="empty"><span class="empty-i">📊</span><span class="empty-t">No data</span></div>';
    return;
  }
  el.innerHTML = layers.map((l, i) => {
    const pct = (l.avgFinalLevel / 5) * 100;
    const barColor = scoreColor(l.avgFinalLevel);
    const cls = scoreClass(l.avgFinalLevel);
    const short = l.layerName.replace(/ & .*$/, '').replace(/ Agent.*$/, '').replace(/ Operations.*$/, '');
    return `<div class="dim-row" data-dim="${esc(l.layerName)}" data-score="${l.avgFinalLevel.toFixed(2)}"
      style="animation-delay:${i * 60}ms"
      tabindex="0">
      <span class="dim-nm" title="${esc(l.layerName)}">${esc(short)}</span>
      <div class="dim-trk">
        <div class="dim-fill" style="width:${pct}%;background:${barColor};box-shadow:0 0 8px color-mix(in srgb, ${barColor} 30%, transparent);"></div>
        <div class="dim-tgt" style="left:60%"></div>
      </div>
      <span class="dim-v score-${cls}" style="color:${barColor}">${l.avgFinalLevel.toFixed(1)}</span>
    </div>`;
  }).join('');

  /* Tooltips on dim bars */
  el.querySelectorAll('.dim-row').forEach(row => {
    row.addEventListener('mouseenter', e => {
      const name = row.dataset.dim, score = row.dataset.score;
      showTooltip(e, `<strong>${esc(name)}</strong><br><span style="color:${scoreColor(+score)}">${score} / 5.0</span>`);
    });
    row.addEventListener('mousemove', moveTooltip);
    row.addEventListener('mouseleave', hideTooltip);
  });
}

/* ── NEXT ACTIONS ─────────────────────────────────── */
function renderNextActions(d) {
  const el = document.getElementById('next-actions-mount');
  if (!el) return;
  const actions = [];
  const gaps = d.evidenceGaps?.length || 0;
  const denied = d.approvalsSummary?.denied || 0;
  const score = d.overall || 0;
  const layers = d.latestRun?.layerScores || [];
  const weakest = layers.reduce((min, l) => l.avgFinalLevel < (min?.avgFinalLevel ?? 99) ? l : min, null);

  if (gaps > 0) {
    actions.push({
      cls: 'crit', priority: 'crit',
      title: `Fix ${gaps} Evidence Gap${gaps > 1 ? 's' : ''}`,
      sub: 'Missing evidence is the #1 reason scores stay low. Capture execution logs.',
      cmd: 'amc evidence collect', nav: 'evidence'
    });
  }
  if (denied > 0) {
    actions.push({
      cls: 'warn', priority: 'warn',
      title: `Review ${denied} Denied Approval${denied > 1 ? 's' : ''}`,
      sub: 'Denied actions indicate policy violations. Review and replay or update policy.',
      cmd: 'amc approvals list --denied', nav: 'evidence'
    });
  }
  if (weakest && weakest.avgFinalLevel < 3) {
    const dimName = weakest.layerName.split(' ')[0];
    actions.push({
      cls: 'warn', priority: 'warn',
      title: `Improve ${dimName} Dimension (${weakest.avgFinalLevel.toFixed(1)}/5)`,
      sub: 'This dimension is below acceptable threshold. Run targeted assurance packs.',
      cmd: `amc mechanic gap --dim ${dimName.toLowerCase()}`, nav: 'dimensions'
    });
  }
  const lowPacks = (d.assurance || []).filter(p => p.score0to100 < 75);
  if (lowPacks.length > 0) {
    actions.push({
      cls: 'warn', priority: 'warn',
      title: `${lowPacks.length} Assurance Pack${lowPacks.length > 1 ? 's' : ''} Below Target`,
      sub: `${lowPacks.map(p => p.packId.replace(/Pack$/, '')).join(', ')} — run fixes.`,
      cmd: 'amc assurance run --failing', nav: 'assurance'
    });
  }
  if (score < 4) {
    actions.push({
      cls: 'info', priority: 'info',
      title: 'Run Full Score (formal-spec)',
      sub: 'Get cryptographic evidence chains and an auditable score report.',
      cmd: 'amc score formal-spec default', nav: 'overview'
    });
  }

  if (!actions.length) {
    el.innerHTML = `<div class="na-item" style="opacity:.6">
      <span class="na-priority info">✓</span>
      <div class="na-body">
        <div class="na-title">All clear</div>
        <div class="na-sub">No urgent actions. Score ${score.toFixed(1)}/5.0 — run <code style="color:var(--score-hi)">amc up</code> to monitor live.</div>
      </div></div>`;
    return;
  }

  el.innerHTML = actions.slice(0, 4).map((a, i) => `
    <div class="na-item ${a.cls}" data-nav="${a.nav}" style="animation-delay:${i*80}ms">
      <div class="na-priority ${a.priority}">${i + 1}</div>
      <div class="na-body">
        <div class="na-title">${esc(a.title)}</div>
        <div class="na-sub">${esc(a.sub)}</div>
        <div class="na-cmd">${esc(a.cmd)}</div>
      </div>
    </div>`).join('');

  el.querySelectorAll('.na-item[data-nav]').forEach(item => {
    item.addEventListener('click', () => nav(item.dataset.nav));
  });
}

/* ── STATS STRIP — SEMANTIC HIGHLIGHTING ──────────── */
function renderStats(d) {
  const gaps = d.evidenceGaps?.length || 0;
  const pct = (d.benchmarksSummary?.percentileOverall || 0).toFixed(0) + '%';
  const s = [
    { n: (d.latestRun?.questionScores?.length || 0), l: 'Questions', color: null },
    { n: (d.assurance?.length || 0), l: 'Assurance Packs', color: null },
    { n: gaps, l: 'Evidence Gaps', color: gaps > 0 ? (gaps > 5 ? 'var(--score-crit)' : 'var(--score-mid)') : 'var(--score-hi)' },
    { n: (d.approvalsSummary?.approved || 0), l: 'Approvals', color: 'var(--score-hi)' },
    { n: (d.benchmarksSummary?.count || 0), l: 'Benchmarks', color: null },
    { n: pct, l: 'Percentile', color: null },
  ];
  document.getElementById('stats-strip').innerHTML = s.map((x, i) => `
    <div class="stat" style="animation-delay:${i * 50}ms">
      <div class="stat-n" ${x.color ? `style="color:${x.color}"` : ''}>${esc(String(x.n))}</div>
      <div class="stat-l">${esc(x.l)}</div>
    </div>`).join('');
}

/* ── RADAR — SEMANTIC DOTS ────────────────────────── */
function renderRadar(d) {
  const layers = d.latestRun?.layerScores || [];
  if (!layers.length) return;
  const el = document.getElementById('radar-mount');
  const W = 260, H = 280, cx = W / 2, cy = H / 2 + 4, R = 100, n = layers.length;
  const angle = i => (2 * Math.PI * i / n) - Math.PI / 2;
  const pt = (r, i) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];

  const rings = [1, 2, 3, 4, 5].map(ring => {
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

  const dots = layers.map((l, i) => {
    const [x, y] = pt((l.avgFinalLevel / 5) * R, i);
    const dc = scoreColor(l.avgFinalLevel);
    return `<circle class="radar-dot" cx="${x}" cy="${y}" r="4" fill="${dc}" stroke="${dc}" stroke-width="1.5" opacity=".9">
      <title>${esc(l.layerName)}: ${l.avgFinalLevel.toFixed(2)}</title></circle>`;
  }).join('');

  const labels = layers.map((l, i) => {
    const [x, y] = pt(R + 26, i);
    const anch = x < cx - 4 ? 'end' : x > cx + 4 ? 'start' : 'middle';
    const short = l.layerName.split(' ')[0];
    const vc = scoreColor(l.avgFinalLevel);
    return `<text class="radar-lbl" x="${x}" y="${y + 3}" text-anchor="${anch}">${esc(short)}</text>
      <text x="${x}" y="${y + 14}" text-anchor="${anch}" font-size="9" font-family="JetBrains Mono,monospace" fill="${vc}" opacity=".85">${l.avgFinalLevel.toFixed(1)}</text>`;
  }).join('');

  const rnums = [1, 2, 3, 4, 5].map(r => {
    const rr = (R / 5) * r;
    return `<text x="${cx + 3}" y="${cy - rr - 2}" font-size="8" font-family="JetBrains Mono,monospace" fill="rgba(0,255,65,.3)" text-anchor="start">${r}</text>`;
  }).join('');

  el.innerHTML = `<svg viewBox="-28 -12 ${W + 56} ${H + 28}" style="width:100%;max-height:290px;overflow:visible">
    ${rings}${axes}
    <polygon class="radar-shape" id="radar-poly" points="${dpts.join(' ')}"/>
    ${rnums}${dots}${labels}
  </svg>`;
  requestAnimationFrame(() => document.getElementById('radar-poly')?.classList.add('show'));
}

/* ── TIMELINE ─────────────────────────────────────── */
function renderTimeline(d) {
  const trends = d.trends || [];
  const el = document.getElementById('tl-mount');
  if (!trends.length) {
    el.innerHTML = '<div class="empty"><span class="empty-i">📈</span><span class="empty-t">No trend data</span></div>';
    return;
  }
  el.innerHTML = `<div class="tl-outer" style="position:relative"><div class="tl-tip" id="tl-tip"></div></div>`;
  const wrap = el.querySelector('.tl-outer');
  const W = wrap.clientWidth || 680, H = 170;
  const P = { t: 10, r: 16, b: 28, l: 32 };
  const cw = W - P.l - P.r, ch = H - P.t - P.b, n = trends.length;
  const sx = i => P.l + (i / (n - 1 || 1)) * cw;
  const sy = v => P.t + (1 - v / 5) * ch;

  const area = trends.map((t, i) => `${sx(i)},${sy(t.overall)}`).join(' ');
  const areaPts = `${sx(0)},${P.t + ch} ${area} ${sx(n-1)},${P.t + ch}`;

  const ygrid = [1, 2, 3, 4, 5].map(v =>
    `<line class="tl-grid-l" x1="${P.l}" y1="${sy(v)}" x2="${P.l + cw}" y2="${sy(v)}"/>
     <text class="tl-lbl" x="${P.l - 4}" y="${sy(v) + 3}" text-anchor="end">${v}</text>`).join('');

  const step = Math.max(1, Math.floor(n / 5));
  const xlbls = trends.map((t, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const dd = new Date(t.ts);
    return `<text class="tl-lbl" x="${sx(i)}" y="${H - 6}" text-anchor="middle">${dd.getDate()}/${dd.getMonth() + 1}</text>`;
  }).join('');

  const hdots = trends.map((t, i) => `<circle class="tl-dot" cx="${sx(i)}" cy="${sy(t.overall)}" r="3.5" data-i="${i}"/>`).join('');

  const targetY = sy(4.0);
  const targetLine = `<line x1="${P.l}" y1="${targetY}" x2="${P.l + cw}" y2="${targetY}" stroke="rgba(245,158,11,.25)" stroke-width="1" stroke-dasharray="4,3"/>
    <text x="${P.l + cw + 4}" y="${targetY + 3}" font-size="8" font-family="JetBrains Mono,monospace" fill="rgba(245,158,11,.5)" text-anchor="start">Target</text>`;

  wrap.insertAdjacentHTML('afterbegin', `<svg class="tl-svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">
    <defs><linearGradient id="tl-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,255,65,.15)"/>
      <stop offset="100%" stop-color="rgba(0,255,65,0)"/>
    </linearGradient></defs>
    <line class="tl-axis" x1="${P.l}" y1="${P.t}" x2="${P.l}" y2="${P.t + ch}"/>
    <line class="tl-axis" x1="${P.l}" y1="${P.t + ch}" x2="${P.l + cw}" y2="${P.t + ch}"/>
    ${ygrid}${targetLine}
    <polygon class="tl-area" points="${areaPts}"/>
    <polyline class="tl-line" points="${area}"/>
    ${hdots}${xlbls}
  </svg>`);

  const tip = document.getElementById('tl-tip');
  wrap.querySelectorAll('.tl-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      const i = +dot.dataset.i, t = trends[i];
      const lft = sx(i) > cw / 2 ? sx(i) - 140 : sx(i) + 10;
      tip.innerHTML = `<strong>${t.overall.toFixed(2)}/5.0</strong><br><span style="color:var(--t3)">${new Date(t.ts).toLocaleDateString()}</span>`;
      tip.style.left = lft + 'px'; tip.style.top = '8px';
      tip.classList.add('v');
    });
    dot.addEventListener('mouseleave', () => tip.classList.remove('v'));
  });
}

/* ── ASSURANCE SUMMARY — SEMANTIC BARS ────────────── */
function renderAsrSummary(d) {
  const el = document.getElementById('asr-summary');
  const packs = d.assurance || [];
  if (!packs.length) {
    el.innerHTML = '<div class="empty"><span class="empty-i">🛡️</span><span class="empty-t">No assurance runs</span></div>';
    return;
  }
  el.innerHTML = packs.map(p => {
    const pct = p.score0to100;
    const col = scoreColor(pct, 100);
    const short = p.packId.replace(/Pack$/, '').replace(/([A-Z])/g, ' $1').trim();
    return `<div class="asr-bar-item">
      <span class="asr-bar-nm" title="${esc(p.packId)}">${esc(short)}</span>
      <div class="asr-bar-trk"><div class="asr-bar-fill" style="width:${pct}%;background:${col}"></div></div>
      <span class="asr-bar-pct" style="color:${col}">${Math.round(pct)}%</span>
    </div>`;
  }).join('');
}

/* ── APPROVALS ────────────────────────────────────── */
function renderApprovals(d) {
  const a = d.approvalsSummary || {};
  const denied = a.denied || 0;
  const deniedColor = denied > 0 ? 'var(--score-lo)' : 'var(--t1)';
  const action = denied > 0
    ? `<div style="margin-top:10px;text-align:center"><a href="#evidence" class="sb-link" data-s="evidence" style="display:inline;padding:4px 10px;font:500 10px/1 var(--sans);color:var(--score-mid);border:1px solid var(--a-line);border-radius:4px;background:var(--a-dim)">${denied} denied → Review</a></div>`
    : '';
  document.getElementById('ap-mount').innerHTML = `<div class="ap-row">
    <div class="ap-c"><div class="ap-n" style="color:var(--score-hi)">${a.approved || 0}</div><div class="ap-l">Approved</div></div>
    <div class="ap-c"><div class="ap-n" style="color:${deniedColor}">${denied}</div><div class="ap-l">Denied</div></div>
    <div class="ap-c"><div class="ap-n" style="color:var(--score-mid)">${a.replayAttempts || 0}</div><div class="ap-l">Replays</div></div>
  </div>${action}`;
  const link = document.querySelector('#ap-mount a[data-s]');
  if (link) link.addEventListener('click', e => { e.preventDefault(); nav('evidence'); });
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
      ? (parseFloat(val) > 0.3 ? 'var(--score-mid)' : 'var(--score-hi)')
      : 'var(--t0)';
    return `<div class="val-row"><span class="val-k">${esc(lbl)}</span><span class="val-v" style="color:${col}">${esc(val)}</span></div>`;
  }).join('');
  const vs = typeof v.valueScore === 'number' ? v.valueScore : 0;
  const vsPct = Math.min(100, vs);
  const vsCol = scoreColor(vs, 100);
  document.getElementById('val-mount').innerHTML = rows +
    `<div style="margin-top:8px"><div class="asr-bar-trk"><div class="asr-bar-fill" style="width:${vsPct}%;background:${vsCol}"></div></div></div>`;
}

/* ── HEATMAP ──────────────────────────────────────── */
function buildHm() {
  G.hm = true;
  const qs = G.data.latestRun?.questionScores || [];
  const tm = G.data.targetMapping || {};
  const el = document.getElementById('hm-mount');
  if (!qs.length) {
    el.innerHTML = '<div class="empty"><span class="empty-i">🗺️</span><span class="empty-t">No data</span></div>';
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
        <span class="hm-n" style="color:var(--t3)">${tgt}</span>
        <span class="hm-n ${gc}">${gap > 0 ? '+' : ''}${gap}</span>
        <div class="hm-conf"><div class="hm-cf" style="width:${conf}%;background:${sc}"></div></div>
      </div>`;
    }).join('');
    return `<div class="hm-grp">
      <div class="hm-ghdr">${esc(nm)}<span style="color:var(--t3);font-size:9px">${rows.length}q</span></div>
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
  if (!q) return;
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
      <div class="qd-bar"><div class="qd-bfill" style="width:${conf}%;background:var(--g2)"></div></div></div>
    <div class="qd-f"><span class="qd-fl">Evidence Events</span><span class="qd-fv">${(q.evidenceEventIds || []).length}</span></div>
  </div>`;
}

/* ── ASSURANCE FULL — SEMANTIC DONUTS ─────────────── */
function asrCard(p) {
  const pct = p.score0to100 / 100, circ = 2 * Math.PI * 17, off = circ * (1 - pct);
  const col = scoreColor(p.score0to100, 100);
  const short = p.packId.replace(/Pack$/, '').replace(/([A-Z])/g, ' $1').trim();
  return `<div class="asr-card">
    <svg class="asr-donut" viewBox="0 0 40 40">
      <circle class="donut-bg" cx="20" cy="20" r="17" stroke-width="5"/>
      <circle class="donut-fill" cx="20" cy="20" r="17" stroke-width="5" stroke="${col}"
        stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
        transform="rotate(-90 20 20)"/>
      <text class="donut-pct" x="20" y="21" fill="${col}">${Math.round(pct * 100)}%</text>
    </svg>
    <div class="asr-info">
      <div class="asr-name" title="${esc(p.packId)}">${esc(short)}</div>
      <div class="asr-sub">✓${p.passCount} ✗${p.failCount}</div>
    </div>
  </div>`;
}

function buildAf() {
  G.af = true;
  const packs = G.data.assurance || [];
  const el = document.getElementById('af-mount');
  el.innerHTML = packs.length
    ? `<div class="asr-grid">${packs.map(asrCard).join('')}</div>`
    : '<div class="empty empty-t">No assurance runs</div>';
  const idx = G.data.indices?.indices || [];
  const idxEl = document.getElementById('idx-mount');
  idxEl.innerHTML = idx.length ? idx.map(x => {
    const col = scoreColor(x.score0to100, 100);
    const nm = x.id.replace(/([A-Z])/g, ' $1').replace(/Risk$/, ' Risk').trim();
    return `<div class="idx-row"><span class="idx-nm">${esc(nm)}</span>
      <div class="idx-trk"><div class="idx-fill" style="width:${x.score0to100}%;background:${col}"></div></div>
      <span class="idx-pct" style="color:${col}">${x.score0to100.toFixed(0)}</span></div>`;
  }).join('') : '<div class="empty-t" style="color:var(--t3);padding:12px 0">No index data</div>';
}

/* ── EVIDENCE ─────────────────────────────────────── */
function buildEv() {
  G.ef = true;
  const gaps = G.data.evidenceGaps || [];
  const el = document.getElementById('ev-mount');
  el.innerHTML = gaps.length ? gaps.map(g => `<div class="ev-item">
    <div class="ev-dot" style="background:var(--score-lo)"></div>
    <span class="ev-qid">${esc(g.questionId)}</span>
    <span class="ev-r">${esc(g.reason)}</span>
  </div>`).join('') : '<div class="empty"><span class="empty-i">✅</span><span class="empty-t">No evidence gaps</span></div>';
  const eoc = G.data.eoc || {};
  const cols = [['Education', eoc.education || []], ['Ownership', eoc.ownership || []], [`Commitment (${eoc.days || 14}d)`, eoc.commitment || []]];
  document.getElementById('eoc-mount').innerHTML = `<div class="eoc">${cols.map(([t, items]) => `
    <div class="eoc-col">
      <div class="eoc-h">${esc(t)}</div>
      ${items.map(i => `<div class="eoc-item"><input type="checkbox" class="eoc-cb"/><span>${esc(i)}</span></div>`).join('')}
      ${!items.length ? '<span style="color:var(--t3);font-size:11px">—</span>' : ''}
    </div>`).join('')}</div>`;
}

/* ── FLEET ────────────────────────────────────────── */
function buildFleet() {
  G.ff = true;
  const st = G.data.studioHome || {};
  const sfields = [
    { l: 'Studio', v: st.running ? 'Running' : 'Stopped', c: st.running ? 'ok' : 'bad' },
    { l: 'Vault', v: st.vaultUnlocked ? 'Unlocked' : 'Locked', c: st.vaultUnlocked ? 'ok' : 'warn' },
    { l: 'Action Policy', v: st.actionPolicySignature || '—', c: st.actionPolicySignature === 'VALID' ? 'ok' : 'bad' },
    { l: 'Tools Sig', v: st.toolsSignature || '—', c: st.toolsSignature === 'VALID' ? 'ok' : 'bad' },
    { l: 'Gateway', v: st.gatewayUrl || 'n/a', c: 'def' },
    { l: 'Dashboard', v: st.dashboardUrl || window.location.origin, c: 'def' },
  ];
  document.getElementById('studio-mount').innerHTML = `<div class="studio-grid">${sfields.map(f => `
    <div class="ss"><div class="ss-l">${esc(f.l)}</div><div class="ss-v ${f.c}">${esc(f.v)}</div></div>`).join('')}</div>`;
  const agents = st.agents || [];
  const ftEl = document.getElementById('fleet-mount');
  ftEl.innerHTML = agents.length ? `<table class="fleet-t">
    <thead><tr><th>Agent</th><th>Score</th><th>Trust</th><th>Provider</th><th>Model</th><th>Frozen</th></tr></thead>
    <tbody>${agents.map(a => {
      const sc = a.overall != null ? scoreColor(a.overall) : 'var(--t2)';
      return `<tr>
        <td>${esc(a.id)}</td>
        <td style="color:${sc}">${a.overall != null ? a.overall.toFixed(2) : '—'}</td>
        <td><span class="tb-badge ${a.overall != null ? scoreClass(a.overall) : 'md'}">${esc(a.trustLabel || '—')}</span></td>
        <td>${esc(a.lastProvider || '—')}</td>
        <td>${esc(a.lastModel || '—')}</td>
        <td>${a.freezeActive ? `<span style="color:var(--score-mid)">Yes</span>` : '—'}</td>
      </tr>`;
    }).join('')}</tbody></table>` :
    '<div class="empty"><span class="empty-i">🤖</span><span class="empty-t">No agents</span></div>';
  const bm = G.data.benchmarksSummary || {};
  document.getElementById('bm-mount').innerHTML = [
    { k: 'Total Benchmarks', v: bm.count || 0 },
    { k: 'Overall Percentile', v: (bm.percentileOverall || 0).toFixed(1) + '%' }
  ].map(x => `<div class="val-row"><span class="val-k">${esc(x.k)}</span><span class="val-v">${esc(String(x.v))}</span></div>`).join('');
  const exs = st.toolhubExecutions || [];
  document.getElementById('th-mount').innerHTML = exs.length
    ? exs.slice(0, 8).map(e => `<div class="val-row"><span class="val-k">${esc(e.toolName || 'tool')}</span><span class="val-v" style="color:var(--t2)">${esc(e.effectiveMode || '—')}</span></div>`).join('')
    : '<div class="empty-t" style="color:var(--t3);padding:12px 0">No recent executions</div>';
}

/* ── SETTINGS SECTION ─────────────────────────────── */
function buildSettings() {
  const container = document.getElementById('settings-mount');
  if (!container) return;
  const agentId = G.data?.agentId || 'default';
  container.innerHTML = `
    <div style="display:grid;gap:16px;max-width:600px">

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot"></span>Appearance</div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--bdr)">
          <div>
            <div style="font:500 13px/1 var(--sans);color:var(--t0)">Theme</div>
            <div style="font:400 11px/1.4 var(--sans);color:var(--t2);margin-top:3px">Dark mode (Matrix)</div>
          </div>
          <div style="width:44px;height:24px;background:var(--score-hi);border-radius:12px;position:relative;cursor:not-allowed;opacity:.9">
            <div style="width:18px;height:18px;background:#000;border-radius:9px;position:absolute;right:3px;top:3px"></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0">
          <div>
            <div style="font:500 13px/1 var(--sans);color:var(--t0)">Compact mode</div>
            <div style="font:400 11px/1.4 var(--sans);color:var(--t2);margin-top:3px">Reduce card padding</div>
          </div>
          <div style="width:44px;height:24px;background:var(--inset);border:1px solid var(--bdr);border-radius:12px;position:relative;cursor:pointer" id="compact-tog">
            <div style="width:18px;height:18px;background:var(--t3);border-radius:9px;position:absolute;left:3px;top:2px;transition:all .2s" id="compact-knob"></div>
          </div>
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot"></span>Agent</div>
        <div style="padding:8px 0">
          <label style="font:500 12px/1 var(--mono);color:var(--t2);display:block;margin-bottom:8px">Active Agent ID</label>
          <select style="
            width:100%;background:var(--inset);border:1px solid var(--bdr);border-radius:8px;
            padding:9px 12px;font:500 13px/1 var(--mono);color:var(--t0);cursor:pointer;outline:none;
          ">
            <option value="${esc(agentId)}" selected>${esc(agentId)}</option>
          </select>
          <div style="font:400 11px/1.4 var(--sans);color:var(--t3);margin-top:6px">Switch agents using: <code style="color:var(--score-hi)">amc agent use &lt;id&gt;</code></div>
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot"></span>Export</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;padding:8px 0">
          <a href="/export.md" style="
            display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
            background:var(--g-dim);border:1px solid var(--g-line);border-radius:8px;
            font:500 12px/1 var(--mono);color:var(--score-hi);text-decoration:none;transition:all .2s;
          ">📄 Markdown Report</a>
          <a href="/export.pdf" style="
            display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
            background:var(--inset);border:1px solid var(--bdr);border-radius:8px;
            font:500 12px/1 var(--mono);color:var(--t1);text-decoration:none;transition:all .2s;
          ">🖨️ PDF Report</a>
          <button onclick="navigator.clipboard?.writeText(JSON.stringify(G.data,null,2))" style="
            display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
            background:var(--inset);border:1px solid var(--bdr);border-radius:8px;
            font:500 12px/1 var(--mono);color:var(--t1);cursor:pointer;transition:all .2s;
          ">📋 Copy JSON</button>
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <div class="ch"><span class="ch-dot" style="background:var(--score-hi)"></span>About AMC</div>
        <div style="font:400 12px/1.7 var(--sans);color:var(--t1);padding:8px 0">
          <strong style="color:var(--t0)">Agent Maturity Compass</strong> — the open-source trust scoring framework for AI agents.<br>
          Evidence-based. Cryptographically verifiable. Zero fluff.<br><br>
          <span style="color:var(--t2)">Built by the wise crab. MIT licensed.</span>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">
          <a href="https://github.com/thewisecrab/AgentMaturityCompass" target="_blank" style="font:500 11px/1 var(--mono);color:var(--score-hi);text-decoration:none">GitHub →</a>
          <a href="https://thewisecrab.github.io/AgentMaturityCompass" target="_blank" style="font:500 11px/1 var(--mono);color:var(--t2);text-decoration:none">Docs →</a>
        </div>
      </div>

    </div>
  `;

  const tog = document.getElementById('compact-tog');
  const knob = document.getElementById('compact-knob');
  let compact = false;
  if (tog) tog.addEventListener('click', () => {
    compact = !compact;
    tog.style.background = compact ? 'var(--score-hi)' : 'var(--inset)';
    knob.style.left = compact ? '23px' : '3px';
    knob.style.background = compact ? '#000' : 'var(--t3)';
    document.body.classList.toggle('compact', compact);
  });
}

/* ── INIT ─────────────────────────────────────────── */
(async function init() {
  try {
    /* ── THEME ─────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('amc_theme') || 'dark';
  applyTheme(saved);
  // Wire theme toggle button
  const btn = document.getElementById('tb-theme');
  if (btn) btn.addEventListener('click', () => toggleTheme());
  // Wire settings theme toggles
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

G.data = await xfetch('./data.json');

    initTheme();
    initTooltip();
    buildCommandPalette();
    initNav();

    renderScore(G.data);
    renderDims(G.data);
    renderStats(G.data);
    renderNextActions(G.data);
    renderRadar(G.data);
    renderTimeline(G.data);
    renderAsrSummary(G.data);
    renderApprovals(G.data);
    renderValue(G.data);

    /* Settings section (lazy — only if DOM node exists) */
    if (document.getElementById('settings-mount')) buildSettings();

    /* Show onboarding after render (slight delay for polish) */
    setTimeout(() => buildOnboarding(), 400);

  } catch (err) {
    document.getElementById('content').innerHTML = `<div class="empty" style="margin-top:80px">
      <span class="empty-i">⚠️</span>
      <span class="empty-t">Failed to load: <code style="color:var(--score-mid)">${esc(err.message)}</code><br>
      Run <code style="color:var(--score-hi)">amc dashboard build</code> first.</span>
    </div>`;
  }
})();
