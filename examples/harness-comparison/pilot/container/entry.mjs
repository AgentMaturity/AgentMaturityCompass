// Runs inside the pilot's Pi container. It exposes each allowed service at 127.0.0.1:<port> by forwarding to the
// relay on the internal Docker network (the only peer that network has), writes Pi's private provider settings into
// the tmpfs HOME, then runs Pi and exits with Pi's status. `node entry.mjs '<json>'`; nothing else is read.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { join } from "node:path";

const config = JSON.parse(process.argv[2]);
const servers = await Promise.all(config.ports.map((port) => new Promise((done, reject) => {
  const server = createServer((socket) => {
    const upstream = connect(port, config.relay);
    socket.pipe(upstream).pipe(socket);
    socket.on("error", () => upstream.destroy()); upstream.on("error", () => socket.destroy());
  });
  server.once("error", reject);
  server.listen(port, "127.0.0.1", () => done(server));
})));

const agentDir = process.env.PI_CODING_AGENT_DIR;
mkdirSync(agentDir, { recursive: true, mode: 0o700 });
writeFileSync(join(agentDir, "models.json"), JSON.stringify(config.models), { mode: 0o600 });
writeFileSync(join(agentDir, "settings.json"), JSON.stringify(config.settings), { mode: 0o600 });

const child = spawn(process.execPath, [config.piCli, ...config.args], { stdio: ["ignore", "inherit", "inherit"] });
const stop = () => child.kill("SIGTERM");
process.on("SIGTERM", stop); process.on("SIGINT", stop);
child.on("close", (code, signal) => {
  for (const server of servers) server.close();
  process.exit(code ?? (signal ? 128 : 1));
});
