/* AMC v4 — Evidence Forge. Clean JS. No carnival counters. */

// ─── THEME ───
(function(){
  var h=document.documentElement;
  var t=localStorage.getItem('amc-theme');
  if(t) h.setAttribute('data-theme',t);
  else h.setAttribute('data-theme','dark');
})();

function toggleTheme(){
  var h=document.documentElement;
  var next=h.getAttribute('data-theme')==='dark'?'light':'dark';
  h.setAttribute('data-theme',next);
  localStorage.setItem('amc-theme',next);
}

// ─── SCROLL PROGRESS ───
(function(){
  var bar=document.querySelector('.scroll-progress');
  if(!bar) return;
  window.addEventListener('scroll',function(){
    var h=document.documentElement.scrollHeight-window.innerHeight;
    if(h>0) bar.style.width=(window.scrollY/h*100)+'%';
  },{passive:true});
})();

// ─── NAV HIDE/SHOW ───
(function(){
  var nav=document.querySelector('.nav');
  if(!nav) return;
  var last=0;
  window.addEventListener('scroll',function(){
    var s=window.scrollY;
    if(s>200&&s>last) nav.classList.add('nav-hidden');
    else nav.classList.remove('nav-hidden');
    last=s;
  },{passive:true});
})();

// ─── MOBILE NAV ───
(function(){
  var btn=document.querySelector('.nav-hamburger');
  var mob=document.querySelector('.nav-mobile');
  if(!btn||!mob) return;
  btn.addEventListener('click',function(){
    btn.classList.toggle('open');
    mob.classList.toggle('open');
    document.body.style.overflow=mob.classList.contains('open')?'hidden':'';
  });
  mob.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click',function(){
      btn.classList.remove('open');
      mob.classList.remove('open');
      document.body.style.overflow='';
    });
  });
})();

// ─── SCROLL REVEALS (with safety fallback) ───
(function(){
  var els=document.querySelectorAll('.reveal');
  if(!els.length) return;

  // Safety: if IntersectionObserver doesn't fire within 3s, show everything
  var safety=setTimeout(function(){
    els.forEach(function(el){el.classList.add('visible')});
  },3000);

  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches){
    clearTimeout(safety);
    els.forEach(function(el){el.classList.add('visible')});
    return;
  }

  var revealed=0;
  var observer=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
        revealed++;
        if(revealed>=els.length) clearTimeout(safety);
      }
    });
  },{threshold:0.08,rootMargin:'0px 0px -20px 0px'});

  els.forEach(function(el){observer.observe(el)});
})();

// ─── STAT VALUES (instant — no carnival counters) ───
(function(){
  document.querySelectorAll('[data-target]').forEach(function(el){
    var n=parseInt(el.getAttribute('data-target'))||0;
    var suffix=el.getAttribute('data-suffix')||'';
    el.textContent=(n>=1000?n.toLocaleString():String(n))+suffix;
  });
})();

// ─── FAQ ACCORDION ───
(function(){
  document.querySelectorAll('.faq-question').forEach(function(btn){
    btn.addEventListener('click',function(){
      var item=btn.closest('.faq-item');
      var was=item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function(o){
        o.classList.remove('open');
        o.querySelector('.faq-question').setAttribute('aria-expanded','false');
      });
      if(!was){item.classList.add('open');btn.setAttribute('aria-expanded','true')}
    });
  });
})();

// ─── TERMINAL DEMO ───
(function(){
  var body=document.getElementById('terminal-body');
  if(!body) return;

  var lines=[
    {html:'<span class="term-prompt">$</span> <span class="term-command">npx</span> agent-maturity-compass <span class="term-flag">quickscore</span>',d:0},
    {html:'',d:400},
    {html:'<span class="term-dim">⠋ Discovering agent capabilities...</span>',d:700},
    {html:'<span class="term-dim">⠙ Running evidence-weighted diagnostic checks...</span>',d:1300},
    {html:'<span class="term-dim">⠸ Generating evidence chains...</span>',d:1900},
    {html:'',d:2300},
    {html:'<span class="term-teal">Agent Maturity Compass</span> <span class="term-dim">v2.0</span>',d:2400},
    {html:'<span class="term-dim">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>',d:2550},
    {html:'',d:2700},
    {html:'  <span class="term-accent">Overall Score</span>      <span style="color:#f0ede8;font-weight:600">L3</span> <span class="term-dim">(Governed)</span>',d:2800},
    {html:'',d:2900},
    {html:'  <span class="term-dim">Safety</span>            <span class="term-bar-fill">████████████████</span><span class="term-bar-empty">████</span> <span class="term-success">82%</span>',d:3000},
    {html:'  <span class="term-dim">Oversight</span>         <span class="term-bar-fill">██████████████</span><span class="term-bar-empty">██████</span> <span class="term-success">71%</span>',d:3150},
    {html:'  <span class="term-dim">Transparency</span>      <span class="term-bar-fill">███████████████████</span><span class="term-bar-empty">█</span> <span class="term-success">94%</span>',d:3300},
    {html:'  <span class="term-dim">Governance</span>        <span class="term-bar-fill">████████████████</span><span class="term-bar-empty">████</span> <span class="term-success">79%</span>',d:3450},
    {html:'  <span class="term-dim">Evidence</span>          <span class="term-bar-fill">████████████</span><span class="term-bar-empty">████████</span> <span class="term-orange">58%</span>',d:3600},
    {html:'',d:3750},
    {html:'<span class="term-dim">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>',d:3850},
    {html:'  <span class="term-dim">Evidence chains:</span>  <span class="term-success">✓ 12 verified</span>  <span class="term-red">✗ 3 gaps</span>',d:4000},
    {html:'  <span class="term-dim">Run time:</span>         <span style="color:#cdd6f4">4.2s</span>',d:4150},
    {html:'',d:4300},
    {html:'  <span class="term-success">Report saved → amc-report.html</span>',d:4450},
    {html:'',d:4600},
    {html:'<span class="term-prompt">$</span>',d:4750}
  ];

  var fired=false;

  // Also render a static version immediately as fallback
  function renderStatic(){
    if(fired) return;
    body.innerHTML=lines.map(function(l){return '<div class="terminal-line" style="opacity:1;transform:none;animation:none">'+(l.html||'&nbsp;')+'</div>'}).join('');
  }

  function runAnim(){
    if(fired) return;
    fired=true;
    body.innerHTML='';
    lines.forEach(function(line){
      setTimeout(function(){
        var div=document.createElement('div');
        div.className='terminal-line';
        div.innerHTML=line.html||'&nbsp;';
        body.appendChild(div);
        body.scrollTop=body.scrollHeight;
      },line.d);
    });
  }

  var obs=new IntersectionObserver(function(entries){
    if(entries[0].isIntersecting){runAnim();obs.disconnect()}
  },{threshold:0.2});
  obs.observe(body);

  // Safety: render static after 5s if animation never triggered
  setTimeout(renderStatic,5000);
})();

// ─── SMOOTH SCROLL ───
document.querySelectorAll('a[href^="#"]').forEach(function(a){
  a.addEventListener('click',function(e){
    var href=a.getAttribute('href');
    if(href==='#') return;
    var t=document.querySelector(href);
    if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth',block:'start'})}
  });
});
