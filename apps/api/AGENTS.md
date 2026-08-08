# API application guide

This file adds API-specific guidance to the repository-wide `AGENTS.md`. Use
`docs/ARCHITECTURE.md`, `docs/PRIVACY_AND_TEMPORARY_DATA.md`, and the affected
user story for detailed contracts.

## Runtime and boundaries

- Fastify is the implemented runtime. Preserve the current loopback Host/Origin
  boundary and deny-by-default private API behavior.
- Route handlers validate app-owned contracts and delegate. Application services
  own sequencing; repositories own persistence; provider adapters own provider
  request, response, polling, and error formats.
- At API trust boundaries, browser bodies, queries, Host hashes, provider IDs,
  storage paths, and device IDs never select the authenticated owner.

## Providers, persistence, and lifecycle

- After a provider accepts a billable submission, another submission requires a
  new explicit action; adapters never switch to a fallback provider implicitly.
- Local filesystem storage, Drizzle/PostgreSQL/Neon persistence, and private R2
  byte storage have distinct responsibilities and mappings.
- Use reviewed forward migrations. Prefer additive, compatibility-preserving
  changes; any destructive step follows the repository stop and retention
  conditions.

## Validation

- Prefer focused Fastify integration tests and the API typecheck for narrow API
  work. Add repository or provider tests at the boundary whose contract changes.
- Use fakes for Neon and R2 in ordinary automated tests.
