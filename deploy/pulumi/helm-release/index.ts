import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

const kubeconfig = config.getSecret("kubeconfig");
const kubeContext = config.get("kubeContext");
const providerArgs: k8s.ProviderArgs = {};

if (kubeconfig) {
  providerArgs.kubeconfig = kubeconfig;
}

if (kubeContext) {
  providerArgs.context = kubeContext;
}

const provider = new k8s.Provider("amc-k8s", providerArgs);

const releaseName = config.get("releaseName") ?? "amc";
const namespace = config.get("namespace") ?? "amc-system";
const chartPath = config.get("chartPath") ?? "../../helm/amc";
const imageRepository = config.get("imageRepository") ?? "ghcr.io/your-org/amc-studio";
const imageTag = config.get("imageTag") ?? "latest";
// sha256:<64 hex>; when set the chart deploys repository@digest and ignores the tag.
const imageDigest = config.get("imageDigest") ?? "";
if (!/^(sha256:[a-f0-9]{64})?$/.test(imageDigest)) {
  throw new Error("imageDigest must be empty or sha256:<64 lowercase hex>");
}
const imagePullPolicy = config.get("imagePullPolicy") ?? "IfNotPresent";
const replicaCount = config.getNumber("replicaCount") ?? 1;
const bootstrapSecretName = config.get("bootstrapSecretName") ?? "amc-bootstrap";
const ingressEnabled = config.getBoolean("ingressEnabled") ?? false;
const ingressClassName = config.get("ingressClassName") ?? "";
const ingressHost = config.get("ingressHost") ?? "amc.example.com";
const ingressTlsSecretName = config.get("ingressTlsSecretName") ?? "";
const storageClassName = config.get("storageClassName") ?? "";
const workspaceStorageSize = config.get("workspaceStorageSize") ?? "10Gi";
const timeoutSeconds = config.getNumber("timeoutSeconds") ?? 600;
const valuesFiles = config.getObject<string[]>("valuesFiles") ?? [];

const inlineValues: Record<string, unknown> = {
  replicaCount,
  image: {
    repository: imageRepository,
    tag: imageTag,
    digest: imageDigest,
    pullPolicy: imagePullPolicy
  },
  ingress: {
    enabled: ingressEnabled,
    className: ingressClassName,
    hosts: [
      {
        host: ingressHost,
        paths: [{ path: "/", pathType: "Prefix" }]
      }
    ],
    tls: ingressTlsSecretName
      ? [
          {
            secretName: ingressTlsSecretName,
            hosts: [ingressHost]
          }
        ]
      : []
  },
  workspace: {
    persistence: {
      enabled: true,
      storageClassName,
      size: workspaceStorageSize
    }
  },
  bootstrap: {
    enabled: true,
    ownerUsernameSecret: { name: bootstrapSecretName, key: "ownerUsername" },
    ownerPasswordSecret: { name: bootstrapSecretName, key: "ownerPassword" },
    vaultPassphraseSecret: { name: bootstrapSecretName, key: "vaultPassphrase" }
  },
  notary: {
    passphraseSecret: { name: bootstrapSecretName, key: "notaryPassphrase" },
    authSecret: { name: bootstrapSecretName, key: "notaryAuthSecret" }
  }
};

const valueYamlFiles = valuesFiles.map((path) => new pulumi.asset.FileAsset(path));

const release = new k8s.helm.v3.Release(
  "amc",
  {
    name: releaseName,
    namespace,
    chart: chartPath,
    createNamespace: true,
    atomic: true,
    cleanupOnFail: true,
    lint: true,
    wait: true,
    timeout: timeoutSeconds,
    skipAwait: false,
    values: inlineValues,
    valueYamlFiles
  },
  { provider }
);

export const amcReleaseName = release.name;
export const amcNamespace = release.namespace;
export const amcChart = chartPath;
// The chart names resources "<release>-amc" (templates/_helpers.tpl amc.fullname).
export const amcLocalPortForward = pulumi.interpolate`kubectl -n ${release.namespace} port-forward svc/${release.name}-amc 3212:3212`;
