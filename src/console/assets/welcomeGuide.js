// The "How AMC works" guide on Home, and the plain-language help Home shows beside its status words. The HTML builders
// are pure (tests/console/welcomeGuide.test.ts); installWelcomeGuide wires a native <dialog>. The guide never opens by
// itself: the top bar's "How AMC works" link (./home?guide=1) opens it. A close is still remembered in localStorage when
// the browser allows it, which changes nothing now that it never opens on its own. No counts here: scripts/gen-counts.mjs
// owns every published number.

export const GUIDE_STORAGE_KEY = "amc.welcomeGuide.dismissed.v1";

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

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

/** The guide's steps: a title and a body of static, trusted markup. */
export const GUIDE_STEPS = [
  {
    title: "What AMC is",
    body: `<p>AMC (Agent Maturity Compass) checks how far you can trust an AI agent.</p>
      <p>It does not take the agent's word for it. It looks at signed records of what the agent actually did, and gives
      you a score and a list of gaps to fix.</p>`
  },
  {
    title: "How it works, in three moves",
    body: `<ol class="welcome-guide-list">
        <li><strong>Connect or run.</strong> Connect your agent, or run a task right here.</li>
        <li><strong>AMC records it.</strong> Every action goes into a tamper-evident log, so changes later would show.</li>
        <li><strong>You get results.</strong> A score, the gaps to work on, and evidence you can share.</li>
      </ol>
      <p>Not sure where to start? The "Run a task" tile on Home ("Try a demo task" in the demo) shows it working with
      no setup. Every other page is under "More" in the menu.</p>`
  },
  {
    title: "Words you will see",
    body: `<dl class="welcome-guide-glossary">${GLOSSARY.map(([term, text]) => `<dt>${esc(term)}</dt><dd>${esc(text)}</dd>`).join("")}</dl>
      <p class="muted">You can open this guide again any time with the ? button ("How AMC works") at the top of the page.</p>`
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
    (agent) => `On Home, press "Connect an agent" under First steps, or run <code>amc connect --agent ${esc(agent)}</code> in your terminal.`],
  observed_action: ["AMC has recorded at least one real action by your agent.",
    (agent) => `Run one task with a real model: open <a href="./native-tasks?agent=${encodeURIComponent(agent)}">Native Tasks</a>, or use your connected agent once. Only actions AMC records with a signed receipt count, so a task on the stand-in model does not.`],
  control_decision: ["An AMC guardrail has checked one of your agent's actions and allowed or stopped it.",
    (agent) => `Turn on control mode: run <code>amc connect hooks install --provider claude-code --agent ${esc(agent)} --mode control</code> in your terminal (use <code>gemini-cli</code> or <code>pi</code> as the provider if that is your agent), then run one action.`],
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

const NEXT_STEP = {
  connected_agent: "run one task with a real model or your connected agent (the stand-in model does not count)",
  observed_action: "run one task with a real model or your connected agent (the stand-in model does not count)",
  control_decision: "turn on control mode",
  signed_proof: "look at the signed record on the Evidence page"
};

/** Home's one progress line: how many of the four outcomes are done and, in plain words, what comes next. */
export function progressLineText(activation) {
  const rows = Array.isArray(activation?.milestones) ? activation.milestones : [];
  const total = Number(activation?.progress?.total) || 4;
  const done = Math.min(Number(activation?.progress?.completed) || 0, total);
  const next = rows.find((row) => row?.status !== "COMPLETE");
  const tail = next?.status === "BLOCKED" ? "Needs attention: AMC cannot trust its records right now."
    : done >= total ? "All steps done." : `Next: ${NEXT_STEP[next?.id] ?? NEXT_STEP.observed_action}.`;
  // Progress is counted per agent, from signed records of real actions only.
  const who = activation?.agentId ? ` for agent ${activation.agentId}` : "";
  return `Your progress${who}: ${done} of ${total}. ${tail}`;
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

/** Called after each Home render: wires the opener and opens the guide only when asked (?guide=1), never by itself. */
export function installWelcomeGuide(doc, win) {
  // Home re-renders on refresh; only the page's first render may answer ?guide=1.
  const firstRender = !doc.getElementById("welcomeGuide");
  const open = (event) => { event?.preventDefault(); openWelcomeGuide(doc, win); };
  for (const id of ["guideOpenLink"]) {
    const opener = doc.getElementById(id);
    if (opener && opener.dataset.guideBound !== "1") {
      opener.dataset.guideBound = "1";
      opener.addEventListener("click", open);
    }
  }
  const asked = new URLSearchParams(win.location?.search || "").get("guide") === "1";
  if (firstRender && asked) openWelcomeGuide(doc, win);
}
