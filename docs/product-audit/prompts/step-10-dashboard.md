## Implementation Prompt — Step 10: Make the dashboard lead with the work

### Objective

Reorder the Dashboard so the operator's work appears first, and collapse the Processing Queue to a
single line when it is empty.

### Context

Lightframe Studio is a local-first, single-operator browser video studio. `/dashboard` is the landing
surface after login.

Its current reading order, observed in the running product, is:

1. greeting
2. an onboarding card explaining Projects versus Campaigns
3. **Processing Queue** — a full section that usually reads "No queued or active video jobs."
4. Continue Work
5. Recent Work

So the two blocks above the fold are an explanation of the organization model and an empty
engineering queue. The primary creative action is a header button competing with a secondary one.

By this point in the roadmap, step 7 has given recent-work entries a visual card treatment.

### User Problem

Home does not show the operator what they have made or what to do next.

### Required Behavior

- Continue Work and Recent Work appear above the Processing Queue.
- An empty Processing Queue occupies a single line; an active one expands with its existing content
  and actions.
- Every action currently reachable from the Dashboard remains reachable.
- Polling behaviour is unchanged.

### Existing Areas to Inspect

- `apps/web/src/features/dashboard/DashboardRouteSurface.tsx` — the section order, the
  `processingQueueQuery` with `refetchInterval: 3_000` conditional on active jobs, the abandon
  mutation and its `ConfirmationDialog`, the `recentKind` filter, the empty-state messages and
  actions
- `apps/web/src/features/dashboard/DashboardRouteSurface.styles.ts` — `dashboardBodyStyles`,
  `processingQueueStyles`, `recentWorkStyles`, `continuePanelStyles`
- `apps/web/src/features/dashboard/dashboardOnboarding.ts` — the dismissal boolean
- `apps/web/src/adapters/api-client/videoJobsApi.ts` — `listActiveVideoJobs`, `abandonVideoJob`
- `e2e/studioVisualMatrix.ts` — the `dashboard-overview` visual scenario and what it gates on

### Scope

- Reorder the Dashboard sections.
- Convert the empty Processing Queue into a compact status line that expands when jobs exist.
- Keep the onboarding card where it is, but below the work — its content is a later step.

### Out of Scope

- The job-queue API, the abandon flow or its confirmation copy.
- New Dashboard data or new queries.
- Onboarding content — a later step replaces it.
- The card treatment itself — that landed in step 7.

### UX Requirements

- An empty queue is one line, not a section with a heading, a description and a Refresh button.
- An active queue must be at least as prominent as it is today, with its per-job actions unchanged.
- Preserve the polite live regions and the `role="alert"` error notice.
- Preserve the Refresh affordance in the expanded state.
- Keep the `recentKind` filter group and its `aria-pressed` semantics.
- Maintain the tested viewports and the 200 %-text reflow behaviour.

### Technical Requirements

- Do not change `refetchInterval` behaviour: polling only while `query.state.data?.jobs.length` is
  truthy.
- Do not change the abandon confirmation, its danger styling, or its honest provider-cost alert
  (_"The configured provider has no verified cancellation API. Provider work and cost may continue
  after removal."_).
- Do not add a query or change any query key.
- Preserve the heading hierarchy and `aria-labelledby` relationships.

### Acceptance Criteria

1. Continue Work and Recent Work render above the Processing Queue.
2. With no jobs, the queue is a single compact line.
3. With jobs, the queue expands and every existing per-job action works identically.
4. Every action reachable from the Dashboard today is still reachable.
5. Polling still occurs only while jobs are active.
6. Live regions, alert roles and heading structure are preserved.

### Regression Protection

- `apps/web/src/features/dashboard` tests must pass; update only assertions that depend on section
  order or the empty-queue markup.
- The `dashboard-overview` visual scenario gates on specific visible controls — check what it asserts
  before changing the layout, and update the gate deliberately if needed.
- Verify the abandon flow end to end, including the error and success notices.

### Validation

```bash
npx vitest run apps/web/src/features/dashboard
```

Then:

```bash
npx playwright test --config playwright.visual.config.ts
```

### Completion Report

Report the new section order, the compact-queue design and how it expands, confirmation that polling
and the abandon flow are unchanged, the visual baseline regenerated, and any test assertion updated.

### Working rules

Audit the affected area before changing it. Confirm step 7 has landed. Make no unrelated changes and
remove no existing functionality — in particular, no Dashboard action may become unreachable. Do not
guess. Maintain responsive behaviour, accessibility and performance — no new queries, no new polling.
Run only the checks above. Report exactly what changed.
