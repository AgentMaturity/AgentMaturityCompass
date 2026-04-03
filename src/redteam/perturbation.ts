export type PerturbationTechnique =
  | "leetspeak"
  | "homoglyph"
  | "zero-width"
  | "mixed-case"
  | "phonetic"
  | "random-composite";

export type PerturbationIntensity = "light" | "medium" | "heavy";

export interface PerturbationMutation {
  index: number;
  from: string;
  to: string;
}

export interface PerturbationResult {
  input: string;
  output: string;
  technique: PerturbationTechnique;
  intensity: PerturbationIntensity;
  triggersFound: string[];
  mutations: PerturbationMutation[];
}

export interface CompositePerturbationResult extends PerturbationResult {
  appliedTechniques: PerturbationTechnique[];
}

export interface ApplyPerturbationOptions {
  technique: PerturbationTechnique;
  intensity: PerturbationIntensity;
  seed?: number;
}

const TRIGGERS = [
  "ignore",
  "instructions",
  "disable",
  "safety",
  "controls",
  "bypass",
  "override",
  "system",
  "admin",
  "prompt",
  "hidden",
  "exploit",
  "policy",
  "filters",
];

const LEET_MAP: Record<string, string[]> = {
  a: ["4", "@"],
  e: ["3"],
  i: ["1", "!"],
  o: ["0"],
  s: ["5", "$"],
  t: ["7"],
  g: ["9"],
};

const HOMOGLYPH_MAP: Record<string, string[]> = {
  a: ["а"],
  c: ["с"],
  e: ["е"],
  i: ["і"],
  o: ["о"],
  p: ["р"],
  s: ["ѕ"],
  y: ["у"],
  x: ["х"],
};

const PHONETIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/ph/gi, "f"],
  [/ck/gi, "k"],
  [/tion/gi, "shun"],
  [/safety/gi, "saeftee"],
  [/disable/gi, "dissable"],
  [/ignore/gi, "ignorr"],
];

const ZERO_WIDTH_CHARS = ["\u200B", "\u200C", "\u200D"];

function makeRng(seed: number | undefined): () => number {
  let state = seed ?? 123456789;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pickMutationCount(candidateCount: number, intensity: PerturbationIntensity): number {
  if (candidateCount <= 0) {
    return 0;
  }
  if (intensity === "light") {
    return Math.min(1, candidateCount);
  }
  if (intensity === "medium") {
    return Math.max(1, Math.ceil(candidateCount / 2));
  }
  return candidateCount;
}

export function detectPerturbationTriggers(text: string): string[] {
  const lowered = text.toLowerCase();
  return TRIGGERS.filter((trigger) => lowered.includes(trigger));
}

function chooseIndices(indices: number[], count: number, rng: () => number): number[] {
  const pool = [...indices];
  const chosen: number[] = [];
  while (pool.length > 0 && chosen.length < count) {
    const idx = Math.floor(rng() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]!);
  }
  return chosen.sort((a, b) => a - b);
}

function mutateByMap(
  input: string,
  map: Record<string, string[]>,
  intensity: PerturbationIntensity,
  rng: () => number,
): PerturbationResult {
  const chars = [...input];
  const candidateIndices = chars
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => {
      const replacements = map[char.toLowerCase()];
      return Array.isArray(replacements) && replacements.length > 0;
    })
    .map(({ index }) => index);
  const chosen = chooseIndices(candidateIndices, pickMutationCount(candidateIndices.length, intensity), rng);
  const mutations: PerturbationMutation[] = [];
  for (const index of chosen) {
    const original = chars[index]!;
    const replacements = map[original.toLowerCase()]!;
    const replacement = replacements[Math.floor(rng() * replacements.length)]!;
    chars[index] = replacement;
    mutations.push({ index, from: original, to: replacement });
  }
  return {
    input,
    output: chars.join(""),
    technique: map === LEET_MAP ? "leetspeak" : "homoglyph",
    intensity,
    triggersFound: detectPerturbationTriggers(input),
    mutations,
  };
}

function mutateZeroWidth(input: string, intensity: PerturbationIntensity, rng: () => number): PerturbationResult {
  const chars = [...input];
  const candidateIndices = chars.map((_, index) => index).filter((index) => index < chars.length - 1);
  const chosen = chooseIndices(candidateIndices, pickMutationCount(candidateIndices.length, intensity), rng);
  const mutations: PerturbationMutation[] = [];
  let offset = 0;
  for (const index of chosen) {
    const insertion = ZERO_WIDTH_CHARS[Math.floor(rng() * ZERO_WIDTH_CHARS.length)]!;
    const insertAt = index + 1 + offset;
    chars.splice(insertAt, 0, insertion);
    offset += 1;
    mutations.push({ index: insertAt, from: "", to: insertion });
  }
  return {
    input,
    output: chars.join(""),
    technique: "zero-width",
    intensity,
    triggersFound: detectPerturbationTriggers(input),
    mutations,
  };
}

function mutateMixedCase(input: string, intensity: PerturbationIntensity, rng: () => number): PerturbationResult {
  const chars = [...input];
  const candidateIndices = chars
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => /[a-z]/i.test(char))
    .map(({ index }) => index);
  const chosen = chooseIndices(candidateIndices, pickMutationCount(candidateIndices.length, intensity), rng);
  const mutations: PerturbationMutation[] = [];
  for (const index of chosen) {
    const original = chars[index]!;
    const replacement = original === original.toUpperCase() ? original.toLowerCase() : original.toUpperCase();
    chars[index] = replacement;
    mutations.push({ index, from: original, to: replacement });
  }
  return {
    input,
    output: chars.join(""),
    technique: "mixed-case",
    intensity,
    triggersFound: detectPerturbationTriggers(input),
    mutations,
  };
}

function mutatePhonetic(input: string, intensity: PerturbationIntensity, rng: () => number): PerturbationResult {
  let output = input;
  const mutations: PerturbationMutation[] = [];
  const maxRules = intensity === "light" ? 1 : intensity === "medium" ? 3 : PHONETIC_REPLACEMENTS.length;
  let applied = 0;
  for (const [pattern, replacement] of PHONETIC_REPLACEMENTS) {
    if (applied >= maxRules) {
      break;
    }
    const next = output.replace(pattern, (match, offset) => {
      mutations.push({ index: offset, from: match, to: replacement });
      return replacement;
    });
    if (next !== output) {
      output = next;
      applied += 1;
    }
    if (rng() < 0.1 && intensity === "light") {
      break;
    }
  }
  return {
    input,
    output,
    technique: "phonetic",
    intensity,
    triggersFound: detectPerturbationTriggers(input),
    mutations,
  };
}

export function applyPerturbation(input: string, options: ApplyPerturbationOptions): PerturbationResult {
  const rng = makeRng(options.seed);
  switch (options.technique) {
    case "leetspeak":
      return mutateByMap(input, LEET_MAP, options.intensity, rng);
    case "homoglyph":
      return mutateByMap(input, HOMOGLYPH_MAP, options.intensity, rng);
    case "zero-width":
      return mutateZeroWidth(input, options.intensity, rng);
    case "mixed-case":
      return mutateMixedCase(input, options.intensity, rng);
    case "phonetic":
      return mutatePhonetic(input, options.intensity, rng);
    case "random-composite":
      return applyRandomCompositePerturbation(input, {
        intensity: options.intensity,
        seed: options.seed,
      });
    default:
      return {
        input,
        output: input,
        technique: options.technique,
        intensity: options.intensity,
        triggersFound: detectPerturbationTriggers(input),
        mutations: [],
      };
  }
}

export function applyRandomCompositePerturbation(
  input: string,
  options: { intensity: PerturbationIntensity; seed?: number },
): CompositePerturbationResult {
  const rng = makeRng(options.seed);
  const techniques: PerturbationTechnique[] = [
    "leetspeak",
    "homoglyph",
    "zero-width",
    "mixed-case",
    "phonetic",
  ];
  const count = options.intensity === "light" ? 2 : options.intensity === "medium" ? 3 : 4;
  const chosen = chooseIndices(
    techniques.map((_, index) => index),
    Math.min(count, techniques.length),
    rng,
  ).map((index) => techniques[index]!);

  let current = input;
  const mutations: PerturbationMutation[] = [];
  for (const technique of chosen) {
    const result = applyPerturbation(current, {
      technique,
      intensity: options.intensity,
      seed: Math.floor(rng() * 1_000_000),
    });
    current = result.output;
    mutations.push(...result.mutations);
  }

  return {
    input,
    output: current,
    technique: "random-composite",
    intensity: options.intensity,
    triggersFound: detectPerturbationTriggers(input),
    mutations,
    appliedTechniques: chosen,
  };
}
