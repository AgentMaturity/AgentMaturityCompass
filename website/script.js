(function(){
'use strict';

function initReveals(){
  var els=document.querySelectorAll('.gs');
  els.forEach(function(el){ el.style.opacity='1'; el.style.transform='translateY(0)'; });

  if(typeof gsap==='undefined'||typeof ScrollTrigger==='undefined'){
    // CDN unavailable (blocked network, script blocker): show everything.
    document.querySelectorAll('.gs').forEach(function(el){ el.style.opacity='1'; el.style.transform='none'; });
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({limitCallbacks:true});
  var gsEls=gsap.utils.toArray('.gs');
  // Batch reveals instead of individual ScrollTriggers
  if(gsEls.length>0){
    ScrollTrigger.batch(gsEls,{
      onEnter:function(batch){gsap.to(batch,{opacity:1,y:0,duration:0.4,ease:'power2.out',stagger:0.08});},
      start:'top 92%',
      once:true
    });
  }

  var nav=document.querySelector('.nav');
  if(nav){
    ScrollTrigger.create({start:'top -60',onUpdate:function(self){ nav.classList.toggle('scrolled',self.progress>0); }});
  }

  var bigNum=document.querySelector('.big-number-value');
  if(bigNum){
    gsap.fromTo(bigNum,{scale:0.6},{scale:1,duration:0.8,ease:'power2.out',scrollTrigger:{trigger:bigNum,start:'top 90%'}});
  }

  // AMC watermark fade out during FAQ section
  var watermark=document.querySelector('.amc-watermark');
  var faq=document.querySelector('#faq');
  if(watermark&&faq){
    gsap.to(watermark,{opacity:0,scrollTrigger:{trigger:faq,start:'top 80%',end:'top 30%',scrub:true}});
  }

  // Station card parallax stagger
  var cards=gsap.utils.toArray('.station-card');
  if(cards.length>0){
    cards.forEach(function(card,i){
      gsap.fromTo(card,
        {y:60+i*15,opacity:0},
        {y:0,opacity:1,duration:0.7,ease:'power2.out',
          scrollTrigger:{trigger:card,start:'top 95%',toggleActions:'play none none none'}
        }
      );
    });
  }
}

var PRODUCTS=[
  {name:'amc score',title:'Score',headline:'Score your agent before you ship',summary:'Scores your agent from what it actually did, not from what its documentation says.',badges:['244 default questions','264 lifecycle set','instant full score'],info:[{label:'what it does',title:'Gives you a starting score',text:'Shows where the agent is weak across governance, security, reliability, cost, proof, and state.'},{label:'why it matters',title:'Claims cannot inflate the score',text:'What AMC saw counts in full. What the agent says about itself is capped.'},{label:'output',title:'A report you can act on',text:'A scored report, a signed bundle of the records behind it, a proof status, and a list of what to fix.'}],lines:[
    {type:'code',label:'$ amc'},
    {label:'full score',value:'244 default questions · VALID'},
    {label:'lifecycle option',value:'264 questions · runtime/proof/fleet'},
    {label:'overall maturity',value:'L3.2 · 64%'},
    {label:'security',value:'L4.0 · hardened execution'},
    {label:'governance',value:'L2.8 · approvals missing'},
    {label:'reliability',value:'L3.5 · stable with drift watch'},
    {label:'gaps found',value:'12 high-signal issues'},
    {label:'fixes generated',value:'12 mapped remediations'},
    {label:'signed artifact',value:'.amc/reports/latest.md'}
  ]},
  {name:'amc shield',title:'Shield',headline:'Attack your agent before attackers do',summary:'Runs sets of attack tests, with a controlled way to confirm each finding, against prompt injection, data leaks, memory poisoning, and flattery.',badges:['registered assurance packs','authorized confirmation','safe proof'],info:[{label:'what it does',title:'Tests the agent you actually run',text:'Runs attack scenarios against your real prompts, tools, and memory.'},{label:'why it matters',title:'Finds weak defenses fast',text:'One missed path can turn a polished demo into a production incident.'},{label:'output',title:'Pack report + safe proof',text:'Lists the tests that failed, a redacted record confirming each one, and generated settings that reduce the risk.'}],lines:[
    {type:'code',label:'$ amc shield confirm run --scope sec-1 --task finding.json'},
    {label:'injection pack',value:'PASS · 12/12 probes blocked'},
    {label:'exfiltration pack',value:'WARN · 1 DLP bypass found'},
    {label:'memory poisoning',value:'PASS · persistence blocked'},
    {label:'sycophancy',value:'PASS · 8/8 resisted'},
    {label:'safe proof',value:'confirmed · raw payload omitted'},
    {label:'generated fix',value:'.amc/guardrails/dlp-base64.yaml'},
    {label:'report',value:'.amc/shield/latest.md'}
  ]},
  {name:'amc enforce',title:'Enforce',headline:'Reuse policy without losing proof',summary:'Preview one immutable action-class scope, merge rules from an existing Policy Pack, and apply only after exact confirmation.',badges:['signed policies','exact confirmation','fleet-wide scope'],info:[{label:'what it does',title:'Changes only the selected action classes',text:'Compiles a bounded scope into the existing signed Action and Approval Policies while preserving every unselected rule.'},{label:'why it matters',title:'Narrow changes need a clear blast radius',text:'Workspace policies remain fleet-wide, and stale or untrusted state fails closed before mutation.'},{label:'output',title:'Verified policy + evidence',text:'Returns candidate hashes, a content-bound compile ID, transparency proof, and a ledger receipt.'}],lines:[
    {type:'code',label:'$ amc policy scope compile release-external --pack code-agent.high'},
    {label:'scope',value:'workspace · fleet-wide'},
    {label:'action classes',value:'DEPLOY · NETWORK_EXTERNAL'},
    {label:'unselected rules',value:'preserved'},
    {label:'compile ID',value:'scope-compile-...'},
    {type:'code',label:'$ amc policy scope apply release-external --pack code-agent.high --confirm <compileId>'},
    {label:'policy signatures',value:'verified'},
    {label:'evidence',value:'transparency + ledger receipt'}
  ]},
  {name:'amc vault',title:'Vault',headline:'Show what happened, with signatures',summary:'Signs each record and links it to the one before, so an auditor can see if anything was changed or removed.',badges:['Ed25519 signing','Merkle chain','audit-ready'],info:[{label:'what it does',title:'Makes records anyone can check',text:'Every record can be signed, linked to the one before, and checked by someone else.'},{label:'why it matters',title:'Because “trust me” is not evidence',text:'Teams need proof that survives handoffs, audits, and disputes.'},{label:'output',title:'A signed chain of records',text:'A ledger (an ordered log) with hashes, proofs, and what is needed to verify it.'}],lines:[
    {type:'code',label:'$ amc vault verify --chain .amc/evidence/'},
    {label:'chain length',value:'23 artifacts'},
    {label:'root hash',value:'a7f3c2d1...e890b4'},
    {label:'signatures',value:'23/23 valid'},
    {label:'merkle proof',value:'VERIFIED'},
    {label:'tamper check',value:'clean'},
    {label:'notary timestamp',value:'2026-03-12T18:30:00Z'},
    {label:'status',value:'auditor-ready'}
  ]},
  {name:'amc watch',title:'Watch',headline:'See drift before it hurts you',summary:'Keeps watching after launch and tells you about odd behaviour, lower scores, missed service targets, and risky changes.',badges:['drift alerts','session receipts','SLO review'],info:[{label:'what it does',title:'Compares today with before',text:'Compares current behaviour with earlier runs, session receipts, and your limits for risk, cost, and speed.'},{label:'why it matters',title:'Most failures are things that used to work',text:'A good launch can quietly get worse after a few changes to prompts, routes, policies, or resources.'},{label:'output',title:'A timeline of what changed',text:'Shows which area slipped, when it changed, which session shows it, and why it matters.'}],lines:[
    {type:'code',label:'$ amc watch --agent prod-agent-01 --since 7d'},
    {label:'score trend',value:'L3.2 → L2.9'},
    {label:'session correlation',value:'complete · 18 signed refs'},
    {label:'risk/cost/latency SLO',value:'WARN · p95 latency breached'},
    {label:'drift alert',value:'governance dimension declining'},
    {label:'anomalies',value:'2 detected'},
    {label:'scope expansion',value:'tool permissions widened at T+3d'},
    {label:'approval bypass',value:'+12% vs baseline'},
    {label:'next action',value:'review approval gate diffs'},
    {label:'report',value:'.amc/watch/drift-7d.md'}
  ]},
  {name:'amc comply',title:'Comply',headline:'Line your records up with real frameworks',summary:'Turns technical records into documents an auditor or risk reviewer can read.',badges:['EU AI Act','ISO 42001','NIST AI RMF'],info:[{label:'what it does',title:'Builds a review folder (a binder)',text:'Matches your records and controls to the frameworks buyers and regulators ask about.'},{label:'why it matters',title:'Most compliance work is gathering records',text:'AMC shortens the time between running a test and having the record to show for it.'},{label:'output',title:'A binder and a list of gaps',text:'Exports each requirement, the records that support it, and what is still missing.'}],lines:[
    {type:'code',label:'$ amc comply --framework eu-ai-act,nist-rmf --output binder/'},
    {label:'EU AI Act',value:'34/41 requirements mapped'},
    {label:'NIST AI RMF',value:'28/28 covered'},
    {label:'identified gaps',value:'7 unresolved controls'},
    {label:'generated pdf',value:'binder/eu-ai-act-compliance.pdf'},
    {label:'mapping export',value:'binder/nist-rmf-mapping.pdf'},
    {label:'remediation plan',value:'binder/gap-remediation.md'},
    {label:'status',value:'review-ready'}
  ]},
  {name:'amc fleet',title:'Fleet',headline:'Manage many agents in one place',summary:'Checks how your agents are wired together, compares their risk, and applies one minimum standard across the organisation.',badges:['fleet overview','trust graph','SLO status'],info:[{label:'what it does',title:'Shows the map and its weak links',text:'Puts every agent and every handoff between agents on one map, so you can see where work could go wrong.'},{label:'why it matters',title:'Your stack fails at the weakest boundary',text:'One unsafe handoff can undo ten well-run agents.'},{label:'output',title:'Fleet scorecard + graph validation',text:'Shows per-agent maturity, graph digest, validation findings, trust graph, threshold breaches, and policy coverage.'}],lines:[
    {type:'code',label:'$ amc fleet graph validate'},
    {label:'fleet overview',value:'ready · 12 agents scored'},
    {label:'agents scanned',value:'12'},
    {label:'graph digest',value:'9d4f62c1e83a7b20'},
    {label:'fleet average',value:'L2.9'},
    {label:'top performer',value:'prod-agent-02 · L3.5'},
    {label:'graph risks',value:'1 unsafe permission'},
    {label:'org policy',value:'strict'},
    {label:'focus area',value:'tighten approval contracts'},
    {label:'trust graph',value:'mermaid export ready'},
    {label:'report',value:'.amc/fleet/acme-corp.md'}
  ]},
  {name:'amc passport',title:'Passport',headline:'Take a score with you',summary:'Issues a signed document with the agent score that can move between tools, teams, and environments.',badges:['portable identity','verifiable score','expiry controls'],info:[{label:'what it does',title:'Packs the score to travel',text:'Bundles the score, the records behind it, how long it is valid, and a signature into one file.'},{label:'why it matters',title:'A score should travel with the agent',text:'Handoffs break when context and records get lost between systems.'},{label:'output',title:'A signed passport file',text:'Exports a file a program can read, with an expiry date and what is needed to verify it.'}],lines:[
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

var currentProduct=0;

function renderProduct(idx){
  var p=PRODUCTS[idx];
  var body=document.getElementById('product-term');
  var info=document.getElementById('product-info');
  var title=document.getElementById('term-title');
  var headline=document.getElementById('product-headline');
  var summary=document.getElementById('product-summary');
  var badges=document.getElementById('product-badges');
  if(!body||!p) return;

  document.querySelectorAll('.product-tab').forEach(function(t,i){
    t.classList.toggle('active',i===idx);
    if(t.getAttribute('role')==='tab'){ t.setAttribute('aria-selected',i===idx?'true':'false'); t.tabIndex=i===idx?0:-1; }
  });
  var panel=document.getElementById('product-panel');
  if(panel) panel.setAttribute('aria-labelledby','product-tab-'+idx);
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

function initProducts(){
  var tabs=document.getElementById('product-tabs');
  if(!tabs) return;
  // The tabs change only when the reader asks: no timer moves them.
  function select(idx,focus){
    currentProduct=(idx+PRODUCTS.length)%PRODUCTS.length;
    renderProduct(currentProduct);
    if(focus){ var tab=tabs.querySelectorAll('.product-tab')[currentProduct]; if(tab) tab.focus(); }
  }
  tabs.addEventListener('click',function(e){
    var btn=e.target.closest('.product-tab');
    if(btn) select(parseInt(btn.dataset.idx,10),false);
  });
  tabs.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='ArrowDown'){ e.preventDefault(); select(currentProduct+1,true); }
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){ e.preventDefault(); select(currentProduct-1,true); }
    else if(e.key==='Home'){ e.preventDefault(); select(0,true); }
    else if(e.key==='End'){ e.preventDefault(); select(PRODUCTS.length-1,true); }
  });
  renderProduct(0);
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
      var still=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({behavior:still?'auto':'smooth',block:'start'});
      if(a.classList.contains('skip-link')){
        if(!target.hasAttribute('tabindex')) target.setAttribute('tabindex','-1');
        target.focus({preventScroll:true});
      }
      var mob=document.querySelector('.nav-mobile');
      if(mob) mob.classList.remove('open');
    });
  });
}

function initMobileNav(){
  var btn=document.querySelector('.nav-hamburger');
  var mob=document.querySelector('.nav-mobile');
  if(!btn||!mob) return;
  if(!mob.id) mob.id='navMobile';
  btn.setAttribute('aria-controls',mob.id);
  btn.setAttribute('aria-expanded','false');
  function setOpen(open){
    mob.classList.toggle('open',open);
    btn.setAttribute('aria-expanded',open?'true':'false');
  }
  btn.addEventListener('click',function(){ setOpen(!mob.classList.contains('open')); });
  mob.addEventListener('click',function(e){ if(e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&mob.classList.contains('open')){ setOpen(false); btn.focus(); }
  });
}

function initTheme(){
  var btn=document.getElementById('themeToggle');
  if(!btn) return;

  function applyTheme(theme){
    var clean=theme==='clean';
    document.body.classList.toggle('clean-theme',clean);
    btn.setAttribute('aria-pressed',clean?'true':'false');
    btn.textContent=clean?'☀':'◐';
  }

  try{
    var saved=localStorage.getItem('amc-theme')||localStorage.getItem('theme');
    applyTheme(saved==='clean'?'clean':'terminal');
  }catch(e){
    applyTheme('terminal');
  }

  btn.addEventListener('click',function(){
    var next=document.body.classList.contains('clean-theme')?'terminal':'clean';
    applyTheme(next);
    try{ localStorage.setItem('amc-theme',next); }catch(e){}
  });
}

function init(){
  initTheme();
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
