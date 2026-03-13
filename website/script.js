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
  {
    name:'amc score',
    headline:'Score trust before you ship',
    summary:'Evidence-weighted scoring across live execution behavior instead of brochure claims.',
    info:[
      {label:'what it does',title:'Calculates the trust baseline',text:'Finds maturity gaps across governance, security, reliability, cost, and state.'},
      {label:'why it matters',title:'Kills documentation inflation',text:'Observed evidence carries full weight. Self-reported evidence is capped.'},
      {label:'output',title:'Actionable trust report',text:'Ships a scored report, signed evidence bundle, and remediation targets.'}
    ],
    panels:[
      {title:'Latency',kicker:'execution monitor',body:'anthropic/opus-4-6 .......... 241ms\nopenai/gpt-5.4 ............. 186ms\ngemini/3.1-pro ............. 214ms\nopenclaw relay ............. 119ms\ncache hit ratio ............ 50%',foot:'Optimized for fast evidence collection and low-friction runtime scoring.'},
      {title:'Coverage',kicker:'diagnostic matrix',body:'governance .................. 28\nsecurity .................... 31\nreliability ................. 24\ncost ......................... 19\nstate portability ........... 36',foot:'Maps score depth across the full trust surface instead of a toy checklist.'},
      {title:'Execution',kicker:'scoring pipeline',body:'1  ingest live run traces\n2  weight observed evidence\n3  compare against maturity rubric\n4  emit signed remediation set\n5  publish trust report',foot:'Turns agent behavior into an auditable trust baseline in one pass.'},
      {title:'Safeguard',kicker:'evidence controls',body:'self-report cap ............ 0.4x\nobserved execution ......... 1.0x\nsigned receipt chain ....... on\napproval gates ............. optional\nmerkle ledger .............. verified',foot:'Prevents polished documentation from outranking real-world execution evidence.'}
    ]
  },
  {
    name:'amc shield',
    headline:'Attack your agent before attackers do',
    summary:'Runs adversarial packs against prompt injection, leakage, memory poisoning, and sycophancy.',
    info:[
      {label:'what it does',title:'Pressure-tests the runtime',text:'Executes attack scenarios against your actual prompt, tool, and memory surface.'},
      {label:'why it matters',title:'Finds brittle defenses fast',text:'One missed path can turn a polished demo into a production incident.'},
      {label:'output',title:'Pack report + guardrails',text:'Returns failing probes, exploit traces, and generated mitigation configs.'}
    ],
    panels:[
      {title:'Injection',kicker:'adversarial pack',body:'pair jailbreaks ............ blocked\npromptware payloads ........ blocked\nindirect web injection ..... blocked\nencoded prompt chain ....... blocked\nmemory poisoning ........... blocked',foot:'Directly pressure-tests real attack paths instead of relying on static policy claims.'},
      {title:'Leakage',kicker:'exfiltration probes',body:'tool output leak ........... warned\nbase64 pii path ............ found\nclipboard exfiltration ..... clean\nsecret fetch chain ......... clean\nnetwork callback ........... blocked',foot:'Surfaces the exact place sensitive data can still slip through.'},
      {title:'Behavior',kicker:'alignment check',body:'sycophancy score ........... pass\nover-compliance ............ pass\nrole confusion ............. pass\nauthority spoofing ......... pass\nescalation drift ........... pass',foot:'Checks whether the runtime stays firm under manipulation and pressure.'},
      {title:'Output',kicker:'guardrail generation',body:'pack status ................ warn\nmitigation file ............ generated\nregression replay .......... ready\ntrace bundle ............... saved\nreview gate ................ enabled',foot:'Generates a concrete fix path the team can ship immediately.'}
    ]
  },
  {
    name:'amc enforce',
    headline:'Wrap agent actions in policy',
    summary:'Approval gates, scoped permissions, and runtime controls for sensitive operations.',
    info:[
      {label:'what it does',title:'Constrains dangerous actions',text:'Puts hard rules around delete, send, deploy, spend, and prod access.'},
      {label:'why it matters',title:'Trust without enforcement is theater',text:'Policies must bite at runtime, not live as dead docs in a repo.'},
      {label:'output',title:'Enforced runtime config',text:'Applies governance rules that your operator and auditor can inspect.'}
    ],
    panels:[
      {title:'Policy',kicker:'runtime profile',body:'profile .................... strict\nsensitive actions .......... gated\nscope limits ............... /prod read-only\nbudget ceiling ............. $2.50\nsession controls ........... active',foot:'Turns governance into runtime behavior instead of a dead checklist.'},
      {title:'Approvals',kicker:'human checkpoints',body:'delete requests ............ approval\nsend actions ............... approval\ndeploy actions ............. approval\nprivilege step-up .......... enabled\naudit log .................. on',foot:'Lets teams keep humans in the loop only where it actually matters.'},
      {title:'Boundaries',kicker:'permission model',body:'tool allowlist ............. enforced\nfilesystem scope ........... constrained\nnetwork policy ............. filtered\nsecret paths ............... blocked\nunsafe write paths ......... denied',foot:'Reduces the blast radius of one bad prompt or one sloppy workflow.'},
      {title:'Artifact',kicker:'policy output',body:'runtime config ............. policy.yaml\nactive rules ............... 14\nchange review .............. tracked\nstep-up mode ............... enabled\noperator override .......... explicit',foot:'Outputs a policy artifact operators and auditors can both inspect.'}
    ]
  },
  {
    name:'amc vault',
    headline:'Cryptographically prove what happened',
    summary:'Signs evidence, verifies ledgers, and gives auditors a tamper-evident chain of custody.',
    info:[
      {label:'what it does',title:'Creates verifiable evidence',text:'Every artifact can be signed, chained, and checked independently.'},
      {label:'why it matters',title:'Because “trust me” is not evidence',text:'Teams need proof that survives handoffs, audits, and disputes.'},
      {label:'output',title:'Evidence chain + signatures',text:'Produces a ledger with hashes, proofs, and verification metadata.'}
    ],
    panels:[
      {title:'Ledger',kicker:'evidence chain',body:'artifacts .................. 23\nroot hash .................. a7f3c2d1...e890b4\nappend mode ................ immutable\nnotary stamp ............... present\nchain state ................ healthy',foot:'Preserves a tamper-evident record of what the agent actually did.'},
      {title:'Signatures',kicker:'cryptographic proof',body:'ed25519 signatures ......... 23/23\nverification ............... valid\nkey rotation ............... supported\nreceipt bundling ........... enabled\nproof export ............... ready',foot:'Lets outside reviewers verify your evidence without trusting your story.'},
      {title:'Integrity',kicker:'tamper checks',body:'merkle proof ............... verified\nmutation scan .............. clean\nfile drift ................. none\nmissing receipt ............ none\nledger replay .............. pass',foot:'Makes retroactive edits obvious instead of invisible.'},
      {title:'Audit',kicker:'review package',body:'auditor mode ............... ready\nchain export ............... generated\nverification log ........... saved\nreview note ................ attached\nstatus ..................... pass',foot:'Packages the proof trail into something a buyer or auditor can actually use.'}
    ]
  },
  {
    name:'amc watch',
    headline:'See trust drift before it hurts you',
    summary:'Monitors posture over time and surfaces anomalies, regressions, and risky changes.',
    info:[
      {label:'what it does',title:'Tracks trust over time',text:'Continuously compares current behavior against prior baselines and thresholds.'},
      {label:'why it matters',title:'Most failures are regressions',text:'A safe launch can quietly rot after a few prompt or policy changes.'},
      {label:'output',title:'Timeline + anomaly report',text:'Shows which dimension slipped, when it changed, and why it matters.'}
    ],
    panels:[
      {title:'Trend',kicker:'7-day posture',body:'day 1 ...................... L3.2\nday 3 ...................... L3.1\nday 5 ...................... L3.0\nday 7 ...................... L2.9\ndirection .................. down',foot:'Shows the slow decay that most teams miss until something breaks.'},
      {title:'Anomalies',kicker:'runtime alerts',body:'anomalies found ............ 2\npermission expansion ....... yes\napproval bypass ............ +12%\ncontext drift .............. medium\nalert level ................ elevated',foot:'Flags behavioral changes before they become incidents or customer pain.'},
      {title:'Timeline',kicker:'event log',body:'T+1d baseline captured\nT+3d tool scope widened\nT+5d bypass rate increased\nT+6d governance score fell\nT+7d alert emitted',foot:'Makes the regression legible enough to debug, not just alarming.'},
      {title:'Action',kicker:'next remediation',body:'diff approvals ............. pending\nreview prompts ............. pending\nrestore baseline ........... queued\nnotify operator ............ yes\nreport path ................ saved',foot:'Connects monitoring to concrete follow-up instead of passive dashboards.'}
    ]
  },
  {
    name:'amc comply',
    headline:'Map trust evidence to real frameworks',
    summary:'Turns technical evidence into regulator-readable artifacts for audits and risk reviews.',
    info:[
      {label:'what it does',title:'Builds compliance binders',text:'Maps evidence and controls to the frameworks buyers and regulators care about.'},
      {label:'why it matters',title:'Compliance work is mostly evidence plumbing',text:'AMC shortens the gap between tests run and proof produced.'},
      {label:'output',title:'Binder + gap report',text:'Exports mapped requirements, evidence references, and remediation gaps.'}
    ],
    panels:[
      {title:'Frameworks',kicker:'mapping targets',body:'eu ai act .................. 34/41\nnist ai rmf ................ 28/28\niso 42001 .................. ready\nsoc 2 ...................... supported\ncustom controls ............ optional',foot:'Maps technical evidence to the frameworks buyers and regulators actually ask for.'},
      {title:'Binder',kicker:'generated artifacts',body:'eu binder pdf .............. ready\nnist mapping ............... ready\ngap remediation ............ ready\ncontrol export ............. ready\nreview packet .............. ready',foot:'Turns compliance work into generated evidence instead of spreadsheet misery.'},
      {title:'Gaps',kicker:'missing controls',body:'open controls .............. 7\narticle 9 .................. partial\narticle 13 ................. partial\narticle 15 ................. missing\nowner action ............... required',foot:'Makes unresolved obligations painfully visible before procurement does.'},
      {title:'Review',kicker:'audit workflow',body:'status ..................... review-ready\ntrace links ................ attached\ncitations .................. included\nexport path ................ binder/\nshare mode ................. internal',foot:'Packages the story with enough proof for real legal, risk, or audit review.'}
    ]
  },
  {
    name:'amc fleet',
    headline:'Govern many agents like an actual platform',
    summary:'Benchmarks multiple agents, compares risk posture, and enforces org-wide trust baselines.',
    info:[
      {label:'what it does',title:'Surfaces weakest links',text:'Puts every agent on one trust map so the laggards are obvious.'},
      {label:'why it matters',title:'Your stack fails at the weakest boundary',text:'One sloppy assistant can negate ten well-governed ones.'},
      {label:'output',title:'Fleet scorecard',text:'Shows per-agent maturity, threshold breaches, and policy coverage.'}
    ],
    panels:[
      {title:'Overview',kicker:'fleet status',body:'agents scanned ............. 12\nfleet average .............. L2.9\npolicy mode ................ strict\nthreshold breaches ......... 2\nbenchmark run .............. complete',foot:'Gives operators one view across the entire multi-agent estate.'},
      {title:'Topline',kicker:'compare agents',body:'prod-agent-02 .............. L3.5\nprod-agent-01 .............. L3.2\nstaging-bot ................ L2.1\ndev-assistant .............. L1.8\nspread ..................... wide',foot:'Makes it obvious which agents are carrying risk for the whole stack.'},
      {title:'Policy',kicker:'org controls',body:'global baseline ............ L2.5\nstrict mode ................ enabled\noutlier flagging ........... on\ndelegation graph ........... tracked\nauto-review ................ optional',foot:'Lets teams enforce shared standards instead of babysitting one agent at a time.'},
      {title:'Focus',kicker:'next steps',body:'raise staging .............. yes\nraise dev assistant ........ yes\nretest after fixes ......... yes\npublish scorecard .......... ready\nreport path ................ saved',foot:'Converts comparison into a remediation queue the org can actually execute.'}
    ]
  },
  {
    name:'amc passport',
    headline:'Make trust portable between environments',
    summary:'Issues a portable, signed trust identity that can move between tools, teams, and environments.',
    info:[
      {label:'what it does',title:'Packages trust state',text:'Bundles score, evidence, validity window, and signature into a portable credential.'},
      {label:'why it matters',title:'Trust should travel with the agent',text:'Handoffs break when context and evidence get lost between systems.'},
      {label:'output',title:'Signed passport artifact',text:'Exports a machine-readable trust document with expiry and verification data.'}
    ],
    panels:[
      {title:'Identity',kicker:'portable trust',body:'agent id ................... prod-agent-01\nverified level ............. L3.2\npassport id ................ ppt_a7f3c2d1e890b4\nissuer ..................... AMC\nstate ...................... valid',foot:'Packages trust into a portable identity instead of trapping it in one tool.'},
      {title:'Evidence',kicker:'credential backing',body:'evidence set ............... 23 artifacts\nchain verification ......... pass\nsignature type ............. Ed25519\nissue date ................. 2026-03-12\nexpiry window .............. 30 days',foot:'Keeps the credential anchored to actual evidence rather than vibes.'},
      {title:'Transfer',kicker:'environment handoff',body:'export format .............. json\nverification path .......... builtin\ncross-env use .............. yes\nshare scope ................ configurable\nrevocation ................. supported',foot:'Makes handoffs between teams and environments much less stupid.'},
      {title:'Artifact',kicker:'passport output',body:'output path ................ .amc/passport/\nreview mode ................. enabled\nconsumer check .............. ready\naudit use ................... supported\nstatus ...................... issued',foot:'Creates a portable trust artifact that can survive deployment boundaries.'}
    ]
  }
];

function renderProductGrid(){
  var grid=document.getElementById('product-grid');
  if(!grid) return;
  grid.innerHTML=PRODUCTS.map(function(p){
    var info=(p.info||[]).map(function(card){
      return '<div class="product-info-card"><span>'+card.label+'</span><strong>'+card.title+'</strong><p>'+card.text+'</p></div>';
    }).join('');
    var panel=(p.panels||[]).map(function(section){
      return '<article class="terminal-panel">'
        + '<div class="terminal-panel-head"><span class="terminal-kicker">'+section.kicker+'</span><h4>'+section.title+'</h4></div>'
        + '<div class="terminal-code">'+section.body+'</div>'
        + '<div class="terminal-panel-foot">'+section.foot+'</div>'
        + '</article>';
    }).join('');
    return '<article class="product-terminal gs">'
      + '<div class="terminal-bar"><div class="terminal-dot r"></div><div class="terminal-dot y"></div><div class="terminal-dot g"></div><div class="terminal-title">'+p.name+'</div></div>'
      + '<div class="terminal-body">'+panel+'</div>'
      + '<div class="product-info"><div class="product-info-grid">'+info+'</div></div>'
      + '</article>';
  }).join('');
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
  renderProductGrid();
  initReveals();
  initFAQ();
  initAnchors();
  initMobileNav();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
else init();
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){ if(typeof ScrollTrigger!=='undefined') ScrollTrigger.refresh(); });

})();
