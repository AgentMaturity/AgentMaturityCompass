import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { executeHttpFetch } from "../src/toolhub/toolhubExecutors/http.js";

/**
 * The host allowlist is checked against the URL a caller asked for. That is
 * only sound while the fetch does not follow redirects.
 *
 * Measured, because the two obvious implementations differ:
 *
 *   node:http.request  -> does NOT follow. Returns the 302 itself.
 *   global fetch()     -> DOES follow, by default.
 *
 * So replacing the executor with `fetch()` — an entirely reasonable-looking
 * modernisation — would turn an allowlisted host into an open redirector:
 * request api.github.com, receive a 302 to anywhere, and the guard that
 * approved the call never sees the second URL. This test exists so that change
 * cannot be made quietly.
 */
const servers: Server[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await new Promise<void>((done) => server.close(() => done()));
  }
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  return typeof address === "object" && address !== null ? address.port : 0;
}

describe("the egress boundary and redirects", () => {
  it("does not follow a redirect away from the allowlisted host", async () => {
    const destinationPort = await listen((_request, response) => {
      response.writeHead(200);
      response.end("OFF-ALLOWLIST-BODY");
    });
    const redirectorPort = await listen((_request, response) => {
      response.writeHead(302, { location: `http://127.0.0.1:${destinationPort}/` });
      response.end("moved");
    });

    const result = await executeHttpFetch({ url: `http://127.0.0.1:${redirectorPort}/`, simulate: false });

    expect(result.status, "the redirect itself is the response").toBe(302);
    expect(
      result.body,
      "following it would fetch a host the allowlist guard never saw"
    ).not.toContain("OFF-ALLOWLIST-BODY");
  });

  it("surfaces the redirect target instead of silently chasing it", async () => {
    // A caller that WANTS the destination must ask for it explicitly, which
    // sends it back through the guard.
    const port = await listen((_request, response) => {
      response.writeHead(301, { location: "http://elsewhere.invalid/secret" });
      response.end();
    });

    const result = await executeHttpFetch({ url: `http://127.0.0.1:${port}/`, simulate: false });
    expect(result.status).toBe(301);
    expect(result.headers["location"], "the caller can see where it was sent").toContain("elsewhere.invalid");
  });
});
