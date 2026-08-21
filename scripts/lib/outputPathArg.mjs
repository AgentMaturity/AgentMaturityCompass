/**
 * Reads an optional output-path argument, rejecting flags.
 *
 * Several scripts took `process.argv[2]` as "where to write the report" with
 * no validation, so `script.mjs --json` wrote a file literally named `--json`
 * into the repository root. One had sat there since February, alongside four
 * `.tmp-*.json` files from the same class of mistake.
 *
 * A leading dash is never a valid output path: fail loudly with usage instead
 * of creating a file nobody meant to create.
 */
export function readOutputPathArg(argv, scriptName, usage) {
  const value = argv[2];
  if (value !== undefined && value.startsWith("-")) {
    console.error(
      `${scriptName}: "${value}" looks like a flag, not an output path.\n` +
        `This script takes one optional argument: where to write the JSON report.\n` +
        `  ${usage}`
    );
    process.exit(2);
  }
  return value;
}
