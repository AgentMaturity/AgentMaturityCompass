import {
  forecastPolicyPath,
  captureVerifiedForecastArtifact,
  verifyForecastPolicySignature,
  verifyForecastSchedulerSignature
} from "./forecastStore.js";
import type { ForecastScope } from "./forecastSchema.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";

export function verifyForecastPolicy(workspace: string): ReturnType<typeof verifyForecastPolicySignature> {
  return verifyForecastPolicySignature(workspace);
}

export function verifyLatestForecast(workspace: string, scope: ForecastScope): {
  file: ReturnType<typeof verifySignedFileWithAuditor>;
  parseOk: boolean;
  parseError: string | null;
} {
  const captured = captureVerifiedForecastArtifact(workspace, scope), file = captured.file;
  if (!file.valid) {
    return {
      file,
      parseOk: false,
      parseError: file.reason
    };
  }
  try {
    captured.parse();
    return {
      file,
      parseOk: true,
      parseError: null
    };
  } catch (error) {
    return {
      file,
      parseOk: false,
      parseError: String(error)
    };
  }
}

export function verifyForecastWorkspaceArtifacts(workspace: string): {
  policy: ReturnType<typeof verifyForecastPolicySignature>;
  scheduler: ReturnType<typeof verifySignedFileWithAuditor>;
} {
  return {
    policy: verifyForecastPolicySignature(workspace),
    scheduler: verifyForecastSchedulerSignature(workspace)
  };
}

export function forecastPolicyFilePath(workspace: string): string {
  return forecastPolicyPath(workspace);
}

