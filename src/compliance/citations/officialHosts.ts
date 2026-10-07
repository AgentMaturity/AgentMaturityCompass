/**
 * The one official-source host list: the union of the pack catalogue's hosts
 * (src/domains/packs/regulatorySchema.ts re-exports this list) and the
 * register's policy.officialHosts (src/compliance/regulatory/register.json).
 * tests/citations/lintCitations.test.ts asserts the register's list is a subset.
 * A URL is official when it is https and its hostname equals an entry or is a
 * subdomain of one. Secondary or commentary sites are never sources.
 */
export const SHARED_OFFICIAL_HOSTS = [
  // Pack catalogue (S3)
  "europa.eu", "nist.gov", "iso.org", "federalregister.gov", "ecfr.gov", "hhs.gov",
  "legislation.gov.uk", "unece.org", "iec.ch", "who.int", "fatf-gafi.org", "ich.org",
  "govinfo.gov", "w3.org", "pcisecuritystandards.org", "oecd.org", "consort-spirit.org",
  // Register policy.officialHosts (S5) not already listed
  "healthit.gov", "fda.gov", "nerc.com", "ferc.gov", "sec.gov", "ed.gov", "nhtsa.gov",
  "transportation.gov", "leg.colorado.gov", "capitol.texas.gov", "leginfo.legislature.ca.gov",
  "gov.ca.gov", "cppa.ca.gov", "msit.go.kr", "law.go.kr", "cac.gov.cn", "planalto.gov.br",
  "pib.gov.in", "indiacode.nic.in", "ppc.go.jp", "japaneselawtranslation.go.jp", "gov.uk",
  "ico.org.uk", "cao.go.jp", "korea.kr", "imda.gov.sg", "mddi.gov.sg", "coe.int", "oecd.ai",
  "etsi.org", "whitehouse.gov", "reginfo.gov", "ftc.gov", "fcc.gov", "cisa.gov", "epa.gov",
  "eeoc.gov", "ada.gov", "federalreserve.gov", "finra.org", "nyc.gov", "coag.gov",
  "calcivilrights.ca.gov", "nysed.gov", "ohio.gov", "illinois.gov", "ilga.gov", "utah.gov",
] as const;

export function isSharedOfficialUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return SHARED_OFFICIAL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
