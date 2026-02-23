/* AMC v12 — Awwwards-level GSAP animations */

// ─── MATRIX RAIN ───
const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resizeCanvas(); window.addEventListener('resize', resizeCanvas);
const chars = 'AMCアイウエオ01234567890.:{}<>[];/\\|=+-_*&^%$#@!';
const fontSize = 14;
let columns, drops;
function initDrops() { columns = Math.floor(canvas.width / fontSize); drops = Array(columns).fill(1); }
initDrops(); window.addEventListener('resize', initDrops);
function drawMatrix() {
  ctx.fillStyle = 'rgba(5, 5, 5, 0.04)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#00ff41'; ctx.font = fontSize + 'px monospace';
  for (let i = 0; i < drops.length; i++) {
    ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, drops[i] * fontSize);
    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
    drops[i]++;
  }
  requestAnimationFrame(drawMatrix);
}
drawMatrix();

// ─── GSAP SETUP ───
gsap.registerPlugin(ScrollTrigger);

// ─── SMOOTH LENIS-STYLE SCROLL (via GSAP) ───
// ScrollTrigger defaults
ScrollTrigger.defaults({ toggleActions: 'play none none reverse' });

// ─── HERO ANIMATIONS ───
const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
heroTl
  .from('.hero-tag', { y: 30, opacity: 0, duration: 0.8, delay: 0.3 })
  .from('.h1-line', { y: 80, opacity: 0, duration: 1, stagger: 0.15 }, '-=0.4')
  .from('.hero-sub', { y: 30, opacity: 0, duration: 0.8 }, '-=0.5')
  .from('.hero-ctas', { y: 30, opacity: 0, duration: 0.8 }, '-=0.5')
  .from('.proof-item', { y: 40, opacity: 0, duration: 0.6, stagger: 0.1 }, '-=0.3')
  .from('.proof-sep', { scaleY: 0, opacity: 0, duration: 0.4, stagger: 0.1 }, '-=0.6');

// Hero parallax on scroll
gsap.to('.hero-content', {
  scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.5 },
  y: -150, opacity: 0, scale: 0.95
});
gsap.to('.hero-grid', {
  scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 },
  y: -80, opacity: 0
});

// ─── SECTION TAG + HEADING REVEALS ───
document.querySelectorAll('.sec-tag').forEach(tag => {
  gsap.from(tag, {
    scrollTrigger: { trigger: tag, start: 'top 85%' },
    x: -30, opacity: 0, duration: 0.6
  });
});

document.querySelectorAll('.sec h2').forEach(h2 => {
  gsap.from(h2, {
    scrollTrigger: { trigger: h2, start: 'top 85%' },
    y: 60, opacity: 0, duration: 1, ease: 'power3.out'
  });
});

document.querySelectorAll('.sec-sub').forEach(sub => {
  gsap.from(sub, {
    scrollTrigger: { trigger: sub, start: 'top 85%' },
    y: 30, opacity: 0, duration: 0.8, delay: 0.2
  });
});

// ─── COMPARE SECTION — SLIDE IN FROM SIDES ───
gsap.from('.compare-bad', {
  scrollTrigger: { trigger: '.compare', start: 'top 80%' },
  x: -80, opacity: 0, duration: 1, ease: 'power3.out'
});
gsap.from('.compare-good', {
  scrollTrigger: { trigger: '.compare', start: 'top 80%' },
  x: 80, opacity: 0, duration: 1, ease: 'power3.out'
});
gsap.from('.compare-vs', {
  scrollTrigger: { trigger: '.compare', start: 'top 80%' },
  scale: 0, opacity: 0, duration: 0.6, delay: 0.4, ease: 'back.out(2)'
});

// ─── PROBLEM CARDS — STAGGER UP ───
gsap.from('.p-card', {
  scrollTrigger: { trigger: '.problem-cards', start: 'top 85%' },
  y: 60, opacity: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out'
});

// ─── FLOW STEPS — STAGGER WITH ARROWS ───
gsap.from('.flow-step', {
  scrollTrigger: { trigger: '.flow', start: 'top 80%' },
  y: 50, opacity: 0, duration: 0.8, stagger: 0.2, ease: 'power3.out'
});
gsap.from('.flow-arrow', {
  scrollTrigger: { trigger: '.flow', start: 'top 80%' },
  scale: 0, opacity: 0, duration: 0.4, stagger: 0.2, delay: 0.3, ease: 'back.out(2)'
});

// ─── TRUST TIERS — SLIDE IN + BAR FILL ───
gsap.from('.tier', {
  scrollTrigger: { trigger: '.trust-tiers', start: 'top 80%' },
  x: -40, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out'
});

// Tier bar fills
document.querySelectorAll('.tier').forEach(tier => {
  const fill = tier.querySelector('.tier-fill');
  if (fill) {
    ScrollTrigger.create({
      trigger: tier, start: 'top 85%',
      onEnter: () => { fill.style.width = getComputedStyle(fill).getPropertyValue('--tw'); }
    });
  }
});

// ─── PLATFORM CARDS — STAGGER GRID ───
gsap.from('.plat-card', {
  scrollTrigger: { trigger: '.platform-grid', start: 'top 85%' },
  y: 60, opacity: 0, rotation: 2, duration: 0.8, stagger: { amount: 0.6, grid: [2, 4], from: 'start' }, ease: 'power3.out'
});

// ─── DIMENSIONS — RADAR DRAW + LIST ───
if (document.querySelector('.radar-data')) {
  gsap.from('.radar-data', {
    scrollTrigger: { trigger: '.dim-visual', start: 'top 80%' },
    scale: 0, opacity: 0, duration: 1.2, ease: 'elastic.out(1, 0.5)', transformOrigin: 'center center'
  });
}
gsap.from('.dim-item', {
  scrollTrigger: { trigger: '.dim-list', start: 'top 85%' },
  x: 40, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out'
});

// ─── MATURITY LEVELS — BAR FILL ───
document.querySelectorAll('.lvl').forEach((lvl, i) => {
  gsap.from(lvl, {
    scrollTrigger: { trigger: lvl, start: 'top 90%' },
    x: -30, opacity: 0, duration: 0.5, delay: i * 0.08
  });
  const fill = lvl.querySelector('.lvl-fill');
  if (fill) {
    ScrollTrigger.create({
      trigger: lvl, start: 'top 90%',
      onEnter: () => { fill.style.width = getComputedStyle(fill).getPropertyValue('--tw'); }
    });
  }
});

// ─── ATTACK GRID — STAGGER ───
gsap.from('.atk', {
  scrollTrigger: { trigger: '.attack-grid', start: 'top 85%' },
  y: 30, opacity: 0, duration: 0.5, stagger: { amount: 0.5, grid: [5, 2], from: 'start' }, ease: 'power3.out'
});

// ─── USE CASES — STAGGER GRID ───
gsap.from('.uc', {
  scrollTrigger: { trigger: '.uc-grid', start: 'top 85%' },
  y: 50, opacity: 0, duration: 0.7, stagger: { amount: 0.5, grid: [2, 3], from: 'start' }, ease: 'power3.out'
});

// ─── EVIDENCE CHAIN — SEQUENTIAL ───
gsap.from('.chain-block', {
  scrollTrigger: { trigger: '.chain', start: 'top 80%' },
  y: 40, opacity: 0, scale: 0.9, duration: 0.7, stagger: 0.15, ease: 'power3.out'
});
gsap.from('.chain-link', {
  scrollTrigger: { trigger: '.chain', start: 'top 80%' },
  scale: 0, opacity: 0, duration: 0.3, stagger: 0.15, delay: 0.3, ease: 'back.out(2)'
});

// ─── TERMINAL — TYPE EFFECT ───
const termBody = document.querySelector('.term-body');
if (termBody) {
  gsap.from(termBody, {
    scrollTrigger: { trigger: '.terminal', start: 'top 80%' },
    opacity: 0, y: 20, duration: 0.8
  });
  // Terminal glow pulse
  gsap.to('.terminal', {
    scrollTrigger: { trigger: '.terminal', start: 'top 80%' },
    boxShadow: '0 0 120px rgba(0,255,65,0.08)', duration: 2, yoyo: true, repeat: -1, ease: 'sine.inOut'
  });
}

// ─── DOC CARDS — STAGGER ───
gsap.from('.doc-card', {
  scrollTrigger: { trigger: '.docs-grid', start: 'top 85%' },
  y: 40, opacity: 0, duration: 0.5, stagger: { amount: 0.6, grid: [3, 4], from: 'random' }, ease: 'power3.out'
});

// ─── INTEGRATION ITEMS ───
if (document.querySelector('.int-grid')) {
  gsap.from('.int-item', {
    scrollTrigger: { trigger: '.int-grid', start: 'top 85%' },
    x: -30, opacity: 0, duration: 0.5, stagger: 0.08, ease: 'power3.out'
  });
}

// ─── COMPLIANCE CARDS ───
if (document.querySelector('.comply-grid')) {
  gsap.from('.comply-card', {
    scrollTrigger: { trigger: '.comply-grid', start: 'top 85%' },
    y: 40, opacity: 0, duration: 0.7, stagger: 0.12, ease: 'power3.out'
  });
}

// ─── MISSION SECTION ───
if (document.querySelector('.mission-wrap')) {
  gsap.from('.mission-icon', {
    scrollTrigger: { trigger: '.mission-wrap', start: 'top 80%' },
    scale: 0, rotation: -180, opacity: 0, duration: 1.2, ease: 'elastic.out(1, 0.5)'
  });
  gsap.from('.mission-text', {
    scrollTrigger: { trigger: '.mission-wrap', start: 'top 80%' },
    y: 30, opacity: 0, duration: 0.8, delay: 0.3
  });
}

// ─── OSS STATS ───
gsap.from('.oss-stat', {
  scrollTrigger: { trigger: '.oss-stats', start: 'top 85%' },
  y: 40, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out'
});

// ─── COUNTERS — GSAP-POWERED ───
function animateCounter(el) {
  const target = parseInt(el.dataset.count);
  gsap.fromTo(el, { textContent: 0 }, {
    textContent: target, duration: 2.5, ease: 'power2.out', snap: { textContent: 1 },
    scrollTrigger: { trigger: el, start: 'top 90%' }
  });
}
document.querySelectorAll('.proof-num, .oss-num').forEach(animateCounter);

// ─── MAGNETIC BUTTONS ───
document.querySelectorAll('.btn-green, .btn-dim').forEach(btn => {
  btn.addEventListener('mousemove', e => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(btn, { x: x * 0.2, y: y * 0.2, duration: 0.3, ease: 'power2.out' });
  });
  btn.addEventListener('mouseleave', () => {
    gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
  });
});

// ─── NAV SCROLL EFFECT ───
ScrollTrigger.create({
  start: 'top -80',
  onUpdate: self => {
    const nav = document.getElementById('nav');
    if (self.direction === 1 && self.scroll() > 200) {
      gsap.to(nav, { y: -80, duration: 0.3 });
    } else {
      gsap.to(nav, { y: 0, duration: 0.3 });
    }
  }
});

// ─── SCROLL PROGRESS BAR ───
const progressBar = document.createElement('div');
progressBar.style.cssText = 'position:fixed;top:0;left:0;height:2px;background:#00ff41;z-index:9999;width:0;box-shadow:0 0 10px rgba(0,255,65,0.5);transition:none;';
document.body.appendChild(progressBar);
gsap.to(progressBar, {
  width: '100%',
  scrollTrigger: { trigger: 'body', start: 'top top', end: 'bottom bottom', scrub: 0.3 }
});

// ─── SMOOTH SCROLL ───
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); gsap.to(window, { scrollTo: { y: t, offsetY: 80 }, duration: 1, ease: 'power3.inOut' }); }
  });
});

// ─── PARALLAX SECTIONS ───
document.querySelectorAll('.sec-dark').forEach(sec => {
  gsap.fromTo(sec, { backgroundPosition: '50% 0%' }, {
    backgroundPosition: '50% 20%',
    scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: 1 }
  });
});

// ─── CARD TILT ON HOVER ───
document.querySelectorAll('.plat-card, .uc, .doc-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    gsap.to(card, { rotateY: x * 8, rotateX: -y * 8, duration: 0.3, ease: 'power2.out', transformPerspective: 800 });
  });
  card.addEventListener('mouseleave', () => {
    gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
  });
});

// ─── CURSOR GLOW ───
const glow = document.getElementById('cursorGlow');
if (glow && window.matchMedia('(pointer: fine)').matches) {
  document.addEventListener('mousemove', e => {
    gsap.to(glow, { x: e.clientX, y: e.clientY, duration: 0.8, ease: 'power2.out' });
  });
}
