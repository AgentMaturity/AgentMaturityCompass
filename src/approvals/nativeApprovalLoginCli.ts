import type { Command } from "commander";
import { loginNativeApprovals, NATIVE_APPROVAL_PASSWORD_BYTES, NATIVE_APPROVAL_TTL_MINUTES, NativeApprovalLoginError } from "./nativeApprovalLogin.js";

export interface NativeApprovalLoginCliIo {
  readonly log: (text: string) => void;
  readonly error: (text: string) => void;
  readonly fail: () => void;
  readonly readPassword: (fromStdin: boolean) => Promise<string>;
}

/** One optional terminal line ending is discarded; all other password bytes remain exact. */
export async function readNativeApprovalPasswordFromStdin(input: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  let combined: Buffer | undefined;
  try {
    for await (const chunk of input) {
      total += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, "utf8");
      if (total > NATIVE_APPROVAL_PASSWORD_BYTES + 2) {
        throw new NativeApprovalLoginError("PASSWORD_LIMIT", "Password stdin exceeds the 4096-byte limit.");
      }
      const bytes = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, "utf8");
      chunks.push(bytes);
    }
    combined = Buffer.concat(chunks);
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(combined); }
    catch { throw new NativeApprovalLoginError("PASSWORD_ENCODING", "Password stdin must contain valid UTF-8 text."); }
    text = text.replace(/\r?\n$/, "");
    if (Buffer.byteLength(text) > NATIVE_APPROVAL_PASSWORD_BYTES) throw new NativeApprovalLoginError("PASSWORD_LIMIT", "Password stdin exceeds the 4096-byte limit.");
    return text;
  } finally { combined?.fill(0); for (const chunk of chunks) chunk.fill(0); }
}

async function readPassword(fromStdin: boolean): Promise<string> {
  if (fromStdin) {
    if (process.stdin.isTTY) throw new NativeApprovalLoginError("STDIN_REQUIRED", "--password-stdin requires redirected input; omit it for the masked terminal prompt.");
    return readNativeApprovalPasswordFromStdin(process.stdin);
  }
  if (!process.stdin.isTTY) throw new NativeApprovalLoginError("PASSWORD_SOURCE_REQUIRED", "Use a terminal for the masked password prompt, or explicitly select --password-stdin for bounded redirected input. Password arguments are not accepted.");
  const inquirer = (await import("inquirer")).default;
  const prompt = inquirer.createPromptModule({ input: process.stdin, output: process.stderr });
  const answer = await prompt<{ password: string }>([{ type: "password", name: "password", mask: "*", message: "Existing local user password:" }]);
  return answer.password;
}
const defaultIo: NativeApprovalLoginCliIo = {
  log: text => console.log(text), error: text => console.error(text), fail: () => { process.exitCode = 1; }, readPassword
};

export function registerNativeApprovalLoginCommands(approvals: Command, io: NativeApprovalLoginCliIo = defaultIo): void {
  approvals.command("login")
    .description("Authenticate an existing local user and write a new private tracked session-token file for native approvals")
    .requiredOption("--username <name>", "exact existing ACTIVE local username; no identity is created")
    .requiredOption("--token-file <newpath>", "new private output file in an existing directory; never overwritten")
    .option("--ttl-minutes <n>", "session lifetime, integer 5–60 minutes", String(NATIVE_APPROVAL_TTL_MINUTES.default))
    .option("--password-stdin", "read at most 4096 UTF-8 password bytes from redirected stdin; never argv")
    .option("--json", "output identity, actual expiry and path metadata only; never a password or token")
    .action(async (opts: { username: string; tokenFile: string; ttlMinutes: string; passwordStdin?: boolean; json?: boolean }) => {
      try {
        const ttlMinutes = /^[0-9]+$/.test(opts.ttlMinutes) ? Number(opts.ttlMinutes) : NaN;
        const receipt = await loginNativeApprovals({ workspace: process.cwd(), username: opts.username,
          tokenFile: opts.tokenFile, ttlMinutes }, () => io.readPassword(opts.passwordStdin === true));
        if (opts.json) io.log(JSON.stringify({ ok: true, ...receipt }, null, 2));
        else {
          io.log(`Logged in as ${JSON.stringify(receipt.username)} (${receipt.userId}); roles: ${receipt.roles.join(", ")}.`);
          io.log(`Expires: ${new Date(receipt.expiresTs).toISOString()}\nPrivate session file: ${receipt.tokenFile}`);
          io.log("Use this file path when native chat asks for your authenticated approval session. Existing request roles, quorum and policy still apply.");
        }
      } catch (error) {
        const code = error instanceof NativeApprovalLoginError ? error.code : "LOGIN_FAILED";
        const message = error instanceof NativeApprovalLoginError ? error.message : "Approval login failed; password and token details are withheld.";
        if (opts.json) io.log(JSON.stringify({ ok: false, code, message }, null, 2));
        else io.error(message);
        io.fail();
      }
    });
}
