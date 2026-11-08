import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { loadStudioRuntimeConfig } from "../src/config/loadConfig.js";
import { assertNativeBrowserAdmission, nativeAllowedBrowserOrigins } from "../src/studio/nativeAdmission.js";
import { read, readYaml } from "./helpers/deployPackFixtures.js";
import { interpolate, serviceEnv } from "./helpers/composeInterpolate.js";

// Studio admits native and A4 requests only from the bind host or AMC_CORS_ALLOWED_ORIGINS (src/studio/nativeAdmission.ts).
// Under --bind 0.0.0.0 the bind host alone is http://0.0.0.0:3212, so each Compose Studio service must list the origin a
// browser uses. The compose value is resolved as `docker compose` interpolates it and fed to Studio's own admission code.
const STACKS = [
  { file: "deploy/compose/docker-compose.yml", service: "studio", origin: "http://localhost:3212" },
  { file: "deploy/compose/docker-compose.tls.yml", service: "amc-studio", origin: "https://localhost:8443" },
  { file: "docker/docker-compose.yml", service: "amc-studio", origin: "http://localhost:3212" }
] as const;
const EXTRA = "http://192.168.1.20:3212";
const cookieActor = { isAdmin: false, userId: "owner", nativeCsrfToken: "c".repeat(64) };

/** The origins Studio admits for this service, parsed by Studio's own config loader (it drops a trailing empty entry). */
function allowedOrigins(file: string, service: string, env: Record<string, string> = {}, withOrigins = true): readonly string[] {
  const studio = serviceEnv(readYaml(file).services[service]);
  const value = (key: string) => studio[key] === undefined ? undefined : interpolate(studio[key]!, env);
  const config = loadStudioRuntimeConfig({ AMC_WORKSPACE_DIR: "/data/amc", AMC_BIND: value("AMC_BIND"), AMC_STUDIO_PORT: value("AMC_STUDIO_PORT"),
    AMC_CORS_ALLOWED_ORIGINS: withOrigins ? value("AMC_CORS_ALLOWED_ORIGINS") : undefined });
  return nativeAllowedBrowserOrigins(config.bind, config.studioPort, config.corsAllowedOrigins);
}

function admitGet(allowed: readonly string[], origin: string): void {
  assertNativeBrowserAdmission({ req: { method: "GET", headers: { host: new URL(origin).host, origin } }, actor: cookieActor, allowedOrigins: allowed });
}

describe("compose browser origins are appended, never replaced (LIVE-DEPLOY-02)", () => {
  it.each(STACKS)("$file admits its documented console origin by default", ({ file, service, origin }) => {
    expect(() => admitGet(allowedOrigins(file, service), origin)).not.toThrow();
  });

  it.each(STACKS)("$file keeps the defaults when AMC_EXTRA_ORIGINS adds a LAN origin", ({ file, service, origin }) => {
    const allowed = allowedOrigins(file, service, { AMC_EXTRA_ORIGINS: EXTRA });
    expect(() => admitGet(allowed, origin)).not.toThrow();
    expect(() => admitGet(allowed, EXTRA)).not.toThrow();
  });

  it("the docker/ stack still admits the verify profile's origin first", () => {
    expect(() => admitGet(allowedOrigins("docker/docker-compose.yml", "amc-studio"), "http://amc-studio:3212")).not.toThrow();
    expect(serviceEnv(readYaml("docker/docker-compose.yml").services["amc-studio"]).AMC_CORS_ALLOWED_ORIGINS!.split(",")[0]).toBe("http://amc-studio:3212");
  });

  it.each(STACKS)("$file follows the published host port and TLS host", ({ file, service }) => {
    const env = { AMC_STUDIO_PORT: "47123", AMC_TLS_HOST: "amc.example.internal", AMC_TLS_PORT: "47443" };
    const expected = file.endsWith("tls.yml") ? "https://amc.example.internal:47443" : "http://localhost:47123";
    expect(() => admitGet(allowedOrigins(file, service, env), expected)).not.toThrow();
  });

  it.each(STACKS)("without the compose value $file refuses the same GET with NATIVE_HOST_DENIED", ({ file, service, origin }) => {
    expect(() => admitGet(allowedOrigins(file, service, {}, false), origin)).toThrow(expect.objectContaining({ code: "NATIVE_HOST_DENIED" }));
  });

  it("documents the format and the append variable where operators set it", () => {
    expect(read("deploy/compose/.env.example")).toMatch(/^AMC_EXTRA_ORIGINS=$/m);
    const lan = /## Phone\/LAN Access\n([\s\S]*?)\n## /.exec(read("deploy/compose/README.md"))?.[1] ?? "";
    expect(lan).toContain("AMC_PUBLISH_ADDRESS=0.0.0.0");
    expect(lan).toContain("AMC_EXTRA_ORIGINS");
    expect(lan).toContain("NATIVE_HOST_DENIED");
    const ingress = YAML.parse(read("deploy/helm/amc/examples/values-ingress-tls.yaml"));
    expect(ingress.env.AMC_CORS_ALLOWED_ORIGINS).toBe("https://amc.example.internal");
  });
});
