// The agent projects list page, the start form and the intro's Add a person form, moved unchanged from a4.js (the
// a4-plain split). Home's card (a4.js showHomeEntry) binds the same start form.
import { apiGet, apiNativeRequest } from "./api.js";
import * as view from "./a4View.js";
import * as start from "./a4Start.js";
import * as packs from "./a4Pack.js";
import { canCreate, isOwner } from "./a4Who.js";
import { API, claimSink, guarded, listOf, me, notice, one, params, root, send, setClaimSink, showClaims, showError, storePack, uuid } from "./a4Send.js";

/**
 * A start form's submit: inline validation in sentences, then one create request; on success the new project opens (with
 * ?pack= when an industry was picked). A refusal is shown in the form, as a sentence and the next step.
 */
export function bindCreateForm(createForm) {
  if (!createForm) return;
  const formError = (html) => {
    const target = createForm.querySelector(".a4-form-error");
    if (target) { target.innerHTML = html; target.hidden = !html; }
  };
  createForm.querySelector("[data-a4-example-project]")?.addEventListener("click", () => {
    createForm.elements.name.value = start.SAMPLE_PROJECT.name;
    createForm.elements.expertise.value = start.SAMPLE_PROJECT.expertise;
    formError("");
    createForm.elements.name.focus();
  });
  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void guarded(async () => {
      const form = new FormData(createForm);
      const agentId = String(form.get("agentId") ?? "").trim();
      const name = String(form.get("name") ?? "").trim();
      // Inline validation in sentences, before anything is sent.
      if (!name) { formError("Write a project name, for example Invoice triage helper. Nothing was sent."); createForm.elements.name.focus(); return; }
      if (agentId && !/^[a-z0-9][a-z0-9_-]{0,127}$/.test(agentId)) {
        formError("The agent id uses lowercase letters, digits, _ and -, and starts with a letter or digit (for example invoice-helper). Leave it empty for a new agent. Nothing was sent.");
        createForm.elements.agentId.focus();
        return;
      }
      formError("");
      const action = { label: "Start an agent project", path: `${API}/projects`,
        body: { clientRequestId: uuid(), name, expertise: form.get("expertise") || "novice", ...(agentId ? { agentId } : {}),
          ...(form.get("practice") === "yes" ? { practice: true } : {}) } };
      const pack = packs.packIdOf(form.get("pack"));
      action.after = (data) => {
        const projectId = one(data, "project").projectId;
        if (pack) storePack(projectId, pack);
        location.href = `./a4Project?project=${encodeURIComponent(projectId)}${pack ? `&pack=${pack}` : ""}`;
      };
      action.after(await send(action));
    }).catch((error) => {
      if (notice) showError(error);
      else formError(start.errorHtml(error));
    });
  });
}

/**
 * The intro's inline "Add a person" form (OWNER only; Studio checks the role again). One call (POST /api/v1/a4/people)
 * creates the account with a first password AMC makes and shows once, here; the owner hands it over in person.
 */
function bindAddPerson(form, toggle) {
  if (!form || !toggle) return;
  toggle.addEventListener("click", () => {
    form.hidden = !form.hidden;
    toggle.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) form.elements.username.focus();
  });
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    form.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = form.querySelector(".a4-form-error");
    const status = form.querySelector("[data-a4-add-status]");
    const username = String(form.elements.username.value ?? "").trim();
    error.hidden = true;
    status.replaceChildren();
    if (!username) { error.textContent = "Write their user name. Nothing was sent."; error.hidden = false; return; }
    try {
      const data = await apiNativeRequest(`${API}/people`, { method: "POST", nativeCsrfToken: me?.nativeCsrfToken ?? undefined,
        body: { clientRequestId: uuid(), username, workspaceRoles: String(form.elements.roles.value).split(",") } });
      form.reset();
      status.innerHTML = start.addedPersonHtml(data);
    } catch (failure) {
      error.innerHTML = start.errorHtml(failure);
      error.hidden = false;
    }
  });
}

export async function renderListPage(options) {
  setClaimSink([]);
  const projects = listOf(await apiNativeRequest(`${API}/projects`), "projects");
  showClaims(claimSink);
  setClaimSink(null);
  // The Industry Pack catalog is optional here: without it the form simply has no industry choice.
  const catalog = canCreate(me, options) ? listOf(await apiGet("/industry-packs/list").catch(() => null), "packs") : [];
  const creating = params.has("new") || projects.length === 0;
  root.innerHTML = `${start.renderIntro({ creating, canAdd: isOwner(me) })}${canCreate(me, options) ? view.renderCreateForm(creating,
    packs.packSelectHtml(catalog, packs.packIdOf(params.get("pack"))), { start: options?.workspace?.start ?? null })
    : `<p class="muted">${view.CREATE_NEEDS}.</p>`}${view.renderProjectList(projects)}`;
  bindCreateForm(root.querySelector("#a4CreateForm"));
  bindAddPerson(root.querySelector("#a4AddPerson"), root.querySelector("[data-a4-add-person]"));
  root.querySelector("[data-a4-show-create]")?.addEventListener("click", () => {
    const create = root.querySelector("#a4Create");
    if (create) { create.hidden = false; create.querySelector("input")?.focus(); }
  });
}
