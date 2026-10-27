/** Source-valid seeded declarations are metadata, never production harness runs or admitted evidence. */
import type { LoadedCatalog } from "../../src/catalog/loader.js";
import type { ControlRecord, FixtureEnvelope } from "../../src/catalog/types.js";
import { loadExecutedFixtureDeclaration } from "../../src/assurance/executed/catalogCases.js";
export interface CatalogFixtureReference {
  readonly ref: string;
  readonly control: ControlRecord;
  readonly envelope: FixtureEnvelope;
}
/** Only exact catalog-loaded objects and known source cases may take this separate branch. */
export function isSeededFixtureDeclaration(catalog: LoadedCatalog, fixture: CatalogFixtureReference): boolean {
  if (fixture.envelope.setup.metadataOnly !== true) return false;
  const loaded = catalog.fixtures.get(fixture.ref);
  if (!loaded || loaded.envelope !== fixture.envelope || catalog.controls.get(fixture.control.id) !== fixture.control ||
      loaded.envelope.controlId !== fixture.control.id) throw new Error(`Fixture declaration source mismatch: ${fixture.ref}`);
  const selected = loadExecutedFixtureDeclaration(loaded, catalog);
  if (!selected.ok || selected.compiled.controlId !== fixture.control.id) throw new Error(`Invalid seeded fixture declaration: ${fixture.ref}`);
  return true;
}
export function partitionFixtureDeclarations<T extends CatalogFixtureReference>(catalog: LoadedCatalog, input: readonly T[]): {
  fixtures: T[]; declarations: T[];
} {
  const fixtures: T[] = [], declarations: T[] = [];
  for (const fixture of input) (isSeededFixtureDeclaration(catalog, fixture) ? declarations : fixtures).push(fixture);
  return { fixtures, declarations };
}
