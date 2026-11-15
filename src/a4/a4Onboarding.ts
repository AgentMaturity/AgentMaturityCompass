/**
 * Getting started with people (2026-11-15): who can approve in this workspace, the practice project a lone evaluator may
 * open, and inviting a second approver in one call. Nothing here decides a gate: self-approval stays derived per decision
 * (a4Schema.deriveSelfApprovalAllowed, a4Schema.practiceNow), and a regulated project's separation of duties is untouched.
 */
import { randomInt } from "node:crypto";
import { z } from "zod";
import { apiSuccess } from "../api/apiHelpers.js";
import { addUserAsync, listUsers } from "../auth/authApi.js";
import { hostingNow } from "./a4Deploy.js";
import { signedA4Floor } from "./a4Gates.js";
import { liveRolesFor, principalPopulation } from "./a4Identity.js";
import { a4Fail, mutationResult, precheck, priorReplay, readJson, requirePrincipal, type A4Route } from "./a4Router.js";
import { COMPOSE_STEPS } from "./spec/activate.js";
import { clientRequestIdSchema, deriveSelfApprovalAllowed, headSeqSchema, type A4Principal } from "./a4Schema.js";
import { A4StoreError } from "./a4Store.js";

/** The fixed sentence beside every "add a second person" step: SoD-distinct is not independent. */
const SECOND_PERSON_NOT_INDEPENDENT = "A second person in the same workspace meets separation of duties; it is not an independent review.";

export interface A4StartFacts {
  /** People who can sign in now (ACTIVE local users plus live host sessions); null when a source could not be read. */
  readonly people: number | null;
  readonly practiceAvailable: boolean;
  /** Why a practice project is not offered here, in words; null when it is. */
  readonly practiceRefusal: string | null;
  /** Whether this Studio can record a deployment (it runs under Compose or Helm). */
  readonly deployFromHere: boolean;
  readonly deployNote: string | null;
}

/** What a person should know before creating a project: can they practise alone, and can this Studio deploy. */
export function startFacts(workspace: string, principal: A4Principal | null, hostedRouter: boolean): A4StartFacts {
  const population = principalPopulation(workspace);
  let floor: ReturnType<typeof signedA4Floor> | null;
  try {
    floor = signedA4Floor(workspace);
  } catch {
    floor = null; // an unverified approval policy: creation refuses on its own (APPROVAL_POLICY_MISSING / _UNSIGNED)
  }
  const people = population.activeLocal === null || population.hostPrincipals === null ? null : population.activeLocal.length + population.hostPrincipals;
  const alone = deriveSelfApprovalAllowed({ activeLocal: population.activeLocal, hostPrincipals: population.hostPrincipals, hostedRouter, regulated: false,
    workspaceFloor: floor?.allowSelfApproval, ratcheted: false, decidingPrincipal: principal });
  const practiceRefusal = floor === null ? "This workspace's approval policy could not be checked, so a practice project is not offered. Run `amc policy approval init` in the workspace folder."
    : floor.regulated === true ? "This workspace's signed approval policy treats every project as regulated, so a practice project is not offered here."
      : floor.allowSelfApproval === false ? "This workspace's signed approval policy lets nobody approve their own work, so a practice project is not offered here."
        : alone ? null
          : people !== null && people > 1 ? `A practice project is for one person trying AMC alone. ${people} people can sign in to this workspace, so start a normal project and let the others approve.`
            : "A practice project is for the one person who can sign in to a workspace on this computer. AMC could not confirm that here, so start a normal project.";
  const hosting = hostingNow().kind;
  return { people, practiceAvailable: practiceRefusal === null, practiceRefusal, deployFromHere: hosting !== null,
    deployNote: hosting !== null ? null : "This AMC runs directly on this computer. A project here can go through Aspire, Assemble and Adapt and answer Activate's "
      + `questions, but it cannot request a release or record a deployment. ${COMPOSE_STEPS}` };
}

/** 409 with the reason in words when a practice project is not offered here. */
export function assertPracticeAllowed(facts: A4StartFacts): void {
  if (facts.practiceRefusal !== null) throw a4Fail(409, "A4_PRACTICE_NOT_AVAILABLE", facts.practiceRefusal, { reasonCodes: ["PRACTICE_NOT_AVAILABLE"], people: facts.people });
}

/** Said when a project is created: which kind it is and who has to approve. The counts are the default approval rules'. */
export function approvalsNote(facts: A4StartFacts, practice: boolean): { kind: "practice" | "standard"; secondPersonNeeded: boolean; text: string } {
  if (practice) {
    return { kind: "practice", secondPersonNeeded: false, text: "This is a practice project, for learning AMC alone. You may approve your own work on it, whatever "
      + "risk level the brief names. Each approval you give yourself is recorded and shown as self-approved, and a verifier reports it as not evaluated. With the "
      + "default approval rules you can give the first three approvals (both Aspire approvals and Assemble's direction); from Assemble's completion on, each step "
      + "needs two other people. Once a second person can sign in, nobody approves their own work here any more, the project follows the rules its risk level "
      + "calls for, and on a high or critical risk level the self-approved steps wait to be approved again or acknowledged before a release. Do not use a "
      + "practice project for real work." };
  }
  const alone = facts.people === 1;
  return { kind: "standard", secondPersonNeeded: true, text: `${alone ? "You are the only person who can sign in to this workspace. " : ""}This project needs other `
    + "people to approve: whoever wrote, built or asked for a step cannot approve it (separation of duties). A brief with a high or critical risk level, which "
    + "every Industry Pack suggests, is governed as regulated, and nobody approves their own work there."
    + `${alone ? (facts.practiceAvailable ? " To try AMC alone, start a practice project instead." : "") + " To build for real, invite a second person from the project's Members card." : ""} `
    + SECOND_PERSON_NOT_INDEPENDENT };
}

const inviteFields = {
  username: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/, "A username is 2 to 64 letters, digits, dots, dashes or underscores, starting with a letter or digit."),
  // Never OWNER: an invitation hands out the right to approve (and, for Adapt's completion, the auditor's vote), nothing more.
  workspaceRoles: z.array(z.enum(["APPROVER", "AUDITOR"])).min(1).max(2).default(["APPROVER"]),
  clientRequestId: clientRequestIdSchema
};
const inviteSchema = z.strictObject({ ...inviteFields, expectedHeadSeq: headSeqSchema });
const peopleSchema = z.strictObject(inviteFields);

/** Five groups of four from an alphabet without look-alikes: about 100 bits, easy to read out. Shown once, never stored in clear. */
function firstPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 5 }, () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("")).join("-"); // amc-allow-random: id (a one-time sign-in secret, not a result)
}

/**
 * POST …/members/invite (or POST /people, the account alone, for the workspace-wide form): a signed-in workspace OWNER who may add members creates the person's account (the users API's
 * own writer, audited as a console account change) with a first password AMC shows once, and adds them to the project
 * as an approver. An ACTIVE account of that name is added as it is: its password and workspace roles are left alone.
 * The account stands even when the member step is refused (the answer says so and still carries the password).
 */
export async function inviteMember(route: A4Route, projectId: string | null): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = projectId === null ? await readJson(route, peopleSchema) : await readJson(route, inviteSchema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) {
    apiSuccess(route.res, { ...replay, firstPassword: null, note: "This request was already answered. AMC showed the first password once and keeps no copy of it." });
    return true;
  }
  const isOwner = (): boolean => principal.authSource === "LOCAL_USER" && liveRolesFor(route.workspace, principal).includes("OWNER");
  if (!isOwner()) {
    throw a4Fail(403, "PRINCIPAL_ROLE_INSUFFICIENT", "Only a workspace owner signed in to this Studio can invite a person. Ask an owner to do it, or to run "
      + "`amc user add --username <name> --role APPROVER` in the workspace folder.", ["PRINCIPAL_ROLE_INSUFFICIENT"]);
  }
  if (projectId !== null) precheck(route, projectId, "addMember", (body as z.infer<typeof inviteSchema>).expectedHeadSeq);
  const existing = listUsers(route.workspace).find((user) => user.username.toLowerCase() === body.username.toLowerCase());
  if (existing !== undefined && existing.status !== "ACTIVE") {
    throw a4Fail(409, "A4_USER_DISABLED", `The account ${existing.username} was turned off and cannot be used again. Choose another username.`);
  }
  const password = existing === undefined ? firstPassword() : null;
  const user = existing ?? await addUserAsync({ workspace: route.workspace, username: body.username, roles: body.workspaceRoles, password: password! }, {
    assertAuthorized: () => {
      route.assertAuthority?.();
      if (!isOwner()) throw a4Fail(403, "PRINCIPAL_ROLE_INSUFFICIENT", "Your owner role changed while the account was being created; nothing was added.");
    },
    actor: { kind: "session", userId: principal.userId, username: principal.username }
  });
  const account = { userId: user.userId, username: user.username, workspaceRoles: user.roles, created: existing === undefined };
  const canApprove = user.roles.some((role) => role === "APPROVER" || role === "OWNER" || role === "AUDITOR");
  const notes = [
    existing === undefined ? `Give ${user.username} the first password yourself, in person or over a channel you trust. AMC shows it once and keeps only a `
      + "one-way hash. They sign in to this Studio with it; a workspace owner can set a new one with `amc user password`."
      : `${user.username} already had an account, so its password and workspace roles (${user.roles.join(", ")}) were left as they are. If they no longer `
        + `have their password, a workspace owner sets a new one in the workspace folder with \`amc user password ${user.username}\` and gives it to them.`,
    ...(canApprove ? [] : [`${user.username} cannot approve yet: an owner gives the role with \`amc user role set ${user.username} --roles APPROVER\`.`]),
    "Adding a person ends self-approval on this workspace's projects for good, and open approval requests are asked for again.",
    SECOND_PERSON_NOT_INDEPENDENT
  ];
  if (projectId === null) {
    // The workspace-wide form (the projects page's "Add a person"): the account alone; projects add them on their Members card.
    apiSuccess(route.res, { memberAdded: false, user: account, firstPassword: password,
      notes: [...notes, `Add ${user.username} to a project on its Members card, or start the project and add them there.`] }, existing === undefined ? 201 : 200);
    return true;
  }
  try {
    const result = route.store.recordMember(projectId, { actor: principal, event: "added", principalKey: `LOCAL_USER:${user.userId}`, roles: ["approver"],
      expectedHeadSeq: (body as z.infer<typeof inviteSchema>).expectedHeadSeq, request });
    apiSuccess(route.res, { ...mutationResult(result), memberAdded: true, user: account, firstPassword: password, notes }, 201);
  } catch (error) {
    if (password === null || !(error instanceof A4StoreError)) throw error;
    // The account exists and only this answer can carry its password: say what did not finish instead of losing it.
    apiSuccess(route.res, { projectId, memberAdded: false, user: account, firstPassword: password, memberRefusal: { code: error.code, error: error.message },
      notes: [`The account was created, but adding ${user.username} to the project did not finish. Add them on the project's Members card.`, ...notes] }, 201);
  }
  return true;
}
