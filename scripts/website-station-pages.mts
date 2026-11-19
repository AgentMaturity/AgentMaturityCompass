// Renders the seven website/station-<id>.html pages ("Build an AI agent for <sector>") from the same data as
// website/industry-packs.json. The pages are generated: change this template, then run `npm run gen-website-packs`.
// The counts it writes are the ones scripts/gen-counts.mjs would write, so the two never disagree.

export interface WebsitePack {
  id: string;
  name: string;
  summary: string;
  riskTier: string;
  questions: number;
  rules: string[];
  risks: string[];
}
export interface WebsiteStation {
  id: string;
  name: string;
  packs: WebsitePack[];
}

/** The plain words each page uses for its sector: the end of "Build an AI agent for ...", and the kinds of work. */
const SECTOR: Record<string, { h1: string; work: string }> = {
  health: { h1: "health care", work: "health records, wellness, patient care, clinical decisions, medicines and trials" },
  education: { h1: "education", work: "schools, universities, vocational training and special education" },
  environment: { h1: "the environment and critical infrastructure", work: "food, clothing, manufacturing, energy, water and sanitation" },
  mobility: { h1: "mobility and logistics", work: "communities, ports, buildings, digital infrastructure, freight and warehouses" },
  governance: { h1: "the public sector", work: "citizens' rights, elections, law-making, public services and public-private projects" },
  technology: { h1: "technology services", work: "AI services, networks, operating systems, media and partnerships" },
  wealth: { h1: "finance and work", work: "jobs, digital payments, programmes against poverty, green finance and blockchain" }
};

// The A4 risk level a project gets when it starts from a pack (src/console/assets/a4Pack.js, website/home.js).
const A4_LEVEL: Record<string, string> = { critical: "critical", "very-high": "high", high: "high", elevated: "med" };
const TIER_WORD: Record<string, string> = { critical: "Critical", "very-high": "Very high", high: "High", elevated: "Elevated" };

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = (items: string[]): string => `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
const questionsOf = (station: WebsiteStation): number => station.packs.reduce((sum, pack) => sum + pack.questions, 0);

function packSheet(pack: WebsitePack): string {
  const level = A4_LEVEL[pack.riskTier] ?? "";
  return `          <article class="sheet" id="pack-${esc(pack.id)}">
            <header class="sheet-head">
              <p class="sheet-kind">Industry Pack · ${pack.questions} questions</p>
              <h3 class="sheet-title">${esc(pack.name)}</h3>
              <p class="sheet-summary">${esc(pack.summary)}</p>
            </header>
            <dl class="sheet-rows">
              <div><dt>Risk level</dt><dd><span class="risk" data-level="${level}">${esc(TIER_WORD[pack.riskTier] ?? pack.riskTier)}</span><span class="risk-note">A second person approves each step of a project started from this pack.</span></dd></div>
              <div><dt>Rules to check</dt><dd>${list(pack.rules)}</dd></div>
              <div><dt>Risks to plan for</dt><dd>${list(pack.risks)}</dd></div>
            </dl>
            <footer class="sheet-foot"><code>amc domain pack describe --pack ${esc(pack.id)}</code></footer>
          </article>`;
}

function stationCard(station: WebsiteStation): string {
  return `          <a href="station-${station.id}.html" class="station-card"><h3>${esc(station.name)}</h3><p class="station-card-meta">${station.packs.length} packs · ${questionsOf(station)} questions</p></a>`;
}

const NAV = `  <nav class="nav" aria-label="Main">
    <div class="nav-inner">
      <a href="./" class="nav-brand" aria-label="AMC home">amc<span class="accent">_</span></a>
      <ul class="nav-links">
        <li><a href="./#a4-forge">Build an agent</a></li>
        <li><a href="./#capabilities">Run it</a></li>
        <li><a href="./#domains">Industries</a></li>
        <li><a href="a4.html">A4 Forge</a></li>
        <li><a href="docs/index.html">Docs</a></li>
      </ul>
      <div class="nav-right">
        <a href="https://github.com/AgentMaturity/AgentMaturityCompass" class="nav-quiet">GitHub</a>
        <a href="./#install" class="btn btn-primary btn-small">Get AMC</a>
        <button class="nav-hamburger" aria-label="Menu" aria-controls="navMobile" aria-expanded="false"><span></span><span></span><span></span></button>
      </div>
    </div>
  </nav>
  <div class="nav-mobile" id="navMobile">
    <a href="./#a4-forge">Build an agent</a>
    <a href="./#capabilities">Run it</a>
    <a href="./#domains">Industries</a>
    <a href="./#paths">Already have an agent?</a>
    <a href="./#install">Get AMC</a>
    <a href="./#desktop">macOS app</a>
    <a href="./#pricing">Price</a>
    <a href="a4.html">A4 Forge (preview)</a>
    <a href="docs/index.html">Docs</a>
    <a href="executive.html">For executives</a>
    <a href="https://github.com/AgentMaturity/AgentMaturityCompass">GitHub</a>
  </div>`;

const FOOTER = `  <footer class="footer">
    <div class="footer-inner wrap">
      <div class="footer-top">
        <div><div class="footer-brand">amc<span class="accent">_</span></div><p class="footer-tagline">Build, run and check AI agents for regulated work.<br>Evidence over claims.</p></div>
        <div class="footer-col"><h2>Product</h2><a href="./#a4-forge">Build an agent</a><a href="./#capabilities">Run it</a><a href="./#paths">Already have an agent?</a><a href="./#install">Get AMC</a><a href="./#desktop">macOS app</a><a href="./#products">Eight tools</a><a href="executive.html">Executives</a><a href="playground.html">Playground</a><a href="docs/index.html">Documentation</a></div>
        <div class="footer-col"><h2>Depth</h2><a href="a4.html">A4 Forge</a><a href="methodology.html">Approach and research</a><a href="compliance.html">Frameworks</a><a href="https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/whitepaper/AMC_WHITEPAPER_v1.md" target="_blank" rel="noopener">Whitepaper</a><a href="./#pricing">Price</a><a href="./#faq">FAQ</a></div>
        <div class="footer-col"><h2>Industry Packs</h2><a href="./#domains">All packs</a><a href="station-environment.html">Environment</a><a href="station-health.html">Health</a><a href="station-wealth.html">Wealth</a><a href="station-education.html">Education</a><a href="station-mobility.html">Mobility</a><a href="station-technology.html">Technology</a><a href="station-governance.html">Governance</a></div>
        <div class="footer-col"><h2>Code</h2><a href="https://github.com/AgentMaturity/AgentMaturityCompass/releases" target="_blank" rel="noopener">GitHub Releases</a><a href="https://github.com/AgentMaturity/AgentMaturityCompass" target="_blank" rel="noopener">Source</a><a href="accessibility.html">Accessibility</a></div>
      </div>
      <div class="footer-bottom"><span class="footer-copy">© 2026 Agent Maturity Compass. MIT License.</span><span class="footer-copy">Evidence over claims.</span></div>
    </div>
  </footer>`;

/** One station's page. `stations` is every station, for the "other industries" cards. */
export function renderStationPage(station: WebsiteStation, stations: WebsiteStation[]): string {
  const sector = SECTOR[station.id];
  if (!sector) throw new Error(`no page words for station ${station.id}: add it to SECTOR in scripts/website-station-pages.mts`);
  const count = `${station.packs.length} packs · ${questionsOf(station)} experimental, self-reported questions`;
  const title = `Build an AI agent for ${sector.h1}`;
  const others = stations.filter((other) => other.id !== station.id && other.packs.length > 0);
  return `<!DOCTYPE html>
<!-- Generated by scripts/gen-website-packs.mts from the pack registry. Do not edit by hand: change
     scripts/website-station-pages.mts and run npm run gen-website-packs. -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" href="favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="manifest" href="manifest.json">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} | Agent Maturity Compass</title>
  <meta name="description" content="${esc(`Start an AI agent project for ${sector.work} from an Industry Pack: the rules to check, the risks to plan for, and a first draft you correct. ${station.packs.length} packs, free. Experimental, AI-drafted, not legal advice.`)}">
  <meta name="theme-color" content="#0a0a0a">
  <link rel="canonical" href="https://agentmaturity.co/station-${station.id}.html">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:url" content="https://agentmaturity.co/station-${station.id}.html">
  <meta property="og:image" content="https://agentmaturity.co/og-card.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="home.css?v=6">
  <link rel="stylesheet" href="pages.css?v=1">
  <link rel="stylesheet" href="station-pages.css?v=1">
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>

${NAV}

  <span id="main-content" tabindex="-1"></span>
  <main id="main">

    <section class="page-hero">
      <div class="wrap">
        <p class="product-name">Industry Packs · ${esc(station.name)}</p>
        <h1>${esc(title)}</h1>
        <p class="lede">For work such as ${esc(sector.work)}. Start your agent project from the Industry Pack closest to the work: it names the rules to check and the risks to plan for, and gives you a first draft to correct.</p>
        <div class="cta-row">
          <a href="#packs" class="btn btn-primary">See the ${station.packs.length} packs</a>
          <a href="#start" class="btn btn-ghost">How to start</a>
        </div>
        <dl class="status">
          <div><dt>In this industry</dt><dd class="pack-count">${count}</dd></div>
          <div><dt>Price</dt><dd>Free in the current source build, with no licence or account.</dd></div>
          <div><dt>Approvals</dt><dd>Every pack is rated high risk or above, so a second person approves each step.</dd></div>
          <div><dt>The content</dt><dd>Experimental and AI-drafted. No lawyer or other expert has reviewed it. Not legal advice.</dd></div>
        </dl>
      </div>
    </section>

    <section id="gives" class="band">
      <div class="wrap">
        <header class="band-head">
          <h2>What a pack gives you</h2>
          <p>A pack is a questionnaire for one kind of regulated work. You never start from a blank page, and nothing in it is decided for you.</p>
        </header>
        <div class="cards">
          <article>
            <h3>A first draft of your project</h3>
            <p>Start an agent project in A4 Forge from a pack and AMC fills in the sector, a risk level and the rules to check. They are suggestions: you correct them before anyone approves.</p>
          </article>
          <article>
            <h3>The rules and the risks</h3>
            <p>Each pack lists laws and standards that may apply to the work, and the risks to plan for. Check every rule with your own advisers: a pack does not say which ones apply to you.</p>
          </article>
          <article>
            <h3>Questions you answer</h3>
            <p>Each pack asks plain questions about how your agent is run. Your answers are self-reported: AMC records them as you gave them and does not check them.</p>
          </article>
        </div>
      </div>
    </section>

    <section id="packs" class="band band-alt">
      <div class="wrap">
        <header class="band-head">
          <h2>The ${station.packs.length} ${esc(station.name)} packs</h2>
          <p>Each card shows the pack's own words: what it covers, its risk level, the rules it names and the risks it lists.</p>
        </header>
        <div class="pack-grid">
${station.packs.map(packSheet).join("\n")}
        </div>
      </div>
    </section>

    <section id="start" class="band">
      <div class="wrap">
        <header class="band-head">
          <h2>How to start</h2>
          <p>Build AMC from source (see <a href="./#install">Get AMC</a>). The published 1.1.1 release does not have A4 Forge, and it still locks the packs behind the earlier licence gate.</p>
        </header>
        <div class="hero-split split-top">
          <ol class="how">
            <li>Type <code>amc</code> in a terminal and choose <strong>Build an agent for my industry</strong>. AMC opens the Compass Console in your browser, at the form that starts a project. Sign in if it asks.</li>
            <li>For the industry, pick ${esc(station.name)} and the pack closest to the work.</li>
            <li>Under <strong>Who approves each step?</strong> choose <strong>A second person</strong>. As the workspace owner, use <strong>Add a person</strong>: it creates their account and shows their first password once.</li>
            <li>Name the project and press <strong>Start building</strong>. Correct the draft, answer the questions, and ask for approval when the page says so.</li>
          </ol>
          <figure class="shot"><img src="img/a4-approval.webp" width="1200" height="1133" loading="lazy" decoding="async" alt="The What to do now panel of a project started from an Industry Pack, at Review the plan, part 4 of 8, drawn as a route. It says the project is waiting for a second person to approve, 0 of 1 approvals so far, that the person who wrote, built or requested a stage cannot approve it, and shows the people: an approver not decided yet, and the owner, who cannot approve this one."><figcaption>A project started from a pack, waiting for a second person to approve its first step.</figcaption></figure>
        </div>
        <p class="band-more">The whole build needs three people: Assemble's final approval, Adapt and Activate each need two approvers who did not write, build or ask for that step, and Adapt's final approval needs an auditor. On a laptop a project ends after Adapt. In a terminal, <code>amc domain pack run --pack &lt;id&gt;</code> asks a pack's questions without starting a project. <a href="a4.html">How A4 Forge works</a></p>
      </div>
    </section>

    <section class="paper-band" aria-labelledby="limitsTitle">
      <div class="wrap">
        <h2 id="limitsTitle">What these packs will not tell you</h2>
        <ul class="limits">
          <li><strong>That a rule applies to you.</strong> The rules are AI-drafted and no lawyer has reviewed them. This is not legal advice: check each rule with your own advisers.</li>
          <li><strong>That your agent meets a rule.</strong> Starting from a pack, or answering its questions, does not show that the agent meets any law or standard.</li>
          <li><strong>That your answers are true.</strong> Pack answers are self-reported. AMC records them; it does not check them.</li>
          <li><strong>That the content is finished.</strong> Pack content is experimental until a named expert signs it. Rules and standards change; the pack may be out of date.</li>
        </ul>
      </div>
    </section>

    <section id="others" class="band">
      <div class="wrap">
        <header class="band-head">
          <h2>Other industries</h2>
        </header>
        <div class="station-grid">
${others.map(stationCard).join("\n")}
        </div>
      </div>
    </section>

    <section class="closing">
      <div class="wrap">
        <h2>Pick a pack. Build the first one<span class="cursor" aria-hidden="true">_</span></h2>
        <div class="cta-row">
          <a href="./#install" class="btn btn-primary">Get AMC</a>
          <a href="a4.html" class="btn btn-ghost">How A4 Forge works</a>
        </div>
      </div>
    </section>
  </main>

${FOOTER}

  <script src="script.js?v=14"></script>
  <script src="home.js?v=3"></script>
</body>
</html>
`;
}
