FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/thewisecrab/AgentMaturityCompass"
LABEL org.opencontainers.image.description="Agent Maturity Compass — The Credit Score for AI Agents"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /amc

# Copy built package
COPY package.json package-lock.json ./
COPY dist/ ./dist/
COPY README.md LICENSE ./

# Install production deps only
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Make CLI available globally
RUN npm link 2>/dev/null || true

# Non-root user for security
USER 10001:10001

# Default workspace
WORKDIR /workspace

# Auto-generate a vault passphrase if not provided
ENV AMC_VAULT_PASSPHRASE="amc-docker-default-passphrase"

# Health check for Studio mode
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["amc", "studio", "healthcheck"]

ENTRYPOINT ["amc"]
CMD ["--help"]
