/**
 * Session enclosure: every event belongs to exactly one session.
 *
 * A leaked event is attributed to the wrong run. In a product that scores an
 * agent from its evidence, that is not a logging defect — it is one agent's
 * behaviour counted against another's maturity.
 */
export function checkSessionEnclosure(events, expectedSessionId) {
    const strays = events.filter((event) => event.sessionId !== expectedSessionId);
    if (strays.length === 0)
        return null;
    return {
        name: "session-enclosure",
        message: `${strays.length} event(s) belong to another session`,
        detail: {
            expectedSessionId,
            strayIds: strays.slice(0, 5).map((event) => event.id),
            straySessions: [...new Set(strays.map((event) => event.sessionId))].slice(0, 5)
        }
    };
}
/**
 * FIFO: a session's events are recorded in the order they happened.
 *
 * The ledger is hash-chained, so a reordering does not corrupt the chain — it
 * produces a *valid* chain describing a sequence of events that never
 * occurred. Causality is what makes a trace evidence rather than a set.
 */
export function checkFifo(events) {
    for (let index = 1; index < events.length; index += 1) {
        const previous = events[index - 1];
        const current = events[index];
        if (current.sequence <= previous.sequence) {
            return {
                name: "fifo",
                message: `event ${current.id} has sequence ${current.sequence}, not after ${previous.sequence}`,
                detail: { previousId: previous.id, currentId: current.id }
            };
        }
    }
    return null;
}
/**
 * Prompt reconstruction: what was sent can be rebuilt from what was recorded.
 *
 * This is the load-bearing one. AMC's whole claim is that a run can be audited
 * after the fact; if the recorded parts do not reassemble into the bytes that
 * were actually sent, the audit is of a fiction. Checked by digest so the
 * comparison does not itself retain the prompt.
 */
export function checkPromptReconstruction(recordedParts, sentDigest, digestOf) {
    const reconstructed = digestOf(recordedParts.join(""));
    if (reconstructed === sentDigest)
        return null;
    return {
        name: "prompt-reconstruction",
        message: "recorded prompt parts do not reassemble into the prompt that was sent",
        detail: { partCount: recordedParts.length, reconstructed, expected: sentDigest }
    };
}
/**
 * Approval pairing: every approval answers exactly one request.
 *
 * An unpaired approval is an authorisation with no question attached, and a
 * duplicate is a replay. Both are the shape a forged authorisation takes.
 */
export function checkApprovalPairing(events) {
    const requests = new Set(events.filter((event) => event.kind === "approval-request").map((event) => event.id));
    const answered = new Map();
    for (const event of events) {
        if (event.kind !== "approval-granted")
            continue;
        const target = event.approvalOf;
        if (!target || !requests.has(target)) {
            return {
                name: "approval-pairing",
                message: `approval ${event.id} answers no request`,
                detail: { approvalOf: target ?? null }
            };
        }
        answered.set(target, (answered.get(target) ?? 0) + 1);
    }
    for (const [target, count] of answered) {
        if (count > 1) {
            return {
                name: "approval-pairing",
                message: `request ${target} was approved ${count} times`,
                detail: { requestId: target, approvals: count }
            };
        }
    }
    return null;
}
/**
 * Registers the companions against a live event source.
 *
 * The source is a callback rather than an array so `verify()` reads current
 * state — an invariant bound to a stale snapshot checks nothing.
 */
export function registerSessionInvariants(invariants, source) {
    const disposers = [
        invariants.register("session-enclosure", () => {
            const { sessionId, events } = source();
            return checkSessionEnclosure(events, sessionId);
        }),
        invariants.register("fifo", () => checkFifo(source().events)),
        invariants.register("approval-pairing", () => checkApprovalPairing(source().events))
    ];
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
//# sourceMappingURL=invariantCompanions.js.map