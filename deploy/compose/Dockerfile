FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy source and build
COPY . .
RUN npm run build

# Initialize workspace
RUN node dist/cli.js init 2>/dev/null || true

EXPOSE 3212 3210

CMD ["node", "dist/cli.js", "up", "--non-interactive"]
