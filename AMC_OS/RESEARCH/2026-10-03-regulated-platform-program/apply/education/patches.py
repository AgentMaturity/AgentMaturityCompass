"""Writes out-of-scope patches (read-only on the target files) into apply/education/."""
import difflib
WT = '/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-3/'
OUT = WT + 'AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/education/'

def patch(path, edits, out):
    old = open(WT + path).read()
    new = old
    for a, b in edits:
        assert new.count(a) == 1, (path, a)
        new = new.replace(a, b)
    diff = difflib.unified_diff(old.splitlines(True), new.splitlines(True), 'a/' + path, 'b/' + path)
    text = ''.join(diff)
    assert text
    open(OUT + out, 'w').write(text)

patch('docs/DOMAIN_PACKS.md', [
    ('| `education` | 5 | 75 |', '| `education` | 5 | 83 |'),
    ('| **Total** | **41** | **632** |', '| **Total** | **41** | **640** |'),
], 'out-of-scope-domain-packs-counts.patch')

patch('website/station-education.html', [
    ('content="AMC EDUCATION Station: 5 packs · 75 questions"', 'content="AMC EDUCATION Station: 5 packs · 83 questions"'),
    ('■ 5 diagnostic packs · 75 questions', '■ 5 diagnostic packs · 83 questions'),
], 'out-of-scope-station-education-counts.patch')

ANCHORS = '''      {
        instrument: "COPPA Rule amendments, 16 CFR Part 312 (FR 2025-05904): effective 2025-06-23, compliance 2026-04-22; child = under 13",
        url: "https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm",
        retrievedAt: REVIEWED,
        status: "verified"
      }
    ]'''
NEW_ANCHORS = '''      {
        instrument: "COPPA Rule amendments, 16 CFR Part 312 (FR 2025-05904): effective 2025-06-23, compliance 2026-04-22; child = under 13",
        url: "https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm",
        retrievedAt: REVIEWED,
        status: "verified"
      },
      {
        instrument: "FERPA, 34 CFR 99.31(a)(1)(i)(B) school-official conditions, 99.31(b)(1) de-identified release, 99.32 record of disclosures, 99.33(a) redisclosure limits",
        url: "https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-34.xml?part=99&section=99.31",
        retrievedAt: "2026-10-03",
        status: "verified"
      },
      {
        instrument: "COPPA Rule 16 CFR 312.5(a)(1)-(2) consent and separate consent for third-party disclosure; 312.10 retention. The proposed school-authorization amendments were not finalized (FR 2025-05904)",
        url: "https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-16.xml?part=312&section=312.5",
        retrievedAt: "2026-10-04",
        status: "verified"
      },
      {
        instrument: "PPRA, 34 CFR 98.4(a): prior consent before psychological examination or testing whose primary purpose is to reveal protected information",
        url: "https://www.govinfo.gov/content/pkg/CFR-2025-title34-vol1/xml/CFR-2025-title34-vol1-sec98-4.xml",
        retrievedAt: "2026-10-04",
        status: "verified"
      },
      {
        instrument: "EU AI Act Art. 5(1)(f): no emotion inference in education institutions except for medical or safety reasons (applies since 2025-02-02)",
        url: "https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-5",
        retrievedAt: "2026-10-04",
        status: "verified"
      },
      {
        instrument: "EU AI Act Art. 14(4)(d): the overseer can disregard, override or reverse a high-risk system's output (Annex III point 3(b)); applies to Annex III systems from 2027-12-02",
        url: "https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14",
        retrievedAt: "2026-10-03",
        status: "verified"
      }
    ]'''
patch('src/assurance/packs/industryPackManifest.ts', [(ANCHORS, NEW_ANCHORS)], 'out-of-scope-manifest-anchors.patch')
print('ok')
