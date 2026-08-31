# Lightframe Studio repository guide

## Scope

This file applies repository-wide; a nearer `AGENTS.md` may override it. The app
is local-first, loopback-oriented, and single-operator. Configuration-gated
cloud infrastructure does not imply public deployment, shared tenancy,
registration, billing, public sharing, or unrestricted provider use. Implement
current behavior, not a target state — unless the task is an approved roadmap
slice from `docs/roadmap/`, in which case implement exactly that approved scope.
Change the runtime, framework, persistence authority, provider, or deployment
model only when explicitly in scope.

## Read selectively

`CLAUDE.md` at the repository root is the short routing layer; this file is the long-form policy it
points to. Start with affected source and tests. Open only what the task needs:

- `README.md`: setup, scripts, and product overview;
- `docs/README.md`: documentation ownership;
- `docs/user-flows/`: current route-level user journeys, navigation, and known gaps;
- affected file in `docs/user-flows/feature-behavior/`: observable per-capability behavior;
- `docs/product/PRODUCT_VISION.md`: product positioning, principles, and MVP boundary;
- `docs/product/DOMAIN_MODEL.md`: canonical terminology, hierarchy, and deprecated names;
- `docs/roadmap/PRODUCT_ROADMAP.md`: approved direction; `docs/DECISIONS_REQUIRED.md`: open calls;
- `docs/ARCHITECTURE.md`: architecture and lifecycle ownership as built;
- `docs/architecture/TARGET_ARCHITECTURE.md`: where each layer is going;
- `docs/TESTING.md`: testing and release validation;
- `docs/PRIVACY_AND_TEMPORARY_DATA.md`: provider, privacy, and temporary data;
- `docs/CLOUD_PERSISTENCE.md`: cloud persistence and migrations;
- `docs/MANUAL_QA.md` and `docs/LIVE_PROVIDER_SMOKE.md`: live/device checks; and
- `LESSONS.md`: reusable engineering constraints. Superseded corpora were
  permanently removed on 2026-08-31 per
  `docs/audits/DOCUMENTATION_PRUNING_REPORT.md`; git history is the record.

Do not read every document by default. Historical plans are not current
implementation authority.

## Before editing

Trace the caller, owner, dependency, contract, cleanup path, and relevant tests.
Search for existing components, hooks, helpers, schemas, services, adapters, and
policies before creating one. Identify lifecycle, transaction, and trust
boundaries before moving code. Make the smallest coherent change; preserve
unrelated work and avoid speculative cleanup. Do not infer behavior from names,
stale plans, or visual resemblance.

## Code quality

- Give each module one cohesive responsibility. Split at ownership or lifecycle
  boundaries, not line counts.
- Prefer feature-local code. Share only across real consumers with matching
  semantics and lifecycle; never merge different cleanup, transaction,
  ownership, or trust boundaries.
- Keep React components presentation-focused and route handlers thin. Put
  product policy in domain rules or application orchestration.
- Do not duplicate HTTP contracts, domain policy, storage rules, provider
  normalization, or modal/media ownership.
- Do not add a dependency unless existing platform or repository utilities are
  insufficient. Verify callers and compatibility obligations before deleting
  code.
- Comments explain constraints or rationale. Do not hand-edit generated files.

## Repository boundaries

- `packages/domain`: pure product policy.
- `packages/contracts`: app-controlled runtime HTTP schemas.
- `apps/web`: browser presentation, orchestration, and adapters.
- `apps/api`: authentication, services, persistence, storage, and providers.
- Web must not import API implementation. Domain/contracts must not depend on
  React, browser APIs, persistence clients, or provider payloads.
- Map provider payloads, database records, domain models, and public contracts
  explicitly. See `docs/ARCHITECTURE.md` for details.

## Security, ownership, cost, and cleanup

- Keep permanent provider, authentication, database, and storage credentials
  server-side and out of `VITE_*`, bundles, logs, fixtures, screenshots, traces,
  and committed environment files. Only documented short-lived,
  model/origin-scoped credentials may enter the browser through validated
  app-owned contracts.
- Derive ownership from verified server identity, never browser IDs, storage
  paths, provider IDs, or device IDs.
- Provider work is explicit, bounded, normalized, and cancellable where
  supported. No automatic paid retry, fallback, or surprise traffic.
- Never expose raw provider bodies, errors, prompts, internal URLs,
  permanent/server credentials, causes, or arbitrary upstream codes.
- Resource creators own idempotent cleanup. Browser persistence is untrusted,
  validated, versioned, and migrated.

## Validation

Use the smallest set that proves the affected contract:

- review with no changes: no validation commands;
- documentation only, including security or persistence policy: affected
  formatting and documentation checks;
- narrow package: affected workspace typecheck and focused tests;
- domain/contracts: focused tests plus directly affected consumers;
- API route/service: focused API integration tests and API typecheck;
- UI behavior: focused component/controller tests; targeted E2E for its journey;
- visual/responsive: relevant visual cases only;
- database schema: existing generation, inspection, migration checks, and
  repository tests; never migrate production automatically;
- cross-package changes or high-risk executable/configuration changes to
  authentication, security, persistence, dependencies, tooling, or build:
  `bun run quality`; and
- release candidate: the full process in `README.md` and `docs/TESTING.md`.

CI remains the merge safety net. Never contact paid/live providers during
ordinary validation or claim a skipped, unavailable, or blocked check passed.

## Documentation

Update canonical docs only when behavior, contracts, commands, environment,
privacy, persistence, provider, or support boundaries change. Link instead of
duplicating. Internal refactors without observable or ownership changes need no
broad product-doc update.

## Completion

Report files changed, architectural decisions, validation/results, checks not
run and why, manual/live limits, and unresolved risks or assumptions.

## Stop conditions

Stop only for required public exposure, real accounts, billing, public sharing,
a new paid provider outside scope, secret access, a paid live call, destructive
or irreversible migration, deletion without relationship-safe retention, or
unavoidable overwriting of unrelated work. For ordinary ambiguity, inspect
current code, tests, and canonical docs and choose the narrowest conservative
interpretation.
