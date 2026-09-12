/** AUTHORED UNEXECUTED. Fresh-process default registration; identity is the ONLY
 * reconstruction input. Captured request bodies/registries are never supplied.
 */
import { deriveSessionRequests } from "../../src/llm/request/deriveRequest.js";
const [workspace, sessionId] = process.argv.slice(2);
if (!workspace || !sessionId) throw new Error("Cold audio fixture requires workspace and session identity");
process.stdout.write(JSON.stringify(deriveSessionRequests({ workspace, sessionId }).map(row => ({ ...row, bytes: row.bytes?.toString("base64") ?? null }))));
