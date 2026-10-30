import YAML from "yaml";
import { assertOrgPairsCurrent, captureOrgPairs, orgPairBytes, prepareOrgPairsAsync, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { defaultPassportPolicy, passportPolicySchema, type PassportPolicy } from "./passportPolicySchema.js";
import { passportJsonSchema } from "./passportSchema.js";
import { passportPolicyPath, passportLatestCachePath, type savePassportCache } from "./passportStore.js";
import { capturePassportDirectories, passportRequiredDirectories, passportPublicationFailure, type PassportPublicationOptions } from "./passportPublication.js";

export async function preparePassportPolicyAsync(workspace: string, input: PassportPolicy, options: PassportPublicationOptions = {}, previous?: OrgPairsSnapshot) {
  const caller = { ...options }, policy = passportPolicySchema.parse(structuredClone(input)), path = passportPolicyPath(workspace);
  const before = previous ?? captureOrgPairs([path]), dirs = capturePassportDirectories(passportRequiredDirectories(workspace));
  const beforePublish = () => { caller.beforePublish?.(); dirs.assertCurrent(); };
  const prepared = await prepareOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(YAML.stringify(policy)) }], { ...caller, beforePublish }, before);
  const assertCurrent = () => { prepared.assertCurrent(); dirs.assertCurrent(); };
  return Object.freeze({ policy, assertCurrent, get createdDirectories() { return Object.freeze([...dirs.created]); }, publish() {
    try {
      dirs.create(() => { prepared.assertCurrent(); assertOrgPairsCurrent(before); });
      const result = prepared.publish()[0]!; assertCurrent(); return result;
    } catch (cause) {
      if (dirs.created.length === 0) throw cause;
      throw passportPublicationFailure(workspace, "policy-pair", [], dirs.created, null, cause);
    }
  } });
}
export async function savePassportPolicyAsync(workspace: string, policy: PassportPolicy, options: PassportPublicationOptions = {}) {
  return (await preparePassportPolicyAsync(workspace, policy, options)).publish();
}
/** Existing policy body reads require no fresh signing authority. Only a missing body creates the default pair. */
export async function loadPassportPolicyAttemptAsync(workspace: string, options: PassportPublicationOptions = {}) {
  const caller = { ...options }; caller.beforePublish?.(); caller.assertInputsCurrent?.();
  const path = passportPolicyPath(workspace), before = captureOrgPairs([path]), bytes = orgPairBytes(before, path);
  if (bytes !== null) return { policy: passportPolicySchema.parse(YAML.parse(bytes.toString("utf8"))), assertCurrent() {
    caller.beforePublish?.(); caller.assertInputsCurrent?.(); assertOrgPairsCurrent(before);
  } };
  const prepared = await preparePassportPolicyAsync(workspace, defaultPassportPolicy(), caller, before);
  prepared.publish(); return { policy: prepared.policy, assertCurrent: prepared.assertCurrent };
}
export async function loadPassportPolicyAsync(workspace: string, options: PassportPublicationOptions = {}) {
  const loaded = await loadPassportPolicyAttemptAsync(workspace, options); loaded.assertCurrent(); return loaded.policy;
}
/** Internal actual cache pair; the artifact constructor owns its already captured directory plan. */
export async function preparePassportCacheAsync(params: Parameters<typeof savePassportCache>[0], options: PassportPublicationOptions = {}, previous?: OrgPairsSnapshot) {
  const input = structuredClone(params), path = passportLatestCachePath(input.workspace, input.scopeType, input.scopeId);
  const bytes = Buffer.from(JSON.stringify(passportJsonSchema.parse(input.passport), null, 2));
  return prepareOrgPairsAsync(input.workspace, [{ path, bytes }], { ...options }, previous);
}
export async function savePassportCacheAsync(params: Parameters<typeof savePassportCache>[0], options: PassportPublicationOptions = {}) {
  const input = structuredClone(params), caller = { ...options }, before = captureOrgPairs([passportLatestCachePath(input.workspace, input.scopeType, input.scopeId)]);
  const dirs = capturePassportDirectories(passportRequiredDirectories(input.workspace));
  const beforePublish = () => { caller.beforePublish?.(); dirs.assertCurrent(); };
  const prepared = await preparePassportCacheAsync(input, { ...caller, beforePublish }, before);
  try { dirs.create(() => { prepared.assertCurrent(); assertOrgPairsCurrent(before); }); return prepared.publish()[0]!; }
  catch (cause) { if (dirs.created.length === 0) throw cause; throw passportPublicationFailure(input.workspace, "cache-pair", [], dirs.created, null, cause); }
}
