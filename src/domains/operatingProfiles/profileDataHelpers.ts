import type { UserRole } from "../../auth/roles.js";
import type {
  ApprovalClassSetting,
  IncidentReportingClock,
  ProfileSource,
  SourcedSetting
} from "./operatingProfileTypes.js";

export function sourced<T>(value: T, source: ProfileSource, basis: string): SourcedSetting<T> {
  return { value, source, basis };
}

export function approval(
  requiredApprovals: number,
  requireDistinctUsers: boolean,
  rolesAllowed: UserRole[],
  ttlMinutes: number
): ApprovalClassSetting {
  return { requiredApprovals, requireDistinctUsers, rolesAllowed, ttlMinutes };
}

export function clock(input: {
  id: string;
  trigger: string;
  authority: string;
  value: number;
  unit: IncidentReportingClock["deadline"]["unit"];
  source: ProfileSource;
  basis: string;
}): IncidentReportingClock {
  return {
    id: input.id,
    trigger: input.trigger,
    authority: input.authority,
    deadline: { value: input.value, unit: input.unit },
    source: input.source,
    basis: input.basis
  };
}

/** Days in N years at 365 days; used only to turn a statutory year count into a retention window. */
export function yearsToDays(years: number): number {
  return years * 365;
}
