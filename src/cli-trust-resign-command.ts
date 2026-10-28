/** `amc trust resign` (P0-37): re-sign .amc/trust.yaml in place after a key rotation or revocation. Moved out of cli.ts. */
import chalk from "chalk";
import type { Command } from "commander";
import { assertOwnerMode } from "./mode/mode.js";
import { describeTrustConfigResign, resignTrustConfig } from "./trust/trustConfigPublication.js";

export function registerTrustResignCommand(trust: Command): void {
  trust
    .command("resign")
    .description("Re-sign the current .amc/trust.yaml in place with the current artifact-seal key, keeping NOTARY settings")
    .option("--confirm <sha256>", "required: the trust.yaml sha256 you reviewed (run once without it to print the review)")
    .option("--accept-compromised-signer", "also required when the recorded signer was revoked as key-compromise")
    .addHelpText("after", `
Use after a key rotation or revocation leaves trust.yaml signed by a retired or revoked artifact-seal key.
Run it once without --confirm to print the content digest and the effective config; review them, then run it
again with --confirm <that sha256>. Content that changed since the review is refused. The content must verify
under its recorded signer from key history; tampered content, or a signer the operator trust context distrusts,
is refused (recreate it with amc trust init, then amc trust enable-notary for NOTARY mode). Owner mode, unlocked vault.
`)
    .action(async (opts: { confirm?: string; acceptCompromisedSigner?: boolean }) => {
      const workspace = process.cwd();
      assertOwnerMode(workspace, "trust resign");
      const review = describeTrustConfigResign(workspace);
      console.log(`trust.yaml sha256: ${review.sha256}`);
      console.log(`Signed by: ${review.signerKeyIds.join(", ")}`);
      console.log(`Effective config:\n${JSON.stringify(review.config, null, 2)}`);
      // The operator binds the digest they reviewed: a digest this run computed itself would bind nothing they saw.
      if (typeof opts.confirm !== "string" || !/^[0-9a-f]{64}$/.test(opts.confirm))
        throw new Error("amc trust resign re-signs content its previous signer vouched for; review the content above, then pass --confirm <its sha256>");
      if (opts.confirm !== review.sha256) throw new Error("trust.yaml changed since the reviewed digest; review it again");
      // resignTrustConfig refuses a distrusted signer, and a key-compromise one without --accept-compromised-signer.
      const assertCurrent = () => {
        if (process.cwd() !== workspace) throw new Error("original trust re-sign workspace changed");
        assertOwnerMode(workspace, "trust resign");
      };
      const resigned = await resignTrustConfig(workspace, { acceptCompromisedSigner: opts.acceptCompromisedSigner === true, expectedSha256: opts.confirm, beforePublish: assertCurrent });
      assertCurrent();
      console.log(chalk.green(`Trust config re-signed: ${resigned.path}`));
      console.log(`Signature: ${resigned.sigPath}`);
      console.log(`Mode: ${resigned.mode}`);
    });
}
