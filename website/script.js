// AMC — Awwwards-tier interactions
(function() {
  'use strict';
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFine = window.matchMedia('(pointer: fine)').matches;

  // ─── Custom cursor dot ───
  if (isFine && !prefersReduced) {
    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    dot.id = 'cursorDot';
    document.body.appendChild(dot);
    let cx = -100, cy = -100, tx = -100, ty = -100;
    document.addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; dot.classList.add('visible'); });
    document.addEventListener('mouseleave', () => dot.classList.remove('visible'));
    (function loop() {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      dot.style.left = cx + 'px';
      dot.style.top = cy + 'px';
      requestAnimationFrame(loop);
    })();
    document.querySelectorAll('a, button, .btn-glow, .btn-outline, .nav-cta, .stat-pill').forEach(el => {
      el.addEventListener('mouseenter', () => dot.classList.add('hover'));
      el.addEventListener('mouseleave', () => dot.classList.remove('hover'));
    });
  }

  // ─── Cursor glow follows mouse ───
  const glow = document.getElementById('cursorGlow');
  if (glow && isFine && !prefersReduced) {
    let mx = 0, my = 0, gx = 0, gy = 0;
    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
    (function animate() {
      gx += (mx - gx) * 0.06;
      gy += (my - gy) * 0.06;
      glow.style.transform = `translate(${gx - 400}px, ${gy - 400}px)`;
      requestAnimationFrame(animate);
    })();
  }

  // ─── Magnetic buttons ───
  if (isFine && !prefersReduced) {
    document.querySelectorAll('.btn-glow, .btn-outline, .nav-cta').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  // ─── Nav load + scroll ───
  const nav = document.getElementById('nav');
  if (!prefersReduced) {
    setTimeout(() => nav.classList.add('loaded'), 200);
  } else {
    nav.classList.add('loaded');
  }
  let scrollTick = false;
  window.addEventListener('scroll', () => {
    if (!scrollTick) {
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 50);
        scrollTick = false;
      });
      scrollTick = true;
    }
  }, { passive: true });

  // ─── Scroll reveal ───
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // ─── Counter animation ───
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.count);
        if (isNaN(target)) return;
        const duration = 2200;
        const start = performance.now();
        (function tick(now) {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 4);
          el.textContent = Math.round(target * eased).toLocaleString();
          if (p < 1) requestAnimationFrame(tick);
        })(start);
        counterObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => counterObserver.observe(el));

  // ─── Terminal typing animation ───
  const termObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const lines = entry.target.querySelectorAll('.term-line');
        lines.forEach(line => {
          const delay = parseInt(line.dataset.delay) || 0;
          line.style.animationDelay = delay + 'ms';
        });
        termObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  const termBody = document.querySelector('.term-body');
  if (termBody) termObserver.observe(termBody);

  // ─── Score bar animation ───
  const barObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.score-fill').forEach(bar => {
          const w = bar.style.width;
          bar.style.width = '0%';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => { bar.style.width = w; });
          });
        });
        barObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  const scoreBars = document.querySelector('.score-bars');
  if (scoreBars) barObserver.observe(scoreBars);

  // ─── Smooth scroll ───
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        const offset = nav.offsetHeight + 24;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ─── Parallax-free depth: subtle scale on scroll for hero terminal ───
  if (!prefersReduced) {
    const terminal = document.querySelector('.hero-terminal');
    if (terminal) {
      window.addEventListener('scroll', () => {
        const rect = terminal.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const vh = window.innerHeight;
        const progress = Math.max(0, Math.min(1, center / vh));
        const scale = 0.96 + progress * 0.04;
        terminal.style.transform = `perspective(1000px) rotateX(${(1 - progress) * 3}deg) scale(${scale})`;
      }, { passive: true });
    }
  }

})();

// ─── Copy ───
function copy(btn) {
  const code = btn.parentElement.querySelector('code');
  navigator.clipboard.writeText(code.textContent.trim());
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  btn.style.color = '#34d399';
  setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1800);
}
