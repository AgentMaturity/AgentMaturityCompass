import type { ServerResponse } from "node:http";
import { CONSOLE_CONTENT_SECURITY_POLICY } from "../console/consoleServer.js";

/**
 * The host console (LIVE-RUNTIME-15): the portfolio page, its script and the host event hub, kept out of the router.
 * Workspace names are host-admin input, so the script builds rows with textContent and encodes the link; the page
 * carries the console's CSP (no inline script), so a crafted name cannot script another host admin's browser.
 */
interface HostEventPayload {
  type: string;
  ts: number;
  workspaceId?: string;
  summaryHash?: string;
  version?: number;
}

export class HostSseHub {
  private readonly clients = new Set<ServerResponse>();

  add(res: ServerResponse): void {
    this.clients.add(res);
  }

  remove(res: ServerResponse): void {
    this.clients.delete(res);
  }

  emit(event: HostEventPayload): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(payload);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  closeAll(): void {
    for (const res of this.clients) {
      try {
        res.end();
      } catch {
        // noop
      }
    }
    this.clients.clear();
  }
}

const HOST_PAGE = "<!doctype html><html><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>AMC Host</title><style>body{font-family:system-ui;margin:1rem}input,button{font:inherit}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:.4rem}code{background:#f4f4f4;padding:.1rem .25rem}</style></head><body><h1>AMC Host Portfolio</h1><p id='status'>Loading…</p><div><label>Username <input id='u'/></label> <label>Password <input id='p' type='password'/></label> <button id='login'>Login</button></div><h2>Workspaces</h2><table id='tbl'><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Roles</th><th>Open</th></tr></thead><tbody></tbody></table><script type='module' src='/host/console/assets/host.js'></script></body></html>";

const HOST_SCRIPT = `const st = document.getElementById('status');
const tbody = document.querySelector('#tbl tbody');
const cell = (row, text, code) => {
  const td = document.createElement('td');
  const target = code ? td.appendChild(document.createElement('code')) : td;
  target.textContent = text;
  row.appendChild(td);
};
async function load() {
  try {
    const r = await fetch('/host/api/workspaces', { credentials: 'include' });
    tbody.replaceChildren();
    if (!r.ok) { st.textContent = 'Not logged in'; return; }
    const j = await r.json();
    st.textContent = 'Loaded';
    for (const w of j.workspaces || []) {
      const tr = document.createElement('tr');
      cell(tr, String(w.workspaceId), true);
      cell(tr, String(w.name));
      cell(tr, String(w.status));
      cell(tr, (w.roles || []).join(', '));
      const link = document.createElement('a');
      link.href = '/w/' + encodeURIComponent(String(w.workspaceId)) + '/console';
      link.textContent = 'Open';
      tr.appendChild(document.createElement('td')).appendChild(link);
      tbody.appendChild(tr);
    }
  } catch (e) { st.textContent = String(e); }
}
document.getElementById('login').addEventListener('click', async () => {
  const username = document.getElementById('u').value;
  const password = document.getElementById('p').value;
  const r = await fetch('/host/api/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!r.ok) { st.textContent = 'Login failed'; return; }
  await load();
});
load();
`;

/** Serves /host/console (redirect), the page and its script; false for any other path. */
export function serveHostConsole(pathname: string, res: ServerResponse): boolean {
  if (pathname === "/host/console") {
    res.writeHead(302, { location: "/host/console/host.html" }).end();
    return true;
  }
  if (pathname === "/host/console/host.html") {
    res.setHeader("content-security-policy", CONSOLE_CONTENT_SECURITY_POLICY);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(HOST_PAGE);
    return true;
  }
  if (pathname === "/host/console/assets/host.js") {
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" }).end(HOST_SCRIPT);
    return true;
  }
  return false;
}
