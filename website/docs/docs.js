// AMC Docs — Dynamic Documentation Hub
// Loads build-verified, same-origin Markdown and renders it with pinned marked.js.

const DOCS_CONTENT_BASE = globalThis.AMC_DOCS_CONTENT_BASE || './content/';
const DOCS_MANIFEST_URL = globalThis.AMC_DOCS_MANIFEST_URL || './content-manifest.json';
const DOCS_MANIFEST_SCHEMA_VERSION = '2026-07-10';

// ─── Category Mapping ───
const CATEGORIES = [
  {
    name: 'Getting Started',
    icon: '01',
    docs: ['INDEX', 'START_HERE', 'AFTER_FIRST_SCORE', 'GETTING_STARTED', 'QUICKSTART', 'INSTALL', 'AGENT_GUIDE', 'COMPATIBILITY_MATRIX', 'STARTER_BLUEPRINTS', 'TROUBLESHOOTING']
  },
  {
    name: 'Architecture',
    icon: '02',
    docs: ['ARCHITECTURE_BRIEF', 'IMPLEMENTATION_REALITY_MAP', 'DOCS_DRIFT_CLEANUP_PLAN', 'ARCHITECTURE_MAP', 'API_SURFACES', 'CHAIN_ARCHITECTURE', 'CONTEXT_GRAPH', 'SYSTEM_CAPABILITIES', 'MODES', 'RUNTIMES', 'RUNTIME_SDK', 'PYTHON_MODULE_MAPPING', 'BOM']
  },
  {
    name: 'Deep Dives',
    icon: '03',
    docs: ['deep-dive/INDEX', 'deep-dive/runtime-control-plane', 'deep-dive/trust-evidence-plane', 'deep-dive/governance-execution-plane', 'deep-dive/evaluation-assurance-plane', 'deep-dive/operations-ecosystem-plane']
  },
  {
    name: 'Adapters & Integration',
    icon: '04',
    docs: ['ADAPTERS', 'ADAPTER_COMPATIBILITY', 'CUSTOM_ADAPTER', 'agent-framework-compatibility', 'adapters/LANDING_LANGCHAIN', 'adapters/LANDING_OPENAI', 'adapters/LANDING_CREWAI', 'adapters/LANDING_CLAUDE_CODE', 'adapters/LANDING_GENERIC_CLI', 'adapters/langchain-python', 'adapters/langchain-node', 'adapters/langgraph-python', 'adapters/crewai', 'adapters/autogen', 'adapters/openai-agents-sdk', 'adapters/llamaindex', 'adapters/semantic-kernel', 'adapters/claude-code', 'adapters/gemini', 'adapters/openclaw', 'adapters/openhands', 'adapters/python-amc-sdk', 'adapters/generic-cli', 'BRIDGE', 'BRIDGE_PROMPT_ENFORCEMENT', 'CONNECT', 'INTEGRATIONS', 'integrations/ci-cd', 'MCP_SERVER', 'PAIRING', 'PAIRING_LAN_PWA', 'PROVIDERS', 'SDK', 'SDK_VERSIONING', 'CLI_WRAPPERS', 'VSCODE_EXTENSION']
  },
  {
    name: 'Scoring & Dimensions',
    icon: '05',
    docs: ['DIAGNOSTIC_BANK', 'QUESTION_BANK', 'SCORING_METHODOLOGY', 'AMC_QUESTIONS_IN_DEPTH', 'AMC_MASTER_REFERENCE', 'ARCHETYPES', 'BENCHMARKS', 'BENCHMARKING', 'BENCH_REGISTRY', 'EQUALIZER_TARGETS', 'METRICS', 'OUTCOMES', 'FORECASTING', 'PREDICTION_LOG', 'PREDICTIVE_MAINTENANCE', 'self-calibration', 'VALIDITY_FRAMEWORK', 'score-history']
  },
  {
    name: 'Compliance & Regulatory',
    icon: '06',
    docs: ['EU_AI_ACT_COMPLIANCE', 'COMPLIANCE', 'COMPLIANCE_FRAMEWORKS', 'COMPLIANCE_MAPS', 'CERTIFICATION', 'ISO_42001_ALIGNMENT', 'GDPR_ARTICLE_COMPLIANCE', 'MITRE_ATLAS_MAPPING', 'STANDARDS_MAPPING', 'ASSURANCE_CERTS', 'ASSURANCE_LAB', 'AUDIT_BINDER', 'enterprise-readiness-checklist', 'compliance/eu-ai-act-checklist', 'compliance/iso-42001-aims-manual', 'compliance/nist-rmf-profile', 'compliance/SOC2_TYPE_II_CONTROLS_MAPPING']
  },
  {
    name: 'Security',
    icon: '07',
    docs: ['SECURITY', 'SECURITY_ARCHITECTURE_OVERVIEW', 'SECURITY_DEPLOYMENT', 'THREAT_MODEL', 'HARDENING', 'RED_TEAMING_GUIDE', 'ANTI_HALLUCINATION', 'TRUTHGUARD', 'SHIELD_ENFORCE_REFERENCE', 'ENCRYPTION_AT_REST', 'HARDWARE_TRUST', 'ZERO_KEYS', 'VAULT', 'RBAC', 'SSO_OIDC', 'SSO_SAML', 'SCIM', 'IDENTITY', 'IDENTITY_STABILITY', 'SUPPLY_CHAIN', 'PLUGIN_SUPPLY_CHAIN', 'sbom']
  },
  {
    name: 'Governance & Policy',
    icon: '08',
    docs: ['GOVERNANCE', 'COMMUNITY', 'SUPPORT_POLICY', 'MODEL_GOVERNANCE', 'GOVERNOR', 'POLICY_EXPORT', 'POLICY_PACKS', 'PROMPT_POLICY', 'APPROVALS', 'DUAL_CONTROL_APPROVALS', 'WAIVERS', 'LEASES', 'BUDGETS', 'NO_CODE_GOVERNANCE', 'VALUE_CONTRACTS', 'VALUE_GATES', 'VALUE_INGESTION', 'VALUE_REALIZATION']
  },
  {
    name: 'Operations',
    icon: '09',
    docs: ['OPERATIONS', 'OPS_HARDENING', 'BACKUPS', 'DEPLOYMENT', 'DEPLOYMENT_OPTIONS', 'DEPLOYMENT_CHECKLIST', 'CLOUD_REFERENCE_ARCHITECTURES', 'MIGRATION_RUNBOOK', 'RELEASE_RUNBOOK', 'RELEASING', 'RELEASE_CADENCE', 'CI_TEMPLATES', 'SINGLE_BINARY', 'PUBLISHING', 'UPGRADE_AUTOPILOT', 'INCIDENT_RESPONSE_READINESS', 'DRIFT_ALERTS', 'CONTINUOUS_MONITORING', 'CONTINUOUS_RECURRENCE', 'DOCTOR', 'MECHANIC_MODE', 'MECHANIC_WORKBENCH', 'CI', 'runbooks/amc-service-down', 'runbooks/evidence-corruption', 'runbooks/score-dispute']
  },
  {
    name: 'Trust & Evidence',
    icon: '10',
    docs: ['EVIDENCE_TRUST', 'EVIDENCE_REQUESTS', 'ATTESTATION_EVIDENCE_PATHS', 'CLAIM_PROVENANCE', 'NOTARY', 'TRANSPARENCY', 'TRANSPARENCY_MERKLE', 'TRANSPARENCY_REPORT', 'RECEIPTS', 'OPEN_RUBRIC_STANDARD', 'OPEN_STANDARD', 'AGENT_PASSPORT']
  },
  {
    name: 'Product & UX',
    icon: '11',
    docs: ['CONSOLE', 'DASHBOARD', 'STUDIO', 'TOOLHUB', 'PLUGINS', 'SANDBOX', 'BROWSER_SANDBOX', 'WHATIF', 'PLAYGROUND', 'ACCESSIBILITY', 'DOMAIN_PACKS', 'DOMAIN_PROOF_LANE', 'SECTOR_PACKS', 'BUNDLES', 'CASEBOOKS', 'ORG_COMPASS', 'ORG_EOC', 'REAL_PEOPLE_COUNCIL', 'NORTHSTAR_PROMPTS', 'PRODUCT_EDITIONS', 'PRICING', 'BUYER_PACKAGES', 'SERVICES_AND_SUPPORT', 'BENCHMARK_GALLERY', 'COMMUNITY_SHOWCASE', 'RELEASE_HIGHLIGHTS', 'USE_CASES', 'PERSONAS', 'WHY_AMC', 'EXAMPLES_INDEX', 'SOLO_DEV_QUICKSTART', 'SOLO_DEV_PATH', 'PLATFORM_ENGINEER_QUICKSTART', 'PLATFORM_PATH', 'SECURITY_COMPLIANCE_QUICKSTART', 'SECURITY_PATH', 'EXECUTIVE_OVERVIEW', 'BOARD_RISK_L3_MEMO']
  },
  {
    name: 'API Reference',
    icon: '12',
    docs: ['API_REFERENCE', 'CLI_COMMAND_INVENTORY', 'REALTIME', 'REGISTRY', 'FLEET', 'LOOP', 'TICKETS', 'WORK_ORDERS', 'EXPERIMENTS', 'FEDERATION', 'ENTERPRISE', 'ECOSYSTEM', 'ECOSYSTEM_VIEW', 'ECOSYSTEM_COMPARATIVE_VIEW', 'ECONOMIC_SIGNIFICANCE', 'db-schemas']
  },
  {
    name: 'Multi-Agent & Advanced',
    icon: '13',
    docs: ['MULTI_AGENT_TRUST', 'MULTI_MODEL_VALIDATION', 'AGENT_VS_WORKFLOW', 'MEMORY_MATURITY', 'CANON', 'FULL_MODULE_ROADMAP', 'INNOVATION_THESIS', 'GO_TO_MARKET_PACK', 'LAUNCH']
  },
  {
    name: 'Research',
    icon: '14',
    docs: ['wave4-agentic-ecosystem-audit', 'wave4-ai-safety-audit', 'wave4-documentation-audit', 'wave4-integration-audit', 'wave4-product-readiness-audit', 'wave4-regulatory-audit', 'wave4-supply-chain-audit', 'wave4-test-coverage-audit', 'RESEARCH_PAPERS_2026', 'NEW_GAPS_RESEARCH']
  },
  {
    name: 'Migration',
    icon: '15',
    docs: ['MIGRATION_FROM_PROMPTFOO_DEEPEVAL']
  }
];

// All known doc filenames (without .md)
const ALL_DOCS = [
  'ACCESSIBILITY','ADAPTERS','ADAPTER_COMPATIBILITY','AGENT_GUIDE','AGENT_PASSPORT','AGENT_VS_WORKFLOW',
  'AMC_MASTER_REFERENCE','AMC_QUESTIONS_IN_DEPTH','ANTI_HALLUCINATION','API_REFERENCE','API_SURFACES',
  'APPROVALS','ARCHETYPES','ARCHITECTURE_BRIEF','ARCHITECTURE_MAP','ASSURANCE_CERTS','ASSURANCE_LAB',
  'ATTESTATION_EVIDENCE_PATHS','AUDIT_BINDER','BACKUPS','BENCHMARKING','BENCHMARKS',
  'BENCH_REGISTRY','BOARD_RISK_L3_MEMO','BOM','BRIDGE','BRIDGE_PROMPT_ENFORCEMENT','BUDGETS','BUNDLES',
  'CANON','CASEBOOKS','CERTIFICATION','CHAIN_ARCHITECTURE','CI','CLAIM_PROVENANCE',
  'CLI_COMMAND_INVENTORY','CLI_WRAPPERS','CLOUD_REFERENCE_ARCHITECTURES','COMPLIANCE','COMPLIANCE_FRAMEWORKS','COMPLIANCE_MAPS','CONNECT','CONSOLE','CONTEXT_GRAPH','CUSTOM_ADAPTER',
  'CONTINUOUS_MONITORING','CONTINUOUS_RECURRENCE','DASHBOARD','DEPLOYMENT','DEPLOYMENT_CHECKLIST','DIAGNOSTIC_BANK',
  'DOCS_DRIFT_CLEANUP_PLAN','DOCTOR','DOMAIN_PACKS','DOMAIN_PROOF_LANE','DRIFT_ALERTS','DUAL_CONTROL_APPROVALS','ECONOMIC_SIGNIFICANCE',
  'ECOSYSTEM','ECOSYSTEM_COMPARATIVE_VIEW','ECOSYSTEM_VIEW','ENCRYPTION_AT_REST',
  'ENTERPRISE','EQUALIZER_TARGETS','EU_AI_ACT_COMPLIANCE','EVIDENCE_REQUESTS',
  'EVIDENCE_TRUST','EXECUTIVE_OVERVIEW','EXPERIMENTS','FEDERATION','FLEET','FORECASTING',
  'FULL_MODULE_ROADMAP','GDPR_ARTICLE_COMPLIANCE','GETTING_STARTED','GOVERNANCE','GOVERNOR','GO_TO_MARKET_PACK',
  'HARDWARE_TRUST','IDENTITY','IDENTITY_STABILITY','INCIDENT_RESPONSE_READINESS',
  'IMPLEMENTATION_REALITY_MAP',
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
  'SANDBOX','SCIM','SCORING_METHODOLOGY','SDK','SDK_VERSIONING','SECTOR_PACKS','SECURITY',
  'SECURITY_ARCHITECTURE_OVERVIEW','SECURITY_DEPLOYMENT','SHIELD_ENFORCE_REFERENCE',
  'SOLO_USER','SSO_OIDC','SSO_SAML','STANDARDS_MAPPING','STUDIO','SUPPLY_CHAIN',
  'SYSTEM_CAPABILITIES','THREAT_MODEL','TICKETS','TOOLHUB','TRANSPARENCY',
  'TRANSPARENCY_MERKLE','TRANSPARENCY_REPORT','TRUTHGUARD','UPGRADE_AUTOPILOT',
  'VALIDITY_FRAMEWORK','VALUE_CONTRACTS','VALUE_GATES',
  'VALUE_INGESTION','VALUE_REALIZATION','VAULT','VSCODE_EXTENSION','WAIVERS',
  'WHATIF','WORK_ORDERS','ZERO_KEYS','INDEX','START_HERE','AFTER_FIRST_SCORE','SOLO_DEV_PATH','PLATFORM_PATH','SECURITY_PATH','PRODUCT_EDITIONS','PRICING','COMMUNITY_SUPPORT','DEPLOYMENT_OPTIONS','EXAMPLES_INDEX','RECIPES','COMPARE_AMC','BUYER_PACKAGES','SERVICES_AND_SUPPORT','COMMUNITY_SHOWCASE','RELEASE_HIGHLIGHTS','BENCHMARK_GALLERY','COMPATIBILITY_MATRIX','STARTER_BLUEPRINTS','OSS_ADOPTION_ROADMAP','INSTALL_PACKAGES','SUPPORT_POLICY','RELEASE_CADENCE','CI_TEMPLATES','SINGLE_BINARY','BROWSER_SANDBOX','TROUBLESHOOTING','COMMUNITY','SOLO_DEV_QUICKSTART','PLATFORM_ENGINEER_QUICKSTART','SECURITY_COMPLIANCE_QUICKSTART','HARDENING','USE_CASES','PERSONAS','WHY_AMC','agent-framework-compatibility','db-schemas',
  'enterprise-readiness-checklist','sbom','score-history','self-calibration',
  'wave4-agentic-ecosystem-audit','wave4-ai-safety-audit','wave4-documentation-audit',
  'wave4-integration-audit','wave4-product-readiness-audit','wave4-regulatory-audit',
  'wave4-supply-chain-audit','wave4-test-coverage-audit',
  'deep-dive/INDEX','deep-dive/runtime-control-plane','deep-dive/trust-evidence-plane',
  'deep-dive/governance-execution-plane','deep-dive/evaluation-assurance-plane',
  'deep-dive/operations-ecosystem-plane',
  'adapters/autogen','adapters/claude-code','adapters/crewai','adapters/gemini',
  'adapters/generic-cli','adapters/langchain-node','adapters/langchain-python',
  'adapters/langgraph-python','adapters/llamaindex','adapters/openai-agents-sdk',
  'adapters/openclaw','adapters/openhands','adapters/python-amc-sdk','adapters/semantic-kernel',
  'adapters/LANDING_LANGCHAIN','adapters/LANDING_OPENAI','adapters/LANDING_CREWAI',
  'adapters/LANDING_CLAUDE_CODE','adapters/LANDING_GENERIC_CLI',
  'compliance/eu-ai-act-checklist','compliance/iso-42001-aims-manual',
  'compliance/nist-rmf-profile','compliance/SOC2_TYPE_II_CONTROLS_MAPPING',
  'integrations/ci-cd',
  'runbooks/amc-service-down','runbooks/evidence-corruption','runbooks/score-dispute'
];

// Public Docs are a user product surface, not an index of AMC's operator backlog.
const INTERNAL_DOCS = new Set([
  'OSS_ADOPTION_ROADMAP',
  'IMPLEMENTATION_REALITY_MAP',
  'DOCS_DRIFT_CLEANUP_PLAN',
  'FULL_MODULE_ROADMAP',
  'INNOVATION_THESIS',
  'GO_TO_MARKET_PACK',
  'LAUNCH',
  'NORTHSTAR_PROMPTS',
  'REAL_PEOPLE_COUNCIL',
  'NEW_GAPS_RESEARCH',
  'wave4-agentic-ecosystem-audit',
  'wave4-ai-safety-audit',
  'wave4-documentation-audit',
  'wave4-integration-audit',
  'wave4-product-readiness-audit',
  'wave4-regulatory-audit',
  'wave4-supply-chain-audit',
  'wave4-test-coverage-audit'
]);
const PUBLIC_DOC_IDS = new Set([
  // First score and adoption
  'INDEX', 'START_HERE', 'AFTER_FIRST_SCORE', 'GETTING_STARTED', 'QUICKSTART', 'AGENT_GUIDE',
  'INSTALL', 'COMPATIBILITY_MATRIX', 'STARTER_BLUEPRINTS', 'BROWSER_SANDBOX', 'TROUBLESHOOTING',
  'BOARD_RISK_L3_MEMO', 'CLI_COMMAND_INVENTORY', 'DEPLOYMENT_OPTIONS', 'EXAMPLES_INDEX', 'EXECUTIVE_OVERVIEW',
  'SOLO_DEV_QUICKSTART', 'SOLO_DEV_PATH', 'PLATFORM_ENGINEER_QUICKSTART', 'PLATFORM_PATH',
  'SECURITY_COMPLIANCE_QUICKSTART', 'SECURITY_PATH',

  // Architecture and deep dives
  'ARCHITECTURE_BRIEF', 'ARCHITECTURE_MAP', 'API_SURFACES', 'SYSTEM_CAPABILITIES', 'RUNTIMES', 'RUNTIME_SDK',
  'deep-dive/INDEX', 'deep-dive/runtime-control-plane', 'deep-dive/trust-evidence-plane',
  'deep-dive/governance-execution-plane', 'deep-dive/evaluation-assurance-plane', 'deep-dive/operations-ecosystem-plane',

  // Adapters and integration
  'ADAPTERS', 'ADAPTER_COMPATIBILITY', 'CUSTOM_ADAPTER', 'agent-framework-compatibility',
  'adapters/LANDING_LANGCHAIN', 'adapters/LANDING_OPENAI', 'adapters/LANDING_CREWAI',
  'adapters/LANDING_CLAUDE_CODE', 'adapters/LANDING_GENERIC_CLI',
  'adapters/autogen', 'adapters/claude-code', 'adapters/crewai', 'adapters/gemini',
  'adapters/generic-cli', 'adapters/langchain-node', 'adapters/langchain-python',
  'adapters/langgraph-python', 'adapters/llamaindex', 'adapters/openai-agents-sdk',
  'adapters/openclaw', 'adapters/openhands', 'adapters/python-amc-sdk', 'adapters/semantic-kernel',
  'PROVIDERS', 'SDK', 'SDK_VERSIONING', 'MCP_SERVER', 'integrations/ci-cd',

  // Score and metric validity
  'AMC_QUESTIONS_IN_DEPTH', 'QUESTION_BANK', 'SCORING_METHODOLOGY', 'ARCHETYPES',
  'BENCHMARKS', 'METRICS', 'OUTCOMES', 'VALIDITY_FRAMEWORK', 'self-calibration', 'score-history',

  // Compliance and regulation
  'EU_AI_ACT_COMPLIANCE', 'COMPLIANCE', 'COMPLIANCE_FRAMEWORKS', 'COMPLIANCE_MAPS',
  'ISO_42001_ALIGNMENT', 'GDPR_ARTICLE_COMPLIANCE', 'MITRE_ATLAS_MAPPING', 'STANDARDS_MAPPING',
  'ASSURANCE_LAB', 'AUDIT_BINDER', 'enterprise-readiness-checklist', 'compliance/eu-ai-act-checklist',
  'compliance/iso-42001-aims-manual', 'compliance/nist-rmf-profile', 'compliance/SOC2_TYPE_II_CONTROLS_MAPPING',

  // Security, runtime policy, and identity
  'SECURITY', 'SECURITY_ARCHITECTURE_OVERVIEW', 'SECURITY_DEPLOYMENT', 'THREAT_MODEL',
  'HARDENING', 'RED_TEAMING_GUIDE', 'SHIELD_ENFORCE_REFERENCE', 'ENCRYPTION_AT_REST',
  'HARDWARE_TRUST', 'ZERO_KEYS', 'VAULT', 'RBAC', 'IDENTITY', 'SUPPLY_CHAIN', 'PLUGIN_SUPPLY_CHAIN',

  // Governance and policy
  'GOVERNANCE', 'MODEL_GOVERNANCE', 'POLICY_PACKS', 'PROMPT_POLICY', 'APPROVALS',
  'DUAL_CONTROL_APPROVALS', 'WAIVERS', 'LEASES', 'BUDGETS', 'SUPPORT_POLICY', 'COMMUNITY',

  // Operations and deployment
  'OPERATIONS', 'BACKUPS', 'DEPLOYMENT', 'DEPLOYMENT_CHECKLIST', 'CLOUD_REFERENCE_ARCHITECTURES',
  'MIGRATION_RUNBOOK', 'CI_TEMPLATES', 'SINGLE_BINARY', 'INCIDENT_RESPONSE_READINESS',
  'DRIFT_ALERTS', 'CONTINUOUS_MONITORING', 'DOCTOR',
  'runbooks/amc-service-down', 'runbooks/evidence-corruption', 'runbooks/score-dispute',

  // Trust evidence and portable proof
  'EVIDENCE_TRUST', 'EVIDENCE_REQUESTS', 'ATTESTATION_EVIDENCE_PATHS', 'CLAIM_PROVENANCE',
  'NOTARY', 'TRANSPARENCY', 'TRANSPARENCY_MERKLE', 'TRANSPARENCY_REPORT',
  'RECEIPTS', 'OPEN_RUBRIC_STANDARD', 'OPEN_STANDARD', 'AGENT_PASSPORT',

  // Product, Studio, and user workflows
  'CONSOLE', 'DASHBOARD', 'STUDIO', 'TOOLHUB', 'PLAYGROUND', 'ACCESSIBILITY',
  'DOMAIN_PACKS', 'DOMAIN_PROOF_LANE', 'SECTOR_PACKS', 'PRODUCT_EDITIONS', 'PRICING', 'BUYER_PACKAGES',
  'RELEASE_HIGHLIGHTS', 'USE_CASES', 'PERSONAS', 'WHY_AMC',

  // API, fleet, memory, research, and migration
  'API_REFERENCE', 'REALTIME', 'REGISTRY', 'FLEET', 'ENTERPRISE',
  'MULTI_AGENT_TRUST', 'MULTI_MODEL_VALIDATION', 'AGENT_VS_WORKFLOW', 'MEMORY_MATURITY', 'CANON',
  'RESEARCH_PAPERS_2026', 'MIGRATION_FROM_PROMPTFOO_DEEPEVAL'
]);
const PUBLIC_DOCS = ALL_DOCS.filter(doc => PUBLIC_DOC_IDS.has(doc) && !INTERNAL_DOCS.has(doc));
const PUBLIC_CATEGORIES = CATEGORIES.map(category => ({
  ...category,
  docs: category.docs.filter(doc => PUBLIC_DOCS.includes(doc))
})).filter(category => category.docs.length > 0);

globalThis.AMC_DOCS_BUILD_MANIFEST = Object.freeze({
  publicDocs: Object.freeze([...PUBLIC_DOCS].sort()),
  internalDocs: Object.freeze([...INTERNAL_DOCS].sort())
});

// ─── State ───
const docCache = {};
let currentDoc = null;
let searchIndex = []; // {doc, title, content}
let contentManifestPromise = null;

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function validateContentManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== DOCS_MANIFEST_SCHEMA_VERSION) {
    throw new Error('Docs content manifest schema is invalid.');
  }
  if (!Array.isArray(manifest.guides) || manifest.guideCount !== PUBLIC_DOCS.length) {
    throw new Error('Docs content manifest guide count is invalid.');
  }
  const localArtifact = typeof window !== 'undefined' && (
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
  if (!/^[a-f0-9]{40}$/i.test(manifest.sourceRevision || '') && !(localArtifact && manifest.sourceRevision === null)) {
    throw new Error('Docs content manifest revision is invalid.');
  }
  if (!manifest.renderer || manifest.renderer.package !== 'marked' ||
      manifest.renderer.asset !== 'vendor/marked.min.js' ||
      !/^\d+\.\d+\.\d+$/.test(manifest.renderer.version || '') ||
      !Number.isInteger(manifest.renderer.bytes) || manifest.renderer.bytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(manifest.renderer.sha256 || '')) {
    throw new Error('Docs renderer manifest is invalid.');
  }

  const expected = [...PUBLIC_DOCS].sort();
  const actual = manifest.guides.map(guide => guide?.id).sort();
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error('Docs content manifest does not match the public guide allowlist.');
  }

  const entries = new Map();
  for (const guide of manifest.guides) {
    if (!guide || !PUBLIC_DOCS.includes(guide.id) || entries.has(guide.id) ||
        guide.source !== `docs/${guide.id}.md` ||
        guide.asset !== `content/${guide.id}.md` ||
        !Number.isInteger(guide.bytes) || guide.bytes < 0 ||
        !/^[a-f0-9]{64}$/.test(guide.sha256 || '')) {
      throw new Error('Docs content manifest contains an invalid guide record.');
    }
    entries.set(guide.id, guide);
  }
  return entries;
}

async function contentManifest() {
  if (contentManifestPromise) return contentManifestPromise;
  contentManifestPromise = (async () => {
    const response = await fetch(DOCS_MANIFEST_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Docs content manifest returned HTTP ${response.status}.`);
    return validateContentManifest(await response.json());
  })();
  try {
    return await contentManifestPromise;
  } catch (error) {
    contentManifestPromise = null;
    throw error;
  }
}

async function fetchVerifiedGuide(docName) {
  if (!PUBLIC_DOCS.includes(docName)) throw new Error('Guide is not in the public Docs allowlist.');
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable; guide integrity cannot be verified.');

  const entries = await contentManifest();
  const entry = entries.get(docName);
  if (!entry) throw new Error('Guide is missing from the deployed Docs manifest.');
  const manifestUrl = new URL(DOCS_MANIFEST_URL, window.location.href);
  const guideUrl = new URL(entry.asset, manifestUrl);
  const expectedUrl = new URL(`${docName}.md`, new URL(DOCS_CONTENT_BASE, window.location.href));
  if (guideUrl.href !== expectedUrl.href) throw new Error('Guide asset path does not match the deployed Docs base.');

  const response = await fetch(guideUrl.href, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Guide returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== entry.bytes) throw new Error('Guide byte length failed the deployed manifest check.');
  const digest = bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)));
  if (digest !== entry.sha256) throw new Error('Guide SHA-256 integrity check failed.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// ─── Pretty name from filename ───
function prettyName(doc) {
  // For subdirectory docs, show "Category: Name" format
  const parts = doc.split('/');
  const basename = parts.length > 1 ? parts[parts.length - 1] : doc;
  const prefix = parts.length > 1
    ? parts[0]
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase()) + ': '
    : '';
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

const DOC_SECTION_SEPARATOR = '::';

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function docsRoute(docName, section = '') {
  return section ? `${docName}${DOC_SECTION_SEPARATOR}${encodeURIComponent(section)}` : docName;
}

function parseDocsRoute(hash) {
  const raw = hash.replace(/^#/, '');
  const separator = raw.indexOf(DOC_SECTION_SEPARATOR);
  if (separator === -1) return { docName: safeDecode(raw), section: '' };
  return {
    docName: safeDecode(raw.slice(0, separator)),
    section: safeDecode(raw.slice(separator + DOC_SECTION_SEPARATOR.length))
  };
}

function resolveRenderedGuideLink(docName, href) {
  if (!href || href.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;

  try {
    const base = new URL(`${docName}.md`, 'https://amc-docs.invalid/');
    const resolved = new URL(href, base);
    if (resolved.origin !== base.origin || !resolved.pathname.toLowerCase().endsWith('.md')) {
      return { available: false };
    }
    const target = safeDecode(resolved.pathname.replace(/^\//, '').slice(0, -3));
    if (!PUBLIC_DOCS.includes(target)) return { available: false };
    return { available: true, docName: target, section: safeDecode(resolved.hash.replace(/^#/, '')) };
  } catch {
    return { available: false };
  }
}

function ensureRenderedHeadingIds(article) {
  const used = new Set(Array.from(article.querySelectorAll('[id]'), element => element.id));
  article.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    if (heading.id) return;
    const base = heading.textContent
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    heading.id = id;
    used.add(id);
  });
}

function rewriteRenderedGuideLinks(article, docName) {
  article.querySelectorAll('a[href]').forEach(link => {
    const route = resolveRenderedGuideLink(docName, link.getAttribute('href'));
    if (route === null) return;
    if (!route.available) {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.dataset.docLinkUnavailable = 'true';
      link.title = 'This guide is not part of the public documentation.';
      return;
    }

    link.href = `#${docsRoute(route.docName, route.section)}`;
    link.dataset.docLink = route.docName;
    link.addEventListener('click', event => {
      event.preventDefault();
      loadDoc(route.docName, route.section);
    });
  });
}

function focusDocSection(section) {
  if (!section) return;
  requestAnimationFrame(() => {
    const target = document.getElementById(section);
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  });
}

// ─── Build Sidebar ───
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  const categorized = new Set();
  PUBLIC_CATEGORIES.forEach(cat => cat.docs.forEach(d => categorized.add(d)));

  // Find uncategorized
  const uncategorized = PUBLIC_DOCS.filter(d => !categorized.has(d));

  let html = '';

  PUBLIC_CATEGORIES.forEach((cat, ci) => {
    const count = cat.docs.length;
    html += `<div class="sidebar-section">
      <h4 onclick="toggleSection(this)" class="${ci === 0 ? 'expanded' : ''}">${cat.icon} ${cat.name} <span class="sidebar-count">${count}</span></h4>
      <div class="items ${ci === 0 ? 'expanded' : ''}">`;
    cat.docs.forEach(doc => {
      html += `<a href="#${doc}" data-doc="${doc}" onclick="event.preventDefault();loadDoc('${doc}')">${prettyName(doc)}</a>`;
    });
    html += '</div></div>';
  });

  if (uncategorized.length > 0) {
    html += `<div class="sidebar-section">
      <h4 onclick="toggleSection(this)">Reference <span class="sidebar-count">${uncategorized.length}</span></h4>
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
async function loadDoc(docName, section = '') {
  if (!PUBLIC_DOCS.includes(docName)) {
    showWelcome();
    return;
  }
  currentDoc = docName;
  window.location.hash = docsRoute(docName, section);

  const content = document.getElementById('doc-content');
  const breadcrumbs = document.getElementById('breadcrumbs');

  // Find category
  let catName = 'Docs';
  for (const cat of PUBLIC_CATEGORIES) {
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
    renderDoc(docCache[docName], docName, section);
    return;
  }

  content.innerHTML = '<div class="loading">Loading documentation...</div>';

  try {
    const md = await fetchVerifiedGuide(docName);
    docCache[docName] = md;

    // Add to search index
    if (!searchIndex.find(s => s.doc === docName)) {
      searchIndex.push({ doc: docName, title: prettyName(docName), content: md.toLowerCase() });
    }

    renderDoc(md, docName, section);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    content.innerHTML = `<div class="doc-error">
      <h2>Document unavailable</h2>
      <p>Could not verify <code>${escHtml(docName)}.md</code> from the deployed Docs bundle.</p>
      <p style="font-size:0.8rem">${escHtml(message)}</p>
      <p style="margin-top:16px"><a href="#" onclick="event.preventDefault();showWelcome()">Return to Docs home</a></p>
    </div>`;
  }
}

function renderDoc(md, docName, section = '') {
  const content = document.getElementById('doc-content');
  const html = marked.parse(md, {
    gfm: true,
    breaks: false,
    headerIds: true,
  });
  content.innerHTML = `
    <div class="doc-brandline" aria-label="AMC documentation trust contract">
      <span class="doc-brandline-wordmark">amc<span class="brand-cursor">_</span> docs</span>
      <span>Evidence over claims.</span>
      <span class="doc-brandline-status">artifact valid ≠ evidence ready</span>
    </div>
    <article class="doc-article" data-doc="${escHtml(docName)}">${html}</article>
  `;
  const article = content.querySelector('.doc-article');
  ensureRenderedHeadingIds(article);
  rewriteRenderedGuideLinks(article, docName);
  addCopyButtons();
  window.scrollTo(0, 0);
  focusDocSection(section);
}

function addCopyButtons() {
  document.querySelectorAll('.doc-content pre').forEach(pre => {
    if (pre.parentElement?.classList.contains('code-block')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.before(wrapper);
    wrapper.appendChild(pre);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code');
    btn.setAttribute('aria-live', 'polite');
    btn.setAttribute('aria-atomic', 'true');

    let resetTimer;
    const reset = () => {
      delete btn.dataset.state;
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code');
    };
    const showResult = (state, text, label) => {
      window.clearTimeout(resetTimer);
      btn.dataset.state = state;
      btn.textContent = text;
      btn.setAttribute('aria-label', label);
      resetTimer = window.setTimeout(reset, 1500);
    };

    btn.onclick = async () => {
      const code = pre.querySelector('code');
      const payload = (code || pre).textContent || '';
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          throw new Error('Clipboard API unavailable');
        }
        await navigator.clipboard.writeText(payload);
        showResult('success', 'Copied', 'Code copied');
      } catch {
        showResult('error', 'Try again', 'Copy failed');
      }
    };
    wrapper.appendChild(btn);
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
      <section class="welcome-hero">
        <div class="welcome-kicker">Evidence over claims.</div>
        <h1>Run one command<span class="brand-cursor">_</span></h1>
        <p class="welcome-lede"><strong>Get the full score. Fix the gaps.</strong> Use the same evidence-first workflow across CLI, Studio, API, desktop, and CI. A valid seal proves artifact integrity; evidence readiness decides whether claims are eligible.</p>
        <div class="welcome-install-grid">
          <div class="welcome-install-option">
            <div class="welcome-platform">macOS + Linux</div>
            <div class="welcome-command"><span>$</span> curl -fsSL https://agentmaturity.co/install.sh | sh</div>
          </div>
          <div class="welcome-install-option">
            <div class="welcome-platform">Windows PowerShell</div>
            <div class="welcome-command"><span>PS&gt;</span> irm https://agentmaturity.co/install.ps1 | iex</div>
          </div>
        </div>
      </section>

      <div class="stat-grid">
        <div class="stat-card"><div class="num">${PUBLIC_DOCS.length}</div><div class="label">Public Guides</div></div>
        <div class="stat-card"><div class="num">${PUBLIC_CATEGORIES.length}</div><div class="label">Categories</div></div>
        <div class="stat-card"><div class="num">244</div><div class="label">Default Questions</div></div>
        <div class="stat-card"><div class="num">1,151</div><div class="label">CLI Paths</div></div>
        <div class="stat-card"><div class="num">41</div><div class="label">Industry Packs</div></div>
        <div class="stat-card"><div class="num">14</div><div class="label">Framework Adapters</div></div>
      </div>

      <h2>Start Here</h2>
      <div class="quick-links">
        <a href="#GETTING_STARTED" onclick="event.preventDefault();loadDoc('GETTING_STARTED')"><span>01</span> Getting Started</a>
        <a href="#QUICKSTART" onclick="event.preventDefault();loadDoc('QUICKSTART')"><span>02</span> Quick Start Guide</a>
        <a href="#INSTALL" onclick="event.preventDefault();loadDoc('INSTALL')"><span>03</span> Installation</a>
        <a href="#ADAPTERS" onclick="event.preventDefault();loadDoc('ADAPTERS')"><span>04</span> Adapters</a>
        <a href="#SECURITY" onclick="event.preventDefault();loadDoc('SECURITY')"><span>05</span> Security</a>
        <a href="#EU_AI_ACT_COMPLIANCE" onclick="event.preventDefault();loadDoc('EU_AI_ACT_COMPLIANCE')"><span>06</span> Compliance</a>
      </div>

      <h2>Featured Guides</h2>
      <div class="feature-cards">
        <a class="feature-card-link" href="#COMPATIBILITY_MATRIX" onclick="event.preventDefault();loadDoc('COMPATIBILITY_MATRIX')">
          <div class="feature-card-icon">compat</div>
          <div class="feature-card-body">
            <h3>Compatibility Matrix</h3>
            <p>See which frameworks, providers, environments, and workflows are ready for AMC right now.</p>
            <span>Find your stack →</span>
          </div>
        </a>
        <a class="feature-card-link" href="#STARTER_BLUEPRINTS" onclick="event.preventDefault();loadDoc('STARTER_BLUEPRINTS')">
          <div class="feature-card-icon">start</div>
          <div class="feature-card-body">
            <h3>Starter Blueprints</h3>
            <p>Opinionated starting points for OpenClaw, LangChain RAG, CrewAI, and OpenAI-compatible apps.</p>
            <span>Steal the baseline →</span>
          </div>
        </a>
        <a class="feature-card-link" href="#EVIDENCE_TRUST" onclick="event.preventDefault();loadDoc('EVIDENCE_TRUST')">
          <div class="feature-card-icon">proof</div>
          <div class="feature-card-body">
            <h3>Evidence & Receipts</h3>
            <p>Understand evidence readiness, signed receipts, claim eligibility, and what AMC can actually prove.</p>
            <span>Follow the proof chain →</span>
          </div>
        </a>
        <a class="feature-card-link" href="#EU_AI_ACT_COMPLIANCE" onclick="event.preventDefault();loadDoc('EU_AI_ACT_COMPLIANCE')">
          <div class="feature-card-icon">comply</div>
          <div class="feature-card-body">
            <h3>Compliance & Audit</h3>
            <p>Trace the path from agent behavior to evidence-backed compliance and audit-ready artifacts.</p>
            <span>Open compliance docs →</span>
          </div>
        </a>
      </div>

      <h2>Browse by Category</h2>
      <div class="quick-links">
        ${PUBLIC_CATEGORIES.map(cat =>
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
  PUBLIC_DOCS.forEach(doc => {
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
        for (const cat of PUBLIC_CATEGORIES) {
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
      const md = await fetchVerifiedGuide(doc);
      docCache[doc] = md;
      const existing = searchIndex.find(s => s.doc === doc);
      if (existing) existing.content = md.toLowerCase();
      else searchIndex.push({ doc, title: prettyName(doc), content: md.toLowerCase() });
    } catch(e) { /* silent */ }
  }
}

// ─── Init ───
if (typeof document !== 'undefined' && typeof window !== 'undefined') (function init() {
  // Configure marked
  if (typeof marked !== 'undefined') {
    marked.setOptions({ gfm: true, breaks: false });
  }

  buildSidebar();
  initSearch();

  // Route
  const route = parseDocsRoute(window.location.hash);
  if (route.docName && PUBLIC_DOCS.includes(route.docName)) {
    loadDoc(route.docName, route.section);
  } else {
    showWelcome();
  }

  // Handle back/forward
  window.addEventListener('popstate', () => {
    const nextRoute = parseDocsRoute(window.location.hash);
    if (nextRoute.docName && PUBLIC_DOCS.includes(nextRoute.docName)) {
      loadDoc(nextRoute.docName, nextRoute.section);
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
