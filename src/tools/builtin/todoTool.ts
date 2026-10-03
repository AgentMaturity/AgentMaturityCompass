import { z } from "zod";
import type { ToolDefinition } from "../toolTypes.js";
import { readSessionList, sessionListTool, type SessionListHeader } from "./nativeToolBreadth/sessionListTool.js";

/**
 * `todo` — the agent's working checklist as a signed, session-bound record
 * (AMC-1549). Whole-list replace, like a single source of truth the model
 * rewrites each time; see `sessionListTool` for signing and binding.
 *
 * Studio visibility: file-backed under `.amc/native-tools/<sessionId>/todo.json`
 * and readable with `readSessionTodo`. No session event carries it, because no
 * todo event type exists and `src/session/**` is outside this change.
 */

const STATUSES = ["pending", "in_progress", "completed"] as const;
const MARK: Record<(typeof STATUSES)[number], string> = { pending: "[ ]", in_progress: "[~]", completed: "[x]" };

const todoArgs = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(64),
    content: z.string().min(1).max(500),
    status: z.enum(STATUSES)
  }).strict()).max(100)
}).strict();

export type TodoPayload = z.infer<typeof todoArgs>;
export type TodoRecord = SessionListHeader & TodoPayload;

const KIND = "amc.native.todo";
const FILE = "todo.json";

export function todoTool(options: { readonly sessionId: string }): ToolDefinition {
  return sessionListTool<TodoPayload>({
    name: "todo",
    kind: KIND,
    fileName: FILE,
    description: "Replace this session's todo list. Signed and bound to the session; returns the rendered list.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              content: { type: "string" },
              status: { type: "string", enum: [...STATUSES] }
            },
            required: ["id", "content", "status"],
            additionalProperties: false
          }
        }
      },
      required: ["items"],
      additionalProperties: false
    },
    argsSchema: todoArgs,
    render: (payload) => payload.items.length === 0
      ? "[amc: todo list is empty]"
      : payload.items.map((item) => `${MARK[item.status]} ${item.content}`).join("\n")
  }, options.sessionId);
}

/** The verified current todo record, or null. Throws when the file is not trustworthy. */
export function readSessionTodo(workspace: string, sessionId: string): TodoRecord | null {
  return readSessionList<TodoPayload>(workspace, sessionId, FILE, KIND);
}
