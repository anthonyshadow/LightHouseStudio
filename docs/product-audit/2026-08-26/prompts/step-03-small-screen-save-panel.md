## Implementation Prompt — Step 3: Repair the small-screen Save panel

### Objective

Stop the fixed action bar painting over the Project workspace's Save panel content at small mobile
widths, reduce the nested scroll regions on that surface to one owner, and fix two label defects.

### Context

Lightframe Studio's Project workspace (`/projects/:id/workspace`) is its most important surface. Its
right-hand rail carries four task panels — Original, Create, Save, History — and the Save panel ends
in a primary action ("Save video · Phone, full screen").

At 375×812 that action sits in a `position: fixed` container that paints over panel content.

**Measured, in a running instance, on `/projects/:id/workspace?task=save` at 375×812:**

| Element                                                                              | Box         |
| ------------------------------------------------------------------------------------ | ----------- |
| Paragraph "This frame and the selected placement are what the saved video will use." | y 632 – 670 |
| Action bar — `position: fixed`, `z-index: 5`, `background rgba(9, 13, 18, 0.96)`     | y 656 – 728 |

`document.elementFromPoint` sampled down that paragraph returns:

- 15 % down → the `<p>` (visible)
- 50 % down → the `<p>` (visible)
- **85 % down → the `<div>` containing "Save video · Phone, full screen"**

The panel already sets `padding-bottom: 104px`. That is not the fix, because the bar is positioned
against the **viewport**, so the padding only clears it at the bottom of the innermost scroll — not
at intermediate scroll positions.

**The contributing cause is a nested scroll stack.** Measured on the same surface:

```
main#studio-main   clientHeight 756   overflow-y: auto   padding-bottom: 72px   (mobile nav)
  └─ aside         clientHeight 543   scrollHeight 1294  (scrollable)
       └─ div      clientHeight 473   scrollHeight 1224  (scrollable)
            └─ section#project-task-save-panel   height 1224   padding-bottom: 104px
```

Three scrollable ancestors. A vertical swipe has ambiguous ownership on touch.

A general occlusion sweep of every text-bearing leaf inside `<main>` at that width found **exactly
one** occluded element — the paragraph above. This is a specific defect, not a systemic layout
failure, so the fix should be correspondingly targeted.

Two smaller defects on the same class of surface:

- The Dashboard "Recent work" filter renders "Campaigns" as "Campai / gns". The segment is 80 px
  wide, the label needs ~85 px at 13.28 px, and `SegmentedControl.tsx:48` sets
  `overflowWrap: 'anywhere'`. The primitive already supports a `shortLabel`, and
  `DashboardRouteSurface.tsx:156` supplies one for `videos` only.
- In the workspace creative tool bar, "New Character 01" clips to "New Charact" and
  "Record or upload a video to edit it." truncates mid-word.

### User Problem

On a phone, the panel that explains what saving will do is partly hidden behind the button that does
it, and two labels are unreadable.

### Required Behavior

- No Save panel content is occluded by the action bar at any scroll position, at small mobile widths.
- At most one scrollable ancestor between `main` and a task panel at small widths.
- No label breaks mid-word or clips mid-word at 375 px.
- Desktop rendering is unchanged.

### Existing Areas to Inspect

Reproduce the defect before changing anything. Run the app, open the workspace at 375×812 with
`?task=save`, and confirm the hit-test result for yourself.

- `apps/web/src/features/projects/ProjectWorkspaceSurface.tsx` and
  `ProjectWorkspaceSurface.styles.ts` — the rail, the task panels, and which element scrolls
- `apps/web/src/features/projects/ProjectOutputSaveSection.tsx` and
  `ProjectOutputSaveSection.styles.ts` — the fixed action bar and the 104 px padding
- `apps/web/src/features/projects/ProjectRouteSurface.styles.ts` — the workspace route container
- `apps/web/src/studio/StudioApp.styles.ts` — `mainGridStyles`, which owns `main`'s layout and its
  72 px bottom padding for the mobile navigation
- `apps/web/src/app/useRouteViewState.ts` — **read this carefully.** It remembers scroll position
  against a specific container. Changing which element scrolls can silently break scroll restoration.
- `apps/web/src/ui/primitives/SegmentedControl.tsx` — the `shortLabel` mechanism
- `apps/web/src/features/dashboard/DashboardRouteSurface.tsx` — `RECENT_KIND_OPTIONS`
- `apps/web/src/studio/CreativeWorkspace.tsx` — the creative tool bar labels
- `e2e/accessibility-responsive.spec.ts` — in particular the case
  "small-mobile Project output review reflows at 200% text with accessible save choices", which
  exercises this exact surface and width and did **not** catch this defect

### Scope

- Make the action bar's occupied space real for whatever actually scrolls — either anchor the bar to
  the scroll container it belongs to, or reserve its height in the region that scrolls.
- Collapse the nested scroll regions at small widths so one element owns vertical scrolling.
- Supply `shortLabel` for `projects` and `campaigns` in the Dashboard recent-work filter.
- Give the compact creative tool labels either room or a shorter visible form.

### Out of Scope

- Desktop layout, which is sound.
- Any change to **what** the Save panel does or says — its copy, its placement chooser, its
  behaviour, and the save contract are all step 4's concern, not yours.
- Changing `SegmentedControl`'s `overflow-wrap` default. Supply the missing short labels; do not
  change behaviour for every consumer of the primitive.
- The accessible names of the creative tool buttons. Only the **visible** label may shorten.
- Any other surface's scroll behaviour.

### UX Requirements

- The primary action must remain reachable without scrolling at small widths — it is the point of the
  panel.
- Focus order must not change.
- `aria-label` values on the creative tool buttons must stay exactly as they are, including
  "Selected character: New Character 01. Open character options".
- Nothing may become horizontally scrollable.
- The change must hold at 200 % text zoom, which the accessibility suite tests at this width.

### Technical Requirements

- Audit before changing. Confirm the current scroll ownership by measurement, not by reading styles.
- Prefer making the inner regions `overflow: visible` at small widths and letting one ancestor scroll,
  over introducing a new positioning or stacking context.
- Verify scroll restoration still works after the change — check the Projects route and the Dashboard,
  both of which use `useRouteViewState`.
- Preserve performance: do not add a resize observer or a scroll listener if a CSS solution exists.
- Keep the change inside the existing Emotion style modules; do not introduce a new styling approach.

### Acceptance Criteria

- At 375×812 on `/projects/:id/workspace?task=save`, `document.elementFromPoint` sampled across every
  text-bearing element in the Save panel never returns the action bar — verified at the top of the
  scroll, at an intermediate position, and at the bottom.
- At most one scrollable ancestor sits between `main` and the active task panel at 375 px.
- "Campaigns" and "Projects" each render on one line in the Dashboard recent-work filter at 375 px.
- No creative tool label clips or breaks mid-word at 375 px.
- Scroll position is still restored on the Projects route and the Dashboard after navigating away and
  back.
- Desktop rendering at 1280×720 is visually unchanged.
- The behaviour holds at 200 % text zoom.

### Regression Protection

- **Scroll restoration is the real risk.** `useRouteViewState` keys on a scroll container; if you
  change which element scrolls, remembered positions can break silently. Test it explicitly.
- The mobile bottom navigation relies on `main`'s 72 px bottom padding. Do not remove it.
- The workspace shares `main` with the Studio capture runtime on this route. Confirm the stage still
  lays out correctly beside the rail at both widths.
- Do not change the Save panel's DOM structure in ways that break `data-project-save-task-panel` or
  other test hooks.

### Validation

Run only:

```bash
bun run --filter @studio/web exec vitest run src/features/projects src/features/dashboard
```

Then the small-mobile cases in `e2e/accessibility-responsive.spec.ts` that cover the Project output
review and the Dashboard, and the affected mobile cases only from `bun run test:visual`. Do not
re-capture baselines for viewports you did not change. Do not run the full E2E or visual suites.

### Completion Report

State: every file changed; which element now owns scrolling at small widths and why; the measured
hit-test result at three scroll positions after the fix; confirmation that scroll restoration still
works on both routes; which visual baselines you re-captured, if any, and why; the validation
commands and their output; and any occlusion you found that you did not fix.
