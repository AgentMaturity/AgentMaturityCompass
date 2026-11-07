# Source-driven work: observations, admission and proposals

`amc integrations source ...` lets a message on an external source (today: a GitHub issue, pull request or issue
comment) become a **proposal** for work a human then approves. It is slice 1 of the source-driven work design
(SH-INTEG-01/02): a `SourceObservation` record, a signed source policy, deterministic admission and the proposal.
There is no model call, no network and no sending anywhere in this slice. The polling adapter (slice 2) and the
journaled reply (slice 3) are not built yet; see "Limits".

## What a source message can and cannot do

- A message **never** carries authority. The signed policy (`.amc/integrations/sources.yaml` + `.sig`) names who may
  ask, in which repository, with which mention, and which existing signed work order the request binds to.
- An admitted request becomes one signed approval request (`amc.source.admit`) in the agent's existing inbox, bound to
  the work order's digest, filed under the most restrictive action class the work order allows, with a quorum floor
  of one approval. A class the approval policy would auto-allow still waits for a person.
- A human decides with `amc approvals approve|deny` or Studio, as for any other request. The initiator recorded on
  the request is `github:<login>`; it is self-reported and can only refuse, never grant.
- Bots are never requesters: a login ending in `[bot]` or a user of type `Bot` is `bot`, and a bot in
  `allowedSenders` fails the policy parse. Senders match by GitHub user id **and** login.
- `admission: off` is the default. `amc integrations source init` writes a template that admits nothing until an
  operator edits it, sets `admission: explicit`, and signs it with `amc integrations source sign` (owner mode; the
  signing is recorded in the ledger as `SOURCE_POLICY_SIGNED`).

## Commands

| Command | Does | Opens a socket |
|---|---|---|
| `amc integrations source init` | writes and signs the template (refuses to overwrite) | no |
| `amc integrations source sign` | strict-parses and signs the edited policy (owner mode) | no |
| `amc integrations source verify` | verifies signature and parse | no |
| `amc integrations source observe --source <id> --event <file>` | records one `issue_comment` (`created`/`edited`) or `issues` (`opened`/`edited`) event payload, the JSON at `$GITHUB_EVENT_PATH` | no |
| `amc integrations source check --source <id> --event <file>` | decides admission for one payload against the signed policy; stores and files nothing; exit 1 when not admitted | no |
| `amc integrations source admit [--observation <id> \| --all-pending]` | decides recorded observations; an explicit request files one approval request | no |
| `amc integrations source status` | policy state, sources, pending observations, proposals with their approval quorum | no |

`check` is the entry point for a CI job: it answers the admission question without touching the store, so a job
can refuse before it runs anything.

## The observation record

`SourceObservation` v1 (`src/integrations/source/sourceObservationSchema.ts`) carries the source id, repository
`{ id, owner, name }`, the native event id (`issue_comment:<id>` or `issue:<id>`), a `revisionDigest` of the
normalized content (body, plus the title for an issue), the actor `{ id, login, class }`, the mentioned handles,
the thread key `github:<repoId>:issue:<number>`, correlated keys (the pull request, when the issue is one),
timestamps, the original body's SHA-256 and length, and the retained body. `observationId` is the digest of
(source id, native event id, revision digest): the same delivery twice is one row, an edit is a second row on the
same thread.

The retained body is passed through the secret redactor before it is stored and capped at 64 KiB; a larger body is
`oversized` (digest only, no text) and is never admitted. Mentions are found only in addressable text: fenced and
inline code, HTML comments and quoted lines (`> ...`) are stripped first, `a@b.c` is not a mention, and matching
is case-insensitive with handle boundaries (`@amc-bot` does not satisfy `@amc`).

The store is `.amc/integrations/source-intake.sqlite` (WAL, secure_delete), tables `observations` and
`proposals`. The proposals row is reserved before the approval request is created and completed after, so two
concurrent `admit` runs file one request; a filer that crashed in between is recovered by the request's intentId
(`source:<observationId>`).

## Admission reasons

`not_admitted` names the first failing check: `policy_unverified` (missing, unsigned, edited after signing, or
invalid), `source_unknown`, `admission_off`, `repository_mismatch` (the event's `repository.id` is not the policy's:
a renamed or transferred repository changes nothing, a fork is refused), `body_unavailable` (oversized),
`actor_not_human`, `sender_not_allowed`, `reply_marker` (the body carries AMC's own reply marker), `not_mentioned`.

## Limits

- **Nothing runs an agent on an approved proposal yet.** The proposal is the human decision point; the step that
  consumes the approval, re-verifies the work order and starts a session (and the reply tool that would answer on
  the thread) belongs to slices 2 and 3. An approved request that is never consumed reads `EXPIRED` after the
  class rule's TTL, as any approval does.
- No inbound webhook and no polling: observations enter through `observe`/`check` from a payload file. In GitHub
  Actions that is `$GITHUB_EVENT_PATH`. Only `issue_comment` and `issues` payloads are accepted; a REST list item is
  a different shape and is refused.
- Notification reuses the approval lifecycle delivery (`APPROVAL_REQUEST_CREATED` through `integrations.yaml`). The
  outcome is reported on the admit result as `notification` (`DELIVERED`, `QUEUED`, `SKIPPED` without an
  integrations config, or `BLOCKED:<reason>` when the workspace has no signed action policy, tools or budgets).
  A refused notification never rolls back the proposal.
- Re-signing `tools.yaml`, `budgets.yaml` or the action policy voids pending proposals, as it does for every approval
  request (the request binds their digests).
- The policy signature is verified against the workspace keyset. In CI, trust material must come from the default
  branch, never from a pull request head; a CI action is not shipped in this slice.
