/* AMC v5 — OSE-inspired. Minimal JS. */

// ─── SCROLL PROGRESS BAR ───
(function(){
  var bar=document.querySelector('.scroll-bar');
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
    if(s>200&&s>last) nav.classList.add('hidden');
    else nav.classList.remove('hidden');
    last=s;
  },{passive:true});
})();

// ─── MOBILE NAV ───
(function(){
  var btn=document.querySelector('.nav-hamburger');
  var mob=document.querySelector('.nav-mobile');
  if(!btn||!mob) return;
  btn.addEventListener('click',function(){
    mob.classList.toggle('open');
    document.body.style.overflow=mob.classList.contains('open')?'hidden':'';
  });
  mob.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click',function(){
      mob.classList.remove('open');
      document.body.style.overflow='';
    });
  });
})();

// ─── SCROLL REVEALS ───
(function(){
  var els=document.querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale');
  if(!els.length) return;

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
  },{threshold:0.08,rootMargin:'0px 0px -40px 0px'});

  els.forEach(function(el){observer.observe(el)});
})();

// ─── TERMINAL DEMO ───
(function(){
  var body=document.getElementById('terminal-body');
  if(!body) return;

  var lines=[
    {h:'<span class="t-dim">$</span> <span class="t-blue">npx</span> agent-maturity-compass <span class="t-green">quickscore</span>',d:0},
    {h:'',d:400},
    {h:'<span class="t-dim">⠋ Discovering agent capabilities...</span>',d:700},
    {h:'<span class="t-dim">⠙ Running 138 diagnostic checks...</span>',d:1300},
    {h:'<span class="t-dim">⠸ Generating evidence chains...</span>',d:1900},
    {h:'',d:2300},
    {h:'<span class="t-teal">Agent Maturity Compass</span> <span class="t-dim">v2.0</span>',d:2400},
    {h:'<span class="t-dim">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>',d:2550},
    {h:'',d:2700},
    {h:'  <span class="t-green">Overall</span>      <span style="color:#f4f4f5;font-weight:600">L3</span> <span class="t-dim">(Governed)</span>',d:2800},
    {h:'',d:2900},
    {h:'  <span class="t-dim">Safety</span>        <span class="t-bar-on">████████████████</span><span class="t-bar-off">████</span> <span class="t-green">82%</span>',d:3000},
    {h:'  <span class="t-dim">Oversight</span>     <span class="t-bar-on">██████████████</span><span class="t-bar-off">██████</span> <span class="t-green">71%</span>',d:3150},
    {h:'  <span class="t-dim">Transparency</span>  <span class="t-bar-on">███████████████████</span><span class="t-bar-off">█</span> <span class="t-green">94%</span>',d:3300},
    {h:'  <span class="t-dim">Governance</span>    <span class="t-bar-on">████████████████</span><span class="t-bar-off">████</span> <span class="t-green">79%</span>',d:3450},
    {h:'  <span class="t-dim">Evidence</span>      <span class="t-bar-on">████████████</span><span class="t-bar-off">████████</span> <span class="t-orange">58%</span>',d:3600},
    {h:'',d:3750},
    {h:'<span class="t-dim">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>',d:3850},
    {h:'  <span class="t-dim">Evidence chains:</span>  <span class="t-green">✓ 12 verified</span>  <span class="t-red">✗ 3 gaps</span>',d:4000},
    {h:'  <span class="t-dim">Run time:</span>         4.2s',d:4150},
    {h:'',d:4300},
    {h:'  <span class="t-green">Report saved → amc-report.html</span>',d:4450},
    {h:'',d:4600},
    {h:'<span class="t-dim">$</span>',d:4750}
  ];

  var fired=false;

  function renderStatic(){
    if(fired) return;
    body.innerHTML=lines.map(function(l){return '<div class="terminal-line" style="opacity:1;transform:none;animation:none">'+(l.h||'&nbsp;')+'</div>'}).join('');
  }

  function runAnim(){
    if(fired) return;
    fired=true;
    body.innerHTML='';
    lines.forEach(function(line){
      setTimeout(function(){
        var div=document.createElement('div');
        div.className='terminal-line';
        div.innerHTML=line.h||'&nbsp;';
        body.appendChild(div);
        body.scrollTop=body.scrollHeight;
      },line.d);
    });
  }

  var obs=new IntersectionObserver(function(entries){
    if(entries[0].isIntersecting){runAnim();obs.disconnect()}
  },{threshold:0.2});
  obs.observe(body);

  setTimeout(renderStatic,5000);
})();

// ─── FAQ ACCORDION ───
(function(){
  document.querySelectorAll('.faq-q').forEach(function(btn){
    btn.addEventListener('click',function(){
      var item=btn.closest('.faq-item');
      var was=item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function(o){
        o.classList.remove('open');
        o.querySelector('.faq-q').setAttribute('aria-expanded','false');
      });
      if(!was){item.classList.add('open');btn.setAttribute('aria-expanded','true')}
    });
  });
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
