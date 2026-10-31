import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { checkImagePins } from "../scripts/check-image-pins.mjs";

const DIGEST = `sha256:${"a".repeat(64)}`;
const QUICKSTART_OK = `ARG NODE_IMAGE=node:22-bookworm-slim@${DIGEST}\nFROM \${NODE_IMAGE}\nRUN echo "\${AMC_TGZ_SHA256}  /tmp/amc.tgz" | sha256sum -c -\n`;
const trees: string[] = [];

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "amc-image-pins-"));
  trees.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

afterEach(() => {
  for (const root of trees.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("P0-35 check-image-pins", () => {
  test("a FROM on a floating tag fails", () => {
    const { errors } = checkImagePins(tree({ Dockerfile: "FROM node:22-bookworm-slim\n" }));
    expect(errors).toEqual(["Dockerfile:1 FROM node:22-bookworm-slim is not pinned by @sha256:<64 hex>"]);
  });

  test("FROM ${VAR} fails when the ARG default is a floating tag", () => {
    const { errors } = checkImagePins(tree({ Dockerfile: "ARG NODE_IMAGE=node:22-bookworm-slim\nFROM ${NODE_IMAGE} AS base\n" }));
    expect(errors).toEqual([
      "Dockerfile:1 ARG NODE_IMAGE default node:22-bookworm-slim is not pinned by @sha256:<64 hex>",
      "Dockerfile:2 FROM ${NODE_IMAGE} resolves to node:22-bookworm-slim, which is not pinned by @sha256:<64 hex>"
    ]);
  });

  test("FROM ${VAR} fails when the ARG has no default or is undeclared", () => {
    const { errors } = checkImagePins(tree({ Dockerfile: "ARG BASE\nFROM ${BASE}\nFROM $OTHER\n" }));
    expect(errors).toEqual([
      "Dockerfile:2 FROM ${BASE} has no pinned ARG default",
      "Dockerfile:3 FROM $OTHER has no pinned ARG default"
    ]);
  });

  test("a short or tag-only digest and an unpinned syntax frontend fail", () => {
    const { errors } = checkImagePins(tree({
      Dockerfile: "# syntax=docker/dockerfile:1\nFROM node@sha256:abc\nFROM node:22@sha256:" + "A".repeat(64) + "\n"
    }));
    expect(errors).toHaveLength(3);
    expect(errors[0]).toBe("Dockerfile:1 # syntax=docker/dockerfile:1 is not pinned by @sha256:<64 hex>");
  });

  test("pinned FROM, pinned ARG defaults, stage references, scratch and --platform pass", () => {
    const result = checkImagePins(tree({
      Dockerfile: [
        `# syntax=docker/dockerfile:1@${DIGEST}`,
        `ARG NODE_IMAGE="node:22-bookworm-slim@${DIGEST}"`,
        "FROM ${NODE_IMAGE} AS native-tools",
        "FROM native-tools AS build",
        `from --platform=$BUILDPLATFORM node@${DIGEST} as Tools`,
        "FROM tools",
        "FROM $NODE_IMAGE",
        "FROM scratch",
        ""
      ].join("\n"),
      "docker/Dockerfile.quickstart": QUICKSTART_OK
    }));
    expect(result).toEqual({ files: ["Dockerfile", "docker/Dockerfile.quickstart"], errors: [] });
  });

  test("scans docker/*Dockerfile* and deploy/**/Dockerfile*, joining continuation lines", () => {
    const { files, errors } = checkImagePins(tree({
      "docker/Dockerfile.quickstart": QUICKSTART_OK,
      "docker/README.md": "FROM node:22\n",
      "deploy/compose/nested/Dockerfile.api": "FROM \\\n  node:22-bookworm-slim\n"
    }));
    expect(files).toEqual(["deploy/compose/nested/Dockerfile.api", "docker/Dockerfile.quickstart"]);
    expect(errors).toEqual(["deploy/compose/nested/Dockerfile.api:1 FROM node:22-bookworm-slim is not pinned by @sha256:<64 hex>"]);
  });

  test("a quickstart without a sha256sum -c tarball check fails, also when it is only in a comment", () => {
    const pinned = `FROM node:22-bookworm-slim@${DIGEST}\nRUN npm i -g /tmp/amc.tgz\n`;
    for (const text of [pinned, `${pinned}# RUN sha256sum -c -\n`]) {
      const { errors } = checkImagePins(tree({ "docker/Dockerfile.quickstart": text }));
      expect(errors).toEqual(["docker/Dockerfile.quickstart does not verify its tarball with sha256sum -c"]);
    }
  });

  test("a tree with no Dockerfile fails closed", () => {
    expect(checkImagePins(tree({ "README.md": "none\n" })).errors).toEqual(["no Dockerfile found to check"]);
  });

  test("the repository's own Dockerfiles pass", () => {
    const result = checkImagePins(resolve(__dirname, ".."));
    expect(result.files).toEqual(["Dockerfile", "docker/Dockerfile.quickstart"]);
    expect(result.errors).toEqual([]);
  });
});
