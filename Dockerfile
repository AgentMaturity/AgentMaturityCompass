FROM node:20-alpine AS build

LABEL org.opencontainers.image.source="https://github.com/AgentMaturity/AgentMaturityCompass"
LABEL org.opencontainers.image.description="Agent Maturity Compass — The Credit Score for AI Agents"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /amc

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/AgentMaturity/AgentMaturityCompass"
LABEL org.opencontainers.image.description="Agent Maturity Compass — The Credit Score for AI Agents"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /amc

COPY package.json package-lock.json ./
COPY README.md LICENSE ./
COPY --from=build /amc/dist/ ./dist/
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Make CLI available globally
RUN npm link 2>/dev/null || true

# Default workspaces — writable for non-root user.
# Studio bootstrap uses /data/amc while ad hoc CLI use defaults to /workspace.
RUN mkdir -p /workspace /data/amc && chown -R 10001:10001 /workspace /data/amc

# Non-root user for security
USER 10001:10001

WORKDIR /workspace

# The vault passphrase MUST be supplied at run time.
#
# This image previously baked a fixed default, so every container that did not
# override it encrypted its vault — holding the auditor key that signs evidence
# and certificates — with a passphrase published in this repository. Anyone with
# the image could decrypt any such vault.
#
# Supply one instead:
#   docker run -e AMC_VAULT_PASSPHRASE="$(openssl rand -base64 32)" ...
# or mount a secret and use AMC_VAULT_PASSPHRASE_FILE.

# Health check for Studio mode
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["amc", "studio", "healthcheck"]

ENTRYPOINT ["amc"]
CMD ["--help"]
