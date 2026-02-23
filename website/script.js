/* AMC v13 — Fixed rendering + Awwwards GSAP */

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

// ─── HERO ANIMATIONS (immediate, no ScrollTrigger) ───
const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
heroTl
  .from('.hero-tag', { y: 30, autoAlpha: 0, duration: 0.8, delay: 0.3 })
  .from('.h1-line', { y: 80, autoAlpha: 0, duration: 1, stagger: 0.15 }, '-=0.4')
  .from('.hero-sub', { y: 30, autoAlpha: 0, duration: 0.8 }, '-=0.5')
  .from('.hero-ctas', { y: 30, autoAlpha: 0, duration: 0.8 }, '-=0.5')
  .from('.proof-item', { y: 40, autoAlpha: 0, duration: 0.6, stagger: 0.1 }, '-=0.3')
  .from('.proof-sep', { scaleY: 0, autoAlpha: 0, duration: 0.4, stagger: 0.1 }, '-=0.6');

// Hero counters — animate immediately after hero timeline
heroTl.add(() => {
  document.querySelectorAll('.proof-num').forEach(el => {
    const target = parseInt(el.dataset.count);
    gsap.fromTo(el, { textContent: 0 }, {
      textContent: target, duration: 2, ease: 'power2.out',
      snap: { textContent: 1 },
      onUpdate: function() { el.textContent = Math.round(gsap.getProperty(el, 'textContent')); }
    });
  });
}, '-=0.3');

// Hero parallax on scroll
gsap.to('.hero-content', {
  scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.5 },
  y: -150, scale: 0.95
});

// ─── UTILITY: scroll-triggered reveal ───
function reveal(selector, props, triggerEl) {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;
  gsap.from(els, Object.assign({
    autoAlpha: 0,
    duration: 0.8,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: triggerEl || els[0].closest('.sec') || els[0],
      start: 'top 85%',
      toggleActions: 'play none none none'
    }
  }, props));
}

// ─── SECTION TAGS + HEADINGS ───
document.querySelectorAll('.sec-tag').forEach(tag => {
  gsap.from(tag, { scrollTrigger: { trigger: tag, start: 'top 88%', toggleActions: 'play none none none' }, x: -30, autoAlpha: 0, duration: 0.6 });
});
document.querySelectorAll('.sec h2').forEach(h2 => {
  gsap.from(h2, { scrollTrigger: { trigger: h2, start: 'top 88%', toggleActions: 'play none none none' }, y: 50, autoAlpha: 0, duration: 0.9 });
});
document.querySelectorAll('.sec-sub').forEach(sub => {
  gsap.from(sub, { scrollTrigger: { trigger: sub, start: 'top 88%', toggleActions: 'play none none none' }, y: 25, autoAlpha: 0, duration: 0.7, delay: 0.15 });
});

// ─── COMPARE ───
gsap.from('.compare-bad', { scrollTrigger: { trigger: '.compare', start: 'top 82%', toggleActions: 'play none none none' }, x: -60, autoAlpha: 0, duration: 0.9 });
gsap.from('.compare-good', { scrollTrigger: { trigger: '.compare', start: 'top 82%', toggleActions: 'play none none none' }, x: 60, autoAlpha: 0, duration: 0.9 });
gsap.from('.compare-vs', { scrollTrigger: { trigger: '.compare', start: 'top 82%', toggleActions: 'play none none none' }, scale: 0, autoAlpha: 0, duration: 0.5, delay: 0.4, ease: 'back.out(2)' });

// ─── PROBLEM CARDS ───
reveal('.p-card', { y: 50, stagger: 0.12 }, '.problem-cards');

// ─── FLOW ───
reveal('.flow-step', { y: 40, stagger: 0.15 }, '.flow');
reveal('.flow-arrow', { scale: 0, stagger: 0.15, delay: 0.2, ease: 'back.out(2)' }, '.flow');

// ─── TRUST TIERS ───
reveal('.tier', { x: -30, stagger: 0.08 }, '.trust-tiers');
document.querySelectorAll('.tier').forEach(tier => {
  const fill = tier.querySelector('.tier-fill');
  if (fill) {
    ScrollTrigger.create({
      trigger: tier, start: 'top 88%',
      onEnter: () => { fill.style.width = fill.style.getPropertyValue('--tw') || getComputedStyle(fill).getPropertyValue('--tw'); },
      once: true
    });
  }
});

// ─── PLATFORM CARDS ───
reveal('.plat-card', { y: 50, stagger: 0.08 }, '.platform-grid');

// ─── DIMENSIONS ───
if (document.querySelector('.radar-data')) {
  gsap.from('.radar-data', {
    scrollTrigger: { trigger: '.dim-visual', start: 'top 82%', toggleActions: 'play none none none' },
    scale: 0, autoAlpha: 0, duration: 1.2, ease: 'elastic.out(1, 0.5)', transformOrigin: '150px 150px'
  });
}
reveal('.dim-item', { x: 30, stagger: 0.08 }, '.dim-list');

// ─── MATURITY LEVELS ───
document.querySelectorAll('.lvl').forEach((lvl, i) => {
  gsap.from(lvl, {
    scrollTrigger: { trigger: lvl, start: 'top 92%', toggleActions: 'play none none none' },
    x: -25, autoAlpha: 0, duration: 0.5, delay: i * 0.06
  });
  const fill = lvl.querySelector('.lvl-fill');
  if (fill) {
    ScrollTrigger.create({
      trigger: lvl, start: 'top 92%',
      onEnter: () => { fill.style.width = getComputedStyle(fill).getPropertyValue('--tw'); },
      once: true
    });
  }
});

// ─── ATTACK GRID ───
reveal('.atk', { y: 25, stagger: 0.06 }, '.attack-grid');

// ─── USE CASES ───
reveal('.uc', { y: 40, stagger: 0.1 }, '.uc-grid');

// ─── EVIDENCE CHAIN ───
reveal('.chain-block', { y: 35, scale: 0.95, stagger: 0.12 }, '.chain');
reveal('.chain-link', { scale: 0, stagger: 0.12, delay: 0.2, ease: 'back.out(2)' }, '.chain');

// ─── TERMINAL ───
const termBody = document.querySelector('.term-body');
if (termBody) {
  gsap.from('.terminal', {
    scrollTrigger: { trigger: '.terminal', start: 'top 82%', toggleActions: 'play none none none' },
    autoAlpha: 0, y: 30, duration: 0.8
  });
}

// ─── DOC CARDS ───
reveal('.doc-card', { y: 35, stagger: 0.06 }, '.docs-grid');

// ─── MISSION ───
if (document.querySelector('.mission-wrap')) {
  gsap.from('.mission-icon', {
    scrollTrigger: { trigger: '.mission-wrap', start: 'top 82%', toggleActions: 'play none none none' },
    scale: 0, rotation: -180, autoAlpha: 0, duration: 1.2, ease: 'elastic.out(1, 0.5)'
  });
  gsap.from('.mission-text', {
    scrollTrigger: { trigger: '.mission-wrap', start: 'top 82%', toggleActions: 'play none none none' },
    y: 25, autoAlpha: 0, duration: 0.7, delay: 0.3
  });
}

// ─── OSS STATS + COUNTERS ───
reveal('.oss-stat', { y: 35, stagger: 0.08 }, '.oss-stats');
document.querySelectorAll('.oss-num').forEach(el => {
  const target = parseInt(el.dataset.count);
  ScrollTrigger.create({
    trigger: el, start: 'top 90%', once: true,
    onEnter: () => {
      gsap.fromTo(el, { textContent: 0 }, {
        textContent: target, duration: 2.5, ease: 'power2.out',
        snap: { textContent: 1 },
        onUpdate: function() { el.textContent = Math.round(gsap.getProperty(el, 'textContent')); }
      });
    }
  });
});

// ─── MAGNETIC BUTTONS ───
document.querySelectorAll('.btn-green, .btn-dim').forEach(btn => {
  btn.addEventListener('mousemove', e => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(btn, { x: x * 0.15, y: y * 0.15, duration: 0.3, ease: 'power2.out' });
  });
  btn.addEventListener('mouseleave', () => {
    gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
  });
});

// ─── NAV AUTO-HIDE ───
let lastScroll = 0;
ScrollTrigger.create({
  onUpdate: self => {
    const nav = document.getElementById('nav');
    const scroll = self.scroll();
    if (scroll > 200 && scroll > lastScroll) {
      gsap.to(nav, { y: -80, duration: 0.3 });
    } else {
      gsap.to(nav, { y: 0, duration: 0.3 });
    }
    lastScroll = scroll;
  }
});

// ─── SCROLL PROGRESS BAR ───
const progressBar = document.createElement('div');
progressBar.style.cssText = 'position:fixed;top:0;left:0;height:2px;background:#00ff41;z-index:9999;width:0;box-shadow:0 0 10px rgba(0,255,65,0.5);';
document.body.appendChild(progressBar);
gsap.to(progressBar, {
  width: '100%',
  scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 }
});

// ─── SMOOTH SCROLL ───
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    if (href === '#') return;
    const t = document.querySelector(href);
    if (t) { e.preventDefault(); gsap.to(window, { scrollTo: { y: t, offsetY: 80 }, duration: 1, ease: 'power3.inOut' }); }
  });
});

// ─── CARD TILT ON HOVER ───
document.querySelectorAll('.plat-card, .uc, .doc-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    gsap.to(card, { rotateY: x * 6, rotateX: -y * 6, duration: 0.3, ease: 'power2.out', transformPerspective: 800 });
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

// ─── TERMINAL GLOW PULSE ───
gsap.to('.terminal', {
  boxShadow: '0 0 80px rgba(0,255,65,0.06)',
  duration: 2, yoyo: true, repeat: -1, ease: 'sine.inOut'
});
