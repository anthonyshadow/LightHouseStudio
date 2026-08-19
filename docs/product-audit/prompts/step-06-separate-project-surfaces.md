## Implementation Prompt — Step 6: Separate the three Project surfaces

### Objective

Split `ProjectRouteSurface.tsx` into three modules — the Projects list, the Project overview and the
Project workspace — **with no behaviour change of any kind**. This is an enabling change that exists
to make the three steps that follow it safe to review.

### Context

Lightframe Studio is a local-first, single-operator browser video studio (React 19 + Vite + Emotion).

`apps/web/src/features/projects/ProjectRouteSurface.tsx` is 1 350 lines and holds three unrelated
surfaces plus their shared plumbing:

- `ProjectListSection` and `ProjectsWorkspace` — the `/projects` list
- `ProjectDetail` in overview mode — `/projects/{id}`
- `ProjectDetail` in workspace mode — `/projects/{id}/workspace`, a four-tab inspector rendered
  beside the Studio media stage
- `ProjectSourceSection`, `ProjectSessionNotice`, and four dialog mounts

`ProjectRouteSurface.styles.ts` is a further 968 lines.

Three upcoming changes (visual browsing, search, and Project duplication) each edit this file. Doing
them against a 1 350-line module holding three surfaces is the largest avoidable regression risk in
the roadmap.

### User Problem

None directly. The value is that the next three user-facing changes become individually reviewable.

### Required Behavior

Identical to today, on all three surfaces. Same DOM, same `data-*` attributes, same accessibility
tree, same focus behaviour, same network behaviour.

### Existing Areas to Inspect

Read all of these before moving anything:

- `apps/web/src/features/projects/ProjectRouteSurface.tsx` in full
- `apps/web/src/features/projects/ProjectRouteSurface.styles.ts`
- `apps/web/src/app/shell/ShellMain.tsx` — how `ProjectRouteSurface` is lazily imported and which
  props it receives in overview versus workspace mode
- `apps/web/src/studio/StudioWorkspace.tsx` — how the workspace renders beside the media stage
- `apps/web/src/features/projects/useProjectSession.ts`, `useProjectSourceController.ts`,
  `useProjectProcessingController.ts` — the controllers the surfaces share
- `apps/web/src/features/projects/ProjectRouteSurface.test.tsx` and
  `ProjectRouteSurface.styles.test.ts`
- `apps/web/src/app/paths.ts` — `isProjectWorkspacePath`, `projectWorkspacePath` and the `?task=`
  contract

Pay particular attention to these load-bearing details, all of which must survive unchanged:

- the active-workspace-task latch, adjusted **during render** rather than in an effect
- `?task=` navigation using `replace`, not push
- roving `tabIndex` and arrow-key movement across the tablist
- History mounted only when its tab is active
- `onSessionChange` reporting the session up to the shell
- `key={current.project.id}` on `ProjectSourceSection`
- the stable identity of `acceptOverviewSource`, which the source controller's hydration effect
  depends on

### Scope

- Extract the list surface into its own module.
- Extract the overview surface into its own module.
- Extract the workspace surface into its own module.
- Split the style module along the same lines.
- Keep `ProjectRouteSurface.tsx` as a thin entry point that chooses between them, preserving its
  current export and props.

### Out of Scope

- **Any** behaviour, copy, markup, `data-*` attribute, CSS value or accessibility semantic.
- New abstractions, shared base components or prop-shape changes beyond what the move requires.
- `StudioApp.tsx`, the controllers, the API, the repositories, the contracts.
- Performance work, memoization changes, or hook reordering.

### UX Requirements

None. Nothing visible may change.

### Technical Requirements

- This is a pure move. If you find yourself deciding how something _should_ work, stop — you have
  left the scope.
- Where a helper is needed by two extracted modules, co-locate it in a small shared module in the
  same directory. Do not invent an abstraction with one real consumer.
- Preserve lazy-loading behaviour: `ShellMain` currently `lazy`-imports `ProjectRouteSurface`, and
  the workspace must still not be fetched on routes that do not need it.
- Keep hook call order within each surface identical.
- No file among the three should exceed roughly 600 lines. If one does, the split is in the wrong
  place.
- `bun run check:modules` and `bun run check:dead-code` must stay clean.

### Acceptance Criteria

1. The rendered DOM, `data-*` attributes and accessibility tree are unchanged on the list, the
   overview and the workspace.
2. **Every existing test passes without modification except for import paths.** If a test needs a
   behavioural edit, the extraction is wrong — fix the extraction, not the test.
3. No module among the three exceeds roughly 600 lines.
4. `ShellMain` still lazily loads the Project surfaces, and the workspace is still not fetched on
   routes that do not mount it.
5. `bun run check:modules`, `bun run check:dead-code` and `bun run typecheck` are clean.

### Regression Protection

The "tests unchanged" rule above is the primary protection. In addition:

- Verify the workspace still opens on the step the Project is up to, and that an explicit `?task=`
  choice still outranks the latch.
- Verify arrow-key movement across the four tabs and that focus lands on the newly selected tab.
- Verify the overview→workspace transition after accepting a source still lands with the stage
  showing the accepted original.
- Verify `StudioExitGuard` still does not treat a task change as leaving.

### Validation

```bash
bun run typecheck && npx vitest run apps/web/src/features/projects apps/web/src/app && bun run check:modules && bun run check:dead-code
```

Then:

```bash
npx playwright test e2e/successful-studio-journeys.spec.ts e2e/app-routing.spec.ts
```

### Completion Report

Report the resulting module list with line counts, exactly which tests needed an import-path change,
confirmation that **no test needed a behavioural change**, and confirmation that the four load-bearing
details listed above still behave identically. If anything had to change beyond an import path,
report it prominently as a deviation.

### Working rules

Audit the whole file before moving any of it. Understand current behaviour from the code, not from
comments. This step changes structure only — make no unrelated changes, remove no functionality,
introduce no abstraction, and do not "improve" anything you move. Do not guess. Run only the checks
above. Report exactly what changed.
