/* ═══════════════════════════════════════════════════════════
   AMC v4 — Award-Caliber Motion
   Text splitting · Sticky scroll viz · Horizontal scroll
   Interactive demo · Gradient mesh · Magnetic buttons
   ═══════════════════════════════════════════════════════════ */
(function(){
'use strict';
const RM = matchMedia('(prefers-reduced-motion:reduce)').matches;
const FP = matchMedia('(pointer:fine)').matches;
gsap.registerPlugin(ScrollTrigger);

/* roundRect polyfill for Safari <16 / older browsers */
function roundedRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ─── TEXT SPLITTING — letter-by-letter hero ─── */
document.querySelectorAll('[data-word]').forEach(w => {
  const text = w.textContent;
  const isGrad = w.classList.contains('grad');
  w.innerHTML = '';
  [...text].forEach(ch => {
    const s = document.createElement('span');
    s.className = 'char';
    s.textContent = ch === ' ' ? '\u00A0' : ch;
    if (isGrad) {
      s.style.background = 'linear-gradient(135deg,#a78bfa 0%,#22d3ee 40%,#a78bfa 80%)';
      s.style.backgroundSize = '200% auto';
      s.style.webkitBackgroundClip = 'text';
      s.style.webkitTextFillColor = 'transparent';
      s.style.backgroundClip = 'text';
      s.style.animation = 'gradShift 6s ease infinite';
    }
    w.appendChild(s);
  });
});

if (!RM) {
  // Animate chars in
  gsap.to('.hero h1 .char', {
    y: 0, opacity: 1, duration: .7,
    stagger: .025, ease: 'power4.out', delay: .3
  });
  // Sub + buttons
  gsap.to('.hero-sub', { opacity: 1, y: 0, duration: .8, delay: 1, ease: 'power3.out' });
  gsap.to('.hero-btns', { opacity: 1, y: 0, duration: .8, delay: 1.15, ease: 'power3.out' });
  gsap.to('.float-term', { opacity: 1, y: 0, duration: 1, delay: 1.4, ease: 'power3.out' });
  gsap.to('.metrics', { opacity: 1, y: 0, duration: .8, delay: 1.8, ease: 'power3.out' });
} else {
  document.querySelectorAll('.char').forEach(c => { c.style.opacity = 1; c.style.transform = 'none'; });
  document.querySelectorAll('.hero-sub,.hero-btns,.float-term,.metrics').forEach(e => { e.style.opacity = 1; e.style.transform = 'none'; });
}

/* ─── NAV ─── */
const nav = document.getElementById('nav');
if (!RM) {
  gsap.set(nav, { autoAlpha: 0, y: -20 });
  gsap.to(nav, { autoAlpha: 1, y: 0, duration: .8, delay: .1, ease: 'power3.out' });
}
let raf = false;
window.addEventListener('scroll', () => {
  if (!raf) { requestAnimationFrame(() => { nav.classList.toggle('scrolled', scrollY > 50); raf = false; }); raf = true; }
}, { passive: true });

/* Mobile menu */
const tog = document.getElementById('navToggle');
const mm = document.getElementById('mobMenu');
if (tog && mm) {
  tog.addEventListener('click', () => {
    const o = mm.classList.toggle('open');
    tog.classList.toggle('on');
    tog.setAttribute('aria-expanded', o);
    mm.setAttribute('aria-hidden', !o);
  });
  mm.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    mm.classList.remove('open'); tog.classList.remove('on');
  }));
}

/* ─── CURSOR GLOW ─── */
const cur = document.getElementById('cursor');
if (cur && FP && !RM) {
  let mx = 0, my = 0, cx = 0, cy = 0;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; cur.classList.add('on'); });
  document.addEventListener('mouseleave', () => cur.classList.remove('on'));
  (function loop() {
    cx += (mx - cx) * .035; cy += (my - cy) * .035;
    cur.style.transform = `translate(${cx - 300}px,${cy - 300}px)`;
    requestAnimationFrame(loop);
  })();
}

/* ─── MAGNETIC BUTTONS ─── */
if (FP && !RM) {
  document.querySelectorAll('.btn-glow,.btn-ghost').forEach(b => {
    b.addEventListener('mousemove', e => {
      const r = b.getBoundingClientRect();
      gsap.to(b, { x: (e.clientX - r.left - r.width/2) * .15, y: (e.clientY - r.top - r.height/2) * .15, duration: .3, ease: 'power3.out' });
    });
    b.addEventListener('mouseleave', () => {
      gsap.to(b, { x: 0, y: 0, duration: .5, ease: 'elastic.out(1,.4)' });
    });
  });
}

/* ─── SCROLL REVEALS ─── */
if (!RM) {
  gsap.utils.toArray('.reveal').forEach(el => {
    const d = el.classList.contains('rd1') ? .1 : el.classList.contains('rd2') ? .2 : el.classList.contains('rd3') ? .3 : el.classList.contains('rd4') ? .45 : 0;
    gsap.to(el, { opacity: 1, y: 0, duration: .9, delay: d, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 87%', once: true }
    });
  });
}

/* ─── TERMINAL TYPING ─── */
const tb = document.getElementById('termBody');
if (tb) {
  const tobs = new IntersectionObserver(e => {
    e.forEach(en => {
      if (en.isIntersecting) {
        en.target.querySelectorAll('.tl').forEach(l => {
          setTimeout(() => l.classList.add('show'), +(l.dataset.d) || 0);
        });
        tobs.unobserve(en.target);
      }
    });
  }, { threshold: .3 });
  tobs.observe(tb);
}

/* ─── TERMINAL PARALLAX ─── */
if (!RM) {
  const ft = document.querySelector('.float-term .term');
  if (ft) {
    ScrollTrigger.create({
      trigger: '.hero', start: 'top top', end: 'bottom top', scrub: .5,
      onUpdate: s => {
        const p = s.progress;
        ft.style.transform = `rotateX(${4 - p * 8}deg) rotateY(${-1 + p * 2}deg) scale(${1 - p * .08}) translateY(${p * 40}px)`;
      }
    });
  }
}

/* ─── COUNTERS ─── */
const cobs = new IntersectionObserver(e => {
  e.forEach(en => {
    if (en.isIntersecting) {
      const el = en.target, t = +el.dataset.count;
      if (isNaN(t)) return;
      const dur = 2200, st = performance.now();
      (function f(n) {
        const p = Math.min((n - st) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(t * ease).toLocaleString();
        if (p < 1) requestAnimationFrame(f);
      })(st);
      cobs.unobserve(el);
    }
  });
}, { threshold: .5 });
document.querySelectorAll('[data-count]').forEach(el => cobs.observe(el));

/* ─── BAR CHARTS ─── */
const bobs = new IntersectionObserver(e => {
  e.forEach(en => {
    if (en.isIntersecting) {
      en.target.querySelectorAll('.bar').forEach((b, i) => {
        setTimeout(() => { b.style.height = b.dataset.h + '%'; }, i * 120);
      });
      bobs.unobserve(en.target);
    }
  });
}, { threshold: .3 });
document.querySelectorAll('.bars').forEach(el => bobs.observe(el));

/* ─── STICKY SCROLL VISUALIZATION ─── */
const vc = document.getElementById('vizCanvas');
if (vc && !RM) {
  const ctx = vc.getContext('2d');
  let vw, vh;
  function szViz() {
    const r = vc.parentElement.getBoundingClientRect();
    vw = vc.width = r.width; vh = vc.height = r.height;
  }
  szViz(); window.addEventListener('resize', szViz);

  let vizState = 'observe';
  let vizProgress = 0;

  // Observe: agent → AMC → LLM flow
  function drawObserve(t) {
    const cx = vw/2, cy = vh/2;
    const nodes = [
      { x: cx - 120, y: cy, label: 'Agent', icon: '🤖' },
      { x: cx, y: cy, label: 'AMC', icon: '🛡️', active: true },
      { x: cx + 120, y: cy, label: 'LLM', icon: '🧠' }
    ];
    // Connection lines
    ctx.strokeStyle = 'rgba(124,58,237,.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(nodes[0].x + 30, cy); ctx.lineTo(nodes[1].x - 30, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nodes[1].x + 30, cy); ctx.lineTo(nodes[2].x - 30, cy); ctx.stroke();
    ctx.setLineDash([]);

    // Animated data packets
    const pkt = (t * .001) % 1;
    const px1 = nodes[0].x + 30 + (nodes[1].x - 30 - nodes[0].x - 30) * pkt;
    const px2 = nodes[1].x + 30 + (nodes[2].x - 30 - nodes[1].x - 30) * ((pkt + .3) % 1);
    ctx.beginPath(); ctx.arc(px1, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(167,139,250,.6)'; ctx.fill();
    ctx.beginPath(); ctx.arc(px2, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34,211,238,.5)'; ctx.fill();

    nodes.forEach(n => {
      // Node circle
      ctx.beginPath(); ctx.arc(n.x, n.y, 28, 0, Math.PI * 2);
      ctx.fillStyle = n.active ? 'rgba(124,58,237,.08)' : 'rgba(255,255,255,.02)';
      ctx.strokeStyle = n.active ? 'rgba(124,58,237,.25)' : 'rgba(255,255,255,.06)';
      ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
      if (n.active) {
        ctx.beginPath(); ctx.arc(n.x, n.y, 34, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(124,58,237,${.08 + Math.sin(t * .003) * .04})`;
        ctx.stroke();
      }
      // Icon
      ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.icon, n.x, n.y - 1);
      // Label
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillStyle = n.active ? '#a78bfa' : '#4a4a5e';
      ctx.fillText(n.label, n.x, n.y + 44);
    });
  }

  // Score: radar chart
  function drawScore(t) {
    const cx = vw/2, cy = vh/2, mr = Math.min(vw, vh) * .28;
    const dims = ['Ops', 'Autonomy', 'Alignment', 'Governance', 'Skills'];
    const vals = [.78, .62, .85, .45, .70];
    const n = dims.length;
    const p = Math.min(vizProgress, 1);

    // Grid rings
    for (let r = 1; r <= 5; r++) {
      const rad = (r/5) * mr;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i/n) * Math.PI * 2 - Math.PI/2;
        const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(255,255,255,${r === 5 ? .04 : .02})`;
      ctx.lineWidth = 1; ctx.stroke();
    }
    // Axes
    for (let i = 0; i < n; i++) {
      const a = (i/n) * Math.PI * 2 - Math.PI/2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * mr, cy + Math.sin(a) * mr);
      ctx.strokeStyle = 'rgba(255,255,255,.02)'; ctx.stroke();
    }
    // Data shape
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const a = (idx/n) * Math.PI * 2 - Math.PI/2;
      const r = vals[idx] * mr * p;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    const g = ctx.createLinearGradient(cx-mr, cy-mr, cx+mr, cy+mr);
    g.addColorStop(0, 'rgba(124,58,237,.12)');
    g.addColorStop(1, 'rgba(6,182,212,.06)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(167,139,250,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    // Points + labels
    for (let i = 0; i < n; i++) {
      const a = (i/n) * Math.PI * 2 - Math.PI/2;
      const r = vals[i] * mr * p;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#a78bfa'; ctx.fill();
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillStyle = '#5a5a7e'; ctx.textAlign = 'center';
      ctx.fillText(dims[i], cx + Math.cos(a) * (mr + 22), cy + Math.sin(a) * (mr + 22) + 3);
    }
  }

  // Prove: Merkle tree
  function drawProve(t) {
    const cx = vw/2, cy = vh/2;
    const p = Math.min(vizProgress, 1);
    const nodes = [
      { x: cx, y: cy - 70, label: 'Root', root: true },
      { x: cx - 60, y: cy - 10, label: 'H(1,2)' },
      { x: cx + 60, y: cy - 10, label: 'H(3,4)' },
      { x: cx - 90, y: cy + 50, label: 'E₁' },
      { x: cx - 30, y: cy + 50, label: 'E₂' },
      { x: cx + 30, y: cy + 50, label: 'E₃' },
      { x: cx + 90, y: cy + 50, label: 'E₄' }
    ];
    // Connections
    const conns = [[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]];
    conns.forEach(([a, b], i) => {
      const prog = Math.max(0, Math.min(1, (p - i * .1) / .3));
      if (prog <= 0) return;
      ctx.beginPath();
      ctx.moveTo(nodes[a].x, nodes[a].y + 14);
      const ex = nodes[a].x + (nodes[b].x - nodes[a].x) * prog;
      const ey = (nodes[a].y + 14) + (nodes[b].y - 14 - nodes[a].y - 14) * prog;
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = 'rgba(124,58,237,.12)'; ctx.lineWidth = 1; ctx.stroke();
    });
    // Nodes
    nodes.forEach((n, i) => {
      const delay = i * .08;
      const np = Math.max(0, Math.min(1, (p - delay) / .4));
      if (np <= 0) return;
      ctx.globalAlpha = np;
      const w = n.root ? 70 : 50, h = 28;
      ctx.beginPath();
      roundedRect(ctx, n.x - w/2, n.y - h/2, w, h, 6);
      ctx.fillStyle = n.root ? 'rgba(124,58,237,.06)' : 'rgba(255,255,255,.02)';
      ctx.strokeStyle = n.root ? 'rgba(124,58,237,.2)' : 'rgba(255,255,255,.05)';
      ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
      if (n.root) {
        ctx.beginPath();
        roundedRect(ctx, n.x - w/2 - 3, n.y - h/2 - 3, w + 6, h + 6, 8);
        ctx.strokeStyle = `rgba(124,58,237,${.06 + Math.sin(t * .003) * .03})`;
        ctx.stroke();
      }
      ctx.font = `${n.root ? '600' : '500'} ${n.root ? '10' : '9'}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = n.root ? '#a78bfa' : '#5a5a7e';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.label, n.x, n.y);
      ctx.globalAlpha = 1;
    });
  }

  // Sticky scroll triggers
  const steps = document.querySelectorAll('.sticky-step');
  if (steps.length && window.innerWidth > 1024) {
    steps.forEach(step => {
      ScrollTrigger.create({
        trigger: step, start: 'top 60%', end: 'bottom 40%',
        onEnter: () => {
          vizState = step.dataset.viz;
          vizProgress = 0;
          steps.forEach(s => s.querySelector('.sticky-step-inner').classList.remove('active'));
          step.querySelector('.sticky-step-inner').classList.add('active');
        },
        onEnterBack: () => {
          vizState = step.dataset.viz;
          vizProgress = 0;
          steps.forEach(s => s.querySelector('.sticky-step-inner').classList.remove('active'));
          step.querySelector('.sticky-step-inner').classList.add('active');
        }
      });
    });
    // First step active by default
    steps[0].querySelector('.sticky-step-inner').classList.add('active');
  } else {
    steps.forEach(s => s.querySelector('.sticky-step-inner').classList.add('active'));
  }

  (function vizLoop(t) {
    ctx.clearRect(0, 0, vw, vh);
    vizProgress = Math.min(vizProgress + .012, 1);
    if (vizState === 'observe') drawObserve(t);
    else if (vizState === 'score') drawScore(t);
    else if (vizState === 'prove') drawProve(t);
    requestAnimationFrame(vizLoop);
  })(0);
}

/* ─── HORIZONTAL SCROLL — Modules ─── */
if (!RM) {
  const track = document.getElementById('hscrollTrack');
  if (track) {
    const sec = track.closest('.hscroll-sec');
    // Delay to ensure layout is settled
    requestAnimationFrame(() => {
      const totalScroll = track.scrollWidth - window.innerWidth;
      if (totalScroll > 0) {
        gsap.to(track, {
          x: () => -(track.scrollWidth - window.innerWidth),
          ease: 'none',
          scrollTrigger: {
            trigger: sec,
            start: 'top top',
            end: () => '+=' + (track.scrollWidth - window.innerWidth),
            pin: true,
            scrub: .8,
            invalidateOnRefresh: true,
            anticipatePin: 1
          }
        });
      }
    });
  }
}

/* ─── INTERACTIVE DEMO ─── */
const demoBody = document.querySelector('.demo-body');
if (demoBody) {
  const scoreEl = document.getElementById('demoScoreVal');
  const barEl = document.getElementById('demoBarFill');
  const questions = demoBody.querySelectorAll('.demo-q');
  const scores = {};

  demoBody.addEventListener('click', e => {
    const btn = e.target.closest('.demo-lvl');
    if (!btn) return;
    const q = btn.closest('.demo-q');
    const dim = q.dataset.dim;
    const val = +btn.dataset.v;

    // Toggle selection
    q.querySelectorAll('.demo-lvl').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    scores[dim] = val;

    // Calculate score
    const answered = Object.keys(scores).length;
    const total = questions.length;
    const sum = Object.values(scores).reduce((a, b) => a + b, 0);
    const maxPossible = total * 5;
    const pct = Math.round((sum / maxPossible) * 100);

    // Animate score
    gsap.to(scoreEl, {
      textContent: pct,
      duration: .6,
      snap: { textContent: 1 },
      ease: 'power2.out'
    });
    gsap.to(barEl, { width: pct + '%', duration: .8, ease: 'power3.out' });
  });
}

/* ─── SMOOTH SCROLL ─── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id === '#') return;
    const t = document.querySelector(id);
    if (t) { e.preventDefault(); window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 80, behavior: 'smooth' }); }
  });
});

})();

/* ─── COPY ─── */
function copyCmd(b) {
  const c = b.parentElement.querySelector('code');
  navigator.clipboard.writeText(c.textContent.trim());
  b.textContent = 'Copied!'; b.style.color = '#10b981';
  setTimeout(() => { b.textContent = 'Copy'; b.style.color = ''; }, 1500);
}
