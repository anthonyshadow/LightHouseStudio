## Implementation Prompt — Step 10: Make every destination a real link

### Objective

Render anything whose only effect is to change route as a real anchor with an `href`, while keeping
client-side routing — so the product behaves like a web application.

### Context

Lightframe Studio has meticulous URL handling. `apps/web/src/app/paths.ts` registers every protected
route once, produces every URL through helpers (`projectPath`, `campaignPath`,
`projectWorkspacePath`, `savedVideoLibraryPath`, `studioVideoPath`), canonicalises thirteen legacy
paths while preserving query and fragment, and is guarded by two route-inventory oracles.

**And yet the entire authenticated application contains exactly one `<a href>`.** Verified in the
running page: `document.querySelectorAll('a[href]')` returns a single element — the skip link,
`#studio-main`.

Everything else that navigates is a `<button>` with a JavaScript `navigate()` call: the primary
sidebar navigation, the mobile bottom navigation, Project rows' "Open", Campaign rows, Dashboard
recent-work rows. Anchors are used **only** for downloads — `Button.tsx:133` documents that anchor
form as existing "for the actions that must be a real link — every `<a download>`".

The cost:

- No cmd-click, ctrl-click or middle-click to open in a new tab
- No right-click "Copy link address"
- No hover URL preview in the status bar
- Assistive technology announces "button" for what is navigation

### User Problem

Work cannot be opened in a second tab, bookmarked from the page, or copied as a link — standard
browser affordances that every user already knows.

### Required Behavior

- Every control whose only effect is to change route renders an `<a href>` carrying the same URL
  `navigate` would have used.
- Ordinary clicks still route client-side, with no full document load.
- Modified clicks (cmd, ctrl, shift, middle) fall through to the browser.
- Nothing changes visually.

### Existing Areas to Inspect

- `apps/web/src/app/paths.ts` — every URL helper. **Every `href` must come from here**, never from a
  hand-built string.
- `apps/web/src/studio/useStudioNavigationActions.ts` — the central navigation actions. The `href` and
  the `navigate` call must come from the same place so they cannot disagree.
- `apps/web/src/studio/StudioHeader.tsx` — the primary rail and the mobile bottom bar
- `apps/web/src/ui/primitives/Button.tsx` — the existing anchor form (`LinkButton`) around line 133.
  **Extend this seam; do not create a parallel one.**
- `apps/web/src/features/projects/ProjectsListSurface.tsx` — row "Open"
- `apps/web/src/features/campaigns/CampaignRouteSurface.tsx`
- `apps/web/src/features/dashboard/DashboardRouteSurface.tsx` — recent-work rows and "Continue Project"
- `apps/web/src/features/projects/ProjectDetailSurface.tsx` — "All Projects" back link
- `apps/web/src/app/AppRouter.tsx` and `ProtectedRoute.tsx` — how routing is set up
- `apps/web/src/studio/StudioExitGuard` (find it) — **read this carefully.** It keys on pathname and
  must still fire when leaving a Project with unsaved in-memory work. Anchor navigation must route
  through the router, not cause a document load, or the guard is bypassed and work is lost.
- `react-router`'s `Link` / `NavLink` — already a dependency

### Scope

- Navigation-only controls: primary and mobile navigation, Project rows, Campaign rows, Dashboard
  recent-work rows, back links, and any other control whose sole effect is a route change.

### Out of Scope

- **Controls that do something before navigating** — create, duplicate, adopt, "Use as the current
  cut". These are actions with a navigation side effect and must stay buttons.
- Overlay open and close. Asset libraries are routes but are presented as shelves over the current
  surface; leave them unless converting one is trivially correct.
- Any visual change whatsoever. Links must look exactly as they do now.
- Restructuring `Button`, `StudioHeader` or any list surface beyond what this needs.
- Adding new routes, or changing any URL.

### UX Requirements

- **No visual change at any viewport.** Focus rings, hover states, active states, sizing and spacing
  must be identical.
- `aria-current="page"` must still resolve on the active destination.
- `Enter` must still activate. `Space` will change from button semantics to link semantics — that is
  correct and expected; do not fight it with a key handler.
- Disabled navigation, if any exists, must remain genuinely unactivatable — an anchor has no
  `disabled`, so handle it by not rendering an `href`, and keep it out of the tab order.
- Touch targets must not change size.

### Technical Requirements

- Use `react-router`'s link component so modified clicks fall through to the browser natively. Do not
  hand-roll `onClick` with `event.metaKey` checks.
- Derive every `href` from `paths.ts` helpers.
- Preserve the exit guard: verify that leaving a Project with unsaved work through a link still
  prompts, exactly as it does through a button today.
- Preserve `location.key` semantics. The shell persists across routes and several effects are keyed
  on `location.key`; link navigation must still produce a new history entry the same way
  `navigate` does.
- Do not regress render performance on lists — an anchor per row is fine; a new context or provider
  per row is not.
- Keep `data-*` test hooks (`data-project-action="open"` and similar) on the element that now carries
  the `href`.

### Acceptance Criteria

- Every navigation-only control renders an `<a href>` with the same URL `navigate` would use.
- Cmd-, ctrl- and middle-click open a new tab and do **not** also navigate the current one.
- Right-click offers "Copy link address" on those controls.
- An ordinary click routes client-side — no full document load.
- `aria-current="page"` still resolves on the active destination.
- The exit guard still fires when leaving a Project with unsaved work via a link.
- No visual regression at any audited viewport.
- Every existing `data-*` hook still resolves.

### Regression Protection

- **The exit guard is the highest risk.** A link that causes a document load bypasses it and loses
  in-memory work. Test this explicitly, on a Project with unsaved changes.
- Scroll restoration (`useRouteViewState`) must still work after navigation.
- The mobile bottom navigation and the desktop rail must both keep their active state.
- Legacy-path redirects must still work when a link points at a canonical path.
- E2E specs select navigation by role. `getByRole('button', …)` on a converted control will now fail;
  update those selectors to `link`.

### Validation

Run only:

```bash
bun run --filter @studio/web exec vitest run src/app src/studio src/features/projects src/features/campaigns src/features/dashboard
```

Then `e2e/app-routing.spec.ts`, and the affected cases from `bun run test:visual` to confirm nothing
moved. Do not run the full E2E suite or re-capture unrelated baselines.

### Completion Report

State: every file changed; the complete list of controls converted and the list you deliberately left
as buttons, with the reason for each; how `href` and `navigate` are kept in agreement; the exit-guard
test you ran and its result; every E2E selector you updated from `button` to `link`; confirmation that
no visual baseline changed; and the validation commands and their output.
