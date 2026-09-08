# syntax=docker/dockerfile:1
# Build from the repository root: --target studio (default) or --target runner.
# Override NODE_IMAGE with a reviewed digest to pin the operating-system image.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS native-tools
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM native-tools AS build
WORKDIR /build/amc
ENV CI=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json README.md LICENSE THIRD_PARTY_NOTICES ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"
# All workspace members and lifecycle/build scripts are required by the frozen install.
COPY vendor/ vendor/
COPY packages/ packages/
COPY scripts/ scripts/
RUN pnpm install --frozen-lockfile
COPY src/ src/
COPY fixtures/policy/ fixtures/policy/
RUN pnpm run build
# The separate release/prepack gate is NOT exercised by this source image build.
# This packs the actual publish file set, including bundled kernel + notices.
RUN mkdir /out \
    && npm pack --ignore-scripts --pack-destination /out \
    && mv /out/agent-maturity-compass-*.tgz /out/amc.tgz \
    && cd /out && sha256sum amc.tgz > amc.tgz.sha256

FROM native-tools AS install
WORKDIR /opt/amc
ENV CI=1
# No source checkout, private workspace package, or build node_modules enters this stage.
COPY --from=build /out/amc.tgz /tmp/amc.tgz
RUN npm install --omit=dev --no-audit --no-fund /tmp/amc.tgz \
    && npm ls --omit=dev \
    && node -e 'new (require("better-sqlite3"))(":memory:").close()' \
    && node -e 'try { require.resolve("@amc/core"); process.exit(1) } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e }' \
    && ./node_modules/.bin/amc --help > /dev/null
COPY --from=build /out/amc.tgz.sha256 /opt/amc/artifact.sha256

FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.source="https://github.com/AgentMaturity/AgentMaturityCompass" \
      org.opencontainers.image.description="Agent Maturity Compass — governed runtime and evidence verification" \
      org.opencontainers.image.licenses="MIT"
RUN apt-get update && apt-get install -y --no-install-recommends bash ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=install /opt/amc/ /opt/amc/
RUN ln -s /opt/amc/node_modules/.bin/amc /usr/local/bin/amc \
    && groupadd --gid 10001 amc \
    && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash amc \
    && mkdir -p /workspace /data/amc /data/notary \
    && chown -R 10001:10001 /workspace /data/amc /data/notary /home/amc
ENV NODE_ENV=production HOME=/home/amc
USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["amc"]
CMD ["--help"]

FROM runtime AS runner
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv git curl jq \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3 /usr/local/bin/python
USER 10001:10001
LABEL org.opencontainers.image.title="amc-runner"

# Studio is the default target. No arguments starts Studio; explicit arguments
# retain normal `amc <args>` CLI behavior (including notary and --help).
FROM runtime AS studio
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/amc-entrypoint
ENV AMC_WORKSPACE_DIR=/data/amc
EXPOSE 3210 3211 3212 3213 4173
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD ["amc", "studio", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/amc-entrypoint"]
CMD []
