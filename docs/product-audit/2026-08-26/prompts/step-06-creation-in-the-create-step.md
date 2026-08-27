## Implementation Prompt — Step 6: Put creation in the Create step

### Objective

Make the Project workspace's **Create** tab the place an operator starts a Character Swap, a Virtual
Try-On or a voice replacement — and remove the second, competing three-step wizard from inside a
Project.

### Context

A Lightframe Project workspace (`/projects/:id/workspace`) shows a three-step model in its header:
**1 Original · 2 Create · 3 Save**, with four task tabs — Original, Create, Save, History.

**The Create tab cannot start anything.** `ProjectWorkspaceSurface.tsx:318-343` renders exactly
three things into that panel:

- `ProjectCreativeCheckpointPanel` — a "Keep this setup" checkpoint
- `ProjectWorkingMediaSection` — current-cut management
- `ProjectProcessingStatusPanel` — the **status** of work already running. Its own copy says
  "This check never submits provider work." It can refresh, cancel and reconcile. It cannot submit.

To actually create, the operator must use the bottom creative tool bar's **"Edit Video · Open the
video editor"** button. That opens `StudioExistingVideoOverlay`, titled **"Use existing video"**,
described as "Add a source, choose optional edits, then compare and save the result", running its own
three-step wizard — **Source · Edit · Review** — which contains "Choose your edits": Character Swap,
Virtual Try-On, Voice, plus local adjustment.

So the operator sits at step 2 of one wizard and opens step 2 of another, through a control named for
a different capability, under a title that makes no sense inside a Project that already has a video.

The same overlay is also used on `/studio/create`, where "Use existing video" **is** an accurate
title and the Source/Edit/Review wizard **is** the right model. It serves two contexts.

### User Problem

The primary creative action is two navigational hops from the step named for it, behind a
mislabelled control, inside a second progress model.

### Required Behavior

- From the Create tab, the operator can start a Character Swap, a Virtual Try-On or a voice
  replacement, and can reach local adjustment.
- Only one three-step progress model is visible at a time inside a Project.
- The bottom-bar control names what it actually opens.
- Everything reachable today stays reachable.
- `/studio/create` behaviour is unchanged.

### Existing Areas to Inspect

Trace both contexts before changing anything. The overlay is large and stateful; understand its
lifecycle before you move its entry point.

- `apps/web/src/features/projects/ProjectWorkspaceSurface.tsx` — the task tabs and the Create panel
- `apps/web/src/features/projects/ProjectCreativeCheckpointPanel.tsx`
- `apps/web/src/features/projects/ProjectProcessingStatusPanel.tsx` — note what it can and cannot do
- `apps/web/src/features/projects/useProjectProcessingController.ts` — how Project provider work is
  actually submitted, reconciled, retried and cancelled
- `apps/web/src/studio/StudioExistingVideoOverlay.tsx` — the overlay host, its title, its
  `returnFocusRef` logic and its `closeDisabled` guard while a provider is active
- `apps/web/src/features/existing-video/ExistingVideoPanel.tsx` and `ExistingVideoPanelSections.tsx`
- `apps/web/src/features/existing-video/ExistingVideoPhaseIndicator.tsx` — the Source/Edit/Review wizard
- `apps/web/src/features/existing-video/ExistingVideoToolCards.tsx` — "Choose your edits"
- `apps/web/src/features/existing-video/useExistingVideoWorkflow.ts` — 924 lines of workflow state.
  **Read it before deciding how much to move.**
- `apps/web/src/features/existing-video/ExistingVideoProjectProcessingActions.tsx` — the Project-aware
  submission actions that already exist
- `apps/web/src/studio/CreativeWorkspace.tsx` — the bottom tool bar and its labels
- `apps/web/src/studio/StudioApp.tsx` — how `activeTool` is derived and the overlay is opened

### Scope

- Surface the transform entry points on the Create tab, with their capability state and cost.
- Ensure only one progress model is visible inside a Project — retire or subordinate the overlay's
  wizard in that context.
- Rename the bottom-bar control to describe what it opens.

### Out of Scope

- **Changing what any transform does.** Its configuration, cost warnings, consent copy, capability
  gating, provider selection and contracts are all untouched.
- The engine labelling ("Decart API" / "Pruna API") — that is step 8. Leave it exactly as it is.
- The wording of internal identifiers and the two hard sentences on the Create tab — that is step 7.
- `/studio/create`, where the overlay's title and wizard are correct.
- Restructuring `useExistingVideoWorkflow` internals. **Prefer changing where the overlay is entered
  and what it is called over rewriting how it works.**
- Splitting any large component for tidiness.

### UX Requirements

- The Create tab must present the three transforms with their availability and their stated cost, in
  the language they already use.
- One step model visible at a time inside a Project. If the overlay remains, it must not display a
  competing numbered wizard there.
- The bottom-bar control's visible label and its `aria-label` must both match what it opens.
- `ProjectProcessingStatusPanel` **stays** on the Create tab — showing running work where work is
  started is correct.
- Preserve focus return. The overlay currently returns focus to `editVideoToggleRef` or
  `uploadToggleRef` depending on whether a recording is presented; whatever you change must still
  return focus to the control that opened it.
- Preserve `closeDisabled` while a provider run is active — the operator must not be able to dismiss
  a running job's surface.
- Must work at 375 px, where the tool bar is compact.

### Technical Requirements

- Audit both contexts first. The overlay serves a Project and `/studio/create`; condition on context
  rather than deleting a mode.
- Reuse `useProjectProcessingController` for anything Project-scoped. Do not create a second
  submission path.
- Do not change the shape of any provider request, or how submissions are counted, warned about or
  reconciled.
- Preserve the overlay's `key={existingVideo.selection?.metadata.selectedAt ?? 'empty-existing-video'}`
  remount semantics unless you can show they are unnecessary.
- Lazy loading must be preserved — the overlay is `lazy()`-imported and should stay off the critical
  path for operators who never open it.
- Do not regress render performance on the workspace.

### Acceptance Criteria

- Character Swap, Virtual Try-On and voice replacement can each be started from the Create tab.
- Local adjustment (trim, crop, rotate, relight, filter) is reachable from the Create tab.
- No two three-step progress models are visible at once inside a Project.
- The bottom-bar control's label matches what it opens, in both its visible and accessible forms.
- `/studio/create` behaviour, title and wizard are unchanged.
- Capability gating, cost statements and consent copy are unchanged.
- Focus returns to the opening control when the surface closes.
- A running provider job still cannot be dismissed.
- Everything reachable before this change is still reachable.

### Regression Protection

**Reachability is the main risk.** The overlay is currently the only route to local editing and to
voice work. Enumerate every capability reachable through it today, and verify each one afterwards.

Also protect:

- The Project processing lifecycle — submit, reconcile, retry, cancel — and its idempotency.
- The take-review flow, which shares state with the overlay.
- The standalone `/studio/create` journey end to end.
- Existing `data-*` test hooks and `aria-label` values used by the E2E suite.

### Validation

Run only:

```bash
bun run --filter @studio/web exec vitest run src/features/projects src/features/existing-video src/studio
```

Then `e2e/existing-video.spec.ts` and `e2e/successful-studio-journeys.spec.ts`. Run the affected
mobile cases from `bun run test:visual` only if you changed layout. Do not run the full suites.

### Completion Report

State: every file changed; the full list of capabilities reachable through the overlay before your
change and confirmation that each is still reachable; how the Create tab now starts each transform;
what happened to the Source/Edit/Review wizard in the Project context and why; the new bottom-bar
label; how `/studio/create` was kept unchanged; the validation commands and their output; and
anything you deliberately left in the overlay rather than moving, with the reason.
