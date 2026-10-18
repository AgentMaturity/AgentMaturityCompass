// Scripted model for the pilot's debugging lane: it replays each task's known-good tool calls (solutions.mjs) in the
// tool dialect the harness offers, one call per turn, and records what the harness answered for each. It is never a
// model and its runs are never results.
import { SOLUTIONS } from "./solutions.mjs";

const pick = (names, pattern) => names.find((name) => pattern.test(name)) ?? null;
const property = (tool, candidates) => {
  const properties = Object.keys(tool?.function?.parameters?.properties ?? {});
  return candidates.find((name) => properties.includes(name)) ?? null;
};
const text = (content) => typeof content === "string" ? content : Array.isArray(content)
  ? content.map((part) => typeof part?.text === "string" ? part.text : "").join("") : JSON.stringify(content ?? "");

/** Abstract steps for a task: reads of its inputs, then its writes or its one shell program. */
function plan(fixture) {
  const solution = SOLUTIONS[fixture.id];
  if (!solution) return [];
  if (solution.program) return [{ op: "read", path: "task/finance/connection.json" }, { op: "bash", program: solution.program }];
  const inputs = fixture.domain === "regulated" ? Object.keys(fixture.files).filter((name) => name.startsWith("task/inbox/"))
    : Object.keys(solution.write).filter((name) => name in fixture.files);
  return [...inputs.map((path) => ({ op: "read", path })), ...Object.entries(solution.write).map(([path, content]) => ({ op: "write", path, content }))];
}

function toolCall(step, tools) {
  const names = tools.map((tool) => tool?.function?.name).filter((name) => typeof name === "string");
  // AMC sends fs.read as amc_fs_read_<digest> (providerToolWireName); Pi sends read.
  const name = step.op === "read" ? pick(names, /^(read|fs[._-]?read|read_?file|amc_fs_read_[A-Za-z0-9_-]{43})$/i)
    : step.op === "write" ? pick(names, /^(write|fs[._-]?write|write_?file|amc_fs_write_[A-Za-z0-9_-]{43})$/i) : pick(names, /^(bash|shell|exec)$/i);
  const tool = tools.find((row) => row?.function?.name === name);
  const pathKey = property(tool, ["path", "file_path", "filePath", "file"]);
  if (!name) return null;
  if (step.op === "bash") {
    const key = property(tool, ["command", "cmd", "script"]);
    return key ? { name, args: { [key]: `node --input-type=module <<'PILOT_PROGRAM'\n${step.program}PILOT_PROGRAM` } } : null;
  }
  if (!pathKey) return null;
  if (step.op === "read") return { name, args: { [pathKey]: `workspace/${step.path}` } };
  const contentKey = property(tool, ["content", "text", "contents", "data"]);
  return contentKey ? { name, args: { [pathKey]: `workspace/${step.path}`, [contentKey]: step.content } } : null;
}

const chunk = (delta, finish) => `data: ${JSON.stringify({ id: "chatcmpl-pilot", object: "chat.completion.chunk", created: 0, model: "scripted",
  choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
const usage = `data: ${JSON.stringify({ id: "chatcmpl-pilot", object: "chat.completion.chunk", created: 0, model: "scripted", choices: [],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`;

export function scriptedResponder(fixture) {
  const steps = plan(fixture), calls = [], unavailable = [];
  const respond = (body) => {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    for (const message of messages) {
      const call = calls.find((row) => row.id === message?.tool_call_id);
      if (message?.role === "tool" && call && call.resultText === null) call.resultText = text(message.content).slice(0, 400);
    }
    const index = messages.filter((message) => message?.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length).length;
    let next = null;
    for (let step = index + unavailable.length; step < steps.length && !next; step += 1) {
      next = toolCall(steps[step], Array.isArray(body.tools) ? body.tools : []);
      if (!next) unavailable.push(steps[step].op);
    }
    let raw;
    if (next) {
      const id = `call_pilot_${calls.length + 1}`;
      calls.push({ id, tool: next.name, label: "benign", resultText: null });
      raw = chunk({ role: "assistant", tool_calls: [{ index: 0, id, type: "function", function: { name: next.name, arguments: JSON.stringify(next.args) } }] }, null) + chunk({}, "tool_calls");
    } else raw = chunk({ role: "assistant", content: "Done." }, null) + chunk({}, "stop");
    const stream = `${raw}${usage}data: [DONE]\n\n`;
    if (body.stream) return { status: 200, contentType: "text/event-stream", raw: Buffer.from(stream) };
    const message = next ? { role: "assistant", content: null, tool_calls: [{ id: calls.at(-1).id, type: "function", function: { name: next.name, arguments: JSON.stringify(next.args) } }] }
      : { role: "assistant", content: "Done." };
    return { status: 200, contentType: "application/json", raw: Buffer.from(JSON.stringify({ id: "chatcmpl-pilot", object: "chat.completion", created: 0, model: "scripted",
      choices: [{ index: 0, message, finish_reason: next ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })) };
  };
  return { respond, record: () => ({ steps: steps.length, calls, unavailableTools: unavailable }) };
}
