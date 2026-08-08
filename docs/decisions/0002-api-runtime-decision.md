# 0002: API runtime decision

- Status: Decision Pending
- Date: 2026-08-08

## Context

The current API is implemented on Fastify. Its hooks enforce the loopback,
origin, authentication, and response boundaries; route tests use Fastify
injection; plugins own cookies, multipart uploads, headers, and static serving;
and feature services integrate streaming, cancellation, provider adapters, and
safe error translation.

The repository owner has not selected a different long-term runtime. A runtime
migration is therefore not part of the current architecture cleanup.

## Current state

Fastify remains the implemented API runtime because no replacement has been
selected or authorized. This is existing repository behavior, not a long-term
runtime selection by this pending record. Ordinary work preserves that behavior
under the repository-wide current-state rule; this ADR does not govern work as
an accepted decision. Elysia or another runtime is not selected by this record.

Fastify currently provides mature plugin composition, request lifecycle hooks,
schema-compatible TypeScript integration, injection-based testing, streaming
responses, and one production server for the loopback API and built web app. Its
constraints include framework-specific hooks and plugins, a large composition
boundary, and migration cost that grows with route and lifecycle coverage.

## Criteria for a future decision

A proposed replacement must demonstrate a material benefit in maintainability,
correctness, performance, security, or operations against the current workload.
Evidence must cover feature parity, typed app-owned contracts, loopback/origin
and authentication hooks, multipart and bounded uploads, response streaming and
disconnect cleanup, provider routes, error sanitization, static production
serving, observability, dependency risk, and supported Node/tooling versions.

The migration plan must account for Fastify injection tests, middleware and
plugin replacement, authentication ordering, streaming semantics, provider
resource lifetimes, production startup/serving, incremental cutover or rollback,
and operational risk. Benchmark results alone are insufficient.

## Consequences

While the decision remains pending, the repository avoids an unproven
cross-cutting migration and preserves current runtime behavior. Some framework
coupling remains intentionally in the API composition and integration tests. A
future runtime choice remains open and requires an accepted ADR with migration
evidence before implementation.
