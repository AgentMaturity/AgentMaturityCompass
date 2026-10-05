import { createHash } from "node:crypto";

/** The package surface a consumer imports or runs. Scripts, dependencies and the version are not part of it. */
const ENTRY_FIELDS = ["name", "type", "main", "types", "exports", "bin", "files"] as const;

/** sha256 of the whole package.json the archived restoration manifests recorded. */
export const ARCHIVED_PACKAGE_MANIFEST_SHA256 = "56035a95df5ba813dc470ad15d85f5439a880cfca823f940530c4c5f0ad6563d";

/** packageEntriesSha256 of that archived package.json (main @ 786d8abb). */
export const ARCHIVED_PACKAGE_ENTRIES_SHA256 = "4b4daa61bf086bcade2c015fbe0c15174e0e62a018b69cc293c10f23bd1d35c8";

export function packageEntriesSha256(manifest: string | Buffer): string {
  const pkg = JSON.parse(manifest.toString()) as Record<string, unknown>;
  const entries = Object.fromEntries(ENTRY_FIELDS.map(field => [field, pkg[field] ?? null]));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

const ENTRIES_IMPORT = 'import { ARCHIVED_PACKAGE_ENTRIES_SHA256, ARCHIVED_PACKAGE_MANIFEST_SHA256, packageEntriesSha256 } from "./helpers/packageEntries.js";\n';
const WHOLE_MANIFEST_PIN = "    expect(hash(manifest)).toBe(map.packageManifestSha256);\n";
const ENTRIES_PIN = "    expect(map.packageManifestSha256).toBe(ARCHIVED_PACKAGE_MANIFEST_SHA256);\n"
  + "    expect(packageEntriesSha256(manifest)).toBe(ARCHIVED_PACKAGE_ENTRIES_SHA256);\n";

/** The bounded P0-01 edit to a frozen test: its whole-manifest pin becomes the package-entries pin. */
export function withPackageEntriesPin(source: string): string {
  if (source.split(WHOLE_MANIFEST_PIN).length !== 2) throw new Error("Expected exactly one whole-manifest pin");
  const afterFirstLine = source.indexOf("\n") + 1;
  return source.slice(0, afterFirstLine) + ENTRIES_IMPORT + source.slice(afterFirstLine).replace(WHOLE_MANIFEST_PIN, ENTRIES_PIN);
}
