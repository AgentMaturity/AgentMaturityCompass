ARG NODE_IMAGE=node:20-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY vitest.config.ts ./vitest.config.ts

RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV AMC_WORKSPACE_DIR=/data/amc
ENV AMC_BIND=0.0.0.0
ENV AMC_STUDIO_PORT=3212
ENV AMC_GATEWAY_PORT=3210
ENV AMC_PROXY_PORT=3211
ENV AMC_TOOLHUB_PORT=3213

WORKDIR /app

RUN groupadd -g 10001 amc \
  && useradd -r -u 10001 -g 10001 amc

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY docker/entrypoint.sh /app/docker/entrypoint.sh

RUN chmod +x /app/docker/entrypoint.sh \
  && mkdir -p /data/amc \
  && chown -R 10001:10001 /app /data/amc

USER 10001:10001
VOLUME ["/data/amc"]
STOPSIGNAL SIGTERM

EXPOSE 3210 3211 3212 3213 4173

HEALTHCHECK --interval=30s --timeout=5s --retries=5 --start-period=20s CMD ["node", "dist/cli.js", "studio", "healthcheck", "--workspace", "/data/amc"]

ENTRYPOINT ["/app/docker/entrypoint.sh"]
