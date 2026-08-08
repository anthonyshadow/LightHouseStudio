# Lightframe Studio repository guide

## Scope

This file applies repository-wide. A nearer `AGENTS.md` may add or override
instructions for its subtree.

Lightframe Studio is currently a local-first, single-operator application.
Do not infer public deployment, shared tenancy, real account registration,
billing, public sharing, or unrestricted provider use from configuration-gated
cloud infrastructure.

Implement current repository behavior, not unimplemented target-state plans.
Do not change the runtime, framework, persistence authority, provider, or
deployment model unless the task explicitly includes that change.

## Read selectively

Start with the affected source and its tests. Read only the documentation
needed for the task:

- Setup, scripts, and product overview: `README.md`
- Documentation ownership map: `docs/README.md`
- Architecture and lifecycle ownership: `docs/ARCHITECTURE.md`
- Observable product behavior: the affected file in `docs/userStories/`
- Testing and release validation: `docs/TESTING.md`
- Provider and temporary-data boundaries:
  `docs/PRIVACY_AND_TEMPORARY_DATA.md`
- Cloud persistence and migrations: `docs/CLOUD_PERSISTENCE.md`
- Live or physical-device validation: `docs/LIVE_PROVIDER_SMOKE.md` and
  `docs/MANUAL_QA.md`

Do not read every document by default. Historical plans and lessons explain
rationale but are not current implementation authority.

## Before editing

1. Inspect the complete affected path: caller, owner, dependency, contract,
   cleanup path, and relevant tests.
2. Search for an existing component, hook, helper, schema, service, adapter,
   or policy before creating another one.
3. Identify the lifecycle, transaction, and trust boundary before moving or
   combining code.
4. Make the smallest coherent change that satisfies the requested behavior.
5. Preserve unrelated user changes and do not perform speculative cleanup.

Do not infer behavior from filenames, stale plans, or visual resemblance alone.

## Code quality

- Keep each module responsible for one cohesive behavior or lifecycle.
- Split code at ownership or lifecycle boundaries, not arbitrary line counts.
- Prefer feature-local code. Extract shared code only when multiple real
  consumers have the same semantics and lifecycle.
- Do not combine superficially similar code with different trust,
  transaction, cleanup, or ownership requirements.
- Keep React components presentation-focused and route handlers thin.
- Keep product policy in domain rules or application orchestration.
- Do not duplicate HTTP contracts, domain policy, storage ownership rules, or
  provider normalization.
- Do not add a dependency unless existing platform or repository utilities are
  insufficient.
- Remove dead code only when its lack of callers and compatibility obligations
  have been verified.
- Comments should explain constraints or rationale, not restate the code.
- Do not hand-edit generated artifacts.

## Repository boundaries

- `packages/domain` owns pure product policy.
- `packages/contracts` owns app-controlled runtime HTTP schemas.
- `apps/web` owns browser presentation, orchestration, and browser adapters.
- `apps/api` owns authentication, application services, persistence, storage,
  and provider adapters.
- Web code must not import API implementation code.
- Domain and contracts must not depend on React, browser APIs, persistence
  clients, or provider payloads.
- Database schemas, provider payloads, and public HTTP contracts are separate
  representations and require explicit mapping.

## Security, ownership, and cost

- Permanent credentials remain server-side and never enter `VITE_*`, browser
  bundles, logs, fixtures, screenshots, traces, or committed environment files.
- Authenticated ownership comes only from verified server identity, never from
  browser-supplied user IDs, storage paths, provider IDs, or device IDs.
- Provider calls must be explicit, bounded, safely normalized, and cancellable
  where supported.
- Do not introduce automatic paid retries, provider fallback, or surprise
  external traffic.
- Do not expose raw provider errors, bodies, prompts, URLs, credentials, or
  arbitrary upstream codes.
- The creator of a stream, track, timer, worker, listener, object URL, audio
  context, temporary file, or provider client owns idempotent cleanup.
- Browser storage is untrusted and must be validated, versioned, and migrated.

## Validation

Use the smallest validation set that proves the affected contract:

- Investigation or review with no changes: no validation commands.
- Documentation-only change: run documentation checks and formatting for the
  affected files.
- Narrow package change: run the affected workspace typecheck and focused
  tests.
- Domain or contract change: run its focused tests plus every directly affected
  consumer test.
- API change: run focused API integration tests and the affected typecheck.
- UI behavior change: run focused component/controller tests; use targeted E2E
  for an observable journey.
- Visual or responsive change: run the relevant visual cases. Do not run the
  full visual suite for nonvisual work.
- Database schema change: run the existing migration generation, inspection,
  checking, and repository tests. Never migrate production automatically.
- Cross-package, authentication, security, persistence, dependency, build, or
  pre-merge change: run `pnpm quality`.
- Release validation: follow `README.md` and `docs/TESTING.md`.

Never contact paid or live providers from ordinary automated validation.
Never claim a check passed when it was skipped, unavailable, or blocked.

## Documentation

Update only the canonical documents affected by an actual behavior, contract,
command, environment, privacy, persistence, provider, or support-boundary
change. Link to existing documentation instead of repeating it.

Do not update product documentation for an internal refactor that leaves all
observable behavior and documented ownership unchanged.

## Completion

Report:

- files changed;
- important architectural decisions;
- validation run and its result;
- checks not run and why;
- remaining manual or live limitations;
- unresolved risks or assumptions.

## Stop conditions

Stop only when completing the task requires:

- public exposure, real accounts, billing, public sharing, or a new paid
  provider outside the requested scope;
- secret access or a paid live call;
- destructive or irreversible data migration;
- deletion without an established relationship-safe retention policy; or
- overwriting unrelated user changes that cannot be preserved.

For ordinary ambiguity, inspect the current code, tests, and canonical
documentation and choose the narrowest conservative interpretation.