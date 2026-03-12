(function(){
'use strict';

// ─── GSAP SCROLL REVEALS — fast, no lag ───
function initReveals(){
  if(typeof gsap==='undefined'||typeof ScrollTrigger==='undefined')return;
  gsap.registerPlugin(ScrollTrigger);

  // Instant reveal — no stagger lag, just fade in fast
  gsap.utils.toArray('.gs').forEach(function(el){
    gsap.to(el,{opacity:1,y:0,duration:0.45,ease:'power2.out',
      scrollTrigger:{trigger:el,start:'top 95%',toggleActions:'play none none none'}
    });
  });

  // Nav background on scroll
  var nav=document.querySelector('.nav');
  ScrollTrigger.create({start:'top -60',onUpdate:function(self){
    nav.classList.toggle('scrolled',self.progress>0);
  }});

  // Big number scale
  var bigNum=document.querySelector('.big-number-value');
  if(bigNum){
    gsap.fromTo(bigNum,{scale:0.6},{scale:1,duration:0.8,ease:'power2.out',scrollTrigger:{trigger:bigNum,start:'top 90%'}});
  }
}

// ─── PRODUCT TERMINAL SHOWCASE (QT Capital style) ───
var PRODUCTS=[
  {name:'amc score',title:'Score',desc:'Evidence-weighted trust scoring. <span class="hl">138 diagnostics</span> against execution behavior. L0 to L5 maturity. Self-reported claims capped at 0.4× weight.',lines:[
    '<span style="color:#4AEF79">$</span> amc quickscore --adapter openai',
    '<span style="color:#94B0BF">⠋ Running 138 diagnostics against execution evidence...</span>','',
    '  Overall:    <span style="color:#4AEF79;font-weight:700">L3.2</span>  ████████████░░░░  <span style="color:#4AEF79">64%</span>',
    '  Security:   <span style="color:#4AEF79;font-weight:700">L4.0</span>  ██████████████░░  <span style="color:#4AEF79">80%</span>',
    '  Governance: <span style="color:#febc2e;font-weight:700">L2.8</span>  ████████████░░░░  <span style="color:#febc2e">56%</span>',
    '  Reliability:<span style="color:#4AEF79;font-weight:700"> L3.5</span>  █████████████░░░  <span style="color:#4AEF79">70%</span>','',
    '  Gaps: <span style="color:#febc2e;font-weight:700">12</span>  |  Fixes: <span style="color:#4AEF79;font-weight:700">12</span>  |  Time: <span style="color:#fff">1m 47s</span>',
    '<span style="color:#4AEF79">✓</span> Report: .amc/reports/latest.md',
    '<span style="color:#4AEF79">✓</span> Signed: Ed25519 (0b20f1fa...)'
  ]},
  {name:'amc shield',title:'Shield',desc:'<span class="hl">86 adversarial assurance packs</span>. Prompt injection, exfiltration, context leakage, sycophancy, over-compliance, memory poisoning, and more.',lines:[
    '<span style="color:#4AEF79">$</span> amc shield --pack injection,exfiltration,sycophancy',
    '<span style="color:#94B0BF">⠋ Running 3 assurance packs (86 available)...</span>','',
    '  injection:      <span style="color:#4AEF79">PASS</span>  12/12 probes blocked',
    '  exfiltration:   <span style="color:#febc2e">WARN</span>  1 DLP bypass found',
    '  sycophancy:     <span style="color:#4AEF79">PASS</span>  8/8 challenges held','',
    '  <span style="color:#febc2e">⚠ DLP bypass: base64-encoded PII in tool output</span>',
    '  <span style="color:#94B0BF">→ Guardrail generated: .amc/guardrails/dlp-base64.yaml</span>','',
    '<span style="color:#4AEF79">✓</span> Shield report: .amc/shield/latest.md'
  ]},
  {name:'amc enforce',title:'Enforce',desc:'Policy controls, approval workflows, scoped actions, and <span class="hl">governance gates</span> for higher-trust environments and regulated deployments.',lines:[
    '<span style="color:#4AEF79">$</span> amc enforce --policy strict --require-approval delete,send',
    '<span style="color:#94B0BF">⠋ Applying policy to agent runtime...</span>','',
    '  Policy:       <span style="color:#4AEF79">strict</span>',
    '  Approval gates: <span style="color:#fff">delete, send, deploy</span>',
    '  Scope limits:   <span style="color:#fff">read-only on /prod/*</span>',
    '  Budget cap:     <span style="color:#fff">$2.50/run</span>','',
    '  <span style="color:#4AEF79">✓</span> 14 governance rules active',
    '  <span style="color:#4AEF79">✓</span> Step-up auth on sensitive actions',
    '<span style="color:#4AEF79">✓</span> Enforce config: .amc/enforce/policy.yaml'
  ]},
  {name:'amc vault',title:'Vault',desc:'<span class="hl">Ed25519 signatures</span>, Merkle-tree evidence chains, tamper-evident ledgers. Every artifact is cryptographically verifiable.',lines:[
    '<span style="color:#4AEF79">$</span> amc vault verify --chain .amc/evidence/',
    '<span style="color:#94B0BF">⠋ Verifying evidence chain (23 artifacts)...</span>','',
    '  Chain length:  <span style="color:#fff">23 artifacts</span>',
    '  Root hash:     <span style="color:#4AEF79">a7f3c2d1...e890b4</span>',
    '  Signatures:    <span style="color:#4AEF79">23/23 valid</span> (Ed25519)',
    '  Merkle proof:  <span style="color:#4AEF79">VERIFIED</span>','',
    '  Tamper check:  <span style="color:#4AEF79">CLEAN</span> — no modifications detected',
    '  Notary:        <span style="color:#4AEF79">SIGNED</span> 2026-03-12T18:30:00Z',
    '<span style="color:#4AEF79">✓</span> Evidence chain verified and auditor-ready'
  ]},
  {name:'amc watch',title:'Watch',desc:'Traces, anomalies, timelines, and <span class="hl">drift detection</span>. Continuous monitoring of agent trust posture.',lines:[
    '<span style="color:#4AEF79">$</span> amc watch --agent prod-agent-01 --since 7d',
    '<span style="color:#94B0BF">⠋ Analyzing 7-day trust posture...</span>','',
    '  Score trend:   L3.2 → L3.1 → <span style="color:#febc2e">L2.9</span> (↓0.3)',
    '  Drift alert:   <span style="color:#febc2e">governance dimension declining</span>',
    '  Anomalies:     <span style="color:#fff">2 detected</span>','',
    '  <span style="color:#febc2e">⚠ Tool permission scope expanded at T+3d</span>',
    '  <span style="color:#febc2e">⚠ Approval bypass rate increased 12%</span>','',
    '<span style="color:#4AEF79">✓</span> Watch report: .amc/watch/drift-7d.md'
  ]},
  {name:'amc comply',title:'Comply',desc:'Map evidence to <span class="hl">EU AI Act, ISO 42001, NIST AI RMF, SOC 2</span>. Generate audit binders in one command.',lines:[
    '<span style="color:#4AEF79">$</span> amc comply --framework eu-ai-act,nist-rmf --output binder/',
    '<span style="color:#94B0BF">⠋ Mapping evidence to regulatory frameworks...</span>','',
    '  EU AI Act:     <span style="color:#febc2e">34/41</span> requirements mapped',
    '  NIST AI RMF:   <span style="color:#4AEF79">28/28</span> functions covered',
    '  Gaps found:    <span style="color:#febc2e">7</span> (EU AI Act Art. 9, 13, 15)','',
    '  Generated: binder/eu-ai-act-compliance.pdf',
    '  Generated: binder/nist-rmf-mapping.pdf',
    '  Generated: binder/gap-remediation.md',
    '<span style="color:#4AEF79">✓</span> Audit binder ready for review'
  ]},
  {name:'amc fleet',title:'Fleet',desc:'Compare, benchmark, and govern <span class="hl">multiple agents</span>. Delegation graphs, trust baselines, org-wide policy.',lines:[
    '<span style="color:#4AEF79">$</span> amc fleet status --org acme-corp',
    '<span style="color:#94B0BF">⠋ Scanning fleet (12 agents)...</span>','',
    '  prod-agent-01:  <span style="color:#4AEF79">L3.2</span>  ████████████░░░░',
    '  prod-agent-02:  <span style="color:#4AEF79">L3.5</span>  █████████████░░░',
    '  staging-bot:    <span style="color:#febc2e">L2.1</span>  ████████░░░░░░░░',
    '  dev-assistant:  <span style="color:#febc2e">L1.8</span>  ███████░░░░░░░░░','',
    '  Fleet average:  <span style="color:#4AEF79">L2.9</span>  |  Policy: <span style="color:#4AEF79">strict</span>',
    '  Below threshold: <span style="color:#febc2e">2 agents</span> (require L2.5+)',
    '<span style="color:#4AEF79">✓</span> Fleet report: .amc/fleet/acme-corp.md'
  ]},
  {name:'amc passport',title:'Passport',desc:'<span class="hl">Portable identity</span>, credentials, and trust portability. Carry verified trust scores between environments.',lines:[
    '<span style="color:#4AEF79">$</span> amc passport issue --agent prod-agent-01',
    '<span style="color:#94B0BF">⠋ Generating trust passport...</span>','',
    '  Agent:       <span style="color:#fff">prod-agent-01</span>',
    '  Score:       <span style="color:#4AEF79">L3.2</span> (verified 2026-03-12)',
    '  Evidence:    <span style="color:#fff">23 artifacts, chain verified</span>',
    '  Expiry:      <span style="color:#fff">2026-04-12 (30d)</span>','',
    '  Passport ID: <span style="color:#4AEF79">ppt_a7f3c2d1e890b4</span>',
    '  Signature:   Ed25519 (verifiable)',
    '<span style="color:#4AEF79">✓</span> Passport: .amc/passport/prod-agent-01.json'
  ]}
];

var currentProduct=0,cycleTimer=null;

function renderProduct(idx){
  var p=PRODUCTS[idx];
  var body=document.getElementById('product-term');
  var info=document.getElementById('product-info');
  var title=document.getElementById('term-title');
  if(!body)return;

  // Update tabs
  document.querySelectorAll('.product-tab').forEach(function(t,i){t.classList.toggle('active',i===idx)});
  title.textContent=p.name;
  info.innerHTML='<p>'+p.desc+'</p>';

  // Render terminal lines instantly (no lag)
  body.innerHTML=p.lines.map(function(l){return '<div>'+(l||'&nbsp;')+'</div>'}).join('');
}

function startCycle(){
  if(cycleTimer)clearInterval(cycleTimer);
  cycleTimer=setInterval(function(){
    currentProduct=(currentProduct+1)%PRODUCTS.length;
    renderProduct(currentProduct);
  },5000);
}

function initProducts(){
  var tabs=document.getElementById('product-tabs');
  if(!tabs)return;
  tabs.addEventListener('click',function(e){
    var btn=e.target.closest('.product-tab');
    if(!btn)return;
    currentProduct=parseInt(btn.dataset.idx);
    renderProduct(currentProduct);
    startCycle(); // reset timer
  });
  renderProduct(0);
  // Start auto-cycle when visible
  var obs=new IntersectionObserver(function(entries){
    if(entries[0].isIntersecting){startCycle();obs.disconnect()}
  },{threshold:0.2});
  obs.observe(tabs);
}

// ─── FAQ ───
function initFAQ(){
  document.querySelectorAll('.faq-q').forEach(function(btn){
    btn.addEventListener('click',function(){
      var item=btn.closest('.faq-item');
      var was=item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function(o){o.classList.remove('open');o.querySelector('.faq-q').setAttribute('aria-expanded','false')});
      if(!was){item.classList.add('open');btn.setAttribute('aria-expanded','true')}
    });
  });
}

// ─── SMOOTH ANCHORS ───
function initAnchors(){
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click',function(e){
      var id=a.getAttribute('href');if(id==='#')return;
      var target=document.querySelector(id);if(!target)return;
      e.preventDefault();
      target.scrollIntoView({behavior:'smooth',block:'start'});
      document.querySelector('.nav-mobile')?.classList.remove('open');
    });
  });
}

// ─── MOBILE NAV ───
function initMobileNav(){
  var btn=document.querySelector('.nav-hamburger');
  var mob=document.querySelector('.nav-mobile');
  if(!btn||!mob)return;
  btn.addEventListener('click',function(){mob.classList.toggle('open')});
}

// ─── INIT ───
function init(){
  initReveals();
  initProducts();
  initFAQ();
  initAnchors();
  initMobileNav();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){if(typeof ScrollTrigger!=='undefined')ScrollTrigger.refresh()});

})();
