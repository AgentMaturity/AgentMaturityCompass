# GAP-0911 - ARES Dashboard Studio evidence drilldown boundary

- Gap: `GAP-0911`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Arnoldlarry15/ARES-Dashboard`, `https://github.com/Arnoldlarry15/ARES-Dashboard`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 16, Fork 7, Issues 0, Pull requests 6, 332 Commits, README.md, Code of conduct, Contributing, MIT license, Security, repository folders `.github`, `api`, `assets`, `components`, `config`, `database`, `docs`, `helm/ ares-dashboard`, `hooks`, `lib`, `prisma`, `public`, `repositories`, `scripts`, `services`, `tests`, `types`, and `utils`, and files including `.env.docker.example`, `.env.example`, `.gitignore`, `.prettierrc`, `.vercelignore`, `App.tsx`, `Dockerfile`, `LICENSE`, `README.md`, `SECURITY.md`, `constants.tsx`, `docker-compose.yml`, `eslint.config.js`, `index.css`, `index.html`, `index.tsx`, `metadata.json`, `package-lock.json`, `package.json`, `playwright.config.ts`, `prisma.config.ts`, `tsconfig.json`, `types.ts`, `vercel.json`, `vite-env.d.ts`, `vite.config.ts`, and `vitest.config.ts`.
- Status: Done

## Live source metadata

The live README identifies ARES Dashboard as an AI Red Team Operations Console for planning, executing, and auditing structured adversarial testing of AI systems across risk frameworks. Relevant source-review signals include role-based access control, audit logging, persistent campaign storage, AI-assisted scenario generation, demo mode, OWASP LLM Top 10, MITRE ATLAS, ATT&CK, SOC 2, ISO 27001, GDPR, campaign-based workflows, immutable logging, Team Workspaces, Auth0, Azure AD, Clerk, Okta, JWT, SSO, multi-tenant support, Google Gemini, JSON manifests, Vercel deployment, team collaboration, framework-aligned security research, activity feed, campaign sharing, and compliance-ready reporting.

 Source artifact links checked for the AMC drilldown boundary:

 - `https://github.com/Arnoldlarry15/ARES-Dashboard/blob/main/README.md`
 - `https://github.com/Arnoldlarry15/ARES-Dashboard/blob/main/SECURITY.md`
 - `https://github.com/Arnoldlarry15/ARES-Dashboard/tree/main/docs`
 - `https://github.com/Arnoldlarry15/ARES-Dashboard/tree/main/api`
 - `https://github.com/Arnoldlarry15/ARES-Dashboard/tree/main/components`
 - `https://github.com/Arnoldlarry15/ARES-Dashboard/blob/main/package.json`

Those facts are relevant to AMC only as Studio evidence drilldown context. They do not allow AMC to import ARES Dashboard UI, mirror its red-team console, reuse its Auth0/Azure AD/Clerk/Okta/JWT flows, ingest attack manifests, adopt its OWASP/MITRE framework model, run Google Gemini scenario generation, add its Helm deployment, or copy UI assets. For Score, Shield, and Watch, the relevant AMC requirement remains UI route, source artifact links, evidence preview, empty/error-state receipts, signed evidence refs, row hashes, and fail-closed missing-state behavior.

No upstream React/TypeScript code, CSS, API routes, Prisma schema, database config, auth config, JWT flows, Helm charts, Docker Compose files, Playwright config, red-team manifests, security scenarios, screenshots, UI assets, README prose beyond minimal metadata facts, deployment instructions, environment examples, or implementation details were copied into AMC.

## Relevance decision

`GAP-0911` is relevant to AMC as a Studio evidence drilldown boundary. ARES Dashboard confirms that red-team operations products need auditable evidence surfaces, but AMC should satisfy this through AMC-owned evidence drilldown routes and previews, not by adding another operations console.

The closure uses existing AMC `buildScoreEvidenceDrilldown` and Watch source artifact link primitives only. It does not add an ARES Dashboard adapter, red-team operations UI, Auth0/Azure AD/Clerk/Okta integration, JWT auth flow, Prisma schema, Google Gemini generator, OWASP/MITRE framework implementation, Helm chart, Docker deployment, Vercel deployment, or source-specific drilldown module.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing score finding evidence drilldowns with accepted/rejected evidence previews. |
| Shield | Relevant only when rejected evidence reasons and signed evidence prevent metadata-only red-team claims. |
| Watch | Relevant through source artifact links, preview hashes, empty/error states, and fail-closed drilldown behavior. |
| Enforce | No runtime red-team, auth, or framework policy changed. |
| Vault | No ARES data, credentials, JWT secrets, manifests, campaign records, database rows, or UI assets stored. |
| Fleet | Operations-console context only; no fleet topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks` behavior with a synthetic AMC-owned ARES-style drilldown lens. The positive path requires a UI route, source artifact links, evidence preview, accepted/rejected evidence, signed evidence, preview hashes, empty/error-state receipts, and row hash. The negative path proves that ARES Dashboard, AI Red Team Operations Console, structured adversarial testing, risk frameworks, role-based access control, audit logging, campaign storage, AI-assisted scenario generation, OWASP LLM Top 10, MITRE ATLAS, ATT&CK, SOC 2, ISO 27001, GDPR, Auth0, Azure AD, Clerk, Okta, JWT, SSO, Team Workspaces, Google Gemini, JSON manifests, and source identity alone fail closed without AMC-owned drilldown proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license, Star 16, Fork 7, Issues 0, Pull requests 6, 332 Commits, folder names, file names, AI Red Team Operations Console labels, structured adversarial testing labels, risk frameworks labels, role-based access control labels, audit logging labels, persistent campaign storage labels, AI-assisted scenario generation labels, OWASP LLM Top 10 labels, MITRE ATLAS labels, ATT&CK labels, SOC 2 labels, ISO 27001 labels, GDPR labels, Auth0 labels, Azure AD labels, Clerk labels, Okta labels, JWT labels, SSO labels, Team Workspaces labels, Google Gemini labels, JSON manifests labels, local backlog metadata, or source identity alone must fail closed for Studio evidence drilldown. Passing drilldown proof requires UI route, source artifact links, evidence preview, empty/error-state receipts, signed evidence refs, row hashes, and fail-closed missing-state behavior.

## No-bloat boundary

No ARES Dashboard adapter, red-team operations UI, campaign manager, attack-manifest exporter, Auth0 integration, Azure AD integration, Clerk integration, Okta integration, JWT auth flow, Prisma schema, database model, Google Gemini generator, OWASP/MITRE framework implementation, SOC2/ISO/GDPR reporter, Helm chart, Docker Compose runner, Vercel deployment path, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream React/TypeScript code, CSS, API routes, Prisma schema, database config, auth config, JWT flows, Helm charts, Docker Compose files, Playwright config, red-team manifests, security scenarios, screenshots, UI assets, README prose beyond minimal metadata facts, deployment instructions, environment examples, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0911AresDashboardStudioDrilldownBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the Studio drilldown behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0911AresDashboardStudioDrilldownBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0910KnowledgeGraphHybridRagQuestionExplainabilityBoundary.test.ts tests/gap0911AresDashboardStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
