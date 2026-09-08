#!/usr/bin/env node
/**
 * Generates THIRD_PARTY_NOTICES from the vendored tree.
 *
 * ADR-0001 accepted the attribution obligation that vendoring creates: the
 * Cordis family is MIT, and `native/landlock-run` (arriving in P4.4) is
 * BSD-3-Clause, whose clause 2 requires the copyright notice to travel with
 * binary distributions. Generated rather than hand-kept for the same reason
 * as the counts and the API reference — a licence file maintained by memory
 * is a licence file that goes stale.
 *
 *   node scripts/vendor/gen-third-party-notices.mjs          write
 *   node scripts/vendor/gen-third-party-notices.mjs --check  fail if stale
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const vendorDir = join(root, "vendor");
const outPath = join(root, "THIRD_PARTY_NOTICES");
const check = process.argv.includes("--check");

const ledger = readFileSync(join(vendorDir, "UPSTREAM_LEDGER_DSH.md"), "utf8");

/** Upstream identity per directory, read from dsh's manifest table. */
function upstreamFor(dir, manifest) {
  const row = new RegExp(`^\\|\\s*\`${dir}/\`\\s*\\|([^|]*)\\|([^|]*)\\|([^|]*)\\|([^|]*)\\|([^|]*)\\|`, "m").exec(ledger);
  // The ledger covers the dsh-derived packages only. A package vendored from
  // anywhere else declares its own provenance, so the notice never has to send a
  // reader to a table that does not mention it.
  if (!row) {
    const declared = manifest?.amcUpstream;
    if (!declared) return null;
    return {
      upstreamName: declared.name,
      upstreamRepo: declared.repo,
      commit: declared.version ?? "(pinned by version)"
    };
  }
  return {
    upstreamName: row[2].trim().replace(/`/g, ""),
    upstreamRepo: row[4].trim(),
    commit: row[5].trim().replace(/`/g, "")
  };
}

const entries = [];
for (const dir of readdirSync(vendorDir).sort()) {
  const manifestPath = join(vendorDir, dir, "package.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const licensePath = join(vendorDir, dir, "LICENSE");
  entries.push({
    dir,
    name: manifest.name,
    version: manifest.version,
    license: manifest.license ?? "MIT",
    licenseText: existsSync(licensePath) ? readFileSync(licensePath, "utf8").trim() : null,
    upstream: upstreamFor(dir, manifest)
  });
}

const missingLicence = entries.filter((e) => !e.licenseText);
if (missingLicence.length > 0) {
  console.error(
    "Vendored packages without a LICENSE file:\n" +
      missingLicence.map((e) => `  - vendor/${e.dir}`).join("\n") +
      "\nVendoring without carrying the licence is not permitted."
  );
  process.exit(1);
}

const body = `# Third-Party Notices

AMC vendors the packages below under \`vendor/\`, rescoped to the \`@amc/\`
namespace (ADR-0001). Directory names, version numbers and upstream runtime
identifiers are unchanged; only package names and the module specifiers that
reach them were rewritten. Local modifications are logged in
\`vendor/VENDOR_DIVERGENCE.md\`, and the pre-existing DeepSeek Harness
modifications this tree arrived with are preserved verbatim in
\`vendor/UPSTREAM_LEDGER_DSH.md\`.

The Cordis framework is the work of the Cordiverse project
(https://github.com/cordiverse/cordis) and is validated at scale by Koishi's
plugin ecosystem. The already-hardened tree AMC vendors came by way of
DeepSeek Harness (MIT), which had applied the patches its own ledger records.

${entries
  .map(
    (entry) => `## ${entry.name} ${entry.version}

- Vendored at: \`vendor/${entry.dir}/\`
- Upstream package: \`${entry.upstream?.upstreamName ?? "(see vendor ledger)"}\`
- Upstream source: ${entry.upstream?.upstreamRepo ?? "(see vendor ledger)"}
- Upstream commit: \`${entry.upstream?.commit ?? "(see vendor ledger)"}\`
- License: ${entry.license}

\`\`\`
${entry.licenseText}
\`\`\`
`
  )
  .join("\n")}
## Pending obligations

\`native/landlock-run\` is **BSD-3-Clause**, not MIT, and arrives with the
sandbox work in Phase 4.4. Its notice must be added here when it lands: clause 2
requires the copyright notice and disclaimer to accompany binary
redistribution, which a packaged AMC release performs.


Ubuntu Bubblewrap AppArmor profile (optional operator configuration)
-----------------------------------------------------------------
The unmodified deploy/apparmor/bwrap-userns-restrict file comes from Ubuntu
apparmor-profiles 4.0.1really4.0.1-0ubuntu0.24.04.7 and is licensed separately
under GPL-2.0-or-later. Its complete package notices, license text, source
package link and exact file/package hashes are distributed alongside it in
deploy/apparmor/COPYRIGHT.upstream, GPL-2.0.txt and README.md. AMC does not
install or load this system policy automatically.
`;

if (check) {
  if (!existsSync(outPath) || readFileSync(outPath, "utf8") !== body) {
    console.error(
      "THIRD_PARTY_NOTICES is stale.\n  Run: node scripts/vendor/gen-third-party-notices.mjs"
    );
    process.exit(1);
  }
  console.log(`THIRD_PARTY_NOTICES is current (${entries.length} vendored packages).`);
  process.exit(0);
}

writeFileSync(outPath, body);
console.log(`THIRD_PARTY_NOTICES written (${entries.length} vendored packages).`);
