# AMC source container images

Run build commands from the repository root. One Dockerfile builds two targets:

```bash
docker build --target studio -t amc-studio:local .
docker build --target runner -t amc-runner:local .
```

`studio` is also the default target. It starts Studio when no arguments are given; explicit arguments still run `amc <args>`. The `runner` target defaults to `amc --help` and includes Python, Git, curl and jq. The former `Dockerfile.runner` and `deploy/compose/Dockerfile` were replaced by these targets; update scripts that reference those removed files.

```bash
docker run --rm amc-studio:local --help
docker run --rm amc-runner:local --version
docker run --rm --entrypoint python amc-runner:local --version
```

The source build uses the package-manager version from `package.json` and `pnpm install --frozen-lockfile`, builds the kernel bundle, then packs the npm artifact. A separate stage installs that exact tarball with production dependencies. Final images contain the installed package and its bundled-runtime notices, without the source checkout, private workspace packages or build tools. The tarball checksum is `/opt/amc/artifact.sha256`; npm's installed lockfile is `/opt/amc/package-lock.json`.

The npm production install resolves external dependency ranges when the image is built. The frozen source lock and tarball checksum do not make the entire runtime dependency tree or operating-system image reproducible. Set `--build-arg NODE_IMAGE=node:22-bookworm-slim@sha256:<reviewed-digest>` to pin a reviewed base image. Native dependencies are installed for the builder's target platform; qualify each published platform separately.

## Studio with persistent state

Create three local secret files in `deploy/compose/secrets/` before starting: `amc_vault_passphrase.txt`, `amc_owner_username.txt`, and `amc_owner_password.txt`. Supply your own values; the `.example` files are templates. These local files are excluded from the Docker build context. Make mounted files readable to UID 10001 while protecting access on the host.

```bash
docker run --rm \
  -p 3210:3210 -p 3211:3211 -p 3212:3212 \
  --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --tmpfs /tmp --tmpfs /home/amc:uid=10001,gid=10001,mode=0700 \
  -e AMC_BOOTSTRAP=1 \
  -e AMC_BIND=0.0.0.0 \
  -e AMC_ALLOWED_CIDRS=127.0.0.1/32,::1/128,172.16.0.0/12,10.0.0.0/8,192.168.0.0/16 \
  -e AMC_VAULT_PASSPHRASE_FILE=/run/secrets/amc_vault_passphrase \
  -e AMC_BOOTSTRAP_OWNER_USERNAME_FILE=/run/secrets/amc_owner_username \
  -e AMC_BOOTSTRAP_OWNER_PASSWORD_FILE=/run/secrets/amc_owner_password \
  -v amc_data:/data/amc \
  -v "$(pwd)/deploy/compose/secrets/amc_vault_passphrase.txt:/run/secrets/amc_vault_passphrase:ro" \
  -v "$(pwd)/deploy/compose/secrets/amc_owner_username.txt:/run/secrets/amc_owner_username:ro" \
  -v "$(pwd)/deploy/compose/secrets/amc_owner_password.txt:/run/secrets/amc_owner_password:ro" \
  amc-studio:local
```

Studio defaults to bootstrap mode and stops if bootstrap fails. Keep the same data volume and vault secret across restarts. For an already initialized workspace, `AMC_BOOTSTRAP=0` skips bootstrap. Secret values are supplied only at runtime. The example allows private-network client addresses through Docker networking; narrow `AMC_ALLOWED_CIDRS` to your deployment. LAN pairing and authentication remain enabled; open `http://localhost:3212/console` and follow the pairing flow.

The image owns `/data/amc`, `/data/notary`, `/workspace`, and `/home/amc` as UID/GID 10001. Named volumes inherit the image directory ownership on first use. Host bind mounts must already be writable by that user. Read-only root filesystems need the writable data volume and temporary home shown above. An existing volume owned by a different UID needs an operator-managed ownership adjustment before startup; the entrypoint does not run as root or change host permissions.

The healthcheck uses the installed command `amc studio healthcheck`, which checks `/healthz` and `/readyz`. Explicit CLI mode, such as `amc-studio:local notary start ...`, bypasses Studio bootstrap; disable the Studio healthcheck for long-running non-Studio commands. TLS Compose does this for its notary service.

## Compose

The HTTP and TLS definitions both build the canonical `studio` target and mount runtime secrets:

```bash
docker compose -f deploy/compose/docker-compose.yml up -d --build
# TLS/notary setup also needs the additional secrets described in deploy/compose/README.md.
docker compose -f deploy/compose/docker-compose.tls.yml up -d --build
```

The TLS/notary stack has an additional pre-existing listen-address qualification gap documented in [the Compose guide](../deploy/compose/README.md); the shared Studio smoke disables notary and does not qualify that stack.

The convenience `docker/docker-compose.yml` also builds locally. Registry publication remains a separate verification; these commands do not require an unverified public image.

## Qualification

After building both local targets on a Linux Docker engine:

```bash
node scripts/container-smoke.mjs \
  --studio-image amc-studio:local --runner-image amc-runner:local \
  --out tmp/container-smoke.json
```

The check creates and removes its own temporary containers, volumes and runtime secret files. It checks non-root execution, native SQLite, private-workspace absence, bundled-runtime notices, default Studio startup, anonymous refusal/authenticated access, persistent restart, and keyless tool runs with cold signed-ledger and request-reconstruction verdicts. Runner verification uses separate containers against a persistent workspace. It does not call real providers or publish images. Docker CI invokes this check before its publication steps.

Studio's gateway seals its session during orderly shutdown. The check therefore stops its disposable Studio container before invoking both cold verifiers from fresh containers with networking disabled and only the vault secret mounted. It repeats verification after restart, then confirms that an abrupt shutdown leaves an unsealed session which both verifiers reject. Live health and completed evidence verification are separate checks.

Requested image references are resolved to immutable image IDs before any runtime check. The receipt retains these IDs, verifier results and cleanup outcomes; failed cleanup fails the check while remaining cleanup is still attempted. Source tests and archive inspection do not replace Linux execution, and a result applies only to the tested images and architecture. Image packing uses `npm pack --ignore-scripts`; the independent prepack/release gate still has to pass before release.

Implementation references: [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/), [pnpm 10 Docker recipes](https://pnpm.io/10.x/docker), and [Compose build targets and contexts](https://docs.docker.com/reference/compose-file/build/).
