/* ═══════════════════════════════════════════════════════════════
   AMC — Evidence Forge
   Concept A (Chaos → Formation) + Concept C (Evidence Streams)
   
   Particles begin scattered and chaotic. They converge into a
   circular trust-score arc. Once formed, a continuous stream of
   evidence particles flows through — bright ones join the arc,
   dim ones drift past. The arc breathes. Mouse repels gently.
   
   Zero dependencies. Canvas 2D. 60 fps target.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  /* ── Responsive config ── */
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const IS_MOBILE = window.innerWidth < 768;
  const IS_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ARC_COUNT   = IS_MOBILE ? 60  : 140;
  const STREAM_COUNT = IS_MOBILE ? 40  : 100;
  const TOTAL = ARC_COUNT + STREAM_COUNT;

  /* ── Palette ── */
  const COL = {
    indigo:  [99, 102, 241],
    violet:  [139, 92, 246],
    cyan:    [34, 211, 238],
    amber:   [245, 158, 11],
    gray:    [100, 116, 139],
    white:   [255, 255, 255],
  };

  /* ── Timing ── */
  const CHAOS_MS    = IS_REDUCED ? 0 : 2200;
  const CONVERGE_MS = IS_REDUCED ? 0 : 2800;
  const SETTLE_AT   = CHAOS_MS + CONVERGE_MS;

  /* ── State ── */
  let W, H, logW, logH, cx, cy, R;
  let t0;
  let mx = -9999, my = -9999;
  let scrollY = 0;
  let heroH = 0;
  let particles = [];
  let connections = [];
  let raf;

  /* ── Arc geometry: trust-score gauge ── */
  // Arc spans from -210° to +30° (240° / 360° ≈ 67% — a realistic trust score)
  const ARC_START = (-210 * Math.PI) / 180;
  const ARC_END   = (30 * Math.PI) / 180;
  const ARC_SPAN  = ARC_END - ARC_START;
  // Gap at bottom represents the trust gap

  /* ── Particle factory ── */
  function makeArc(i) {
    const t = i / (ARC_COUNT - 1);
    const angle = ARC_START + t * ARC_SPAN;
    // Color gradient along arc: indigo → violet → cyan at tip
    const color = t < 0.6
      ? lerpColor(COL.indigo, COL.violet, t / 0.6)
      : lerpColor(COL.violet, COL.cyan, (t - 0.6) / 0.4);
    return {
      type: 'arc',
      x: Math.random() * logW,
      y: Math.random() * logH,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
      tx: 0, ty: 0, // set in resize
      angle: angle,
      t: t,
      size: 1.8 + Math.random() * 1.2,
      opacity: 0.08 + Math.random() * 0.15,
      targetOpacity: 0.55 + t * 0.4, // brighter at end (higher score)
      color: color,
      glowSize: t > 0.85 ? 8 : (t > 0.5 ? 5 : 3), // tip glows more
      seed: Math.random() * Math.PI * 2,
    };
  }

  function makeStream() {
    const verified = Math.random() > 0.6;
    return {
      type: 'stream',
      x: -20 - Math.random() * logW * 0.3,
      y: Math.random() * logH,
      vx: 0.3 + Math.random() * 0.8,
      vy: (Math.random() - 0.5) * 0.3,
      size: verified ? 1.5 + Math.random() : 0.8 + Math.random() * 0.8,
      opacity: verified ? 0.3 + Math.random() * 0.3 : 0.08 + Math.random() * 0.12,
      color: verified ? COL.indigo : COL.gray,
      verified: verified,
      seed: Math.random() * Math.PI * 2,
      attracted: false,
    };
  }

  /* ── Helpers ── */
  function lerpColor(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function dist(x1, y1, x2, y2) {
    const dx = x1 - x2, dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutQuart(t) { return t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2,4)/2; }

  /* ── Resize ── */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    logW = rect.width;
    logH = rect.height;
    canvas.width  = logW * DPR;
    canvas.height = logH * DPR;
    canvas.style.width  = logW + 'px';
    canvas.style.height = logH + 'px';

    cx = logW / 2;
    cy = logH * 0.48; // slightly above center
    R = Math.min(logW, logH) * (IS_MOBILE ? 0.28 : 0.22);

    // Update arc targets
    for (let i = 0; i < ARC_COUNT; i++) {
      const p = particles[i];
      if (!p) continue;
      p.tx = cx + Math.cos(p.angle) * R;
      p.ty = cy + Math.sin(p.angle) * R;
    }

    heroH = document.querySelector('.hero')?.offsetHeight || logH;
  }

  /* ── Init ── */
  function init() {
    // Resize first so logW/logH are available for particle constructors
    const rect = canvas.getBoundingClientRect();
    logW = rect.width;
    logH = rect.height;
    canvas.width  = logW * DPR;
    canvas.height = logH * DPR;
    canvas.style.width  = logW + 'px';
    canvas.style.height = logH + 'px';
    cx = logW / 2;
    cy = logH * 0.48;
    R = Math.min(logW, logH) * (IS_MOBILE ? 0.28 : 0.22);

    particles = [];
    for (let i = 0; i < ARC_COUNT; i++) particles.push(makeArc(i));
    for (let i = 0; i < STREAM_COUNT; i++) particles.push(makeStream());

    // Set arc targets now that R/cx/cy are known
    for (let i = 0; i < ARC_COUNT; i++) {
      const p = particles[i];
      p.tx = cx + Math.cos(p.angle) * R;
      p.ty = cy + Math.sin(p.angle) * R;
    }

    heroH = document.querySelector('.hero')?.offsetHeight || logH;
    t0 = performance.now();
    loop();
  }

  /* ── Update ── */
  function update(now) {
    const elapsed = now - t0;
    const dt = 1; // fixed step for consistency

    // Scroll fade
    const scrollFade = Math.max(0, 1 - scrollY / (heroH * 0.7));
    if (scrollFade <= 0) return;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      if (p.type === 'arc') {
        updateArc(p, elapsed, now);
      } else {
        updateStream(p, elapsed, now);
      }
    }
  }

  function updateArc(p, elapsed, now) {
    if (elapsed < CHAOS_MS) {
      /* Phase 1 — Chaos: Brownian drift */
      p.vx += (Math.random() - 0.5) * 0.4;
      p.vy += (Math.random() - 0.5) * 0.4;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.x += p.vx;
      p.y += p.vy;
      // Wrap
      if (p.x < -10) p.x = logW + 10;
      if (p.x > logW + 10) p.x = -10;
      if (p.y < -10) p.y = logH + 10;
      if (p.y > logH + 10) p.y = -10;
    } else {
      /* Phase 2/3 — Converge then breathe */
      const raw = Math.min(1, (elapsed - CHAOS_MS) / CONVERGE_MS);
      const ease = easeInOutQuart(raw);

      const springK = 0.015 + ease * 0.045; // spring strengthens
      const damping = 0.88 + ease * 0.06;

      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      p.vx += dx * springK;
      p.vy += dy * springK;
      p.vx *= damping;
      p.vy *= damping;

      // Breathing once settled
      if (raw >= 1) {
        const breatheX = Math.sin(now * 0.0006 + p.seed) * 1.2;
        const breatheY = Math.cos(now * 0.0005 + p.seed * 1.3) * 1.2;
        p.vx += breatheX * 0.04;
        p.vy += breatheY * 0.04;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Opacity easing
      const targetOp = p.targetOpacity * (0.85 + 0.15 * Math.sin(now * 0.001 + p.seed));
      p.opacity += (targetOp - p.opacity) * 0.03;
    }

    // Mouse repulsion
    applyMouseRepel(p, 100, 3);
  }

  function updateStream(p, elapsed, now) {
    // Streams only start flowing after chaos phase
    if (elapsed < CHAOS_MS * 0.5) {
      p.opacity *= 0.98; // stay invisible during early chaos
      return;
    }

    // Horizontal flow
    p.x += p.vx;
    p.y += p.vy + Math.sin(now * 0.001 + p.seed) * 0.15;

    // Attraction toward arc center when near
    if (elapsed > SETTLE_AT && p.verified) {
      const d = dist(p.x, p.y, cx, cy);
      if (d < R * 2.5 && d > R * 0.3) {
        const angle = Math.atan2(p.y - cy, p.x - cx);
        const targetD = R + (Math.random() - 0.5) * 8;
        const tx = cx + Math.cos(angle) * targetD;
        const ty = cy + Math.sin(angle) * targetD;
        p.vx += (tx - p.x) * 0.002;
        p.vy += (ty - p.y) * 0.002;
        p.opacity = Math.min(p.opacity + 0.005, 0.5);
        p.attracted = true;
      }
    }

    // Recycle when off screen
    if (p.x > logW + 40 || p.y < -40 || p.y > logH + 40) {
      p.x = -20 - Math.random() * 60;
      p.y = Math.random() * logH;
      p.vx = 0.3 + Math.random() * 0.8;
      p.vy = (Math.random() - 0.5) * 0.3;
      p.attracted = false;
      p.opacity = p.verified ? 0.2 + Math.random() * 0.2 : 0.06 + Math.random() * 0.1;
    }

    applyMouseRepel(p, 60, 1.5);
  }

  function applyMouseRepel(p, radius, force) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < radius && d > 0.1) {
      const f = ((radius - d) / radius) * force;
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f;
    }
  }

  /* ── Render ── */
  function render(now) {
    const elapsed = now - t0;
    const scrollFade = Math.max(0, 1 - scrollY / (heroH * 0.7));
    if (scrollFade <= 0) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, logW, logH); return; }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, logW, logH);
    ctx.globalAlpha = scrollFade;

    // Draw connections between nearby arc particles (constellation effect)
    if (elapsed > CHAOS_MS + CONVERGE_MS * 0.5) {
      const connFade = Math.min(1, (elapsed - CHAOS_MS - CONVERGE_MS * 0.5) / 1500);
      drawConnections(connFade);
    }

    // Draw particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.opacity < 0.01) continue;

      // Glow for arc particles
      if (p.type === 'arc' && p.opacity > 0.3 && p.glowSize > 3) {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.glowSize * 2);
        grad.addColorStop(0, rgba(p.color, p.opacity * 0.3));
        grad.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.glowSize * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core dot
      ctx.fillStyle = rgba(p.color, p.opacity);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Score text in center of arc (appears after formation)
    if (elapsed > SETTLE_AT) {
      const textFade = Math.min(1, (elapsed - SETTLE_AT) / 1200);
      drawScoreLabel(textFade);
    }

    ctx.globalAlpha = 1;
  }

  function drawConnections(fade) {
    ctx.lineWidth = 0.5;
    const maxDist = IS_MOBILE ? 30 : 45;
    // Only check arc particles
    for (let i = 0; i < ARC_COUNT; i++) {
      const a = particles[i];
      if (a.opacity < 0.2) continue;
      for (let j = i + 1; j < ARC_COUNT; j++) {
        const b = particles[j];
        if (b.opacity < 0.2) continue;
        // Only connect neighbors (close in index = close on arc)
        if (Math.abs(i - j) > 3) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < maxDist) {
          const alpha = (1 - d / maxDist) * Math.min(a.opacity, b.opacity) * fade * 0.6;
          const midColor = lerpColor(a.color, b.color, 0.5);
          ctx.strokeStyle = rgba(midColor, alpha);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  function drawScoreLabel(fade) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha *= fade;

    // Score number
    ctx.font = '600 ' + (IS_MOBILE ? '28' : '42') + 'px Inter, system-ui, sans-serif';
    ctx.fillStyle = rgba(COL.white, 0.9);
    ctx.fillText('L3', cx, cy - 6);

    // Sublabel
    ctx.font = '400 ' + (IS_MOBILE ? '9' : '11') + 'px Inter, system-ui, sans-serif';
    ctx.fillStyle = rgba(COL.gray, 0.6);
    ctx.fillText('TRUST SCORE', cx, cy + (IS_MOBILE ? 16 : 22));
  }

  /* ── Loop ── */
  function loop() {
    const now = performance.now();
    update(now);
    render(now);
    raf = requestAnimationFrame(loop);
  }

  /* ── Events ── */
  canvas.addEventListener('mousemove', function (e) {
    const rect = canvas.getBoundingClientRect();
    mx = e.clientX - rect.left;
    my = e.clientY - rect.top;
  });
  canvas.addEventListener('mouseleave', function () {
    mx = -9999;
    my = -9999;
  });

  // Touch support
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length) {
      const rect = canvas.getBoundingClientRect();
      mx = e.touches[0].clientX - rect.left;
      my = e.touches[0].clientY - rect.top;
    }
  }, { passive: true });
  canvas.addEventListener('touchend', function () {
    mx = -9999;
    my = -9999;
  });

  window.addEventListener('scroll', function () {
    scrollY = window.pageYOffset || document.documentElement.scrollTop;
  }, { passive: true });

  window.addEventListener('resize', resize);

  // Visibility: pause when hidden
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      hiddenAt = performance.now();
      cancelAnimationFrame(raf);
    } else {
      // Offset t0 by time hidden so animation doesn't jump
      if (hiddenAt) t0 += performance.now() - hiddenAt;
      hiddenAt = 0;
      loop();
    }
  });

  /* ── GO ── */
  if (IS_REDUCED) {
    // Reduced motion: just show the formed state instantly
    init();
    // Fast-forward to settled
    t0 = performance.now() - SETTLE_AT - 2000;
  } else {
    init();
  }
})();
