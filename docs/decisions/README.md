# Architecture decision records

Architecture decision records (ADRs) capture decisions that are expensive to
reverse and affect durable boundaries such as runtimes, ownership, persistence,
security, deployment, or cross-package dependencies.

Create an ADR when a change selects or materially revises one of those
boundaries, especially when several viable alternatives have meaningful
migration cost. Do not create one for ordinary implementation details, focused
features, small refactors, dependency patching, or choices already governed by
an accepted ADR.

Use a four-digit sequence and a short kebab-case title, for example
`0003-job-execution-boundary.md`. Status values are `Proposed`,
`Decision Pending`, `Accepted`, `Rejected`, and `Superseded`. A superseded ADR
links to its replacement. Separate implemented current behavior from deferred or
target-state work explicitly.

## Current records

- [0001: Local and cloud persistence boundaries](0001-local-and-cloud-persistence-boundaries.md)
- [0002: Bun and Elysia API runtime](0002-api-runtime-decision.md)
- [0002: Durable Project aggregate](0002-durable-project-aggregate.md)

Two accepted records were assigned `0002` before the sequence conflict was noticed. Their
filenames remain stable to preserve existing links and history; use `0003` for the next ADR and do
not reuse an existing number.

## Template

```md
# NNNN: Decision title

- Status: Proposed
- Date: YYYY-MM-DD

## Context

What durable problem or constraint requires a decision?

## Decision

What is decided? Distinguish current behavior from target state.

## Consequences

What becomes easier, harder, constrained, or costly to reverse?

## Alternatives considered

Which credible alternatives were considered, and why were they not selected?
```
