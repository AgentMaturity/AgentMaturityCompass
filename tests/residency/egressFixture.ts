/**
 * Shared fixture for the per-site residency denial tests (P2-01 debt, P2-35). Each site test proves three things:
 * a denied endpoint opens no connection and calls no fetch; the scope captured at the call's entry holds across its
 * awaits (a carrier changed mid-call never widens it); a 3xx answer is not followed to the host it names.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { destinationRegistryPath } from "../../src/residency/destinationRegistry.js";
import { initWorkspace } from "../../src/workspace.js";

export interface Listener {
  readonly server: Server;
  readonly url: string;
  /** Sockets accepted: a refused egress leaves this at zero. */
  connections: number;
  readonly requests: Array<{ method: string; path: string; body: string }>;
}
export type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void | Promise<void>;

const listeners: Listener[] = [];
const roots: string[] = [];

export async function listen(handler: Handler = (_req, res) => { res.writeHead(200, { "content-type": "application/json" }).end("{}"); }): Promise<Listener> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      listener.requests.push({ method: req.method ?? "", path: req.url ?? "", body });
      void Promise.resolve(handler(req, res, body)).catch(() => res.destroy());
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const listener: Listener = { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, connections: 0, requests: [] };
  server.on("connection", () => { listener.connections += 1; });
  listeners.push(listener);
  return listener;
}

/** Every request is answered 302 to `target`, a host the caller's egress check never saw. */
export const redirectTo = (target: Listener): Promise<Listener> =>
  listen((_req, res) => { res.writeHead(302, { location: `${target.url}/elsewhere` }).end(); });

export function tempRoot(prefix = "amc-p201-"): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

export function newWorkspace(root: string, name: string): string {
  const workspace = join(root, name);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  return workspace;
}

/** A destination registry without its signature: every residency check in that workspace is refused (registry_unverifiable). */
export function blockResidency(workspace: string): void {
  mkdirSync(dirname(destinationRegistryPath(workspace)), { recursive: true });
  writeFileSync(destinationRegistryPath(workspace), "schemaVersion: amc.residency-destinations/v1\n");
}

export async function closeFixtures(): Promise<void> {
  for (const listener of listeners.splice(0)) {
    listener.server.closeAllConnections();
    await new Promise<void>((done) => listener.server.close(() => done()));
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}
