import { z } from "zod";
import { canonicalize } from "../utils/json.js";
import { amcAgentSchema, amcDeclarativeConfigSchema } from "./amcConfigSchema.js";

const schemas = {
  declarative: amcDeclarativeConfigSchema,
  agent: amcAgentSchema,
};

/** Render accepted config input, including fields whose defaults make them optional. */
export function renderConfigSchema(name: string = "declarative"): string {
  if (!Object.hasOwn(schemas, name)) {
    throw new Error(`Unknown config schema: ${name}. Available: ${Object.keys(schemas).join(", ")}`);
  }
  const schema = z.toJSONSchema(schemas[name as keyof typeof schemas], {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "throw",
  });
  return `${JSON.stringify(JSON.parse(canonicalize(schema)), null, 2)}\n`;
}
