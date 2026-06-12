import type { IncomingMessage, ServerResponse } from "node:http";
import { apiError, apiSuccess, bodyJson, pathParam, queryParam } from "./apiHelpers.js";

export async function handleImporterRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith("/api/v1/imports")) return false;

  if (pathname === "/api/v1/imports" && method === "GET") {
    try {
      const limit = Number.parseInt(queryParam(req.url ?? "", "limit") ?? "25", 10);
      const { listNeutralImports } = await import("../importers/neutralImporter.js");
      const imports = listNeutralImports({ workspace, limit: Number.isFinite(limit) && limit > 0 ? limit : 25 });
      apiSuccess(res, { imports, total: imports.length });
    } catch (error) {
      apiError(res, 500, error instanceof Error ? error.message : "Could not list imports");
    }
    return true;
  }

  if ((pathname === "/api/v1/imports/dry-run" || pathname === "/api/v1/imports/validate" || pathname === "/api/v1/imports") && method === "POST") {
    try {
      const body = await bodyJson<{ inputPath?: string; path?: string; agentId?: string }>(req);
      const inputPath = body.inputPath ?? body.path;
      if (!inputPath) {
        apiError(res, 400, "inputPath required");
        return true;
      }
      const { runNeutralImport, validateNeutralImport } = await import("../importers/neutralImporter.js");
      if (pathname === "/api/v1/imports/validate") {
        apiSuccess(res, { plan: validateNeutralImport({ workspace, inputPath, agentId: body.agentId }) });
        return true;
      }
      const mode = pathname === "/api/v1/imports/dry-run" ? "dry-run" : "import";
      const result = runNeutralImport({ workspace, inputPath, agentId: body.agentId, mode });
      apiSuccess(res, result, mode === "import" ? 201 : 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      apiError(res, /unsupported import/i.test(message) ? 422 : 500, message);
    }
    return true;
  }

  const inspectParams = pathParam(pathname, "/api/v1/imports/:importId");
  if (inspectParams && method === "GET") {
    try {
      const { loadNeutralImportManifest } = await import("../importers/neutralImporter.js");
      apiSuccess(res, loadNeutralImportManifest({ workspace, importId: decodeURIComponent(inspectParams.importId!) }));
    } catch (error) {
      apiError(res, 404, error instanceof Error ? error.message : "Import not found");
    }
    return true;
  }

  const rollbackParams = pathParam(pathname, "/api/v1/imports/:importId/rollback");
  if (rollbackParams && method === "POST") {
    try {
      const { rollbackNeutralImport } = await import("../importers/neutralImporter.js");
      apiSuccess(res, rollbackNeutralImport({ workspace, importId: decodeURIComponent(rollbackParams.importId!) }));
    } catch (error) {
      apiError(res, 404, error instanceof Error ? error.message : "Import not found");
    }
    return true;
  }

  return false;
}
