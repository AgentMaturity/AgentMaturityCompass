/* ═══════════════════════════════════════════════════════════
   AMC v3 — Motion & Interactivity
   Canvas compass · GSAP ScrollTrigger · Radar chart
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const R = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const F = window.matchMedia('(pointer: fine)').matches;
  gsap.registerPlugin(ScrollTrigger);

  /* ─── HERO CANVAS — Compass + Particles ─── */
  const hc = document.getElementById('heroCanvas');
  if (hc && !R) {
    const ctx = hc.getContext('2d');
    let W, H, CX, CY;
    const P = [];
    const N = 60;

    function sz() {
      W = hc.width = hc.offsetWidth;
      H = hc.height = hc.offsetHeight;
      CX = W / 2; CY = H / 2;
    }
    sz();
    window.addEventListener('resize', sz);

    for (let i = 0; i < N; i++) {
      P.push({
        x: Math.random() * 3000, y: Math.random() * 2000,
        r: Math.random() * 1.2 + .3,
        vx: (Math.random() - .5) * .25,
        vy: (Math.random() - .5) * .25,
        a: Math.random() * .2 + .03
      });
    }

    function compass(t) {
      const rad = Math.min(W, H) * .16;
      const pulse = 1 + Math.sin(t * .0008) * .02;

      // Rings
      [1, .68, .36].forEach((s, i) => {
        ctx.beginPath();
        ctx.arc(CX, CY, rad * s * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(99,102,241,${.06 - i * .015})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Ticks
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const major = i % 18 === 0;
        const inner = rad * (major ? .82 : .92) * pulse;
        const outer = rad * pulse;
        ctx.beginPath();
        ctx.moveTo(CX + Math.cos(a) * inner, CY + Math.sin(a) * inner);
        ctx.lineTo(CX + Math.cos(a) * outer, CY + Math.sin(a) * outer);
        ctx.strokeStyle = major ? 'rgba(99,102,241,.1)' : 'rgba(255,255,255,.02)';
        ctx.lineWidth = major ? 1.5 : .5;
        ctx.stroke();
      }

      // Cardinal labels
      ctx.font = '600 9px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(129,140,248,.15)';
      const labels = ['N', 'E', 'S', 'W'];
      labels.forEach((l, i) => {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        ctx.fillText(l, CX + Math.cos(a) * rad * 1.12 * pulse, CY + Math.sin(a) * rad * 1.12 * pulse);
      });

      // Needle
      const na = t * .00025;
      const nl = rad * .62 * pulse;
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(na);

      // North
      const g = ctx.createLinearGradient(0, -nl, 0, 0);
      g.addColorStop(0, 'rgba(129,140,248,.55)');
      g.addColorStop(1, 'rgba(99,102,241,.05)');
      ctx.beginPath();
      ctx.moveTo(0, -nl); ctx.lineTo(3.5, 0); ctx.lineTo(-3.5, 0);
      ctx.closePath(); ctx.fillStyle = g; ctx.fill();

      // South
      ctx.beginPath();
      ctx.moveTo(0, nl * .5); ctx.lineTo(2.5, 0); ctx.lineTo(-2.5, 0);
      ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.02)'; ctx.fill();

      // Center
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(129,140,248,.35)'; ctx.fill();
      ctx.restore();

      // Center glow
      const cg = ctx.createRadialGradient(CX, CY, 0, CX, CY, rad * .4);
      cg.addColorStop(0, 'rgba(99,102,241,.025)');
      cg.addColorStop(1, 'transparent');
      ctx.fillStyle = cg;
      ctx.fillRect(CX - rad, CY - rad, rad * 2, rad * 2);
    }

    function particles() {
      P.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(129,140,248,${p.a})`;
        ctx.fill();
      });
      // Connections
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 140) {
            ctx.beginPath();
            ctx.moveTo(P[i].x, P[i].y);
            ctx.lineTo(P[j].x, P[j].y);
            ctx.strokeStyle = `rgba(99,102,241,${.015 * (1 - d / 140)})`;
            ctx.lineWidth = .5;
            ctx.stroke();
          }
        }
      }
    }

    (function loop(t) {
      ctx.clearRect(0, 0, W, H);
      particles();
      compass(t);
      requestAnimationFrame(loop);
    })(0);
  }

  /* ─── RADAR CHART ─── */
  const rc = document.getElementById('radarCanvas');
  if (rc) {
    const x = rc.getContext('2d');
    const S = 220, cx = S/2, cy = S/2, mr = 82;
    const labels = ['Ops', 'Autonomy', 'Alignment', 'Governance', 'Skills'];
    const vals = [.78, .62, .85, .45, .70];
    let drawn = false;

    function radar(p) {
      x.clearRect(0, 0, S, S);
      const n = labels.length;
      // Grid
      for (let r = 1; r <= 4; r++) {
        const rad = (r/4) * mr;
        x.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = (i/n) * Math.PI * 2 - Math.PI/2;
          const px = cx + Math.cos(a) * rad;
          const py = cy + Math.sin(a) * rad;
          i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.strokeStyle = 'rgba(255,255,255,.035)';
        x.lineWidth = 1; x.stroke();
      }
      // Axes
      for (let i = 0; i < n; i++) {
        const a = (i/n) * Math.PI * 2 - Math.PI/2;
        x.beginPath(); x.moveTo(cx, cy);
        x.lineTo(cx + Math.cos(a) * mr, cy + Math.sin(a) * mr);
        x.strokeStyle = 'rgba(255,255,255,.025)'; x.stroke();
      }
      // Data
      x.beginPath();
      for (let i = 0; i <= n; i++) {
        const idx = i % n;
        const a = (idx/n) * Math.PI * 2 - Math.PI/2;
        const r = vals[idx] * mr * p;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
      }
      const g = x.createLinearGradient(cx-mr, cy-mr, cx+mr, cy+mr);
      g.addColorStop(0, 'rgba(99,102,241,.12)');
      g.addColorStop(1, 'rgba(34,211,238,.06)');
      x.fillStyle = g; x.fill();
      x.strokeStyle = 'rgba(129,140,248,.45)';
      x.lineWidth = 1.5; x.stroke();
      // Points
      for (let i = 0; i < n; i++) {
        const a = (i/n) * Math.PI * 2 - Math.PI/2;
        const r = vals[i] * mr * p;
        x.beginPath();
        x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 0, Math.PI * 2);
        x.fillStyle = '#818cf8'; x.fill();
      }
      // Labels
      x.font = '500 9px Inter, sans-serif';
      x.fillStyle = '#6b6b9e'; x.textAlign = 'center';
      for (let i = 0; i < n; i++) {
        const a = (i/n) * Math.PI * 2 - Math.PI/2;
        x.fillText(labels[i], cx + Math.cos(a) * (mr + 18), cy + Math.sin(a) * (mr + 18) + 3);
      }
    }

    const ro = new IntersectionObserver(e => {
      e.forEach(en => {
        if (en.isIntersecting && !drawn) {
          drawn = true;
          let s = null;
          (function t(ts) {
            if (!s) s = ts;
            const p = Math.min((ts - s) / 1400, 1);
            radar(1 - Math.pow(1 - p, 4));
            if (p < 1) requestAnimationFrame(t);
          })(performance.now());
          ro.unobserve(en.target);
        }
      });
    }, { threshold: .3 });
    ro.observe(rc);
    radar(0);
  }

  /* ─── CURSOR GLOW ─── */
  const gl = document.getElementById('cursorGlow');
  if (gl && F && !R) {
    let mx = 0, my = 0, gx = 0, gy = 0;
    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; gl.classList.add('active'); });
    document.addEventListener('mouseleave', () => gl.classList.remove('active'));
    (function a() {
      gx += (mx - gx) * .04; gy += (my - gy) * .04;
      gl.style.transform = `translate(${gx - 400}px,${gy - 400}px)`;
      requestAnimationFrame(a);
    })();
  }

  /* ─── GLASS MOUSE TRACKING ─── */
  if (F && !R) {
    document.querySelectorAll('.glass').forEach(c => {
      c.addEventListener('mousemove', e => {
        const r = c.getBoundingClientRect();
        c.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        c.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      });
    });
  }

  /* ─── MAGNETIC BUTTONS ─── */
  if (F && !R) {
    document.querySelectorAll('[data-magnetic]').forEach(b => {
      b.addEventListener('mousemove', e => {
        const r = b.getBoundingClientRect();
        gsap.to(b, { x: (e.clientX - r.left - r.width/2) * .18, y: (e.clientY - r.top - r.height/2) * .18, duration: .35, ease: 'power3.out' });
      });
      b.addEventListener('mouseleave', () => {
        gsap.to(b, { x: 0, y: 0, duration: .5, ease: 'elastic.out(1,.5)' });
      });
    });
  }

  /* ─── NAV ─── */
  const nav = document.getElementById('nav');
  gsap.set(nav, { autoAlpha: 0, y: -20 });
  gsap.to(nav, { autoAlpha: 1, y: 0, duration: .8, delay: .2, ease: 'power3.out' });

  let st = false;
  window.addEventListener('scroll', () => {
    if (!st) { requestAnimationFrame(() => { nav.classList.toggle('scrolled', scrollY > 50); st = false; }); st = true; }
  }, { passive: true });

  /* ─── MOBILE MENU ─── */
  const tog = document.getElementById('navToggle');
  const mm = document.getElementById('mobileMenu');
  if (tog && mm) {
    tog.addEventListener('click', () => {
      const o = mm.classList.toggle('open');
      tog.classList.toggle('active');
      tog.setAttribute('aria-expanded', o);
      mm.setAttribute('aria-hidden', !o);
    });
    mm.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      mm.classList.remove('open'); tog.classList.remove('active');
      tog.setAttribute('aria-expanded', 'false'); mm.setAttribute('aria-hidden', 'true');
    }));
  }

  /* ─── SCROLL REVEALS ─── */
  if (!R) {
    gsap.utils.toArray('.reveal').forEach(el => {
      const d = el.classList.contains('reveal-d1') ? .1
              : el.classList.contains('reveal-d2') ? .2
              : el.classList.contains('reveal-d3') ? .3
              : el.classList.contains('reveal-d4') ? .45 : 0;
      gsap.to(el, {
        opacity: 1, y: 0, duration: .9, delay: d,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 87%', once: true }
      });
    });
    ScrollTrigger.batch('.mod', {
      onEnter: b => gsap.to(b, { opacity: 1, y: 0, stagger: .07, duration: .7, ease: 'power3.out' }),
      start: 'top 87%', once: true
    });
    ScrollTrigger.batch('.install-row', {
      onEnter: b => gsap.to(b, { opacity: 1, y: 0, stagger: .08, duration: .7, ease: 'power3.out' }),
      start: 'top 87%', once: true
    });
  } else {
    document.querySelectorAll('.reveal').forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; });
  }

  /* ─── TERMINAL PARALLAX ─── */
  if (!R) {
    const term = document.querySelector('.terminal');
    if (term) {
      ScrollTrigger.create({
        trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
        onUpdate: s => {
          const p = s.progress;
          term.style.transform = `perspective(1200px) rotateX(${2 - p * 5}deg) scale(${1 - p * .07}) translateY(${p * 30}px)`;
        }
      });
    }
  }

  /* ─── COUNTERS ─── */
  const co = new IntersectionObserver(e => {
    e.forEach(en => {
      if (en.isIntersecting) {
        const el = en.target, t = +el.dataset.count;
        if (isNaN(t)) return;
        const d = 2000, s = performance.now();
        (function f(n) {
          const p = Math.min((n - s) / d, 1);
          el.textContent = Math.round(t * (1 - Math.pow(1 - p, 4))).toLocaleString();
          if (p < 1) requestAnimationFrame(f);
        })(s);
        co.unobserve(el);
      }
    });
  }, { threshold: .5 });
  document.querySelectorAll('[data-count]').forEach(el => co.observe(el));

  /* ─── TERMINAL TYPING ─── */
  const to = new IntersectionObserver(e => {
    e.forEach(en => {
      if (en.isIntersecting) {
        en.target.querySelectorAll('.tl').forEach(l => { l.style.animationDelay = (+(l.dataset.delay) || 0) + 'ms'; });
        to.unobserve(en.target);
      }
    });
  }, { threshold: .3 });
  const tb = document.getElementById('termBody');
  if (tb) to.observe(tb);

  /* ─── GAP BAR FILLS ─── */
  const go = new IntersectionObserver(e => {
    e.forEach(en => {
      if (en.isIntersecting) {
        en.target.querySelectorAll('.gap-fill').forEach(b => {
          requestAnimationFrame(() => requestAnimationFrame(() => { b.style.width = b.dataset.w + '%'; }));
        });
        go.unobserve(en.target);
      }
    });
  }, { threshold: .3 });
  document.querySelectorAll('.bento').forEach(el => go.observe(el));

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
  b.textContent = 'Copied!'; b.style.color = '#34d399';
  setTimeout(() => { b.textContent = 'Copy'; b.style.color = ''; }, 1500);
}
