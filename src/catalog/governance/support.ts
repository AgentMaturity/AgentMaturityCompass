/**
 * The support new compilations may use for a control (P1-34). Reviewed or qualified support declared in YAML stands only
 * with a valid quorum of review records signed by pinned reviewers and a current review; otherwise it compiles as
 * experimental, with the reasons. Without review authority (no trust, records or D-08 roster) nothing stronger than
 * experimental stands, so today every control compiles experimental. Never raises support; never edits a record.
 */
import type { RegulatoryRegister } from "../../compliance/regulatory/index.js";
import type { TrustContext } from "../../trust/trustContext.js";
import { controlDigest } from "../digest.js";
import type { ControlRecord, SupportLevel } from "../types.js";
import { evaluateReviewCurrency } from "./currency.js";
import { meetsReviewQuorum, type F5Confirmation } from "./reviewRecord.js";

export interface ReviewAuthority {
  /** The operator's trust, loaded with the server's clock; only its signed lists pin catalog-review keys. */
  trust: TrustContext;
  /** Raw review record files (catalog/reviews/**); each is verified, none is trusted for being here. */
  records: readonly unknown[];
  /** The D-08 expert roster: reviewer (trust-list subject) to credentialed domains. */
  experts: ReadonlyMap<string, readonly string[]>;
  /** The authors of a control and of its changes (git), who may not review it. */
  authorsOf: (controlId: string) => readonly string[];
  f5Confirmations: readonly F5Confirmation[];
}

export function effectiveSupport(control: ControlRecord, register: RegulatoryRegister, asOf: string, authority?: ReviewAuthority): { support: SupportLevel; reasons: string[] } {
  if (control.support !== "reviewed" && control.support !== "qualified") return { support: control.support, reasons: [] };
  const currency = evaluateReviewCurrency(control, register, asOf);
  if (currency.support !== control.support) return { support: currency.support, reasons: currency.reasons };
  if (!authority) return { support: "experimental", reasons: ["GOV_REVIEW_UNVERIFIED"] };
  const quorum = meetsReviewQuorum({ kind: "control", id: control.id, version: control.version, digest: controlDigest(control),
    domains: control.stations, aiDrafted: control.provenance.draftedBy === "ai" }, authority.records,
  { trust: authority.trust, experts: authority.experts, authors: authority.authorsOf(control.id), f5Confirmations: authority.f5Confirmations });
  return quorum.met ? { support: control.support, reasons: [] } : { support: "experimental", reasons: ["GOV_REVIEW_UNVERIFIED", ...quorum.reasons] };
}
