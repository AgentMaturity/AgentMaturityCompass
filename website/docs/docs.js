// AMC Docs — Navigation + Page Content + Router
const NAV = [
  { section: "Getting Started", items: [
    { id: "getting-started", title: "Introduction" },
    { id: "installation", title: "Installation" },
    { id: "quickstart", title: "Quick Start (ELI5)" },
    { id: "first-score", title: "Your First Score" },
  ]},
  { section: "Studio UI", items: [
    { id: "studio-overview", title: "Studio Overview" },
    { id: "console", title: "Compass Console" },
    { id: "dashboard", title: "Dashboard & Charts" },
  ]},
  { section: "CLI Reference", items: [
    { id: "cli-overview", title: "CLI Overview" },
    { id: "cli-commands", title: "Command Reference" },
    { id: "cli-fleet", title: "Fleet Management" },
    { id: "cli-scoring", title: "Scoring & Diagnostics" },
  ]},
  { section: "Core Concepts", items: [
    { id: "architecture", title: "Architecture" },
    { id: "trust-model", title: "Trust Model" },
    { id: "evidence", title: "Evidence & Ledger" },
    { id: "questions", title: "126 Questions" },
    { id: "assurance", title: "Assurance Packs" },
  ]},
  { section: "API & Integration", items: [
    { id: "api-reference", title: "REST API" },
    { id: "bridge", title: "Bridge Adapters" },
    { id: "passport", title: "Agent Passport" },
    { id: "sdk", title: "SDK & Wrappers" },
  ]},
  { section: "Deployment", items: [
    { id: "docker", title: "Docker & Compose" },
    { id: "multi-workspace", title: "Multi-Workspace" },
    { id: "security-hardening", title: "Security Hardening" },
  ]},
  { section: "Troubleshooting", items: [
    { id: "troubleshooting", title: "Common Issues" },
    { id: "doctor", title: "Doctor Command" },
    { id: "faq", title: "FAQ" },
  ]},
];

const PAGES = {};

// ─── Getting Started ───
PAGES["getting-started"] = `
<h1>Introduction</h1>
<p class="subtitle">Agent Maturity Compass (AMC) is the open-source trust &amp; safety platform for AI agents.</p>

<div class="callout info"><strong>What is AMC?</strong>
AMC is a 25-module platform that measures how mature, safe, and trustworthy an AI agent actually is — not based on what it claims, but on cryptographically signed execution evidence. Think of it as a credit score for AI agents.</div>

<h2>Why AMC?</h2>
<p>AI agents self-report their capabilities. Anyone can claim they're safe, reliable, or compliant. But there's an <strong>+84 point gap</strong> between what agents claim and what they actually do (based on our research across 200+ production agents).</p>
<p>AMC closes that gap with:</p>
<ul>
<li><strong>126 diagnostic questions</strong> across 6 maturity dimensions</li>
<li><strong>Evidence-gated scoring</strong> — you can't claim L3 without proving it</li>
<li><strong>Tamper-evident ledger</strong> — Merkle-tree backed, cryptographically signed</li>
<li><strong>Anti-gaming protections</strong> — temporal consistency, cross-reference validation</li>
<li><strong>25 platform modules</strong> — Score, Shield, Enforce, Vault, Watch</li>
</ul>

<h2>Two Ways to Use AMC</h2>
<div class="card-grid">
<div class="card">
<h4>👤 For Humans &amp; Teams</h4>
<p>Visual Studio UI with dashboards, radar charts, heatmaps, and one-click exports. Launch with <code>amc studio open</code> or <code>amc up</code>.</p>
</div>
<div class="card">
<h4>🤖 For Agents &amp; AI Systems</h4>
<p>Full CLI + REST API for programmatic access. Agents can self-assess, prove trust, and integrate into CI/CD pipelines.</p>
</div>
</div>

<h2>Key Features</h2>
<table>
<tr><th>Feature</th><th>Description</th></tr>
<tr><td>AMC Score</td><td>126-question maturity assessment with 6-level scoring (L0–L5)</td></tr>
<tr><td>AMC Shield</td><td>Threat detection, prompt injection defense, anomaly scanning</td></tr>
<tr><td>AMC Enforce</td><td>Policy-as-code guardrails with real-time enforcement</td></tr>
<tr><td>AMC Vault</td><td>Encrypted credential storage with key rotation</td></tr>
<tr><td>AMC Watch</td><td>Observability, attestation, and continuous safety testing</td></tr>
<tr><td>Bridge</td><td>Adapters for OpenAI, Anthropic, Gemini, Grok, OpenRouter</td></tr>
<tr><td>Agent Passport</td><td>Portable, cryptographic trust credential for agents</td></tr>
<tr><td>Assurance Packs</td><td>Pre-built compliance checks (OWASP, EU AI Act, SOC 2)</td></tr>
</table>

<h2>Quick Links</h2>
<ul>
<li><a href="#installation">Installation Guide</a> — get AMC running in 2 minutes</li>
<li><a href="#quickstart">ELI5 Quick Start</a> — step-by-step for beginners</li>
<li><a href="#studio-overview">Studio UI</a> — visual dashboard walkthrough</li>
<li><a href="#cli-overview">CLI Reference</a> — full command documentation</li>
<li><a href="#api-reference">REST API</a> — programmatic integration</li>
<li><a href="#troubleshooting">Troubleshooting</a> — common issues and fixes</li>
</ul>
`;

PAGES["installation"] = `
<h1>Installation</h1>
<p class="subtitle">AMC runs on Node.js 18+ and works on macOS, Linux, and Windows (WSL).</p>

<h2>Prerequisites</h2>
<ul>
<li><strong>Node.js 18+</strong> — <a href="https://nodejs.org" target="_blank">Download Node.js</a> (we recommend the LTS version)</li>
<li><strong>npm</strong> — comes bundled with Node.js</li>
<li><strong>Git</strong> — for cloning the repo (optional, npm install works too)</li>
</ul>

<div class="callout info"><strong>Check your Node version</strong>
Run <code>node --version</code> in your terminal. You need v18.0.0 or higher.</div>

<h2>Option 1: Install from npm (Recommended)</h2>
<pre><code>npm install -g agent-maturity-compass</code></pre>
<p>This installs the <code>amc</code> CLI globally. Verify it works:</p>
<pre><code>amc --version
amc doctor</code></pre>

<h2>Option 2: Clone from GitHub</h2>
<pre><code>git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass
npm install
npm run build
node dist/cli.js --version</code></pre>

<h2>Option 3: Docker</h2>
<pre><code># Build the image
docker build -t amc-studio:local .

# Or use docker compose
cd deploy/compose
docker compose up -d</code></pre>
<p>See <a href="#docker">Docker &amp; Compose</a> for full deployment instructions.</p>

<h2>Initial Setup</h2>
<p>After installing, run the setup wizard:</p>
<pre><code># Interactive setup (recommended for first time)
amc setup

# Non-interactive (for CI/CD or scripting)
AMC_VAULT_PASSPHRASE=your-passphrase amc setup --non-interactive</code></pre>

<p>Setup will:</p>
<ol>
<li>Create a <code>.amc/</code> workspace directory</li>
<li>Generate signing keys (Ed25519)</li>
<li>Initialize an encrypted vault</li>
<li>Create default policies and configuration</li>
<li>Run sanity checks</li>
</ol>

<div class="callout warn"><strong>Remember your vault passphrase!</strong>
The vault passphrase encrypts your signing keys and secrets. If you lose it, you'll need to re-initialize the workspace. There is no recovery mechanism — this is by design.</div>

<h2>Verify Installation</h2>
<pre><code># Run the doctor to check everything
amc doctor

# Expected output:
# [PASS] node-version: Node 20.x.x
# [PASS] studio-running: Studio running
# [PASS] vault: Vault unlocked
# [PASS] sig-action-policy: action-policy.yaml signature valid
# ... (all checks should PASS)</code></pre>

<h2>Uninstall</h2>
<pre><code># Remove the CLI
npm uninstall -g agent-maturity-compass

# Remove workspace data (optional)
rm -rf .amc/</code></pre>
`;

PAGES["quickstart"] = `
<h1>Quick Start (ELI5)</h1>
<p class="subtitle">From zero to a scored agent in under 5 minutes. No prior knowledge needed.</p>

<div class="callout success"><strong>ELI5 = Explain Like I'm 5</strong>
This guide assumes you've never used AMC before. We'll walk through every step with plain English explanations.</div>

<h2>What You'll Do</h2>
<ol>
<li>Install AMC (1 command)</li>
<li>Set up a workspace (1 command)</li>
<li>Get your first maturity score (1 command)</li>
<li>Open the visual dashboard (1 command)</li>
</ol>

<h2>Step 1: Install AMC</h2>
<p>Open your terminal (Terminal on Mac, Command Prompt or WSL on Windows) and run:</p>
<pre><code>npm install -g agent-maturity-compass</code></pre>
<p><strong>What this does:</strong> Downloads AMC and makes the <code>amc</code> command available everywhere on your computer.</p>
<p><strong>Don't have npm?</strong> Install <a href="https://nodejs.org" target="_blank">Node.js</a> first — npm comes with it.</p>

<h2>Step 2: Set Up Your Workspace</h2>
<pre><code>mkdir my-agent-project
cd my-agent-project
amc setup</code></pre>
<p><strong>What this does:</strong> Creates a secure workspace where AMC stores all its data — signing keys, scores, evidence, and configuration. You'll be asked to pick a passphrase (like a password for your vault).</p>

<div class="callout info"><strong>What's a workspace?</strong>
Think of it like a project folder. Each workspace tracks one or more AI agents. The <code>.amc/</code> folder inside contains everything AMC needs.</div>

<h2>Step 3: Get Your First Score</h2>
<pre><code>amc quickscore</code></pre>
<p><strong>What this does:</strong> Runs a rapid 5-question assessment and gives you a preliminary maturity score. No agent connection needed — it evaluates your workspace setup.</p>
<p>You'll see output like:</p>
<pre><code>AMC Rapid Quickscore
Score: 8/25 (32%)
Preliminary maturity: L1
Top 3 improvement recommendations:
- AMC-1.1 Agent Charter & Scope: L0 → L3
- AMC-2.1 Aspiration Surfacing: L0 → L3
- AMC-3.1.1 Integrity: L0 → L3</code></pre>

<h2>Step 4: Open the Visual Dashboard</h2>
<pre><code>amc up</code></pre>
<p><strong>What this does:</strong> Starts the AMC Studio server with:</p>
<ul>
<li><strong>Compass Console</strong> at <code>http://localhost:3212/console</code> — full web UI with 52 pages</li>
<li><strong>Dashboard</strong> at <code>http://localhost:4173</code> — radar charts, heatmaps, timelines</li>
<li><strong>Gateway</strong> at <code>http://localhost:3210</code> — API proxy for your agents</li>
<li><strong>REST API</strong> at <code>http://localhost:3212/api/v1/</code> — programmatic access</li>
</ul>
<p>Open <code>http://localhost:3212/console</code> in your browser to see the full UI.</p>

<h2>Step 5: Run a Full Diagnostic</h2>
<pre><code># Run the full 126-question diagnostic
amc run

# View the report
amc report &lt;run-id&gt;

# Compare two runs over time
amc compare &lt;run-id-1&gt; &lt;run-id-2&gt;</code></pre>

<h2>Step 6: Connect a Real Agent (Optional)</h2>
<pre><code># Interactive connection wizard
amc connect

# Or connect a specific provider
amc adapters add openai --api-key sk-...
amc adapters add anthropic --api-key sk-ant-...</code></pre>

<h2>What's Next?</h2>
<ul>
<li><a href="#studio-overview">Explore the Studio UI</a> — visual walkthrough of every page</li>
<li><a href="#cli-commands">CLI Command Reference</a> — every command documented</li>
<li><a href="#questions">Understand the 126 Questions</a> — what AMC actually measures</li>
<li><a href="#assurance">Run Assurance Packs</a> — automated compliance checks</li>
</ul>
`;

PAGES["first-score"] = `
<h1>Your First Score</h1>
<p class="subtitle">Understanding what AMC measures and how scoring works.</p>

<h2>Scoring Overview</h2>
<p>AMC scores agents on a 6-level maturity scale:</p>
<table>
<tr><th>Level</th><th>Name</th><th>Description</th></tr>
<tr><td>L0</td><td>Ad Hoc</td><td>No governance, no evidence, no controls</td></tr>
<tr><td>L1</td><td>Initial</td><td>Basic awareness, some manual processes</td></tr>
<tr><td>L2</td><td>Managed</td><td>Documented policies, some automation</td></tr>
<tr><td>L3</td><td>Defined</td><td>Consistent processes, evidence collection active</td></tr>
<tr><td>L4</td><td>Quantitatively Managed</td><td>Metrics-driven, continuous monitoring</td></tr>
<tr><td>L5</td><td>Optimizing</td><td>Self-improving, predictive, industry-leading</td></tr>
</table>

<h2>Quick Score vs Full Diagnostic</h2>
<div class="card-grid">
<div class="card">
<h4>⚡ Quick Score</h4>
<p>5 high-signal questions. Takes &lt;2 minutes. Good for a preliminary assessment. Run with <code>amc quickscore</code>.</p>
</div>
<div class="card">
<h4>🔬 Full Diagnostic</h4>
<p>All 126 questions across 6 dimensions. Comprehensive maturity assessment with evidence gates. Run with <code>amc run</code>.</p>
</div>
</div>

<h2>The 5 Dimensions</h2>
<p>AMC organizes its 126 questions into 6 maturity dimensions:</p>
<table>
<tr><th>Dimension</th><th>Questions</th><th>What It Measures</th></tr>
<tr><td>Strategic Operations</td><td>9</td><td>Mission alignment, charter, scope boundaries</td></tr>
<tr><td>Leadership &amp; Autonomy</td><td>5</td><td>Decision authority, escalation, human oversight</td></tr>
<tr><td>Culture &amp; Alignment</td><td>15</td><td>Values, integrity, positioning, enablers</td></tr>
<tr><td>Governance &amp; Security</td><td>42</td><td>Policies, access control, threat defense, compliance</td></tr>
<tr><td>Skills &amp; Capabilities</td><td>40</td><td>Tool use, memory, reasoning, reliability, observability</td></tr>
</table>

<h2>Evidence-Gated Levels</h2>
<p>Unlike other frameworks, AMC doesn't let you self-report your way to L5. Each level requires <strong>cryptographically signed evidence</strong>:</p>
<ul>
<li><strong>L0–L1:</strong> Self-assessment answers accepted</li>
<li><strong>L2:</strong> Must provide documented policies</li>
<li><strong>L3:</strong> Must provide execution evidence (logs, artifacts)</li>
<li><strong>L4:</strong> Must provide metrics and monitoring data</li>
<li><strong>L5:</strong> Must provide longitudinal improvement data + external validation</li>
</ul>

<h2>Reading Your Score Report</h2>
<pre><code># Run a diagnostic
amc run

# View the report
amc report &lt;run-id&gt;

# Export as markdown or PDF
amc report &lt;run-id&gt; --format md > report.md
amc report &lt;run-id&gt; --format pdf > report.pdf</code></pre>

<p>The report includes:</p>
<ul>
<li>Overall maturity level (L0–L5)</li>
<li>Per-dimension scores with radar chart</li>
<li>Per-question breakdown with evidence status</li>
<li>Top improvement recommendations</li>
<li>Comparison with previous runs (if available)</li>
</ul>
`;

// ─── Studio UI ───
PAGES["studio-overview"] = `
<h1>Studio Overview</h1>
<p class="subtitle">AMC Studio is the visual control plane for managing agents, viewing scores, and running diagnostics.</p>

<h2>Starting Studio</h2>
<pre><code># Start everything (recommended)
amc up

# Or start just the studio server
amc studio start --port 3212</code></pre>

<p>When Studio starts, you get four services:</p>
<table>
<tr><th>Service</th><th>URL</th><th>Purpose</th></tr>
<tr><td>Compass Console</td><td><code>http://localhost:3212/console</code></td><td>Full web UI (52 pages)</td></tr>
<tr><td>Dashboard</td><td><code>http://localhost:4173</code></td><td>Charts, heatmaps, exports</td></tr>
<tr><td>REST API</td><td><code>http://localhost:3212/api/v1/</code></td><td>Programmatic access</td></tr>
<tr><td>Gateway</td><td><code>http://localhost:3210</code></td><td>Agent proxy with evidence capture</td></tr>
</table>

<h2>Studio Architecture</h2>
<pre><code>┌─────────────────────────────────────────────┐
│                AMC Studio                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Console  │  │Dashboard │  │  REST API  │ │
│  │ (52 pgs) │  │ (charts) │  │  (JSON)    │ │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘ │
│       └──────────────┼──────────────┘       │
│              ┌───────┴───────┐              │
│              │  Studio Core  │              │
│              │  (SQLite DB)  │              │
│              └───────┬───────┘              │
│       ┌──────────────┼──────────────┐       │
│  ┌────┴────┐  ┌──────┴─────┐ ┌─────┴────┐ │
│  │ Gateway │  │   Vault    │ │  Ledger   │ │
│  │ (proxy) │  │ (secrets)  │ │ (merkle)  │ │
│  └─────────┘  └────────────┘ └──────────┘  │
└─────────────────────────────────────────────┘</code></pre>

<h2>Stopping Studio</h2>
<pre><code># Stop all services
amc down

# Check status
amc status</code></pre>

<h2>Studio Health Check</h2>
<pre><code># Quick ping
amc studio ping

# Full health check (used by Docker/k8s)
amc studio healthcheck --workspace /path/to/.amc

# API health endpoint
curl http://localhost:3212/api/v1/health</code></pre>
`;

PAGES["console"] = `
<h1>Compass Console</h1>
<p class="subtitle">The full web UI for managing agents, viewing diagnostics, and configuring policies.</p>

<h2>Accessing the Console</h2>
<pre><code># Start Studio first
amc up

# Open in browser
open http://localhost:3212/console</code></pre>

<h2>Console Pages (52 total)</h2>
<p>The Compass Console includes these major sections:</p>

<h3>Agent Management</h3>
<table>
<tr><th>Page</th><th>Description</th></tr>
<tr><td>Home</td><td>Overview dashboard with agent status and quick actions</td></tr>
<tr><td>Agent</td><td>Individual agent details, config, and history</td></tr>
<tr><td>Fleet</td><td>Multi-agent fleet management and comparison</td></tr>
<tr><td>Compare</td><td>Side-by-side agent maturity comparison</td></tr>
</table>

<h3>Scoring &amp; Diagnostics</h3>
<table>
<tr><th>Page</th><th>Description</th></tr>
<tr><td>Score</td><td>Run and view maturity scores</td></tr>
<tr><td>Diagnostic</td><td>Full 126-question diagnostic runner</td></tr>
<tr><td>Heatmap</td><td>Visual heatmap of all question scores</td></tr>
<tr><td>Radar</td><td>Radar chart of dimension scores</td></tr>
<tr><td>Timeline</td><td>Score progression over time</td></tr>
</table>

<h3>Security &amp; Compliance</h3>
<table>
<tr><th>Page</th><th>Description</th></tr>
<tr><td>Assurance</td><td>Run and view assurance pack results</td></tr>
<tr><td>Audit</td><td>Audit binder with evidence chain</td></tr>
<tr><td>Advisories</td><td>Security advisories and vulnerability tracking</td></tr>
<tr><td>Incidents</td><td>Incident management and response</td></tr>
<tr><td>Policy</td><td>Policy-as-code editor and enforcement status</td></tr>
</table>

<h3>Trust &amp; Identity</h3>
<table>
<tr><th>Page</th><th>Description</th></tr>
<tr><td>Passport</td><td>Agent Passport generation and verification</td></tr>
<tr><td>Vault</td><td>Encrypted secret management</td></tr>
<tr><td>Approvals</td><td>Human approval queue for sensitive actions</td></tr>
<tr><td>Leases</td><td>Lease-based authentication management</td></tr>
</table>

<h3>Configuration</h3>
<table>
<tr><th>Page</th><th>Description</th></tr>
<tr><td>Adapters</td><td>Bridge adapter configuration (OpenAI, Anthropic, etc.)</td></tr>
<tr><td>Tools</td><td>ToolHub configuration and denylist</td></tr>
<tr><td>Budgets</td><td>Cost tracking and budget limits</td></tr>
<tr><td>Settings</td><td>Workspace and system settings</td></tr>
</table>

<h2>Authentication</h2>
<p>The Console uses session-based auth. On first access, log in with the owner credentials created during <code>amc setup</code>.</p>
<pre><code># Reset owner password if forgotten
amc user reset-password --username owner</code></pre>
`;

PAGES["dashboard"] = `
<h1>Dashboard &amp; Charts</h1>
<p class="subtitle">Visual analytics for agent maturity data.</p>

<h2>Accessing the Dashboard</h2>
<pre><code>amc up
# Dashboard available at http://localhost:4173</code></pre>

<h2>Dashboard Components</h2>

<h3>Layer Radar Chart</h3>
<p>A radar/spider chart showing scores across all 6 dimensions. Useful for identifying which areas need the most improvement.</p>

<h3>111-Question Heatmap</h3>
<p>Color-coded grid of all 126 questions. Green = high maturity, red = low maturity, gray = not assessed. Click any cell to see the question details and evidence status.</p>

<h3>Timeline</h3>
<p>Score progression over time. Shows how your agent's maturity has changed across diagnostic runs.</p>

<h3>Domain Breakdown</h3>
<p>Detailed per-dimension scoring with sub-category breakdowns.</p>

<h3>Exports</h3>
<ul>
<li><strong>Markdown Export</strong> — full report as .md file</li>
<li><strong>PDF Export</strong> — print-ready report with charts</li>
<li><strong>JSON Export</strong> — machine-readable data for CI/CD</li>
</ul>

<h2>Embedding Charts</h2>
<p>Dashboard charts can be embedded in external pages using the Studio API:</p>
<pre><code># Get chart data as JSON
curl http://localhost:3212/api/v1/score/latest?format=chart-data

# Get SVG radar chart
curl http://localhost:3212/api/v1/score/latest?format=svg-radar</code></pre>
`;

// ─── CLI Reference ───
PAGES["cli-overview"] = `
<h1>CLI Overview</h1>
<p class="subtitle">The <code>amc</code> CLI is the primary interface for all AMC operations.</p>

<h2>Global Options</h2>
<pre><code>amc [options] [command]

Options:
  -V, --version          Output version number
  --agent &lt;agentId&gt;      Agent ID (defaults to .amc/current-agent)
  -h, --help             Display help for command</code></pre>

<h2>Getting Help</h2>
<pre><code># General help
amc --help

# Help for a specific command
amc help run
amc score --help

# Discover subcommands
amc help &lt;command&gt;</code></pre>

<h2>Shell Completions</h2>
<pre><code># Install completions for your shell
amc completion bash >> ~/.bashrc
amc completion zsh >> ~/.zshrc
amc completion fish >> ~/.config/fish/completions/amc.fish</code></pre>

<h2>Command Namespaces</h2>
<p>AMC organizes commands into logical namespaces:</p>
<table>
<tr><th>Namespace</th><th>Commands</th></tr>
<tr><td>Lifecycle</td><td><code>init</code>, <code>setup</code>, <code>up</code>, <code>down</code>, <code>status</code>, <code>doctor</code></td></tr>
<tr><td>Scoring</td><td><code>quickscore</code>, <code>run</code>, <code>report</code>, <code>compare</code>, <code>score</code></td></tr>
<tr><td>Evidence</td><td><code>verify</code>, <code>evidence</code>, <code>claims</code></td></tr>
<tr><td>Security</td><td><code>shield</code>, <code>enforce</code>, <code>guardrails</code></td></tr>
<tr><td>Observability</td><td><code>watch</code>, <code>monitor</code>, <code>debug</code></td></tr>
<tr><td>Admin</td><td><code>vault</code>, <code>config</code>, <code>logs</code>, <code>api</code></td></tr>
<tr><td>Fleet</td><td><code>connect</code>, <code>adapters</code>, <code>supervise</code>, <code>wrap</code></td></tr>
<tr><td>Governance</td><td><code>policy</code>, <code>governor</code>, <code>incidents</code>, <code>oversight</code></td></tr>
<tr><td>Product</td><td><code>product</code>, <code>domain</code>, <code>glossary</code>, <code>playground</code></td></tr>
</table>
`;

PAGES["cli-commands"] = `
<h1>Command Reference</h1>
<p class="subtitle">Complete reference for all AMC CLI commands.</p>

<h2>Lifecycle Commands</h2>

<h3><code>amc init</code></h3>
<p>Initialize a new <code>.amc</code> workspace in the current directory.</p>
<pre><code>amc init</code></pre>

<h3><code>amc setup</code></h3>
<p>Full setup wizard — creates workspace, generates keys, initializes vault, configures policies.</p>
<pre><code># Interactive
amc setup

# Non-interactive (for CI/CD)
AMC_VAULT_PASSPHRASE=mypass amc setup --non-interactive</code></pre>

<h3><code>amc up</code></h3>
<p>Start the full AMC control plane (Studio + Gateway + Bridge) as a background daemon.</p>
<pre><code>amc up</code></pre>

<h3><code>amc down</code></h3>
<p>Stop the AMC Studio daemon.</p>
<pre><code>amc down</code></pre>

<h3><code>amc status</code></h3>
<p>Show current Studio and vault status.</p>
<pre><code>amc status</code></pre>

<h3><code>amc doctor</code></h3>
<p>Run comprehensive health checks on the workspace.</p>
<pre><code>amc doctor</code></pre>

<h3><code>amc doctor-fix</code></h3>
<p>Auto-repair common setup issues found by doctor.</p>
<pre><code>amc doctor-fix</code></pre>

<h2>Scoring Commands</h2>

<h3><code>amc quickscore</code></h3>
<p>Zero-config 5-question rapid assessment. Takes under 2 minutes.</p>
<pre><code>amc quickscore
amc quickscore --json</code></pre>

<h3><code>amc run</code></h3>
<p>Run the full 126-question maturity diagnostic.</p>
<pre><code>amc run
amc run --agent my-agent
amc run --dimension governance</code></pre>

<h3><code>amc report &lt;runId&gt;</code></h3>
<p>Render a human-readable report for a diagnostic run.</p>
<pre><code>amc report abc123
amc report abc123 --format md
amc report abc123 --format json</code></pre>

<h3><code>amc compare &lt;runA&gt; &lt;runB&gt;</code></h3>
<p>Compare two diagnostic runs side-by-side.</p>
<pre><code>amc compare run-001 run-002</code></pre>

<h3><code>amc score</code></h3>
<p>Advanced scoring operations including adversarial testing and evidence collection.</p>
<pre><code>amc score --agent my-agent --json
amc score adversarial --agent my-agent</code></pre>

<h3><code>amc explain &lt;questionId&gt;</code></h3>
<p>Get a plain-English explanation of any diagnostic question.</p>
<pre><code>amc explain AMC-2.1
amc explain AMC-4.3.2</code></pre>

<h2>Security Commands</h2>

<h3><code>amc shield</code></h3>
<p>Threat detection and security scanning.</p>
<pre><code>amc shield scan --agent my-agent
amc shield status</code></pre>

<h3><code>amc enforce</code></h3>
<p>Policy enforcement and guardrails management.</p>
<pre><code>amc enforce status
amc enforce check --policy action-policy.yaml</code></pre>

<h3><code>amc guardrails</code></h3>
<p>Simple guardrail management for quick policy setup.</p>
<pre><code>amc guardrails add --rule "no-external-api-calls"
amc guardrails list</code></pre>

<h2>Evidence Commands</h2>

<h3><code>amc verify</code></h3>
<p>Verify integrity across all AMC artifacts (signatures, Merkle tree, ledger).</p>
<pre><code>amc verify</code></pre>

<h3><code>amc evidence</code></h3>
<p>Evidence lifecycle workflows — collect, sign, bundle, and export.</p>
<pre><code>amc evidence list
amc evidence bundle --run-id abc123
amc evidence export --format json</code></pre>

<h2>Admin Commands</h2>

<h3><code>amc vault</code></h3>
<p>Vault operations — unlock, lock, rotate keys.</p>
<pre><code>amc vault unlock
amc vault lock
amc vault status</code></pre>

<h3><code>amc config</code></h3>
<p>Inspect resolved runtime configuration.</p>
<pre><code>amc config</code></pre>

<h3><code>amc logs</code></h3>
<p>Print latest AMC Studio logs.</p>
<pre><code>amc logs
amc logs --lines 100
amc logs --follow</code></pre>

<h2>Advanced Commands</h2>

<h3><code>amc wrap</code></h3>
<p>Wrap any agent runtime and capture tamper-evident evidence.</p>
<pre><code>amc wrap python my_agent.py
amc wrap node agent.js -- --port 8080</code></pre>

<h3><code>amc supervise</code></h3>
<p>Supervise any agent process with gateway/proxy routing.</p>
<pre><code>amc supervise -- python my_agent.py</code></pre>

<h3><code>amc scan</code></h3>
<p>Zero-integration agent assessment scanner.</p>
<pre><code>amc scan --url https://my-agent.example.com</code></pre>

<h3><code>amc vibe-audit</code></h3>
<p>Run static safety checks for AI-generated code.</p>
<pre><code>amc vibe-audit --path ./src</code></pre>

<h3><code>amc playground</code></h3>
<p>Interactive scenario runner for testing agent behavior.</p>
<pre><code>amc playground</code></pre>
`;

PAGES["cli-fleet"] = `
<h1>Fleet Management</h1>
<p class="subtitle">Managing multiple agents from a single AMC workspace.</p>

<h2>Adding Agents</h2>
<pre><code># Interactive wizard
amc connect

# Add a specific provider adapter
amc adapters add openai --api-key sk-...
amc adapters add anthropic --api-key sk-ant-...
amc adapters add gemini --api-key AIza...
amc adapters add grok --api-key xai-...</code></pre>

<h2>Fleet Operations</h2>
<pre><code># List all agents
amc fleet list

# Switch active agent
amc fleet switch my-agent

# Compare agents
amc fleet compare agent-a agent-b

# Remove an agent
amc fleet remove old-agent</code></pre>

<h2>Supported Adapters</h2>
<table>
<tr><th>Provider</th><th>Adapter</th><th>Gateway Route</th></tr>
<tr><td>OpenAI</td><td><code>openai</code></td><td><code>/openai</code></td></tr>
<tr><td>Anthropic</td><td><code>anthropic</code></td><td><code>/anthropic</code></td></tr>
<tr><td>Google Gemini</td><td><code>gemini</code></td><td><code>/gemini</code></td></tr>
<tr><td>xAI Grok</td><td><code>grok</code></td><td><code>/grok</code></td></tr>
<tr><td>OpenRouter</td><td><code>openrouter</code></td><td><code>/openrouter</code></td></tr>
<tr><td>Local (Ollama)</td><td><code>local</code></td><td><code>/local</code></td></tr>
</table>

<h2>Agent Supervision</h2>
<p>Wrap any agent process to capture evidence automatically:</p>
<pre><code># Wrap a Python agent
amc wrap python my_agent.py

# Wrap a Node.js agent
amc wrap node agent.js

# Supervise with env var injection
amc supervise -- python my_agent.py</code></pre>
<p>The wrapper injects <code>AMC_GATEWAY_URL</code> and <code>AMC_PROXY_URL</code> environment variables so your agent routes through AMC's evidence-capturing proxy.</p>
`;

PAGES["cli-scoring"] = `
<h1>Scoring &amp; Diagnostics</h1>
<p class="subtitle">Deep dive into AMC's scoring engine and diagnostic capabilities.</p>

<h2>Scoring Pipeline</h2>
<pre><code>Questions → Answers → Evidence Check → Level Assignment → Dimension Score → Overall Score</code></pre>

<h3>1. Question Bank</h3>
<p>126 questions organized into 6 dimensions. Each question has:</p>
<ul>
<li>A unique ID (e.g., <code>AMC-4.3.2</code>)</li>
<li>Level criteria for L0 through L5</li>
<li>Required evidence types per level</li>
<li>Anti-gaming checks</li>
</ul>

<h3>2. Evidence Gating</h3>
<p>Answers alone don't determine your level. AMC checks for supporting evidence:</p>
<pre><code># View evidence requirements for a question
amc explain AMC-2.1 --evidence

# List collected evidence
amc evidence list --question AMC-2.1</code></pre>

<h3>3. Anti-Gaming</h3>
<p>AMC includes multiple anti-gaming protections:</p>
<ul>
<li><strong>Temporal consistency</strong> — can't jump from L0 to L5 overnight</li>
<li><strong>Cross-reference validation</strong> — answers must be consistent across related questions</li>
<li><strong>Evidence freshness</strong> — stale evidence degrades over time</li>
<li><strong>Merkle tree integrity</strong> — tampered evidence is detected</li>
</ul>

<h2>Advanced Scoring</h2>
<pre><code># Score with adversarial testing
amc score adversarial --agent my-agent

# Score with confidence intervals
amc meta-confidence --agent my-agent

# View confidence breakdown
amc confidence-components --agent my-agent

# Track known unknowns
amc unknowns --agent my-agent</code></pre>

<h2>Score History</h2>
<pre><code># List all diagnostic runs
amc history

# Compare two runs
amc compare run-001 run-002

# Track confidence drift
amc confidence drift --agent my-agent</code></pre>
`;

// ─── Core Concepts ───
PAGES["architecture"] = `
<h1>Architecture</h1>
<p class="subtitle">How AMC is built and how the components fit together.</p>

<h2>System Architecture</h2>
<pre><code>┌─────────────────────────────────────────────────────────┐
│                    AMC Platform                          │
│                                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐  │
│  │  Score   │  │ Shield  │  │ Enforce │  │  Watch   │  │
│  │(diagnose)│  │(threats)│  │(policy) │  │(observe) │  │
│  └────┬─────┘  └────┬────┘  └────┬────┘  └────┬─────┘  │
│       └──────────────┼───────────┼─────────────┘        │
│              ┌───────┴───────────┴───────┐              │
│              │      Core Engine          │              │
│              │  ┌──────┐ ┌──────────┐   │              │
│              │  │Canon │ │ Question │   │              │
│              │  │(spec)│ │  Bank    │   │              │
│              │  └──────┘ └──────────┘   │              │
│              └───────────┬───────────────┘              │
│       ┌──────────────────┼──────────────────┐           │
│  ┌────┴────┐  ┌──────────┴──────┐  ┌───────┴────┐     │
│  │  Vault  │  │  Evidence Ledger│  │  Gateway   │     │
│  │(secrets)│  │  (Merkle tree)  │  │  (proxy)   │     │
│  └─────────┘  └─────────────────┘  └────────────┘     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Bridge Adapters                      │   │
│  │  OpenAI │ Anthropic │ Gemini │ Grok │ OpenRouter │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘</code></pre>

<h2>Key Components</h2>

<h3>Canon</h3>
<p>The canonical specification — a signed YAML file that defines the 6 dimensions, 126 questions, scoring rubrics, and evidence requirements. The canon is cryptographically signed to prevent tampering.</p>

<h3>Question Bank</h3>
<p>The runtime representation of all 126 diagnostic questions with their level criteria, evidence gates, and anti-gaming rules.</p>

<h3>Evidence Ledger</h3>
<p>A Merkle-tree backed, append-only ledger that stores all evidence artifacts. Each entry is cryptographically signed and chained to the previous entry, making tampering detectable.</p>

<h3>Vault</h3>
<p>AES-256-GCM encrypted storage for signing keys, API credentials, and sensitive configuration. Unlocked with a passphrase at runtime.</p>

<h3>Gateway</h3>
<p>An HTTP proxy that sits between your agent and its LLM provider. Captures request/response evidence, enforces policies, and tracks usage.</p>

<h3>Bridge Adapters</h3>
<p>Provider-specific adapters that translate between AMC's internal format and each LLM provider's API (OpenAI, Anthropic, Gemini, etc.).</p>

<h2>Data Flow</h2>
<ol>
<li>Agent makes an API call through the Gateway</li>
<li>Gateway captures the request as evidence</li>
<li>Request is forwarded to the LLM provider via the Bridge adapter</li>
<li>Response is captured and signed</li>
<li>Evidence is appended to the Merkle-tree ledger</li>
<li>Policies are checked (Enforce module)</li>
<li>Metrics are updated (Watch module)</li>
</ol>

<h2>File Structure</h2>
<pre><code>.amc/
├── canon/
│   └── canon.yaml          # Signed canonical spec
├── keys/
│   ├── auditor_ed25519.pub # Signing keys
│   ├── lease_ed25519.pub
│   └── session_ed25519.pub
├── vault.amcvault           # Encrypted vault
├── amc.config.yaml          # Runtime config
├── action-policy.yaml       # Action policies
├── adapters.yaml            # Bridge adapter config
├── gateway.yaml             # Gateway config
├── trust.yaml               # Trust configuration
├── tools.yaml               # ToolHub config
├── budgets.yaml             # Budget limits
└── agents/
    └── default/
        ├── ledger.db        # Evidence ledger (SQLite)
        └── runs/            # Diagnostic run data</code></pre>
`;

PAGES["trust-model"] = `
<h1>Trust Model</h1>
<p class="subtitle">How AMC establishes, verifies, and maintains trust.</p>

<h2>Trust Tiers</h2>
<p>AMC uses a tiered trust model where trust is earned through evidence, not claimed through assertions:</p>
<table>
<tr><th>Tier</th><th>Trust Level</th><th>How It's Earned</th></tr>
<tr><td>T0</td><td>Untrusted</td><td>Default state — no evidence provided</td></tr>
<tr><td>T1</td><td>Self-Attested</td><td>Agent provides self-assessment answers</td></tr>
<tr><td>T2</td><td>Evidence-Backed</td><td>Signed execution evidence supports claims</td></tr>
<tr><td>T3</td><td>Independently Verified</td><td>Third-party or automated verification</td></tr>
<tr><td>T4</td><td>Continuously Monitored</td><td>Real-time evidence stream with drift detection</td></tr>
</table>

<h2>Cryptographic Foundations</h2>
<ul>
<li><strong>Ed25519 signing keys</strong> — all evidence is signed</li>
<li><strong>Merkle tree ledger</strong> — append-only, tamper-evident</li>
<li><strong>AES-256-GCM vault</strong> — encrypted secret storage</li>
<li><strong>HMAC chain integrity</strong> — each ledger entry chains to the previous</li>
</ul>

<h2>Trust Modes</h2>
<pre><code># Check current trust mode
amc config | grep trust

# Trust modes:
# LOCAL_VAULT — keys stored in local encrypted vault
# NOTARY — keys managed by external notary service
# HSM — hardware security module (enterprise)</code></pre>

<h2>Agent Passport</h2>
<p>The Agent Passport is a portable trust credential that agents can present to prove their maturity level. See <a href="#passport">Agent Passport</a> for details.</p>
`;

PAGES["evidence"] = `
<h1>Evidence &amp; Ledger</h1>
<p class="subtitle">How AMC collects, signs, and verifies execution evidence.</p>

<h2>What is Evidence?</h2>
<p>Evidence is any artifact that proves an agent's behavior matches its claims. Examples:</p>
<ul>
<li>API request/response logs (captured by Gateway)</li>
<li>Policy enforcement decisions</li>
<li>Error handling behavior</li>
<li>Tool usage patterns</li>
<li>Human approval records</li>
<li>Configuration snapshots</li>
</ul>

<h2>Evidence Lifecycle</h2>
<pre><code>Capture → Sign → Append to Ledger → Verify → Bundle → Export</code></pre>

<h3>Capture</h3>
<p>Evidence is captured automatically when agents run through the AMC Gateway, or manually via CLI:</p>
<pre><code># Automatic: wrap your agent
amc wrap python my_agent.py

# Manual: submit evidence
amc evidence submit --type policy-check --data '{"result":"pass"}'</code></pre>

<h3>Verify</h3>
<pre><code># Verify all evidence integrity
amc verify

# Check specific evidence chain
amc evidence verify --agent my-agent</code></pre>

<h3>Bundle &amp; Export</h3>
<pre><code># Create an evidence bundle for a run
amc evidence bundle --run-id abc123

# Export for external audit
amc evidence export --format json --output evidence.json</code></pre>

<h2>Merkle Tree Ledger</h2>
<p>All evidence is stored in an append-only Merkle tree. This means:</p>
<ul>
<li>You can't delete or modify past evidence</li>
<li>Any tampering is cryptographically detectable</li>
<li>The full chain can be independently verified</li>
<li>Evidence freshness is tracked (stale evidence degrades)</li>
</ul>

<h2>Evidence Claims &amp; Expiry</h2>
<pre><code># Track evidence claim expiry
amc claims list --agent my-agent

# View expiring claims
amc claims expiring --days 30</code></pre>
`;

PAGES["questions"] = `
<h1>111 Questions</h1>
<p class="subtitle">The complete diagnostic question bank organized by dimension.</p>

<h2>Question Format</h2>
<p>Each question has:</p>
<ul>
<li><strong>ID</strong> — unique identifier (e.g., <code>AMC-1.1</code>)</li>
<li><strong>Dimension</strong> — which of the 6 dimensions it belongs to</li>
<li><strong>Text</strong> — the question itself</li>
<li><strong>Level criteria</strong> — what constitutes L0 through L5</li>
<li><strong>Evidence requirements</strong> — what proof is needed per level</li>
</ul>

<h2>Exploring Questions</h2>
<pre><code># Get plain-English explanation of any question
amc explain AMC-2.1

# List all questions
amc run --list-questions

# View questions by dimension
amc run --list-questions --dimension governance</code></pre>

<h2>Dimension 1: Strategic Agent Operations (17 questions)</h2>
<p>Covers mission clarity, scope adherence, decision traceability, and agent charter.</p>
<ul>
<li>AMC-SAO-1.x — Mission alignment and scope boundaries</li>
<li>AMC-SAO-2.x — Decision traceability and audit hooks</li>
<li>And more...</li>
</ul>

<h2>Dimension 2: Skills (33 questions)</h2>
<p>Covers tool mastery, injection defense, DLP, zero-trust tool use.</p>

<h2>Dimension 3: Resilience (27 questions)</h2>
<p>Covers graceful degradation, circuit breakers, monitor bypass resistance, error recovery.</p>

<h2>Dimension 4: Leadership &amp; Autonomy (21 questions)</h2>
<p>Covers structured logs, traces, cost tracking, SLO monitoring, human oversight quality.</p>

<h2>Dimension 5: Culture &amp; Alignment (20 questions)</h2>
<p>Covers test harnesses, benchmarks, feedback loops, regression detection, alignment index.</p>

<h2>Dimension 6: Evaluation &amp; Growth (8 questions)</h2>
<p>Covers over-compliance detection (H-Neurons, arXiv:2512.01797), behavioral calibration, self-improvement loops.</p>
<ul>
<li>AMC-OC-1 through AMC-OC-8 — Over-compliance diagnostic questions</li>
</ul>

<div class="callout info"><strong>Full Question Bank</strong>
The complete question bank with all level criteria is available in the repo at <code>docs/AMC_QUESTION_BANK_FULL.json</code> and via the API at <code>/api/v1/questions</code>.</div>
`;

PAGES["assurance"] = `
<h1>Assurance Packs</h1>
<p class="subtitle">Pre-built compliance and safety check suites.</p>

<h2>What are Assurance Packs?</h2>
<p>Assurance packs are curated sets of automated checks that verify specific compliance or safety requirements. Think of them as test suites for agent governance.</p>

<h2>Built-in Packs</h2>
<table>
<tr><th>Pack</th><th>Checks</th><th>Description</th></tr>
<tr><td>owasp-llm-top10</td><td>10</td><td>OWASP LLM Top 10 vulnerability checks</td></tr>
<tr><td>eu-ai-act</td><td>13</td><td>EU AI Act Article compliance</td></tr>
<tr><td>soc2-trust</td><td>8</td><td>SOC 2 trust service criteria</td></tr>
<tr><td>iso-42001</td><td>12</td><td>ISO/IEC 42001 AI management system</td></tr>
<tr><td>excessive-agency</td><td>6</td><td>Checks for over-permissioned agents</td></tr>
<tr><td>behavioral-contract</td><td>8</td><td>Behavioral contract violation detection</td></tr>
<tr><td>overreliance</td><td>5</td><td>Human overreliance on agent output</td></tr>
<tr><td>adversarial-robustness</td><td>10</td><td>Prompt injection and jailbreak resistance</td></tr>
<tr><td>multi-turn-safety</td><td>7</td><td>Multi-turn conversation safety</td></tr>
<tr><td>supply-chain-integrity</td><td>6</td><td>Tool and dependency supply chain checks</td></tr>
<tr><td>context-leakage</td><td>5</td><td>Context window information leakage</td></tr>
<tr><td>operational-discipline</td><td>8</td><td>Operational maturity and process checks</td></tr>
</table>

<h2>Running Assurance Packs</h2>
<pre><code># Run a specific pack
amc assurance run --pack owasp-llm-top10

# Run all packs
amc assurance run --all

# View results
amc assurance status
amc assurance report --pack eu-ai-act

# Generate compliance certificate
amc assurance cert --pack soc2-trust</code></pre>

<h2>Custom Packs</h2>
<p>Create your own assurance packs for organization-specific requirements:</p>
<pre><code># Create a custom pack
amc assurance create --name my-org-checks

# Add checks to the pack
amc assurance add-check --pack my-org-checks --check "data-retention-policy"</code></pre>
`;

// ─── API & Integration ───
PAGES["api-reference"] = `
<h1>REST API</h1>
<p class="subtitle">Programmatic access to all AMC functionality.</p>

<h2>Base URL</h2>
<pre><code>http://localhost:3212/api/v1/</code></pre>

<h2>Authentication</h2>
<p>The API supports multiple auth methods:</p>
<pre><code># Bearer token
curl -H "Authorization: Bearer &lt;token&gt;" http://localhost:3212/api/v1/health

# API key
curl -H "x-api-key: &lt;key&gt;" http://localhost:3212/api/v1/health

# Session cookie (from Console login)
curl -b session=&lt;cookie&gt; http://localhost:3212/api/v1/health</code></pre>

<h2>Core Endpoints</h2>

<h3>Health &amp; Status</h3>
<table>
<tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
<tr><td>GET</td><td><code>/api/v1/health</code></td><td>Health check (status, version, uptime)</td></tr>
<tr><td>GET</td><td><code>/readyz</code></td><td>Readiness probe (all subsystem checks)</td></tr>
<tr><td>GET</td><td><code>/metrics</code></td><td>Prometheus metrics (port 9464)</td></tr>
</table>

<h3>Scoring</h3>
<table>
<tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
<tr><td>POST</td><td><code>/api/v1/score</code></td><td>Run a maturity score</td></tr>
<tr><td>GET</td><td><code>/api/v1/score/latest</code></td><td>Get latest score for an agent</td></tr>
<tr><td>GET</td><td><code>/api/v1/runs</code></td><td>List diagnostic runs</td></tr>
<tr><td>GET</td><td><code>/api/v1/runs/:id</code></td><td>Get run details</td></tr>
<tr><td>GET</td><td><code>/api/v1/runs/:id/report</code></td><td>Get formatted report</td></tr>
</table>

<h3>Questions</h3>
<table>
<tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
<tr><td>GET</td><td><code>/api/v1/questions</code></td><td>List all 126 questions</td></tr>
<tr><td>GET</td><td><code>/api/v1/questions/:id</code></td><td>Get question details</td></tr>
<tr><td>GET</td><td><code>/api/v1/questions/:id/explain</code></td><td>Plain-English explanation</td></tr>
</table>

<h3>Evidence</h3>
<table>
<tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
<tr><td>GET</td><td><code>/api/v1/evidence</code></td><td>List evidence entries</td></tr>
<tr><td>POST</td><td><code>/api/v1/evidence</code></td><td>Submit new evidence</td></tr>
<tr><td>GET</td><td><code>/api/v1/evidence/verify</code></td><td>Verify evidence chain</td></tr>
</table>

<h3>Agents</h3>
<table>
<tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
<tr><td>GET</td><td><code>/api/v1/agents</code></td><td>List agents</td></tr>
<tr><td>POST</td><td><code>/api/v1/agents</code></td><td>Register new agent</td></tr>
<tr><td>GET</td><td><code>/api/v1/agents/:id</code></td><td>Get agent details</td></tr>
<tr><td>GET</td><td><code>/api/v1/agents/:id/passport</code></td><td>Get agent passport</td></tr>
</table>

<h3>Assurance</h3>
<table>
<tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
<tr><td>POST</td><td><code>/api/v1/assurance/run</code></td><td>Run assurance pack</td></tr>
<tr><td>GET</td><td><code>/api/v1/assurance/status</code></td><td>Get assurance status</td></tr>
<tr><td>GET</td><td><code>/api/v1/assurance/packs</code></td><td>List available packs</td></tr>
</table>

<h3>Incidents</h3>
<table>
<tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
<tr><td>GET</td><td><code>/api/v1/incidents</code></td><td>List incidents</td></tr>
<tr><td>POST</td><td><code>/api/v1/incidents</code></td><td>Create incident</td></tr>
<tr><td>PATCH</td><td><code>/api/v1/incidents/:id</code></td><td>Update incident</td></tr>
</table>

<h2>Response Format</h2>
<p>All API responses are JSON:</p>
<pre><code>{
  "status": "ok",
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-22T17:30:00Z",
    "version": "1.0.0"
  }
}</code></pre>

<h2>Error Handling</h2>
<pre><code>{
  "status": "error",
  "error": {
    "code": "VAULT_LOCKED",
    "message": "Vault must be unlocked to perform this operation"
  }
}</code></pre>
`;

PAGES["bridge"] = `
<h1>Bridge Adapters</h1>
<p class="subtitle">Connect AMC to any LLM provider with one-line adapter configuration.</p>

<h2>How Bridge Works</h2>
<p>The Bridge sits between your agent and its LLM provider. It:</p>
<ol>
<li>Intercepts API calls</li>
<li>Captures request/response as evidence</li>
<li>Enforces policies (rate limits, content filters, budget caps)</li>
<li>Forwards to the actual provider</li>
<li>Returns the response to your agent</li>
</ol>

<h2>Supported Providers</h2>
<pre><code># Add adapters
amc adapters add openai --api-key sk-...
amc adapters add anthropic --api-key sk-ant-...
amc adapters add gemini --api-key AIza...
amc adapters add grok --api-key xai-...
amc adapters add openrouter --api-key sk-or-...

# List configured adapters
amc adapters list

# Test an adapter
amc adapters test openai</code></pre>

<h2>Using the Bridge</h2>
<p>Point your agent at the AMC Gateway instead of the provider directly:</p>
<pre><code># Instead of: https://api.openai.com/v1
# Use:        http://localhost:3210/openai/v1

# Python example
import openai
client = openai.OpenAI(
    base_url="http://localhost:3210/openai/v1",
    api_key="your-key"  # or use AMC lease token
)</code></pre>

<h2>Prompt Policy Enforcement</h2>
<p>The Bridge can enforce prompt policies — rules about what agents can and can't say:</p>
<pre><code># Check prompt policy status
amc policy prompt status

# View enforcement mode
amc policy prompt mode  # ENFORCE | AUDIT | OFF</code></pre>
`;

PAGES["passport"] = `
<h1>Agent Passport</h1>
<p class="subtitle">Portable, cryptographic trust credentials for AI agents.</p>

<h2>What is an Agent Passport?</h2>
<p>An Agent Passport is a signed document that proves an agent's maturity level. Think of it like a driver's license for AI agents — it contains verified claims about the agent's capabilities and trustworthiness.</p>

<h2>Passport Contents</h2>
<ul>
<li>Agent identity (name, version, provider)</li>
<li>Maturity level (L0–L5) with timestamp</li>
<li>Per-dimension scores</li>
<li>Evidence summary hash</li>
<li>Assurance pack results</li>
<li>Issuer signature (Ed25519)</li>
<li>Expiry date</li>
</ul>

<h2>Generating a Passport</h2>
<pre><code># Generate passport for current agent
amc passport generate

# Generate with specific validity period
amc passport generate --valid-days 90

# Export passport
amc passport export --format json > passport.json
amc passport export --format badge > badge.svg</code></pre>

<h2>Verifying a Passport</h2>
<pre><code># Verify a passport file
amc passport verify passport.json

# Verify via API
curl -X POST http://localhost:3212/api/v1/passport/verify \\
  -H "Content-Type: application/json" \\
  -d @passport.json</code></pre>
`;

PAGES["sdk"] = `
<h1>SDK &amp; Wrappers</h1>
<p class="subtitle">Integrate AMC into your agent programmatically.</p>

<h2>Node.js SDK</h2>
<p>AMC is written in TypeScript and can be imported directly:</p>
<pre><code>import { AmcClient } from 'agent-maturity-compass/sdk';

const amc = new AmcClient({
  baseUrl: 'http://localhost:3212',
  apiKey: 'your-api-key'
});

// Get health status
const health = await amc.health();

// Run a quick score
const score = await amc.quickscore({ agent: 'my-agent' });

// Get latest score
const latest = await amc.score.latest({ agent: 'my-agent' });

// Submit evidence
await amc.evidence.submit({
  type: 'policy-check',
  data: { result: 'pass', policy: 'no-pii-leak' }
});</code></pre>

<h2>REST API (Any Language)</h2>
<p>Any language that can make HTTP requests can use AMC. See <a href="#api-reference">REST API Reference</a>.</p>

<h2>CI/CD Integration</h2>
<pre><code># GitHub Actions example
- name: AMC Score Gate
  run: |
    npm i -g agent-maturity-compass
    amc setup --non-interactive
    SCORE=$(amc quickscore --json | jq '.score')
    if [ "$SCORE" -lt 15 ]; then
      echo "AMC score too low: $SCORE/25"
      exit 1
    fi</code></pre>

<h2>Environment Variables</h2>
<table>
<tr><th>Variable</th><th>Description</th></tr>
<tr><td><code>AMC_VAULT_PASSPHRASE</code></td><td>Vault passphrase (for non-interactive use)</td></tr>
<tr><td><code>AMC_WORKSPACE_DIR</code></td><td>Workspace directory path</td></tr>
<tr><td><code>AMC_GATEWAY_URL</code></td><td>Gateway URL (injected by <code>amc supervise</code>)</td></tr>
<tr><td><code>AMC_PROXY_URL</code></td><td>Proxy URL (injected by <code>amc supervise</code>)</td></tr>
<tr><td><code>AMC_BIND</code></td><td>Bind address for Studio</td></tr>
<tr><td><code>AMC_STUDIO_PORT</code></td><td>Studio API port (default: 3212)</td></tr>
<tr><td><code>AMC_GATEWAY_PORT</code></td><td>Gateway port (default: 3210)</td></tr>
</table>
`;

// ─── Deployment ───
PAGES["docker"] = `
<h1>Docker &amp; Compose</h1>
<p class="subtitle">Production deployment with Docker containers.</p>

<h2>Quick Start with Docker Compose</h2>
<pre><code># Clone the repo
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass/deploy/compose

# Create secrets
mkdir -p secrets
echo "your-vault-passphrase" > secrets/amc_vault_passphrase.txt
echo "admin" > secrets/amc_owner_username.txt
echo "your-password" > secrets/amc_owner_password.txt
echo "notary-passphrase" > secrets/amc_notary_passphrase.txt
echo "notary-auth-secret" > secrets/amc_notary_auth_secret.txt

# Start
docker compose up -d</code></pre>

<h2>Services</h2>
<table>
<tr><th>Service</th><th>Port</th><th>Description</th></tr>
<tr><td>amc-studio</td><td>3210, 3211, 3212</td><td>Main Studio with Gateway, Proxy, and API</td></tr>
<tr><td>amc-notary</td><td>4343 (internal)</td><td>Notary service for external attestation</td></tr>
</table>

<h2>Security Features</h2>
<p>The Docker setup includes production-grade security:</p>
<ul>
<li><strong>Read-only filesystem</strong> — containers run with <code>read_only: true</code></li>
<li><strong>Dropped capabilities</strong> — <code>cap_drop: ALL</code></li>
<li><strong>Non-root user</strong> — runs as UID 10001</li>
<li><strong>Docker secrets</strong> — no env vars for sensitive data</li>
<li><strong>Health checks</strong> — automatic restart on failure</li>
<li><strong>tmpfs for /tmp</strong> — no persistent temp files</li>
</ul>

<h2>TLS with Caddy</h2>
<pre><code># Use the TLS compose file for HTTPS
docker compose -f docker-compose.tls.yml up -d</code></pre>
<p>This adds a Caddy reverse proxy with automatic HTTPS certificates.</p>

<h2>Environment Variables</h2>
<table>
<tr><th>Variable</th><th>Default</th><th>Description</th></tr>
<tr><td><code>AMC_BOOTSTRAP</code></td><td>1</td><td>Run bootstrap on first start</td></tr>
<tr><td><code>AMC_STUDIO_PORT</code></td><td>3212</td><td>Studio API port</td></tr>
<tr><td><code>AMC_GATEWAY_PORT</code></td><td>3210</td><td>Gateway port</td></tr>
<tr><td><code>AMC_LAN_MODE</code></td><td>true</td><td>Restrict to LAN access</td></tr>
<tr><td><code>AMC_ALLOWED_CIDRS</code></td><td>private ranges</td><td>Allowed IP ranges</td></tr>
<tr><td><code>AMC_ENABLE_NOTARY</code></td><td>0</td><td>Enable notary service</td></tr>
</table>

<h2>Building the Image</h2>
<pre><code># Build locally
docker build -t amc-studio:local .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t amc-studio:local .</code></pre>
`;

PAGES["multi-workspace"] = `
<h1>Multi-Workspace</h1>
<p class="subtitle">Host mode for managing multiple workspaces from a single AMC instance.</p>

<h2>What is Host Mode?</h2>
<p>Host mode lets you run a single AMC Studio instance that manages multiple workspaces — useful for teams, organizations, or managed service providers.</p>

<h2>Setting Up Host Mode</h2>
<pre><code># Initialize host mode
amc setup --mode host

# Or convert existing workspace
amc host init</code></pre>

<h2>Managing Workspaces</h2>
<pre><code># Create a new workspace
amc host workspace create --name team-alpha

# List workspaces
amc host workspace list

# Switch workspace
amc host workspace switch team-alpha

# Delete workspace
amc host workspace delete old-workspace</code></pre>

<h2>Access Control</h2>
<p>Host mode supports per-workspace access control:</p>
<pre><code># Add user to workspace
amc host user add --workspace team-alpha --username alice

# Set role
amc host user role --workspace team-alpha --username alice --role admin</code></pre>
`;

PAGES["security-hardening"] = `
<h1>Security Hardening</h1>
<p class="subtitle">Best practices for securing your AMC deployment.</p>

<h2>Checklist</h2>
<div class="callout warn"><strong>Production Deployment Checklist</strong>
Run through this checklist before exposing AMC to any network.</div>

<ol>
<li><strong>Change default secrets</strong> — never use the placeholder values from the compose file</li>
<li><strong>Enable LAN mode</strong> — set <code>AMC_LAN_MODE=true</code> to restrict to private networks</li>
<li><strong>Configure CIDR allowlist</strong> — set <code>AMC_ALLOWED_CIDRS</code> to your specific ranges</li>
<li><strong>Use TLS</strong> — deploy with the Caddy TLS compose file or your own reverse proxy</li>
<li><strong>Rotate keys regularly</strong> — use <code>amc vault rotate</code></li>
<li><strong>Enable notary</strong> — for external attestation of evidence</li>
<li><strong>Run doctor regularly</strong> — <code>amc doctor</code> checks for common misconfigurations</li>
<li><strong>Monitor logs</strong> — <code>amc logs --follow</code> or ship to your SIEM</li>
</ol>

<h2>Vault Security</h2>
<pre><code># Check vault status
amc vault status

# Rotate signing keys
amc vault rotate

# Lock vault when not in use
amc vault lock</code></pre>

<h2>Network Security</h2>
<pre><code># LAN mode restricts to private IP ranges
AMC_LAN_MODE=true

# Custom CIDR allowlist
AMC_ALLOWED_CIDRS=10.0.0.0/8,172.16.0.0/12

# Bind to specific interface
AMC_BIND=10.0.1.5</code></pre>

<h2>Policy Enforcement</h2>
<pre><code># View current policies
amc policy list

# Check policy signatures
amc verify

# Enable strict enforcement
amc enforce mode strict</code></pre>
`;

// ─── Troubleshooting ───
PAGES["troubleshooting"] = `
<h1>Common Issues</h1>
<p class="subtitle">Solutions to frequently encountered problems.</p>

<h2>Installation Issues</h2>

<h3>npm install fails with permission errors</h3>
<pre><code># Fix: Use npx or fix npm permissions
npx agent-maturity-compass --version

# Or fix global npm directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
npm i -g agent-maturity-compass</code></pre>

<h3>Node.js version too old</h3>
<pre><code># Check version
node --version  # Need 18+

# Install latest LTS with nvm
nvm install --lts
nvm use --lts</code></pre>

<h2>Setup Issues</h2>

<h3>"Vault unlock failed: incorrect passphrase"</h3>
<p>The passphrase you entered doesn't match the one used to create the vault.</p>
<pre><code># If you forgot the passphrase, re-initialize:
rm -rf .amc/vault.amcvault .amc/vault.amcvault.meta.json
amc setup</code></pre>
<div class="callout error"><strong>Warning:</strong> Re-initializing the vault will lose all stored secrets and signing keys. Evidence in the ledger remains but can't be verified against the old keys.</div>

<h3>"Gateway config not found"</h3>
<p>The workspace wasn't fully set up. Run setup again:</p>
<pre><code>amc setup
# or for non-interactive:
AMC_VAULT_PASSPHRASE=mypass amc setup --non-interactive</code></pre>

<h2>Studio Issues</h2>

<h3>"Studio daemon failed to start in time"</h3>
<pre><code># Check logs
amc logs

# Try foreground mode to see errors
amc studio start --port 3212

# Common fix: port already in use
lsof -i :3212
kill &lt;pid&gt;
amc up</code></pre>

<h3>Console returns blank page</h3>
<pre><code># Rebuild assets
npm run build

# Check if console files exist
ls dist/console/pages/
ls dist/console/assets/</code></pre>

<h3>Dashboard not loading at port 4173</h3>
<pre><code># Dashboard is served separately
# Check if it's running
curl http://localhost:4173/

# If not, the dashboard server may not have started
# Check logs for errors
amc logs | grep dashboard</code></pre>

<h2>Scoring Issues</h2>

<h3>"No agent configured"</h3>
<pre><code># Register an agent first
amc connect
# or
amc fleet add --name my-agent</code></pre>

<h3>Score always shows L0</h3>
<p>This usually means no evidence has been collected. Make sure your agent is running through the AMC Gateway:</p>
<pre><code># Check if gateway is receiving traffic
amc logs | grep gateway

# Verify adapter is configured
amc adapters list

# Run a quick test
amc quickscore</code></pre>

<h2>Docker Issues</h2>

<h3>"Permission denied" in container</h3>
<pre><code># The container runs as non-root (UID 10001)
# Make sure volumes are writable
docker compose down
docker volume rm amc_data
docker compose up -d</code></pre>

<h3>Health check failing</h3>
<pre><code># Check container logs
docker compose logs amc-studio

# Common cause: vault passphrase not set
# Check secrets files exist and are readable
ls -la deploy/compose/secrets/</code></pre>

<h2>Network Issues</h2>

<h3>"Connection refused" on remote machine</h3>
<pre><code># AMC binds to 127.0.0.1 by default
# For remote access, bind to 0.0.0.0:
AMC_BIND=0.0.0.0 amc up

# Or in docker-compose.yml, it's already set to 0.0.0.0</code></pre>

<h3>LAN mode blocking requests</h3>
<pre><code># Check allowed CIDRs
amc config | grep CIDR

# Add your IP range
AMC_ALLOWED_CIDRS=10.0.0.0/8,192.168.0.0/16 amc up</code></pre>
`;

PAGES["doctor"] = `
<h1>Doctor Command</h1>
<p class="subtitle">Automated health checks and diagnostics for your AMC installation.</p>

<h2>Running Doctor</h2>
<pre><code>amc doctor</code></pre>

<h2>What Doctor Checks</h2>
<table>
<tr><th>Check</th><th>What It Verifies</th></tr>
<tr><td>node-version</td><td>Node.js version is 18+</td></tr>
<tr><td>studio-running</td><td>Studio daemon is running and responsive</td></tr>
<tr><td>vault</td><td>Vault is unlocked and accessible</td></tr>
<tr><td>sig-action-policy</td><td>action-policy.yaml signature is valid</td></tr>
<tr><td>sig-tools</td><td>tools.yaml signature is valid</td></tr>
<tr><td>sig-budgets</td><td>budgets.yaml signature is valid</td></tr>
<tr><td>sig-approval-policy</td><td>approval-policy.yaml signature is valid</td></tr>
<tr><td>sig-adapters</td><td>adapters.yaml signature is valid</td></tr>
<tr><td>sig-trust</td><td>trust.yaml signature is valid</td></tr>
<tr><td>route-/openai</td><td>Gateway route for OpenAI is mounted</td></tr>
<tr><td>route-/anthropic</td><td>Gateway route for Anthropic is mounted</td></tr>
<tr><td>route-/gemini</td><td>Gateway route for Gemini is mounted</td></tr>
<tr><td>route-/grok</td><td>Gateway route for Grok is mounted</td></tr>
<tr><td>route-/openrouter</td><td>Gateway route for OpenRouter is mounted</td></tr>
<tr><td>route-/local</td><td>Gateway route for local models is mounted</td></tr>
<tr><td>toolhub-denylist</td><td>ToolHub blocks .amc path access</td></tr>
<tr><td>lease-carrier</td><td>Lease-based auth is working</td></tr>
</table>

<h2>Auto-Fix</h2>
<pre><code># Automatically fix common issues
amc doctor-fix

# This can fix:
# - Missing signature files (re-signs with current keys)
# - Missing config files (creates defaults)
# - Stale daemon (restarts Studio)</code></pre>

<h2>Interpreting Results</h2>
<pre><code># All green = healthy
Doctor result: PASS
[PASS] node-version: Node 20.11.0
[PASS] studio-running: Studio running on 127.0.0.1:3212
[PASS] vault: Vault unlocked
...

# Any red = needs attention
Doctor result: FAIL
[FAIL] vault: Vault locked
  fix: Run: amc vault unlock</code></pre>
`;

PAGES["faq"] = `
<h1>FAQ</h1>
<p class="subtitle">Frequently asked questions about AMC.</p>

<h2>General</h2>

<h3>What is AMC?</h3>
<p>Agent Maturity Compass (AMC) is an open-source platform that measures how mature, safe, and trustworthy AI agents actually are — using cryptographically signed execution evidence rather than self-reported claims.</p>

<h3>Is AMC free?</h3>
<p>Yes. AMC is open source under the MIT license. The core platform with all 126 questions, 74 scoring modules, and full CLI/UI is open-source public infrastructure — MIT licensed, fully featured, no paywalls.</p>

<h3>What makes AMC different from other frameworks?</h3>
<ul>
<li><strong>Evidence-gated scoring</strong> — you can't claim maturity without proving it</li>
<li><strong>Tamper-evident ledger</strong> — Merkle-tree backed, cryptographically signed</li>
<li><strong>Anti-gaming protections</strong> — temporal consistency, cross-reference validation</li>
<li><strong>126 questions</strong> — the most comprehensive assessment available</li>
<li><strong>Both UI and CLI</strong> — works for humans and agents alike</li>
</ul>

<h3>What agents does AMC work with?</h3>
<p>Any AI agent that makes LLM API calls. AMC has built-in adapters for OpenAI, Anthropic, Gemini, Grok, and OpenRouter. Custom adapters can be added for any provider.</p>

<h2>Technical</h2>

<h3>What are the system requirements?</h3>
<ul>
<li>Node.js 18+ (LTS recommended)</li>
<li>~100MB disk space for the CLI</li>
<li>~50MB RAM for Studio</li>
<li>Any OS: macOS, Linux, Windows (WSL)</li>
</ul>

<h3>Can I use AMC without the UI?</h3>
<p>Yes. The CLI provides 100% of the functionality. The UI is optional — it's just a visual layer on top of the same API.</p>

<h3>Can I use AMC without the CLI?</h3>
<p>Yes. The REST API provides programmatic access to everything. You can use the Studio UI exclusively if you prefer.</p>

<h3>How do I reset everything and start fresh?</h3>
<pre><code>amc down
rm -rf .amc/
amc setup</code></pre>

<h3>Where is my data stored?</h3>
<p>Everything is in the <code>.amc/</code> directory in your workspace. The evidence ledger uses SQLite. Secrets are in the encrypted vault file. Nothing is sent to external servers.</p>

<h3>Is my data sent anywhere?</h3>
<p>No. AMC is fully local. No telemetry, no cloud dependencies, no external API calls (unless you configure bridge adapters to reach LLM providers).</p>

<h2>Scoring</h2>

<h3>Why is my score so low?</h3>
<p>AMC is intentionally strict. Most agents start at L0–L1. This is normal. The score reflects actual maturity, not aspirational maturity. Use <code>amc explain &lt;question-id&gt;</code> to understand what each question requires.</p>

<h3>How long does it take to reach L3?</h3>
<p>Depends on your starting point. The setup wizard estimates time-to-L3 based on your current state. Typically 2–4 weeks of active governance work.</p>

<h3>Can I game the score?</h3>
<p>AMC has multiple anti-gaming protections: temporal consistency checks (can't jump levels overnight), cross-reference validation (answers must be consistent), evidence freshness (stale evidence degrades), and Merkle tree integrity (tampered evidence is detected).</p>

<h2>Contributing</h2>

<h3>How do I contribute?</h3>
<p>AMC is open source on <a href="https://github.com/thewisecrab/AgentMaturityCompass" target="_blank">GitHub</a>. We welcome:</p>
<ul>
<li>Bug reports and feature requests (Issues)</li>
<li>Code contributions (Pull Requests)</li>
<li>Documentation improvements</li>
<li>New assurance packs</li>
<li>Bridge adapter contributions</li>
</ul>

<h3>How do I report a security issue?</h3>
<p>Please report security vulnerabilities privately via GitHub Security Advisories, not public issues.</p>
`;

// ─── Router & Sidebar Builder ───
function buildSidebar() {
  const sb = document.getElementById('sidebar');
  let html = '';
  NAV.forEach(sec => {
    html += `<div class="sidebar-section"><h4>${sec.section}</h4>`;
    sec.items.forEach(item => {
      html += `<a href="#${item.id}" data-page="${item.id}">${item.title}</a>`;
    });
    html += '</div>';
  });
  sb.innerHTML = html;
  sb.addEventListener('click', e => {
    const a = e.target.closest('a[data-page]');
    if (!a) return;
    e.preventDefault();
    navigate(a.dataset.page);
    sb.classList.remove('open');
  });
}

function navigate(pageId) {
  const content = document.getElementById('content');
  if (!PAGES[pageId]) pageId = 'getting-started';
  content.innerHTML = PAGES[pageId] + buildPrevNext(pageId);
  document.querySelectorAll('.sidebar a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageId);
  });
  window.scrollTo(0, 0);
  history.pushState(null, '', '#' + pageId);
  addCopyButtons();
}

function buildPrevNext(current) {
  const flat = NAV.flatMap(s => s.items);
  const idx = flat.findIndex(i => i.id === current);
  let html = '<div class="prev-next">';
  if (idx > 0) {
    html += `<a href="#${flat[idx-1].id}" data-page="${flat[idx-1].id}" onclick="event.preventDefault();navigate('${flat[idx-1].id}')"><small>← Previous</small>${flat[idx-1].title}</a>`;
  } else { html += '<span></span>'; }
  if (idx < flat.length - 1) {
    html += `<a href="#${flat[idx+1].id}" data-page="${flat[idx+1].id}" onclick="event.preventDefault();navigate('${flat[idx+1].id}')" style="text-align:right"><small>Next →</small>${flat[idx+1].title}</a>`;
  } else { html += '<span></span>'; }
  html += '</div>';
  return html;
}

function addCopyButtons() {
  document.querySelectorAll('.main pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.onclick = () => {
      navigator.clipboard.writeText(pre.textContent.replace('Copy', '').trim());
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    };
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

// Search
function initSearch() {
  const input = document.getElementById('search-input');
  let resultsEl = document.createElement('div');
  resultsEl.className = 'search-results';
  input.parentElement.appendChild(resultsEl);

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (q.length < 2) { resultsEl.classList.remove('visible'); return; }
    const results = [];
    const flat = NAV.flatMap(s => s.items);
    flat.forEach(item => {
      const page = PAGES[item.id] || '';
      const text = page.replace(/<[^>]+>/g, '').toLowerCase();
      const idx = text.indexOf(q);
      if (idx !== -1) {
        const snippet = text.substring(Math.max(0, idx - 40), idx + 60).trim();
        results.push({ id: item.id, title: item.title, snippet: '...' + snippet + '...' });
      }
    });
    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="search-result"><p>No results found</p></div>';
    } else {
      resultsEl.innerHTML = results.slice(0, 8).map(r =>
        `<div class="search-result" onclick="navigate('${r.id}');document.getElementById('search-input').value='';document.querySelector('.search-results').classList.remove('visible')">
          <h5>${r.title}</h5><p>${r.snippet}</p></div>`
      ).join('');
    }
    resultsEl.classList.add('visible');
  });

  input.addEventListener('blur', () => setTimeout(() => resultsEl.classList.remove('visible'), 200));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); input.focus(); }
  });
}

// Theme
function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  localStorage.setItem('amc-docs-theme', next);
}

// Init
(function() {
  const saved = localStorage.getItem('amc-docs-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  buildSidebar();
  initSearch();
  const hash = location.hash.replace('#', '') || 'getting-started';
  navigate(hash);
  window.addEventListener('popstate', () => {
    navigate(location.hash.replace('#', '') || 'getting-started');
  });
})();
