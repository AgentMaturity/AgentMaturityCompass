FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy source and build
COPY . .
RUN npm run build

RUN mkdir -p /data/amc

EXPOSE 3212 3210

CMD ["sh", "-lc", "if [ \"${AMC_BOOTSTRAP:-1}\" = \"1\" ]; then node dist/cli.js bootstrap --workspace /data/amc; fi; exec node dist/cli.js studio start --workspace /data/amc --bind 0.0.0.0 --port ${AMC_STUDIO_PORT:-3212}"]
