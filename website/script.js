/* AMC v15 — Pure CSS animations, no GSAP */

// ─── MATRIX RAIN ───
const canvas = document.getElementById('matrix');
if (canvas) {
  const ctx = canvas.getContext('2d');
  function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resizeCanvas(); window.addEventListener('resize', resizeCanvas);
  const chars = 'AMC01234567890.:{}<>[];/\\|=+-_*&^%$#@!';
  const fontSize = 14;
  let columns, drops;
  function initDrops() { columns = Math.floor(canvas.width / fontSize); drops = Array(columns).fill(1); }
  initDrops(); window.addEventListener('resize', initDrops);
  (function drawMatrix() {
    ctx.fillStyle = 'rgba(5, 5, 5, 0.04)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ff41'; ctx.font = fontSize + 'px monospace';
    for (let i = 0; i < drops.length; i++) {
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
    requestAnimationFrame(drawMatrix);
  })();
}

// ─── INTERSECTION OBSERVER for scroll reveals ───
const observer = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('vis');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(function(el) { observer.observe(el); });

// ─── COUNTERS ───
function animateCounter(el) {
  var target = parseInt(el.dataset.count) || 0;
  var duration = 2000;
  var start = performance.now();
  function tick(now) {
    var elapsed = now - start;
    var progress = Math.min(elapsed / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Hero counters — animate on load
window.addEventListener('load', function() {
  document.querySelectorAll('.proof-num').forEach(animateCounter);
});

// OSS counters — animate on scroll
var ossObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      ossObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });
document.querySelectorAll('.oss-num').forEach(function(el) { ossObserver.observe(el); });

// ─── BAR FILLS on scroll ───
var barObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      var fill = entry.target;
      var tw = getComputedStyle(fill).getPropertyValue('--tw');
      if (tw) fill.style.width = tw;
      barObserver.unobserve(fill);
    }
  });
}, { threshold: 0.2 });
document.querySelectorAll('.tier-fill, .lvl-fill').forEach(function(el) { barObserver.observe(el); });

// ─── NAV SCROLL ───
var lastScroll = 0;
var nav = document.getElementById('nav');
window.addEventListener('scroll', function() {
  var scroll = window.scrollY;
  if (scroll > 200 && scroll > lastScroll) {
    nav.classList.add('nav-hidden');
  } else {
    nav.classList.remove('nav-hidden');
  }
  lastScroll = scroll;
}, { passive: true });

// ─── SCROLL PROGRESS BAR ───
var bar = document.createElement('div');
bar.className = 'scroll-bar';
document.body.appendChild(bar);
window.addEventListener('scroll', function() {
  var h = document.documentElement.scrollHeight - window.innerHeight;
  bar.style.width = (window.scrollY / h * 100) + '%';
}, { passive: true });

// ─── SMOOTH SCROLL ───
document.querySelectorAll('a[href^="#"]').forEach(function(a) {
  a.addEventListener('click', function(e) {
    var href = a.getAttribute('href');
    if (href === '#') return;
    var t = document.querySelector(href);
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});

// ─── CURSOR GLOW ───
var glow = document.getElementById('cursorGlow');
if (glow && window.matchMedia('(pointer: fine)').matches) {
  document.addEventListener('mousemove', function(e) {
    glow.style.transform = 'translate(' + (e.clientX - 200) + 'px,' + (e.clientY - 200) + 'px)';
  });
}

// ─── MODE TOGGLE (Technical / ELI5) ───
var toggle = document.getElementById('modeToggle');
if (toggle) {
  // Check saved preference
  var saved = localStorage.getItem('amc-mode');
  if (saved === 'eli5') document.body.classList.add('eli5-mode');

  toggle.addEventListener('click', function() {
    document.body.classList.toggle('eli5-mode');
    var isEli5 = document.body.classList.contains('eli5-mode');
    localStorage.setItem('amc-mode', isEli5 ? 'eli5' : 'tech');
  });
}
