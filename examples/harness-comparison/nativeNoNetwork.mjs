// Fixture boundary for trusted Node code; not an OS sandbox or native-addon isolation.
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
const deny = () => { throw new Error("Native offline corpus refuses network access"); };
net.connect = net.createConnection = deny;
net.Socket.prototype.connect = deny;
net.Server.prototype.listen = deny;
tls.connect = deny;
http.request = http.get = https.request = https.get = deny;
for (const name of Object.keys(dns)) if (/^(?:lookup|resolve|reverse)/.test(name) && typeof dns[name] === "function") dns[name] = deny;
for (const name of Object.keys(dns.promises)) if (typeof dns.promises[name] === "function") dns.promises[name] = deny;
globalThis.fetch = deny;
globalThis.WebSocket = class { constructor() { deny(); } };
syncBuiltinESMExports();
