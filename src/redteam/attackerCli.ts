/** The opt-in attacker-model flags shared by `amc redteam run` and `amc assurance run` (no new command). */
import { InvalidArgumentError, type Command } from "commander";
import { AttackerSpend, DEFAULT_ATTACKER_BUDGET, resolveAttackerModel } from "./attackerModel.js";
import type { AdaptiveAttacker } from "./adaptiveRow.js";
import { resolve } from "node:path";
import { loadCorpusPack } from "../assurance/corpora/publicCorpus.js";
import type { AssurancePackDefinition } from "../assurance/validators.js";

export interface AttackerCliOptions {
  attackerModel?: string;
  attackerRounds?: number;
  attackerMaxTokens?: number;
  attackerMaxCost?: number;
}

function wholeNumber(flag: string, max: number) {
  return (value: string): number => {
    const n = Number(value);
    if (!/^\d+$/.test(value) || n < 1 || n > max) throw new InvalidArgumentError(`${flag} must be a whole number from 1 to ${max}.`);
    return n;
  };
}
function dollars(value: string): number {
  const n = Number(value);
  if (!/^\d+(\.\d+)?$/.test(value) || !(n > 0) || n > 1000) throw new InvalidArgumentError("--attacker-max-cost must be an amount in US dollars above 0 and at most 1000.");
  return n;
}

/** Adds the flags to the same command object; this registers no command. */
export function withAttackerOptions(command: Command): Command {
  return command
    .option("--attacker-model <provider:model>", "off by default. A model you name (openai:<model> or anthropic:<model>) writes new attack text " +
      "for each scenario's injection slot, round by round. AMC sends that model each scenario's goal and the agent's replies and tool calls")
    .option("--attacker-rounds <n>", `rounds per scenario with --attacker-model, the first being the pack's own text (default ${DEFAULT_ATTACKER_BUDGET.rounds})`,
      wholeNumber("--attacker-rounds", 50))
    .option("--attacker-max-tokens <n>", `token limit for all attacker model calls in the run (default ${DEFAULT_ATTACKER_BUDGET.maxTokens})`,
      wholeNumber("--attacker-max-tokens", 10_000_000))
    .option("--attacker-max-cost <usd>", `cost limit in US dollars for all attacker model calls, from AMC's price list (default ${DEFAULT_ATTACKER_BUDGET.maxCostUsd})`, dollars);
}

/** The attacker for a run, or undefined when `--attacker-model` is not given. Refuses a cost limit AMC cannot keep. */
export function attackerFromOptions(opts: AttackerCliOptions, workspace: string): AdaptiveAttacker | undefined {
  if (opts.attackerModel === undefined) {
    if (opts.attackerRounds !== undefined || opts.attackerMaxTokens !== undefined || opts.attackerMaxCost !== undefined) {
      throw new InvalidArgumentError("--attacker-rounds, --attacker-max-tokens and --attacker-max-cost need --attacker-model.");
    }
    return undefined;
  }
  const model = resolveAttackerModel(opts.attackerModel, workspace);
  if (opts.attackerMaxCost !== undefined && !model.priced) {
    throw new InvalidArgumentError(`AMC has no price for ${model.id}, so it cannot keep a cost limit. Leave out --attacker-max-cost ` +
      "to run with the round and token limits only.");
  }
  const maxCostUsd = model.priced ? opts.attackerMaxCost ?? DEFAULT_ATTACKER_BUDGET.maxCostUsd : null;
  return { model, spend: new AttackerSpend({ rounds: opts.attackerRounds ?? DEFAULT_ATTACKER_BUDGET.rounds,
    maxTokens: opts.attackerMaxTokens ?? DEFAULT_ATTACKER_BUDGET.maxTokens, maxCostUsd }) };
}

export interface RedTeamExtraOptions extends AttackerCliOptions { corpus?: string }

/** `amc redteam run` flags: the attacker model and a public attack corpus file. */
export function withRedTeamExtras(command: Command): Command {
  return withAttackerOptions(command)
    .option("--corpus <file>", "also run the injections in a public attack corpus file you downloaded (JSON Lines; see docs/assurance/PUBLIC_CORPORA.md)");
}

/** The runRedTeam inputs the extra flags select. */
export function redTeamExtras(opts: RedTeamExtraOptions, workspace: string): { attacker?: AdaptiveAttacker; extraPacks?: AssurancePackDefinition[] } {
  const attacker = attackerFromOptions(opts, workspace);
  return { ...(attacker ? { attacker } : {}), ...(opts.corpus ? { extraPacks: [loadCorpusPack(resolve(workspace, opts.corpus))] } : {}) };
}
