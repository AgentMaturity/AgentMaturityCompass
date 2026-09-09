import { createServer, type Server, type RequestListener } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { doctorCarrierCheck, requestDoctorStatus } from "../src/doctor/doctorLiveProbe.js";

// Loopback transport fixtures only. These do not verify production credentials,
// signed lease enforcement or real-provider behavior, and are not yet executed.
const servers: Server[] = [];
const intervals: ReturnType<typeof setInterval>[] = [];
async function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("loopback fixture did not bind");
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  for (const timer of intervals.splice(0)) clearInterval(timer);
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

describe("explicit doctor HTTP probes", () => {
  it("returns a complete response status without retaining its potentially sensitive body", async () => {
    const url = await serve((_request, response) => { response.writeHead(200); response.end("secret-body-fixture"); });
    const result = await requestDoctorStatus(url, {}, "{}", 1_000);
    expect(result).toEqual({ status: 200, failure: null });
    expect(JSON.stringify(result)).not.toContain("secret-body-fixture");
    expect(doctorCarrierCheck("carrier", "Fixture", result)).toMatchObject({ status: "PASS" });
    expect(doctorCarrierCheck("carrier", "Fixture", result).message).toContain("not independent proof");
  });
  it.each([301, 400, 401, 403, 404, 429, 500, 503])("does not call HTTP %i a successful carrier probe", async status => {
    const url = await serve((_request, response) => { response.writeHead(status); response.end(); });
    const result = await requestDoctorStatus(url, {}, "{}", 1_000);
    const check = doctorCarrierCheck("carrier", "Fixture", result);
    expect(result.status).toBe(status);
    expect(check.status).toBe("FAIL");
    expect(check.fixHint).toContain("amc doctor --live-probes");
    expect(check.message).toContain("lease acceptance is not established");
  });
  it("ends a probe whose server sends no headers", async () => {
    const url = await serve(() => {});
    const result = await requestDoctorStatus(url, {}, "{}", 40);
    expect(result).toEqual({ status: null, failure: "deadline" });
    expect(doctorCarrierCheck("carrier", "Fixture", result).status).toBe("FAIL");
  });
  it("uses an absolute deadline even when a response keeps trickling", async () => {
    const url = await serve((_request, response) => {
      response.writeHead(200); response.write("first");
      const timer = setInterval(() => response.write("more"), 5);
      intervals.push(timer);
      response.once("close", () => clearInterval(timer));
    });
    expect(await requestDoctorStatus(url, {}, "{}", 50)).toEqual({ status: null, failure: "deadline" });
  });
  it("does not promote a truncated HTTP 200 body to a completed probe", async () => {
    const url = await serve((_request, response) => {
      response.writeHead(200, { "content-length": 100 }); response.write("short");
      setImmediate(() => response.destroy());
    });
    const result = await requestDoctorStatus(url, {}, "{}", 1_000);
    expect(result.status).toBeNull();
    expect(["connection", "incomplete"]).toContain(result.failure);
    expect(doctorCarrierCheck("carrier", "Fixture", result).status).toBe("FAIL");
  });
  it("refuses an unsupported endpoint rather than returning a made-up HTTP status", async () => {
    const result = await requestDoctorStatus("https://127.0.0.1:1", {}, "{}", 100);
    expect(result).toEqual({ status: null, failure: "connection" });
  });
  it("rejects invalid deadlines before opening a request", () => {
    expect(() => requestDoctorStatus("http://127.0.0.1:1", {}, "{}", 0)).toThrow("positive integer");
  });
});
