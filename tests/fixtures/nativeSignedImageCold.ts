/** AUTHORED, UNEXECUTED. A fresh process receives no encoder registry or request bytes. */
import { deriveSessionRequests } from "../../src/llm/request/deriveRequest.js";
const [workspace, sessionId] = process.argv.slice(2);
if (!workspace || !sessionId) throw new Error("Cold image fixture requires only workspace and session identity.");
process.stdout.write(JSON.stringify(deriveSessionRequests({ workspace, sessionId }).map(row => ({
  ...row, bytes: row.bytes?.toString("base64") ?? null
}))));
