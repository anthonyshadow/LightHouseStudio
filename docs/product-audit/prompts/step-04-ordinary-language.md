## Implementation Prompt — Step 4: Say it in ordinary language

### Objective

Replace internal domain vocabulary in user-facing copy with ordinary words, without changing a single
domain type, contract field, database column or behaviour.

### Context

Lightframe Studio is a local-first, single-operator browser video studio. Its domain model is
deliberately precise: immutable sources, working media, presented media, revisions, checkpoints,
outputs, Versions and memberships. That precision is correct and must stay.

The problem is that the model is rendered to the operator verbatim. Observed in the running product:

- The Project overview header reads `DRAFT · Updated … · Revision 5 · No Campaign`.
- The Videos library opens with a banner titled **"Unassigned Content"**: _"These legacy or
  independently saved videos have no trustworthy producing Project. They remain fully usable; later
  source reuse records used-by lineage without inventing a producer."_
- The Project Save tab reads _"Retain the current result as a new Video or an explicit Version"_ and
  reports _"Saving one immutable Video Version and its Project provenance."_
- The Project Assets section explains _"Attached Assets are reusable records kept alongside this
  Project. They are not its source — that is the one original video the Project is built from."_
- The capture panel explains _"Listing devices does not start the camera or microphone"_ and
  _"Studio rescans after a successful Start or a browser-reported device change. Opening this panel
  never requests permission."_

### User Problem

The operator must learn the internal model before they can act. This is the largest single source of
cognitive load in the product.

### Required Behavior

Every user-facing string uses ordinary words while remaining accurate. The following mapping applies
consistently across every surface:

| Currently shown                      | Show instead                                          |
| ------------------------------------ | ----------------------------------------------------- |
| `Revision N` in a page header        | remove from headers; keep in History as a plain count |
| `immutable Video Version`            | `Version N`                                           |
| `working media`                      | `current cut`                                         |
| `presented media`                    | `what you're viewing`                                 |
| `checkpoint` / `Save creative setup` | `Save progress`                                       |
| `Project Source`                     | `Original video`                                      |
| `attached Assets`                    | `Used in this project`                                |
| `Project provenance`                 | (drop; say what it means or say nothing)              |
| the **"Unassigned Content"** banner  | delete it entirely                                    |

Long defensive explanations are shortened to one plain sentence or removed.

### Existing Areas to Inspect

- `apps/web/src/features/projects/ProjectRouteSurface.tsx` — overview header, workspace masthead,
  task panel headings, source section copy
- `apps/web/src/features/projects/ProjectOutputSaveSection.tsx` — save copy and phase messages
- `apps/web/src/features/projects/ProjectWorkingMediaSection.tsx`,
  `ProjectHistorySection.tsx`, `ProjectAssetsSection.tsx`, `ProjectCreativeCheckpointPanel.tsx`,
  `ProjectWorkflowProgress.tsx`
- `apps/web/src/features/video-gallery/VideoGallery.tsx` — the Unassigned Content banner
- `apps/web/src/studio/StudioLibraryOverlays.tsx` — overlay titles and descriptions
- `apps/web/src/features/assets/AssetsRouteSurface.tsx` — hub card descriptions
- `apps/web/src/features/recording/CaptureSettingsPanel.tsx` — device-panel copy
- `apps/web/src/features/projects/projectProcessingPresentation.ts` — user-facing processing messages
- Every corresponding `*.test.tsx` and the E2E specs under `e2e/`

### Scope

User-facing strings only, plus whatever tests and specs assert on them.

### Out of Scope

- Domain types in `packages/domain`, contract field names in `packages/contracts`, database columns,
  API response shapes, code comments and internal identifiers — all unchanged.
- Any behaviour, layout, component structure or `data-*` attribute.
- Cost and consequence warnings: they may be shortened, but their meaning must not soften. Never
  remove a statement that provider work may continue or may incur cost.

### UX Requirements

- Keep precision. "Version 3" is fine; "immutable Video Version" is not. Never trade accuracy for
  friendliness — say the true thing in fewer, more common words.
- One term per concept, everywhere. If "current cut" is chosen, nothing else says "working media".
- Keep every `aria-label`, `role`, live region and heading level intact; where an accessible name
  changes, it must still describe the same control.
- Preserve announcement behaviour — messages read by live regions must remain equally informative.

### Technical Requirements

- Prefer `data-*` attributes over visible text in test selectors where you must update a test; do not
  keep a stale user-facing string alive to protect an assertion.
- Where a string is built from a template, change the template, not each call site.
- `bun run check:retired-program` must stay clean.

### Acceptance Criteria

1. No user-facing surface renders "immutable", "provenance", "presented media", "working media" or
   "Unassigned Content".
2. `Revision N` no longer appears in the Project overview or workspace headers.
3. Each renamed concept uses exactly one term across every surface.
4. No domain type, contract field, database column or API shape changed.
5. Every cost, consequence and irreversibility warning still states the same fact.
6. All accessible names still describe their control; heading structure is unchanged.

### Regression Protection

- Expect to update `ProjectRouteSurface.test.tsx`, `ProjectOutputSaveSection.test.tsx`,
  `ProjectHistorySection.test.tsx`, `VideoGallery` tests and several specs under `e2e/`.
- Update assertions to match the new copy; do not weaken an assertion to a substring to avoid work.
- Visual baselines that capture these surfaces will need regenerating — regenerate them deliberately
  and say so.

### Validation

```bash
npx vitest run apps/web/src && bun run check:retired-program && bun run check:docs
```

Then:

```bash
npx playwright test e2e/successful-studio-journeys.spec.ts e2e/app-routing.spec.ts
```

### Completion Report

Report the final vocabulary table as implemented, every surface touched, every test and spec updated,
any visual baseline regenerated, and confirmation that no domain type, contract field or database
column changed. Call out any string you chose **not** to change and why.

### Working rules

Audit the affected area before changing it. Understand current behaviour from the code. Make no
unrelated changes — this step changes words, nothing else. Remove no functionality. Do not guess at
what a term means; trace it to the code that produces it before renaming it. Maintain accessibility
and responsive behaviour. Update affected documentation and run `bun run check:docs`. Run only the
checks above. Report exactly what changed.
