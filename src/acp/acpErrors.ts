/**
 * ACP error codes (plan P7.1a).
 *
 * The JSON-RPC 2.0 standard codes, plus the one implementation-defined code this
 * agent uses. ACP does not define its own numbering for the cases in this slice,
 * so the standard meanings apply and nothing is invented.
 */
export const ACP_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /**
   * A method that is real but not legal yet -- a session call before
   * `initialize`. In the -32000..-32099 range the spec reserves for the
   * implementation, and deliberately NOT `methodNotFound`: the method exists,
   * and telling a client otherwise would send it looking for a capability
   * negotiation problem it does not have.
   */
  notInitialized: -32002
} as const;

export type AcpErrorCode = (typeof ACP_ERROR)[keyof typeof ACP_ERROR];

/**
 * An error a handler chose, as opposed to one it suffered.
 *
 * Carries its code out through the connection's catch, so a deliberate refusal
 * reaches the client as itself rather than as a generic internal fault. Anything
 * else thrown is reported as -32603 with no message, because an unplanned
 * exception's text may name paths inside this process.
 */
export class AcpFailure extends Error {
  readonly acpCode: AcpErrorCode;
  readonly acpData?: unknown;

  constructor(code: AcpErrorCode, message: string, data?: unknown) {
    super(message);
    this.name = "AcpFailure";
    this.acpCode = code;
    if (data !== undefined) this.acpData = data;
  }
}
