/**
 * Checks catalog/bindings/policy-packs.yaml (P1-53) against the built-in policy packs: every setting path resolves in
 * every pack, and every named parameter is one the compiler enforces (PARAMETERS) and accepts each pack's value. The map
 * is information for P1-10, which may start from a pack and then apply stricter catalog parameters; nothing applies it yet.
 */
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import type { CatalogIssue } from "../schema.js";
import type { PolicyPackBindingMap } from "../types.js";
import { PARAMETERS } from "./runtimePolicy.js";
import type { ParamValue } from "./types.js";

const FILE = "bindings/policy-packs.yaml";
const PLACEHOLDER = "{actionClass}";

/** `{actionClass}` expanded over every action class; other paths as written. */
function expand(path: string): string[] {
  return path.includes(PLACEHOLDER) ? ACTION_CLASSES.map((ac) => path.split(PLACEHOLDER).join(ac)) : [path];
}

/** The value at a dotted path, where `name[*]` maps the rest of the path over a list; undefined when any step is missing. */
function readSetting(value: unknown, path: string): unknown {
  const [head, ...rest] = path.split(".");
  if (head === undefined || value === null || typeof value !== "object") return undefined;
  const list = head.endsWith("[*]");
  const next = (value as Record<string, unknown>)[list ? head.slice(0, -3) : head];
  if (!list) return rest.length ? readSetting(next, rest.join(".")) : next;
  if (!Array.isArray(next)) return undefined;
  const items = next.map((item) => (rest.length ? readSetting(item, rest.join(".")) : item));
  return items.includes(undefined) ? undefined : items;
}

export function validatePolicyPackBindings(map: PolicyPackBindingMap, packs: ReadonlyArray<{ id: string }>): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const add = (path: string, message: string) => issues.push({ code: "CAT_BINDING_MAP", severity: "error", file: FILE, controlId: null, path, message });
  const ids = packs.map((p) => p.id);
  for (const id of ids.filter((id) => !map.packs.includes(id))) add("packs", `policy pack ${id} is missing from the map`);
  for (const id of map.packs.filter((id) => !ids.includes(id))) add("packs", `${id} is not a built-in policy pack`);
  map.settings.forEach((row, i) => {
    const settings = expand(row.setting);
    const parameters = row.parameter === null ? null : expand(row.parameter);
    if (parameters && parameters.length !== settings.length) add(`settings.${i}`, "setting and parameter must both or neither use {actionClass}");
    settings.forEach((setting, j) => {
      const parameter = parameters?.[j];
      const spec = parameter === undefined ? undefined : PARAMETERS.find((s) => s.pattern.test(parameter));
      if (parameter !== undefined && !spec) add(`settings.${i}.parameter`, `${parameter} is not a catalog binding parameter (docs/catalog/COMPILER.md)`);
      for (const pack of packs) {
        const value = readSetting(pack, setting);
        if (value === undefined) add(`settings.${i}.setting`, `${setting} does not exist in policy pack ${pack.id}`);
        else if (spec && !spec.check(value as ParamValue)) add(`settings.${i}.parameter`, `${pack.id} ${setting} is not ${spec.expects}, as ${parameter} needs`);
      }
    });
  });
  return issues;
}
