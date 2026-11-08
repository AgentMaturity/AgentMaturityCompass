/**
 * GitHub Actions / webhook event payload → SourceObservation (SH-INTEG-01). Strict on every field it reads, passthrough
 * on the rest. Accepts `issue_comment` with action `created` or `edited` and `issues` with action `opened` or `edited`;
 * any other shape or action is refused with a reason, never guessed. A REST list item is a different shape (no
 * `repository`, no issue number) and is parsed by the polling adapter, not here.
 *
 * The actor is the payload's `sender` (whoever caused the event), never the item's author alone: a maintainer, admin or
 * app that edits an allowed sender's comment is not that sender. An event whose sender is not the author is refused
 * (`editor_not_author`), so an edit is admitted only when the author made it (S7).
 *
 * No network and no model: the parser reads bytes it is given. The retained body is redacted first (secrets never
 * reach the store) and capped; the digest covers the original bytes so a later re-read can be matched.
 */
import { z } from "zod";
import { redactSecrets } from "../../shield/redaction/redactSecrets.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import {
  GITHUB_HANDLE_PATTERN, MAX_RETAINED_BODY_BYTES, SOURCE_OBSERVATION_ADAPTER_VERSION, SOURCE_OBSERVATION_VERSION, githubLoginSchema, issueThreadKey,
  sourceObservationId, sourceObservationSchema, type SourceObservation
} from "./sourceObservationSchema.js";

const userSchema = z.object({ id: z.number().int().positive(), login: githubLoginSchema, type: z.string().optional() }).passthrough();
const repositorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  owner: z.object({ login: z.string().min(1) }).passthrough()
}).passthrough();
const issueSchema = z.object({
  id: z.number().int().positive(),
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable().optional(),
  user: userSchema,
  created_at: z.string(),
  updated_at: z.string().optional(),
  pull_request: z.object({}).passthrough().optional()
}).passthrough();
const commentSchema = z.object({
  id: z.number().int().positive(),
  body: z.string().nullable().optional(),
  user: userSchema,
  created_at: z.string(),
  updated_at: z.string().optional()
}).passthrough();
const eventSchema = z.object({
  action: z.string(),
  issue: issueSchema,
  comment: commentSchema.optional(),
  repository: repositorySchema,
  sender: userSchema
}).passthrough();

const SUPPORTED_EVENT_ACTIONS: Readonly<Record<"issue_comment" | "issues", readonly string[]>> = {
  issue_comment: ["created", "edited"],
  issues: ["opened", "edited"]
};

type ParseRefusal = "event_shape_invalid" | "event_action_unsupported" | "event_time_invalid" | "editor_not_author";
export type ParsedObservation = { ok: true; observation: SourceObservation } | { ok: false; reason: ParseRefusal; detail: string };

function actorClass(user: { login: string; type?: string | undefined }): SourceObservation["actor"]["class"] {
  if (user.type === "Bot" || user.login.endsWith("[bot]")) return "bot";
  return user.type === "User" ? "human" : "unknown";
}

/**
 * The text a reader is addressed by, as GitHub renders it: HTML comments and fenced code (an unterminated comment or
 * fence hides the rest of the body on GitHub and is stripped to the end here), code spans of any backtick-run length,
 * `<code>`/`<pre>`
 * elements, HTML tags with their attributes, indented code (a line starting with four spaces or a tab) and quoted
 * lines (`> ...` and the lazy continuation lines that follow one until a blank line). Where GitHub's rendering is
 * ambiguous this strips more, never less: a mention lost here fails closed as `not_mentioned`.
 */
function addressableText(markdown: string): string {
  const unquoted = markdown
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/(```+|~~~+)[\s\S]*?(?:\1|$)/g, " ")
    .replace(/(`+)[\s\S]*?\1/g, " ")
    .replace(/<(code|pre)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, " ")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ");
  const kept: string[] = [];
  let quoting = false;
  for (const line of unquoted.split("\n")) {
    if (/^\s*$/.test(line)) { quoting = false; continue; }
    if (/^\s*>/.test(line)) { quoting = true; continue; }
    if (quoting || /^(?: {4}|\t)/.test(line)) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

const MENTION_PATTERN = new RegExp(`(^|[^A-Za-z0-9@/.-])@(${GITHUB_HANDLE_PATTERN})(?![A-Za-z0-9/-]|\\.[A-Za-z0-9])`, "g");

/**
 * Lower-cased handles mentioned in the addressable text: `@name` bounded on both sides, so `a@b.c` is none, while a
 * sentence-final `@name.` and an emphasised `_@name_` are mentions, as GitHub renders them.
 */
export function findMentions(markdown: string): string[] {
  const found = new Set<string>();
  for (const match of addressableText(markdown).matchAll(MENTION_PATTERN)) {
    found.add(match[2]!.toLowerCase());
    if (found.size >= 64) break;
  }
  return [...found].sort();
}

function retained(body: string): Pick<SourceObservation, "contentSha256" | "contentBytes" | "disposition" | "body"> {
  const bytes = Buffer.byteLength(body, "utf8");
  const contentSha256 = sha256Hex(body);
  if (bytes > MAX_RETAINED_BODY_BYTES) return { contentSha256, contentBytes: bytes, disposition: "oversized", body: null };
  return { contentSha256, contentBytes: bytes, disposition: "recorded", body: redactSecrets(body, (type) => `[AMC_REDACTED:${type}]`).redacted };
}

function parseTime(value: string | undefined, fallback: string): number | null {
  const parsed = Date.parse(value ?? fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Parses one Actions/webhook event payload (the JSON at `$GITHUB_EVENT_PATH`) for the given source. */
export function observationFromGitHubEvent(payload: unknown, context: { sourceId: string; receivedAt: number }): ParsedObservation {
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: "event_shape_invalid", detail: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
  const event = parsed.data;
  const kind = event.comment ? "issue_comment" : "issues";
  if (!SUPPORTED_EVENT_ACTIONS[kind].includes(event.action)) return { ok: false, reason: "event_action_unsupported", detail: `${kind}.${event.action}` };
  const item = event.comment ?? event.issue;
  // Same user id and login: GitHub sends one user object for both, so a payload that disagrees is not credited to the author.
  if (event.sender.id !== item.user.id || event.sender.login.toLowerCase() !== item.user.login.toLowerCase()) {
    return { ok: false, reason: "editor_not_author", detail: `${kind}.${event.action} by ${event.sender.login} (${event.sender.id}) on an item authored by ${item.user.login} (${item.user.id})` };
  }
  const body = item.body ?? "";
  const sourceAt = parseTime(item.updated_at, item.created_at);
  if (sourceAt === null) return { ok: false, reason: "event_time_invalid", detail: String(item.updated_at ?? item.created_at) };
  const repository = { id: event.repository.id, owner: event.repository.owner.login, name: event.repository.name };
  const primaryThreadKey = issueThreadKey(repository.id, event.issue.number);
  const draft = {
    version: SOURCE_OBSERVATION_VERSION,
    sourceId: context.sourceId,
    sourceKind: "github" as const,
    repository,
    nativeEventId: event.comment ? `issue_comment:${event.comment.id}` : `issue:${event.issue.id}`,
    revisionDigest: sha256Hex(canonicalize(event.comment ? { body } : { title: event.issue.title, body })),
    actor: { id: event.sender.id, login: event.sender.login, class: actorClass(event.sender) },
    mentions: findMentions(body),
    primaryThreadKey,
    correlatedThreadKeys: event.issue.pull_request ? [`github:${repository.id}:pull:${event.issue.number}`] : [],
    sourceAt,
    receivedAt: context.receivedAt,
    ...retained(body),
    adapterVersion: SOURCE_OBSERVATION_ADAPTER_VERSION
  };
  const observation = sourceObservationSchema.safeParse({ ...draft, observationId: sourceObservationId(draft) });
  if (!observation.success) return { ok: false, reason: "event_shape_invalid", detail: observation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
  return { ok: true, observation: observation.data };
}
