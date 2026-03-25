# Governance And Execution Plane

This part covers the subsystems that decide what AMC-governed activity is allowed to do, who can authorize it, how execution is bounded, and how operator identity attaches to that control path.

## What This Subsystem Family Is For

The governance and execution plane turns AMC from an evidence collector into a governed operating system for agent activity.

Its job is to:

- define and evaluate policy
- require approvals where autonomy needs to be bounded
- mint and verify leases for delegated execution
- govern plugins and extension loading
- attach identity, role, and session boundaries to human operators
- coordinate structured execution with tickets, work orders, and budgets

Without this plane, AMC could still observe and score. With it, AMC can shape and constrain what happens.

## Real Entrypoints And Data Or State Boundaries

### Primary Entrypoints

- `src/approvals/` implements approval APIs, policy evaluation, stores, quorum logic, and chains.
- `src/governor/` holds action-policy enforcement, confidence governors, canary modes, override logic, and reporting.
- `src/leases/` handles lease issuance, signing, verification, storage, and carrier mappings.
- `src/plugins/` manages plugin manifests, verification, registry flows, sandbox limits, and store behavior.
- `src/auth/` provides API keys, sessions, RBAC, password hashing, and auth-facing APIs.
- `src/identity/` extends identity into OIDC, SAML, SCIM, session handling, and host vault integration.
- `src/tickets/` and `src/workorders/` create structured execution artifacts.
- `src/budgets/budgets.ts` provides runtime budget control.

### State Boundaries

- Approval policies and approval chains form durable evidence about who allowed what.
- Lease artifacts define temporary authority for execution paths and provider access.
- Plugin registries, manifests, signatures, and verification logic define extension trust boundaries.
- Auth and identity state define who is allowed to operate the system and under what roles.
- Tickets, work orders, and budget controls shape execution once policy is no longer abstract.

This plane is where AMC's policy language becomes an actual runtime boundary.

## Runtime Flow

A common governance flow looks like this:

1. An operator or agent requests a governed action through the CLI, Studio, gateway path, or plugin workflow.
2. Policy logic checks whether the action is allowed outright, requires approval, needs a lease, or must be blocked.
3. If approvals are needed, the approval engine, policy engine, and quorum logic evaluate the request.
4. If delegated execution is allowed, AMC mints or verifies the lease that bounds that delegation.
5. If code or extensions are involved, plugin manifests and registries are checked before loading or installation.
6. Auth, identity, and session layers confirm the acting user or service boundary.
7. Tickets, work orders, and budgets coordinate or constrain the resulting work.
8. The trust and evidence plane records the result so later audits or verification can explain what happened.

This flow shows that governance in AMC is not only a reporting afterthought. It is wired into active execution paths.

## What Looks Mature Versus Thin Or Wrapper-Like

### Mature Or Core

- Approvals, leases, plugin verification, auth, and identity are real current-code surfaces.
- Governance is implemented as multiple cooperating modules, not as a single abstract policy file.
- The plugin subsystem is especially important because it combines governance, supply-chain trust, and runtime extension behavior.

### Real But Not Always First-Touch

- Tickets and work orders are implemented and matter for structured execution, but many first-time users will reach scoring or gateway flows before they reach these surfaces.
- Budgeting is a real control, even though it is less visible in top-level product language than scoring or assurance.

### Thin Or Secondary

- Some public narratives may describe governance families more broadly than the average operator uses them on day one.
- Wrapper surfaces such as CI actions or editor integrations may expose governance outcomes, but they are not where governance is actually decided.

## How It Connects To Adjacent Planes

- It constrains the **runtime and control plane** by deciding what paths are allowed or require supervision.
- It depends on the **trust and evidence plane** to preserve approval history, lease integrity, plugin verification evidence, and operator accountability.
- It influences the **evaluation and assurance plane** because governance maturity affects diagnostic scores, assurance findings, and compliance posture.
- It is surfaced through the **operations and ecosystem plane** when deploying AMC with enterprise auth, plugin ecosystems, or release governance.

Governance is therefore not a sidecar. It is a cross-cutting enforcement layer.

## Notable Current Inconsistencies Or Caveats

### The Vocabulary Is Dense

Approvals, governor, waivers, leases, budgets, tickets, work orders, plugins, identity, RBAC, and SSO all sit near each other. The underlying implementation is coherent, but the documentation vocabulary can feel heavier than the runtime flow itself.

### Some Governance Surfaces Depend On A More Persistent Deployment Model

A quick local score can happen without deep auth or long-lived approval workflows. Hosted or enterprise-shaped deployments reveal more of the governance plane's real weight.

### Public Packaging Can Over-Productize What Is Really One Control Layer

Readers should avoid assuming each governance label maps to a separate subsystem family with separate persistence and routing rules. In practice, many of these capabilities cooperate inside the same TypeScript runtime and trust stack.

### Governance Quality Depends On Adoption Depth

AMC includes real enforcement surfaces, but the strength of the governance story depends on whether operators actually route actions, credentials, plugins, and delegated work through them.
