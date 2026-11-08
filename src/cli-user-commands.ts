/**
 * The `amc user ...` command group: console accounts in the signed .amc/users.yaml.
 *
 * Moved out of cli.ts whole (LIVE-VAULT-06) when `password`, `--password-file` and `init --force` were added: the ratchet
 * prices growth in cli.ts, and the group is a self-contained unit in the same shape as cli-lease-commands.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import chalk from "chalk";
import inquirer from "inquirer";
import type { Command } from "commander";
import { usersConfigPath } from "./auth/authApi.js";
import { MIN_PASSWORD_LENGTH } from "./auth/passwordHash.js";
import {
  parseRolesCsv,
  userAddCliAsync as userAddCli,
  userInitCliAsync as userInitCli,
  userListCli,
  userPasswordCliAsync,
  userRevokeCliAsync as userRevokeCli,
  userRoleSetCliAsync as userRoleSetCli,
  userVerifyCli
} from "./auth/authCli.js";

const PASSWORD_FILE = ["--password-file <path>", "read the password from this private file (for shells without a terminal)"] as const;
const TOO_SHORT = `password must be at least ${MIN_PASSWORD_LENGTH} characters`;

/** --password-file's trimmed contents, else a masked prompt. A shell without a terminal must name a file: never an inline password (argv). */
async function accountPassword(username: string, passwordFile: string | undefined): Promise<string> {
  if (passwordFile !== undefined) {
    const password = readFileSync(passwordFile, "utf8").trim();
    if (password.length === 0) throw new Error("password file is empty");
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(TOO_SHORT);
    return password;
  }
  if (process.stdin.isTTY !== true) throw new Error("No terminal for the password prompt: pass --password-file <path> (a private file holding the password).");
  const answer = await inquirer.prompt<{ password: string }>([{ type: "password", name: "password", message: `Password for ${username}`, mask: "*",
    validate: (value: string) => value.length >= MIN_PASSWORD_LENGTH || TOO_SHORT }]);
  return answer.password;
}

export function registerUserCommands(program: Command): void {
  const user = program.command("user").description("Multi-user RBAC account management");

  user
    .command("init")
    .description("Initialize signed users.yaml with first OWNER user")
    .requiredOption("--username <name>", "owner username")
    .option(...PASSWORD_FILE)
    .option("--force", "replace an existing users.yaml and every account in it", false)
    .action(async (opts: { username: string; passwordFile?: string; force: boolean }) => {
      if (!opts.force && existsSync(usersConfigPath(process.cwd()))) {
        throw new Error("users.yaml already exists; pass --force to replace every account, or use amc user add");
      }
      const created = await userInitCli({
        workspace: process.cwd(),
        username: opts.username,
        password: await accountPassword(opts.username, opts.passwordFile)
      });
      console.log(chalk.green(`Users config created: ${created.path}`));
      console.log(`Signature: ${created.sigPath}`);
      console.log(`Owner: ${created.username} roles=${created.roles.join(",")}`);
    });

  user
    .command("add")
    .description("Add a user with RBAC roles")
    .requiredOption("--username <name>", "username")
    .requiredOption("--role <roles>", "comma-separated roles, e.g. APPROVER or OWNER,APPROVER")
    .option(...PASSWORD_FILE)
    .action(async (opts: { username: string; role: string; passwordFile?: string }) => {
      const created = await userAddCli({
        workspace: process.cwd(),
        username: opts.username,
        roles: parseRolesCsv(opts.role),
        password: await accountPassword(opts.username, opts.passwordFile)
      });
      console.log(chalk.green(`User added: ${created.username}`));
      console.log(`Roles: ${created.roles.join(",")}`);
    });

  user
    .command("list")
    .description("List RBAC users")
    .action(() => {
      const rows = userListCli(process.cwd());
      if (rows.length === 0) {
        console.log("No users configured.");
        return;
      }
      for (const row of rows) {
        console.log(`${row.username} | roles=${row.roles.join(",")} | status=${row.status} | created=${new Date(row.createdTs).toISOString()}`);
      }
    });

  user
    .command("revoke")
    .description("Revoke a user account")
    .argument("<username>")
    .action(async (username: string) => {
      const out = await userRevokeCli({
        workspace: process.cwd(),
        username
      });
      console.log(chalk.green(`User updated: ${out.username} status=${out.status}`));
    });

  user
    .command("password")
    .description("Set a new password for a console account; its signed-in sessions end")
    .argument("<username>")
    .option(...PASSWORD_FILE)
    .action(async (username: string, opts: { passwordFile?: string }) => {
      const out = await userPasswordCliAsync({ workspace: process.cwd(), username, password: await accountPassword(username, opts.passwordFile) });
      console.log(chalk.green(`Password updated: ${out.username} (their signed-in sessions were revoked)`));
    });

  user
    .command("role")
    .description("Set user roles")
    .command("set")
    .description("Replace roles for a user")
    .argument("<username>")
    .requiredOption("--roles <roles>", "comma-separated roles")
    .action(async (username: string, opts: { roles: string }) => {
      const out = await userRoleSetCli({
        workspace: process.cwd(),
        username,
        roles: parseRolesCsv(opts.roles)
      });
      console.log(chalk.green(`User roles updated: ${out.username}`));
      console.log(`Roles: ${out.roles.join(",")}`);
    });

  user
    .command("verify")
    .description("Verify users.yaml signature")
    .action(() => {
      const verify = userVerifyCli(process.cwd());
      if (verify.valid) {
        console.log(chalk.green(`Users signature valid: ${verify.sigPath}`));
        return;
      }
      console.log(chalk.red(`Users signature invalid: ${verify.reason ?? "unknown reason"}`));
      process.exit(1);
    });
}
