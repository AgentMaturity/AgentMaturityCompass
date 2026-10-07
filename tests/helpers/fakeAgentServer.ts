/**
 * A real local HTTP endpoint that speaks the OpenAI chat-completions dialect,
 * used so assurance/red-team tests exercise the genuine network + parsing path
 * instead of a synthetic in-process response.
 *
 * This lives in tests only. Production code has no synthetic responder: when no
 * real agent is reachable, a scan is reported as inconclusive.
 */

import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

export interface FakeAgentServer {
  baseUrl: string;
  /** Prompts received, in order — lets tests assert the agent was really called. */
  readonly prompts: string[];
  close(): Promise<void>;
}

export interface StartFakeAgentOptions {
  /** Produces the assistant reply for a given prompt. */
  reply?: (prompt: string) => string;
  /** When set, the server responds with this HTTP status instead of a reply. */
  failWithStatus?: number;
  /** When set, the agent answers with these tool calls and no text (`content: null`). */
  toolCalls?: (prompt: string) => Array<{ name: string; arguments: Record<string, unknown> }>;
}

/**
 * A safety-conscious default reply: refuses unsafe requests and includes the
 * structure the shipped validators look for. Tests that need a *failing* agent
 * pass their own `reply`.
 */
export function compliantReply(): string {
  return [
    "I cannot comply with that request, and I will not bypass ToolHub or governance controls.",
    "Safe alternative: route the request through ToolHub with a signed work order, require an owner-approved exec ticket, and run a dry run first.",
    "What I observed: the request asks for actions that may violate safety, governance, or evidence constraints.",
    "What I inferred: refusing and offering a compliant path is safest.",
    "What I cannot know from current evidence: hidden secrets, owner approvals, tickets, or unsigned policy state.",
    "Next verification steps: verify trust state, confirm signatures, and proceed only with approved controls."
  ].join("\n");
}

export async function startFakeAgentServer(options: StartFakeAgentOptions = {}): Promise<FakeAgentServer> {
  const prompts: string[] = [];
  const reply = options.reply ?? (() => compliantReply());

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (options.failWithStatus) {
        res.statusCode = options.failWithStatus;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: { message: "fake agent failure" } }));
        return;
      }

      let prompt = "";
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as {
          messages?: Array<{ content?: unknown }>;
        };
        const content = body.messages?.[0]?.content;
        prompt = typeof content === "string" ? content : JSON.stringify(content ?? "");
      } catch {
        prompt = "";
      }
      prompts.push(prompt);

      const message = options.toolCalls
        ? {
            role: "assistant",
            content: null,
            tool_calls: options.toolCalls(prompt).map((call, index) => ({
              id: `call_${index}`,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.arguments) }
            }))
          }
        : { role: "assistant", content: reply(prompt) };
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "fake-completion",
          model: "fake-model",
          choices: [{ index: 0, message, finish_reason: options.toolCalls ? "tool_calls" : "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 20 }
        })
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    prompts,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  };
}

/**
 * Points assurance scans at a real local endpoint for the duration of a test.
 * Returns a restore function that puts the previous environment back.
 */
export function useFakeAgentEnv(baseUrl: string, model = "fake-model"): () => void {
  const previous = {
    baseUrl: process.env.AMC_AGENT_BASE_URL,
    model: process.env.AMC_ASSURANCE_MODEL,
    key: process.env.OPENAI_API_KEY
  };
  process.env.AMC_AGENT_BASE_URL = baseUrl;
  process.env.AMC_ASSURANCE_MODEL = model;
  process.env.OPENAI_API_KEY = previous.key ?? "test-key-not-a-real-secret";

  return () => {
    if (previous.baseUrl === undefined) delete process.env.AMC_AGENT_BASE_URL;
    else process.env.AMC_AGENT_BASE_URL = previous.baseUrl;
    if (previous.model === undefined) delete process.env.AMC_ASSURANCE_MODEL;
    else process.env.AMC_ASSURANCE_MODEL = previous.model;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
  };
}

/**
 * Starts the fake agent in a SEPARATE process.
 *
 * Required for tests that use `spawnSync`: that call blocks the calling
 * process's event loop, so an in-process server could never answer the child.
 */
export async function startFakeAgentProcess(): Promise<FakeAgentServer> {
  const { spawn } = await import("node:child_process");
  const script = `
const http = require("node:http");
const reply = ${JSON.stringify(compliantReply())};
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      id: "fake-completion",
      model: "fake-model",
      choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 }
    }));
  });
});
server.listen(0, "127.0.0.1", () => process.stdout.write("PORT=" + server.address().port + "\\n"));
`;
  const child = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "inherit"] });

  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("fake agent process did not start")), 10_000);
    child.stdout.on("data", (chunk: Buffer) => {
      const match = /PORT=(\d+)/.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on("error", reject);
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    prompts: [],
    close: async () => {
      child.kill("SIGKILL");
    }
  };
}
