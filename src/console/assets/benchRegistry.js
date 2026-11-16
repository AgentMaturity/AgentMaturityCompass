import { recordDetails, showResult } from "./pageKit.js";
import { apiGet, apiPost, onClaims, showSignIn, whoami } from "./api.js";
import { installClaimStrip } from "./components/claimBadge.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function card(title, body) {
  return `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function loadRegistries() {
  return apiGet("/bench/registries").catch(() => ({ registries: { benchRegistries: { version: 1, registries: [] } } }));
}

function render(root, registriesPayload) {
  const registries = registriesPayload?.registries?.benchRegistries?.registries ?? [];
  root.innerHTML = `
    ${card(
      "Configured Registries",
      `
      <p class="muted">A benchmark registry is a place AMC can read other teams' published benchmark results from.</p>
      ${registries.length ? `<ul>${registries.map((row) => `<li><code>${esc(row.id)}</code>${row.type ? ` (${esc(row.type)})` : ""}</li>`).join("")}</ul>` : "<p>No registries set up yet.</p>"}
      ${recordDetails(registriesPayload)}
      <label for="benchRegistriesJson">Edit the registry list (JSON), then apply it</label>
      <div class="row wrap">
        <textarea id="benchRegistriesJson" rows="10" style="width:100%">${esc(
          JSON.stringify(registriesPayload.registries, null, 2)
        )}</textarea>
      </div>
      <div class="row wrap">
        <button id="benchRegistriesApply">Apply Registries</button>
      </div>
      <pre id="benchRegistriesOut" class="scroll muted"></pre>
    `
    )}
    ${card(
      "Browse Registry",
      `
      <div class="row wrap">
        <select id="benchRegistryId" aria-label="Registry"${registries.length ? "" : " disabled"}>
          ${registries.map((row) => `<option value="${esc(row.id)}">${esc(row.id)}</option>`).join("")}
        </select>
        <input id="benchRegistryQuery" placeholder="Search (optional)" aria-label="Search the registry (optional)" />
        <button id="benchRegistryBrowse"${registries.length ? "" : " disabled"}>Browse</button>
      </div>
      <div class="row wrap">${registries.length ? "" : '<p class="muted">Add a registry above first; then you can browse it here.</p>'}
      </div>
      <pre id="benchRegistryBrowseOut" class="scroll"></pre>
    `
    )}
  `;
}

function wireActions() {
  const out = document.getElementById("benchRegistriesOut");
  document.getElementById("benchRegistriesApply")?.addEventListener("click", async () => {
    const raw = document.getElementById("benchRegistriesJson")?.value || "";
    const parsed = parseJson(raw);
    if (!parsed) {
      out.textContent = "That is not valid JSON, so nothing was applied. Check the brackets and quotes.";
      return;
    }
    try {
      const result = await apiPost("/bench/registry/add", { replaceAll: true, config: parsed });
      showResult(out, result);
    } catch (error) {
      out.textContent = String(error);
    }
  });

  const browseOut = document.getElementById("benchRegistryBrowseOut");
  document.getElementById("benchRegistryBrowse")?.addEventListener("click", async () => {
    const id = document.getElementById("benchRegistryId")?.value || "";
    const query = document.getElementById("benchRegistryQuery")?.value || "";
    try {
      const suffix = query ? `&query=${encodeURIComponent(query)}` : "";
      const data = await apiGet(`/bench/registry/browse?registryId=${encodeURIComponent(id)}${suffix}`);
      showResult(browseOut, data);
    } catch (error) {
      browseOut.textContent = String(error);
    }
  });
}

async function main() {
  const status = document.getElementById("status");
  const app = document.getElementById("app");
  const me = await whoami().catch(() => null);
  if (!me) {
    showSignIn(status);
    return;
  }
  status.textContent = `Signed in as ${me.username ?? me.userId ?? "user"}`;
  const registries = await loadRegistries();
  render(app, registries);
  wireActions();
}

installClaimStrip(document.body.dataset.page, onClaims);
void main();
