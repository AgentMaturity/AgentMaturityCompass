// The Ops page's script, served from a file so the console's Content-Security-Policy needs no inline scripts.
import "./focusableScroll.js";

async function getJson(path, init) {
  const res = await fetch(path, Object.assign({ credentials: "include" }, init || {}));
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error((body && body.error) || res.status + " " + res.statusText);
  }
  return body;
}

// Errors and server data go into the page as text, never as markup.
const esc = (text) => String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const warnHtml = (error) => "<div class='warn'>Could not load: " + esc(error instanceof Error ? error.message : error) + ". Refresh to try again.</div>";

function setOut(value) {
  document.getElementById("out").textContent = JSON.stringify(value, null, 2);
}

async function refresh() {
  try {
    const ready = await getJson("/readyz");
    const status = ready.status || "UNKNOWN";
    document.getElementById("ready").innerHTML =
      "<div><strong>" +
      esc(status) +
      "</strong></div><pre>" +
      esc(JSON.stringify(ready, null, 2)) +
      "</pre>";
  } catch (error) {
    document.getElementById("ready").innerHTML = warnHtml(error);
  }

  try {
    const retention = await getJson("/ops/retention/status");
    document.getElementById("retention").innerHTML = "<pre>" + esc(JSON.stringify(retention, null, 2)) + "</pre>";
  } catch (error) {
    document.getElementById("retention").innerHTML = warnHtml(error);
  }

  try {
    const maintenance = await getJson("/ops/maintenance/stats");
    document.getElementById("maintenance").innerHTML = "<pre>" + esc(JSON.stringify(maintenance, null, 2)) + "</pre>";
  } catch (error) {
    document.getElementById("maintenance").innerHTML = warnHtml(error);
  }

  try {
    const backup = await getJson("/ops/backup/status");
    const warning = backup.warning ? "warn" : "";
    document.getElementById("backup").innerHTML =
      "<div class='" + warning + "'><pre>" + esc(JSON.stringify(backup, null, 2)) + "</pre></div>";
  } catch (error) {
    document.getElementById("backup").innerHTML = warnHtml(error);
  }
}

document.getElementById("retention-dry").addEventListener("click", async () => {
  try {
    const out = await getJson("/ops/retention/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true })
    });
    setOut(out);
    refresh();
  } catch (error) {
    setOut({ error: String(error) });
  }
});

document.getElementById("retention-run").addEventListener("click", async () => {
  if (!window.confirm("Run retention now? It archives old records and deletes what the retention policy says to remove. This cannot be undone. Run Dry-Run first to see what would change.")) return;
  try {
    const out = await getJson("/ops/retention/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: false })
    });
    setOut(out);
    refresh();
  } catch (error) {
    setOut({ error: String(error) });
  }
});

document.getElementById("vacuum").addEventListener("click", async () => {
  try {
    const out = await getJson("/ops/maintenance/vacuum", { method: "POST" });
    setOut(out);
    refresh();
  } catch (error) {
    setOut({ error: String(error) });
  }
});

document.getElementById("prune").addEventListener("click", async () => {
  try {
    const out = await getJson("/ops/maintenance/prune", { method: "POST" });
    setOut(out);
    refresh();
  } catch (error) {
    setOut({ error: String(error) });
  }
});

refresh();
