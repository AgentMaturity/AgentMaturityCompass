# Source-driven work: observations, admission and proposals

`amc integrations source ...` lets a message on an external source (today: a GitHub issue, pull request or issue
comment) become a **proposal** for work a human then approves. It is slice 1 of the source-driven work design
(SH-INTEG-01/02): a `SourceObservation` record, a signed source policy, deterministic admission and the proposal.
There is no model call and no reply is posted anywhere in this slice; the only network is the notification `admit`
hands to the approval lifecycle delivery when a signed `integrations.yaml` routes it. The polling adapter (slice 2)
and the journaled reply (slice 3) are not built yet; see "Limits".

## What a source message can and cannot do

- A message **never** carries authority. The signed policy (`.amc/integrations/sources.yaml` + `.sig`) names who may
  ask, in which repository, with which mention, and which existing signed work order the request binds to.
- An admitted request becomes one signed approval request (`amc.source.admit`) in the agent's existing inbox, bound to
  the work order's digest. It is filed under the strictest class the work order allows as the signed approval policy
  rates the classes (assurance packs, then approvals, then fewer roles, then a shorter TTL), and its quorum floor
  combines every allowed class's rule: the most approvals, distinct users if any rule asks, only the roles every rule
  allows, and at least one approval. A class the approval policy would auto-allow still waits for a person, and a
  work order whose allowed classes leave no common role files nothing (`approval_refused`).
- A human decides with `amc approvals approve|deny` or Studio, as for any other request. The initiator recorded on
  the request is `github:<login>`; it is self-reported and can only refuse, never grant.
- The actor is the payload's `sender`, whoever caused the event, never the item's author alone. An event whose
  sender is not the author (a maintainer, admin or app editing an allowed sender's comment or retitling their issue)
  is refused as `editor_not_author`, so an edit is admitted only when its author made it.
- Bots are never requesters: a sender whose login ends in `[bot]` or whose type is `Bot` is `bot`, and a bot in
  `allowedSenders` fails the policy parse. Senders match by GitHub user id **and** login. Enterprise Managed User
  logins (`handle_shortcode`) are accepted.
- `admission: off` is the default. `amc integrations source init` writes a template that admits nothing until an
  operator edits it, sets `admission: explicit`, and signs it with `amc integrations source sign` (owner mode; the
  signing is recorded in the ledger as `SOURCE_POLICY_SIGNED`).
- The payload file is trusted input: `observe` and `check` record or decide whatever JSON they are given, so the file
  must be one the runner wrote (`$GITHUB_EVENT_PATH` in GitHub Actions), never one an agent or a job step composed.
  `observe` and `admit` are therefore owner-mode commands, like `init` and `sign`; nothing authenticates an
  observation against GitHub yet (see "Limits").

## Commands

| Command | Does | Opens a socket | Owner mode |
|---|---|---|---|
| `amc integrations source init` | writes and signs the template (refuses to overwrite) | no | yes |
| `amc integrations source sign` | strict-parses and signs the edited policy; the bytes parsed are the bytes signed | no | yes |
| `amc integrations source verify` | verifies signature and parse | no | no |
| `amc integrations source observe --source <id> --event <file>` | records one `issue_comment` (`created`/`edited`) or `issues` (`opened`/`edited`) event payload, the JSON at `$GITHUB_EVENT_PATH` | no | yes |
| `amc integrations source check --source <id> --event <file>` | decides admission for one payload against the signed policy and verifies the bound work order as `admit` does; stores and files nothing; exit 1 when not admitted | no | no |
| `amc integrations source admit [--observation <id> \| --all-pending]` | decides recorded observations (a batch of up to 1000; `remainingPending` counts what is left); an explicit request files one approval request | only through the lifecycle delivery, when a signed `integrations.yaml` routes the notification | yes |
| `amc integrations source status` | policy state, sources with exact observation and pending counts, proposals (newest first, capped at 1000 with `proposalsTotal` and `proposalsTruncated`) with their approval quorum | no | no |

`check` is the entry point for a CI job: it answers the admission question without touching the store, so a job
can refuse before it runs anything. It refuses what `admit` would refuse, an expired, revoked or unsigned work order
included (`work_order_unavailable`, `work_order_agent_mismatch`).

## The observation record

`SourceObservation` v1 (`src/integrations/source/sourceObservationSchema.ts`) carries the source id, repository
`{ id, owner, name }`, the native event id (`issue_comment:<id>` or `issue:<id>`), a `revisionDigest` of the
normalized content (body, plus the title for an issue), the actor `{ id, login, class }`, the mentioned handles,
the thread key `github:<repoId>:issue:<number>`, correlated keys (the pull request, when the issue is one),
timestamps, the original body's SHA-256 and length, and the retained body. `observationId` is the digest of
(source id, native event id, revision digest): the same delivery twice is one row, an edit is a second row on the
same thread.

The retained body is passed through the secret redactor before it is stored and capped at 64 KiB; a larger body is
`oversized` (digest only, no text) and is never admitted. Mentions are found only in the text GitHub renders: HTML
comments and fenced code (unterminated ones to the end of the body, as GitHub hides them), code spans of any
backtick-run length, `<code>`/`<pre>` elements, HTML tags with their attributes (an `alt` text included), indented
code (four spaces or a tab) and quoted lines (`> ...` with the lazy continuation lines that follow until a blank
line) are stripped first. Where GitHub's rendering is ambiguous the stripping takes more, never less, so a mention it
drops fails closed as `not_mentioned`. `a@b.c` is not a mention, a sentence-final `@amc.` and an emphasised `_@amc_`
are, and matching is case-insensitive with handle boundaries (`@amc-bot` does not satisfy `@amc`).

The store is `.amc/integrations/source-intake.sqlite` (WAL, secure_delete), tables `observations` and
`proposals`. The proposals row is reserved before the approval request is created and completed after, so two
concurrent `admit` runs file one request; a filer that crashed in between is recovered by the request's intentId
(`source:<observationId>`). A reservation carries a token only its holder can settle or release; a reservation older
than 60 s is taken over, and a slow filer that then files anyway finds its settle refused and cancels its own request,
so one request stays filed. A `policy_unverified` refusal is not recorded: nothing was decided, and the observation
stays pending until the policy is signed.

## Admission reasons

`not_admitted` names the first failing check: `policy_unverified` (missing, unsigned, edited after signing, or
invalid), `source_unknown`, `admission_off`, `repository_mismatch` (the event's `repository.id` is not the policy's:
a renamed or transferred repository changes nothing, a fork is refused), `body_unavailable` (oversized),
`actor_not_human`, `sender_not_allowed`, `reply_marker` (the body carries AMC's own reply marker), `not_mentioned`.
Before admission the parser refuses `event_shape_invalid`, `event_action_unsupported`, `event_time_invalid` and
`editor_not_author`; after it, `check` and `admit` refuse `work_order_unavailable` and `work_order_agent_mismatch`.

## Limits

- **Nothing runs an agent on an approved proposal yet.** The proposal is the human decision point; the step that
  consumes the approval, re-verifies the work order and starts a session (and the reply tool that would answer on
  the thread) belongs to slices 2 and 3. An approved request that is never consumed reads `EXPIRED` after the
  class rule's TTL, as any approval does.
- No inbound webhook and no polling: observations enter through `observe`/`check` from a payload file. In GitHub
  Actions that is `$GITHUB_EVENT_PATH`. Only `issue_comment` and `issues` payloads are accepted; a REST list item is
  a different shape and is refused.
- Notification reuses the approval lifecycle delivery (`APPROVAL_REQUEST_CREATED` through `integrations.yaml`), which
  sends over the configured channels: this is the one place the slice reaches the network. The outcome is reported
  on the admit result as `notification` (`DELIVERED`, `QUEUED`, `SKIPPED` when a signed config routes no channel,
  `BLOCKED:INTEGRATIONS_UNTRUSTED` without a signed `integrations.yaml`, or `BLOCKED:<reason>` when the workspace has
  no signed action policy, tools or budgets). A refused notification never rolls back the proposal.
- Observations are not authenticated against GitHub: `observe` trusts the payload file. Webhook HMAC verification or
  an API re-fetch by native id before a proposal is filed belongs to the polling adapter (slice 2).
- Re-signing `tools.yaml`, `budgets.yaml` or the action policy voids pending proposals, as it does for every approval
  request (the request binds their digests).
- The policy signature is verified against the workspace keyset. In CI, trust material must come from the default
  branch, never from a pull request head; a CI action is not shipped in this slice.
