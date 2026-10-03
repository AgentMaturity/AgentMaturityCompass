# Compliance documents

One file per framework. Generated reports use the name `amc comply report`
writes by default: `compliance-<framework id in lower case>.md`
(`src/cli.ts` sets `opts.out` to `` `compliance-${frameworkInput.toLowerCase()}.md` ``).

## Generated reports (snapshots)

These are dated snapshots produced by `amc compliance report` in February and
March 2026, before the 2026-10-03 mapping changes (new frameworks, corrected
assurance pack ids, UNKNOWN earning no credit). Regenerate them rather than
editing by hand; the numbers inside describe the run that produced them, not
the current code.

| Framework id | File |
| --- | --- |
| EU_AI_ACT | [compliance-eu_ai_act.md](./compliance-eu_ai_act.md) |
| FEDRAMP | [compliance-fedramp.md](./compliance-fedramp.md) |
| GDPR | [compliance-gdpr.md](./compliance-gdpr.md) |
| HIPAA | [compliance-hipaa.md](./compliance-hipaa.md) |
| ISO_27001 | [compliance-iso_27001.md](./compliance-iso_27001.md) |
| ISO_42001 | [compliance-iso_42001.md](./compliance-iso_42001.md) |
| MITRE_ATLAS | [compliance-mitre_atlas.md](./compliance-mitre_atlas.md) |
| NIST_AI_RMF | [compliance-nist_ai_rmf.md](./compliance-nist_ai_rmf.md) |
| OWASP_API_TOP10 | [compliance-owasp.md](./compliance-owasp.md) |
| PCI_DSS | [compliance-pci_dss.md](./compliance-pci_dss.md) |
| SOC2 | [compliance-soc2.md](./compliance-soc2.md) |
| SOX | [compliance-sox.md](./compliance-sox.md) |
| DORA, NIS2, ONC_HTI_1 | No report generated yet. Mappings and sources: [../COMPLIANCE_MAPS.md](../COMPLIANCE_MAPS.md) |

## Hand-written companions

- [SOC2_TYPE_II_CONTROLS_MAPPING.md](./SOC2_TYPE_II_CONTROLS_MAPPING.md)
- [eu-ai-act-checklist.md](./eu-ai-act-checklist.md)
- [iso-42001-aims-manual.md](./iso-42001-aims-manual.md)
- [nist-rmf-profile.md](./nist-rmf-profile.md)

## Former file names

Until 2026-10-03 some frameworks had two or three files. The second copies had
already been reduced to "Moved" pointers; the current report content now lives
under the canonical name, and older versions remain in git history.

| Former name | Now |
| --- | --- |
| `compliance-eu-ai-act.md` | [compliance-eu_ai_act.md](./compliance-eu_ai_act.md) |
| `compliance-iso-42001.md` | [compliance-iso_42001.md](./compliance-iso_42001.md) |
| `compliance-nist-ai-rmf.md`, `compliance-nist.md` | [compliance-nist_ai_rmf.md](./compliance-nist_ai_rmf.md) |
| `compliance-soc-2.md` | [compliance-soc2.md](./compliance-soc2.md) |
