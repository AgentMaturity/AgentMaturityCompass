import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { chartDir, mergeValues, read, readYaml } from "./helpers/deployPackFixtures.js";

// Static template assertions: helm is not installed on every test host. The P2-06 receipt records the
// helm template renders (metrics on and off, PDB variants) run with helm itself.
const values = readYaml(`${chartDir}/values.yaml`);
const guarded = (path: string) => {
  const text = read(`${chartDir}/templates/${path}`);
  const lines = text.split("\n");
  return { text, lines };
};

describe("helm chart metrics (P2-06)", () => {
  it("metrics are off by default with port 9464 and the monitoring namespace as the only scraper", () => {
    expect(values.metrics).toMatchObject({ enabled: false, port: 9464, serviceMonitor: { enabled: false }, prometheusRule: { enabled: false } });
    expect(values.metrics.namespaceSelector).toEqual({ matchLabels: { "kubernetes.io/metadata.name": "monitoring" } });
  });

  it("enabled renders the metrics port on the container, the Service and a NetworkPolicy rule; disabled renders none", () => {
    for (const path of ["deployment.yaml", "service.yaml", "networkpolicy.yaml", "configmap.yaml"]) {
      const { text } = guarded(path);
      const start = text.indexOf("{{- if .Values.metrics.enabled }}");
      expect(start, path).toBeGreaterThan(0);
      const block = text.slice(start, text.indexOf("{{- end }}", start));
      expect(block, path).toMatch(/metrics/);
      // Outside the guarded block nothing names the metrics port.
      expect(text.slice(0, start) + text.slice(text.indexOf("{{- end }}", start)), path).not.toMatch(/\.Values\.metrics\.port|AMC_METRICS/);
    }
    const policy = guarded("networkpolicy.yaml").text;
    const rule = policy.slice(policy.indexOf("{{- if .Values.metrics.enabled }}"));
    expect(rule).toContain("toYaml .Values.metrics.namespaceSelector");
    expect(rule).toContain("port: {{ .Values.metrics.port }}");
    const config = guarded("configmap.yaml").text;
    expect(config).toContain('AMC_METRICS_BIND: "0.0.0.0"');
    expect(read(`${chartDir}/templates/service.yaml`)).not.toMatch(/type: (NodePort|LoadBalancer)/);
  });

  it("ServiceMonitor and PrometheusRule render only with metrics.enabled and their own switch", () => {
    for (const [path, flag] of [["servicemonitor.yaml", "serviceMonitor"], ["prometheusrule.yaml", "prometheusRule"]]) {
      const { lines } = guarded(path);
      expect(lines[0]).toBe(`{{- if and .Values.metrics.enabled .Values.metrics.${flag}.enabled }}`);
    }
    const rules = read(`${chartDir}/templates/prometheusrule.yaml`);
    for (const metric of ["up{", "amc_db_size_bytes", "amc_gateway_failures_total"]) expect(rules).toContain(metric);
  });

  it("PDB values render as configured: exactly one of maxUnavailable and minAvailable", () => {
    expect(values.podDisruptionBudget).toEqual({ enabled: true, maxUnavailable: 1, minAvailable: null });
    const pdb = read(`${chartDir}/templates/poddisruptionbudget.yaml`);
    expect(pdb).toContain('{{- if eq (kindIs "invalid" $pdb.minAvailable) (kindIs "invalid" $pdb.maxUnavailable) }}');
    expect(pdb).toContain("maxUnavailable: {{ $pdb.maxUnavailable }}");
    expect(pdb).toContain("minAvailable: {{ $pdb.minAvailable }}");
  });

  it("schema accepts the shipped values and rejects a bad metrics port", () => {
    const validate = new Ajv({ allErrors: true }).compile(JSON.parse(read(`${chartDir}/values.schema.json`)));
    expect(validate(values)).toBe(true);
    expect(validate(mergeValues(values, { metrics: { enabled: true, port: 0 } }))).toBe(false);
    expect(validate(mergeValues(values, { metrics: { enabled: "yes" } }))).toBe(false);
  });
});
