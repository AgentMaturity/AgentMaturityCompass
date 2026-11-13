// The first-run "Welcome to AMC" guide on Home, and the plain-language help Home shows beside its status words. The
// HTML builders are pure (tests/console/welcomeGuide.test.ts); installWelcomeGuide wires a native <dialog>. The guide
// opens by itself until it is closed once (remembered in localStorage when the browser allows it) and reopens from the
// top bar's "How AMC works" link (./home?guide=1). No counts here: scripts/gen-counts.mjs owns every published number.

export const GUIDE_STORAGE_KEY = "amc.welcomeGuide.dismissed.v1";

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/** One line per feature, each a page in src/console/pages. */
export const FEATURE_TOUR = [
  ["./score", "Score", "How to get your agent's maturity score: the commands to run, and where results appear."],
  ["./evidence", "Evidence", "The tamper-evident log of what your agent actually did."],
  ["./firewall", "Guardrails: Firewall", "Checks risky actions and can stop them before they run."],
  ["./approvals", "Guardrails: Approvals", "A person must say yes before a sensitive action runs."],
  ["./budgets", "Guardrails: Budgets", "Limits on how much an agent may spend or do."],
  ["./industrypacks", "Industry Packs", "Extra question sets for your sector. Free and all included in the current source build."],
  ["./assurance", "Assurance tests", "Red-team tests: AMC attacks your own agent to find weak spots."],
  ["./compliance", "Reports and compliance", "Lines your evidence up against frameworks. It is a self-assessed report, not a certificate."],
  ["./fleet", "Fleet", "Watch many agents and how they work together."],
  ["./org", "Org", "Scores rolled up across teams."]
];

/** The words Home and the score pages use, one plain sentence each. */
export const GLOSSARY = [
  ["Evidence", "A record of something your agent really did, saved by AMC as it happened."],
  ["Claim", "A statement about your agent, labelled with where it came from: example, self-reported, observed or reviewed."],
  ["Vault", "A locked store on your computer that holds the keys AMC uses to sign its records."],
  ["Lease", "A short-lived permission slip that lets an agent use a tool for a limited time."],
  ["Signed", "Sealed with a key, so anyone can check later that nobody changed it."],
  ["Freeze", "A pause that stops an agent from taking certain actions until a person lifts it."],
  ["Trust label", "A one-word summary of how much the score can be relied on, based on how strong the evidence is."]
];

const START_CHOICES = [
  ["firstUseNativeButton", "Run a task with AMC", "Try a task and watch AMC record it."],
  ["firstUseBaselineButton", "Assess existing evidence", "See what AMC already knows and what is missing."],
  ["firstUseConnectButton", "Connect an existing agent", "Send your own agent's actions through AMC."]
];

const list = (items) => `<ul class="welcome-guide-list">${items.join("")}</ul>`;

/** The guide's steps: a title and a body of static, trusted markup. */
export const GUIDE_STEPS = [
  {
    title: "What AMC is",
    body: `<p>AMC (Agent Maturity Compass) checks how far you can trust an AI agent.</p>
      <p>It does not take the agent's word for it. It looks at recorded proof of what the agent actually did, and gives
      you a score and a list of gaps to fix.</p>`
  },
  {
    title: "How it works, in three moves",
    body: `<ol class="welcome-guide-list">
        <li><strong>Connect or run.</strong> Connect your agent, or run a task right here.</li>
        <li><strong>AMC records it.</strong> Every action goes into a tamper-evident log, so changes later would show.</li>
        <li><strong>You get results.</strong> A score, the gaps to work on, and evidence you can share.</li>
      </ol>`
  },
  {
    title: "What you can do here",
    body: `<p>Each name opens its page. You can also find them all under "All features" in the menu.</p>
      ${list(FEATURE_TOUR.map(([href, name, line]) => `<li><a href="${esc(href)}">${esc(name)}</a>: ${esc(line)}</li>`))}`
  },
  {
    title: "Pick your first step",
    body: `<p>Not sure? "Run a task with AMC" is the quickest way to see it work.</p>
      <div class="welcome-guide-choices">${START_CHOICES.map(([target, name, line]) => `
        <button type="button" class="secondary" data-guide-start="${esc(target)}"><strong>${esc(name)}</strong><span>${esc(line)}</span></button>`).join("")}
      </div>`
  },
  {
    title: "Words you will see",
    body: `<dl class="welcome-guide-glossary">${GLOSSARY.map(([term, text]) => `<dt>${esc(term)}</dt><dd>${esc(text)}</dd>`).join("")}</dl>
      <p class="muted">You can open this guide again any time with "How AMC works" at the top of the page.</p>`
  }
];

/** The dialog's inner markup for step `index` (clamped). */
export function guideStepHtml(index) {
  const at = Math.min(Math.max(Number(index) || 0, 0), GUIDE_STEPS.length - 1);
  const step = GUIDE_STEPS[at];
  const last = at === GUIDE_STEPS.length - 1;
  return `
    <div class="welcome-guide-head">
      <span class="studio-kicker">Welcome to AMC</span>
      <span id="welcomeGuideProgress" class="muted">Step ${at + 1} of ${GUIDE_STEPS.length}</span>
    </div>
    <progress max="${GUIDE_STEPS.length}" value="${at + 1}" aria-labelledby="welcomeGuideProgress"></progress>
    <h2 id="welcomeGuideTitle" tabindex="-1">${esc(step.title)}</h2>
    <div class="welcome-guide-body">${step.body}</div>
    <div class="row spaced wrap welcome-guide-nav">
      <button type="button" class="secondary" data-guide="close">Close guide</button>
      <div class="row wrap">
        <button type="button" class="secondary" data-guide="back"${at === 0 ? " disabled" : ""}>Back</button>
        <button type="button" data-guide="${last ? "close" : "next"}">${last ? "Finish" : "Next"}</button>
      </div>
    </div>
  `;
}

/** Home's first card: one sentence on AMC and the button that opens the guide. */
export function welcomeCardHtml() {
  return `
    <section class="card welcome-card" aria-labelledby="welcomeCardTitle">
      <div class="studio-kicker">New here?</div>
      <h2 id="welcomeCardTitle">Welcome to AMC</h2>
      <p>AMC checks how far you can trust an AI agent, using recorded proof of what it did instead of promises.
      The short guide shows how it works and where to start.</p>
      <button type="button" id="welcomeGuideOpen">Show me how AMC works</button>
    </section>
  `;
}

/** Plain-language tooltips for the Unified Clarity banner's labels. */
export const BANNER_TIPS = {
  agent: "The agent these numbers are about.",
  trust: "How much the latest score can be relied on, based on the strength of its evidence. N/A means no scored run yet.",
  integrity: "A number from 0 to 1 for how complete and consistent the evidence behind the score is. N/A means no scored run yet.",
  evidence: "Whether the latest run has enough trustworthy evidence. NO RUN means nothing has been scored yet.",
  claims: "ELIGIBLE means the evidence is strong enough to make a claim about this agent. BLOCKED means it is not yet.",
  freezes: "How many pauses are stopping actions right now. 0 means none.",
  config: "SIGNED means AMC's settings carry a valid signature. Otherwise AMC switches to read-only to stay safe.",
  trustMode: "Where AMC's signing keys live: LOCAL_VAULT is a locked store on this computer; NOTARY is a separate signing service.",
  transparency: "Whether AMC's public log of signed records checks out. OK means no changes were found."
};

/** The collapsed "What do these mean?" list under the banner. */
export function bannerHelpHtml() {
  const names = { agent: "Agent", trust: "Trust", integrity: "Integrity", evidence: "Evidence", claims: "Claims",
    freezes: "Active freezes", config: "Config", trustMode: "Trust mode", transparency: "Transparency" };
  return `<details class="banner-help"><summary>What do these mean?</summary><ul>${Object.entries(BANNER_TIPS)
    .map(([key, text]) => `<li><strong>${esc(names[key])}:</strong> ${esc(text)}</li>`).join("")}</ul></details>`;
}

/** What each activation milestone means and, until it is complete, what to do next. */
export const ACTIVATION_HELP = {
  connected_agent: ["AMC knows your agent and can see what it does.",
    (agent) => `Open "Connect an existing agent" above, or run <code>amc connect --agent ${esc(agent)}</code> in your terminal.`],
  observed_action: ["AMC has recorded at least one real action by your agent.",
    (agent) => `Run one task: open <a href="./native-tasks?agent=${encodeURIComponent(agent)}">Native Tasks</a>, or use your connected agent once.`],
  control_decision: ["An AMC guardrail has checked one of your agent's actions and allowed or stopped it.",
    () => "Turn on control mode with the command shown under Next below, then run one action."],
  signed_proof: ["AMC has sealed that decision in a signed record you can show to others.",
    () => `This appears by itself after the first control decision. Then look at it on the <a href="./evidence">Evidence</a> page.`]
};

const STATUS_WORDS = {
  COMPLETE: "Done.",
  READY: "Set up; waiting for the first action.",
  WAITING: "Not yet.",
  BLOCKED: "AMC cannot trust its records right now. Run <code>amc doctor --strict --json</code> in your terminal to see why."
};

/** The plain-words lines under one activation milestone. */
export function activationHelpHtml(row, agentId) {
  const help = ACTIVATION_HELP[row?.id];
  if (!help) return "";
  const status = String(row?.status || "WAITING");
  const blocked = status === "BLOCKED";
  const todo = status === "COMPLETE" ? "" : blocked ? STATUS_WORDS.BLOCKED : `What to do: ${help[1](String(agentId ?? ""))}`;
  const word = blocked ? "" : STATUS_WORDS[status] ?? "";
  return `<p class="activation-help">${esc(help[0])}${word ? ` <span class="muted">${word}</span>` : ""}</p>`
    + (todo ? `<p class="activation-help muted">${todo}</p>` : "");
}

function storage(win) {
  try { return win.localStorage ?? null; } catch { return null; }
}

/** True once the guide was closed in this browser; false when storage is unavailable, so the guide shows again. */
export function guideDismissed(win) {
  try { return storage(win)?.getItem(GUIDE_STORAGE_KEY) === "1"; } catch { return false; }
}

/** Remembers the close; private windows and blocked storage just forget it. */
export function rememberGuideDismissed(win) {
  try { storage(win)?.setItem(GUIDE_STORAGE_KEY, "1"); } catch { /* storage unavailable: the guide shows next visit */ }
}

function ensureDialog(doc) {
  let dialog = doc.getElementById("welcomeGuide");
  if (dialog) return dialog;
  dialog = doc.createElement("dialog");
  dialog.id = "welcomeGuide";
  dialog.className = "welcome-guide";
  dialog.setAttribute("aria-labelledby", "welcomeGuideTitle");
  doc.body.appendChild(dialog);
  return dialog;
}

function showStep(dialog, index) {
  dialog.dataset.step = String(index);
  dialog.innerHTML = guideStepHtml(index);
  dialog.querySelector("#welcomeGuideTitle")?.focus();
}

function bindDialog(dialog, win) {
  if (dialog.dataset.bound === "1") return;
  dialog.dataset.bound = "1";
  dialog.addEventListener("close", () => rememberGuideDismissed(win));
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest?.("button");
    if (!button) return;
    const step = Number(dialog.dataset.step || 0);
    if (button.dataset.guide === "next") showStep(dialog, step + 1);
    else if (button.dataset.guide === "back") showStep(dialog, step - 1);
    else if (button.dataset.guide === "close") dialog.close();
    else if (button.dataset.guideStart) {
      dialog.close();
      const target = dialog.ownerDocument.getElementById(button.dataset.guideStart);
      target?.click();
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    }
  });
}

/** Opens the guide at step 1 (no-op while it is already open). */
function openWelcomeGuide(doc, win) {
  const dialog = ensureDialog(doc);
  bindDialog(dialog, win);
  if (dialog.open) return;
  showStep(dialog, 0);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  dialog.querySelector("#welcomeGuideTitle")?.focus();
}

/** Called after each Home render: wires the openers and opens the guide on a first visit or with ?guide=1. */
export function installWelcomeGuide(doc, win) {
  // Home re-renders on refresh; only the page's first render may open the guide by itself.
  const firstRender = !doc.getElementById("welcomeGuide");
  const open = (event) => { event?.preventDefault(); openWelcomeGuide(doc, win); };
  for (const id of ["welcomeGuideOpen", "guideOpenLink"]) {
    const opener = doc.getElementById(id);
    if (opener && opener.dataset.guideBound !== "1") {
      opener.dataset.guideBound = "1";
      opener.addEventListener("click", open);
    }
  }
  const asked = new URLSearchParams(win.location?.search || "").get("guide") === "1";
  if (firstRender && (asked || !guideDismissed(win))) openWelcomeGuide(doc, win);
}
