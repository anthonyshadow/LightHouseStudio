# Lightframe Studio — UI/UX audit

**Kind:** product assessment. **Not implementation authority** — it describes the product as
audited, not as it must be. **Audited:** 2026-08-22, branch `develop` at `af55754`.

Two companion documents own the work that follows from this one. Keep them in step: a finding
that is fixed should be struck here **and** in the plan.

| Document                                                    | Owns                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| [UX implementation plan](LightFrameUXImplementationPlan.md) | Execution order, and one ready-to-run prompt per item              |
| [Superdesign prompts](LightFrameSuperdesignPrompts.md)      | The four briefs for areas that need a new layout rather than a fix |

**Date:** 2026-08-22 · **Branch:** `develop` @ `af55754` · **Method:** implementation-first

## Status

**Tier 1 of the plan is complete** (2026-08-22, branch `LightFrameUxImprovements`). These ten
findings are fixed in the product and struck through below and in the plan:

| ID     | Finding                                        | Fixed by                                                    |
| ------ | ---------------------------------------------- | ----------------------------------------------------------- |
| LF-S01 | "Record New Video" does not record             | Idle action relabelled **Start camera**                     |
| LF-S02 | Primary and destructive actions share red      | Idle Record is mint primary; Close demoted to secondary     |
| LF-X04 | Internal language in a blocked reason          | `PROJECT_PROVIDER_START_BLOCKED_REASON` rewritten           |
| LF-C01 | Campaigns promises a non-existent Quick Start  | Description rewritten to name only controls that exist      |
| LF-A02 | A permanently disabled `Export` button         | Wired to the existing `ExportPlacementChooser`              |
| LF-R01 | Brand wordmark breaks to three lines at 320px  | `white-space: nowrap`; mark-only below 22rem                |
| LF-A01 | Download is the hidden action                  | `Download` leads the card; the rest move to the overflow    |
| LF-A04 | Provider model name in UI copy                 | One shared `ASSET_LIBRARY_DESCRIPTIONS`, naming no provider |
| LF-A05 | Two descriptions of the same library           | Same — hub and overlay read from one owner                  |
| LF-D04 | The Dashboard explainer sits below its subject | Moved above the body, restyled as a quiet strip             |
| LF-E03 | The concept explainer omits Studio             | Studio added as the first concept                           |

Two further findings were fixed alongside them, out of tier order, because a visual-regression
failure traced straight to them:

| ID       | Finding                                           | Fixed by                                                 |
| -------- | ------------------------------------------------- | -------------------------------------------------------- |
| LF-S04   | AI tools disappear below 64rem, unexplained       | The rail carries all three tools at every width          |
| LF-A11Y3 | A blocked tool's reason survives only in `title=` | The reason stays visible on mobile, clamped to two lines |

**Tier 2 of the plan is also complete** (2026-08-22, branch `LightFrameUxImprovements2`). These
findings are fixed in the product and struck through below and in the plan:

| ID       | Finding                                            | Fixed by                                                           |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| LF-P03   | "Version" means three different things             | Duplicate Project · Version · Autosaved — one meaning each         |
| LF-P01   | Five peer actions with a red `Archive` among them  | One state-derived primary plus `ActionMenu`                        |
| LF-P02   | Four to five inline actions per Projects row       | `Open` leads; the rest move into the row's `ActionMenu`            |
| LF-A03   | A `<details>` menu with no Escape or outside-click | One `ActionMenu` primitive with real `menu` / `menuitem` semantics |
| LF-DS01  | The breakpoint system is unused                    | `media.up/down/between/downOrShort`; 140 occurrences migrated      |
| LF-DS02  | There is no page shell                             | `PageShell` + `PageHeader`, on all five top-level surfaces         |
| LF-D01   | The Dashboard has no page max-width                | Same — `PageShell` caps it at 88rem                                |
| LF-P06   | `h1` to 4rem and `borderRadius: 0` on all buttons  | Same — one title scale, and the blanket radius rule is deleted     |
| LF-C02   | Three levels of nested bordered surfaces           | Same — Campaigns nests exactly one, the campaign card              |
| LF-S06   | Take review hides the take on mobile               | A 45dvh bottom sheet; the stage stays visible above it             |
| LF-S07   | Eight technical chips precede the decision         | Duration and resolution inline; the rest behind `Details`          |
| LF-S08   | "Close and release" / "temporary in-memory take"   | `Close without saving`, and three neighbouring strings to match    |
| LF-S09   | Up to six peer actions at peak decision pressure   | One primary, one danger, four in an `ActionMenu`                   |
| LF-A11Y1 | `border` 1.58:1, `borderStrong` 2.44:1             | 3.08:1 and 3.59:1 worst case; the old value becomes `divider`      |

Tier 2 also removed a latent defect neither this audit nor the plan had found: **Escape inside a
popover that sat inside an `OverlayPanel` closed the whole panel**, because `useDismissiblePopover`
listened in the bubble phase behind the panel's own handler.

Tiers 3–5 are open. Everything else in this document still describes the product as audited.

---

## How this audit was produced

Every finding below was derived from the running implementation — component source, style
modules, the theme, and the committed visual baselines in `screenshots/chromium-darwin/` (the
`Aug 21 22:41` set, which matches current `develop`). Documentation in `docs/` was read for
_intent and vocabulary only_; where it disagrees with the code, the code wins and the
disagreement is recorded.

Two stale-artifact traps were found and avoided:

- `screenshots/.../06-voice/voice-browser-loaded.png` and the other `Aug 5–7` PNGs show a
  **retired design** (top header bar, tool rail named `Dock / Workshop / Shelf`). They are not
  evidence about the current product. Only the `Aug 21` baselines were used.
- `docs/product-audit/03-ui-ux-audit.md` contains findings that **have since been fixed**.
  See "Documentation that no longer matches the product" below.

Contrast figures were computed directly from `apps/web/src/ui/theme.ts` against WCAG 2.1
formulas, not estimated.

---

## Documentation that no longer matches the product

These are recorded because the user asked for discrepancies explicitly. They are _not_ UX
defects — they are stale docs that will mislead the next person who reads them.

| Doc claim                                                                                                                                         | Location                                                | Reality in code                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Nothing is marked active while in Studio" (IA1)                                                                                                  | `docs/product-audit/03-ui-ux-audit.md`                  | **Fixed.** `StudioHeader.tsx` now lists `studio` in `destinations`; `aria-current="page"` resolves.                                                               |
| "Videos and Voices show no count" (IA2)                                                                                                           | same                                                    | **Fixed.** `AssetsRouteSurface.tsx` queries both, with a three-state `AssetCountState` and a real skeleton.                                                       |
| Dashboard order is "greeting → onboarding → Processing Queue → Continue → Recent"                                                                 | same                                                    | **Changed.** Current order is header → Continue + Recent → onboarding → Processing Queue. The new order has its own problem (see LF-D04), but not that one.       |
| "Unassigned Content — These legacy or independently saved videos have no trustworthy producing Project…" is the first thing in the Videos library | same                                                    | **Fixed.** Now a single `No Project` chip (`VideoGallery.tsx:212`).                                                                                               |
| Exposed jargon list: `Revision 5`, `working media`, `presented media`, `creative checkpoint`, `Save creative setup`, `Media Asset`                | same                                                    | **Mostly fixed.** Replaced with "current cut", "Creative setup", "Save progress". One raw string survives — see **LF-X04**, which is worse than any on that list. |
| "Mobile uses … **four-item** bottom navigation for Dashboard, Projects, Campaigns, and Assets"                                                    | `.superdesign/design-system.md`                         | **Five items.** `StudioHeader.tsx` renders the same `destinations` array (incl. Studio) into `mobileNavigationStyles`, which is `repeat(5, …)`.                   |
| "standalone **Quick Start** remains available in Projects"                                                                                        | rendered in the product, `CampaignRouteSurface.tsx:292` | **Quick Start does not exist.** Zero UI occurrences outside this sentence; the control is called `New Project`. This is a live copy defect, logged as **LF-C01**. |
| "Use one primary action per screen, consistent overflow menus for secondary actions"                                                              | `.superdesign/design-system.md`                         | **Not upheld.** Project overview shows 5 peer buttons, take review up to 6, the upload result 4 full-width buttons.                                               |

---

# Phase 1 — What the application actually is

## Route table (from `apps/web/src/app/paths.ts`, verified against `AppRouter.tsx`)

| Route                                                  | Surface                                    | Mounts capture runtime? |
| ------------------------------------------------------ | ------------------------------------------ | ----------------------- |
| `/`                                                    | `EntryPage` — splash + `LoginDialog`       | no                      |
| `/dashboard`                                           | `DashboardRouteSurface`                    | no                      |
| `/studio/create`                                       | `StudioApp` (standalone creation)          | **yes**                 |
| `/studio/create/live`                                  | `LiveBetaRouteSurface` (gated)             | no                      |
| `/studio/:videoId`                                     | `StudioApp` with a saved video loaded      | **yes**                 |
| `/projects`                                            | `ProjectsListSurface`                      | no                      |
| `/projects/:id`                                        | `ProjectOverviewSurface`                   | no                      |
| `/projects/:id/workspace?task=`                        | `ProjectWorkspaceSurface` beside the stage | **yes**                 |
| `/campaigns`, `/campaigns/:id`                         | `CampaignRouteSurface`                     | no                      |
| `/assets`                                              | `AssetsRouteSurface` (hub of 4 cards)      | no                      |
| `/assets/videos`, `/characters`, `/outfits`, `/voices` | **overlays** over the hub                  | no                      |

Plus 14 legacy redirects. `/studio` alone redirects to `/dashboard`.

## Architecture that shapes the UX

`AuthenticatedShell` is persistent: it owns the nav rail, the query cache, the asset-library
overlays, session lifecycle and awaitable confirmations. The capture runtime (`StudioApp`) is
lazy and mounts on exactly three routes. This is a genuinely good decision and it shows —
navigation is fast, lists do not refetch, and leaving Studio actually releases the camera.

**The consequence a designer must respect:** the asset libraries are _not pages_. They are
`OverlayPanel`s keyed on `location.pathname` (`StudioLibraryOverlays.tsx`). Any redesign that
turns them into pages breaks the "keep your place" behaviour deliberately built in.

## Component inventory

- **Real primitives** (`apps/web/src/ui/primitives`): `Button`, `IconButton`, `OverlayPanel`,
  `ConfirmationDialog`, `StatusNotice`, `Surface`, `SelectField`, `TextField/TextAreaField`,
  `SegmentedControl`, `ListSearchField`, `SearchEmptyState`, `EmptyStatePreview`, `AppIcon`,
  `ImagePickerDropField`, `ReferenceImagePreview`, `VisuallyHidden`.
- **Support hooks**: `overlayStack`, `useDismissiblePopover`, `useMenuKeyboardNavigation`,
  `useAwaitableQuestion`, `useListSearch`.
- **Tokens** (`ui/theme.ts`): 30 colours, 4 radii, 7 spaces, 6 font sizes, 4 shadows, 2 motion
  durations, layout rows, z-layers, **and 4 breakpoints that are used exactly once.**

---

# Phase 2 — Screen-by-screen audit

## 2.1 Entry `/`

**Purpose.** Identify the product, get the user signed in, restore a deep link.

**Works well.** Restores an existing session automatically and honours a `from` destination
(`EntryPage.tsx:60–68`, `canonicalizeProtectedDestination`). Button label is state-aware
(`Restoring… / Open Dashboard / Log in`). Focus is placed correctly on return visits only.

**Does not work.**

- The single explanatory sentence — _"Create a video quickly, resume focused **Project** work,
  or organize **Projects** in **Campaigns**"_ — introduces two proprietary nouns before the user
  has seen anything. It describes the data model, not the outcome.
- There is nothing else: no screenshot, no example, no capability list. A first-time user cannot
  tell whether this is a screen recorder, an editor, or an AI tool.
- No "what happens if I log in" affordance and no way to look before committing.

## 2.2 Dashboard `/dashboard`

**Purpose.** Orient, resume, and start.

**Works well.**

- `Create video` is a single, unambiguous, visually dominant primary action.
- Recent Work merges Projects, Videos and Campaigns into one time-sorted list with posters —
  genuinely the right model, and the poster URLs are derived from data the lists already carry
  (`projectPosterPresentation.ts`), so a row costs no extra request.
- Per-kind empty states each carry a message, a concrete example, and an action
  (`DashboardRouteSurface.tsx`, the `emptyRecent` map). This is a strong pattern.
- Errors are section-scoped with a Retry, not page-level.

**Does not work.**

- **Layout is inverted against content.** `dashboardBodyStyles` gives the left column
  `1.5fr` and the right `1fr`. The left column holds exactly one card ("Continue Work"); the
  right holds the actual list. The baseline screenshot shows ~350px of dead space under the
  Continue panel.
- **No page max-width.** `dashboardStyles` sets `marginInline: 'auto'` with no `maxWidth`, so on
  a 2560px display the header spans the full viewport while every sibling page is constrained.
- **The explainer is below the content it explains.** The "Organization is optional. Use
  Projects… and Campaigns…" line renders _after_ Recent Work. A user meets "No Campaign",
  "Campaign Project" and a Campaigns filter tab before they are told what those mean.
- **Processing Queue is an operations panel on a creative home.** Even idle it takes a bordered
  section with a Refresh control. In the baseline it renders a full-width red error block.
- **`Browse Assets` does not look like a control** — `paddingInline: 0` on a `quiet` button
  makes it read as body text next to a filled primary.
- The Recent filter is a **bespoke** toggle group (10px uppercase, `aria-pressed`, no container)
  while the product owns `SegmentedControl`.

## 2.3 Studio `/studio/create`

**Purpose.** Record or upload, and transform.

**Works well.**

- Two-action bottom bar — `Record New Video` / `Upload Video` — is the clearest CTA pair in the
  product.
- Disabled tools **state their condition** rather than going silently grey
  (`CreativeWorkspace.tsx`, `editVideoBlockedReason` → `<small data-tool-blocked>`). Excellent.
- The idle stage sets privacy expectations at the exact moment it matters: _"Camera and
  microphone remain off until you select Start camera."_
- `StudioExitGuard` protects in-memory work on every exit path.
- Capture settings rest **collapsed** and hand their column back to the stage
  (`stageColumnStyles`, `[data-capture-settings="collapsed"]`).

**Does not work.**

- **`Record New Video` does not record.** `startLocalRecording` calls `session.startLocal()`,
  which only opens the camera preview. The user must then find a _second_, differently-styled
  `Record` button in the control bar. The most important label in the product is wrong.
- **`Record` and `Close` are both red.** `recordActionStyles` uses `colors.recording` on
  `recordingSoft`; `Close` uses `variant="danger"`. At 390px they are visually indistinguishable
  (see the mobile baseline). Primary and destructive share a colour.
- **The stage does not fill its space.** In `initial-closed.png` the 16:9 frame occupies roughly
  45% of the column height; the rest is empty canvas.
- **AI tools vanish below 64rem.** `showDesktopAiTools` removes Select Character and Select
  Outfit entirely on tablet/mobile, with no message. On mobile the tool rail is one button.
- The rail's permanent footnote — _"Local-first workspace · generated references persist
  locally"_ — consumes a tool slot with an unactionable statement, and its full text is only in
  a `title` attribute.
- The right column is titled **"Session and device information"**, a systems label on a creative
  surface.

## 2.4 Take review

**Purpose.** Decide what to do with the clip you just recorded.

**Works well.** Save is primary and state-aware (`Saving… / Saved to Assets`). Discard asks
first via `useConfirmationRequest`. Actions collapse sensibly at `22.49rem`.

**Does not work.**

- **On mobile the review panel covers the video it is reviewing.** The copy says _"Playback
  remains on the main stage"_ — which is exactly the surface the panel is on top of.
- **Eight technical chips before the decision**: `Local Camera`, `2:30 PM`, `Video: Synthetic
camera`, `Audio: Synthetic microphone`, `64 × 64`, `5 fps`, `0:00`, `7.5 KiB`, `video/mp4`.
  Codec and file size are not review criteria.
- **Duplicate heading** — the overlay chrome says "Latest Take" and the body says "Latest take".
- **Up to six peer actions**: Save to Assets · Replace Saved Version · Edit video · Discard ·
  Voice treatments · Close and release.
- **"Close and release"** and the tooltip _"release the temporary in-memory take"_ are
  implementation vocabulary.

## 2.5 Video editor

**Purpose.** Trim, crop, rotate, light and filter a clip locally.

**Works well.** Tool → settings → preview is the right three-part structure. `Preview before`
gives a before/after. `Reset all` plus per-tool reset. Terminal actions are explicit
(`Save edited video` / `Discard`).

**Does not work — this is the weakest screen in the product.**

- **The media is the smallest element on screen.** At 1440×960 the preview is roughly 500×300 in
  a ~1100px-wide region; the settings panel is taller than the video. For a colour-grading and
  cropping tool, the thing being judged must dominate.
- **No timeline.** Trim exists as a tool but the only transport is a mini play bar. You cannot
  see the clip, scrub frames, or see where the trim points fall.
- **Undo/redo are two unlabelled low-contrast glyphs** (`↰ ↱`) in the settings header.
- **`Reset tool` is orphaned** at the very bottom of the tool column, ~600px below the tool it
  resets.
- **Mobile is inverted further**: the preview is ~120px tall, the tool row truncates
  (`Lighting` → `Lig`) with no scroll affordance, and the aspect options are clipped.

## 2.6 Use existing video (upload + AI transforms)

**Purpose.** Bring in a video and run Character Swap, Virtual Try-On, and/or Voice.

**Works well — the best-designed flow in the product.**

- `Source → Edit → Review` step indicator with completion ticks.
- Tools grouped by constraint: _"Visual edit · Choose one"_ and _"Voice · Optional"_.
- The CTA **states the plan**: `Apply Character Swap, then Northstar Narrator`
  (`ExistingVideoActionBar.readyActionLabel`). This is a model other screens should copy.
- Unavailable tools explain why, distinguishing "aspect ratio unsupported" from "not configured".
- Original/Result toggle for comparison.

**Does not work.**

- **Two video-player languages.** This panel uses the browser's native `<video controls>`;
  Studio and the editor use a custom player. Same product, two chromes.
- **Four full-width, identically-sized footer buttons** — Save to Assets, Edit result, Start over
  from original, Discard video and result. Nothing indicates the expected next step.
- **Three names for one destination**: `Save to Assets` (here), `Saved Videos` (empty-state
  copy), `Videos` (nav and overlay title).
- A large empty region between the source card and the footer at 1440px.

## 2.7 Projects `/projects`

**Purpose.** Find and manage focused, resumable work.

**Works well.** Search with a status count, Active/Archived sections, `No Campaign` grouping,
poster thumbnails, a teaching empty state with a worked example, and `Load more` pagination.

**Does not work.**

- **It looks like a different product.** `projectsWorkspaceHeaderStyles` sets
  `fontSize: clamp(2.4rem, 5cqi, 4rem)` with `letterSpacing: -0.055em` — up to **4rem**, against
  Dashboard's 1.875rem cap. `projectsWorkspaceInnerStyles` then forces `'& button': { borderRadius: 0 }`,
  making every control square while Assets and Campaigns use `radii.large`.
- **Four to five inline actions per row**: Open · Rename · Make another version · Archive
  (· Delete). Row-level management competes with row-level opening.
- `Make another version` (duplicate a Project) collides head-on with `Add Version` (a saved video
  version) and `Version 3 · Current` in the Videos library. See **LF-P03**.

## 2.8 Project overview `/projects/:id`

**Works well.** Breadcrumb resolves to the real parent (`← All Projects` or `← <Campaign name>`).
The primary CTA is state-derived: `Add original video` → `Continue editing` → `View workspace`.
`ProjectWorkflowProgress` shows where the Project stands.

**Does not work.**

- **Five peer buttons with a red destructive one in the default row**: Continue editing (primary)
  · Make another version · Move Project · Rename · **Archive (danger)**.
- `Original video ready • Create workflow active.` — "workflow phase" surfaced as UI text.
- `History` is rendered as step 4 of 4 in the progress strip. It is a record, not a step.

## 2.9 Project workspace `/projects/:id/workspace`

**Works well.** Four tasks as a real `role="tablist"` with arrow-key navigation and URL pinning
(`?task=`), so a task is linkable and Back does not walk through tabs. The workspace opens on the
step the Project is actually up to, latched on entry so a background change cannot yank the panel.
History mounts on demand. Save status is a polite live region.

**Does not work — the save model is the single most confusing thing in the product.**
Four save concepts coexist on one screen:

1. `All changes saved` — the auto-saving Project revision.
2. `Save progress` — an explicit button in the Creative setup panel.
3. `Save as New Video` — creates a Saved Video.
4. `Add Version` — appends to an existing Saved Video.

The product knows this is confusing, because it ships a disclaimer inside the Save panel:

> _"All changes saved" refers to your saved progress. Render preview, Save as New Video and Add
> Version are separate actions you take yourself._

Shipping an explanation of your own status message is the clearest possible signal that the
model needs redesign, not more copy.

Also: `The current cut is now that version. Nothing was copied, your original video was not
replaced, and no new version was saved.` — three consecutive negations in one confirmation.

## 2.10 Campaigns `/campaigns`

**Works well.** Create → detail navigation, archive that explicitly promises _"Projects remain
intact"_, and a search field with a result count.

**Does not work.**

- **Live copy references a feature that does not exist**: _"standalone Quick Start remains
  available in Projects."_ There is no Quick Start anywhere in the UI.
- **Boxes inside boxes inside boxes**: page container (bordered, `radii.large`) → `Active
Campaigns` section card → campaign card. Three nested surfaces for one item.
- The `Archived` section renders a large empty box even with zero archived campaigns.
- `Clear search` sits ~30px below the field's baseline in the baseline screenshot.
- One campaign fills a `minHeight: 12rem` card with three peer actions (Open · Edit · Archive).

## 2.11 Assets `/assets` + the four library overlays

**Works well.** `AssetCountState` is a genuinely careful three-state model — "not read yet" and
"none saved" are different answers and the card refuses to render `0` for the first. It reserves
the count's footprint with a skeleton so cards do not jump. Browser-local storage is disclosed
per card. The Videos library has search + character + format + sort filters, per-version preview,
and a real empty state.

**Does not work.**

- **`/assets` is a page whose only job is to be a menu.** Four cards, each with one button, each
  opening an overlay. Everything is two clicks deep from a nav item that could have been four.
- **`Download` is buried.** Every Videos card leads with `Open in Studio` (primary, full width);
  Download is inside a `<details>` overflow menu. For a finished asset, download is the goal.
- **A permanently disabled `Export` button** ships in the preview footer with the note
  _"Export formats and channels are not specified yet. Download remains available."_
  Meanwhile `ExportPlacementChooser` exists and works — under the label _"Where is this going?"_
  in the Project save step. The product has export, and tells you it doesn't.
- **`<details>`-based overflow menu** — no outside-click dismissal, no Escape, no `role="menu"`,
  unlike the header's `useDismissiblePopover` + `useMenuKeyboardNavigation` pattern.
- **A provider model name in the UI**: the Characters overlay reads _"Manage your Lucy 2.5 cast
  and their wardrobe."_
- **The same library is described two different ways** — Assets card: "Manage reusable characters,
  copies, and Wardrobe variants." Overlay: "Manage your Lucy 2.5 cast and their wardrobe."
- The Characters/Outfits overlays render `CreativeLibraryPortability` (export/import) **above**
  the library itself.
- Raw values as chips: `version.origin` and `video.status` are rendered unmapped.
- Videos empty state uses internal flow names: _"Finish a Project with Save as New Video or Add
  Version."_

## 2.12 Character builder

**Works well.** Three approachable steps (`Start with a look` → `Refine details` → `Preview &
Save`), autosaved drafts, a paid-generation disclosure at the moment of spend, and a name dialog
before commit.

**Does not work.**

- **Two save buttons with an unclear difference**: `Save & Use Image Only` and `Save Character`.
- The primary CTA can become `Save Character (prompt only)` or `Save Character (uploaded image)`
  — a technical qualifier inside the button.
- Up to **five** footer controls plus a status line; on a 320px screen the footer takes ~25% of
  the viewport.
- The eyebrow reads `✎ Interactive Design · Jump to any step` — decoration, not information.

## 2.13 Global chrome

**Works well.** One rail across every authenticated route, `aria-current` on the active
destination, an availability popover with a real status dot, a read-only account panel, and a
"How Lightframe works" explainer that answers _when to use_ each concept rather than _what it
is_. `Quick Create` even carries the reassurance _"Projects and Campaigns are optional."_

**Does not work.**

- The Help panel documents Videos, Projects, Campaigns, Characters, Outfits and Voices — and
  **omits Studio**, the one destination you cannot create anything without.
- Three routes to one URL: rail `Studio`, Dashboard `Create video`, and Quick Create → `New
video` all navigate to `/studio/create` with no differentiation.
- `Quick Create → Video` then offers `New Video` / `Record Video` / `Upload Video`, where "New
  Video" is the same as "Record Video" minus the auto-start. Three options, two outcomes.
- There is **no Settings destination at all.** No defaults, no preferences, no output quality, no
  theme. Account is read-only.

---

# Phase 3 — First-time user audit

Walking the product cold, in order.

| Moment                                       | Can a new user proceed?                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Entry screen                                 | Yes — one button. But they still don't know what the product does.                   |
| "What is this?"                              | **No.** One sentence, and it uses "Project" and "Campaigns" as proper nouns.         |
| Dashboard                                    | Yes — `Create video` is unmissable. Best first-run moment in the product.            |
| "What's a Campaign?"                         | **Only if they scroll past it.** The explainer is below the fold, under Recent Work. |
| "What's a Project?"                          | Partially. Help panel is good but is a small `Help` item at the bottom of the rail.  |
| "What's the Studio?"                         | **No.** The Help panel omits it entirely.                                            |
| Studio: how do I start?                      | Yes — `Record New Video` / `Upload Video`.                                           |
| "I clicked Record — why isn't it recording?" | **No.** The camera opens; a second Record button must be found.                      |
| "I finished a take — now what?"              | **Weakly.** Six peer actions; on mobile the panel hides the clip.                    |
| "Where did my video go?"                     | **No.** Saved to "Assets" → find it under Assets → Videos → card → menu.             |
| "How do I download it?"                      | **No.** Two clicks inside an overflow menu, next to a disabled Export.               |
| "How do I apply AI?"                         | Yes on desktop. **No on mobile/tablet** — the tools do not render.                   |
| "How do I organise this?"                    | Yes, and the product correctly says it is optional.                                  |
| "Where are my settings?"                     | **They don't exist.**                                                                |

**Verdict.** The product is _learnable_ but not _self-explanatory_. Its concept model is honest
and its empty states teach well; what fails is the first 90 seconds. A newcomer is told the data
model before the outcome, is given a Record button that doesn't record, and finishes their first
video without an obvious way to get the file.

**The single structural cause:** the product asks the user to understand _where things live_
(Assets, Projects, Campaigns) before it lets them understand _what they can make_.

---

# Phase 4 — Flow audit

| Flow                           | Steps                                                                                            | Verdict                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Login → Dashboard              | 2                                                                                                | **Good.** Deep links preserved.                                    |
| Dashboard → record → save      | Create video → Record New Video → _find Record_ → Stop → Save to Assets = **5**                  | **Broken at step 3.** The label promises recording.                |
| Dashboard → upload → AI → save | Quick Create → Video → Upload Video → pick file → tool → configure → Apply → Save = **8**        | **Good.** Guided, states the plan, comparable result.              |
| Find a saved video             | Assets → Videos → search/filter → card = **4**                                                   | **Two too many.** Assets is a menu page.                           |
| Download a saved video         | …→ card → `…` menu → Download = **6**                                                            | **Worst flow in the product.** The end goal is the deepest action. |
| Create a Project               | Quick Create → New Project → dialog → Create = 4                                                 | Fine. Naming is optional — good.                                   |
| Project: source → edit → save  | Add original video → workspace → Create → run → Save → choose Save as New Video _or_ Add Version | **Confusing at the last step.** Four save concepts.                |
| Return to previous work        | Dashboard → Continue Project                                                                     | **Excellent.** One click, state preserved.                         |
| Back navigation                | `useRouteBack` uses real history with a safe fallback                                            | **Excellent.**                                                     |
| Leave Studio with unsaved work | `StudioExitGuard` confirms                                                                       | **Excellent.**                                                     |
| Switch a Project task          | `?task=` with `replace`                                                                          | **Excellent.** Back leaves the workspace, not the tab.             |

**Where users will stop or misfire:**

1. After pressing "Record New Video" and nothing records.
2. At take review, choosing between six actions with no recommended path.
3. Looking for the finished file.
4. At the Project Save step, choosing between "Save progress", "Save as New Video" and "Add Version".
5. On mobile, looking for Character Swap and finding no trace of it.

---

# Phase 5 — Information architecture

**The current model is right; its _presentation_ is wrong.**

The underlying model — _a video is the unit; Projects and Campaigns are optional wrappers_ — is
correct for this product, and the UI says so out loud in three places. That is genuinely well
judged and should be preserved.

What is wrong:

1. **Nav gives five slots to four kinds of thing.** Dashboard (a view), Studio (a verb),
   Projects (a container), Campaigns (a container of containers), Assets (a menu). Studio is the
   only _action_ in a list of _places_, and it is the one users need most.

2. **Assets is a menu masquerading as a destination.** Four cards → four overlays. Given the
   overlays already key off `pathname`, the rail could open them directly.

3. **Campaigns has earned less weight than it is given.** A Campaign is a name plus an optional
   brief that groups Projects. It occupies a permanent top-level slot on desktop _and_ mobile.

4. **"Version" means three different things.** A Project duplicate ("Make another version"), a
   Saved Video version ("Add Version", "Version 3 · Current"), and a Project revision (auto-saved,
   surfaced as "All changes saved"). This is the highest-value terminology fix available.

5. **Nothing tells the user an asset library is an overlay.** No breadcrumb, no hint that Escape
   returns to the hub.

**Should the user learn Campaign → Project → Asset before creating?** No — and the product
already agrees. The remaining work is to stop _showing_ the hierarchy before it is relevant:
`Create video` should never require passing a container, and container language should not appear
on the Dashboard before the explainer that defines it.

---

# Phase 6 — Cross-page visual consistency

## The most serious inconsistency: there is no page shell

Four top-level surfaces each invent their own frame.

| Surface          | Container                                        | Max width    | `h1` size                       | Buttons               |
| ---------------- | ------------------------------------------------ | ------------ | ------------------------------- | --------------------- |
| Dashboard        | full-bleed on `canvas`                           | **none**     | `clamp(1.5rem, 3vw, 1.875rem)`  | default radii         |
| Assets           | **bordered card**, `radii.large`, `canvasRaised` | none         | `clamp(1.75rem, 4vw, 3rem)`     | default radii         |
| Campaigns        | bordered card + nested section cards             | none on page | ~2rem                           | default radii         |
| Projects         | full-bleed, `clamp` inline padding               | none         | `clamp(2.4rem, 5cqi, **4rem**)` | **`borderRadius: 0`** |
| Project overview | `width: min(100%, 88rem)`                        | **88rem**    | `clamp(2.25rem, 4cqi, 3rem)`    | mixed                 |

A user moving Dashboard → Projects sees the page title more than **double** in size and every
button lose its corners. Moving Projects → Assets, the page acquires a border and a background.
These read as three different products.

**Canonical pattern to standardise on:** Project overview's `width: min(100%, 88rem);
margin-inline: auto`, on `canvas`, with no page-level border — plus one shared `h1` scale.

## Other consistency defects

| #   | Where               | What differs                                                                                                                                                                                                                                                         | Why it matters                                                                    | Canonical                                                                                                         |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Everywhere          | `theme.breakpoints` is used **once** (`ProjectVideoPreviewPlayer.tsx:125`). The codebase hard-codes **29 distinct `max-width` values** and 10 `min-width` values.                                                                                                    | Components reflow at unrelated widths, so intermediate sizes look half-collapsed. | Four theme breakpoints; everything else derived.                                                                  |
| 2   | Choose-one controls | `SegmentedControl` (export placement) vs bespoke `aria-pressed` toggles (Dashboard filter) vs `Button variant="quiet" aria-pressed` (Projects groups) vs `role="tablist"` (Project tasks) vs `<ol>` steps (upload phases) vs `SegmentedControl` again (Voices tabs). | Six visual answers to one interaction.                                            | `SegmentedControl` for filters; `role="tablist"` only for real tab panels; the `<ol>` step indicator for wizards. |
| 3   | Icons               | `AppIcon` (13 names, `strokeWidth 1.8`) vs `CreativeWorkspace.ToolIcon` (`1.6`) vs `StudioLibraryOverlays` inline plus (`2`) vs 10 more files with local SVG. 26 inline `<svg>` across 13 files.                                                                     | Different weights side by side in the same rail.                                  | Extend `AppIcon`; delete local sets.                                                                              |
| 4   | Download links      | `<a download>` hand-restyled to mimic `Button variant="secondary"` in `VideoGallery.styles.ts:357`, `ProjectHistorySection`, `SavedVideoSuccessActions`.                                                                                                             | Three copies of the button's look that will drift.                                | A `Button as="a"` / `LinkButton` variant.                                                                         |
| 5   | Text-link buttons   | `Button variant="quiet"` + `paddingInline: 0` used as a link in Dashboard actions/footer, onboarding, queue Refresh, breadcrumbs.                                                                                                                                    | Buttons that look like text, inconsistently.                                      | A real `link` variant.                                                                                            |
| 6   | Loading             | 37 `role="status"` fallbacks, **25 distinct strings**, one skeleton in the whole app.                                                                                                                                                                                | Layout shift; a "cheap" feel on a media product.                                  | Skeletons for lists/grids; text only for whole-route suspense.                                                    |
| 7   | Video players       | Native `<video controls>` in the upload panel and Videos preview vs custom transport in Studio and the editor.                                                                                                                                                       | Two chromes for the same object.                                                  | One player component.                                                                                             |
| 8   | Overflow menus      | Header uses `useDismissiblePopover` + `useMenuKeyboardNavigation` + `role="menu"`. `VideoGallery` uses raw `<details>`.                                                                                                                                              | The second does not close on outside click or Escape.                             | The header pattern.                                                                                               |
| 9   | Brand at tablet     | Wordmark hidden 48–64rem, shown below 48rem and above 64rem.                                                                                                                                                                                                         | The brand disappears only in the middle.                                          | Show or hide consistently.                                                                                        |
| 10  | Empty sections      | Campaigns always renders an empty `Archived` box; Projects renders one too; Dashboard hides its empties.                                                                                                                                                             | Empty boxes read as broken.                                                       | Collapse to one line when zero.                                                                                   |

---

# Phase 7 — Visual hierarchy & cognitive load

**Dashboard.** Eye lands on `Dashboard` (display type) then the mint `Create video`. Correct.
Then it falls into a large empty area. The list — the actually useful content — is in the
narrower right column.

**Studio idle.** Eye lands on the stage headline _"Your private creative stage."_ Correct. But
the two real CTAs are ~280px below it at the very bottom of the viewport, separated by dead space.

**Studio live.** `Record` and `Close` are the same colour and weight. The eye cannot tell which
is the action and which is the exit.

**Video editor.** Eye lands on the **settings panel**, the tallest brightest element. The video
is a small dark rectangle. Exactly backwards.

**Take review.** Eye lands on eight metadata chips. The decision is below them.

**Project overview.** Eye lands on the title, then on the **red Archive button**, because it is
the only coloured element in a row of five.

**Upload result.** Four identical full-width buttons — no first read.

**Progressive-disclosure opportunities**

- Take review: show duration + resolution; put codec/fps/size behind "Details".
- Project overview: keep `Continue editing`; move Rename/Move/Duplicate/Archive to a `…` menu.
- Projects list rows: `Open` + `…`.
- Videos cards: `Download` primary, `Open in Studio` in the menu, or a split button.
- Studio: hide the availability/device column until the camera is on or something is blocked.
- Campaigns: collapse `Archived` to a one-line toggle when empty.

---

# Phase 8 — Creative-tool UX

> **Does it feel like a coherent creative workflow, or features arranged around a video?**

**Coherent:** the upload → transform → compare → save flow. It names the plan, groups tools by
constraint, gates on real capability, discloses cost at the point of spend, and ends with an
Original/Result comparison. This is a real creative workflow and it is the product's best asset.

**Features around a video:** the local video editor, and the Project workspace's save step.

The editor fails the first rule of creative tooling — _the work is the largest thing on screen_.
It has no timeline, so Trim is a numeric operation on something you cannot see. Undo/redo are
unlabelled glyphs. Reset is 600px from what it resets. There is no A/B beyond a "Preview before"
button, no zoom, no keyboard shortcuts, no frame stepping.

The Project workspace fails the second rule — _the user must always know what state their work is
in_. Four competing save concepts, one auto and three manual, with a shipped disclaimer.

| Dimension            | Verdict                                                          |
| -------------------- | ---------------------------------------------------------------- |
| Media prominence     | **Poor** in editor and Studio idle; good in Project workspace    |
| Tool discoverability | Good on desktop; **absent** on mobile for AI tools               |
| Tool grouping        | **Excellent** in upload panel; flat elsewhere                    |
| Before/after         | Good in upload; weak in editor; none in Studio                   |
| Version handling     | Powerful but **three meanings of "version"**                     |
| Undo/reset           | Present but poorly labelled and poorly placed                    |
| Processing states    | **Excellent** — queue, per-job status, abandon with cost warning |
| Export               | **Contradictory** — works in Projects, disabled in Videos        |
| Original vs modified | **Excellent** — the immutable original is a first-class idea     |

---

# Phase 9 — Responsive audit

| Size               | Assessment                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wide (≥1920px)** | Dashboard and Projects stretch edge to edge (no page max-width) while Project overview caps at 88rem. Studio's stage does not grow into the space.                                                                     |
| **Desktop (1440)** | Best supported. Dead space under the Continue panel; the editor's preview does not scale up.                                                                                                                           |
| **Laptop (1280)**  | Fine. Note the Dashboard collapses to one column at 71.99rem while the rail changes at 64rem — unrelated thresholds.                                                                                                   |
| **Tablet (834)**   | Rail stays but the wordmark disappears (48–64rem rule) while the account name truncates to `Lightframe…`. Large rail dead space. (AI tools no longer vanish — LF-S04 fixed.)                                           |
| **Mobile (390)**   | Solid bottom nav, good stage. Capture summary truncates (`64×6…`). (Two red buttons and absent AI tools both fixed — LF-S02, LF-S04.)                                                                                  |
| **Small (320)**    | **Broken.** The brand wordmark wraps to three lines: `Ligh / tfra / me`. Bottom-nav labels crowd. Assets needs ~5 screens of scroll for 4 navigation cards. The editor preview is ~120px tall with a clipped tool row. |

Technically responsive at every size; the _experience_ degrades sharply below 64rem because
capability is removed rather than reorganised.

---

# Phase 10 — Accessibility & interaction quality

## Genuinely strong — preserve all of this

- **Colour contrast passes everywhere for text.** Computed against `theme.ts`:

  | Token       | on `canvas` | on `surfaceStrong` |
  | ----------- | ----------- | ------------------ |
  | `text`      | 18.10       | 14.80              |
  | `textMuted` | 10.50       | 8.59               |
  | `textFaint` | 5.92        | 4.84               |
  | `accent`    | 12.63       | 10.33              |
  | `danger`    | 8.04        | 6.57               |
  | `recording` | 6.43        | 5.26               |

  Even the faintest token clears AA on the darkest surface. `onAccent` on `accent` is 12.06.

- `OverlayPanel` is a properly built modal: portal, `aria-modal`, labelled/described, focus trap,
  Escape, an overlay **stack** so nested dialogs behave, `inert` isolation, focus restoration with
  a StrictMode-remount guard, and reduced-motion-aware exit.
- Skip link → `#studio-main`; focus moved to `<main>` on route change but **not** on cold entry.
- `aria-current="page"` on nav; `role="tablist"` with arrow keys in the Project workspace.
- Polite live regions for search counts, save status and announcements.
- `2.75rem` (44px) minimum on effectively every control.
- Global `prefers-reduced-motion` reset plus per-animation handling.
- `axe-core` runs in `e2e/accessibility-responsive.spec.ts`.
- Disabled controls carry their reason via `aria-describedby`, not just visually.

## Real issues

| #   | Issue                                                                                                                                                                                                                                                | Impact                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| A1  | **Non-text contrast fails.** `border` #293642 on `canvas` = **1.58:1**; `borderStrong` = **2.44:1**. WCAG 1.4.11 requires 3:1. `borderStrong` is the _input_ border (`FormControl.styles.ts`) and `border` outlines cards and the segmented control. | Field and card boundaries are invisible to low-vision users and on poor displays. |
| A2  | `VideoGallery`'s `<details>` menu has no Escape, no outside-click close, no `role="menu"`, no roving focus.                                                                                                                                          | Keyboard users get stuck; the menu stays open behind other UI.                    |
| A3  | On mobile, `[data-tool-label] small { display: none }` hides the blocked-reason text, leaving it only in `title=`.                                                                                                                                   | Touch and screen-reader users lose the explanation the desktop shows.             |
| A4  | Dashboard's Recent filter is `role="group"` + `aria-pressed` for a mutually exclusive filter.                                                                                                                                                        | Announced as toggle buttons, not a single-choice set.                             |
| A5  | Disabled `Export` is announced as an unavailable control on every video preview.                                                                                                                                                                     | Repeated dead-end for AT users.                                                   |
| A6  | Icon-only header controls at ≤48rem (`+`, `i`, status dot) rely on `aria-label` only.                                                                                                                                                                | Correct for AT, but sighted new users get no labels.                              |
| A7  | The take-review overlay hides the media it describes on mobile.                                                                                                                                                                                      | Review without the artefact.                                                      |

---

# Phase 11 & 12 — Findings register

**Classification:** Preserve · Polish · Improve · Simplify · Redesign · Consolidate · Investigate
**Priority:** P0 blocked · P1 major · P2 important · P3 polish · P4 future
**Scope:** XS <2h · S ½–1d · M 2–3d · L 1–2wk · XL >2wk

## P1 — Major

### ~~LF-S01 · "Record New Video" does not record~~ — FIXED

**Resolved.** The idle action is now `Start camera`; capture stays the separate `Record` control.

- **Where:** `studio/useStudioRecordingLaunch.ts:100` (`startLocalRecording` → `session.startLocal`), label in `StudioSessionControlBar.tsx:476`
- **Category:** Labelling / expectation · **Improve** · **P1** · **XS**
- **Current:** Pressing it opens the camera preview. A separate `Record` button in the control bar starts capture.
- **Good:** The two-stage model is _correct_ — people should frame before rolling.
- **Problem:** The label promises the second stage while performing the first.
- **Why it matters:** It is the first action in the product's primary flow.
- **First-time:** Believes recording started; discovers later it didn't.
- **Returning:** Minor; already learned.
- **Change:** Relabel to `Start camera` (or `Set up camera`). Once live, promote `Record` to the largest, mint-primary control on the stage. Optionally add a "Ready — press Record when you are" hint on first preview.
- **Improved behaviour:** `Start camera` → preview + "Press Record to start" → mint `Record` → red `Stop`.
- **Redesign needed:** No.
- **Dependencies:** LF-S02 (colour). **Risks:** copy-asserting tests in `StudioSessionControlBar.test.tsx`.

### ~~LF-S02 · Primary and destructive actions share red~~ — FIXED

**Resolved.** Idle Record is the mint primary with a deepened red dot; active recording stays red; `Close` is secondary.

- **Where:** `features/recording/RecordingAction.tsx:55` (`recordActionStyles`), `StudioSessionControlBar.tsx:565`
- **Category:** CTA hierarchy · **Improve** · **P1** · **XS**
- **Current:** `Record` uses `colors.recording` on `recordingSoft`; `Close` uses `variant="danger"` — same hue, same weight, adjacent.
- **Good:** Red for an _active_ recording state is correct and should stay.
- **Problem:** Red is doing two jobs: "the main action" and "the destructive one".
- **Why it matters:** Highest-consequence misclick surface in the app.
- **First-time:** Cannot tell which is which. **Returning:** Misclick risk under time pressure.
- **Change:** Idle `Record` = mint primary with a red dot glyph. Active `Stop` = red filled. `Close` = quiet/secondary with an X. Reserve `danger` for irreversible actions only.
- **Redesign needed:** No. **Risks:** visual baselines.

### LF-V01 · The video editor's media is its smallest element

- **Where:** `features/video-editor/VideoEditWorkspace.tsx`, `studio/StudioApp.styles.ts:512` (`stageColumnStyles[data-video-edit-active]` → `minmax(11rem, 38vh)` for controls)
- **Category:** Creative-tool UX · **Redesign** · **P1** · **L**
- **Current:** Tool list ~215px, preview ~500×300 floating in ~1100px of empty canvas, settings panel ~320px and full height. Mobile preview ~120px tall.
- **Good:** Tool → settings → preview structure; `Preview before`; per-tool + global reset; explicit terminal actions; local-only rendering.
- **Problem:** You cannot judge crop, lighting or filters on a small preview, and there is no timeline for trim.
- **Why it matters:** This is the only editing surface in a video product.
- **First-time:** Assumes it is a preview thumbnail and looks for the "real" editor.
- **Returning:** Cannot work accurately; must save and re-open to verify.
- **Change:** Media fills the available column and grows with the viewport. Add a timeline strip with trim handles, playhead and duration. Move undo/redo to a labelled group next to the media. Attach `Reset tool` to the settings panel. Make `Preview before` a press-and-hold A/B with a keyboard binding.
- **Improved behaviour:** Media occupies ≥60% of the workspace; the settings panel is a fixed-width inspector; crop handles draw on the media itself.
- **Redesign needed:** **Yes.**
- **Dependencies:** `VideoEditStagePreview`, `stageColumnStyles`. **Risks:** shares the stage grid with capture; regressions possible in Project workspace layout.

### ~~LF-P04 · Four competing save concepts in the Project workspace~~ — FIXED

**Resolved.** Project revisions now report an ambient timestamped `Autosaved` state, the creative
checkpoint is **Keep this setup**, and the output step reserves **Save** for one placement-labelled
**Save video** action. Its New video/New version destination choice stays inline in the
desktop/tablet inspector and becomes one fitted bottom sheet on mobile, while the persistent action
remains above the mobile navigation. CAS, idempotency, immutable originals, and exact-Version rules
are unchanged.

- **Where:** `ProjectWorkspaceSurface.tsx` (`projectWorkspaceSaveStatus`), `ProjectCreativeCheckpointPanel.tsx` (`Save progress`), `ProjectOutputSaveSection.tsx` (`Save as New Video` / `Add Version`)
- **Category:** Mental model · **Redesign** · **P1** · **L**
- **Current:** Auto-save status + explicit "Save progress" + two output-save actions, with a shipped disclaimer explaining the conflict.
- **Good:** Every one of the four is _technically necessary_ and correctly implemented (CAS versions, idempotency keys, immutable originals). None should be removed.
- **Problem:** All four use the word "save".
- **Why it matters:** It sits at the end of the product's deepest workflow.
- **First-time:** Assumes "All changes saved" means the video is saved. It is not.
- **Returning:** Reads the disclaimer every time.
- **Change:** Reserve "Save" for producing a video. Rename the revision state to `Autosaved · 2 min ago` (or a quiet dot). Rename `Save progress` to `Keep this setup`. Present the output step as one action — `Save video` — with a New/New version choice inside it, and delete the disclaimer.
- **Improved behaviour:** One `Save video` button; a passive `Autosaved` indicator that never competes.
- **Redesign needed:** **Yes** — for the save step only.
- **Dependencies:** LF-P03 (version vocabulary). **Risks:** `ProjectOutputSaveSection.test.tsx` is 32KB of label assertions.

### ~~LF-P03 · "Version" means three different things~~ — FIXED

**Resolved.** Duplicating a Project is `Duplicate Project`, a Saved Video version keeps `Version`,
and a Project revision is `Autosaved`. A fourth collision the audit missed — the character
wardrobe calling its variants "versions" — was fixed with them.

- **Where:** `ProjectsListSurface.tsx:181` (`Make another version`), `ProjectOutputSaveSection.tsx` (`Add Version`), `VideoGallery.tsx` (`Version 3 · Current`), `ProjectWorkspaceSurface.tsx` (revisions)
- **Category:** Terminology · **Improve** · **P1** · **S**
- **Current:** Project duplicate, Saved Video version, and Project revision all say "version".
- **Problem:** The same word for three unrelated operations, two of which are on the same screen.
- **Why it matters:** Poisons the vocabulary of the whole product.
- **Change:** Project duplicate → `Duplicate Project`. Saved Video version keeps `Version`. Project revision → `Autosaved`. Never use "version" for a Project.
- **Redesign needed:** No. **Risks:** wide test surface; no behaviour change.

### ~~LF-A01 · Download is the hidden action on a finished video~~ — FIXED

**Resolved.** `Download` leads every card and the version-preview footer; `Open in Studio` moved into the overflow.

- **Where:** `VideoGallery.tsx:236` (`Open in Studio` primary) vs `:262` (Download inside `<details>`)
- **Category:** CTA hierarchy · **Improve** · **P1** · **S**
- **Current:** Every card leads with `Open in Studio`; Download is two clicks into an overflow menu.
- **Good:** The `…` menu is the right container for Rename/Remove/Use as source.
- **Problem:** The library's purpose is retrieving finished work.
- **First-time:** Cannot find the file they just made. **Returning:** Two extra clicks, every time.
- **Change:** Make Download the card's primary (or a split button `Download ▾` with Open in Studio / Edit inside). Keep Download visible in the preview footer.
- **Redesign needed:** No.

### ~~LF-A02 · A permanently disabled Export button~~ — FIXED

**Resolved** via option (b): `Export` opens the existing `ExportPlacementChooser` and re-frames the selected version locally.

- **Where:** `VideoGallery.tsx:831` — `<Button disabled aria-describedby="video-export-unavailable">Export</Button>` + _"Export formats and channels are not specified yet."_
- **Category:** Dead control · **Remove / Consolidate** · **P1** · **XS**
- **Current:** A dead button on every video preview — while `ExportPlacementChooser` ("Where is this going? — phone / widescreen / square / tall feed") is fully implemented and used in Project save and standalone save.
- **Problem:** The product has export and tells the user it doesn't, in a marketing-asset tool where placement is the point.
- **Change (pick one):** (a) Remove the button and its note — Download is the export; or (b) wire it to `ExportPlacementChooser` so any saved video can be re-framed for a placement. **(b) is the higher-value option** and is close to free given the chooser exists.
- **Redesign needed:** No. **Dependencies:** `useExportPlacementRender`, browser WebCodecs capability (already degrades gracefully).

### ~~LF-X04 · Internal language shipped as a user-facing blocked reason~~ — FIXED

**Resolved.** The string now states a user-visible condition and what still works.

- **Where:** `ProjectCreativeCheckpointPanel.tsx:6` → rendered in `AIExperienceChooser.tsx:109` and `ExistingVideoActionBar.tsx:161`
- **Text:** _"Project live provider starts remain unavailable because they do not use the recoverable Project processing command."_
- **Category:** Copy · **Polish** · **P1** · **XS**
- **Problem:** Names an internal command architecture. No user can act on it.
- **Change:** _"Live AI isn't available inside a Project yet. You can still run Character Swap and Virtual Try-On on the Project's video."_
- **Redesign needed:** No.

### ~~LF-S06 · Take review hides the take on mobile~~ — FIXED

**Resolved** via the bottom-sheet option: `OverlayPanelHeight` gains `sheet`, capping the panel at
`min(45dvh, 24rem)` so the stage stays visible above it.

- **Where:** `StudioTakeOverlays.tsx` (fullscreen `OverlayPanel`) + copy _"Playback remains on the main stage."_
- **Category:** Review UX · **Improve** · **P1** · **M**
- **Problem:** Below 48rem the panel covers the stage it points to.
- **First-time:** Decides Save/Discard without seeing the clip.
- **Change:** On mobile use a bottom sheet at ~45dvh with the stage visible above, or embed a compact player in the panel.
- **Redesign needed:** No, but it is the mobile half of LF-S09.

### ~~LF-R01 · Brand wordmark breaks to three lines at 320px~~ — FIXED

**Resolved.** `white-space: nowrap` on the wordmark, and the text column is hidden below 22rem.

- **Where:** `StudioApp.styles.ts:197` `brandStyles` — `gridTemplateColumns: '2rem minmax(0, 1fr)'`, no `white-space` control
- **Category:** Responsive defect · **Polish** · **P1** · **XS**
- **Evidence:** `screenshots/.../05-small-mobile-320x568/*/overview.png` shows `Ligh / tfra / me`.
- **Why it matters:** Visible on the very first authenticated screen at the smallest supported size; it is the product's name.
- **Change:** `white-space: nowrap` + hide the wordmark below ~22rem (icon only), matching the 48–64rem rule.
- **Redesign needed:** No.

### ~~LF-DS01 · The breakpoint system is unused~~ — FIXED

**Resolved.** `media.up/down/between/downOrShort` read `theme.breakpoints`; 140 of the 203 width
occurrences migrated, and no tier value is hand-written anywhere. The 60 component-scale widths
stayed — they describe when a component's content stops fitting, not when the page changes tier.

- **Where:** `ui/theme.ts` `breakpoints` — 1 consumer. 29 distinct hard-coded `max-width` values across `apps/web/src`.
- **Category:** Design system · **Consolidate** · **P1** · **M**
- **Problem:** Every component picks its own reflow point (39.99, 47.99, 63.99, 71.99, 79.99, 22, 30, 34, 52, 57…). At 1150px the Dashboard is single-column while the rail is still wide; at 900px the rail is compact but Studio still assumes desktop.
- **Why it matters:** This is the root cause of most Phase 9 findings.
- **Change:** Adopt `tablet 40rem / laptop 64rem / desktop 80rem / wide 100rem` plus a documented `compact 48rem`. Add `media.up()/down()` helpers. Migrate surface by surface, visual baselines as the guard.
- **Redesign needed:** No. **Risks:** every visual baseline moves; do it as one deliberate change.

### ~~LF-DS02 · There is no page shell~~ — FIXED

**Resolved.** `PageShell` and `PageHeader` frame all five top-level surfaces, on one title scale,
with no page-level border or radius and no `borderRadius: 0` policy.

- **Where:** `DashboardRouteSurface.styles.ts:3`, `AssetsRouteSurface.tsx:33`, `ProjectsListSurface.styles.ts:3`, `ProjectOverviewSurface.styles.ts:3`, `CampaignRouteSurface.styles.ts`
- **Category:** Design system · **Consolidate** · **P1** · **M**
- **Problem:** Five surfaces, five frames, five `h1` scales (1.875 → 4rem), two button-radius policies.
- **Why it matters:** The most visible cause of "this feels like several products".
- **Change:** One `PageShell` (max-width, padding, `canvas`, no border) + one `PageHeader` (eyebrow, `h1`, description, one primary + one `…`). Delete `'& button': { borderRadius: 0 }`.
- **Redesign needed:** No — pure consolidation onto the strongest existing pattern.

## P2 — Important

| ID           | Where                                        | Finding                                                                                                                              | Class       | Scope       |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------- |
| LF-E01       | `EntryPage.tsx:82`                           | First sentence uses "Project" and "Campaigns" as proper nouns before either is defined.                                              | Improve     | XS          |
| ~~LF-E03~~   | `HowLightframeWorksPanel.tsx`                | ~~The concept explainer omits **Studio**.~~ **Fixed** — Studio is the first concept.                                                 | Improve     | XS          |
| LF-D02       | `DashboardRouteSurface.styles.ts:236`        | `1.5fr / 1fr` gives the wide column to one card and the narrow one to the list.                                                      | Improve     | S           |
| ~~LF-D04~~   | `DashboardRouteSurface.tsx`                  | ~~The Projects/Campaigns explainer renders _below_ Recent Work.~~ **Fixed** — it now sits under the page header.                     | Improve     | XS          |
| LF-N02       | `AssetsRouteSurface.tsx`                     | `/assets` is a menu page; every library is 2 clicks from the rail.                                                                   | Simplify    | M           |
| LF-N03       | `StudioLibraryOverlays.tsx`                  | Libraries are fullscreen overlays with no breadcrumb or "Esc returns" hint.                                                          | Polish      | S           |
| LF-N05       | —                                            | **No Settings destination exists.** Account is read-only.                                                                            | Investigate | M           |
| LF-S03       | `stageColumnStyles`                          | Stage does not fill its column; large dead space around it.                                                                          | Improve     | M           |
| ~~LF-S04~~   | `CreativeWorkspace.tsx`                      | ~~Character/Outfit tools disappear below 64rem, unexplained.~~ **Fixed** — the rail carries all three tools at every width.          | Improve     | M           |
| ~~LF-S07~~   | `StudioTakeOverlays.tsx`                     | ~~8 technical chips (fps, KiB, mime) above the decision.~~ **Fixed** — duration and resolution inline, the rest behind `Details`.    | Simplify    | S           |
| ~~LF-S08~~   | `TakeReviewActions.tsx`                      | ~~"Close and release" / "release the temporary in-memory take".~~ **Fixed** — `Close without saving`, and its neighbours to match.   | Polish      | XS          |
| ~~LF-S09~~   | `TakeReviewActions.tsx`                      | ~~Up to six peer actions at the moment of highest decision pressure.~~ **Fixed** — one primary, one danger, four in an `ActionMenu`. | Simplify    | S           |
| LF-V02       | `VideoEditWorkspace.tsx`                     | No timeline; trim has no visual reference.                                                                                           | Redesign    | L           |
| LF-V03       | editor settings header                       | Unlabelled low-contrast undo/redo glyphs.                                                                                            | Polish      | XS          |
| LF-V05       | mobile editor                                | Tool row truncates (`Lig`) with no scroll affordance.                                                                                | Polish      | S           |
| LF-X01       | `ExistingVideoSourcePreview`, `VideoGallery` | Native `<video controls>` vs custom player elsewhere.                                                                                | Consolidate | M           |
| LF-X02       | `ExistingVideoActionBar.tsx`                 | Four identical full-width result buttons.                                                                                            | Improve     | S           |
| LF-X03       | multiple                                     | `Save to Assets` / `Saved Videos` / `Videos` — three names, one place.                                                               | Polish      | S           |
| ~~LF-P01~~   | `ProjectOverviewSurface.tsx`                 | ~~Five peer actions with a red `Archive` in the default row.~~ **Fixed** — one primary plus `ActionMenu`; danger lives inside it.    | Simplify    | S           |
| ~~LF-P02~~   | `ProjectsListSurface.tsx`                    | ~~4–5 inline actions per row.~~ **Fixed** — `Open` leads, the rest move into the row's `ActionMenu`.                                 | Simplify    | S           |
| ~~LF-P06~~   | `ProjectsListSurface.styles.ts`              | ~~`h1` to 4rem and `borderRadius: 0` on all buttons.~~ **Fixed** — one shared title scale; the blanket radius rule is deleted.       | Improve     | S           |
| ~~LF-C01~~   | `CampaignRouteSurface.tsx:292`               | ~~Copy promises **"Quick Start"**, which does not exist.~~ **Fixed** — rewritten to name only real controls.                         | Polish      | XS          |
| ~~LF-C02~~   | `CampaignRouteSurface.styles.ts`             | ~~Three levels of nested bordered/rounded surfaces.~~ **Fixed** — exactly one, the campaign card.                                    | Simplify    | S           |
| ~~LF-A03~~   | `VideoGallery.tsx`                           | ~~`<details>` overflow menu: no Escape, no outside-click, no menu semantics.~~ **Fixed** — one `ActionMenu` primitive.               | Improve     | S           |
| ~~LF-A04~~   | `StudioLibraryOverlays.tsx:113`              | ~~_"Manage your **Lucy 2.5** cast"_ — provider model name in the UI.~~ **Fixed** — see `assetLibraryDescriptions.ts`.                | Polish      | XS          |
| LF-A07       | `VideoGallery.tsx:583`                       | Empty state uses internal flow names.                                                                                                | Polish      | XS          |
| LF-DS03      | 6 locations                                  | Six visual answers to "choose one of N".                                                                                             | Consolidate | M           |
| LF-DS04      | 13 files                                     | Icon sets with three stroke weights.                                                                                                 | Consolidate | S           |
| LF-DS06      | 37 sites                                     | Bare-text loading everywhere; one skeleton total.                                                                                    | Improve     | M           |
| ~~LF-A11Y1~~ | `theme.ts`                                   | ~~`border` 1.58:1, `borderStrong` 2.44:1 — WCAG 1.4.11 needs 3:1.~~ **Fixed** — 3.08:1 and 3.59:1; separators become `divider`.      | Improve     | S           |
| ~~LF-A11Y3~~ | `toolRailStyles` mobile                      | ~~Blocked reason survives only in `title=`.~~ **Fixed** — a blocked tool keeps its reason on mobile, clamped to two lines.           | Improve     | XS          |
| LF-R04       | mobile editor                                | Media/chrome ratio inverted.                                                                                                         | Redesign    | (in LF-V01) |
| LF-R05       | `/assets` at 320px                           | ~5 screens of scroll for four navigation cards.                                                                                      | Simplify    | (in LF-N02) |

## P3 — Polish

| ID         | Where                            | Finding                                                                    | Class       |
| ---------- | -------------------------------- | -------------------------------------------------------------------------- | ----------- |
| LF-E02     | `EntryPage.tsx`                  | No product explanation or visual on the entry screen.                      | Improve     |
| ~~LF-D01~~ | `dashboardStyles`                | ~~No page max-width.~~ **Fixed** — `PageShell` caps it at 88rem.           | Polish      |
| LF-D03     | dashboard header                 | `Browse Assets` reads as text, not a control.                              | Polish      |
| LF-D05     | dashboard                        | Processing Queue is an ops panel on a creative home.                       | Improve     |
| LF-D06/07  | dashboard                        | Bespoke filter + footer link styles instead of primitives.                 | Consolidate |
| LF-S05     | `CreativeWorkspace.tsx`          | Permanent privacy footnote occupies a tool slot.                           | Simplify    |
| LF-V04     | editor                           | `Reset tool` orphaned far from its tool.                                   | Polish      |
| LF-P05     | `ProjectWorkflowProgress.tsx`    | `History` shown as step 4 of 4.                                            | Improve     |
| LF-C03     | campaigns                        | Empty `Archived` box always rendered.                                      | Polish      |
| LF-C04     | campaigns                        | `Clear search` misaligned with its field.                                  | Polish      |
| ~~LF-A05~~ | assets vs overlay                | ~~Two descriptions of the same library.~~ **Fixed** — one shared owner.    | Polish      |
| LF-A06     | characters/outfits overlays      | Export/import block above the library.                                     | Polish      |
| LF-A08     | `VideoGallery.tsx`               | Raw `version.origin` / `video.status` as chips.                            | Polish      |
| LF-N04     | nav                              | Campaigns holds a permanent slot on mobile.                                | Investigate |
| LF-N06     | mobile nav                       | 5 items; design doc says 4; labels crowd at 320px.                         | Investigate |
| LF-DS05/07 | 6+ files                         | No link-styled button variant; `<a download>` restyled by hand.            | Consolidate |
| LF-B01     | character builder                | `Save & Use Image Only` vs `Save Character`; parenthetical CTA qualifiers. | Improve     |
| LF-B02     | character builder                | Five footer controls; ~25% of a 320px viewport.                            | Simplify    |
| LF-R02     | tablet                           | Brand wordmark hidden only in the 48–64rem band.                           | Polish      |
| LF-R03     | rail                             | Large dead space between nav and the bottom cluster.                       | Polish      |
| LF-R06     | mobile capture bar               | Device summary truncates (`64×6…`).                                        | Polish      |
| LF-W01     | `ProjectWorkingMediaSection.tsx` | Triple-negative confirmation copy.                                         | Polish      |
| LF-W02     | `StudioExitGuard.tsx:409`        | Five-item comma list in the exit dialog.                                   | Polish      |

## Preserve — do not let a redesign remove these

| ID     | What                                                                | Why                                                                                                  |
| ------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| LF-K01 | `OverlayPanel` + `overlayStack`                                     | Best-in-class modal: focus trap, stack, Escape, `inert`, restore-with-remount-guard, reduced motion. |
| LF-K02 | The colour palette                                                  | Every text token clears AA on every surface.                                                         |
| LF-K03 | Blocked controls that state their condition                         | `editVideoBlockedReason`, `recordingUnavailableReason`, tool-card availability. Rare and excellent.  |
| LF-K04 | The `Source → Edit → Review` upload flow                            | Clearest workflow in the product.                                                                    |
| LF-K05 | Plan-stating CTAs — `Apply Character Swap, then Northstar Narrator` | Model for every other confirm action.                                                                |
| LF-K06 | `EmptyStatePreview` + the "For example:" line                       | Teaches through empty states.                                                                        |
| LF-K07 | `AssetCountState`'s three states                                    | Refuses to render `0` for "not loaded yet".                                                          |
| LF-K08 | `StudioExitGuard` + `useConfirmationRequest`                        | Nothing is lost silently.                                                                            |
| LF-K09 | Provider cost/retention disclosure at the point of spend            | Honest, and legally sound.                                                                           |
| LF-K10 | `useRouteBack` + `?task=` with `replace`                            | Back always does the expected thing.                                                                 |
| LF-K11 | The persistent shell / disposable runtime split                     | Fast navigation, real camera release.                                                                |
| LF-K12 | "Organization is optional" stated in three places                   | The correct product philosophy, said out loud.                                                       |
| LF-K13 | Processing queue with per-job abandon + honest cost warning         | Better than most commercial tools.                                                                   |
| LF-K14 | The immutable-original model                                        | A genuine creative-tool strength.                                                                    |

---

# Phase 13 — Redesign vs. incremental

Most of this audit is **incremental**. Four areas are not.

## 13.1 The local video editor — redesign required

**Why incremental fixes are insufficient.** Enlarging the preview is not enough: the layout is a
three-column grid inherited from the _capture_ surface (`stageColumnStyles`, shared with the live
stage). Trim has no timeline because there is nowhere to put one. Undo/redo, reset, and A/B are
scattered because no region owns "editing controls". Every individual fix is blocked by the
missing spatial model.

**What the redesign must accomplish**

- The media is the largest element at every viewport and grows with it.
- A timeline with playhead, duration and draggable trim handles.
- Direct manipulation on the media: crop handles on the frame, rotate on the frame.
- A named, labelled control group: Undo · Redo · Reset tool · Reset all · Compare (hold).
- One inspector column whose content changes with the selected tool.

**Keep:** the five tools and their behaviour; local-only rendering; `Preview before` as a concept;
per-tool and global reset; explicit `Save edited video` / `Discard`; the dark palette.

**Change:** the grid; preview sizing; the transport; where reset and undo live; mobile, which
should be media + a bottom inspector sheet, not media + stacked panels.

**Easier for users:** judging a crop; trimming to a moment; comparing before/after without losing
your place; understanding that changes are not saved until you say so.

**Ideal first-time feel:** _"This looks like an editor I already know how to use."_

## 13.2 The Project save step — redesign required

**Why incremental fixes are insufficient.** The screen ships a paragraph explaining that its own
status message does not mean what it says. Renaming one button leaves three "save"s. The four
concepts need to be re-partitioned, not re-worded.

**What the redesign must accomplish**

- Exactly one control called "Save", and it produces a video.
- Autosave becomes ambient (a quiet timestamp), never a peer of the save button.
- New-video vs new-version becomes a choice _inside_ saving, not two buttons before it.
- Placement ("Where is this going?") stays part of saving, where it already is and works.
- The disclaimer is deleted because it is no longer needed.

**Keep:** immutable original; CAS versions; idempotency keys; the placement chooser; history.

**Change:** vocabulary; the number of top-level save affordances; the position of the autosave
indicator.

**Easier for users:** knowing whether their work exists as a file yet.

**Ideal first-time feel:** _"I pressed Save and I have a video."_

## 13.3 Assets → the libraries — redesign (as simplification)

**Why incremental fixes are insufficient.** The hub is structurally a menu. Improving its cards
makes a nicer menu. The libraries already live at their own URLs and already work as overlays —
the hub is a redundant hop, and at 320px it costs five screens of scroll.

**What the redesign must accomplish**

- One click from the rail to any library.
- Videos surfaces Download as its lead action.
- Storage/portability facts stay available without leading the surface.
- The overlay model (Escape returns, place preserved) is preserved.

**Keep:** all filters, search, version preview, counts, the three-state count model, browser-local
disclosure, `EmptyStatePreview`.

**Change:** the hub becomes a rail sub-nav or a tab strip inside one Assets surface; Download
becomes primary; the export/import block moves under a `…`.

**Easier for users:** finding and downloading a finished video.

## 13.4 First-run / Dashboard composition — redesign (moderate)

**Why incremental fixes are insufficient.** Fixing the column ratio, moving the explainer and
demoting the queue individually still leaves a page whose job is unclear. It is currently trying
to be a resume screen, a recents list, an onboarding surface and an ops console.

**What the redesign must accomplish**

- Answer "what is this and what do I do" in the first viewport, for a brand-new account.
- Give returning users their work in one glance.
- Make organisation genuinely optional _and visibly secondary_.
- Push processing status to an ambient indicator with a detail view.

**Keep:** the single `Create video` primary; Continue Work; the merged, poster-led Recent Work
list; per-kind empty states with worked examples; section-scoped errors.

**Change:** column ratio; explainer position (above, first-run only); queue demoted to a rail
badge or a collapsed strip; a page max-width.

**Ideal first-time feel:** _"I can see what to do, and I can see what I made."_

## Not redesign — fix directly

Everything else: labels, colours, button counts, borders, breakpoints, overflow menus, the page
shell, loading states, the dead Export button, the "Quick Start" copy, the 320px wordmark.

---

# Phase 14 — Should Superdesign be used?

| Area                            | Recommendation    | Why                                                                                                                                                                                                                             |
| ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Video editor**                | **Recommended**   | Needs a new spatial model — media dominance, timeline, direct manipulation, inspector — plus a genuinely different mobile layout. Layout exploration is the work.                                                               |
| **Dashboard / first-run**       | **Recommended**   | Composition and hierarchy problem across four competing blocks, with a first-run vs returning split. Worth exploring 2–3 arrangements before committing.                                                                        |
| **Assets → libraries**          | **Recommended**   | Structural: does Assets become a tab strip, a rail sub-nav, or a single filtered surface? A layout question with real alternatives.                                                                                             |
| **Project workspace save step** | **Recommended**   | Redesigning a mental model with visible consequences: how autosave, keep-setup, save-video and placement occupy one panel.                                                                                                      |
| **Studio create (idle + live)** | **Optional**      | The CTA pair is right; the problems are stage sizing, a mislabelled button, red-on-red, and mobile tool availability. Direct fixes get most of the value. Explore only if you also want to rethink the capture-settings column. |
| **Navigation / rail**           | **Optional**      | Five slots for four kinds of thing is real, but resolvable by consolidating Assets (LF-N02) and adding Settings. Revisit if Assets consolidation changes the slot count.                                                        |
| **Take review**                 | **Optional**      | Needs fewer actions, fewer chips, and a mobile sheet that does not cover the media. Specifiable directly; explore if bundled with the Studio work.                                                                              |
| **Upload / AI transform panel** | **Not necessary** | Already the strongest flow. Only needs footer hierarchy and one player.                                                                                                                                                         |
| **Page shell + breakpoints**    | **Not necessary** | Consolidation onto an existing pattern. Design exploration would invent a fifth variant.                                                                                                                                        |
| **Campaigns / Projects lists**  | **Not necessary** | Fixed by the page shell + overflow menus + one copy fix.                                                                                                                                                                        |
| **Colour, contrast, tokens**    | **Not necessary** | The palette is good. Raise two border tokens to 3:1 and stop.                                                                                                                                                                   |
| **Character builder**           | **Not necessary** | Structure is sound; needs one save decision and a lighter footer.                                                                                                                                                               |
| **Entry screen**                | **Not necessary** | A copy and one-visual problem.                                                                                                                                                                                                  |

---

# Phase 15 — Superdesign prompts

The four briefs live in [`LightFrameSuperdesignPrompts.md`](LightFrameSuperdesignPrompts.md), so
there is one owner for their wording:

- Local video editor
- Dashboard and first-run
- Assets and media libraries
- Project workspace: the save step

Each brief carries the product context, the problems this audit found with file-level evidence,
the functionality that must survive, the required UX changes, hierarchy, interaction and
responsive requirements, visual direction, and the expected deliverable.

---

# Phase 16 — Prioritised recommendations

## 1 — ~~Fix immediately~~ · **DONE** (2026-08-22)

| #   | Fix                                                           | ID     | Scope | Status |
| --- | ------------------------------------------------------------- | ------ | ----- | ------ |
| 1   | ~~Relabel `Record New Video` → `Start camera`~~               | LF-S01 | XS    | done   |
| 2   | ~~Split the red: mint `Record`, red `Stop`, quiet `Close`~~   | LF-S02 | XS    | done   |
| 3   | ~~Replace the internal blocked-reason string~~                | LF-X04 | XS    | done   |
| 4   | ~~Delete the "Quick Start" sentence from Campaigns~~          | LF-C01 | XS    | done   |
| 5   | ~~Wire up the disabled `Export` button~~ (option b)           | LF-A02 | XS–S  | done   |
| 6   | ~~Fix the 320px brand wordmark~~                              | LF-R01 | XS    | done   |
| 7   | ~~Make `Download` the primary on Videos cards~~               | LF-A01 | S     | done   |
| 8   | ~~Remove "Lucy 2.5" from the Characters library description~~ | LF-A04 | XS    | done   |
| 9   | ~~Move the Dashboard explainer above Recent Work~~            | LF-D04 | XS    | done   |
| 10  | ~~Add Studio to the "How Lightframe works" panel~~            | LF-E03 | XS    | done   |

Every one was a copy or token change with no architectural risk, apart from item 5, which reused
the existing placement render rather than deleting the control. Together they fixed the two worst
first-run misunderstandings and the worst retrieval flow.

Item 8 also reported, without fixing, the other provider and model names still reaching product
surfaces — chiefly `useReferenceRecipeAttribution.ts:97`, `CharacterNameDialog.tsx:56`,
`AIExperienceChooser.tsx:86`, `CharacterWardrobeLibrary.tsx:95` and
`ExistingVideoVisualEditor.tsx:176`. Cost and contact disclosures that name a provider at the point
of spend are deliberate and stay.

## 2 — ~~Work on next~~ · **DONE** (2026-08-22)

| #      | Work                                                                                                                              | IDs                             | Status |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------ |
| ~~11~~ | ~~**Terminology pass on "version"** — Duplicate Project / Version / Autosaved~~                                                   | LF-P03                          | done   |
| ~~12~~ | ~~**Overflow menus everywhere** — Project overview, Projects rows, Videos cards; replace `<details>` with the product's popover~~ | LF-P01, LF-P02, LF-A03          | done   |
| ~~13~~ | ~~**Adopt the theme breakpoints** and retire the ad-hoc values~~                                                                  | LF-DS01                         | done   |
| ~~14~~ | ~~**Introduce `PageShell` + `PageHeader`**; one `h1` scale; delete `borderRadius: 0`~~                                            | LF-DS02, LF-D01, LF-P06, LF-C02 | done   |
| ~~15~~ | ~~**Take review**: fewer actions, details behind disclosure, mobile sheet that keeps the media visible~~                          | LF-S06, LF-S07, LF-S08, LF-S09  | done   |
| ~~16~~ | ~~**Raise `border`/`borderStrong` to 3:1**~~                                                                                      | LF-A11Y1                        | done   |

The inventory in item 13 came out larger than this audit estimated: **203** width occurrences, not
29 distinct `max-width` values alone. 140 migrated onto named tiers; the 60 that did not are
component-scale thresholds, which is a different problem and is noted in the plan.

Item 16 had to split the token. Raising `border` and `borderStrong` together on one hue ramp
converges them, because 3:1 against `surfaceStrong` — not `canvas`, as this audit assumed — fixes
the luminance. The old value survives as `divider` for separators, which carry no 1.4.11 duty.

## 3 — Important but can follow (2–4 weeks)

| #      | Work                                                                         | IDs                        |
| ------ | ---------------------------------------------------------------------------- | -------------------------- |
| 17     | **Video editor redesign** (Superdesign)                                      | LF-V01–V05, LF-R04         |
| ~~18~~ | ~~**Project save-step redesign** (Superdesign)~~ **DONE**                    | LF-P04                     |
| 19     | **Assets consolidation** (Superdesign)                                       | LF-N02, LF-A05–A08, LF-R05 |
| 20     | **Dashboard recomposition** (Superdesign)                                    | LF-D02, LF-D03, LF-D05     |
| ~~21~~ | ~~**Mobile AI-tool availability** — reorganise rather than remove~~ **DONE** | LF-S04, LF-A11Y3           |
| 22     | **Skeleton loading** for lists, grids and the stage                          | LF-DS06                    |

## 4 — Polish later

Consolidate choose-one controls (LF-DS03), unify icons (LF-DS04), add link/anchor button variants
(LF-DS05/07), one video player (LF-X01), upload-result footer hierarchy (LF-X02), naming pass
(LF-X03), entry-screen copy and visual (LF-E01, LF-E02), character-builder footer (LF-B01, LF-B02),
Studio stage sizing (LF-S03, LF-S05), empty-section collapse (LF-C03), alignment (LF-C04), rail
dead space (LF-R02, LF-R03), truncation (LF-R06), copy tone (LF-W01, LF-W02), History as a record
not a step (LF-P05).

## 5 — Defer / decide first

- **Settings** (LF-N05) — needs a product decision about what is configurable before it is designed.
- **Campaigns' navigation weight** (LF-N04) and the **five-item mobile nav** (LF-N06) — revisit
  after Assets consolidation changes the slot count.

**Prioritisation basis:** first-run comprehension, frequency (every session vs. occasional),
severity of misunderstanding, number of workflows touched, effort, and regression risk. Items 1–10
were ranked above larger structural work because they remove _wrong information_ — a button that
lies about what it does, copy that promises a missing feature, a control that is permanently dead —
and no amount of layout work compensates for those.

---

# Final summary

## Overall assessment

**This is a well-engineered product with a well-judged concept model and an inconsistent surface.**

The architecture is unusually disciplined for a product at this stage: a persistent shell with a
disposable capture runtime, an overlay stack that handles nested modals correctly, optimistic
concurrency with idempotency keys, exit guards on every path that could lose work, honest provider
cost disclosure, and a colour palette where every text token clears WCAG AA on every surface. The
product's central idea — _a video is the unit; organisation is optional_ — is correct and is stated
out loud in at least three places.

What lets it down is the layer above: **the interface renders the model faithfully instead of
translating it.** Concepts that exist for correctness are presented as features. Five surfaces
invent five page frames. Twenty-nine ad-hoc breakpoints mean components reflow at unrelated widths.
And a handful of individually small defects — a Record button that doesn't record, a Download hidden
in an overflow menu, a disabled Export button, four things called "save" — sit precisely on the
paths a new user must walk.

The good news is the ratio: the structural problems are concentrated in **two screens** (the video
editor and the Project save step) and **one system** (the page shell + breakpoints). Almost
everything else is copy, colour and button count.

## Strongest areas — preserve

1. **`OverlayPanel` + `overlayStack`** — focus trap, nested-dialog stack, `inert` isolation, Escape,
   focus restoration with a remount guard, reduced motion. Better than most shipped component libraries.
2. **The upload → transform → compare → save flow** — steps, constrained tool grouping, capability
   gating with real reasons, a CTA that states the plan, an Original/Result comparison.
3. **The colour system** — verified AA across every text/surface pair.
4. **Blocked controls that state their condition** rather than going silently grey.
5. **Empty states that teach** — message + worked example + action.
6. **Navigation integrity** — real history back, task pinning by URL, legacy redirects that keep
   query and hash, focus moved to `<main>` on navigation but not on cold entry.
7. **The honesty**: "Organization is optional", browser-local storage disclosed per library,
   provider cost warned at the point of spend, abandon warning that admits work may continue upstream.

## Weakest areas — most friction

1. The **local video editor** — the media is the smallest thing on screen, and there is no timeline.
2. The **Project save step** — four save concepts and a shipped disclaimer.
3. ~~**Getting a finished video out** — Download is the deepest action, next to a dead Export button.~~ Fixed in Tier 1.
4. **The first 90 seconds** — the model before the outcome, and a Record button that doesn't record.
5. ~~**Cross-page consistency** — five page frames, `h1` from 1.875rem to 4rem, two button-radius policies.~~ Fixed in Tier 2.
6. **Below 64rem** — capability is removed rather than reorganised.

## First-time user assessment

**Understanding the product: 4/10.** The entry screen leads with proprietary nouns and the Help
panel omits Studio. The Dashboard's `Create video` is the one thing that unambiguously works.

**Beginning to create: 7/10.** Reaching the creation surface is easy. Then `Record New Video`
opens a camera instead of recording, and the two loudest buttons are both red.

**Finishing and retrieving: 3/10.** Save lands in "Assets"; the file is four navigations away
behind an overflow menu, beside a permanently disabled Export.

**Net:** a capable person will succeed within a few minutes and will misunderstand three things
along the way. None of the three is architectural.

## Most serious problems, ranked

1. ~~`Record New Video` does not record (LF-S01)~~ — fixed in Tier 1
2. The video editor's media is its smallest element (LF-V01) — **open, item 17**
3. ~~Four competing save concepts in the Project workspace (LF-P04)~~ — **fixed in Tier 3**
4. ~~Download is hidden; Export is dead (LF-A01, LF-A02)~~ — fixed in Tier 1
5. ~~Primary and destructive actions share red (LF-S02)~~ — fixed in Tier 1
6. ~~Five page frames and 29 breakpoints (LF-DS01, LF-DS02)~~ — fixed in Tier 2
7. ~~"Version" means three different things (LF-P03)~~ — fixed in Tier 2
8. ~~AI tools silently disappear below 64rem (LF-S04)~~ — fixed in Tier 1, out of order
9. ~~Take review hides the take on mobile (LF-S06)~~ — fixed in Tier 2
10. ~~Internal and non-existent language in shipped copy (LF-X04, LF-C01, LF-A04)~~ — fixed in Tier 1

## Biggest cross-page inconsistencies

1. ~~**No page shell.**~~ **Fixed in Tier 2** — `PageShell` + `PageHeader` on all five surfaces.
2. ~~**`theme.breakpoints` used once**~~ **Fixed in Tier 2** — `media.up/down/between/downOrShort`.
3. **Six patterns for "choose one of N".**
4. **Icons from four sources at three stroke weights.**
5. **Two video players.**
6. ~~**Two overflow-menu implementations**, one of them inaccessible.~~ **Fixed in Tier 2** — one
   `ActionMenu`. `StudioHeader`'s two menus stay bespoke by design, sharing the same hooks.
7. **Three names for the saved-video destination.**
8. **Loading is bare text in 37 places; one skeleton exists.**

## Pages needing refinement (not redesign)

Entry · Studio create · Take review · Projects list · Project overview · Campaigns list & detail ·
Character builder · Upload/AI transform panel · Global chrome & Help

## Pages needing significant redesign

**Local video editor** · **Project workspace Save step** · **Assets hub + libraries** ·
**Dashboard composition (moderate)**

## Top 10 improvements by user impact

1. ~~Make `Record New Video` do what it says~~ · Tier 1
2. Give the video editor its media back — and a timeline · **open, item 17**
3. ~~Make `Download` the lead action in the Videos library~~ · Tier 1
4. ~~Resolve `Export`: wire it to the existing placement chooser, or delete it~~ · Tier 1
5. Collapse the four save concepts to one `Save video` · **open, item 18**
6. ~~Split primary from destructive in the recording controls~~ · Tier 1
7. ~~Introduce a real page shell and adopt the theme breakpoints~~ · Tier 2
8. ~~Fix "version" so it means one thing~~ · Tier 2
9. ~~Keep AI tools available below 64rem~~ · Tier 1, out of order
10. ~~Remove copy that references non-existent features and internal architecture~~ · Tier 1

Two of the ten remain, and both are Tier 3 redesigns rather than fixes.

## Quick wins (all XS, all today)

- `Record New Video` → `Start camera`
- Mint `Record`, red `Stop`, quiet `Close`
- Delete the "Quick Start" sentence (`CampaignRouteSurface.tsx:292`)
- Delete or wire the disabled `Export` (`VideoGallery.tsx:831`)
- Rewrite `PROJECT_PROVIDER_START_BLOCKED_REASON`
- `white-space: nowrap` + icon-only brand below 22rem
- Remove "Lucy 2.5" from the Characters overlay description
- Move the Dashboard explainer above Recent Work
- Add a Studio entry to the Help panel
- Give `Browse Assets` a visible control affordance
- Raise `border`/`borderStrong` to meet 3:1
- Collapse empty `Archived` sections to a single line

## Superdesign recommendation summary

| Area                       | Recommendation  | Why                                                                                                                                     |
| -------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Video editor               | **Recommended** | New spatial model needed: media dominance, timeline, on-frame manipulation, a distinct mobile layout. Layout exploration _is_ the work. |
| Dashboard / first-run      | **Recommended** | A composition problem across four competing blocks with a first-run vs returning split. Worth comparing arrangements.                   |
| Assets & libraries         | **Recommended** | Structural: tabs, rail sub-nav, or one filtered surface — real alternatives with different consequences.                                |
| Project save step          | **Recommended** | Redesigning a mental model with visible layout consequences.                                                                            |
| Studio create              | Optional        | The CTA pair is right; the rest are direct fixes. Explore only alongside the capture-settings column.                                   |
| Navigation / rail          | Optional        | Resolvable by consolidating Assets and adding Settings. Revisit after that.                                                             |
| Take review                | Optional        | Fewer actions, disclosed details, a mobile sheet — specifiable directly.                                                                |
| Upload / AI transform      | Not necessary   | Strongest flow already; needs footer hierarchy and one player.                                                                          |
| Page shell + breakpoints   | Not necessary   | Consolidation onto an existing pattern; exploration would add a fifth variant.                                                          |
| Campaigns / Projects lists | Not necessary   | Fixed by the page shell, overflow menus, and one copy fix.                                                                              |
| Colour & tokens            | Not necessary   | The palette is good. Raise two border tokens and stop.                                                                                  |
| Character builder          | Not necessary   | Structure sound; needs one save decision and a lighter footer.                                                                          |
| Entry screen               | Not necessary   | Copy plus one visual.                                                                                                                   |

The four briefs are in [`LightFrameSuperdesignPrompts.md`](LightFrameSuperdesignPrompts.md).

---

## If we only changed one thing next

> **Make the product's primary button tell the truth, and separate it from the destructive one.**
> Relabel `Record New Video` to `Start camera`, promote `Record` to the single mint primary on the
> live stage, turn active recording red, and make `Close` quiet.

**Why this, over the editor or the save model.**

It is roughly two hours of work with no architectural risk, and it repairs the exact moment where
the most users are lost. Every path into this product converges on `/studio/create`: the rail's
Studio item, the Dashboard's `Create video`, Quick Create's `New video`, the Assets `Upload video`
button, and the Project record action. The first thing a new user does there is press a button
labelled "Record New Video" — and nothing records. They then face two red buttons with no way to
tell the action from the exit.

The video editor is worse in absolute terms, but a user only reaches it _after_ succeeding here.
The save model is more confusing, but only inside Projects, which the product correctly says are
optional. This defect sits on the one path nobody can avoid.

It also unblocks the rest. Fixing the label forces the two-stage capture model — frame, then roll —
to become visible, which is the honest model and the one professional capture tools use. Fixing the
colour establishes the rule the whole audit keeps asking for: **mint means "this is the action",
red means "this destroys something", and nothing else may claim either.** Once that rule exists,
Project overview's red Archive, the take review's six peers, and the upload panel's four identical
buttons all become mechanical fixes against a stated standard rather than judgement calls.

Cheapest fix in the audit, on the most-travelled path, that also establishes the principle the next
twenty fixes depend on.
