import { apiGet, apiPost, whoami, onClaims } from "./api.js";
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
      <pre class="scroll">${esc(JSON.stringify(registriesPayload, null, 2))}</pre>
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
        <select id="benchRegistryId">
          ${registries.map((row) => `<option value="${esc(row.id)}">${esc(row.id)}</option>`).join("")}
        </select>
        <input id="benchRegistryQuery" placeholder="optional query" />
        <button id="benchRegistryBrowse">Browse</button>
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
      out.textContent = "registries JSON is invalid";
      return;
    }
    try {
      const result = await apiPost("/bench/registry/add", { replaceAll: true, config: parsed });
      out.textContent = JSON.stringify(result, null, 2);
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
      browseOut.textContent = JSON.stringify(data, null, 2);
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
    status.textContent = "Authentication required.";
    return;
  }
  status.textContent = `Signed in as ${me.username ?? me.userId ?? "user"}`;
  const registries = await loadRegistries();
  render(app, registries);
  wireActions();
}

installClaimStrip(document.body.dataset.page, onClaims);
void main();
