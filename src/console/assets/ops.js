// The Maintenance (Ops) page. It uses the console's shared shell and request helper (api.js), so it has the menu, the
// signed-out and AMC-stopped notices, and plain error words like every other page (C-07). Records read as rows; the raw
// record is under "Show the record"; host paths read as .amc/...
import { apiGet, apiPost, applyRoleGates, showSignIn, whoami } from "./api.js";
import { confirmPress, esc, recordRows } from "./pageKit.js";
import { plainErrorText } from "./plainError.js";

const fill = (id, html) => {
  const el = document.getElementById(id);
  el.removeAttribute("aria-busy");
  el.innerHTML = html;
};
const problem = (error) => `<p class="status-bad" role="alert">${esc(plainErrorText(error))}</p>`;

async function section(id, path, lead = () => "") {
  try {
    const body = await apiGet(path);
    fill(id, `${lead(body)}${recordRows(body)}`);
  } catch (error) {
    fill(id, problem(error));
  }
}

function refresh() {
  return Promise.all([
    section("ready", "/readyz", (ready) => `<p><strong>${["READY", "OK"].includes(String(ready?.status).toUpperCase()) || ready?.ok === true
      ? "Ready." : `Not ready (${esc(ready?.status ?? "unknown")}). The reasons are listed below.`}</strong></p>`),
    section("retention", "/ops/retention/status"),
    section("maintenance", "/ops/maintenance/stats"),
    section("backup", "/ops/backup/status", (backup) => backup?.warning
      ? `<p class="status-bad"><strong>${backup.lastBackupTs ? `The last backup is older than ${esc(backup.warningThresholdDays ?? 7)} days.` : "No backup has been made yet."}</strong>
        Make one with <code>amc backup create</code> in the workspace folder.</p>` : "<p>Backup is recent enough.</p>")
  ]);
}

function action(id, path, body, done, confirmWhat = null) {
  document.getElementById(id).addEventListener("click", async (event) => {
    if (confirmWhat && !confirmPress(event.currentTarget, confirmWhat)) return;
    try {
      const out = await apiPost(path, body);
      fill("out", `<p class="status-ok">${esc(done)} (${esc(new Date().toLocaleTimeString())})</p>${recordRows(out)}`);
      await refresh();
    } catch (error) {
      fill("out", problem(error));
    }
  });
}

async function main() {
  const me = await whoami().catch(() => null);
  if (!me) {
    showSignIn(document.getElementById("status"));
    for (const id of ["ready", "retention", "maintenance", "backup"]) fill(id, '<p class="muted">Sign in to see this.</p>');
    return;
  }
  applyRoleGates(document);
  action("retention-dry", "/ops/retention/run", { dryRun: true }, "Dry run finished: nothing was removed. What would go is listed below.");
  action("retention-run", "/ops/retention/run", { dryRun: false }, "Old records were archived and removed as the retention rules say.",
    "remove old records (this cannot be undone)");
  action("vacuum", "/ops/maintenance/vacuum", {}, "The database was compacted.");
  action("prune", "/ops/maintenance/prune", {}, "The cache was cleared.");
  await refresh();
}

void main();
