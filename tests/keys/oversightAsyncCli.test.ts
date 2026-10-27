// Root must build the current candidate first: these commands execute its actual dist CLI and file provider.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readOversightRecords, oversightRecordPath, createOversightRecord, appendOversightRecord, workspaceOversightPublicKeys, verifyOversightChain } from "../../src/incidents/oversightRecord.js";
import { getSigningKey } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";
import { fixture, cleanupFixtures, seedIncident, oversightInput, PASS } from "../helpers/consoleOversightFixture.js";
const cli=resolve("dist/cli.js");
afterEach(cleanupFixtures);
test.skipIf(process.platform==="win32")("actual compiled oversight command awaits the checked producer and the actual packet command verifies it",async()=>{
  const f=fixture(),incident=seedIncident(f.workspace);const args=[cli,"incident","oversight",incident.incidentId,"--decision","ACKNOWLEDGED","--reviewer","cli-owner","--rationale","Owned actual CLI review"];
  const out=await spawnOwnedNode(args,{cwd:f.workspace,env:{...process.env,NO_COLOR:"1"}}).wait(30_000);expect(out.code).toBe(0);expect(out.stderr).not.toContain("Error");expect(out.stdout).toContain("Oversight record");
  const path=oversightRecordPath(f.workspace,incident.incidentId),records=readOversightRecords(path);expect(records).toHaveLength(1);expect(records[0]!.reviewerId).toBe("cli-owner");expect(verifyOversightChain(records,incident,workspaceOversightPublicKeys(f.workspace)).ok).toBe(true);
  const dir=join(f.root,"packet"),packet=await spawnOwnedNode([cli,"incident","show",incident.incidentId,"--packet",dir,"--station","wealth"],{cwd:f.workspace,env:{...process.env,NO_COLOR:"1"}}).wait(30_000);
  expect(packet.code).toBe(0);const body=JSON.parse(readFileSync(join(dir,incident.incidentId+".packet.json"),"utf8"));expect(body.oversight).toEqual([expect.objectContaining({signatureVerified:true})]);
});
test.skipIf(process.platform==="win32")("actual packet CLI does not authenticate a raw-valid different auditor-purpose rotation",async()=>{
  const f=fixture(),incident=seedIncident(f.workspace),input=oversightInput(f.workspace,incident);rotatePurposeKeys({workspace:f.workspace,purposes:["config-signature"],passphrase:PASS});
  const bad=createOversightRecord({...input,decision:"ACKNOWLEDGED",privateKeyPem:getSigningKey(f.workspace,"config-signature")});appendOversightRecord(oversightRecordPath(f.workspace,incident.incidentId),bad);
  const dir=join(f.root,"unverified-packet"),out=await spawnOwnedNode([cli,"incident","show",incident.incidentId,"--packet",dir,"--station","wealth"],{cwd:f.workspace,env:{...process.env,NO_COLOR:"1"}}).wait(30_000);
  expect(out.code).toBe(0);const body=JSON.parse(readFileSync(join(dir,incident.incidentId+".packet.json"),"utf8"));expect(body.oversight[0].signatureVerified).toBe(false);expect(body.missing.some((row:{item:string})=>row.item==="oversight-chain")).toBe(true);
});
