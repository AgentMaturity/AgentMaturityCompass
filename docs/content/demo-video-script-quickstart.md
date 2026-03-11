# Demo Video Script — 2 Minute AMC Quickstart

> **Duration:** 2:00  
> **Format:** Screen recording with professional narration voiceover  
> **Resolution:** 1920×1080 (16:9), 60fps  
> **Style:** Clean terminal (dark theme), calm/authoritative narrator  

---

## Scene 1 — Hook (0:00 – 0:10)

**Screen:** AMC logo / tagline slide — "Agent Maturity Compass — Trust, Measured."

**Narration:**
> "How mature is your AI agent? In two minutes, you'll have a real answer — backed by cryptographic evidence, not vibes."

---

## Scene 2 — Install (0:10 – 0:25)

**Screen:** Clean terminal. Type:

```bash
npm i -g agent-maturity-compass
```

**Expected output:**
```
added 1 package in 4s
```

Then:

```bash
amc --version
```

**Expected output:**
```
agent-maturity-compass v1.x.x
```

**Narration:**
> "One install. That's it. AMC is a single npm package — no Docker, no config files, no cloud account."

---

## Scene 3 — Init workspace (0:25 – 0:45)

**Screen:** Type:

```bash
mkdir my-agent && cd my-agent
export AMC_VAULT_PASSPHRASE='demo-passphrase'
amc init
```

**Expected output:**
```
✔ Created .amc/ workspace
✔ Generated Ed25519 signing keys
✔ Wrote amc.config.yaml
Ready. Run `amc quickscore` to get your first maturity score.
```

**Narration:**
> "amc init creates a local evidence vault with Ed25519 signing keys. Every score, every eval result, every claim your agent makes — cryptographically signed and tamper-evident. No cloud required."

---

## Scene 4 — Quickscore (0:45 – 1:25)

**Screen:** Type:

```bash
amc quickscore
```

**Expected output — interactive Q&A (show 3 of 5 questions):**
```
AMC Quickscore — 5 questions to your maturity level

1/5  Does your agent have a defined capability boundary?
     (what it can and cannot do)
     > [Yes — documented in code or config]

2/5  Does your agent log its actions with timestamps?
     > [Yes — structured logs with trace IDs]

3/5  Can a human review and override agent decisions?
     > [Yes — approval gates on sensitive actions]

...

Calculating maturity score...
```

**Expected output — result:**
```
╭─────────────────────────────────────────╮
│  AMC Quickscore Result                  │
│                                         │
│  Overall Level:  L3 — Governed          │
│  Trust Score:    72/100                  │
│  Dimensions:                            │
│    Security      ████████░░  L3         │
│    Reliability   ██████░░░░  L2         │
│    Governance    ████████░░  L3         │
│    Observability ██████████  L4         │
│    Ethics        ██████░░░░  L2         │
│                                         │
│  Top gaps:                              │
│    → Behavioral contract missing        │
│    → No fail-secure fallback defined    │
│    → Evaluation cadence not established │
╰─────────────────────────────────────────╯
```

**Narration:**
> "Five honest questions. AMC returns your maturity level — L0 through L5 — plus a gap analysis. Not a vanity score. It tells you exactly what to fix, in priority order."

---

## Scene 5 — Dashboard (1:25 – 1:50)

**Screen:** Type:

```bash
amc dashboard serve --port 4173
```

**Then switch to browser showing `http://localhost:4173`:**
- Radar chart with 5 dimensions
- Overall score prominently displayed
- Gap list with actionable items
- Evidence chain visualization

**Narration:**
> "The dashboard gives you the full picture — a five-layer radar, gap analysis, and your evidence chain. Every data point is signed. Share it with your team, your auditors, or your customers. It's proof, not promises."

---

## Scene 6 — Badge + Close (1:50 – 2:00)

**Screen:** Type:

```bash
amc badge
```

**Expected output:**
```
![AMC L3](https://img.shields.io/badge/AMC-L3_Governed-blue)

Paste this in your README to show your agent's maturity level.
```

**Screen:** Show the badge rendered in a GitHub README.

**Narration:**
> "Add the badge to your README. Let the world know your agent is measured, not just marketed. Get started at agentmaturitycompass.com."

---

## Production Notes

### Recording Setup
- **Terminal:** Use a clean terminal profile (e.g., iTerm2 with Solarized Dark or similar)
- **Font size:** 16pt minimum for readability at 1080p
- **Typing speed:** Natural pace, ~40 WPM. Use a typing tool if needed for consistency.
- **Browser:** Chrome/Firefox, clean profile, no extensions visible, zoom 110%

### Audio
- Professional voiceover (male or female, neutral accent)
- No background music during terminal sections (distraction)
- Subtle intro/outro music (5s each) OK
- Audio: 48kHz, 16-bit minimum

### Editing
- Cut pauses > 1s during install/output rendering
- Add subtle zoom on key output lines (maturity level, gaps)
- Cursor highlight or box around important terminal output
- Smooth transitions between terminal and browser scenes

### Distribution
- Export: MP4 (H.264), 1080p, 60fps
- Thumbnail: AMC radar chart + "2 Min Quickstart" text
- Platforms: YouTube, GitHub README embed, landing page hero
