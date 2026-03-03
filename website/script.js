/* AMC v15 — Pure CSS animations, no GSAP */

// ─── MATRIX RAIN ───
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('matrix');
if (canvas && !prefersReducedMotion) {
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
  var target = parseInt(el.dataset.target || el.dataset.count) || 0;
  var suffix = el.dataset.suffix || '';
  var duration = 2000;
  var start = performance.now();
  function formatNum(n) {
    if (n >= 1000) return n.toLocaleString();
    return String(n);
  }
  function tick(now) {
    var elapsed = now - start;
    var progress = Math.min(elapsed / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatNum(Math.round(target * eased)) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Hero counters — animate on load
window.addEventListener('load', function() {
  document.querySelectorAll('.proof-num').forEach(animateCounter);
});

// All other counters — animate on scroll
var counterObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });
document.querySelectorAll('.oss-num, .hnum, .cap-num, .gauge-num, [data-target]').forEach(function(el) {
  if (!el.classList.contains('proof-num')) counterObserver.observe(el);
});

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
// Re-animate counters when switching modes (hidden elements miss IntersectionObserver)
function animateVisibleCounters() {
  document.querySelectorAll('[data-target]').forEach(function(el) {
    if (el.offsetParent !== null && (el.textContent.trim() === '0' || el.textContent.trim() === '0pt' || el.textContent.trim() === '0+')) {
      animateCounter(el);
    }
  });
}
// Listen for mode changes from the inline setMode() function
var modeObserver = new MutationObserver(function() { setTimeout(animateVisibleCounters, 100); });
modeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

var toggle = document.getElementById('modeToggle');
if (toggle) {
  var saved = localStorage.getItem('amc-mode');
  if (saved === 'eli5') document.body.classList.add('eli5-mode');

  toggle.addEventListener('click', function() {
    document.body.classList.toggle('eli5-mode');
    var isEli5 = document.body.classList.contains('eli5-mode');
    localStorage.setItem('amc-mode', isEli5 ? 'eli5' : 'tech');
  });
}

// ─── OS INSTALL TABS ───
document.querySelectorAll('.os-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    var os = this.getAttribute('data-os');
    document.querySelectorAll('.os-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.os-panel').forEach(function(p) { p.classList.remove('active'); });
    this.classList.add('active');
    document.querySelector('.os-panel[data-os="' + os + '"]').classList.add('active');
  });
});

// ─── DASHBOARD HEATMAP ───
var heatmap = document.getElementById('dashHeatmap');
if (heatmap) {
  var greens = ['#0a1a0a','#0d2b0d','#0f3d0f','#1a5a1a','#2a7a2a','#00cc33','#00ff41'];
  for (var i = 0; i < 111; i++) {
    var cell = document.createElement('div');
    cell.className = 'dash-cell';
    var level = Math.floor(Math.random() * greens.length);
    cell.style.background = greens[level];
    heatmap.appendChild(cell);
  }
}
