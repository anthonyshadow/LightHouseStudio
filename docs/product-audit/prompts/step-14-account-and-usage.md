## Implementation Prompt — Step 14: Show the account, the capabilities and the usage

### Objective

Give the operator one read-only place that shows who they are, what is configured, and what they have
run — using data the product already has.

### Context

Lightframe Studio is a local-first, single-operator browser video studio.

`apps/web/src/features/account/AccountMenu.tsx` currently contains exactly one item: **Log out**.

Meanwhile:

- `GET /api/auth/me` returns `user`, `entitlements` (from `createPhaseOneEntitlements`) and
  `expiresAt`. **`entitlements` is rendered nowhere.**
- `GET /api/capabilities` returns detailed provider capability state — which is already consumed by
  `StatusMenu` for a compact readout.
- Processing-job history exists per Project (`GET /api/projects/:projectId/processing/history`) and
  active jobs are listed at `GET /api/video-jobs`.

Provider cost is communicated only as a risk — _"may incur provider cost"_, _"may duplicate that
cost"_ — never as a quantity. The operator cannot see what they have run.

### User Problem

There is no way to see the account, what is configured, or how much AI work has been done. Paid
provider actions feel risky because nothing is ever counted.

### Required Behavior

- An account panel shows identity, plan and entitlements, and the configured provider capabilities.
- It shows a count of provider jobs run, derived from data the product already stores.
- It is read-only, adds no polling, and does not change log out.

### Existing Areas to Inspect

- `apps/web/src/features/account/AccountMenu.tsx` and its test
- `apps/web/src/application/auth/AuthProvider` — the session and its `entitlements`
- `packages/contracts/src/auth.ts` — the authenticated session response shape
- `packages/domain/src/…` — `createPhaseOneEntitlements` and what the entitlement snapshot contains
- `apps/web/src/studio/StudioHeader.tsx` — `StatusMenu`, `capabilityLabel`, `systemStatusLabel`, and
  the existing wording for unavailable capabilities
- `apps/web/src/adapters/api-client/videoJobsApi.ts` — `listActiveVideoJobs`
- `apps/api/src/features/video-jobs/routes.ts` and `video-job-service.ts` — what job history is
  already retained
- `apps/web/src/ui/primitives` — `OverlayPanel`, `StatusNotice`, `Button`
- `apps/api/src/route-inventory.test.ts` — check before assuming a new endpoint is needed

### Scope

- An account panel opened from the existing account menu.
- Identity, plan and entitlements from the session already in memory.
- Configured capabilities from the capabilities query already in use.
- A job count derived from existing data.

### Out of Scope

- Billing, credits, quotas or cost estimation.
- Editing the profile, changing the password or preferences.
- Any new persistence.
- Changing log out, session expiry or the teardown hold.
- Adding a new endpoint **unless** a job count is genuinely unobtainable from existing data — and if
  so, stop and report before adding one.

### UX Requirements

- Plain and factual. No marketing language, no invented metrics.
- Where a capability is unavailable, say what would enable it using the same wording `StatusMenu`
  already uses — do not write a second vocabulary for the same states.
- If a count cannot be determined, say so honestly rather than showing zero.
- Keyboard-operable, correctly labelled, focus returned to the trigger on close, matching the
  existing menu and panel behaviour.
- Maintain responsive behaviour, including the mobile presentation the account menu already supports.

### Technical Requirements

- Read-only. Reuse the existing auth session and capabilities queries — do **not** add a polling
  loop or a new refetch interval.
- If a job count needs a query, bound it, cache it with a sensible stale time, and fetch it only when
  the panel opens. Never compute an aggregate on every render.
- Do not surface raw provider identifiers, internal URLs, model secrets or upstream error codes
  beyond what `/api/capabilities` already exposes publicly.
- Do not change `AccountMenu`'s existing `presentation` prop behaviour or its busy state during
  logout.

### Acceptance Criteria

1. The panel shows identity, plan and entitlements from the existing session payload.
2. It shows configured provider capabilities using the existing capability wording.
3. It shows a count of provider jobs run, or states honestly that the count is unavailable.
4. No new polling and no new refetch interval is introduced.
5. Log out behaves exactly as before, including its busy and preparing states.
6. The panel is keyboard-operable and returns focus to its trigger.

### Regression Protection

- `apps/web/src/features/account/AccountMenu.test.tsx` must pass; extend it rather than rewriting it.
- Verify the logout confirmation and the session-expiry dialog are unaffected.
- Verify the header's existing `StatusMenu` still behaves identically — you are adding a sibling, not
  replacing it.

### Validation

```bash
npx vitest run apps/web/src/features/account apps/web/src/studio apps/web/src/application
```

### Completion Report

Report what the panel shows and where each value comes from, the job-count source and how it is
bounded and cached, confirmation that no new polling was added, and confirmation that log out and
session expiry are unchanged. If a new endpoint was required, report it as a scope deviation with its
justification.

### Working rules

Audit the affected area before changing it. Reuse the existing session and capability queries and the
existing capability wording rather than writing new ones. Make no unrelated changes and remove no
existing functionality. Do not guess — if the job count is not derivable from existing data, stop and
report rather than inventing a metric. Maintain responsive behaviour, accessibility and performance —
no new polling. Run only the checks above. Report exactly what changed.
