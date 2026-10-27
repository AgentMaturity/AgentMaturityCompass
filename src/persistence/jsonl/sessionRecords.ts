/** Internal lifecycle parser shared by the JSONL store and actual key-owner cutover capture. */
import type { SessionRecord } from "../../types.js";
import { pathExists, readUtf8 } from "../../utils/fs.js";
import { jsonlSessionsPath } from "./jsonlEventLog.js";

export type SessionLifecycleLine =
  | {
      readonly op: "start";
      readonly session_id: string;
      readonly started_ts: number;
      readonly runtime: string;
      readonly binary_path: string;
      readonly binary_sha256: string;
    }
  | {
      readonly op: "seal";
      readonly session_id: string;
      readonly ended_ts: number;
      readonly session_final_event_hash: string;
      readonly session_seal_sig: string;
    };

/**
 * Fold `sessions.jsonl` into the session records it describes.
 *
 * The SQLite table is mutated in place by `sealSession`; an append-only file
 * cannot be, so a seal is a second line that updates the record the start line
 * created. A seal for a session with no start is malformed, not ignorable — it
 * would otherwise be a way to manufacture a sealed session out of nothing.
 */
export function readSessionRecords(workspace: string): Map<string, SessionRecord> {
  const path = jsonlSessionsPath(workspace);
  const records = new Map<string, SessionRecord>();
  if (!pathExists(path)) {
    return records;
  }
  const lines = readUtf8(path).split("\n").filter((line) => line.trim().length > 0);
  lines.forEach((line, index) => {
    let parsed: SessionLifecycleLine;
    try {
      parsed = JSON.parse(line) as SessionLifecycleLine;
    } catch {
      throw new Error(`jsonl session log line ${index + 1}: not valid JSON`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
      || typeof parsed.session_id !== "string" || !parsed.session_id
      || (parsed.op !== "start" && parsed.op !== "seal")) {
      throw new Error(`jsonl session log line ${index + 1}: unsupported lifecycle record`);
    }
    if (parsed.op === "start") {
      if (records.has(parsed.session_id) || !Number.isSafeInteger(parsed.started_ts) || parsed.started_ts < 0
        || typeof parsed.runtime !== "string" || !parsed.runtime || typeof parsed.binary_path !== "string"
        || typeof parsed.binary_sha256 !== "string") {
        throw new Error(`jsonl session log line ${index + 1}: duplicate or malformed session start`);
      }
      records.set(parsed.session_id, {
        session_id: parsed.session_id,
        started_ts: parsed.started_ts,
        ended_ts: null,
        runtime: parsed.runtime as SessionRecord["runtime"],
        binary_path: parsed.binary_path,
        binary_sha256: parsed.binary_sha256,
        session_final_event_hash: null,
        session_seal_sig: null
      });
      return;
    }
    const existing = records.get(parsed.session_id);
    if (existing === undefined) {
      throw new Error(`jsonl session log line ${index + 1}: seal for unstarted session ${parsed.session_id}`);
    }
    if (existing.ended_ts !== null || !Number.isSafeInteger(parsed.ended_ts) || parsed.ended_ts < existing.started_ts
      || typeof parsed.session_final_event_hash !== "string" || !/^[a-f0-9]{64}$/.test(parsed.session_final_event_hash)
      || typeof parsed.session_seal_sig !== "string" || !parsed.session_seal_sig) {
      throw new Error(`jsonl session log line ${index + 1}: duplicate or malformed session seal`);
    }
    records.set(parsed.session_id, {
      ...existing,
      ended_ts: parsed.ended_ts,
      session_final_event_hash: parsed.session_final_event_hash,
      session_seal_sig: parsed.session_seal_sig
    });
  });
  return records;
}
