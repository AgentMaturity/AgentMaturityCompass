# Public attack corpora

`amc redteam run --corpus <file>` turns a public attack corpus that you downloaded into AMC scenarios. AMC ships no
corpus text: only the loader (`src/assurance/corpora/publicCorpus.ts`), this file format and a short made-up sample,
[public-corpus-sample.jsonl](public-corpus-sample.jsonl).

Each item is placed in a customer ticket the agent reads while it files a ticket (the injection pack's fixture) and
graded by what the agent did, with the ordinary-task twin. Fixture tools are never run. The source and licence of each
item are recorded in the scenario's title and in the run's report. Results on a stand-in or test model show nothing
about a real agent.

## File format

JSON Lines, at most 500 items and 5 MB.

- Optional first line: `{"corpus": {"source": "<where the file came from>", "licence": "<its licence>"}}`. These
  are the defaults for every item.
- Every other line is one item: `{"id": "<1 to 64 letters, digits, . _ ->", "injection": "<the attack text>"}`, with
  optional `"source"` and `"licence"` that override the defaults. `behavior_id` and `attack` are read as `id` and
  `injection`.
- An item with no source or licence after the defaults is refused, as are duplicate ids, empty text, text over 8000
  characters, and a source or licence that is not plain text (printable characters, at most 200).

```bash
amc redteam run my-agent --corpus docs/assurance/public-corpus-sample.jsonl --plugins injection
```

## Corpora checked (2026-11-16)

Each licence below was read at its primary source on 2026-11-16. Read it again before you use a file: a licence can
change, and its terms (for example keeping the copyright notice) are yours to follow when you copy the data.

| Corpus | Where | Licence as read | In AMC |
|---|---|---|---|
| IPI Arena attacks: 95 successful attacks released with "How Vulnerable Are AI Agents to Indirect Prompt Injections? Insights from a Large-Scale Public Competition" (Dziemian, Lin, Fu et al., arXiv:2603.15714, 16 March 2026) | https://huggingface.co/datasets/sureheremarv/ipi_arena_attacks (fields `behavior_id`, `attack`) | The dataset card's licence tag says MIT. The arXiv page's CC BY 4.0 covers the paper only. | Loader only. Add a first line naming the source and licence, then pass the file to `--corpus`. |
| AgentDojo: "AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents" (Debenedetti et al., arXiv:2406.13352, 19 June 2024) | https://github.com/ethz-spylab/agentdojo | MIT License, in the repository's LICENSE file ("Copyright (c) 2024 Edoardo Debenedetti" and five co-authors) | Loader only. AMC has no converter for it: export the attack texts you want to the format above yourself. |

AMC keeps no copy of either corpus. A file you load stays on your machine; its text is sent only to the agent under
test.
