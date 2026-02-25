/* AMC Dashboard v3 App */
const G = { data:null, section:'overview', view:'engineer', hm:false, af:false, ef:false, ff:false };
const esc = v => String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt = (n,d=2) => typeof n==='number' ? n.toFixed(d) : '—';

/* Trust badge class */
function tc(lbl) {
  const l=(lbl||'').toUpperCase();
  if (l.includes('HIGH')||l.includes('RELIABLE')) return 'hi';
  if (l.includes('LOW')||l.includes('UNRELIABLE')||l.includes('DO NOT')) return 'lo';
  return 'md';
}

async function xfetch(p) { const r=await fetch(p); if(!r.ok) throw new Error(p+':'+r.status); return r.json(); }

/* ── NAV ──────────────────────────────────────────── */
function nav(section) {
  document.querySelectorAll('.sec').forEach(s=>s.classList.add('h'));
  const el=document.getElementById('s-'+section);
  if(el){el.classList.remove('h');el.classList.add('fade');}
  document.querySelectorAll('.sb-link,.bn').forEach(a=>a.classList.toggle('on',a.dataset.s===section));
  G.section=section;
  if(section==='dimensions'&&!G.hm){buildHm();}
  if(section==='assurance'&&!G.af){buildAf();}
  if(section==='evidence'&&!G.ef){buildEv();}
  if(section==='fleet'&&!G.ff){buildFleet();}
}

function initNav() {
  document.querySelectorAll('.sb-link,.bn').forEach(a=>{
    a.addEventListener('click',e=>{e.preventDefault();nav(a.dataset.s);});
  });
  document.getElementById('sb-tog').addEventListener('click',()=>{
    document.querySelector('.sidebar').classList.toggle('c');
  });
  document.querySelectorAll('.tb-v').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.tb-v').forEach(x=>{x.classList.remove('on');x.setAttribute('aria-selected','false');});
      b.classList.add('on');b.setAttribute('aria-selected','true');
      G.view=b.dataset.v;
    });
  });
}

/* ── SCORE RING ───────────────────────────────────── */
function renderScore(d) {
  const overall=d.overall||0, label=d.latestRun?.trustLabel||'—';
  const trends=d.trends||[];
  // Animate ring
  const circ=408.41, fill=document.querySelector('.r-fill');
  if(fill) setTimeout(()=>{ fill.style.strokeDashoffset=circ*(1-(overall/5)); },50);
  document.querySelector('.ring-n').textContent=overall.toFixed(1);
  // Trust badge
  const badge=document.querySelector('.score-badge');
  badge.textContent=label; badge.className='tb-badge '+tc(label);
  // Trend
  const trendEl=document.getElementById('score-trend');
  if(trends.length>=2){
    const d2=trends[trends.length-1].overall, d1=trends[trends.length-2].overall, delta=d2-d1;
    if(delta>0.05) trendEl.innerHTML=`<span class="t-up">↑ +${delta.toFixed(2)}</span>`;
    else if(delta<-0.05) trendEl.innerHTML=`<span class="t-dn">↓ ${delta.toFixed(2)}</span>`;
    else trendEl.innerHTML=`<span class="t-fl">→ Stable</span>`;
  }
  // Integrity
  const integrity=d.latestRun?.integrityIndex;
  if(integrity!=null) document.getElementById('score-int').textContent=`Integrity: ${integrity.toFixed(3)}`;
  // Topbar
  document.getElementById('tb-id').textContent=d.agentId||'default';
  // Freshness — show last trend timestamp
  const lastTs = d.trends?.slice(-1)[0]?.ts;
  if (lastTs) {
    const mins = Math.round((Date.now() - lastTs) / 60000);
    const fr = document.getElementById('tb-freshness');
    if (fr) fr.textContent = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins/60)}h ago` : `${Math.round(mins/1440)}d ago`;
  }
}

/* ── DIM BARS ─────────────────────────────────────── */
function renderDims(d) {
  const layers=d.latestRun?.layerScores||[];
  const el=document.getElementById('dim-bars');
  if(!layers.length){el.innerHTML='<div class="empty"><span class="empty-i">📊</span><span class="empty-t">No data</span></div>';return;}
  el.innerHTML=layers.map(l=>{
    const pct=(l.avgFinalLevel/5)*100;
    const short=l.layerName.replace(/ & .*$/, '').replace(/ Agent.*$/, '').replace(/ Operations.*$/, '');
    return `<div class="dim-row">
      <span class="dim-nm" title="${esc(l.layerName)}">${esc(short)}</span>
      <div class="dim-trk">
        <div class="dim-fill" style="width:${pct}%"></div>
        <div class="dim-tgt" style="left:60%"></div>
      </div>
      <span class="dim-v">${l.avgFinalLevel.toFixed(1)}</span>
    </div>`;
  }).join('');
}

/* ── NEXT ACTIONS (Lena Torres: "What should I do now?") ─── */
function renderNextActions(d) {
  const el = document.getElementById('next-actions-mount');
  if (!el) return;
  const actions = [];
  const gaps = d.evidenceGaps?.length || 0;
  const denied = d.approvalsSummary?.denied || 0;
  const score = d.overall || 0;
  const layers = d.latestRun?.layerScores || [];

  // Find weakest dimension
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
  // Low assurance packs
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
    el.innerHTML = `<div class="na-item" style="opacity:.6"><span class="na-priority info">✓</span><div class="na-body"><div class="na-title">All clear</div><div class="na-sub">No urgent actions. Score ${score.toFixed(1)}/5.0 — run <code style="color:var(--g)">amc up</code> to monitor live.</div></div></div>`;
    return;
  }

  el.innerHTML = actions.slice(0, 4).map((a, i) => `
    <div class="na-item ${a.cls}" data-nav="${a.nav}">
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

/* ── STATS ────────────────────────────────────────── */
function renderStats(d) {
  const gaps=d.evidenceGaps?.length||0;
  const s=[
    {n:(d.latestRun?.questionScores?.length||0),l:'Questions'},
    {n:(d.assurance?.length||0),l:'Assurance Packs'},
    {n:gaps,l:'Evidence Gaps',risk:gaps>5},
    {n:(d.approvalsSummary?.approved||0),l:'Approvals'},
    {n:(d.benchmarksSummary?.count||0),l:'Benchmarks'},
    {n:((d.benchmarksSummary?.percentileOverall||0).toFixed(0)+'%'),l:'Percentile'},
  ];
  document.getElementById('stats-strip').innerHTML=s.map(x=>
    `<div class="stat${x.risk?' risk':''}">
      <div class="stat-n">${esc(String(x.n))}</div>
      <div class="stat-l">${esc(x.l)}</div>
    </div>`).join('');
}

/* ── SCORE MATRIX (replaces radar — shows score vs target gap per dimension) ── */
function renderRadar(d) {
  const layers=d.latestRun?.layerScores||[];
  if(!layers.length)return;
  const el=document.getElementById('radar-mount');
  const W=260,H=280,cx=W/2,cy=H/2+4,R=100,n=layers.length;
  const angle=(i)=>(2*Math.PI*i/n)-Math.PI/2;
  const pt=(r,i)=>[cx+Math.cos(angle(i))*r, cy+Math.sin(angle(i))*r];

  const rings=[1,2,3,4,5].map(ring=>{
    const r=(R/5)*ring;
    const pts=layers.map((_,i)=>pt(r,i).join(','));
    return `<polygon class="radar-grid-ring" points="${pts.join(' ')}"/>`;
  }).join('');

  const axes=layers.map((_,i)=>{
    const [x,y]=pt(R,i);
    return `<line class="radar-axis-line" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
  }).join('');

  const dpts=layers.map((l,i)=>{
    const [x,y]=pt((l.avgFinalLevel/5)*R,i);
    return `${x},${y}`;
  });

  const dots=layers.map((l,i)=>{
    const [x,y]=pt((l.avgFinalLevel/5)*R,i);
    return `<circle class="radar-dot" cx="${x}" cy="${y}" r="3.5"><title>${esc(l.layerName)}: ${l.avgFinalLevel.toFixed(2)}</title></circle>`;
  }).join('');

  const labels=layers.map((l,i)=>{
    const [x,y]=pt(R+26,i);
    const anch=x<cx-4?'end':x>cx+4?'start':'middle';
    const short=l.layerName.split(' ')[0];
    return `<text class="radar-lbl" x="${x}" y="${y+3}" text-anchor="${anch}">${esc(short)}</text>
      <text x="${x}" y="${y+14}" text-anchor="${anch}" font-size="9" font-family="JetBrains Mono,monospace" fill="var(--g)" opacity=".7">${l.avgFinalLevel.toFixed(1)}</text>`;
  }).join('');

  // Ring level numbers
  const rnums=[1,2,3,4,5].map(r=>{
    const rr=(R/5)*r;
    return `<text x="${cx+3}" y="${cy-rr-2}" font-size="8" font-family="JetBrains Mono,monospace" fill="rgba(0,255,65,.3)" text-anchor="start">${r}</text>`;
  }).join('');

  el.innerHTML=`<svg viewBox="-28 -12 ${W+56} ${H+28}" style="width:100%;max-height:290px;overflow:visible">
    ${rings}${axes}
    <polygon class="radar-shape" id="radar-poly" points="${dpts.join(' ')}"/>
    ${rnums}${dots}${labels}
  </svg>`;
  requestAnimationFrame(()=>document.getElementById('radar-poly')?.classList.add('show'));
}

/* ── TIMELINE ─────────────────────────────────────── */
function renderTimeline(d) {
  const trends=d.trends||[];
  const el=document.getElementById('tl-mount');
  if(!trends.length){el.innerHTML='<div class="empty"><span class="empty-i">📈</span><span class="empty-t">No trend data</span></div>';return;}
  el.innerHTML=`<div class="tl-outer" style="position:relative"><div class="tl-tip" id="tl-tip"></div></div>`;
  const wrap=el.querySelector('.tl-outer');
  const W=wrap.clientWidth||680, H=170;
  const P={t:10,r:16,b:28,l:32};
  const cw=W-P.l-P.r, ch=H-P.t-P.b, n=trends.length;
  const sx=i=>P.l+(i/(n-1||1))*cw;
  const sy=v=>P.t+(1-v/5)*ch;

  const area=trends.map((t,i)=>`${sx(i)},${sy(t.overall)}`).join(' ');
  const line=area;
  const areaPts=`${sx(0)},${P.t+ch} ${area} ${sx(n-1)},${P.t+ch}`;

  // Y grid
  const ygrid=[1,2,3,4,5].map(v=>
    `<line class="tl-grid-l" x1="${P.l}" y1="${sy(v)}" x2="${P.l+cw}" y2="${sy(v)}"/>
     <text class="tl-lbl" x="${P.l-4}" y="${sy(v)+3}" text-anchor="end">${v}</text>`).join('');

  // X labels
  const step=Math.max(1,Math.floor(n/5));
  const xlbls=trends.map((t,i)=>{
    if(i%step!==0&&i!==n-1)return'';
    const dd=new Date(t.ts);
    return `<text class="tl-lbl" x="${sx(i)}" y="${H-6}" text-anchor="middle">${dd.getDate()}/${dd.getMonth()+1}</text>`;
  }).join('');

  const hdots=trends.map((t,i)=>`<circle class="tl-dot" cx="${sx(i)}" cy="${sy(t.overall)}" r="3.5" data-i="${i}"/>`).join('');

  // Target line at 4.0 (HIGH TRUST threshold)
  const targetY = sy(4.0);
  const targetLine = `<line x1="${P.l}" y1="${targetY}" x2="${P.l+cw}" y2="${targetY}" stroke="rgba(245,158,11,.25)" stroke-width="1" stroke-dasharray="4,3"/>
    <text x="${P.l+cw+4}" y="${targetY+3}" font-size="8" font-family="JetBrains Mono,monospace" fill="rgba(245,158,11,.5)" text-anchor="start">Target</text>`;

  wrap.insertAdjacentHTML('afterbegin',`<svg class="tl-svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">
    <defs><linearGradient id="tl-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,255,65,.15)"/>
      <stop offset="100%" stop-color="rgba(0,255,65,0)"/>
    </linearGradient></defs>
    <line class="tl-axis" x1="${P.l}" y1="${P.t}" x2="${P.l}" y2="${P.t+ch}"/>
    <line class="tl-axis" x1="${P.l}" y1="${P.t+ch}" x2="${P.l+cw}" y2="${P.t+ch}"/>
    ${ygrid}
    ${targetLine}
    <polygon class="tl-area" points="${areaPts}"/>
    <polyline class="tl-line" points="${line}"/>
    ${hdots}${xlbls}
  </svg>`);

  const tip=document.getElementById('tl-tip');
  wrap.querySelectorAll('.tl-dot').forEach(dot=>{
    dot.addEventListener('mouseenter',()=>{
      const i=+dot.dataset.i, t=trends[i];
      const lft=sx(i)>cw/2?sx(i)-140:sx(i)+10;
      tip.innerHTML=`<strong>${t.overall.toFixed(2)}/5.0</strong><br><span style="color:var(--t3)">${new Date(t.ts).toLocaleDateString()}</span>`;
      tip.style.left=lft+'px'; tip.style.top='8px';
      tip.classList.add('v');
    });
    dot.addEventListener('mouseleave',()=>tip.classList.remove('v'));
  });
}

/* ── ASSURANCE SUMMARY (overview — horizontal bars) ── */
function renderAsrSummary(d){
  const el=document.getElementById('asr-summary');
  const packs=d.assurance||[];
  if(!packs.length){el.innerHTML='<div class="empty"><span class="empty-i">🛡️</span><span class="empty-t">No assurance runs</span></div>';return;}
  el.innerHTML=packs.map(p=>{
    const pct=p.score0to100;
    const col=pct>=80?'var(--g)':pct>=60?'var(--amber)':'var(--red)';
    const short=p.packId.replace(/Pack$/,'').replace(/([A-Z])/g,' $1').trim();
    return `<div class="asr-bar-item">
      <span class="asr-bar-nm" title="${esc(p.packId)}">${esc(short)}</span>
      <div class="asr-bar-trk"><div class="asr-bar-fill" style="width:${pct}%;background:${col}"></div></div>
      <span class="asr-bar-pct" style="color:${col}">${Math.round(pct)}%</span>
    </div>`;
  }).join('');
}

/* ── APPROVALS ────────────────────────────────────── */
function renderApprovals(d){
  const a=d.approvalsSummary||{};
  const denied=a.denied||0;
  const action=denied>0?`<div style="margin-top:10px;text-align:center"><a href="#evidence" class="sb-link" data-s="evidence" style="display:inline;padding:4px 10px;font:500 10px/1 var(--sans);color:var(--amber);border:1px solid var(--a-line);border-radius:4px;background:var(--a-dim)">${denied} denied → Review</a></div>`:'';
  document.getElementById('ap-mount').innerHTML=`<div class="ap-row">
    <div class="ap-c"><div class="ap-n">${a.approved||0}</div><div class="ap-l">Approved</div></div>
    <div class="ap-c"><div class="ap-n" style="color:var(--red)">${denied}</div><div class="ap-l">Denied</div></div>
    <div class="ap-c"><div class="ap-n" style="color:var(--amber)">${a.replayAttempts||0}</div><div class="ap-l">Replays</div></div>
  </div>${action}`;
  // Wire up the review link
  const link=document.querySelector('#ap-mount a[data-s]');
  if(link) link.addEventListener('click',e=>{e.preventDefault();nav('evidence');});
}

/* ── VALUE ────────────────────────────────────────── */
function renderValue(d){
  const v=d.valueSummary||{};
  const keys=[
    ['valueScore','Value Score'],
    ['economicSignificanceIndex','Economic Sig.'],
    ['valueRegressionRisk','Regression Risk'],
  ];
  const rows=keys.map(([k,lbl])=>{
    const val=typeof v[k]==='number'?v[k].toFixed(2):'—';
    const col=k==='valueRegressionRisk'?(parseFloat(val)>0.3?'var(--amber)':'var(--g)'):'var(--t0)';
    return `<div class="val-row"><span class="val-k">${esc(lbl)}</span><span class="val-v" style="color:${col}">${esc(val)}</span></div>`;
  }).join('');
  // Add a mini bar for value score
  const vs=typeof v.valueScore==='number'?v.valueScore:0;
  const vsPct=Math.min(100,vs);
  const vsCol=vs>=70?'var(--g)':vs>=40?'var(--amber)':'var(--red)';
  document.getElementById('val-mount').innerHTML=rows+
    `<div style="margin-top:8px"><div class="asr-bar-trk"><div class="asr-bar-fill" style="width:${vsPct}%;background:${vsCol}"></div></div></div>`;
}

/* ── HEATMAP ──────────────────────────────────────── */
function buildHm(){
  G.hm=true;
  const qs=G.data.latestRun?.questionScores||[];
  const tm=G.data.targetMapping||{};
  const el=document.getElementById('hm-mount');
  if(!qs.length){el.innerHTML='<div class="empty"><span class="empty-i">🗺️</span><span class="empty-t">No data</span></div>';return;}
  // Group by prefix
  const grps={};
  qs.forEach(q=>{const p=q.questionId.split('.')[0]||'Other';if(!grps[p])grps[p]=[];grps[p].push(q);});
  const layerNames=(G.data.latestRun?.layerScores||[]).reduce((m,l,i)=>{const k=Object.keys(grps)[i];if(k)m[k]=l.layerName;return m;},{});
  const hdr=`<div class="hm-hdr"><span>QID</span><span style="text-align:center">Score</span><span style="text-align:center">Target</span><span style="text-align:center">Gap</span><span>Conf</span></div>`;
  el.innerHTML=hdr+Object.entries(grps).map(([p,rows])=>{
    const nm=layerNames[p]||p;
    const body=rows.map(q=>{
      const tgt=tm[q.questionId]??0, gap=tgt-q.finalLevel;
      const gc=gap<=0?'g0':gap===1?'g1':gap===2?'g2c':'g3';
      const conf=Math.round((q.confidence||0)*100);
      const sc=q.finalLevel>=4?'var(--g)':q.finalLevel>=2.5?'var(--amber)':'var(--red)';
      return `<div class="hm-row" data-qid="${esc(q.questionId)}" tabindex="0">
        <span class="hm-qid">${esc(q.questionId)}</span>
        <span class="hm-n" style="color:${sc}">${q.finalLevel}</span>
        <span class="hm-n" style="color:var(--t3)">${tgt}</span>
        <span class="hm-n ${gc}">${gap>0?'+':''}${gap}</span>
        <div class="hm-conf"><div class="hm-cf" style="width:${conf}%;background:${sc}"></div></div>
      </div>`;
    }).join('');
    return `<div class="hm-grp">
      <div class="hm-ghdr">${esc(nm)}<span style="color:var(--t3);font-size:9px">${rows.length}q</span></div>
      <div class="hm-gbody">${body}</div>
    </div>`;
  }).join('');
  el.querySelectorAll('.hm-row').forEach(r=>{
    const fn=()=>selQ(r.dataset.qid);
    r.addEventListener('click',fn);
    r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')fn();});
  });
  el.querySelectorAll('.hm-ghdr').forEach(h=>h.addEventListener('click',()=>h.parentElement.classList.toggle('c')));
}

function selQ(qid){
  document.querySelectorAll('.hm-row').forEach(r=>r.classList.toggle('sel',r.dataset.qid===qid));
  const q=G.data.latestRun?.questionScores?.find(x=>x.questionId===qid);
  const el=document.getElementById('qd-mount');
  if(!q){return;}
  const tgt=G.data.targetMapping?.[qid]??0;
  const conf=Math.round((q.confidence||0)*100);
  const sp=(q.finalLevel/5)*100;
  const sc=q.finalLevel>=4?'var(--g)':q.finalLevel>=2?'var(--amber)':'var(--red)';
  const flags=(q.flags||[]).map(f=>`<span class="qd-flag">${esc(f)}</span>`).join(' ');
  el.innerHTML=`<div class="qd fade">
    <div class="qd-head"><span class="qd-id">${esc(qid)}</span>${flags}</div>
    <div class="qd-txt">${esc(q.narrative||'No narrative available.')}</div>
    <div class="qd-f"><span class="qd-fl">Score</span><span class="qd-fv" style="color:${sc}">${q.finalLevel} / 5</span>
      <div class="qd-bar"><div class="qd-bfill" style="width:${sp}%;background:${sc}"></div></div></div>
    <div class="qd-f"><span class="qd-fl">Target</span><span class="qd-fv">${tgt} / 5</span></div>
    <div class="qd-f"><span class="qd-fl">Claimed</span><span class="qd-fv">${q.claimedLevel??'—'}</span></div>
    <div class="qd-f"><span class="qd-fl">Supported Max</span><span class="qd-fv">${q.supportedMaxLevel??'—'}</span></div>
    <div class="qd-f"><span class="qd-fl">Confidence</span><span class="qd-fv">${conf}%</span>
      <div class="qd-bar"><div class="qd-bfill" style="width:${conf}%;background:var(--g2)"></div></div></div>
    <div class="qd-f"><span class="qd-fl">Evidence Events</span><span class="qd-fv">${(q.evidenceEventIds||[]).length}</span></div>
  </div>`;
}

/* ── ASSURANCE FULL ───────────────────────────────── */
function asrCard(p){
  const pct=p.score0to100/100, circ=2*Math.PI*17, off=circ*(1-pct);
  const col=pct>=.8?'var(--g)':pct>=.6?'var(--amber)':'var(--red)';
  const short=p.packId.replace(/Pack$/,'').replace(/([A-Z])/g,' $1').trim();
  return `<div class="asr-card">
    <svg class="asr-donut" viewBox="0 0 40 40">
      <circle class="donut-bg" cx="20" cy="20" r="17" stroke-width="5"/>
      <circle class="donut-fill" cx="20" cy="20" r="17" stroke-width="5" stroke="${col}"
        stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
        transform="rotate(-90 20 20)"/>
      <text class="donut-pct" x="20" y="21">${Math.round(pct*100)}%</text>
    </svg>
    <div class="asr-info">
      <div class="asr-name" title="${esc(p.packId)}">${esc(short)}</div>
      <div class="asr-sub">✓${p.passCount} ✗${p.failCount}</div>
    </div>
  </div>`;
}
function buildAf(){
  G.af=true;
  const packs=G.data.assurance||[];
  const el=document.getElementById('af-mount');
  el.innerHTML=packs.length?`<div class="asr-grid">${packs.map(asrCard).join('')}</div>`:'<div class="empty empty-t">No assurance runs</div>';
  const idx=G.data.indices?.indices||[];
  const idxEl=document.getElementById('idx-mount');
  idxEl.innerHTML=idx.length?idx.map(x=>{
    const col=x.score0to100>=70?'var(--g)':x.score0to100>=40?'var(--amber)':'var(--red)';
    const nm=x.id.replace(/([A-Z])/g,' $1').replace(/Risk$/,' Risk').trim();
    return `<div class="idx-row"><span class="idx-nm">${esc(nm)}</span>
      <div class="idx-trk"><div class="idx-fill" style="width:${x.score0to100}%;background:${col}"></div></div>
      <span class="idx-pct" style="color:${col}">${x.score0to100.toFixed(0)}</span></div>`;
  }).join(''):'<div class="empty-t" style="color:var(--t3);padding:12px 0">No index data</div>';
}

/* ── EVIDENCE & EOC ───────────────────────────────── */
function buildEv(){
  G.ef=true;
  const gaps=G.data.evidenceGaps||[];
  const el=document.getElementById('ev-mount');
  el.innerHTML=gaps.length?gaps.map(g=>`<div class="ev-item">
    <div class="ev-dot"></div>
    <span class="ev-qid">${esc(g.questionId)}</span>
    <span class="ev-r">${esc(g.reason)}</span>
  </div>`).join(''):'<div class="empty"><span class="empty-i">✅</span><span class="empty-t">No evidence gaps</span></div>';
  const eoc=G.data.eoc||{};
  const cols=[['Education',eoc.education||[]],['Ownership',eoc.ownership||[]],[`Commitment (${eoc.days||14}d)`,eoc.commitment||[]]];
  document.getElementById('eoc-mount').innerHTML=`<div class="eoc">${cols.map(([t,items])=>`
    <div class="eoc-col">
      <div class="eoc-h">${esc(t)}</div>
      ${items.map(i=>`<div class="eoc-item"><input type="checkbox" class="eoc-cb"/><span>${esc(i)}</span></div>`).join('')}
      ${!items.length?'<span style="color:var(--t3);font-size:11px">—</span>':''}
    </div>`).join('')}</div>`;
}

/* ── FLEET ────────────────────────────────────────── */
function buildFleet(){
  G.ff=true;
  const st=G.data.studioHome||{};
  const sfields=[
    {l:'Studio',v:st.running?'Running':'Stopped',c:st.running?'ok':'bad'},
    {l:'Vault',v:st.vaultUnlocked?'Unlocked':'Locked',c:st.vaultUnlocked?'ok':'warn'},
    {l:'Action Policy',v:st.actionPolicySignature||'—',c:st.actionPolicySignature==='VALID'?'ok':'bad'},
    {l:'Tools Sig',v:st.toolsSignature||'—',c:st.toolsSignature==='VALID'?'ok':'bad'},
    {l:'Gateway',v:st.gatewayUrl||'n/a',c:'def'},
    {l:'Dashboard',v:st.dashboardUrl||window.location.origin,c:'def'},
  ];
  document.getElementById('studio-mount').innerHTML=`<div class="studio-grid">${sfields.map(f=>`
    <div class="ss"><div class="ss-l">${esc(f.l)}</div><div class="ss-v ${f.c}">${esc(f.v)}</div></div>`).join('')}</div>`;
  const agents=st.agents||[];
  const ftEl=document.getElementById('fleet-mount');
  ftEl.innerHTML=agents.length?`<table class="fleet-t">
    <thead><tr><th>Agent</th><th>Score</th><th>Trust</th><th>Provider</th><th>Model</th><th>Frozen</th></tr></thead>
    <tbody>${agents.map(a=>`<tr>
      <td>${esc(a.id)}</td><td style="color:var(--g)">${a.overall!=null?a.overall.toFixed(2):'—'}</td>
      <td>${esc(a.trustLabel||'—')}</td><td>${esc(a.lastProvider||'—')}</td>
      <td>${esc(a.lastModel||'—')}</td>
      <td>${a.freezeActive?'<span style="color:var(--amber)">Yes</span>':'—'}</td>
    </tr>`).join('')}</tbody></table>`:
    '<div class="empty"><span class="empty-i">🤖</span><span class="empty-t">No agents</span></div>';
  const bm=G.data.benchmarksSummary||{};
  document.getElementById('bm-mount').innerHTML=[
    {k:'Total Benchmarks',v:bm.count||0},{k:'Overall Percentile',v:(bm.percentileOverall||0).toFixed(1)+'%'}
  ].map(x=>`<div class="val-row"><span class="val-k">${esc(x.k)}</span><span class="val-v">${esc(String(x.v))}</span></div>`).join('');
  const exs=st.toolhubExecutions||[];
  document.getElementById('th-mount').innerHTML=exs.length?exs.slice(0,8).map(e=>`
    <div class="val-row"><span class="val-k">${esc(e.toolName||'tool')}</span><span class="val-v" style="color:var(--t2)">${esc(e.effectiveMode||'—')}</span></div>`).join(''):
    '<div class="empty-t" style="color:var(--t3);padding:12px 0">No recent executions</div>';
}

/* ── INIT ─────────────────────────────────────────── */
(async function init(){
  try {
    G.data=await xfetch('./data.json');
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
  } catch(err){
    document.getElementById('content').innerHTML=`<div class="empty" style="margin-top:80px">
      <span class="empty-i">⚠️</span>
      <span class="empty-t">Failed to load: <code style="color:var(--amber)">${esc(err.message)}</code><br>Run <code style="color:var(--g)">amc dashboard build</code> first.</span>
    </div>`;
  }
})();
