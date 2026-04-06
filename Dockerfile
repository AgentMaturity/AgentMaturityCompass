FROM node:20-alpine AS build

LABEL org.opencontainers.image.source="https://github.com/thewisecrab/AgentMaturityCompass"
LABEL org.opencontainers.image.description="Agent Maturity Compass — The Credit Score for AI Agents"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /amc

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/thewisecrab/AgentMaturityCompass"
LABEL org.opencontainers.image.description="Agent Maturity Compass — The Credit Score for AI Agents"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /amc

COPY package.json package-lock.json ./
COPY README.md LICENSE ./
COPY --from=build /amc/dist/ ./dist/
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Make CLI available globally
RUN npm link 2>/dev/null || true

# Default workspace — writable for non-root user
RUN mkdir -p /workspace && chown 10001:10001 /workspace

# Non-root user for security
USER 10001:10001

WORKDIR /workspace

# Auto-generate a vault passphrase if not provided
ENV AMC_VAULT_PASSPHRASE="amc-docker-default-passphrase"

# Health check for Studio mode
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["amc", "studio", "healthcheck"]

ENTRYPOINT ["amc"]
CMD ["--help"]
