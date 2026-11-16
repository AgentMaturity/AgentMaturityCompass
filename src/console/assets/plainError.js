// The words a person reads for a failed request (C-10): no class names, no internal codes, the next step named. The raw
// server text stays on the error (error.message, error.data) for "Show the record".

const ROLE_WORDS = { OWNER: "owner", OPERATOR: "operator", APPROVER: "approver", AUDITOR: "auditor", VIEWER: "viewer" };

const roleList = (text) => text.split(/[|,]/).map((role) => ROLE_WORDS[role.trim()] || role.trim().toLowerCase()).join(" or ");

const RULES = [
  [/^missing or invalid token$/i, () => "You are signed out. Sign in again to go on."],
  [/^internal server error$/i, () => "AMC Studio hit a problem it did not expect, and nothing was changed. Try again; if it happens again, run amc doctor in the workspace folder."],
  [/^(?:Not permitted: )?requires role: (.+)$/i, (m) => `This needs the ${roleList(m[1])} role. A workspace owner can give it to you on the Users page.`],
  [/^Failed to fetch$|^NetworkError|^Load failed$/i, () => "AMC did not answer. Check that it is running (amc up in the workspace folder), then try again."],
  [/^HTTP 404$|^not found$/i, () => "Not found. It may not have been made yet."],
  [/^HTTP 409$/i, () => "That could not be done in the current state. Refresh the page and try again."],
  [/^HTTP (\d+)$/i, (m) => `AMC Studio refused this (code ${m[1]}). Refresh the page and try again.`],
  [/^action \S+ requires approval request before execution$/i, () => "This change needs an approval first. Request the approval, and apply the change once it is approved."],
  [/cannot move from (\w+) to \1$/i, (m) => `It is already ${m[1]}; nothing to change.`],
  [/must match pattern/i, () => "That value is not in the form AMC expects. Copy it again from where it was shown and try again."],
  [/^invalid JSON body$/i, () => "The request was not readable. Refresh the page and try again."],
  [/^payload too large$/i, () => "That is too large to send. Make it shorter and try again."],
  [/^value contract missing$/i, () => "No value data yet: this workspace has no value contract. Create one with amc value init in the workspace folder."]
];

/** The plain sentence for an error or a raw message. */
export function plainErrorText(error) {
  let text = typeof error?.message === "string" ? error.message : String(error ?? "");
  // Class names and internal code prefixes ("ConsoleApiError: ", "Error: ", "BODY_INVALID: ", "transition_illegal: ").
  text = text.replace(/^(?:\s*(?:[A-Z][A-Za-z]*Error|Error)\s*:\s*)+/, "").replace(/^[A-Za-z]+(?:_[A-Za-z]+)+:\s*/, "").trim();
  for (const [pattern, words] of RULES) {
    const match = text.match(pattern);
    if (match) return words(match);
  }
  return text || "Something went wrong. Refresh the page and try again.";
}
