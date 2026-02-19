# AMC Installation Guide

## System Requirements

| Component | Minimum |
|-----------|---------|
| Node.js | ≥ 20 |
| RAM | 512 MB |
| Disk | 100 MB + evidence storage |
| OS | macOS, Linux (Ubuntu/Debian, RHEL/CentOS), Windows (WSL2) |

## Option A: npm Global Install

```bash
npm i -g agent-maturity-compass
amc setup --demo    # demo workspace with sample data
# or
amc init            # empty production workspace
```

## Option B: From GitHub (Development)

```bash
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass
npm ci
npm run build
npm link            # makes `amc` available globally
```

Verify:

```bash
amc --version
amc doctor
```

## Option C: Docker Compose

```bash
git clone https://github.com/thewisecrab/AgentMaturityCompass.git
cd AgentMaturityCompass/deploy/compose
cp .env.example .env    # edit secrets, ports, volumes
docker compose up -d --build
```

Studio available at `http://localhost:3212`. Gateway at `http://localhost:3210`.

For TLS termination (production):

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build
```

## Option D: Kubernetes (Helm)

```bash
helm install amc deploy/helm/amc \
  --set studio.replicas=2 \
  --set gateway.replicas=3 \
  --set persistence.size=10Gi
```

Validate the chart first:

```bash
helm lint deploy/helm/amc
helm template amc deploy/helm/amc
```

See `deploy/helm/amc/values.yaml` for all configurable values.

## Platform-Specific Notes

### macOS

```bash
brew install node@22
npm i -g agent-maturity-compass
```

### Ubuntu / Debian

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
npm i -g agent-maturity-compass
```

### RHEL / CentOS

```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo yum install -y nodejs
npm i -g agent-maturity-compass
```

### Windows (WSL2)

Install WSL2 with Ubuntu, then follow the Ubuntu instructions above. Native Windows is not supported.

## Post-Install Verification

```bash
amc --version       # prints version
amc doctor          # checks all dependencies and workspace health
amc doctor-fix      # auto-repairs common issues
```

## Upgrading

```bash
# npm
npm update -g agent-maturity-compass

# GitHub
cd AgentMaturityCompass && git pull && npm ci && npm run build

# Docker
cd deploy/compose && docker compose pull && docker compose up -d --build

# Helm
helm upgrade amc deploy/helm/amc
```

## Uninstalling

```bash
npm uninstall -g agent-maturity-compass
rm -rf .amc/    # removes workspace data (back up first!)
```
