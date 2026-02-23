/* ═══════════════════════════════════════════
   AMC v7 — Awwwards Script
   Compass hero, custom cursor, scroll reveals,
   dimension accordion, level bars, loader
   ═══════════════════════════════════════════ */

// ─── LOADER ───
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('loader').classList.add('done');
    animateHero();
  }, 1200);
});

// ─── CUSTOM CURSOR ───
const ring = document.getElementById('cursorRing');
const dot = document.getElementById('cursorDot');
let mx = 0, my = 0, rx = 0, ry = 0;

document.addEventListener('mousemove', e => {
  mx = e.clientX;
  my = e.clientY;
  dot.style.left = mx + 'px';
  dot.style.top = my + 'px';
});

function updateCursor() {
  rx += (mx - rx) * 0.12;
  ry += (my - ry) * 0.12;
  ring.style.left = rx + 'px';
  ring.style.top = ry + 'px';
  requestAnimationFrame(updateCursor);
}
updateCursor();

// Hover effect on interactive elements
document.querySelectorAll('a, button, .dim-item, .anatomy-card').forEach(el => {
  el.addEventListener('mouseenter', () => ring.classList.add('hover'));
  el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
});

// ─── HERO CANVAS — COMPASS FIELD ───
const canvas = document.getElementById('heroCanvas');
const ctx = canvas.getContext('2d');
let W, H, time = 0;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

function drawHero() {
  ctx.clearRect(0, 0, W, H);
  time += 0.002;

  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(W, H) * 0.4;

  // Concentric rings
  for (let i = 0; i < 8; i++) {
    const r = maxR * (0.15 + i * 0.12);
    const alpha = 0.02 + Math.sin(time + i * 0.5) * 0.01;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(207, 168, 104, ${alpha})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Radial lines (compass rose)
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2 + time * 0.5;
    const r1 = maxR * 0.2;
    const r2 = maxR * (i % 9 === 0 ? 1.0 : i % 3 === 0 ? 0.85 : 0.7);
    const alpha = i % 9 === 0 ? 0.06 : i % 3 === 0 ? 0.03 : 0.015;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
    ctx.strokeStyle = `rgba(207, 168, 104, ${alpha})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Floating particles
  for (let i = 0; i < 40; i++) {
    const seed = i * 137.508;
    const angle = seed + time * (0.3 + (i % 5) * 0.1);
    const dist = maxR * (0.3 + (Math.sin(seed + time) * 0.5 + 0.5) * 0.6);
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const size = 1 + Math.sin(time * 2 + seed) * 0.5;
    const alpha = 0.05 + Math.sin(time + seed) * 0.03;

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(207, 168, 104, ${alpha})`;
    ctx.fill();
  }

  // Compass needle — subtle, slow rotation
  const needleAngle = -Math.PI / 2 + Math.sin(time * 0.4) * 0.08;
  const needleLen = maxR * 0.35;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(needleAngle);

  // North (gold)
  ctx.beginPath();
  ctx.moveTo(0, -needleLen);
  ctx.lineTo(4, 0);
  ctx.lineTo(-4, 0);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, -needleLen, 0, 0);
  grad.addColorStop(0, 'rgba(228, 200, 140, 0.4)');
  grad.addColorStop(1, 'rgba(207, 168, 104, 0.05)');
  ctx.fillStyle = grad;
  ctx.fill();

  // South (dim)
  ctx.beginPath();
  ctx.moveTo(0, needleLen * 0.6);
  ctx.lineTo(3, 0);
  ctx.lineTo(-3, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(207, 168, 104, 0.02)';
  ctx.fill();

  ctx.restore();

  // Center point
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(207, 168, 104, 0.15)';
  ctx.fill();

  // Mouse interaction — subtle glow near cursor
  if (mx > 0 && my > 0) {
    const grd = ctx.createRadialGradient(mx, my, 0, mx, my, 200);
    grd.addColorStop(0, 'rgba(207, 168, 104, 0.03)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }

  requestAnimationFrame(drawHero);
}
drawHero();

// ─── HERO ANIMATION ───
function animateHero() {
  gsap.registerPlugin(ScrollTrigger);

  // Hero text lines
  gsap.to('.hero-line', {
    opacity: 1,
    y: 0,
    duration: 1,
    stagger: 0.15,
    ease: 'power3.out',
    delay: 0.2
  });

  gsap.to('.hero-p', {
    opacity: 1,
    y: 0,
    duration: 0.8,
    ease: 'power3.out',
    delay: 0.8
  });

  gsap.to('.hero-actions', {
    opacity: 1,
    y: 0,
    duration: 0.8,
    ease: 'power3.out',
    delay: 1.0
  });

  // Scroll reveals
  document.querySelectorAll('.manifesto-block, .anatomy-card, .dim-item, .level-row, .proof-col, .term').forEach((el, i) => {
    el.setAttribute('data-reveal', '');
  });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('[data-reveal]').forEach(el => revealObserver.observe(el));

  // Stagger delays
  document.querySelectorAll('.anatomy-card').forEach((card, i) => {
    card.style.transitionDelay = `${i * 0.12}s`;
  });

  document.querySelectorAll('.dim-item').forEach((item, i) => {
    item.style.transitionDelay = `${i * 0.08}s`;
  });

  document.querySelectorAll('.level-row').forEach((row, i) => {
    row.style.transitionDelay = `${i * 0.1}s`;
  });

  // Level bars animation
  const levelObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const fill = entry.target.querySelector('.lv-fill');
        const targetWidth = getComputedStyle(fill).getPropertyValue('--target-width');
        fill.style.width = targetWidth;
        levelObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.level-row').forEach(row => levelObserver.observe(row));

  // Hero parallax on scroll
  gsap.to('.hero-content', {
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: 'bottom top',
      scrub: 1
    },
    y: -100,
    opacity: 0
  });
}

// ─── DIMENSION ACCORDION ───
document.querySelectorAll('.dim-item').forEach(item => {
  item.addEventListener('click', () => {
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.dim-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});

// ─── SMOOTH SCROLL ───
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});
