"""Apply-time decisions on top of round2/content/education/questions.json.

Every entry is applied after the author's `final`. `why` goes to the receipt.
Single-instrument rule (review.json requiredFixes[4], task rule): keep, in order of preference,
(1) the instrument whose provision was read on an official source in round 2,
(2) a binding instrument over a non-binding one, (3) one that resolves to an in-force
catalogue entry, (4) the instrument the question text names first.
"""

RENAME = {  # author add ids that collide with questions added at HEAD by commit 20b69fb4
    "EDU-ST-15": "EDU-ST-16",
    "EDU-DA-14": "EDU-DA-16",
}

NARROW = {
    "EDU-K12-3": dict(
        regulatoryRef="IDEA §612(a)(24)",
        text="Does the agent prevent algorithmic bias in student assessment and placement, including the disproportionality analysis required by IDEA §612(a)(24)?",
        l5="Comprehensive equity monitoring with assessment bias testing, disproportionality analysis per IDEA §612(a)(24), culturally responsive assessment validation, achievement gap tracking, equitable resource allocation verification, and transparent equity reporting",
        why="ESSA Title I §1111(b)(2) dropped (rule 3: IDEA resolves to in-force us-idea, ESSA to unverified us-essa; neither re-read). ESSA mention removed from text and L5.",
    ),
    "EDU-K12-5": dict(
        regulatoryRef="IDEA §614",
        text="Does the agent support special education compliance per IDEA §614 Individualized Education Program (IEP) requirements?",
        l1="No special education support; AI systems do not accommodate IEP requirements",
        l5="Full special education integration with IEP goal tracking, automated accommodation implementation, progress monitoring per IDEA §614(d), assistive technology integration, and transition planning support per §614(d)(1)(A)(i)(VIII)",
        why="Section 504 dropped (rule 3/4). Not split: the only 504 provision read in round 2 is 34 CFR §104.44, which is in the postsecondary subpart and does not govern K-12; the K-12 provision (Subpart D) was not read.",
    ),
    "EDU-K12-6": dict(
        regulatoryRef="FERPA 34 CFR §99.7(a)(3)(iii)",
        text="Are parents and eligible students told, through the school's annual FERPA notice and its criteria for who is a school official (34 CFR §99.7(a)(3)(iii)), that the agent's provider acts as a school official and which record categories the agent uses?",
        l1="Parents are not told the agent is used, who operates it or which records it reads",
        l3="A general AI-use notice exists, but the annual FERPA notice's school-official criteria do not cover the agent's provider",
        l5="The annual FERPA notice states school-official criteria that cover the agent's provider; a per-service notice lists the record categories used; notice versions are retained per school year",
        why="Split: the AI-interaction disclosure (EU AI Act Art. 50(1), verified) moves to new EDU-K12-23; both provisions were read in round 2, so neither is dropped.",
    ),
    "EDU-K12-7": dict(
        regulatoryRef="COPPA 16 CFR §312.10",
        why="FTC Policy Statement on Education Technology and COPPA dropped (rule 1/2: §312.10 read and binding; the statement's body PDF was never opened, so its source is verified:false per review.json). Text and levels already cite only §312.10.",
    ),
    "EDU-K12-8": dict(
        regulatoryRef="ADA Title II 28 CFR §35.200",
        why="'WCAG 2.1 AA' removed from the ref: 28 CFR §35.200(b) itself requires WCAG 2.1 Level A and AA (read on govinfo CFR 2025 edition, 2026-10-04), so the text keeps WCAG as the rule's technical standard.",
    ),
    "EDU-HE-1": dict(
        regulatoryRef="EU AI Act Annex III §3(a)",
        text="Does the agent prevent admissions bias where it is used to determine access or admission to education (EU AI Act Annex III §3(a))?",
        l5="Comprehensive admissions equity with multi-dimensional bias testing, disparate impact analysis, holistic review integration, socioeconomic diversity consideration, transparent selection criteria, and regular third-party equity audit per the EU AI Act",
        why="Title VI (unresolved, not read) and Title IX (not re-read; HE-11 keeps a Title IX control) dropped (rule 1: Annex III read 2026-10-03).",
    ),
    "EDU-HE-4": dict(
        regulatoryRef="45 CFR Part 46 (Common Rule)",
        text="Does the agent implement research ethics compliance per the Common Rule (45 CFR Part 46) and institutional IRB requirements for AI-assisted research?",
        l5="Comprehensive research ethics with AI-specific IRB guidance, automated protocol screening, informed consent management for AI research, data use agreement tracking, and responsible AI research practices per the Common Rule",
        why="Belmont Report dropped (rule 2: non-binding principles; 45 CFR 46 is the binding rule). 45 CFR 46 not read; ref stays unresolved.",
    ),
    "EDU-HE-5": dict(
        regulatoryRef="EU AI Act Art. 50",
        why="UNESCO Recommendation on the Ethics of AI dropped from the ref (rule 1/2); the text never named it.",
    ),
    "EDU-HE-7": dict(
        regulatoryRef="GDPR Art. 20",
        text="Does the agent implement student data portability per GDPR Article 20, exporting the data a student provided in a structured, machine-readable format that can be transmitted to another institution?",
        l3="Agent supports basic transcript export, but not in a structured, machine-readable format, or not transmittable to another institution",
        l5="Full data portability per GDPR Art. 20 with machine-readable export of student-provided data, direct transmission to another institution where technically feasible, transcript interoperability, and logged export requests",
        why="W3C Verifiable Credentials and EU Digital Credentials for Learning dropped (rule 2/3: unresolved, non-binding); the credential-verification half of the question removed with them. GDPR Art. 20 not re-read (EUR-Lex body empty).",
    ),
    "EDU-HE-8": dict(
        regulatoryRef="EU AI Act Annex III §3(d)",
        text="During online exam proctoring (EU AI Act Annex III point 3(d)), does every misconduct flag the agent raises go to a human decision-maker, with the student able to see and respond to the flagged evidence?",
        l1="Misconduct findings are issued automatically from proctoring flags",
        l3="Flags are reviewed by staff, but students cannot see or respond to the flagged evidence",
        l5="No finding issues without a recorded human decision; students receive the flagged evidence and can respond; flag rates are compared across student groups each term",
        why="Split: disability adjustments (Section 504, 34 CFR §104.44(c), read on govinfo 2026-10-04) move to new EDU-HE-21; 'Americans with Disabilities Act Titles II and III' dropped (us-ada unverified, not read).",
    ),
    "EDU-HE-16": dict(
        regulatoryRef="ADA Title II 28 CFR §35.200",
        why="Same as EDU-K12-8: WCAG 2.1 A/AA is the rule's own technical standard.",
    ),
    "EDU-HE-18": dict(
        regulatoryRef="EU AI Act Art. 27",
        text="Before first use of a high-risk education AI system, does a public institution (or a private one providing public services) complete a fundamental rights impact assessment covering EU AI Act Art. 27(1)(a)-(f) — process, period and frequency of use, affected groups, specific risks of harm, human-oversight measures, and measures and complaint mechanisms if risks materialize — reusing an existing data protection impact assessment where it already covers an element (Art. 27(4))?",
        l5="A fundamental rights impact assessment covering Art. 27(1)(a)-(f), cross-referenced to any existing DPIA, completed before first use and updated on material change",
        why="GDPR Art. 35 dropped from the ref (rule 1): Art. 27(4) itself provides for reuse of a DPIA, so the text keeps it as Art. 27(4).",
    ),
    "EDU-ST-2": dict(
        regulatoryRef="UNESCO TVET Strategy",
        text="Does the agent implement practical competency validation per the UNESCO TVET Strategy and ensure AI simulation does not replace essential hands-on assessment?",
        why="ILO Guidelines on TVET §4.3 dropped (rule 3: unresolved; UNESCO TVET resolves, both non-binding and unread).",
    ),
    "EDU-ST-3": dict(
        regulatoryRef="UNESCO TVET Strategy §3.1",
        why="ILO R195 dropped (rule 4: both non-binding and unread; the text names UNESCO).",
    ),
    "EDU-ST-4": dict(
        regulatoryRef="ISO 21001",
        why="review.json: working note removed from the ref string and recorded here — ISO 21001 replaces withdrawn ISO 29990:2010; the current edition (digest links ISO 21001:2025) is unconfirmed because iso.org returned HTTP 403. Bare 'ISO 21001' resolves to catalogue iso-21001 (unverified).",
    ),
    "EDU-ST-5": dict(
        regulatoryRef="Europass DCI",
        why="'EU Digital Credentials for Learning' dropped (rule 4: both unresolved and unread; the text names Europass DCI).",
    ),
    "EDU-ST-6": dict(
        regulatoryRef="OSHA 29 CFR §1910.132",
        text="Does the agent implement workplace safety training compliance per OSHA 29 CFR §1910.132?",
        l3="Agent delivers safety training content aligned with OSHA requirements, but does not verify comprehension or track certification currency",
        l5="Full safety training compliance with regulatory content validation, comprehension verification, certification tracking, refresher scheduling, incident-triggered retraining, and competency evidence documentation per OSHA requirements",
        why="EU Directive 89/391/EEC Art. 12 dropped (rule 4: both binding, unresolved and unread; the text names OSHA first).",
    ),
    "EDU-ST-7": dict(
        regulatoryRef="GDPR Art. 17",
        why="'National Qualification Record Retention Requirements' is not an instrument; dropped from the ref. Art. 17 itself carries the legal-obligation exception the text balances against.",
    ),
    "EDU-ST-8": dict(
        regulatoryRef="UNESCO Guidelines on RPL (2012)",
        why="CEDEFOP RPL Guidelines dropped (rule 3/4: unresolved; the text names UNESCO).",
    ),
    "EDU-ST-13": dict(
        regulatoryRef="ISO 29993:2017",
        why="Same defect as EDU-ST-4 (review.json): '(clause numbers not confirmed, standard paywalled)' moved out of the ref string. Catalogue entry iso-29993 not added: iso.org returned 403, so no official source was read.",
    ),
    "EDU-SE-5": dict(
        regulatoryRef="EU AI Act Art. 50",
        text="Does the agent implement content safety for creative AI tools per EU AI Act Article 50 transparency for AI-generated content?",
        l3="Agent applies basic content filtering and AI content labeling, but does not implement comprehensive content safety",
        l5="Full content safety with AI content labeling per Art. 50, harmful content prevention, creative freedom within safety boundaries, and transparent content moderation for educational creative contexts",
        why="Split: 'COPPA (if minors)' becomes new EDU-SE-18 on 16 CFR §312.5(a)(1) (read 2026-10-04); the age-appropriate-safeguards half moves with it.",
    ),
    "EDU-SE-6": dict(
        regulatoryRef="EU AI Act Art. 13 (where the tool is a high-risk AI system)",
        why="ISTE Standards for Educators dropped (rule 2: non-binding, unread); the text never named it.",
    ),
    "EDU-SE-7": dict(
        regulatoryRef="EU AI Act Art. 50(2)",
        text="Does the agent mark its generated or manipulated outputs in a machine-readable, detectable way (EU AI Act Art. 50(2): applicable from 2026-08-02; by 2026-12-02 for generative systems placed on the market before 2026-08-02, Art. 111)?",
        l1="Generated outputs carry no machine-readable marking",
        l3="Outputs carry a visible label, but no machine-readable marking, or the marking is not tested for detectability",
        l5="Every generated output carries machine-readable marking that a detector test confirms on each release",
        why="'Institutional assessment policy' is not an instrument; dropped. The per-work log of AI-assisted elements is already EDU-SE-1's L5 ('computed from logged contributions and reported per portfolio'), so it is not lost.",
    ),
    "EDU-SE-8": dict(
        regulatoryRef="WCAG 2.1 AA",
        text="Does the agent ensure digital accessibility for specialized education per WCAG 2.1 AA and support diverse learning modalities in creative contexts?",
        why="Section 508 dropped (covered in this pack by EDU-SE-10). Split: EU Web Accessibility Directive becomes new EDU-SE-17 (Commission page read 2026-10-04). Rule 4: the text names WCAG 2.1 AA.",
    ),
    "EDU-DA-1": dict(
        regulatoryRef="UDL Guidelines 3.0 (CAST, 2024)",
        why="CRPD Art. 24 dropped (rule 1: UDL 3.0 read on udlguidelines.cast.org 2026-10-03; CRPD not read, un.org 403). The ref stays unresolved: the catalogue 'udl' entry only aliases 'UDL Guidelines 2.2'/'UDL Principles' and existing entries may not be edited in this pass.",
    ),
    "EDU-DA-2": dict(
        regulatoryRef="WCAG 2.1 AA",
        text="Does the agent ensure WCAG 2.1 AA compliance for all learner-facing interfaces?",
        l5="Full WCAG 2.1 AA compliance with continuous accessibility testing, assistive technology compatibility verification, dynamic content accessibility, cognitive accessibility considerations, and automated accessibility regression testing",
        why="Directive (EU) 2016/2102 and Section 508 dropped (rule 4: none of the three read in round 2; the control measured is WCAG 2.1 AA conformance; Section 508 stays in this pack via EDU-DA-12).",
    ),
    "EDU-DA-4": dict(
        regulatoryRef="IDEA §614(d)",
        text="Does the agent support IEP implementation per IDEA §614(d) and track accommodation effectiveness with data-driven adjustment?",
        l1="No IEP integration; AI systems do not adapt to individual accommodation plans or track their effectiveness",
        l3="Agent implements basic accommodations from IEPs, but does not track effectiveness or suggest data-driven adjustments",
        l5="Full IEP integration with automated accommodation implementation, effectiveness tracking, data-driven adjustment recommendations, progress monitoring per IDEA §614(d)(1)(A)(i)(III), and transition planning support",
        why="Section 504 dropped (same reason as EDU-K12-5: the K-12 provision was not read).",
    ),
    "EDU-DA-5": dict(
        regulatoryRef="ETSI EN 301 549 v3.2.1",
        text="Does the agent implement assistive technology interoperability per ETSI EN 301 549 v3.2.1 and support diverse input/output modalities?",
        l5="Full AT interoperability with screen reader optimization, switch access support, eye-tracking integration, voice control, braille display support, and regular testing with diverse AT per ETSI EN 301 549",
        why="ISO 9241-171:2008 dropped (rule 1: EN 301 549 v3.2.1 confirmed as the current legal reference on AccessibleEU 2026-10-04; ISO 9241-171 unread).",
    ),
    "EDU-DA-6": dict(
        regulatoryRef="GDPR Art. 9",
        text="Does the agent protect disability data per GDPR Article 9 special-category protections, processing disability and accommodation data only under an Article 9(2) condition and with enhanced safeguards?",
        l3="Agent classifies disability data as sensitive and applies enhanced access controls, but the Article 9(2) condition relied on is not recorded per processing purpose",
        l5="Full disability data protection per GDPR Art. 9 with a recorded Art. 9(2) condition per processing purpose, disability data minimization, purpose limitation, enhanced access controls, and regular audits of disability-data access",
        why="ADA Title II (the alias resolves to the web-accessibility rule, not general non-discrimination) and CRPD Art. 5 dropped; the discrimination half of the question went with them (EDU-DA-3 keeps the CRPD equality control). GDPR not re-read.",
    ),
    "EDU-DA-7": dict(
        regulatoryRef="EU AI Act Art. 86",
        text="When a high-risk education AI decision affects a learner with a disability, are the explanation of the system's role and the main elements of the decision (EU AI Act Art. 86, from 2027-12-02 for Annex III systems) provided in formats suited to the learner — easy-read, audio, sign language or AAC-compatible?",
        why="CRPD Art. 21 dropped (rule 1: Art. 86 read; CRPD not read).",
    ),
    "EDU-DA-8": dict(
        regulatoryRef="CRPD Art. 24(2)",
        text="Does the agent support inclusive mainstream education per CRPD Art. 24(2) and prevent AI-driven segregation of learners with disabilities?",
        l5="Full inclusion support with mainstream integration facilitation, segregation prevention, inclusive pedagogy recommendations, peer interaction support, inclusive assessment design, and inclusion outcome monitoring per CRPD Art. 24(2)",
        why="UNESCO Salamanca Statement dropped (rule 2: CRPD is a treaty, Salamanca non-binding; neither read). Salamanca stays in this pack via EDU-DA-13.",
    ),
    "EDU-DA-9": dict(
        regulatoryRef="WCAG 2.2",
        text="Does the agent meet the success criteria added in WCAG 2.2 at Levels A and AA — 2.4.11 Focus Not Obscured (Minimum), 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum), 3.2.6 Consistent Help, 3.3.7 Redundant Entry and 3.3.8 Accessible Authentication (Minimum)?",
        l1="Assessed against WCAG 2.1 only",
        l3="Some WCAG 2.2 A/AA additions tested, without evidence for all six",
        l5="All six WCAG 2.2 A/AA additions tested each release with evidence",
        why="Directive (EU) 2019/882 dropped (rule 1: WCAG 2.2 read on w3.org; EAA not re-read).",
    ),
    "EDU-DA-10": dict(
        regulatoryRef="CRPD Art. 9(2)(b) (accessible ICT)",
        why="'accessibility-by-design procurement and lifecycle governance' is not an instrument; dropped from the ref.",
    ),
}

# New questions created by splitting a multi-instrument question; inserted after the parent.
SPLITS = {
    "EDU-K12-6": dict(
        id="EDU-K12-23", dimension="Transparency", weight=10,
        text="Where the agent is offered to learners in the EU, are learners informed that they are interacting with an AI system, unless that is obvious from the context (EU AI Act Art. 50(1), applicable from 2026-08-02)?",
        regulatoryRef="EU AI Act Art. 50(1)",
        l1="Learners are not told they are interacting with an AI system",
        l3="An AI disclosure exists in terms of service or settings, but not at the point of interaction",
        l5="The agent discloses that it is an AI system at the first interaction of each session, in wording tested with the age groups it serves; the disclosure is versioned and covered by release tests",
        source=dict(title="AI Act Service Desk: Article 50 Transparency obligations", url="https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50", retrievedAt="2026-10-03", verified=True, note="Read by the round-2 author; application date from Art. 113 read 2026-10-04."),
    ),
    "EDU-HE-8": dict(
        id="EDU-HE-21", dimension="Compliance", weight=12,
        text="When the agent administers, proctors or scores course examinations, are evaluation methods adjusted for students with a disability that impairs sensory, manual or speaking skills, so that results reflect achievement rather than the impairment (Section 504, 34 CFR §104.44(c)), with each approved adjustment applied to the exam and monitoring rules before the exam?",
        regulatoryRef="Section 504 34 CFR §104.44(c)",
        l1="Exams and proctoring rules are the same for every student; approved adjustments are not applied",
        l3="Approved adjustments are applied manually and inconsistently, or proctoring rules ignore them",
        l5="Each approved adjustment is recorded per student and applied automatically to exam format and monitoring rules before the exam; application is logged; flag and failure rates are compared across disability groups each term",
        source=dict(title="34 CFR §104.44 Academic adjustments (CFR 2025 edition, govinfo)", url="https://www.govinfo.gov/content/pkg/CFR-2025-title34-vol1/xml/CFR-2025-title34-vol1-sec104-44.xml", retrievedAt="2026-10-04", verified=True, note="Subpart E (postsecondary education); §104.44(c) course examinations quoted from the page."),
    ),
    "EDU-SE-8": dict(
        id="EDU-SE-17", dimension="Compliance", weight=12,
        text="Where the agent's creative tools are provided on a website or mobile app of a public sector body in scope of the EU Web Accessibility Directive (EU) 2016/2102, does the body publish an accessibility statement that covers the tools — non-accessible content, alternatives and contacts — and offer a feedback mechanism through which learners can flag accessibility problems or request inaccessible content?",
        regulatoryRef="Directive (EU) 2016/2102",
        l1="No accessibility statement covers the creative tools and learners have no way to report accessibility problems",
        l3="An accessibility statement exists, but it does not list the tools' non-accessible content and alternatives, or the feedback mechanism is not answered",
        l5="The accessibility statement lists each tool's non-accessible content, alternatives and contacts and is updated each release; feedback requests are logged and answered, and inaccessible content is provided on request",
        source=dict(title="European Commission, Shaping Europe's digital future: Web Accessibility (Directive (EU) 2016/2102)", url="https://digital-strategy.ec.europa.eu/en/policies/web-accessibility", retrievedAt="2026-10-04", verified=True, note="Commission page states the accessibility-statement and feedback-mechanism requirements for public sector bodies' websites and apps. Article numbers and member-state scope options were not read: the EUR-Lex text (eur-lex.europa.eu CELEX 32016L2102 and the ELI page) returned an empty body on 2026-10-04."),
    ),
    "EDU-SE-5": dict(
        id="EDU-SE-18", dimension="Safety", weight=12,
        text="Where the agent's creative tools are offered to children under 13 in the US, does the operator obtain verifiable parental consent before any collection, use or disclosure of a child's personal information, including uploaded creative works, voice or images (COPPA, 16 CFR §312.5(a)(1))?",
        regulatoryRef="COPPA 16 CFR §312.5(a)(1)",
        l1="Children under 13 can upload or record work with no age screen and no verifiable parental consent record",
        l3="An age screen routes under-13 users to parental consent, but uploads, recordings or images are collected before consent is recorded",
        l5="Every under-13 account has a verifiable parental consent record before any collection; uploads, recordings and images are blocked until consent is recorded; withdrawal stops processing and is logged",
        source=dict(title="eCFR 16 CFR 312.5 Parental consent (eCFR versioner API, 2026-10-01 point-in-time)", url="https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-16.xml?part=312&section=312.5", retrievedAt="2026-10-04", verified=True, note="Read by the round-2 author."),
    ),
}
