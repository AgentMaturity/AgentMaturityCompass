(function(){
'use strict';

function initReveals(){
  var els=document.querySelectorAll('.gs');
  els.forEach(function(el){ el.style.opacity='1'; el.style.transform='translateY(0)'; });

  if(typeof gsap==='undefined'||typeof ScrollTrigger==='undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.utils.toArray('.gs').forEach(function(el){
    gsap.fromTo(el,{opacity:0,y:20},{opacity:1,y:0,duration:0.45,ease:'power2.out',
      scrollTrigger:{trigger:el,start:'top 95%',toggleActions:'play none none none'}
    });
  });

  var nav=document.querySelector('.nav');
  if(nav){
    ScrollTrigger.create({start:'top -60',onUpdate:function(self){ nav.classList.toggle('scrolled',self.progress>0); }});
  }

  var bigNum=document.querySelector('.big-number-value');
  if(bigNum){
    gsap.fromTo(bigNum,{scale:0.6},{scale:1,duration:0.8,ease:'power2.out',scrollTrigger:{trigger:bigNum,start:'top 90%'}});
  }
}

var PRODUCTS=[
  {name:'amc score',title:'Score',headline:'Score trust before you ship',summary:'Evidence-weighted scoring across live execution behavior instead of brochure claims.',badges:['138 diagnostics','L0-L5 maturity','2 min baseline'],info:[{label:'what it does',title:'Calculates the trust baseline',text:'Finds maturity gaps across governance, security, reliability, cost, and state.'},{label:'why it matters',title:'Kills documentation inflation',text:'Observed evidence carries full weight. Self-reported evidence is capped.'},{label:'output',title:'Actionable trust report',text:'Ships a scored report, signed evidence bundle, and remediation targets.'}],lines:[
    {type:'code',label:'$ amc quickscore --adapter openai --evidence live-run'},
    {label:'overall maturity',value:'L3.2 · 64%'},
    {label:'security',value:'L4.0 · hardened execution'},
    {label:'governance',value:'L2.8 · approvals missing'},
    {label:'reliability',value:'L3.5 · stable with drift watch'},
    {label:'gaps found',value:'12 high-signal issues'},
    {label:'fixes generated',value:'12 mapped remediations'},
    {label:'signed artifact',value:'.amc/reports/latest.md'}
  ]},
  {name:'amc shield',title:'Shield',headline:'Attack your agent before attackers do',summary:'Runs adversarial packs against prompt injection, leakage, memory poisoning, and sycophancy.',badges:['86 assurance packs','adversarial probes','guardrail output'],info:[{label:'what it does',title:'Pressure-tests the runtime',text:'Executes attack scenarios against your actual prompt, tool, and memory surface.'},{label:'why it matters',title:'Finds brittle defenses fast',text:'One missed path can turn a polished demo into a production incident.'},{label:'output',title:'Pack report + guardrails',text:'Returns failing probes, exploit traces, and generated mitigation configs.'}],lines:[
    {type:'code',label:'$ amc shield --pack injection,exfiltration,sycophancy'},
    {label:'injection pack',value:'PASS · 12/12 probes blocked'},
    {label:'exfiltration pack',value:'WARN · 1 DLP bypass found'},
    {label:'memory poisoning',value:'PASS · persistence blocked'},
    {label:'sycophancy',value:'PASS · 8/8 resisted'},
    {label:'critical finding',value:'base64 PII escaped tool output'},
    {label:'generated fix',value:'.amc/guardrails/dlp-base64.yaml'},
    {label:'report',value:'.amc/shield/latest.md'}
  ]},
  {name:'amc enforce',title:'Enforce',headline:'Wrap agent actions in policy',summary:'Approval gates, scoped permissions, and runtime controls for sensitive operations.',badges:['policy engine','step-up auth','budget controls'],info:[{label:'what it does',title:'Constrains dangerous actions',text:'Puts hard rules around delete, send, deploy, spend, and prod access.'},{label:'why it matters',title:'Trust without enforcement is theater',text:'Policies must bite at runtime, not live as dead docs in a repo.'},{label:'output',title:'Enforced runtime config',text:'Applies governance rules that your operator and auditor can inspect.'}],lines:[
    {type:'code',label:'$ amc enforce --policy strict --require-approval delete,send'},
    {label:'policy profile',value:'strict'},
    {label:'approval gates',value:'delete · send · deploy'},
    {label:'scope limits',value:'read-only on /prod/*'},
    {label:'budget cap',value:'$2.50 per run'},
    {label:'active rules',value:'14 runtime controls'},
    {label:'step-up auth',value:'enabled on sensitive actions'},
    {label:'config',value:'.amc/enforce/policy.yaml'}
  ]},
  {name:'amc vault',title:'Vault',headline:'Cryptographically prove what happened',summary:'Signs evidence, verifies ledgers, and gives auditors a tamper-evident chain of custody.',badges:['Ed25519 signing','Merkle chain','audit-ready'],info:[{label:'what it does',title:'Creates verifiable evidence',text:'Every artifact can be signed, chained, and checked independently.'},{label:'why it matters',title:'Because “trust me” is not evidence',text:'Teams need proof that survives handoffs, audits, and disputes.'},{label:'output',title:'Evidence chain + signatures',text:'Produces a ledger with hashes, proofs, and verification metadata.'}],lines:[
    {type:'code',label:'$ amc vault verify --chain .amc/evidence/'},
    {label:'chain length',value:'23 artifacts'},
    {label:'root hash',value:'a7f3c2d1...e890b4'},
    {label:'signatures',value:'23/23 valid'},
    {label:'merkle proof',value:'VERIFIED'},
    {label:'tamper check',value:'clean'},
    {label:'notary timestamp',value:'2026-03-12T18:30:00Z'},
    {label:'status',value:'auditor-ready'}
  ]},
  {name:'amc watch',title:'Watch',headline:'See trust drift before it hurts you',summary:'Monitors posture over time and surfaces anomalies, regressions, and risky changes.',badges:['drift alerts','timelines','anomaly review'],info:[{label:'what it does',title:'Tracks trust over time',text:'Continuously compares current behavior against prior baselines and thresholds.'},{label:'why it matters',title:'Most failures are regressions',text:'A safe launch can quietly rot after a few prompt or policy changes.'},{label:'output',title:'Timeline + anomaly report',text:'Shows which dimension slipped, when it changed, and why it matters.'}],lines:[
    {type:'code',label:'$ amc watch --agent prod-agent-01 --since 7d'},
    {label:'score trend',value:'L3.2 → L2.9'},
    {label:'drift alert',value:'governance dimension declining'},
    {label:'anomalies',value:'2 detected'},
    {label:'scope expansion',value:'tool permissions widened at T+3d'},
    {label:'approval bypass',value:'+12% vs baseline'},
    {label:'next action',value:'review approval gate diffs'},
    {label:'report',value:'.amc/watch/drift-7d.md'}
  ]},
  {name:'amc comply',title:'Comply',headline:'Map trust evidence to real frameworks',summary:'Turns technical evidence into regulator-readable artifacts for audits and risk reviews.',badges:['EU AI Act','ISO 42001','NIST AI RMF'],info:[{label:'what it does',title:'Builds compliance binders',text:'Maps evidence and controls to the frameworks buyers and regulators care about.'},{label:'why it matters',title:'Compliance work is mostly evidence plumbing',text:'AMC shortens the gap between tests run and proof produced.'},{label:'output',title:'Binder + gap report',text:'Exports mapped requirements, evidence references, and remediation gaps.'}],lines:[
    {type:'code',label:'$ amc comply --framework eu-ai-act,nist-rmf --output binder/'},
    {label:'EU AI Act',value:'34/41 requirements mapped'},
    {label:'NIST AI RMF',value:'28/28 covered'},
    {label:'identified gaps',value:'7 unresolved controls'},
    {label:'generated pdf',value:'binder/eu-ai-act-compliance.pdf'},
    {label:'mapping export',value:'binder/nist-rmf-mapping.pdf'},
    {label:'remediation plan',value:'binder/gap-remediation.md'},
    {label:'status',value:'review-ready'}
  ]},
  {name:'amc fleet',title:'Fleet',headline:'Govern many agents like an actual platform',summary:'Benchmarks multiple agents, compares risk posture, and enforces org-wide trust baselines.',badges:['fleet baselines','org policy','cross-agent compare'],info:[{label:'what it does',title:'Surfaces weakest links',text:'Puts every agent on one trust map so the laggards are obvious.'},{label:'why it matters',title:'Your stack fails at the weakest boundary',text:'One sloppy assistant can negate ten well-governed ones.'},{label:'output',title:'Fleet scorecard',text:'Shows per-agent maturity, threshold breaches, and policy coverage.'}],lines:[
    {type:'code',label:'$ amc fleet status --org acme-corp'},
    {label:'agents scanned',value:'12'},
    {label:'fleet average',value:'L2.9'},
    {label:'top performer',value:'prod-agent-02 · L3.5'},
    {label:'below threshold',value:'2 agents'},
    {label:'org policy',value:'strict'},
    {label:'focus area',value:'raise staging and dev assistants'},
    {label:'report',value:'.amc/fleet/acme-corp.md'}
  ]},
  {name:'amc passport',title:'Passport',headline:'Make trust portable between environments',summary:'Issues a portable, signed trust identity that can move between tools, teams, and environments.',badges:['portable identity','verifiable score','expiry controls'],info:[{label:'what it does',title:'Packages trust state',text:'Bundles score, evidence, validity window, and signature into a portable credential.'},{label:'why it matters',title:'Trust should travel with the agent',text:'Handoffs break when context and evidence get lost between systems.'},{label:'output',title:'Signed passport artifact',text:'Exports a machine-readable trust document with expiry and verification data.'}],lines:[
    {type:'code',label:'$ amc passport issue --agent prod-agent-01'},
    {label:'agent',value:'prod-agent-01'},
    {label:'verified score',value:'L3.2'},
    {label:'evidence set',value:'23 chained artifacts'},
    {label:'valid until',value:'2026-04-12'},
    {label:'passport id',value:'ppt_a7f3c2d1e890b4'},
    {label:'signature',value:'Ed25519 verifiable'},
    {label:'artifact',value:'.amc/passport/prod-agent-01.json'}
  ]}
];

var currentProduct=0,cycleTimer=null;

function renderProduct(idx){
  var p=PRODUCTS[idx];
  var body=document.getElementById('product-term');
  var info=document.getElementById('product-info');
  var title=document.getElementById('term-title');
  var headline=document.getElementById('product-headline');
  var summary=document.getElementById('product-summary');
  var badges=document.getElementById('product-badges');
  if(!body||!p) return;

  document.querySelectorAll('.product-tab').forEach(function(t,i){t.classList.toggle('active',i===idx)});
  if(title) title.textContent=p.name;
  if(headline) headline.textContent=p.headline||p.title;
  if(summary) summary.textContent=p.summary||'';
  if(badges) badges.innerHTML=(p.badges||[]).map(function(b){return '<span class="product-badge">'+b+'</span>';}).join('');
  if(info) info.innerHTML='<div class="product-info-grid">'+(p.info||[]).map(function(card){
    return '<div class="product-info-card"><span>'+card.label+'</span><strong>'+card.title+'</strong><p>'+card.text+'</p></div>';
  }).join('')+'</div>';

  body.innerHTML=(p.lines||[]).map(function(line){
    if(line.type==='code') return '<div class="terminal-code">'+line.label+'</div>';
    return '<div class="terminal-line"><span class="terminal-label">'+line.label+'</span><span class="terminal-value">'+line.value+'</span></div>';
  }).join('');
}

function startCycle(){
  if(cycleTimer) clearInterval(cycleTimer);
  cycleTimer=setInterval(function(){
    currentProduct=(currentProduct+1)%PRODUCTS.length;
    renderProduct(currentProduct);
  },5000);
}

function initProducts(){
  var tabs=document.getElementById('product-tabs');
  if(!tabs) return;
  tabs.addEventListener('click',function(e){
    var btn=e.target.closest('.product-tab');
    if(!btn) return;
    currentProduct=parseInt(btn.dataset.idx,10);
    renderProduct(currentProduct);
    startCycle();
  });
  renderProduct(0);
  if('IntersectionObserver' in window){
    var obs=new IntersectionObserver(function(entries){
      if(entries[0] && entries[0].isIntersecting){startCycle();obs.disconnect();}
    },{threshold:0.2});
    obs.observe(tabs);
  }
}

function initFAQ(){
  document.querySelectorAll('.faq-q').forEach(function(btn){
    btn.addEventListener('click',function(){
      var item=btn.closest('.faq-item');
      var was=item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function(o){
        o.classList.remove('open');
        var q=o.querySelector('.faq-q');
        if(q) q.setAttribute('aria-expanded','false');
      });
      if(!was){ item.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
    });
  });
}

function initAnchors(){
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click',function(e){
      var id=a.getAttribute('href');
      if(id==='#') return;
      var target=document.querySelector(id);
      if(!target) return;
      e.preventDefault();
      target.scrollIntoView({behavior:'smooth',block:'start'});
      var mob=document.querySelector('.nav-mobile');
      if(mob) mob.classList.remove('open');
    });
  });
}

function initMobileNav(){
  var btn=document.querySelector('.nav-hamburger');
  var mob=document.querySelector('.nav-mobile');
  if(!btn||!mob) return;
  btn.addEventListener('click',function(){ mob.classList.toggle('open'); });
}

function init(){
  initProducts();
  initReveals();
  initFAQ();
  initAnchors();
  initMobileNav();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){ if(typeof ScrollTrigger!=='undefined') ScrollTrigger.refresh(); });

})();
