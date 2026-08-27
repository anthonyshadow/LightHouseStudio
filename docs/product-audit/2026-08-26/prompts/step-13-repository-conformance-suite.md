## Implementation Prompt — Step 13: One conformance suite for both Project repositories

### Objective

Write a single parameterized test suite that runs the same behavioural expectations against **both**
Project repository implementations, so a divergence between them fails a test instead of reaching a
user.

**Do not unify the implementations. This step adds tests.**

### Context

Lightframe Studio persists Projects through two complete, independent implementations of one
interface:

| Implementation             | File                                                         | Lines |
| -------------------------- | ------------------------------------------------------------ | ----- |
| `FileProjectRepository`    | `apps/api/src/features/projects/file-project-repository.ts`  | 2,524 |
| `DrizzleProjectRepository` | `apps/api/src/infrastructure/database/project-repository.ts` | 3,861 |

Both implement `ProjectRepository` (`apps/api/src/features/projects/project-repository.ts:359`) —
55 and 51 methods respectively. Both are live: `DATABASE_MODE=local` is the documented default in
`.env.example`, development requires `postgres`, production requires `neon`.

They are tested by **two entirely unrelated suites with different strategies**:

- `file-project-repository.test.ts` drives real temp-directory file I/O through the services
- `project-repository.test.ts` drives a scripted database (`scripted-database.test-support.ts`)

**Nothing asserts that they agree.** 6,385 lines of parallel implementation that must stay
behaviourally identical forever, with no mechanism that fails when they drift.

No divergence has been observed. The risk is structural, and the cheap correct response is a
conformance suite — not a rewrite, which would be a high-risk change to the aggregate every other
feature depends on.

Project is the product's core aggregate. Its guarantees — optimistic concurrency, idempotency
receipts, immutable revisions — are load-bearing for every Project and Campaign mutation in the
product.

### User Problem

None today. This bounds a risk to the aggregate everything else depends on.

### Required Behavior

One suite, written against the interface only, runs the same expectations against both
implementations and fails when either diverges.

### Existing Areas to Inspect

Read the interface and both implementations before writing a single expectation. Do not infer
behaviour from method names.

- `apps/api/src/features/projects/project-repository.ts` — the `ProjectRepository` interface. This is
  the **only** thing your suite may know about.
- `apps/api/src/features/projects/file-project-repository.ts` — including its journal, backup and
  owner-lock behaviour
- `apps/api/src/infrastructure/database/project-repository.ts` — including `mapProjectAggregate` and
  `ProjectPersistenceError`
- `apps/api/src/features/projects/file-project-repository.test.ts` — what it covers, and what is
  file-specific and therefore must stay there
- `apps/api/src/infrastructure/database/project-repository.test.ts` and
  `scripted-database.test-support.ts`
- `apps/api/src/infrastructure/database/project-repository.postgres.integration.test.ts` — **the
  existing convention for a test needing a real Postgres.** Follow it; do not invent a new one.
- `apps/api/src/infrastructure/persistence-factory.ts` — how each implementation is constructed
- `apps/api/src/app.ts` around lines 300-365 — how one is selected at runtime
- `packages/domain/src/projects/rules.ts` — the invariants the repositories must preserve
- `docs/TESTING.md` — the repository's test-layer conventions

### Scope

Cover the interface's observable contract:

- Create, read, and revise a Project
- Optimistic concurrency: `expectedVersion` and `expectedRevisionNumber` conflicts
- Idempotency receipt replay — the same operation key must not produce a second effect
- Lifecycle transitions: archive, restore, tombstone, and the conflicts each can raise
- Asset membership: attach, detach, and the constraints on each
- Source attach, remove and reuse
- Working-media adoption and reuse
- Outputs: creation and read-back
- Ownership isolation: another owner's Project is invisible and unmutable
- Not-found and conflict error shapes

### Out of Scope

- **Unifying, refactoring or deduplicating the implementations.** Explicitly deferred.
- Changing either implementation's behaviour in any way.
- Deleting or reducing the two existing suites — they cover implementation-specific concerns (file
  journaling, backup, SQL mapping) that a conformance suite must not know about.
- Performance testing or benchmarking.
- Adding methods to the interface.

### UX Requirements

None.

### Technical Requirements

- **The suite must be written against the interface only.** No knowledge of files, directories,
  journals, SQL, Drizzle or table names. If an expectation needs to know which implementation it is
  running against, it does not belong in this suite.
- Parameterize over both implementations so each expectation runs twice, and so the failure message
  names which implementation failed.
- The Drizzle implementation is currently tested against a scripted database. A genuine conformance
  run may need a real Postgres — if so, follow the existing `*.postgres.integration.test.ts`
  convention for naming, setup and skipping when no database is available. State clearly in your
  report which implementation is covered under which conditions, and **do not claim coverage you did
  not actually run**.
- Include an assertion that fails if the two implementations expose a different set of interface
  methods, so a method added to one and not the other is caught.
- **If the suite reveals a genuine behavioural divergence, report it. Do not fix it in this step.**
  Mark the expectation clearly, describe the divergence precisely, and leave the decision to a
  separate change.
- Never contact a provider or any network service.

### Acceptance Criteria

- One suite runs the same expectations against both implementations, from one set of definitions.
- It covers every area listed under Scope.
- A failure message identifies which implementation failed.
- It fails if a method exists on one implementation and not the other.
- Both existing suites still pass, unchanged.
- No production code is modified.
- Any divergence found is reported in the completion report, not silently corrected.
- The suite skips cleanly, with a clear message, where infrastructure is unavailable — it must never
  pass by silently testing nothing.

### Regression Protection

This step adds tests, so the regression risk is very low. The real risks are:

- **A suite that passes without testing anything** — a skipped Postgres path that reports success.
  Guard against it explicitly.
- Accidentally modifying production code to make an expectation pass. Do not.
- Slowing the default test run unacceptably. If the conformance run needs real infrastructure, make
  sure the default `vitest run` path stays fast and follows the existing integration-test convention.

### Validation

Run only:

```bash
bun run --filter @studio/api exec vitest run src/features/projects src/infrastructure/database
```

Confirm both existing suites still pass and that your new suite genuinely executed against both
implementations rather than skipping one.

### Completion Report

State: every file added; which implementations were actually exercised and under what conditions;
which areas of the interface are covered and which are not, with the reason; the method-parity
assertion and whether it currently passes; **every behavioural divergence you found, described
precisely, with the expectation that exposes it** — and confirmation that you did not fix any of
them; how you proved the suite does not pass by skipping; and the validation command and its output.
