# P1-17 sources: what was read, from where, and when

Every clock P1-17 added or changed rests on primary text read on 2026-10-07 from an official host. Times are UTC, taken when each `curl` finished. The files themselves are not committed (size and copyright); their SHA-256 values let anyone check a re-download against what was read. Reading these texts is agent work: every duration stays experimental until a named expert signs off (D-08).

| Clock ids | Text | URL | Retrieved | SHA-256 of the file read |
|---|---|---|---|---|
| `nydfs-500-17-notice`, `nydfs-500-17-extortion-notice`, `nydfs-500-17-extortion-explanation` | 23 NYCRR Part 500, Second Amendment as adopted (effective 2023-11-01): 500.1(e), (f), (g); 500.17(a), (c); 500.19; 500.22 | https://www.dfs.ny.gov/system/files/documents/2023/10/rf_fs_2amend23NYCRR500_text_20231101.pdf (411,977 bytes) | 2026-10-07T17:11:34Z | `075846139bd36e25659a110325dd5d4b04ef1e052bbf796c512bde59a8b66b33` |
| same | DFS consolidated Part 500 text, which DFS labels "not an official version"; used only to cross-read 500.17 | https://www.dfs.ny.gov/cybersecurity/23-NYCRR-Part-500 (serves a 707,126-byte PDF) | 2026-10-07T17:12:35Z | `af5f1c45e0171495e14e2e8d12735b23aa933c1323a45800d774f86f3a2702e6` |
| `glba-314-4j-ftc-notice` | 16 CFR 314.4, CFR annual edition 2026 (Title 16 Vol. 1, revised 2026-01-01) | https://www.govinfo.gov/content/pkg/CFR-2026-title16-vol1/xml/CFR-2026-title16-vol1-sec314-4.xml | 2026-10-07T17:10:30Z | `78db42ccdd11efa9aacd304e6deb2f9b1008e4af9f3c6d23b1f829fb455cc632` |
| same | 16 CFR 314.1 (scope), same edition | https://www.govinfo.gov/content/pkg/CFR-2026-title16-vol1/xml/CFR-2026-title16-vol1-sec314-1.xml | 2026-10-07T17:10:47Z | `00752039b8780fbef492b94e2e5e434a91266ac534e24385956cc2590d579db9` |
| same | 16 CFR 314.2 (definitions, incl. (m) notification event), same edition | https://www.govinfo.gov/content/pkg/CFR-2026-title16-vol1/xml/CFR-2026-title16-vol1-sec314-2.xml | 2026-10-07T17:10:47Z | `f028a03df664db393f1ae2c548f787c9e55af271a1254049f4f537ceedddd4a5` |
| same | eCFR text of 16 CFR 314.4 for 2026-10-01 | https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-16.xml?part=314&section=314.4 | 2026-10-07T17:11:13Z | `e72a0d1b51d11475b588c0f17adbd9a872c52b6e988404a2b9c2ae71f2f9c33d` |
| same | eCFR version history of 16 CFR 314.4 (latest amendment 2024-05-13) | https://www.ecfr.gov/api/versioner/v1/versions/title-16.json?section=314.4 | between 2026-10-07T17:10:48Z and 17:11:04Z | `715b56914da7c23c49c7e182b1bc6c531fa2a7943cfcd1fddb06fbdd75077c51` |
| `bsa-1020-320-sar-filing` | 31 CFR 1020.320, CFR annual edition 2025 (Title 31 Vol. 3, revised 2025-07-01); the 2026 edition was not yet published (govinfo returned its not-found page) | https://www.govinfo.gov/content/pkg/CFR-2025-title31-vol3/xml/CFR-2025-title31-vol3-sec1020-320.xml | 2026-10-07T17:10:02Z | `4d7caea80a6f6d66e6075915a67bf44d59b5bbc67a78539f7a5b87552da1ed43` |
| same | eCFR text of 31 CFR 1020.320 for 2026-10-01 (same (b)(3) deadlines) | https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-31.xml?part=1020&section=1020.320 | 2026-10-07T17:11:12Z | `eefe116c3efc20a0af79b18fec533e397c6828b2ca16ce6b171512ea21d8e5b5` |
| same | eCFR version history of 31 CFR 1020.320 (latest amendment 2016-12-23) | https://www.ecfr.gov/api/versioner/v1/versions/title-31.json?section=1020.320 | between 2026-10-07T17:10:48Z and 17:11:04Z | `d3e6540e3f66c7f1e3bce21fc29716ce51e7ca5b32c8e0c4b9c854a71956ba00` |
| `tx-bcc-521-053-individual-notice`, `tx-bcc-521-053-attorney-general` | Tex. Bus. & Com. Code ch. 521 incl. § 521.053, as amended through Acts 2023, 88th Leg., ch. 246 (S.B. 768), eff. 2023-09-01 | https://tcss.legis.texas.gov/resources/BC/htm/BC.521.htm (33,214 bytes; the statute file that statutes.capitol.texas.gov loads) | 2026-10-07T17:14:09Z | `b029a09be5e271a4c9d14a0d175f927cf30c250c5e08664af3e5c810823c2d1b` |
| none (recheck only) | https://statutes.capitol.texas.gov/Docs/BC/htm/BC.521.htm returned the 250,874-byte site shell with no section text, as F4 found on 2026-10-03; its scripts name `https://tcss.legis.texas.gov/resources` as the file server | as named | 2026-10-07T17:10:34Z | `dbfba8a96dc3cd584157ca66aaafdf67e0ed15dd5a0c8a58f3d4bd0f109fc646` |

The exact second of the two eCFR version-history fetches was not recorded; they ran between the two timed fetches named in their rows.

## What was not read

- No law-firm, news or law.cornell.edu page was used. A web search restricted to `dfs.ny.gov` was used only to find the DFS URLs, and a second one found no later amendment to Part 500 on that site; neither is cited.
- Part 500 currency was not checked beyond the DFS pages above (no NY State Register search).
- SAR rules for financial institutions other than banks (other parts of 31 CFR Chapter X) were not read and are not encoded.
- The F4 rows (EU AI Act, GDPR, NIS2, DORA RTS, HIPAA, FDA) were not re-read; their sources are as F4 recorded on 2026-10-03.
