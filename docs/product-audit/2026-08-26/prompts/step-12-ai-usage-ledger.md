## Implementation Prompt — Step 12: Show what the AI work has cost

### Objective

Give the operator an account-level record of the AI work they have run — what, when, with which
engine, and how it ended — so consumption is visible after the fact and not only at the moment of
spending.

### Context

Lightframe Studio submits paid work to external providers: Character Swap (Decart or Pruna), Virtual
Try-On, reference-image generation (OpenAI, BFL or Wiro) and ElevenLabs voice replacement.

The product is scrupulous **at the moment of spending**. The configuration panel states
"1 visual-processing submission" before submission, asks for explicit consent, warns that higher
resolutions "may take longer and cost more provider usage", and never retries a paid call
automatically.

**Afterwards it is silent.** `apps/web/src/features/account/AccountPanel.tsx` shows entitlement
_limits_ — "Videos limit", "Characters limit", "Outfits limit", "Monthly credits" — and a count of
currently running jobs. It then says: "Each Project keeps its own record of completed AI runs — open
a Project and check its history."

So the only record of consumption is per-Project. There is no account-level view, and no usage
endpoint among the 87 routes in `apps/api/src/route-inventory.test.ts`.

The records already exist. `processingJobs` and `projectJobs` hold them. This is a read model.

### User Problem

Every submission costs money, and nothing anywhere totals it. The operator cannot see what they have
used before deciding to use more.

### Required Behavior

- An account-level view of AI submissions for the signed-in operator: counts by operation and by
  engine, over a stated period.
- Failed and cancelled work is distinguished from successful work.
- The numbers reconcile with what per-Project history shows.
- No pricing, currency, or monetary amount appears anywhere.

### Existing Areas to Inspect

- `apps/web/src/features/account/AccountPanel.tsx` — the current entitlements, integrations and
  "AI activity" sections, and the sentence pointing at per-Project history
- `apps/web/src/features/account/SettingsContent.tsx` and `SettingsPanel.tsx`
- `apps/api/src/infrastructure/database/schema.ts` — `processingJobs` (around line 416) and
  `projectJobs` (around line 1015). Read what each actually records: operation, provider, status,
  timestamps, terminal state.
- `apps/api/src/features/processing-jobs/` — the processing-job repository and its project-aware wrapper
- `apps/api/src/features/video-jobs/video-job-service.ts` — job lifecycle and terminal states
- `apps/api/src/features/projects/project-history-service.ts` — how per-Project AI history is already
  assembled. **Your numbers must reconcile with this.**
- `packages/contracts/src/common.ts` — `listTotalSchema` and the count-to-a-ceiling convention
- `apps/api/src/route-inventory.test.ts` — the oracle a new route must be added to
- `apps/api/src/http/authentication.ts` — how the session subject is established

### Scope

- One owner-scoped endpoint aggregating AI submissions.
- An account surface presenting it.

### Out of Scope

- **Currency, pricing, invoices, billing or credits.** Explicitly deferred — this step makes
  consumption visible, not chargeable.
- Enforcing or changing any limit.
- Per-provider cost estimates, unless a provider actually reports a cost in data you already hold.
  Do not compute an estimate from a rate card.
- Changing retention or deletion policy.
- Any new provider call.
- Changing how jobs are recorded.

### UX Requirements

- Plain counts, plainly labelled, in the same vocabulary the submission warnings already use — the
  operator was told "1 visual-processing submission", so the ledger should speak the same way.
- State the period covered explicitly. Do not show a number whose window is ambiguous.
- Say so explicitly if a number is approximate or capped at a ceiling.
- Distinguish successful, failed and cancelled work visually as well as textually.
- Fits alongside the existing account sections without dominating them.
- Works at 375 px.
- Loading, error and empty states must match the rest of the product: a skeleton, a `StatusNotice`
  with a retry, and an empty state with a worked example.

### Technical Requirements

- **This is a read model.** Aggregate from records that already exist; do not add a write path, a
  counter column, or a new table.
- **Ownership derives from the verified session subject only** — never from a query parameter, body,
  path or device id.
- Count to a ceiling rather than censusing, following `listTotalSchema` and the `exceedsCeiling`
  convention used everywhere else.
- One query. Do not issue a query per operation or per provider.
- Adding a route changes the route inventory — update `apps/api/src/route-inventory.test.ts`.
- Add the response schema to `packages/contracts`; do not return an unvalidated shape.
- Never surface raw provider bodies, prompts, internal URLs or upstream error codes. Normalized
  terminal states only.
- Do not slow the account surface — this is one additional query, and it should not block the
  sections that already render.

### Acceptance Criteria

- The account surface shows AI submissions by operation and by engine, for a stated period.
- Failed and cancelled work is distinguished from successful work.
- The totals reconcile with what per-Project history reports for the same Projects.
- No pricing, currency or monetary amount appears anywhere in the response or the UI.
- The endpoint is owner-scoped: a request carrying another subject's session returns that subject's
  data only, and no cross-owner leakage is possible.
- Loading, error and empty states are handled in the product's existing style.
- Where a count is capped, the UI says so.
- The surface renders correctly at 375 px.

### Regression Protection

- The account panel already renders entitlements, integrations and running-job count. None of those
  may regress, and a failure of the new query must not blank the panel.
- Do not change job lifecycle, terminal-state handling or reconciliation.
- Do not change per-Project history.
- The route-inventory oracle will fail until updated — update it deliberately, not by loosening it.

### Validation

Run only:

```bash
bun run --filter @studio/api exec vitest run src/features/processing-jobs src/features/video-jobs src/route-inventory.test.ts
bun run --filter @studio/web exec vitest run src/features/account
bun run --filter @studio/contracts exec vitest run
bun run typecheck
```

Do not run the full test suite or the build. **Never contact a provider during validation.**

### Completion Report

State: every file changed; the new endpoint and its contract; exactly which tables the aggregate reads
and the single query used; how you verified it is not an N+1; how ownership scoping is enforced and
how you tested it; how the numbers reconcile with per-Project history and what you compared; the
period covered and how it is stated; the route-inventory update; the validation commands and their
output; and anything you found recorded that you deliberately did not surface, with the reason.
