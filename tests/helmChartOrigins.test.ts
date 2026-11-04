import { describe, expect, it } from "vitest";
import {
  assertNativeBrowserAdmission,
  NATIVE_CSRF_HEADER,
  NATIVE_INTENT_HEADER,
  NATIVE_INTENT_VALUE,
  nativeAllowedBrowserOrigins
} from "../src/studio/nativeAdmission.js";
import { chartDir, read, readYaml } from "./helpers/deployPackFixtures.js";

// Studio admits native requests only from hosts in AMC_CORS_ALLOWED_ORIGINS plus
// the bind host (src/studio/nativeAdmission.ts). Under --bind 0.0.0.0 the bind
// host alone is http://0.0.0.0:3212, so the chart must list the Service origin the
// helm test pod calls. helm is absent on the authoring host: the template wiring is
// asserted statically and the value it renders is fed to Studio's own admission code.
const SERVICE_ORIGIN_HELPER = '{{- define "amc.studioServiceOrigin" -}}\n'
  + '{{- printf "http://%s:%v" (include "amc.fullname" .) .Values.service.port -}}\n'
  + "{{- end -}}";
const CORS_HELPER = '{{- define "amc.corsAllowedOrigins" -}}\n'
  + '{{- join "," (compact (list (include "amc.studioServiceOrigin" .) .Values.env.AMC_CORS_ALLOWED_ORIGINS)) -}}\n'
  + "{{- end -}}";
const CSRF = "c".repeat(64);
const cookieActor = { isAdmin: false, userId: "owner", nativeCsrfToken: CSRF };

/** What amc.corsAllowedOrigins renders for a release with no name/fullname override. */
function renderedCorsOrigins(release: string, values: any): string {
  const fullname = `${release}-amc`;
  return [`http://${fullname}:${values.service.port}`, values.env.AMC_CORS_ALLOWED_ORIGINS].filter(Boolean).join(",");
}

/** src/config/loadConfig.ts parseAllowedOrigins. */
const parseOrigins = (raw: string) => raw.split(",").map((v) => v.trim()).filter((v) => v.length > 0);

function admit(allowed: readonly string[], headers: Record<string, string>, method = "GET"): void {
  assertNativeBrowserAdmission({ req: { method, headers }, actor: cookieActor, allowedOrigins: allowed });
}

describe("helm chart native origin admission", () => {
  it("the ConfigMap sets AMC_CORS_ALLOWED_ORIGINS from the Service origin the test pod calls", () => {
    expect(read(`${chartDir}/templates/configmap.yaml`)).toContain(
      '  AMC_CORS_ALLOWED_ORIGINS: {{ include "amc.corsAllowedOrigins" . | quote }}\n');
    const helpers = read(`${chartDir}/templates/_helpers.tpl`);
    expect(helpers).toContain(SERVICE_ORIGIN_HELPER);
    expect(helpers).toContain(CORS_HELPER);
    const hook = read(`${chartDir}/templates/tests/governed-turn.yaml`);
    expect(hook).toMatch(/- --base-url\n\s+- \{\{ include "amc\.studioServiceOrigin" \. \}\}\n/);
    const values = readYaml(`${chartDir}/values.yaml`);
    expect(values.env.AMC_CORS_ALLOWED_ORIGINS).toBe("");
    expect(values.env.AMC_BIND).toBe("0.0.0.0");
  });

  it("Studio admits the test pod's GET and POST with the rendered value and denies the GET without it", () => {
    const values = readYaml(`${chartDir}/values.yaml`);
    const rendered = renderedCorsOrigins("amc", values);
    expect(rendered).toBe("http://amc-amc:3212");
    const bindPort = Number(values.env.AMC_STUDIO_PORT);
    const allowed = nativeAllowedBrowserOrigins(values.env.AMC_BIND, bindPort, parseOrigins(rendered));
    expect(() => admit(allowed, { host: "amc-amc:3212" })).not.toThrow();
    expect(() => admit(allowed, { host: "amc-amc:3212", origin: "http://amc-amc:3212",
      [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE, [NATIVE_CSRF_HEADER]: CSRF }, "POST")).not.toThrow();
    const bindOnly = nativeAllowedBrowserOrigins(values.env.AMC_BIND, bindPort);
    expect(() => admit(bindOnly, { host: "amc-amc:3212" })).toThrow(expect.objectContaining({ code: "NATIVE_HOST_DENIED" }));
  });

  it("an operator list in env.AMC_CORS_ALLOWED_ORIGINS is appended, not substituted", () => {
    const values = readYaml(`${chartDir}/values.yaml`);
    const withOperator = { ...values, env: { ...values.env, AMC_CORS_ALLOWED_ORIGINS: "https://amc.example.internal" } };
    const rendered = renderedCorsOrigins("prod", withOperator);
    expect(rendered).toBe("http://prod-amc:3212,https://amc.example.internal");
    const allowed = nativeAllowedBrowserOrigins(values.env.AMC_BIND, Number(values.env.AMC_STUDIO_PORT), parseOrigins(rendered));
    expect(() => admit(allowed, { host: "prod-amc:3212" })).not.toThrow();
    expect(() => admit(allowed, { host: "amc.example.internal" })).not.toThrow();
  });
});
