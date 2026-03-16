// AMC Docs — Dynamic Documentation Hub
// Loads 205 markdown files from GitHub, renders with marked.js

const BASE_RAW = 'https://raw.githubusercontent.com/thewisecrab/AgentMaturityCompass/main/docs/';

// ─── Category Mapping ───
const CATEGORIES = [
  {
    name: 'Getting Started',
    icon: '🚀',
    docs: ['INDEX', 'START_HERE', 'AFTER_QUICKSCORE', 'GETTING_STARTED', 'QUICKSTART', 'INSTALL', 'INSTALL_PACKAGES', 'AGENT_GUIDE', 'SOLO_USER', 'SOLO_DEV_QUICKSTART', 'SOLO_DEV_PATH', 'PLATFORM_ENGINEER_QUICKSTART', 'PLATFORM_PATH', 'SECURITY_COMPLIANCE_QUICKSTART', 'SECURITY_PATH', 'EXECUTIVE_OVERVIEW', 'COMPATIBILITY_MATRIX', 'STARTER_BLUEPRINTS', 'OSS_ADOPTION_ROADMAP', 'BROWSER_SANDBOX', 'DEPLOYMENT_OPTIONS', 'EXAMPLES_INDEX', 'RECIPES', 'TROUBLESHOOTING']
  },
  {
    name: 'Architecture',
    icon: '🏗️',
    docs: ['ARCHITECTURE_MAP', 'API_SURFACES', 'CHAIN_ARCHITECTURE', 'CONTEXT_GRAPH', 'SYSTEM_CAPABILITIES', 'MODES', 'RUNTIMES', 'RUNTIME_SDK', 'PYTHON_MODULE_MAPPING', 'BOM']
  },
  {
    name: 'Adapters & Integration',
    icon: '🔌',
    docs: ['ADAPTERS', 'ADAPTER_COMPATIBILITY', 'agent-framework-compatibility', 'adapters/LANDING_LANGCHAIN', 'adapters/LANDING_OPENAI', 'adapters/LANDING_CREWAI', 'adapters/LANDING_CLAUDE_CODE', 'adapters/LANDING_GENERIC_CLI', 'adapters/langchain-python', 'adapters/langchain-node', 'adapters/langgraph-python', 'adapters/crewai', 'adapters/autogen', 'adapters/openai-agents-sdk', 'adapters/llamaindex', 'adapters/semantic-kernel', 'adapters/claude-code', 'adapters/gemini', 'adapters/openclaw', 'adapters/openhands', 'adapters/python-amc-sdk', 'adapters/generic-cli', 'BRIDGE', 'BRIDGE_PROMPT_ENFORCEMENT', 'CONNECT', 'INTEGRATIONS', 'integrations/ci-cd', 'MCP_SERVER', 'PAIRING', 'PAIRING_LAN_PWA', 'PROVIDERS', 'SDK', 'SDK_VERSIONING', 'CLI_WRAPPERS', 'VSCODE_EXTENSION']
  },
  {
    name: 'Scoring & Dimensions',
    icon: '📊',
    docs: ['DIAGNOSTIC_BANK', 'QUESTION_BANK', 'AMC_QUESTIONS_IN_DEPTH', 'AMC_MASTER_REFERENCE', 'ARCHETYPES', 'BENCHMARKS', 'BENCHMARKING', 'BENCH_REGISTRY', 'EQUALIZER_TARGETS', 'METRICS', 'OUTCOMES', 'FORECASTING', 'PREDICTION_LOG', 'PREDICTIVE_MAINTENANCE', 'self-calibration', 'VALIDITY_FRAMEWORK', 'score-history']
  },
  {
    name: 'Compliance & Regulatory',
    icon: '⚖️',
    docs: ['EU_AI_ACT_COMPLIANCE', 'COMPLIANCE', 'COMPLIANCE_FRAMEWORKS', 'COMPLIANCE_MAPS', 'CERTIFICATION', 'ISO_42001_ALIGNMENT', 'GDPR_ARTICLE_COMPLIANCE', 'MITRE_ATLAS_MAPPING', 'STANDARDS_MAPPING', 'ASSURANCE_CERTS', 'ASSURANCE_LAB', 'AUDIT_BINDER', 'enterprise-readiness-checklist', 'compliance/eu-ai-act-checklist', 'compliance/iso-42001-aims-manual', 'compliance/nist-rmf-profile', 'compliance/SOC2_TYPE_II_CONTROLS_MAPPING']
  },
  {
    name: 'Security',
    icon: '🔒',
    docs: ['SECURITY', 'SECURITY_ARCHITECTURE_OVERVIEW', 'SECURITY_DEPLOYMENT', 'THREAT_MODEL', 'HARDENING', 'RED_TEAMING_GUIDE', 'ANTI_HALLUCINATION', 'TRUTHGUARD', 'SHIELD_ENFORCE_REFERENCE', 'ENCRYPTION_AT_REST', 'HARDWARE_TRUST', 'ZERO_KEYS', 'VAULT', 'RBAC', 'SSO_OIDC', 'SSO_SAML', 'SCIM', 'IDENTITY', 'IDENTITY_STABILITY', 'SUPPLY_CHAIN', 'PLUGIN_SUPPLY_CHAIN', 'sbom']
  },
  {
    name: 'Governance & Policy',
    icon: '🏛️',
    docs: ['GOVERNANCE', 'COMMUNITY', 'SUPPORT_POLICY', 'MODEL_GOVERNANCE', 'GOVERNOR', 'POLICY_EXPORT', 'POLICY_PACKS', 'PROMPT_POLICY', 'APPROVALS', 'DUAL_CONTROL_APPROVALS', 'WAIVERS', 'LEASES', 'BUDGETS', 'NO_CODE_GOVERNANCE', 'VALUE_CONTRACTS', 'VALUE_GATES', 'VALUE_INGESTION', 'VALUE_REALIZATION']
  },
  {
    name: 'Operations',
    icon: '⚙️',
    docs: ['OPERATIONS', 'OPS_HARDENING', 'BACKUPS', 'DEPLOYMENT', 'DEPLOYMENT_CHECKLIST', 'MIGRATION_RUNBOOK', 'RELEASE_RUNBOOK', 'RELEASING', 'RELEASE_CADENCE', 'CI_TEMPLATES', 'SINGLE_BINARY', 'PUBLISHING', 'UPGRADE_AUTOPILOT', 'INCIDENT_RESPONSE_READINESS', 'DRIFT_ALERTS', 'CONTINUOUS_MONITORING', 'CONTINUOUS_RECURRENCE', 'DOCTOR', 'MECHANIC_MODE', 'MECHANIC_WORKBENCH', 'CI', 'runbooks/amc-service-down', 'runbooks/evidence-corruption', 'runbooks/score-dispute']
  },
  {
    name: 'Trust & Evidence',
    icon: '🔐',
    docs: ['EVIDENCE_TRUST', 'EVIDENCE_REQUESTS', 'ATTESTATION_EVIDENCE_PATHS', 'CLAIM_PROVENANCE', 'NOTARY', 'TRANSPARENCY', 'TRANSPARENCY_MERKLE', 'TRANSPARENCY_REPORT', 'RECEIPTS', 'OPEN_RUBRIC_STANDARD', 'OPEN_STANDARD', 'AGENT_PASSPORT']
  },
  {
    name: 'Product & UX',
    icon: '🎨',
    docs: ['CONSOLE', 'DASHBOARD', 'STUDIO', 'TOOLHUB', 'PLUGINS', 'SANDBOX', 'WHATIF', 'PLAYGROUND', 'DOMAIN_PACKS', 'SECTOR_PACKS', 'BUNDLES', 'CASEBOOKS', 'ORG_COMPASS', 'ORG_EOC', 'REAL_PEOPLE_COUNCIL', 'NORTHSTAR_PROMPTS', 'PRODUCT_EDITIONS', 'PRICING', 'BUYER_PACKAGES', 'SERVICES_AND_SUPPORT', 'BENCHMARK_GALLERY', 'COMMUNITY_SHOWCASE', 'RELEASE_HIGHLIGHTS', 'USE_CASES', 'PERSONAS', 'WHY_AMC']
  },
  {
    name: 'API Reference',
    icon: '📡',
    docs: ['API_REFERENCE', 'REALTIME', 'REGISTRY', 'FLEET', 'LOOP', 'TICKETS', 'WORK_ORDERS', 'EXPERIMENTS', 'FEDERATION', 'ENTERPRISE', 'ECOSYSTEM', 'ECOSYSTEM_VIEW', 'ECOSYSTEM_COMPARATIVE_VIEW', 'ECONOMIC_SIGNIFICANCE', 'db-schemas']
  },
  {
    name: 'Multi-Agent & Advanced',
    icon: '🤖',
    docs: ['MULTI_AGENT_TRUST', 'MULTI_MODEL_VALIDATION', 'AGENT_VS_WORKFLOW', 'MEMORY_MATURITY', 'CANON', 'FULL_MODULE_ROADMAP', 'INNOVATION_THESIS', 'GO_TO_MARKET_PACK', 'LAUNCH']
  },
  {
    name: 'Research',
    icon: '🔬',
    docs: ['wave4-agentic-ecosystem-audit', 'wave4-ai-safety-audit', 'wave4-documentation-audit', 'wave4-integration-audit', 'wave4-product-readiness-audit', 'wave4-regulatory-audit', 'wave4-supply-chain-audit', 'wave4-test-coverage-audit', 'RESEARCH_PAPERS_2026', 'NEW_GAPS_RESEARCH']
  },
  {
    name: 'Migration',
    icon: '🔄',
    docs: ['MIGRATION_FROM_PROMPTFOO_DEEPEVAL']
  }
];

// All known doc filenames (without .md) — 205 docs total
const ALL_DOCS = [
  'ADAPTERS','ADAPTER_COMPATIBILITY','AGENT_GUIDE','AGENT_PASSPORT','AGENT_VS_WORKFLOW',
  'AMC_MASTER_REFERENCE','AMC_QUESTIONS_IN_DEPTH','ANTI_HALLUCINATION','API_REFERENCE','API_SURFACES',
  'APPROVALS','ARCHETYPES','ARCHITECTURE_MAP','ASSURANCE_CERTS','ASSURANCE_LAB',
  'ATTESTATION_EVIDENCE_PATHS','AUDIT_BINDER','BACKUPS','BENCHMARKING','BENCHMARKS',
  'BENCH_REGISTRY','BOM','BRIDGE','BRIDGE_PROMPT_ENFORCEMENT','BUDGETS','BUNDLES',
  'CANON','CASEBOOKS','CERTIFICATION','CHAIN_ARCHITECTURE','CI','CLAIM_PROVENANCE',
  'CLI_WRAPPERS','COMPLIANCE','COMPLIANCE_FRAMEWORKS','COMPLIANCE_MAPS','CONNECT','CONSOLE','CONTEXT_GRAPH',
  'CONTINUOUS_MONITORING','CONTINUOUS_RECURRENCE','DASHBOARD','DEPLOYMENT','DEPLOYMENT_CHECKLIST','DIAGNOSTIC_BANK',
  'DOCTOR','DOMAIN_PACKS','DRIFT_ALERTS','DUAL_CONTROL_APPROVALS','ECONOMIC_SIGNIFICANCE',
  'ECOSYSTEM','ECOSYSTEM_COMPARATIVE_VIEW','ECOSYSTEM_VIEW','ENCRYPTION_AT_REST',
  'ENTERPRISE','EQUALIZER_TARGETS','EU_AI_ACT_COMPLIANCE','EVIDENCE_REQUESTS',
  'EVIDENCE_TRUST','EXECUTIVE_OVERVIEW','EXPERIMENTS','FEDERATION','FLEET','FORECASTING',
  'FULL_MODULE_ROADMAP','GDPR_ARTICLE_COMPLIANCE','GETTING_STARTED','GOVERNANCE','GOVERNOR','GO_TO_MARKET_PACK',
  'HARDWARE_TRUST','IDENTITY','IDENTITY_STABILITY','INCIDENT_RESPONSE_READINESS',
  'INNOVATION_THESIS','INSTALL','INTEGRATIONS','ISO_42001_ALIGNMENT','LAUNCH','LEASES',
  'LOOP','MCP_SERVER','MECHANIC_MODE','MECHANIC_WORKBENCH','MEMORY_MATURITY','METRICS',
  'MIGRATION_FROM_PROMPTFOO_DEEPEVAL','MIGRATION_RUNBOOK','MITRE_ATLAS_MAPPING',
  'MODEL_GOVERNANCE','MODES','MULTI_AGENT_TRUST','MULTI_MODEL_VALIDATION',
  'NEW_GAPS_RESEARCH','NORTHSTAR_PROMPTS','NOTARY','NO_CODE_GOVERNANCE','OPEN_RUBRIC_STANDARD',
  'OPEN_STANDARD','OPERATIONS','OPS_HARDENING','ORG_COMPASS','ORG_EOC','OUTCOMES',
  'PAIRING','PAIRING_LAN_PWA','PLAYGROUND','PLUGINS','PLUGIN_SUPPLY_CHAIN',
  'POLICY_EXPORT','POLICY_PACKS','PREDICTION_LOG',
  'PREDICTIVE_MAINTENANCE','PROMPT_POLICY','PROVIDERS','PUBLISHING','PYTHON_MODULE_MAPPING',
  'QUESTION_BANK','QUICKSTART','RBAC','REALTIME','REAL_PEOPLE_COUNCIL','RECEIPTS',
  'RED_TEAMING_GUIDE','REGISTRY','RELEASE_RUNBOOK','RELEASING','RESEARCH_PAPERS_2026','RUNTIMES','RUNTIME_SDK',
  'SANDBOX','SCIM','SDK','SDK_VERSIONING','SECTOR_PACKS','SECURITY',
  'SECURITY_ARCHITECTURE_OVERVIEW','SECURITY_DEPLOYMENT','SHIELD_ENFORCE_REFERENCE',
  'SOLO_USER','SSO_OIDC','SSO_SAML','STANDARDS_MAPPING','STUDIO','SUPPLY_CHAIN',
  'SYSTEM_CAPABILITIES','THREAT_MODEL','TICKETS','TOOLHUB','TRANSPARENCY',
  'TRANSPARENCY_MERKLE','TRANSPARENCY_REPORT','TRUTHGUARD','UPGRADE_AUTOPILOT',
  'VALIDITY_FRAMEWORK','VALUE_CONTRACTS','VALUE_GATES',
  'VALUE_INGESTION','VALUE_REALIZATION','VAULT','VSCODE_EXTENSION','WAIVERS',
  'WHATIF','WORK_ORDERS','ZERO_KEYS','INDEX','START_HERE','AFTER_QUICKSCORE','SOLO_DEV_PATH','PLATFORM_PATH','SECURITY_PATH','PRODUCT_EDITIONS','PRICING','COMMUNITY_SUPPORT','DEPLOYMENT_OPTIONS','EXAMPLES_INDEX','RECIPES','COMPARE_AMC','BUYER_PACKAGES','SERVICES_AND_SUPPORT','COMMUNITY_SHOWCASE','RELEASE_HIGHLIGHTS','BENCHMARK_GALLERY','COMPATIBILITY_MATRIX','STARTER_BLUEPRINTS','OSS_ADOPTION_ROADMAP','INSTALL_PACKAGES','SUPPORT_POLICY','RELEASE_CADENCE','CI_TEMPLATES','SINGLE_BINARY','BROWSER_SANDBOX','TROUBLESHOOTING','COMMUNITY','SOLO_DEV_QUICKSTART','PLATFORM_ENGINEER_QUICKSTART','SECURITY_COMPLIANCE_QUICKSTART','HARDENING','USE_CASES','PERSONAS','WHY_AMC','agent-framework-compatibility','db-schemas',
  'enterprise-readiness-checklist','sbom','score-history','self-calibration',
  'wave4-agentic-ecosystem-audit','wave4-ai-safety-audit','wave4-documentation-audit',
  'wave4-integration-audit','wave4-product-readiness-audit','wave4-regulatory-audit',
  'wave4-supply-chain-audit','wave4-test-coverage-audit',
  'adapters/autogen','adapters/claude-code','adapters/crewai','adapters/gemini',
  'adapters/generic-cli','adapters/langchain-node','adapters/langchain-python',
  'adapters/langgraph-python','adapters/llamaindex','adapters/openai-agents-sdk',
  'adapters/openclaw','adapters/openhands','adapters/python-amc-sdk','adapters/semantic-kernel',
  'compliance/eu-ai-act-checklist','compliance/iso-42001-aims-manual',
  'compliance/nist-rmf-profile','compliance/SOC2_TYPE_II_CONTROLS_MAPPING',
  'integrations/ci-cd',
  'runbooks/amc-service-down','runbooks/evidence-corruption','runbooks/score-dispute'
];

// ─── State ───
const docCache = {};
let currentDoc = null;
let searchIndex = []; // {doc, title, content}

// ─── Pretty name from filename ───
function prettyName(doc) {
  // For subdirectory docs, show "Category: Name" format
  const parts = doc.split('/');
  const basename = parts.length > 1 ? parts[parts.length - 1] : doc;
  const prefix = parts.length > 1 ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + ': ' : '';
  return prefix + basename
    .replace(/^wave4-/, 'Wave 4: ')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/Amc/g, 'AMC')
    .replace(/Api/g, 'API')
    .replace(/Sdk/g, 'SDK')
    .replace(/Cli/g, 'CLI')
    .replace(/Eu Ai/g, 'EU AI')
    .replace(/Iso/g, 'ISO')
    .replace(/Sso/g, 'SSO')
    .replace(/Oidc/g, 'OIDC')
    .replace(/Saml/g, 'SAML')
    .replace(/Scim/g, 'SCIM')
    .replace(/Rbac/g, 'RBAC')
    .replace(/Ci$/g, 'CI')
    .replace(/Mcp/g, 'MCP')
    .replace(/Bom$/g, 'BOM')
    .replace(/Ux/g, 'UX')
    .replace(/Sbom/g, 'SBOM')
    .replace(/Db /g, 'DB ')
    .replace(/Eli5/g, 'ELI5')
    .replace(/Pwa/g, 'PWA')
    .replace(/Lan /g, 'LAN ')
    .replace(/Vscode/g, 'VSCode');
}

// ─── Build Sidebar ───
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  const categorized = new Set();
  CATEGORIES.forEach(cat => cat.docs.forEach(d => categorized.add(d)));

  // Find uncategorized
  const uncategorized = ALL_DOCS.filter(d => !categorized.has(d));

  let html = '';

  CATEGORIES.forEach((cat, ci) => {
    const count = cat.docs.length;
    html += `<div class="sidebar-section">
      <h4 onclick="toggleSection(this)" class="${ci < 3 ? 'expanded' : ''}">${cat.icon} ${cat.name} <span class="sidebar-count">${count}</span></h4>
      <div class="items ${ci < 3 ? 'expanded' : ''}">`;
    cat.docs.forEach(doc => {
      html += `<a href="#${doc}" data-doc="${doc}" onclick="event.preventDefault();loadDoc('${doc}')">${prettyName(doc)}</a>`;
    });
    html += '</div></div>';
  });

  if (uncategorized.length > 0) {
    html += `<div class="sidebar-section">
      <h4 onclick="toggleSection(this)">📄 Other Docs <span class="sidebar-count">${uncategorized.length}</span></h4>
      <div class="items">`;
    uncategorized.forEach(doc => {
      html += `<a href="#${doc}" data-doc="${doc}" onclick="event.preventDefault();loadDoc('${doc}')">${prettyName(doc)}</a>`;
    });
    html += '</div></div>';
  }

  nav.innerHTML = html;
}

function toggleSection(el) {
  el.classList.toggle('expanded');
  const items = el.nextElementSibling;
  items.classList.toggle('expanded');
}

// ─── Load Document ───
async function loadDoc(docName) {
  currentDoc = docName;
  window.location.hash = docName;

  const content = document.getElementById('doc-content');
  const breadcrumbs = document.getElementById('breadcrumbs');

  // Find category
  let catName = 'Docs';
  for (const cat of CATEGORIES) {
    if (cat.docs.includes(docName)) { catName = cat.name; break; }
  }

  breadcrumbs.innerHTML = `<a href="#" onclick="event.preventDefault();showWelcome()">Docs</a> <span>›</span> <a href="#">${catName}</a> <span>›</span> ${prettyName(docName)}`;

  // Update sidebar active
  document.querySelectorAll('.sidebar a').forEach(a => {
    a.classList.toggle('active', a.dataset.doc === docName);
  });

  // Expand the right section
  document.querySelectorAll('.sidebar-section').forEach(sec => {
    const links = sec.querySelectorAll('a[data-doc]');
    links.forEach(a => {
      if (a.dataset.doc === docName) {
        const h4 = sec.querySelector('h4');
        const items = sec.querySelector('.items');
        if (!h4.classList.contains('expanded')) {
          h4.classList.add('expanded');
          items.classList.add('expanded');
        }
      }
    });
  });

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');

  // Check cache
  if (docCache[docName]) {
    renderDoc(docCache[docName], docName);
    return;
  }

  content.innerHTML = '<div class="loading">Loading documentation...</div>';

  try {
    const url = BASE_RAW + docName + '.md';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const md = await resp.text();
    docCache[docName] = md;

    // Add to search index
    if (!searchIndex.find(s => s.doc === docName)) {
      searchIndex.push({ doc: docName, title: prettyName(docName), content: md.toLowerCase() });
    }

    renderDoc(md, docName);
  } catch (err) {
    content.innerHTML = `<div class="doc-error">
      <h2>⚠️ Failed to load</h2>
      <p>Could not fetch <code>${docName}.md</code></p>
      <p style="font-size:0.8rem">${err.message}</p>
      <p style="margin-top:16px"><a href="${BASE_RAW}${docName}.md" target="_blank">Try opening directly →</a></p>
    </div>`;
  }
}

function renderDoc(md, docName) {
  const content = document.getElementById('doc-content');
  const html = marked.parse(md, {
    gfm: true,
    breaks: false,
    headerIds: true,
  });
  content.innerHTML = html;
  addCopyButtons();
  window.scrollTo(0, 0);
}

function addCopyButtons() {
  document.querySelectorAll('.doc-content pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.onclick = () => {
      const code = pre.querySelector('code');
      navigator.clipboard.writeText((code || pre).textContent.replace('Copy', '').trim());
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    };
    pre.appendChild(btn);
  });
}

// ─── Welcome Page ───
function showWelcome() {
  currentDoc = null;
  window.location.hash = '';
  document.getElementById('breadcrumbs').innerHTML = '';
  document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));

  const content = document.getElementById('doc-content');
  content.innerHTML = `
    <div class="welcome">
      <h1>AMC Documentation</h1>
      <p class="subtitle">Complete reference for the Agent Maturity Compass — the credit score for AI agents.</p>

      <div class="stat-grid">
        <div class="stat-card"><div class="num">${ALL_DOCS.length}</div><div class="label">Documentation Files</div></div>
        <div class="stat-card"><div class="num">${CATEGORIES.length}</div><div class="label">Categories</div></div>
        <div class="stat-card"><div class="num">195</div><div class="label">Diagnostic Questions</div></div>
        <div class="stat-card"><div class="num">14</div><div class="label">Framework Adapters</div></div>
      </div>

      <h2 style="color:var(--green2);border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:16px">Start Here</h2>
      <div class="quick-links">
        <a href="#GETTING_STARTED" onclick="event.preventDefault();loadDoc('GETTING_STARTED')">🚀 Getting Started</a>
        <a href="#QUICKSTART" onclick="event.preventDefault();loadDoc('QUICKSTART')">⚡ Quick Start Guide</a>
        <a href="#INSTALL" onclick="event.preventDefault();loadDoc('INSTALL')">📦 Installation</a>
        <a href="#ADAPTERS" onclick="event.preventDefault();loadDoc('ADAPTERS')">🔌 Adapters</a>
        <a href="#SECURITY" onclick="event.preventDefault();loadDoc('SECURITY')">🔒 Security</a>
        <a href="#EU_AI_ACT_COMPLIANCE" onclick="event.preventDefault();loadDoc('EU_AI_ACT_COMPLIANCE')">⚖️ Compliance</a>
      </div>

      <h2 style="color:var(--green2);border-bottom:1px solid var(--border);padding-bottom:8px;margin:32px 0 16px">Featured Guides</h2>
      <div class="feature-cards">
        <a class="feature-card-link" href="#COMPATIBILITY_MATRIX" onclick="event.preventDefault();loadDoc('COMPATIBILITY_MATRIX')">
          <div class="feature-card-icon">🧩</div>
          <div class="feature-card-body">
            <h3>Compatibility Matrix</h3>
            <p>See which frameworks, providers, environments, and workflows are ready for AMC right now.</p>
            <span>Find your stack →</span>
          </div>
        </a>
        <a class="feature-card-link" href="#STARTER_BLUEPRINTS" onclick="event.preventDefault();loadDoc('STARTER_BLUEPRINTS')">
          <div class="feature-card-icon">🛠️</div>
          <div class="feature-card-body">
            <h3>Starter Blueprints</h3>
            <p>Opinionated starting points for OpenClaw, LangChain RAG, CrewAI, and OpenAI-compatible apps.</p>
            <span>Steal the baseline →</span>
          </div>
        </a>
        <a class="feature-card-link" href="#OSS_ADOPTION_ROADMAP" onclick="event.preventDefault();loadDoc('OSS_ADOPTION_ROADMAP')">
          <div class="feature-card-icon">📈</div>
          <div class="feature-card-body">
            <h3>OSS Adoption Roadmap</h3>
            <p>Prioritized plan for reducing adoption friction and turning curiosity into retained usage.</p>
            <span>See what to build next →</span>
          </div>
        </a>
        <a class="feature-card-link" href="#EU_AI_ACT_COMPLIANCE" onclick="event.preventDefault();loadDoc('EU_AI_ACT_COMPLIANCE')">
          <div class="feature-card-icon">⚖️</div>
          <div class="feature-card-body">
            <h3>Compliance & Audit</h3>
            <p>Trace the path from agent behavior to evidence-backed compliance and audit-ready artifacts.</p>
            <span>Open compliance docs →</span>
          </div>
        </a>
      </div>

      <h2 style="color:var(--green2);border-bottom:1px solid var(--border);padding-bottom:8px;margin:32px 0 16px">Browse by Category</h2>
      <div class="quick-links">
        ${CATEGORIES.map(cat =>
          `<a href="#" onclick="event.preventDefault();loadDoc('${cat.docs[0]}')">${cat.icon} ${cat.name} <span style="color:var(--muted);font-size:0.75rem">(${cat.docs.length} docs)</span></a>`
        ).join('')}
      </div>
    </div>
  `;
}

// ─── Search ───
function initSearch() {
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');

  // Pre-warm search index with doc titles
  ALL_DOCS.forEach(doc => {
    if (!searchIndex.find(s => s.doc === doc)) {
      searchIndex.push({ doc, title: prettyName(doc), content: doc.toLowerCase().replace(/[-_]/g, ' ') });
    }
  });

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (q.length < 2) { resultsEl.classList.remove('visible'); return; }

    const results = [];
    searchIndex.forEach(item => {
      const titleMatch = item.title.toLowerCase().includes(q);
      const contentMatch = item.content.includes(q);
      if (titleMatch || contentMatch) {
        let snippet = '';
        if (contentMatch && item.content.length > 100) {
          const idx = item.content.indexOf(q);
          snippet = item.content.substring(Math.max(0, idx - 50), idx + 80).trim();
          snippet = '...' + snippet + '...';
        }
        // Find category
        let catName = 'Other';
        for (const cat of CATEGORIES) {
          if (cat.docs.includes(item.doc)) { catName = cat.name; break; }
        }
        results.push({ doc: item.doc, title: item.title, snippet, category: catName, priority: titleMatch ? 0 : 1 });
      }
    });

    results.sort((a, b) => a.priority - b.priority);

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="search-result"><p>No results found</p></div>';
    } else {
      resultsEl.innerHTML = results.slice(0, 10).map(r =>
        `<div class="search-result" onclick="loadDoc('${r.doc}');document.getElementById('search-input').value='';document.getElementById('search-results').classList.remove('visible')">
          <h5>${r.title}</h5>
          <span class="category">${r.category}</span>
          ${r.snippet ? `<p>${escHtml(r.snippet)}</p>` : ''}
        </div>`
      ).join('');
    }
    resultsEl.classList.add('visible');
  });

  input.addEventListener('blur', () => setTimeout(() => resultsEl.classList.remove('visible'), 200));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') { resultsEl.classList.remove('visible'); input.blur(); }
  });
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Preload search index in background ───
async function preloadSearchIndex() {
  // Load a few key docs to populate search
  const priority = ['GETTING_STARTED', 'QUICKSTART', 'INSTALL', 'ADAPTERS', 'SECURITY', 'ARCHITECTURE_MAP', 'EU_AI_ACT_COMPLIANCE'];
  for (const doc of priority) {
    if (docCache[doc]) continue;
    try {
      const resp = await fetch(BASE_RAW + doc + '.md');
      if (resp.ok) {
        const md = await resp.text();
        docCache[doc] = md;
        const existing = searchIndex.find(s => s.doc === doc);
        if (existing) existing.content = md.toLowerCase();
        else searchIndex.push({ doc, title: prettyName(doc), content: md.toLowerCase() });
      }
    } catch(e) { /* silent */ }
  }
}

// ─── Init ───
(function init() {
  // Configure marked
  if (typeof marked !== 'undefined') {
    marked.setOptions({ gfm: true, breaks: false });
  }

  buildSidebar();
  initSearch();

  // Route
  const hash = window.location.hash.replace('#', '');
  if (hash && ALL_DOCS.includes(hash)) {
    loadDoc(hash);
  } else {
    showWelcome();
  }

  // Handle back/forward
  window.addEventListener('popstate', () => {
    const h = window.location.hash.replace('#', '');
    if (h && ALL_DOCS.includes(h)) {
      loadDoc(h);
    } else {
      showWelcome();
    }
  });

  // Mobile menu toggle
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Preload search index after a delay
  setTimeout(preloadSearchIndex, 2000);
})();
