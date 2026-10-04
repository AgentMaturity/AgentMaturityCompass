// Appends one catalogue entry (by key) before the closing "];" of its catalogue file. Append-only: nothing else moves.
// Run from the repo root: node AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/mobility/catalogue-additions.mjs <key>
// Sources: round2/content/mobility/questions.json catalogueAdditions (each url below was read on retrievedAt by the
// station researcher; hosts are on OFFICIAL_SOURCE_HOSTS). Additions whose source was not read, or whose host is not
// on that list, are not added (see result.json).
import { readFileSync, writeFileSync } from "node:fs";

const OJ = "Provisions read from the Official Journal text on the review date (mobility station research, round 2).";
const ENTRIES = {
  "eu-gsr": ["src/domains/packs/catalogueEu.ts", `  verified("eu-gsr", "Regulation (EU) 2019/2144 (General Safety Regulation for motor vehicles)", "EU", "law", "in-force",
    "https://publications.europa.eu/resource/celex/32019R2144", ["Regulation (EU) 2019/2144", "EU General Safety Regulation"], {
      milestones: milestones(["2026-07-07", "Advanced safety requirements apply to all new passenger cars and vans (Commission news of 2026-07-08)"]),
      note: ${JSON.stringify("Arts. 6 and 11 read; entry-into-force date not recorded here. " + OJ)},
    }),`],
  "eu-ads-ir": ["src/domains/packs/catalogueEu.ts", `  verified("eu-ads-ir", "Commission Implementing Regulation (EU) 2022/1426 (automated driving systems of fully automated vehicles)", "EU", "law", "in-force",
    "https://publications.europa.eu/resource/celex/32022R1426", ["Implementing Regulation (EU) 2022/1426", "Commission Implementing Regulation (EU) 2022/1426"], {
      note: "Original OJ text read (Annex III Part 5 in-service reporting, points 2.1-2.2); a consolidated version (2026-03-24) was not read.",
    }),`],
  "eu-efti": ["src/domains/packs/catalogueEu.ts", `  verified("eu-efti", "Regulation (EU) 2020/1056 (electronic freight transport information, eFTI)", "EU", "law", "in-force",
    "https://publications.europa.eu/resource/celex/32020R1056", ["Regulation (EU) 2020/1056", "eFTI Regulation"], {
      effectiveDate: "2024-08-21",
      milestones: milestones(["2027-07-09", "Competent authorities must accept regulatory information made available through certified eFTI platforms (Art. 5(1); date from the Commission eFTI page, transport.ec.europa.eu)"]),
      note: ${JSON.stringify("Arts. 4, 5, 9 and 18 read. " + OJ)},
    }),`],
  "eu-cpr-2024": ["src/domains/packs/catalogueEu.ts", `  verified("eu-cpr-2024", "Regulation (EU) 2024/3110 (Construction Products Regulation)", "EU", "law", "in-force",
    "https://publications.europa.eu/resource/celex/32024R3110", ["Regulation (EU) 2024/3110", "EU Construction Products Regulation 2024/3110"], {
      effectiveDate: "2026-01-08",
      milestones: milestones(["2025-01-07", "Arts. 1-4 and the other provisions listed in Art. 96 apply"], ["2027-01-08", "Art. 92 applies (Art. 96)"]),
      note: ${JSON.stringify("The construction digital product passport (Arts. 75-79) depends on Commission delegated acts under Art. 75(1). " + OJ)},
    }),`],
  "eu-gdp-guidelines": ["src/domains/packs/catalogueEu.ts", `  verified("eu-gdp-guidelines", "Guidelines of 5 November 2013 on Good Distribution Practice of medicinal products for human use (2013/C 343/01)", "EU", "guidance", "in-force",
    "https://health.ec.europa.eu/system/files/2016-11/2013_c343_01_en_0.pdf", ["Guidelines on Good Distribution Practice 2013/C 343/01", "EU GDP Guidelines"], {
      note: "Commission PDF of OJ C 343/1 (23.11.2013) read; Chapter 9 (transportation).",
    }),`],
  "edpb-gl-4-2019": ["src/domains/packs/catalogueEu.ts", `  verified("edpb-gl-4-2019", "EDPB Guidelines 4/2019 on Article 25 Data Protection by Design and by Default, version 2.0", "EU", "guidance", "in-force",
    "https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-42019-article-25-data-protection-design-and_en", ["EDPB Guidelines 4/2019"], {
      note: "Version 2.0 adopted 20 October 2020 (EDPB page read).",
    }),`],
  "nist-sp-800-207": ["src/domains/packs/catalogueUs.ts", `  verified("nist-sp-800-207", "NIST SP 800-207 Zero Trust Architecture", "US", "standard", "in-force", "https://csrc.nist.gov/pubs/sp/800/207/final",
    ["NIST SP 800-207"], { note: "Final, August 2020 (csrc page read)." }),`],
  "nist-sp-800-218": ["src/domains/packs/catalogueUs.ts", `  verified("nist-sp-800-218", "NIST SP 800-218 Secure Software Development Framework (SSDF) Version 1.1", "US", "standard", "in-force",
    "https://csrc.nist.gov/pubs/sp/800/218/final", ["NIST SP 800-218"], {
      lastReviewed: "2026-10-04", retrievedAt: "2026-10-04",
      note: "Final, published 2022-02-03 (csrc page read 2026-10-04, no supersession shown). SP 800-218 Rev. 1 (SSDF 1.2) is an initial public draft of 2025-12-17, seen in a nist.gov search listing and not opened; not final on the review date.",
    }),`],
};

const key = process.argv[2];
const entry = ENTRIES[key];
if (!entry) throw new Error(`unknown key ${key}; known: ${Object.keys(ENTRIES).join(", ")}`);
const [file, text] = entry;
const src = readFileSync(file, "utf8");
if (src.includes(`"${key}"`)) throw new Error(`${key} already in ${file}`);
const at = src.lastIndexOf("\n];");
if (at < 0) throw new Error(`no closing ]; in ${file}`);
writeFileSync(file, `${src.slice(0, at)}\n${text}${src.slice(at)}`);
console.log(`appended ${key} to ${file}`);
