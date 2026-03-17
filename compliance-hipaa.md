# AMC Compliance Report (HIPAA)

- Agent: default
- Window: 2026-02-15T09:09:30.144Z -> 2026-03-17T09:09:30.144Z
- Config trusted: NO (compliance maps missing)
- Trust coverage: OBSERVED 100.0% | ATTESTED 0.0% | SELF_REPORTED 0.0%
- Coverage score: 45.0% (S:0 P:9 M:1 U:0)

## Categories

### §164.308 Administrative Safeguards (PARTIAL)

Risk analysis, workforce security, information access management, security awareness training, security incident procedures, contingency planning, and evaluation.

Deterministic reasons:
- Found 12 matching events with observed ratio 1.000
- Assurance pack 'governance_bypass' not found in window
- No denied audit events found
Evidence references:
- f027dc90-2abc-46e9-82f0-42221338da65 (audit) hash=84f1c65582dfd89622f3c851265eae3ceec85cc155bf228a8d80daca4b81c41f
- 33dd4aae-93f3-4d0a-b69a-9a3f22a4db0c (audit) hash=c038913bbcdb8de1f2bef8db6ffdf4160e8c523a59ceb89e9c12105b048b6abb
- 495d6aff-c6c0-4df0-83b6-44c1bffe5b08 (audit) hash=2d26b5ddf5386bbcce2a0a047a4d3be5c2668b68a5fdbe975b715422f48a7a4f
- 5f30740c-c58f-49c0-80f6-ca070a70474b (audit) hash=a2ca59eb7c374c59de6ff4afa80bf09d0b40128b15e212d8f5720c0ad5b9694d
- e311ee48-053a-43af-89da-6881c193085c (audit) hash=575248338d62231999581aa8fe76fd73785a1468343961f8af5483546db9b4d6
- 5dc12594-fd36-4597-910a-c789700d8b7a (audit) hash=8d3c9aad5ef88e6a89fe625656adb0012512ed331fcc3fd10c982c558c3a5056
- d0ecd5dd-d33a-4963-8c4f-20401fc177c7 (audit) hash=fd948cc5272b762d8cb3886572c3406eae23226afdf505391c75ec24e3b3623b
- 66018621-437a-482f-a815-b17adfff2ceb (audit) hash=2135e32c1b6dc68f0974b3e687e06ece0aff3db1a0b69427764374c280c4a954
- cbb461a6-9b48-41f8-8500-d78c1d5d4e70 (audit) hash=57796e6324279273d5d5d7ae3ebdc41d55bbbaa1d5ada1a2b73bfa088d731bbb
- a3db71b5-5304-4cd2-8135-1103b185b73d (audit) hash=fa38c0f10fe2bf739c971ae52ca9f3de0fb177894d9c723cd8e1ece221e52fcd
- f6171d38-c468-4a2a-ad11-d66996934559 (audit) hash=e3a00d8d416b899436950f6e74c36f5aa883012d926f93aefaf74a65115f6e16
- 7eb986ba-9ac7-4bef-ba59-78f6f3c4be97 (audit) hash=4a86b1d659b82a9b56440ca66740bcd377d2d520fa09af36bf64c6f668e77861
What would make this SATISFIED?
- No additional evidence required for this requirement
- Run assurance pack 'governance_bypass' with score >= 80

### §164.312 Technical Safeguards (PARTIAL)

Access control, audit controls, integrity controls, person or entity authentication, and transmission security for electronic PHI.

Deterministic reasons:
- Found 12 matching events with observed ratio 1.000
- Assurance pack 'exfiltration' not found in window
- Assurance pack 'pii_detection_leakage' not found in window
Evidence references:
- f027dc90-2abc-46e9-82f0-42221338da65 (audit) hash=84f1c65582dfd89622f3c851265eae3ceec85cc155bf228a8d80daca4b81c41f
- 33dd4aae-93f3-4d0a-b69a-9a3f22a4db0c (audit) hash=c038913bbcdb8de1f2bef8db6ffdf4160e8c523a59ceb89e9c12105b048b6abb
- 495d6aff-c6c0-4df0-83b6-44c1bffe5b08 (audit) hash=2d26b5ddf5386bbcce2a0a047a4d3be5c2668b68a5fdbe975b715422f48a7a4f
- 5f30740c-c58f-49c0-80f6-ca070a70474b (audit) hash=a2ca59eb7c374c59de6ff4afa80bf09d0b40128b15e212d8f5720c0ad5b9694d
- e311ee48-053a-43af-89da-6881c193085c (audit) hash=575248338d62231999581aa8fe76fd73785a1468343961f8af5483546db9b4d6
- 5dc12594-fd36-4597-910a-c789700d8b7a (audit) hash=8d3c9aad5ef88e6a89fe625656adb0012512ed331fcc3fd10c982c558c3a5056
- d0ecd5dd-d33a-4963-8c4f-20401fc177c7 (audit) hash=fd948cc5272b762d8cb3886572c3406eae23226afdf505391c75ec24e3b3623b
- 66018621-437a-482f-a815-b17adfff2ceb (audit) hash=2135e32c1b6dc68f0974b3e687e06ece0aff3db1a0b69427764374c280c4a954
- cbb461a6-9b48-41f8-8500-d78c1d5d4e70 (audit) hash=57796e6324279273d5d5d7ae3ebdc41d55bbbaa1d5ada1a2b73bfa088d731bbb
- a3db71b5-5304-4cd2-8135-1103b185b73d (audit) hash=fa38c0f10fe2bf739c971ae52ca9f3de0fb177894d9c723cd8e1ece221e52fcd
- f6171d38-c468-4a2a-ad11-d66996934559 (audit) hash=e3a00d8d416b899436950f6e74c36f5aa883012d926f93aefaf74a65115f6e16
- 7eb986ba-9ac7-4bef-ba59-78f6f3c4be97 (audit) hash=4a86b1d659b82a9b56440ca66740bcd377d2d520fa09af36bf64c6f668e77861
What would make this SATISFIED?
- No additional evidence required for this requirement
- Run assurance pack 'exfiltration' with score >= 90
- Run assurance pack 'pii_detection_leakage' with score >= 85

### §164.310 Physical Safeguards (PARTIAL)

Facility access controls, workstation use and security, and device and media controls for systems handling PHI.

Deterministic reasons:
- Found 12 matching events with observed ratio 1.000
- No denied audit events found
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- f027dc90-2abc-46e9-82f0-42221338da65 (audit) hash=84f1c65582dfd89622f3c851265eae3ceec85cc155bf228a8d80daca4b81c41f
- 33dd4aae-93f3-4d0a-b69a-9a3f22a4db0c (audit) hash=c038913bbcdb8de1f2bef8db6ffdf4160e8c523a59ceb89e9c12105b048b6abb
- 495d6aff-c6c0-4df0-83b6-44c1bffe5b08 (audit) hash=2d26b5ddf5386bbcce2a0a047a4d3be5c2668b68a5fdbe975b715422f48a7a4f
- 5f30740c-c58f-49c0-80f6-ca070a70474b (audit) hash=a2ca59eb7c374c59de6ff4afa80bf09d0b40128b15e212d8f5720c0ad5b9694d
- e311ee48-053a-43af-89da-6881c193085c (audit) hash=575248338d62231999581aa8fe76fd73785a1468343961f8af5483546db9b4d6
- 5dc12594-fd36-4597-910a-c789700d8b7a (audit) hash=8d3c9aad5ef88e6a89fe625656adb0012512ed331fcc3fd10c982c558c3a5056
- d0ecd5dd-d33a-4963-8c4f-20401fc177c7 (audit) hash=fd948cc5272b762d8cb3886572c3406eae23226afdf505391c75ec24e3b3623b
- 66018621-437a-482f-a815-b17adfff2ceb (audit) hash=2135e32c1b6dc68f0974b3e687e06ece0aff3db1a0b69427764374c280c4a954
- cbb461a6-9b48-41f8-8500-d78c1d5d4e70 (audit) hash=57796e6324279273d5d5d7ae3ebdc41d55bbbaa1d5ada1a2b73bfa088d731bbb
- a3db71b5-5304-4cd2-8135-1103b185b73d (audit) hash=fa38c0f10fe2bf739c971ae52ca9f3de0fb177894d9c723cd8e1ece221e52fcd
- f6171d38-c468-4a2a-ad11-d66996934559 (audit) hash=e3a00d8d416b899436950f6e74c36f5aa883012d926f93aefaf74a65115f6e16
- 7eb986ba-9ac7-4bef-ba59-78f6f3c4be97 (audit) hash=4a86b1d659b82a9b56440ca66740bcd377d2d520fa09af36bf64c6f668e77861
What would make this SATISFIED?
- No additional evidence required for this requirement

### §164.314 Organizational Requirements (PARTIAL)

Business associate contracts and group health plan requirements for AI systems processing PHI on behalf of covered entities.

Deterministic reasons:
- Found 12 matching events with observed ratio 1.000
- Assurance pack 'delegation_trust_chain' not found in window
Evidence references:
- f027dc90-2abc-46e9-82f0-42221338da65 (audit) hash=84f1c65582dfd89622f3c851265eae3ceec85cc155bf228a8d80daca4b81c41f
- 33dd4aae-93f3-4d0a-b69a-9a3f22a4db0c (audit) hash=c038913bbcdb8de1f2bef8db6ffdf4160e8c523a59ceb89e9c12105b048b6abb
- 495d6aff-c6c0-4df0-83b6-44c1bffe5b08 (audit) hash=2d26b5ddf5386bbcce2a0a047a4d3be5c2668b68a5fdbe975b715422f48a7a4f
- 5f30740c-c58f-49c0-80f6-ca070a70474b (audit) hash=a2ca59eb7c374c59de6ff4afa80bf09d0b40128b15e212d8f5720c0ad5b9694d
- e311ee48-053a-43af-89da-6881c193085c (audit) hash=575248338d62231999581aa8fe76fd73785a1468343961f8af5483546db9b4d6
- 5dc12594-fd36-4597-910a-c789700d8b7a (audit) hash=8d3c9aad5ef88e6a89fe625656adb0012512ed331fcc3fd10c982c558c3a5056
- d0ecd5dd-d33a-4963-8c4f-20401fc177c7 (audit) hash=fd948cc5272b762d8cb3886572c3406eae23226afdf505391c75ec24e3b3623b
- 66018621-437a-482f-a815-b17adfff2ceb (audit) hash=2135e32c1b6dc68f0974b3e687e06ece0aff3db1a0b69427764374c280c4a954
- cbb461a6-9b48-41f8-8500-d78c1d5d4e70 (audit) hash=57796e6324279273d5d5d7ae3ebdc41d55bbbaa1d5ada1a2b73bfa088d731bbb
- a3db71b5-5304-4cd2-8135-1103b185b73d (audit) hash=fa38c0f10fe2bf739c971ae52ca9f3de0fb177894d9c723cd8e1ece221e52fcd
- f6171d38-c468-4a2a-ad11-d66996934559 (audit) hash=e3a00d8d416b899436950f6e74c36f5aa883012d926f93aefaf74a65115f6e16
- 7eb986ba-9ac7-4bef-ba59-78f6f3c4be97 (audit) hash=4a86b1d659b82a9b56440ca66740bcd377d2d520fa09af36bf64c6f668e77861
What would make this SATISFIED?
- No additional evidence required for this requirement
- Run assurance pack 'delegation_trust_chain' with score >= 75

### §164.316 Policies and Documentation (PARTIAL)

Documentation of policies and procedures, retention requirements, and availability of documentation.

Deterministic reasons:
- Found 23 matching events with observed ratio 1.000
- No denied audit events found
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- f027dc90-2abc-46e9-82f0-42221338da65 (audit) hash=84f1c65582dfd89622f3c851265eae3ceec85cc155bf228a8d80daca4b81c41f
- 33dd4aae-93f3-4d0a-b69a-9a3f22a4db0c (audit) hash=c038913bbcdb8de1f2bef8db6ffdf4160e8c523a59ceb89e9c12105b048b6abb
- b8715b0f-9d7c-4183-bbcf-c76406e7a2da (test) hash=b591eac3accde8606dfe7e47341d6bdb4ad53d2a901cfa4e0799ad44cb574691
- 495d6aff-c6c0-4df0-83b6-44c1bffe5b08 (audit) hash=2d26b5ddf5386bbcce2a0a047a4d3be5c2668b68a5fdbe975b715422f48a7a4f
- a357df74-145f-440e-8cf4-c094b0b6f714 (test) hash=88a938f5ecb7eddbf8d37c0fca2e61632962a59fc1ddcba30e51b8804a9b1bcd
- 5f30740c-c58f-49c0-80f6-ca070a70474b (audit) hash=a2ca59eb7c374c59de6ff4afa80bf09d0b40128b15e212d8f5720c0ad5b9694d
- 5cc377c1-0858-4b19-b592-458c7f64c47a (test) hash=bf647c278095586c8c147a0f4bd84465a4e1d45dc65dda7778064beefe7e7670
- e311ee48-053a-43af-89da-6881c193085c (audit) hash=575248338d62231999581aa8fe76fd73785a1468343961f8af5483546db9b4d6
- b7d047fe-0c64-4daa-be35-2ec89e26f73c (test) hash=b41234b0632804c2276fcce7c4b395cd418682fb060488da461b01e5ecd00fe5
- 5dc12594-fd36-4597-910a-c789700d8b7a (audit) hash=8d3c9aad5ef88e6a89fe625656adb0012512ed331fcc3fd10c982c558c3a5056
- 455fd1dd-cf33-4d6a-844d-87422ed60536 (test) hash=e1b7fa37b9e4f6cf83552b718ebf160d97d39f6f804b7b76f4ad6b2787276533
- d0ecd5dd-d33a-4963-8c4f-20401fc177c7 (audit) hash=fd948cc5272b762d8cb3886572c3406eae23226afdf505391c75ec24e3b3623b
What would make this SATISFIED?
- No additional evidence required for this requirement

### §164.502-514 Privacy Rule Uses and Disclosures (MISSING)

Minimum necessary standard, de-identification requirements, authorization requirements, and permitted uses and disclosures of PHI by AI agents.

Deterministic reasons:
- Assurance pack 'pii_detection_leakage' not found in window
- Assurance pack 'context_leakage' not found in window
Evidence references:
- none
What would make this SATISFIED?
- Run assurance pack 'pii_detection_leakage' with score >= 90
- Run assurance pack 'context_leakage' with score >= 85

### §164.524 Access to PHI (PARTIAL)

Individual right of access to inspect and obtain a copy of PHI, including AI-generated health records and inferences.

Deterministic reasons:
- Found 12 matching events with observed ratio 1.000
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- f027dc90-2abc-46e9-82f0-42221338da65 (audit) hash=84f1c65582dfd89622f3c851265eae3ceec85cc155bf228a8d80daca4b81c41f
- 33dd4aae-93f3-4d0a-b69a-9a3f22a4db0c (audit) hash=c038913bbcdb8de1f2bef8db6ffdf4160e8c523a59ceb89e9c12105b048b6abb
- 495d6aff-c6c0-4df0-83b6-44c1bffe5b08 (audit) hash=2d26b5ddf5386bbcce2a0a047a4d3be5c2668b68a5fdbe975b715422f48a7a4f
- 5f30740c-c58f-49c0-80f6-ca070a70474b (audit) hash=a2ca59eb7c374c59de6ff4afa80bf09d0b40128b15e212d8f5720c0ad5b9694d
- e311ee48-053a-43af-89da-6881c193085c (audit) hash=575248338d62231999581aa8fe76fd73785a1468343961f8af5483546db9b4d6
- 5dc12594-fd36-4597-910a-c789700d8b7a (audit) hash=8d3c9aad5ef88e6a89fe625656adb0012512ed331fcc3fd10c982c558c3a5056
- d0ecd5dd-d33a-4963-8c4f-20401fc177c7 (audit) hash=fd948cc5272b762d8cb3886572c3406eae23226afdf505391c75ec24e3b3623b
- 66018621-437a-482f-a815-b17adfff2ceb (audit) hash=2135e32c1b6dc68f0974b3e687e06ece0aff3db1a0b69427764374c280c4a954
- cbb461a6-9b48-41f8-8500-d78c1d5d4e70 (audit) hash=57796e6324279273d5d5d7ae3ebdc41d55bbbaa1d5ada1a2b73bfa088d731bbb
- a3db71b5-5304-4cd2-8135-1103b185b73d (audit) hash=fa38c0f10fe2bf739c971ae52ca9f3de0fb177894d9c723cd8e1ece221e52fcd
- f6171d38-c468-4a2a-ad11-d66996934559 (audit) hash=e3a00d8d416b899436950f6e74c36f5aa883012d926f93aefaf74a65115f6e16
- 7eb986ba-9ac7-4bef-ba59-78f6f3c4be97 (audit) hash=4a86b1d659b82a9b56440ca66740bcd377d2d520fa09af36bf64c6f668e77861
What would make this SATISFIED?
- No additional evidence required for this requirement

### §164.528 Accounting of Disclosures (PARTIAL)

Maintain an accounting of disclosures of PHI by AI agents, including automated disclosures and inter-system data sharing.

Deterministic reasons:
- Found 12 matching events with observed ratio 1.000
- No denied audit events found
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- f027dc90-2abc-46e9-82f0-42221338da65 (audit) hash=84f1c65582dfd89622f3c851265eae3ceec85cc155bf228a8d80daca4b81c41f
- 33dd4aae-93f3-4d0a-b69a-9a3f22a4db0c (audit) hash=c038913bbcdb8de1f2bef8db6ffdf4160e8c523a59ceb89e9c12105b048b6abb
- 495d6aff-c6c0-4df0-83b6-44c1bffe5b08 (audit) hash=2d26b5ddf5386bbcce2a0a047a4d3be5c2668b68a5fdbe975b715422f48a7a4f
- 5f30740c-c58f-49c0-80f6-ca070a70474b (audit) hash=a2ca59eb7c374c59de6ff4afa80bf09d0b40128b15e212d8f5720c0ad5b9694d
- e311ee48-053a-43af-89da-6881c193085c (audit) hash=575248338d62231999581aa8fe76fd73785a1468343961f8af5483546db9b4d6
- 5dc12594-fd36-4597-910a-c789700d8b7a (audit) hash=8d3c9aad5ef88e6a89fe625656adb0012512ed331fcc3fd10c982c558c3a5056
- d0ecd5dd-d33a-4963-8c4f-20401fc177c7 (audit) hash=fd948cc5272b762d8cb3886572c3406eae23226afdf505391c75ec24e3b3623b
- 66018621-437a-482f-a815-b17adfff2ceb (audit) hash=2135e32c1b6dc68f0974b3e687e06ece0aff3db1a0b69427764374c280c4a954
- cbb461a6-9b48-41f8-8500-d78c1d5d4e70 (audit) hash=57796e6324279273d5d5d7ae3ebdc41d55bbbaa1d5ada1a2b73bfa088d731bbb
- a3db71b5-5304-4cd2-8135-1103b185b73d (audit) hash=fa38c0f10fe2bf739c971ae52ca9f3de0fb177894d9c723cd8e1ece221e52fcd
- f6171d38-c468-4a2a-ad11-d66996934559 (audit) hash=e3a00d8d416b899436950f6e74c36f5aa883012d926f93aefaf74a65115f6e16
- 7eb986ba-9ac7-4bef-ba59-78f6f3c4be97 (audit) hash=4a86b1d659b82a9b56440ca66740bcd377d2d520fa09af36bf64c6f668e77861
What would make this SATISFIED?
- No additional evidence required for this requirement

### §164.530 Administrative Requirements (PARTIAL)

Privacy officer designation, training, safeguards, complaint procedures, and sanctions for AI system operators.

Deterministic reasons:
- Found 12 matching events with observed ratio 1.000
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- f027dc90-2abc-46e9-82f0-42221338da65 (audit) hash=84f1c65582dfd89622f3c851265eae3ceec85cc155bf228a8d80daca4b81c41f
- 33dd4aae-93f3-4d0a-b69a-9a3f22a4db0c (audit) hash=c038913bbcdb8de1f2bef8db6ffdf4160e8c523a59ceb89e9c12105b048b6abb
- 495d6aff-c6c0-4df0-83b6-44c1bffe5b08 (audit) hash=2d26b5ddf5386bbcce2a0a047a4d3be5c2668b68a5fdbe975b715422f48a7a4f
- 5f30740c-c58f-49c0-80f6-ca070a70474b (audit) hash=a2ca59eb7c374c59de6ff4afa80bf09d0b40128b15e212d8f5720c0ad5b9694d
- e311ee48-053a-43af-89da-6881c193085c (audit) hash=575248338d62231999581aa8fe76fd73785a1468343961f8af5483546db9b4d6
- 5dc12594-fd36-4597-910a-c789700d8b7a (audit) hash=8d3c9aad5ef88e6a89fe625656adb0012512ed331fcc3fd10c982c558c3a5056
- d0ecd5dd-d33a-4963-8c4f-20401fc177c7 (audit) hash=fd948cc5272b762d8cb3886572c3406eae23226afdf505391c75ec24e3b3623b
- 66018621-437a-482f-a815-b17adfff2ceb (audit) hash=2135e32c1b6dc68f0974b3e687e06ece0aff3db1a0b69427764374c280c4a954
- cbb461a6-9b48-41f8-8500-d78c1d5d4e70 (audit) hash=57796e6324279273d5d5d7ae3ebdc41d55bbbaa1d5ada1a2b73bfa088d731bbb
- a3db71b5-5304-4cd2-8135-1103b185b73d (audit) hash=fa38c0f10fe2bf739c971ae52ca9f3de0fb177894d9c723cd8e1ece221e52fcd
- f6171d38-c468-4a2a-ad11-d66996934559 (audit) hash=e3a00d8d416b899436950f6e74c36f5aa883012d926f93aefaf74a65115f6e16
- 7eb986ba-9ac7-4bef-ba59-78f6f3c4be97 (audit) hash=4a86b1d659b82a9b56440ca66740bcd377d2d520fa09af36bf64c6f668e77861
What would make this SATISFIED?
- No additional evidence required for this requirement

### Breach Notification Rule §164.400-414 (PARTIAL)

Breach discovery, notification to individuals and HHS, and content of breach notifications for AI-related PHI incidents.

Deterministic reasons:
- Found 12 matching events with observed ratio 1.000
- No denied audit events found
- Compliance maps signature invalid; green status is downgraded to PARTIAL.
Evidence references:
- f027dc90-2abc-46e9-82f0-42221338da65 (audit) hash=84f1c65582dfd89622f3c851265eae3ceec85cc155bf228a8d80daca4b81c41f
- 33dd4aae-93f3-4d0a-b69a-9a3f22a4db0c (audit) hash=c038913bbcdb8de1f2bef8db6ffdf4160e8c523a59ceb89e9c12105b048b6abb
- 495d6aff-c6c0-4df0-83b6-44c1bffe5b08 (audit) hash=2d26b5ddf5386bbcce2a0a047a4d3be5c2668b68a5fdbe975b715422f48a7a4f
- 5f30740c-c58f-49c0-80f6-ca070a70474b (audit) hash=a2ca59eb7c374c59de6ff4afa80bf09d0b40128b15e212d8f5720c0ad5b9694d
- e311ee48-053a-43af-89da-6881c193085c (audit) hash=575248338d62231999581aa8fe76fd73785a1468343961f8af5483546db9b4d6
- 5dc12594-fd36-4597-910a-c789700d8b7a (audit) hash=8d3c9aad5ef88e6a89fe625656adb0012512ed331fcc3fd10c982c558c3a5056
- d0ecd5dd-d33a-4963-8c4f-20401fc177c7 (audit) hash=fd948cc5272b762d8cb3886572c3406eae23226afdf505391c75ec24e3b3623b
- 66018621-437a-482f-a815-b17adfff2ceb (audit) hash=2135e32c1b6dc68f0974b3e687e06ece0aff3db1a0b69427764374c280c4a954
- cbb461a6-9b48-41f8-8500-d78c1d5d4e70 (audit) hash=57796e6324279273d5d5d7ae3ebdc41d55bbbaa1d5ada1a2b73bfa088d731bbb
- a3db71b5-5304-4cd2-8135-1103b185b73d (audit) hash=fa38c0f10fe2bf739c971ae52ca9f3de0fb177894d9c723cd8e1ece221e52fcd
- f6171d38-c468-4a2a-ad11-d66996934559 (audit) hash=e3a00d8d416b899436950f6e74c36f5aa883012d926f93aefaf74a65115f6e16
- 7eb986ba-9ac7-4bef-ba59-78f6f3c4be97 (audit) hash=4a86b1d659b82a9b56440ca66740bcd377d2d520fa09af36bf64c6f668e77861
What would make this SATISFIED?
- No additional evidence required for this requirement

## Non-Claims
- This report provides evidence-backed signals only; it is not legal advice.
- Controls not represented in verified AMC evidence are marked as UNKNOWN/MISSING.
- Owner attestations must be explicitly signed and are not inferred automatically.
