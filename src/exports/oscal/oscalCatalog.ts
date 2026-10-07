/**
 * The AMC Regulated Control Catalog as an OSCAL catalog (P1-28). One group per pack (a pack is one layer for its
 * stations), one control per AMC control: id, title, the statement as a `statement` part, citations as back-matter
 * resources with their URL and content hash. Every other AMC field becomes an AMC-namespaced prop or part, or is listed
 * as omitted in the loss report. The catalog content is experimental: evidence-of-conformity planning, never a
 * compliance statement.
 */
import { controlDigest } from "../../catalog/digest.js";
import { buildCatalogLock } from "../../catalog/lockfile.js";
import type { LoadedCatalog } from "../../catalog/loader.js";
import type { Citation, ControlRecord } from "../../catalog/types.js";
import { AMC_OSCAL_NS, jsonProp, line, nonEmpty, oscalMetadata, oscalUuid, prop, utc } from "./oscalIds.js";
import { loss, type OscalLoss } from "./oscalLoss.js";

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const citationUuid = (r: ControlRecord, c: Citation) => oscalUuid("citation", `${r.id}/${c.key}`);

const REMARKS = "Experimental AMC Regulated Control Catalog content, agent-drafted unless a control's review says otherwise. "
  + "It describes evidence of conformity to collect, never a compliance statement. AMC props (namespace "
  + `${AMC_OSCAL_NS}) carry the AMC fields OSCAL has no field for; oscal-loss-report.json lists them. `
  + "metadata.last-modified is the latest draftedAt or reviewedAt date in the controls: AMC records no catalog modification time.";

function controlProps(r: ControlRecord) {
  return [
    prop("version", r.version), prop("support", r.support), prop("layer", String(r.layer)),
    ...(r.family ? [prop("family", r.family)] : []),
    ...r.stations.map((s) => prop("station", s)),
    prop("mandatory", String(r.mandatory)),
    ...r.levels.map((l) => prop("level", l)),
    jsonProp("applicability", r.applicability),
    ...r.tests.map((t) => jsonProp("test", t)),
    ...r.evidence.map((e) => jsonProp("evidence-contract", e)),
    jsonProp("binding", r.binding),
    ...r.invalidatedBy.map((t) => prop("invalidated-by", t)),
    prop("owner-role", r.owner.role),
    ...(r.clock ? [jsonProp("clock", r.clock)] : []),
    ...r.crosswalk.map((x) => jsonProp("crosswalk", x)),
    jsonProp("review", r.review),
    jsonProp("provenance", r.provenance),
    prop("control-digest", controlDigest(r))
  ];
}

function oscalControl(r: ControlRecord) {
  return {
    id: r.id,
    title: line(r.title),
    props: controlProps(r),
    ...nonEmpty("links", r.citations.map((c) => ({ href: `#${citationUuid(r, c)}`, rel: "reference", text: line(`${c.instrument}, ${c.clause} (${c.edition})`) }))),
    parts: [
      { id: `${r.id}_smt`, name: "statement", prose: r.statement },
      { name: "risk-rationale", ns: AMC_OSCAL_NS, prose: r.riskRationale }
    ]
  };
}

/** A citation's URL and, once retrieved and hashed, its content SHA-256; the full citation record as a prop. */
function citationResource(r: ControlRecord, c: Citation) {
  const hashes = c.retrieval.state === "verified" ? { hashes: [{ algorithm: "SHA-256", value: c.retrieval.contentSha256 }] } : {};
  return { uuid: citationUuid(r, c), title: line(`${c.instrument}, ${c.clause}`), props: [prop("control-id", r.id), jsonProp("citation", c)], rlinks: [{ href: c.url, ...hashes }] };
}

function catalogLosses(cat: LoadedCatalog, controls: ControlRecord[]): OscalLoss[] {
  const n = (count: (r: ControlRecord) => number) => controls.reduce((sum, r) => sum + count(r), 0);
  const asProp = (field: string, count: number, how: string) => loss("catalog", `controls[].${field}`, count, "prop", how);
  const json = "as canonical JSON in one AMC prop value per item; OSCAL tools see an opaque string";
  return [
    asProp("version", controls.length, "AMC prop version"),
    asProp("support", controls.length, "AMC prop support"),
    asProp("layer", controls.length, "AMC prop layer; the control also sits in its pack's group"),
    asProp("family", n((r) => Number(r.family !== null)), "AMC prop family"),
    asProp("stations", n((r) => r.stations.length), "one AMC prop station per station; groups are packs, so a multi-station control is listed once"),
    asProp("mandatory", controls.length, "AMC prop mandatory"),
    asProp("levels", n((r) => r.levels.length), "one AMC prop level per level"),
    asProp("riskRationale", controls.length, "AMC-namespaced part risk-rationale"),
    asProp("applicability", controls.length, `AMC prop applicability, ${json}`),
    asProp("tests", n((r) => r.tests.length), `AMC prop test, ${json}`),
    asProp("evidence", n((r) => r.evidence.length), `AMC prop evidence-contract, ${json}`),
    asProp("binding", controls.length, `AMC prop binding, ${json}; OSCAL params would assert values, so AMC parameters are not params`),
    asProp("invalidatedBy", n((r) => r.invalidatedBy.length), "one AMC prop invalidated-by per trigger"),
    asProp("owner", controls.length, "AMC prop owner-role"),
    asProp("clock", n((r) => Number(r.clock !== null)), `AMC prop clock, ${json}`),
    asProp("crosswalk", n((r) => r.crosswalk.length), `AMC prop crosswalk, ${json}; informational, a crosswalk never satisfies its target`),
    asProp("review", controls.length, `AMC prop review, ${json}`),
    asProp("provenance", controls.length, `AMC prop provenance, ${json}`),
    asProp("citations", n((r) => r.citations.length),
      `back-matter resource with title, URL and (when retrieved) content SHA-256; edition, jurisdiction, status, dates, applicability and legal review in AMC prop citation, ${json}`),
    loss("catalog", "manifest", 1, "prop", `metadata AMC prop catalog-manifest, ${json}`),
    loss("catalog", "packs[]", cat.packs.size, "prop", `group title and id; the pack manifest in the group's AMC prop pack, ${json}`),
    loss("catalog", "fixtures[]", cat.fixtures.size, "omitted", "fixture files are not exported; metadata AMC prop catalog-digest covers their bytes"),
    loss("catalog", "producers[]", cat.producers.length, "omitted", "producers.yaml is not exported; catalog-digest covers it"),
    loss("catalog", "vocabulary", Number(cat.vocabulary !== null), "omitted", "vocabulary.yaml is not exported; catalog-digest covers it"),
    loss("catalog", "publisherHosts[]", cat.publisherHosts.length, "omitted", "publisher-hosts.yaml is not exported; catalog-digest covers it")
  ];
}

/** Throws unless the catalog loaded cleanly and holds at least one control. */
export function toOscalCatalog(cat: LoadedCatalog): { document: object; digest: string; losses: OscalLoss[] } {
  const lock = buildCatalogLock(cat);
  const controls = [...cat.controls.values()].sort(byId);
  if (controls.length === 0) throw new Error("the catalog holds no controls to export");
  const packOf = new Map(lock.controls.map((c) => [c.id, c.pack]));
  const packs = [...cat.packs.values()].map((p) => p.manifest).sort(byId);
  const lastModified = controls.flatMap((r) => [r.provenance.draftedAt, r.review.reviewedAt ?? r.provenance.draftedAt]).map(utc).sort().at(-1) as string;
  const unpacked = controls.filter((r) => !packOf.get(r.id)).map(oscalControl);
  const resources = controls.flatMap((r) => r.citations.map((c) => citationResource(r, c)));
  const document = {
    catalog: {
      uuid: oscalUuid("catalog", lock.catalog.digest),
      metadata: oscalMetadata("AMC Regulated Control Catalog (experimental)", lastModified, lock.catalog.version,
        [prop("catalog-id", lock.catalog.id), prop("catalog-digest", lock.catalog.digest), jsonProp("catalog-manifest", cat.manifest)], REMARKS),
      ...nonEmpty("groups", packs.map((m) => ({
        id: m.id,
        title: line(m.title),
        props: [prop("layer", String(m.layer)), ...m.stations.map((s) => prop("station", s)), jsonProp("pack", m)],
        ...nonEmpty("controls", controls.filter((r) => packOf.get(r.id) === m.id).map(oscalControl))
      }))),
      ...nonEmpty("controls", unpacked),
      ...(resources.length > 0 ? { "back-matter": { resources } } : {})
    }
  };
  return { document, digest: lock.catalog.digest, losses: catalogLosses(cat, controls) };
}
