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
