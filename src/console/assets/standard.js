import { renderSchemaViewer } from "./components/schemaViewer.js";
import { renderVerifyPanel } from "./components/verifyPanel.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pickSchema(list, preferred = "amcpass.schema.json") {
  const rows = Array.isArray(list) ? list : [];
  const found = rows.find((row) => row?.name === preferred);
  if (found?.name) return found.name;
  return typeof rows[0]?.name === "string" ? rows[0].name : preferred;
}

export async function renderStandardPage(params) {
  const [schemas, status] = await Promise.all([
    params.apiGet("/standard/schemas").catch(() => ({ schemas: [], verify: { ok: false, errors: ["standard schemas unavailable"] } })),
    params.apiGet("/status").catch(() => null)
  ]);
  // L3: ask for a schema only once one exists, and show the one picked from the list (?schema=).
  const listed = Array.isArray(schemas?.schemas) ? schemas.schemas : [];
  const requested = new URL(window.location.href).searchParams.get("schema");
  const selected = listed.some((row) => row?.name === requested) ? requested : pickSchema(listed);
  const selectedSchema = listed.length === 0 ? null
    : await params.apiGet(`/standard/schemas/${encodeURIComponent(selected)}`).catch(() => null);
  const warnings = [];
  if (status?.passport?.policySignatureValid === false) {
    warnings.push("<div class='card status-bad'><strong>PASSPORT POLICY UNTRUSTED</strong></div>");
  }
  if (schemas?.verify?.ok === false) {
    warnings.push(`<div class='card status-warn'><strong>SCHEMA BUNDLE NOT VERIFIED</strong>: ${esc((schemas.verify.errors || []).join(", "))}</div>`);
  }

  const rows = Array.isArray(schemas?.schemas) ? schemas.schemas : [];
  params.root.innerHTML = [
    ...warnings,
    params.card(
      "Open Compass Standard",
      `
      <div class="row wrap">
        <button id="standardGenerateBtn" data-roles="OWNER">Generate Schemas</button>
        <button id="standardVerifyBtn" class="secondary">Verify Bundle</button>
      </div>
      <div class="muted">bundle ok=${esc(String(Boolean(schemas?.verify?.ok)))} schemas=${esc(String(rows.length))}</div>
      <pre id="standardOut" class="scroll muted"></pre>
      `
    ),
    params.card(
      "Schema List",
      rows.length > 0
        ? `<table><thead><tr><th>Name</th><th>SHA256</th></tr></thead><tbody>${
          rows.map((row) => `<tr><td><a href="?schema=${encodeURIComponent(row.name)}"${row.name === selected ? ' aria-current="true"' : ""}><code>${esc(row.name)}</code></a></td><td><code>${esc(row.sha256)}</code></td></tr>`).join("")
        }</tbody></table>`
        : "<div class='muted'>No schemas generated yet.</div>"
    ),
    selectedSchema ? renderSchemaViewer(selectedSchema)
      : `<div class='card muted'>${rows.length === 0 ? "Generate the schemas to view one." : "Choose a schema from the list."}</div>`,
    renderVerifyPanel()
  ].join("");

  const show = (out, bad = false) => {
    const node = document.getElementById("standardOut");
    if (!node) return;
    node.className = `scroll ${bad ? "status-bad" : "muted"}`;
    node.textContent = typeof out === "string" ? out : JSON.stringify(out, null, 2);
  };
  const failure = (error) => `${error?.status === 403 ? "Not permitted: " : ""}${String(error?.message || error)}`;

  document.getElementById("standardGenerateBtn")?.addEventListener("click", async () => {
    try {
      await params.apiPost("/standard/generate", {});
      await renderStandardPage(params);
    } catch (error) {
      show(failure(error), true);
    }
  });

  document.getElementById("standardVerifyBtn")?.addEventListener("click", async () => {
    try {
      show(await params.apiGet("/standard/verify"));
    } catch (error) {
      show(failure(error), true);
    }
  });

  document.getElementById("standardValidateBtn")?.addEventListener("click", async () => {
    const schemaId = document.getElementById("standardValidateSchema")?.value || "";
    const file = document.getElementById("standardValidateFile")?.value || "";
    const node = document.getElementById("standardValidateOut");
    let out;
    try {
      out = await params.apiPost("/standard/validate", { schemaId: schemaId.trim(), file: file.trim() });
    } catch (error) {
      // 422 carries the validation result; 400/403 carry only an error message.
      out = error?.data && Array.isArray(error.data.errors) ? error.data : { error: String(error?.message || error) };
    }
    if (!node) return;
    node.className = `scroll ${out.ok ? "status-ok" : "status-bad"}`;
    node.textContent = out.ok
      ? `Valid: ${out.file} matches ${out.schemaName}.`
      : out.error
        ? `Not validated: ${out.error}`
        : `Invalid: ${out.file} does not match ${out.schemaName}.\n${(out.errors || []).join("\n")}`;
  });
}

