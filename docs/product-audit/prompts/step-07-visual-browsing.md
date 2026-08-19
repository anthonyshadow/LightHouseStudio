## Implementation Prompt — Step 7: Show the work, not a description of it

### Objective

Give the Projects list, the Dashboard's recent work, the Campaigns list and the Assets hub a visual
representation of the work they describe — without adding a network request per row.

### Context

Lightframe Studio is a local-first, single-operator browser video studio. It produces video, and
almost none of its surfaces show any.

Observed in the running product:

- `/projects` is a text table: title, status pill, "Updated …", and three text actions.
- The Dashboard's Recent Work is four text rows with generic icons.
- Campaign cards are name, brief and status.
- The Assets hub shows counts for Characters and Outfits only — read from browser IndexedDB, with no
  loading state, so it renders `0` before hydration — and no count at all for Videos or Voices.

Thumbnails exist and work: `savedVideoThumbnailUrl` serves them, and
`apps/web/src/features/projects/ProjectAssetThumbnail.tsx` is an existing poster tile with an icon
fallback and broken-image recovery. They are simply not used outside the Videos overlay and the
Project Assets strip.

### User Problem

The operator cannot recognise their own work by looking at it, and cannot scan a list. Two videos
titled "Untitled Project" are indistinguishable.

### Required Behavior

- Project entries show a poster derived from the Project's presented media or its most recent output,
  where one exists.
- Dashboard recent-work entries show the same for Projects and Videos.
- Campaign entries show a small representation of their Projects' work.
- All four Assets hub cards show a count, with a loading state and an error state with retry.
- No surface issues an additional network request per row.

### Existing Areas to Inspect

- `apps/web/src/features/projects/` — the list surface extracted in step 6, and
  `useProjectsController.ts`
- `apps/web/src/features/dashboard/DashboardRouteSurface.tsx` — `recentItems`, `RecentWorkItem`
- `apps/web/src/features/campaigns/CampaignRouteSurface.tsx`
- `apps/web/src/features/assets/AssetsRouteSurface.tsx` — `assetCards`, `countFor`
- `apps/web/src/app/shell/ShellMain.tsx` — where `characterCount` and `outfitCount` come from
- `apps/web/src/features/projects/ProjectAssetThumbnail.tsx` — reuse this
- `apps/web/src/adapters/api-client/savedVideosApi.ts` — `savedVideoThumbnailUrl`, `listSavedVideos`
- `packages/contracts/src/projects.ts` and `campaigns.ts` — what the list responses already carry
- `apps/web/src/features/video-gallery/VideoGallery.tsx` — the existing card treatment to stay
  consistent with
- `e2e/accessibility-responsive.spec.ts` — the 200 %-text reflow cases these surfaces must survive
- `playwright.visual.config.ts` and `e2e/studioVisualMatrix.ts` — affected baselines

### Scope

- Poster-backed cards for Projects, Dashboard recent work and Campaigns.
- Counts with loading and error states on all four Assets hub cards.
- A shared, deliberate "no preview" treatment consistent with step 3.

### Out of Scope

- New API endpoints for thumbnails.
- Changing the Videos overlay's existing card design.
- Animated or scrubbing previews.
- Search, filters or sorting — a later step.
- Reordering the Dashboard — a later step.

### UX Requirements

- A card with no poster must look intentional, using the same treatment as step 3 — never a broken
  image.
- Keep every existing row action reachable without hovering. Do not hide **Open**, **Rename**,
  **Archive** or **Delete** behind a hover state.
- Preserve keyboard order and focus behaviour.
- These surfaces are covered by 200 %-text reflow tests at mobile widths; the card layout must
  reflow rather than clip or scroll horizontally.
- Loading counts must not flash `0` — show a skeleton or omit the count until it is known.

### Technical Requirements

- **No per-row request.** Resolve posters from data the list response already carries, or from one
  additional bounded query per surface (for example, one saved-video page keyed by the ids in view).
  If neither is possible for Campaigns, show a non-poster treatment rather than adding N requests.
- Reuse `ProjectAssetThumbnail` and `savedVideoThumbnailUrl`.
- Do not change list pagination, cursors or page sizes.
- Do not introduce polling.
- Images must be lazily loaded and sized so layout does not shift as they arrive.
- If the Project list response does not carry enough to resolve a poster, prefer extending the
  existing list contract over adding a second round trip — and if you extend it, implement it in
  **both** the file and Drizzle Project repositories.

### Acceptance Criteria

1. Projects, Dashboard recent work and Campaigns show a visual representation where one exists, and a
   deliberate no-preview treatment where one does not.
2. Rendering any of those lists issues no additional request per row.
3. All four Assets hub cards show a count, a loading state, and an error state with a retry.
4. The hub never renders `0` before its data is known.
5. All existing row actions remain reachable and keyboard-operable.
6. `e2e/accessibility-responsive.spec.ts` passes unchanged.

### Regression Protection

- Do not change list query keys, cursors or invalidation.
- Verify the Dashboard's `recentKind` filter still works across all four tabs.
- Verify the Projects campaign filter and the active/archived split still behave identically.
- Visual baselines for `dashboard-overview` and the organization surfaces will change — regenerate
  them deliberately and say so.

### Validation

```bash
npx vitest run apps/web/src/features/projects apps/web/src/features/campaigns apps/web/src/features/dashboard apps/web/src/features/assets apps/web/src/app
```

Then:

```bash
npx playwright test --config playwright.visual.config.ts && npx playwright test e2e/accessibility-responsive.spec.ts
```

### Completion Report

Report how each surface resolves its poster and the exact request count per surface before and
after, the no-preview treatment used, the hub count sources and their loading/error handling, the
visual baselines regenerated, and confirmation that no per-row request was introduced. If you
extended a list contract, report both repository implementations.

### Working rules

Audit the affected area before changing it. Confirm step 3 (reliable previews) and step 6 (separated
Project surfaces) have landed. Reuse `ProjectAssetThumbnail` and the existing card treatment rather
than designing a new one. Make no unrelated changes and remove no existing functionality. Do not
guess. Maintain responsive behaviour, accessibility and performance — no new per-row requests, no new
polling. Run only the checks above. Report exactly what changed.
