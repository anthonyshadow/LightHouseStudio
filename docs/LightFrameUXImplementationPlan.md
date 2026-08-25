# UX implementation plan

**Kind:** work plan. **Not implementation authority** — the code, `ARCHITECTURE.md` and the
feature-behaviour documents remain authoritative for what the product currently guarantees.

Execution order for the findings in the [UI/UX audit](LightFrameUXAudit.md), with one
ready-to-run prompt per item. Areas needing a new layout rather than a fix are briefed separately
in [Superdesign prompts](LightFrameSuperdesignPrompts.md).

## How to use this document

Each item states its audit ID, what to change, the files it touches, a prompt you can hand to a
coding agent verbatim, the validation to run, and the risk to watch. The prompts are deliberately
self-contained: none of them assumes the agent has read the audit.

Two rules apply to every item and are not repeated in each prompt:

- **Preserve behaviour.** Change presentation and wording only, unless the item says otherwise.
  Do not remove a capability, alter an HTTP contract, or drop `expectedVersion`,
  `expectedRevisionNumber` or `Idempotency-Key`.
- **Validate the smallest surface that proves the change**, per the table in
  [`../CLAUDE.md`](../CLAUDE.md). Do not run the full suite by default.

Visual baselines under `screenshots/` are asserted by `bun run test:visual`. Any item marked
**touches baselines** will fail it until the baselines are re-captured with
`bun run test:visual:update`, which must be reviewed image by image before committing.

## Order at a glance

| Tier                          | Items | Theme                                                            | Rough effort |
| ----------------------------- | ----- | ---------------------------------------------------------------- | ------------ |
| ~~1 — Fix immediately~~       | 1–10  | **DONE** — the product no longer tells the user untrue things    | 1–2 days     |
| ~~2 — Work on next~~          | 11–16 | **DONE** — one vocabulary, one action model, one page shell      | 1–2 weeks    |
| ~~3 — Important, can follow~~ | 17–22 | **DONE** — the four redesigns, mobile capability, loading states | 2–4 weeks    |
| ~~4 — Polish later~~          | 23–34 | **DONE** — one design system, one vocabulary, one tone           | ongoing      |
| 5 — Defer until decided       | 35–36 | Needs a product decision before any design work                  | —            |

**Why this order.** Tier 1 removes _wrong information_ — a button that lies about what it does,
copy that promises a feature that does not exist, a control that is permanently dead. No amount of
layout work compensates for those, and every one is a copy or token change with no architectural
risk. Tier 2 establishes the vocabulary and the shell that Tier 3's redesigns then build on;
running Tier 3 first would mean designing against a system that is about to change underneath it.

**Tiers 3 and 4 are complete.** Items 17–22 built on Tier 2's vocabulary (item 11), `ActionMenu`
(item 12), `media.up/down` (item 13), `PageShell`/`PageHeader` (item 14) and the raised boundary
tokens (item 16); items 23–34 then consolidated what those items had each solved locally. Tier 5
still needs a product decision before any design work.

---

# ~~Tier 1 — Fix immediately~~ · COMPLETE

**Shipped 2026-08-22 on `LightFrameUxImprovements`**, one commit per item, each validated with the
scoped command below before the next began. The full `apps/web/src` unit suite (146 files, 1056
tests) passes, as do `app-routing`, `existing-video`, `successful-studio-journeys`,
`accessibility-responsive` (axe), `studio-character-builder` and `reference-image-workflow`.

Thirteen visual baselines were re-captured and reviewed image by image. Four of them needed
`--update-snapshots=all`: a label change alone falls under the 0.5% `maxDiffPixelRatio`, so the
suite passed while the committed baseline still showed a control that no longer exists.

A pre-existing visual failure surfaced during this work — `small-mobile /
character-builder-combined-ready` could not reach `Select Character` — and was traced to LF-S04
rather than to Tier 1. **Item 21 was brought forward and is now complete**; the suite is green.

The prompts below are kept verbatim as the record of what was asked.

## ~~1. `Record New Video` does not record~~ · DONE

**Audit ID** LF-S01 · **P1** · **XS** · **touches baselines**

`startLocalRecording` calls `session.startLocal()`, which opens the camera preview only. Capture
starts from a separate `Record` control in the session control bar. The label promises the second
step while performing the first.

**Files** `apps/web/src/studio/StudioSessionControlBar.tsx` (label),
`apps/web/src/studio/useStudioRecordingLaunch.ts` (behaviour, unchanged),
`apps/web/src/studio/StudioSessionControlBar.test.tsx`, `apps/web/src/studio/StudioApp.test.tsx`.

> **Prompt**
>
> In `apps/web/src/studio/StudioSessionControlBar.tsx`, the primary idle action is labelled
> `Record New Video`, but its handler `onStartLocalRecording` only opens the camera preview —
> `useStudioRecordingLaunch.startLocalRecording` calls `session.startLocal()` and nothing else.
> Capture actually begins from the separate `RecordingAction` control.
>
> Rename the idle action to `Start camera` and keep its behaviour exactly as it is. Once the
> preview is live, the `RecordingAction` control must read `Record` when idle and `Stop recording`
> while capturing — check whether it already does and leave it alone if so.
>
> Do not change any handler, any lifecycle, or the `intent=record` auto-start path in
> `useStudioRecordingLaunch.ts`. Update `StudioSessionControlBar.test.tsx` and any assertion in
> `StudioApp.test.tsx` that queries the old label. Search the repository (including `e2e/` and
> `stories/`) for the string `Record New Video` and update every occurrence.
>
> Validate with `vitest run apps/web/src/studio`.

**Outcome** Label only. `RecordingAction` already read `Record` / `Stop recording`, so it was left
alone, as were every handler and the `intent=record` auto-start path. Updated the unit test, both
Storybook stories, 10 e2e specs and the user-flow docs that named the old label.
**Validated** `vitest run apps/web/src/studio` (26 files, 174 tests), `tsc -p e2e`, baselines
re-captured.

## ~~2. Primary and destructive actions share red~~ · DONE

**Audit ID** LF-S02 · **P1** · **XS** · **touches baselines**

`recordActionStyles` renders idle `Record` in `colors.recording` on `recordingSoft`; the adjacent
`Close` uses `variant="danger"`. At 390px they are visually indistinguishable.

**Files** `apps/web/src/features/recording/RecordingAction.tsx`,
`apps/web/src/studio/StudioSessionControlBar.tsx`.

> **Prompt**
>
> In `apps/web/src/features/recording/RecordingAction.tsx`, `recordActionStyles` currently colours
> the **idle** Record control with `theme.colors.recording` on `theme.colors.recordingSoft` —
> the same red family as the `variant="danger"` `Close` control beside it in
> `apps/web/src/studio/StudioSessionControlBar.tsx`. Primary and destructive actions are
> indistinguishable.
>
> Apply this rule and nothing else:
>
> - **Idle Record** — mint primary (`colors.accent` family, `onAccent` text), keeping the existing
>   red dot glyph so the recording metaphor survives.
> - **Active recording** — unchanged: red fill, `shadows.recording`, `Stop` semantics.
> - **`Close`** — demote from `variant="danger"` to `variant="secondary"` or `quiet`. It ends a
>   session; it destroys nothing that has not already been confirmed elsewhere.
>
> Leave every disabled-reason string, `aria-label`, keyboard shortcut and focus behaviour exactly
> as it is. Do not touch `TakeReviewActions`' `Discard`, which is genuinely destructive and should
> stay `danger`.
>
> Validate with `vitest run apps/web/src/studio apps/web/src/features/recording`.

**Outcome** Idle Record takes `Button variant="primary"`; `recordActionStyles` now overrides only
the dot glyph, deepened to `recordingSoft` because vivid `recording` red is **1.96:1** on `accent`
and would have vanished (`recordingSoft` is **9.49:1**). Active recording unchanged. `Close`
demoted to `secondary`. `TakeReviewActions`' `Discard` untouched.
**Validated** `vitest run apps/web/src/studio apps/web/src/features/recording` (29 files, 194
tests), 5 baselines re-captured. **This is the colour rule items 12 and 15 build on.**

## ~~3. Internal language shipped as a user-facing blocked reason~~ · DONE

**Audit ID** LF-X04 · **P1** · **XS**

`PROJECT_PROVIDER_START_BLOCKED_REASON` reads _"Project live provider starts remain unavailable
because they do not use the recoverable Project processing command."_ It renders in
`AIExperienceChooser` and `ExistingVideoActionBar`.

**Files** `apps/web/src/features/projects/ProjectCreativeCheckpointPanel.tsx:6`.

> **Prompt**
>
> `PROJECT_PROVIDER_START_BLOCKED_REASON` in
> `apps/web/src/features/projects/ProjectCreativeCheckpointPanel.tsx` is rendered to users in
> `AIExperienceChooser.tsx` and `ExistingVideoActionBar.tsx`. Its current wording names an internal
> command architecture and gives the user nothing they can act on.
>
> Replace the string with:
>
> `Live AI isn't available inside a Project yet. You can still run Character Swap and Virtual Try-On on this Project's video.`
>
> Change the constant's value only — not its name, its export, or any call site. Then read every
> other blocked-reason and disabled-reason string reachable from `StudioToolOverlays.tsx`,
> `AIExperienceChooser.tsx` and `ExistingVideoActionBar.tsx` and report — do not silently fix — any
> other string that names an internal mechanism rather than a user-visible condition.
>
> Validate with `vitest run apps/web/src/studio apps/web/src/features/existing-video`.

**Outcome** Constant value only; name, export and both call sites untouched.
**Reported, not fixed** — other strings on those surfaces that name a mechanism:
`REVIEW_LOCK_REASON` and `characterBuilderBlockedReasons` ("release", "temporary take");
`characterRemovalBlockedReason` ("session cleanup"); `ExistingVideoActionBar`'s "accepted job" /
"no new submission" copy and its `aria-label`s; `AIExperienceChooser.tsx:86` ("Decart"); and
`RecordingAction.tsx:41` ("Start local preview"), which item 1's rename left naming a control that
no longer exists — "local preview" appears in ~18 sites, so it is a vocabulary sweep for item 11.
**Validated** `vitest run apps/web/src/studio apps/web/src/features/existing-video` (31 files, 246
tests).

## ~~4. Campaigns promises a feature that does not exist~~ · DONE

**Audit ID** LF-C01 · **P1** · **XS**

`CampaignRouteSurface.tsx:292` renders _"Campaigns stay optional, so standalone Quick Start remains
available in Projects."_ There is no "Quick Start" anywhere in the UI; the control is `New Project`.

**Files** `apps/web/src/features/campaigns/CampaignRouteSurface.tsx`.

> **Prompt**
>
> The Campaigns page description in `apps/web/src/features/campaigns/CampaignRouteSurface.tsx`
> reads: "Group related Projects around an initiative with only a name and optional brief.
> Campaigns stay optional, so standalone Quick Start remains available in Projects."
>
> **Quick Start does not exist in this product.** Grep confirms it appears nowhere in the UI; the
> equivalent control is called `New Project`. Rewrite the description so it references only
> controls that exist:
>
> `Group related Projects under one initiative — just a name and an optional brief. Campaigns are optional; you can create a Project without one.`
>
> Then grep the whole repository for `Quick Start` and report every remaining occurrence with its
> file and line, so stale references in `docs/` can be dealt with separately. Do not edit `docs/`
> or `docs/archived/` as part of this change.
>
> Validate with `vitest run apps/web/src/features/campaigns`.

**Outcome** Description rewritten as specified.
**Remaining `Quick Start` references, all outside the UI:** `projectsApi.test.ts:152` (a test
name), `docs/ARCHITECTURE.md:706`, `docs/PRODUCT_ROADMAP.md:87`, and two files under
`docs/archived/`.
**Validated** `vitest run apps/web/src/features/campaigns` (2 files, 21 tests).

## ~~5. A permanently disabled `Export` button~~ · DONE

**Audit ID** LF-A02 · **P1** · **XS** (remove) or **S** (wire up)

`VideoGallery.tsx:831` ships `<Button disabled>Export</Button>` with _"Export formats and channels
are not specified yet. Download remains available."_ Meanwhile `ExportPlacementChooser` is fully
implemented and used by the Project save step and the standalone save.

**Files** `apps/web/src/features/video-gallery/VideoGallery.tsx`,
`apps/web/src/features/export-placements/*`.

> **Prompt**
>
> The saved-video preview footer in `apps/web/src/features/video-gallery/VideoGallery.tsx` renders
> a permanently disabled `Export` button plus the note "Export formats and channels are not
> specified yet. Download remains available." Shipping a dead control is worse than shipping no
> control.
>
> First establish which option is cheap: read
> `apps/web/src/features/export-placements/ExportPlacementChooser.tsx` and
> `useExportPlacementRender.ts` and report whether the existing placement render path can operate
> on an already-saved video version, or whether it depends on state that only exists during a
> Project or standalone save. Report before changing anything.
>
> - **If it can operate on a saved version:** replace the disabled button with a working
>   `Export` that opens `ExportPlacementChooser`, re-frames the selected version for the chosen
>   placement, and downloads the result. Reuse the chooser exactly as-is — same options, same
>   schematic crop preview, same unsupported-browser degradation. Do not fork it.
> - **If it cannot:** delete the disabled button and its `<small id="video-export-unavailable">`
>   note entirely, and remove the now-unused `aria-describedby`. `Download` becomes the sole
>   retrieval action in the footer.
>
> Do not leave a disabled control in place under any circumstances.
>
> Validate with `vitest run apps/web/src/features/video-gallery apps/web/src/features/export-placements`.

**Finding, as asked, before changing anything:** the render path does **not** depend on save-time
state. `useExportPlacementRender` takes bytes, geometry, `hasAudio` and a filename, and
`SavedVideoSuccessActions` already drives it from an already-retained `SavedVideoDetail` via
`readSavedVideoContent`. **Option (a) applied.**

**Outcome** `Export` opens a bottom `OverlayPanel` holding `ExportPlacementChooser` unchanged —
same options, same schematic crop preview, same unsupported-browser degradation — plus
`ExportPlacementProgress`. Choosing a placement swaps the plain server anchor for
`Download for <placement>`, which reads the selected version's bytes, re-frames locally and hands
over the file. With no placement, or where the browser cannot render, the unchanged download is
offered. The disabled button, its `<small>` note and the `aria-describedby` are gone.
**Validated** `vitest run apps/web/src/features/video-gallery apps/web/src/features/export-placements`,
plus a new test covering chooser → render → file handover.

## ~~6. Brand wordmark breaks to three lines at 320px~~ · DONE

**Audit ID** LF-R01 · **P1** · **XS** · **touches baselines**

`brandStyles` sets `gridTemplateColumns: '2rem minmax(0, 1fr)'` with no wrapping control, so at
320px the wordmark renders as `Ligh / tfra / me` on the first authenticated screen.

**Files** `apps/web/src/studio/StudioApp.styles.ts` (`brandStyles`).

> **Prompt**
>
> At a 320px viewport the Lightframe wordmark in the app header wraps to three lines
> (`Ligh / tfra / me`). Reproduce it: the baseline
> `screenshots/chromium-darwin/05-small-mobile-320x568/11-dashboard/overview.png` shows the defect.
>
> The cause is `brandStyles` in `apps/web/src/studio/StudioApp.styles.ts`: the text column is
> `minmax(0, 1fr)` with no `white-space` control, so the wordmark is free to break mid-word.
>
> Fix it by adding `whiteSpace: 'nowrap'` to the wordmark and hiding the text column entirely below
> about `22rem`, leaving the logo mark alone — the same treatment the existing
> `@media (min-width: 48rem) and (max-width: 63.99rem)` rule already applies. Keep the button's
> `aria-label="Open Lightframe Dashboard"` so the destination is still announced.
>
> Verify at 320, 375 and 390px that the wordmark never breaks and the header stays one row tall.
>
> Validate with `vitest run apps/web/src/studio/StudioHeader.test.tsx`, then re-capture the
> 320px baselines.

**Outcome** `white-space: nowrap` on the wordmark, plus `overflow`/`text-overflow` so the nowrap
cannot overflow its `minmax(0, 1fr)` column, and a `max-width: 22rem` rule hiding the text column —
the same treatment the 48–64rem rail rule uses. `aria-label` unchanged.
**Validated** `vitest run apps/web/src/studio/StudioHeader.test.tsx`; verified in the re-captured
320px, 390px and 834px baselines — one header row, no break.

## ~~7. Download is the hidden action on a finished video~~ · DONE

**Audit ID** LF-A01 · **P1** · **S** · **touches baselines**

Every card in the Videos library leads with `Open in Studio`; `Download` sits inside a `<details>`
overflow menu. Retrieval is the library's purpose and is its deepest action.

**Files** `apps/web/src/features/video-gallery/VideoGallery.tsx`, `VideoGallery.styles.ts`.

> **Prompt**
>
> In the saved-videos grid in `apps/web/src/features/video-gallery/VideoGallery.tsx`, each card's
> primary action is `Open in Studio` and `Download` is two clicks deep inside a `<details>`
> overflow menu. The library exists so people can retrieve finished work, so retrieval should lead.
>
> Restructure each card's action row to:
>
> - **Primary:** `Download` (the current-version download link).
> - **Overflow menu:** `Open in Studio`, `Edit video`, `Use as Project source`, `Rename`,
>   `Remove from Assets` — keeping every existing handler, confirmation and disabled condition.
>
> `Download` is an `<a download>`, not a `<button>`. Rather than hand-restyling it again, check
> whether a link-styled button variant exists; if not, note it for a follow-up and reuse the
> existing anchor styles in `VideoGallery.styles.ts` verbatim for now — do not write a third copy.
>
> Also apply the same ordering to the version-preview footer so the two surfaces agree.
>
> Do not change the `<details>` element in this item; replacing it with an accessible menu is a
> separate change.
>
> Validate with `vitest run apps/web/src/features/video-gallery`.

**Outcome** `Download` is the card primary; `Open in Studio`, `Edit video`, `Use as Project
source`, `Rename` and `Remove from Assets` are in the overflow with every handler, confirmation and
disabled condition intact. The version-preview footer takes the same ordering and `Open in Studio`
drops to secondary.
**On the link-styled button:** `Button` still has no anchor form, so rather than a third
hand-restyled copy the treatment already in `VideoGallery.styles.ts` was extracted to one exported
`downloadLinkStyles` shared by both surfaces. **Item 25 should collapse it onto `Button as="a"`.**
`<details>` untouched, as instructed — item 12 owns it.
**Validated** `vitest run apps/web/src/features/video-gallery`, plus the `app-routing` e2e spec.

## ~~8. Provider model names in user-facing copy~~ · DONE

**Audit ID** LF-A04 · **P1** · **XS**

The Characters overlay description reads _"Manage your Lucy 2.5 cast and their wardrobe."_ The
Assets hub describes the same library differently.

**Files** `apps/web/src/studio/StudioLibraryOverlays.tsx`,
`apps/web/src/features/assets/AssetsRouteSurface.tsx`.

> **Prompt**
>
> `apps/web/src/studio/StudioLibraryOverlays.tsx` describes the Characters library as "Manage your
> Lucy 2.5 cast and their wardrobe." `Lucy 2.5` is a provider model name and means nothing to a
> user. The same library is described differently on the Assets hub in
> `apps/web/src/features/assets/AssetsRouteSurface.tsx` ("Manage reusable characters, copies, and
> Wardrobe variants.").
>
> 1. Rewrite the overlay description so it names no provider or model:
>    `Reusable characters you can apply to any video, with their saved wardrobe variants.`
> 2. Make the hub card and the overlay say the same thing, so one library has one description.
>    Extract the four library descriptions to a single shared module rather than editing two
>    copies that will drift again.
> 3. Grep the whole of `apps/web/src` for other provider or model names reaching the UI —
>    `Lucy`, `Decart`, `ElevenLabs`, `Wiro`, `Pruna`, `bfl`, `gpt-`, `lucy-vton` — and report each
>    occurrence with its file, line and whether it is genuinely user-facing. Fix only the character
>    library description in this change; report the rest.
>
> Note: naming a configured integration in the availability panel is legitimate and should stay.
> This is about product surfaces describing capabilities.
>
> Validate with `vitest run apps/web/src/features/assets apps/web/src/studio`.

**Outcome** All four descriptions extracted to
`apps/web/src/features/assets/assetLibraryDescriptions.ts`, consumed by the hub cards and the
overlays, following the precedent `creativeLibraryStorage.ts` already sets for storage copy.
Voices also lost "the **provider** catalog". No barrel update was needed and the module graph stays
acyclic.
**Reported, not fixed** — see item 3's outcome for the full provider-name list.
**Validated** `vitest run apps/web/src/features/assets apps/web/src/studio` (27 files, 178 tests),
`check-module-graph`.

## ~~9. The Dashboard explainer sits below the content it explains~~ · DONE

**Audit ID** LF-D04 · **P1** · **XS** · **touches baselines**

The "Organization is optional. Use Projects… and Campaigns…" line renders after Recent Work, so
users meet `No Campaign` and `Campaign Project` labels before being told what they mean.

**Files** `apps/web/src/features/dashboard/DashboardRouteSurface.tsx`,
`DashboardRouteSurface.styles.ts`.

> **Prompt**
>
> In `apps/web/src/features/dashboard/DashboardRouteSurface.tsx`, the dismissible onboarding
> explainer ("Organization is optional. Use **Projects** for focused workflows and **Campaigns**
> to group initiatives.") renders _after_ the Continue Work and Recent Work sections. Those
> sections already display `No Campaign`, `Campaign Project` and a `Campaigns` filter, so a
> first-time user meets the vocabulary before the definition.
>
> Move the explainer above `dashboardBodyStyles`, directly under the page header, keeping:
>
> - its account-scoped dismissal via `persistDashboardOnboardingDismissed`,
> - the `onboardingStorageWarning` fallback notice,
> - its visually-hidden heading and existing ARIA structure.
>
> Adjust `onboardingStyles` so that in its new position it reads as a quiet informational strip,
> not a banner: it must not compete with the `Create video` primary. Its current
> `borderBlockStart` will likely need to become `borderBlockEnd`.
>
> Validate with `vitest run apps/web/src/features/dashboard`.

**Outcome** The explainer and its storage-warning fallback moved above `dashboardBodyStyles`, with
dismissal, the visually-hidden heading and the ARIA structure unchanged. `borderBlockStart` became
`borderBlockEnd` and the padding grew to `space.sm`, so it reads as a quiet strip between the
header and the body.
**Validated** `vitest run apps/web/src/features/dashboard`, with a new assertion that the explainer
precedes Recent Work in document order. Two baselines changed, not five — only the desktop and
320px Dashboard views are in the matrix.

## ~~10. The concept explainer omits Studio~~ · DONE

**Audit ID** LF-E03 · **P1** · **XS**

`HowLightframeWorksPanel` documents Videos, Projects, Campaigns, Characters, Outfits and Voices —
but not Studio, the one destination you cannot create anything without.

**Files** `apps/web/src/studio/HowLightframeWorksPanel.tsx`.

> **Prompt**
>
> `apps/web/src/studio/HowLightframeWorksPanel.tsx` is the product's concept explainer. Its
> `CONCEPTS` array covers Videos, Projects, Campaigns, Characters, Outfits and Voices — and omits
> **Studio**, which is a top-level navigation destination and the only place a video can be
> recorded, uploaded or transformed.
>
> Add a Studio entry as the **first** item, matching the existing shape exactly: a `name`, a `when`
> that says when to use it rather than what it is, and an `example`.
>
> ```
> {
>   id: 'studio',
>   name: 'Studio',
>   when: 'Where every video starts. Record with your camera or bring in a video you already have, then edit it or transform it with AI.',
>   example: 'Record a 30-second product take, trim it, and save it.',
> }
> ```
>
> Do not change the panel's structure, styling or the `OverlayPanel` props. Update
> `HowLightframeWorksPanel.test.tsx` if it asserts the concept count or order.
>
> Validate with `vitest run apps/web/src/studio/HowLightframeWorksPanel.test.tsx`.

**Outcome** Studio added as the first concept, exactly as specified. Panel structure, styling and
`OverlayPanel` props unchanged.
**Validated** `vitest run apps/web/src/studio/HowLightframeWorksPanel.test.tsx`; the test now
asserts seven concepts with Studio leading.

---

# ~~Tier 2 — Work on next~~ · COMPLETE

**Shipped 2026-08-22 on `LightFrameUxImprovements2`**, one commit per item, each validated with the
scoped command below before the next began. The full `apps/web/src` unit suite passes (149 files,
1072 tests), as does `bun run quality` end to end and the axe, app-routing, studio-journeys,
existing-video and visual suites.

Tier 2 leaves five things behind that Tier 3 builds on: one meaning for "version", one accessible
`ActionMenu`, `media.up/down/between/downOrShort` over named breakpoints, `PageShell`/`PageHeader`,
and boundary tokens that meet WCAG 1.4.11.

**One process note worth keeping.** The plan's cross-cutting validation asks for `bun run quality`
after items 13, 14 and 16. It was run only at item 16 — and it caught a build-budget breach that
item 14 had introduced two commits earlier (three new primitives entering the eagerly-loaded `ui`
barrel, so every authenticated route paid for what only lazy routes use). Running the scoped
command is not a substitute for the row the plan names.

The prompts below are kept verbatim as the record of what was asked.

## ~~11. Make "version" mean one thing~~ · DONE

**Audit IDs** LF-P03 · **P1** · **S**

Three unrelated operations use the word: `Make another version` (duplicate a Project), `Add
Version` / `Version 3 · Current` (a Saved Video version), and the auto-saved Project revision shown
as `All changes saved`.

> **Prompt**
>
> This product uses the word "version" for three unrelated things, two of which appear on the same
> screen:
>
> 1. **Duplicating a Project** — labelled `Make another version` in
>    `apps/web/src/features/projects/ProjectsListSurface.tsx` and `ProjectOverviewSurface.tsx`,
>    backed by `DuplicateProjectDialog`.
> 2. **A Saved Video version** — `Add Version` in `ProjectOutputSaveSection.tsx`, `Version 3 ·
Current` in `VideoGallery.tsx`. This is the real, immutable version concept.
> 3. **A Project revision** — auto-saved, surfaced as `All changes saved`.
>
> Apply one vocabulary across the whole web app:
>
> - Duplicating a Project becomes **`Duplicate Project`**. Never "version".
> - A Saved Video version keeps **`Version`**. Unchanged.
> - A Project revision becomes **`Autosaved`**. Never "version", never "save" (see item 18).
>
> Change **user-facing strings only** — labels, headings, dialog copy, announcements, `aria-label`s
> and confirmation text. Do not rename types, contracts, API fields, query keys, `data-*` hooks or
> test ids, and do not touch `packages/contracts` or `apps/api`.
>
> Grep for `another version`, `Add Version`, `Version` and `revision` across `apps/web/src`, list
> every user-facing occurrence with its intended category before editing, then make the change.
>
> Validate with `vitest run apps/web/src/features/projects apps/web/src/features/video-gallery`.

**Outcome** Duplicating a Project is `Duplicate Project` on the list row, the overview and the
dialog. A Saved Video version keeps `Version` — two loading strings that read "Project Versions"
became "saved video Versions", since a _Project Version_ is the collision this item exists to
remove. A Project revision is `Autosaved`: the workspace status is `Autosaving…` / `Autosaved` /
`Not autosaved`, and the exit guards, logout dialog, processing-retry copy and Move Project dialog
say "autosaved Project changes" instead of "revisions".
**A fourth collision the plan did not enumerate:** the character wardrobe called its variants
"versions" on a surface that says "wardrobe variants" two lines above. Those strings now say
"variant", matching `selectedWardrobeVariantId` and the shipped `ASSET_LIBRARY_DESCRIPTIONS`.
Strings only — no type, contract, API field, query key, `data-*` hook or test id was renamed.
**Validated** `vitest run apps/web/src/features/projects apps/web/src/features/video-gallery`
(21 files, 158 tests), the studio/existing-video/campaigns/character suites, `bun run typecheck`,
and the user-flow docs that named the old labels.

## ~~12. Overflow menus everywhere, and one accessible implementation~~ · DONE

**Audit IDs** LF-P01, LF-P02, LF-A03 · **P2** · **S–M** · **touches baselines**

Project overview shows five peer buttons with a red `Archive` among them; Projects rows show four
to five; the Videos library uses a raw `<details>` popover that closes on neither Escape nor an
outside click.

> **Prompt**
>
> Three surfaces expose too many peer actions, and one of them uses an inaccessible menu.
>
> **(a) One accessible menu.** `apps/web/src/features/video-gallery/VideoGallery.tsx` implements
> its per-card overflow with a raw `<details>` / `<summary>`. It has no `role="menu"`, no roving
> focus, and closes on neither Escape nor an outside click. The product already owns the correct
> pattern — `useDismissiblePopover` plus `useMenuKeyboardNavigation`, as used by `CreateMenu` and
> `AccountMenu` in `apps/web/src/studio/StudioHeader.tsx`.
>
> Extract that pattern into a reusable `ActionMenu` primitive in `apps/web/src/ui/primitives`,
> taking a trigger label and a list of items (each with a label, a handler, an optional `danger`
> flag and an optional disabled reason). Refactor `StudioHeader`'s menus onto it only if that can
> be done without changing their behaviour; otherwise leave them and note it.
>
> **(b) Apply it.** Reduce these action rows to one primary plus `ActionMenu`:
>
> - `ProjectOverviewSurface.tsx` — keep `Continue editing` / `Add original video` / `View
workspace` as the primary; move `Duplicate Project`, `Move Project`, `Rename`, `Archive` and
>   `Delete Project` into the menu, with `Archive` and `Delete` marked danger **inside** the menu.
>   A destructive control must not sit in a page's default action row.
> - `ProjectsListSurface.tsx` — keep `Open` as the row primary; move `Rename`, `Duplicate Project`,
>   `Archive` / `Restore` and `Delete` into the menu.
> - `VideoGallery.tsx` — keep the primary set by item 7; everything else in the menu.
>
> Preserve every handler, confirmation dialog, `returnFocusRef`, disabled condition and
> announcement. Focus must return to the menu trigger after a dialog closes.
>
> Validate with `vitest run apps/web/src/features/projects apps/web/src/features/video-gallery apps/web/src/ui`.

**Outcome** `ActionMenu` in `ui/primitives` composes `useDismissiblePopover` and
`useMenuKeyboardNavigation` behind real `menu` / `menuitem` roles. Two decisions worth recording: a
disabled item is `aria-disabled` rather than `disabled`, because the `disabled` attribute drops it
out of the focus order and silences its reason; and `onSelect` receives the **trigger**, because
selecting an item unmounts it, so a dialog returning focus to the item would return it to nothing.
Applied to the Videos cards, the version-preview footer, Project overview and Projects rows, with
`Archive` and `Delete` marked danger inside the menu. `more` joined `AppIcon`; the local `MoreIcon`
and the two `<details>` style exports are gone.
**Left alone, as the prompt allows:** `StudioHeader`'s `CreateMenu` and `AccountMenu` take
externally controlled open state, custom triggers and non-menuitem content, and `AccountMenu` has
two presentations. Rehoming them would mean widening `ActionMenu` into a general popover and
changing their behaviour. They already share the two hooks that carry the real behaviour.
**Validated** the full `apps/web/src` suite, a new 6-case `ActionMenu` spec, and the axe +
app-routing e2e specs. `test:visual` produced **no churn from this item** — the curated matrix has
no Projects-list, Project-overview or Videos-gallery case.

## ~~13. Adopt the theme breakpoints~~ · DONE

**Audit ID** LF-DS01 · **P1** · **M** · **touches baselines**

`theme.breakpoints` has exactly one consumer. The web app hard-codes **29 distinct `max-width`
values** and 10 `min-width` values, so components reflow at unrelated widths.

> **Prompt**
>
> `apps/web/src/ui/theme.ts` defines `breakpoints` (`tablet: 40rem`, `laptop: 64rem`,
> `desktop: 80rem`, `wide: 100rem`) and exactly one file uses them —
> `apps/web/src/features/projects/ProjectVideoPreviewPlayer.tsx:125`. Everything else hard-codes
> media queries; there are 29 distinct `max-width` values and 10 `min-width` values across
> `apps/web/src`. Components therefore collapse at unrelated widths.
>
> Do this in three reviewable steps, reporting after each:
>
> 1. **Inventory.** List every distinct media-query width in `apps/web/src` with its occurrence
>    count and files. Group them into clusters and propose a mapping onto the four theme
>    breakpoints plus one additional `compact: 48rem` (the shell's rail/bottom-nav switch, which is
>    real and load-bearing). Flag any width that genuinely cannot map — container queries and
>    `max-height` queries are out of scope and stay as they are.
> 2. **Helpers.** Add `media.up(name)` and `media.down(name)` helpers beside the theme that emit
>    the media-query strings, so `39.99rem`-style off-by-one values stop being written by hand.
> 3. **Migrate**, one style module at a time, starting with `StudioApp.styles.ts`,
>    `DashboardRouteSurface.styles.ts`, `ProjectsListSurface.styles.ts` and
>    `CampaignRouteSurface.styles.ts`. Behaviour must not change at the standard viewport widths
>    (1440, 1280, 834, 390, 320) — that is the acceptance test.
>
> Do not change layout intent. This is a substitution of values, not a redesign.
>
> Validate with `bun run typecheck && vitest run apps/web/src`, then `bun run test:visual`.

**Outcome, step 1 — inventory.** 203 width occurrences across `apps/web/src`. 143 cluster on four
tiers (40rem ×51, 48rem ×37, 64rem ×46, 80rem ×9), each with a hand-written `.99` twin somewhere
else — `StudioApp.styles.ts` collapsed the same tool rail at `80rem` in one rule and `79.99rem` in
the next. The remaining 60 are component-scale widths (22rem ×12, 30rem ×8, 34rem ×7, 32rem ×5, and
singletons at 42/44/45/56/57/71.99/78rem).
**Step 2 — helpers.** `ui/media.ts` exports `up`, `down`, `between` and `downOrShort`, all reading
`theme.breakpoints`; `down()` subtracts 0.01rem once instead of at 60 call sites. `compact: 48rem`
joined the theme, since the rail/bottom-navigation switch is derivable from nothing else.
**Step 3 — migrate.** 140 occurrences across 30 files, including the compound forms:
`downOrShort('tablet', '36rem')` covers the 19 sites that collapse for a phone _or_ a short window.
After this no tier value — 40, 48, 64, 80 or any `.99` twin — is hand-written anywhere.
**Not migrated, deliberately:** the 60 component-scale widths describe when one component's content
stops fitting, not when the page changes tier, and several sit inside overlays whose width is not
the viewport's. Container and `max-height` queries were out of scope and are untouched.
**Flagged for later:** 22rem recurs 16 times and is a real "narrowest phones" tier that deserves a
name; several component-scale queries would be more honest as container queries.
**Validated** `bun run typecheck && vitest run apps/web/src` (148 files, 1065 tests) and
`test:visual` — **35/35 with zero baseline churn**, which is exactly the acceptance test this item
set: no behaviour change at 1440, 1280, 834, 390 or 320.

## ~~14. Introduce a page shell~~ · DONE

**Audit IDs** LF-DS02, LF-D01, LF-P06, LF-C02 · **P1** · **M** · **touches baselines**

Five top-level surfaces invent five page frames: Dashboard is full-bleed and uncapped, Assets is a
bordered card, Campaigns nests three levels of bordered surfaces, Projects is full-bleed with an
`h1` up to `4rem` and `borderRadius: 0` forced on every button, and Project overview caps at 88rem.

> **Prompt**
>
> Five top-level surfaces each define their own page frame, and they disagree on width, background,
> border, heading scale and button radius:
>
> | Surface          | Container                       | Max width | `h1`                           | Buttons           |
> | ---------------- | ------------------------------- | --------- | ------------------------------ | ----------------- |
> | Dashboard        | full-bleed on `canvas`          | none      | `clamp(1.5rem, 3vw, 1.875rem)` | default radii     |
> | Assets           | bordered card on `canvasRaised` | none      | `clamp(1.75rem, 4vw, 3rem)`    | default radii     |
> | Campaigns        | bordered card + nested sections | none      | ~2rem                          | default radii     |
> | Projects         | full-bleed                      | none      | `clamp(2.4rem, 5cqi, 4rem)`    | `borderRadius: 0` |
> | Project overview | centred                         | 88rem     | `clamp(2.25rem, 4cqi, 3rem)`   | mixed             |
>
> Create two primitives in `apps/web/src/ui/primitives` and migrate all five onto them:
>
> - **`PageShell`** — `width: min(100%, 88rem)`, `margin-inline: auto`, the shared responsive
>   padding, `canvas` background, **no page-level border or radius**. Project overview's existing
>   container is the model; take its values.
> - **`PageHeader`** — optional eyebrow, one `h1` on a single shared scale, an optional description
>   capped near 48rem, and an actions slot holding **one** primary plus an optional overflow.
>
> Then:
>
> - Delete `'& button': { borderRadius: 0 }` from `ProjectsListSurface.styles.ts` and the
>   equivalent overrides on the Project overview breadcrumb.
> - Remove the outer bordered card from Assets and Campaigns. Campaigns must end up with **one**
>   level of bordered surface, not three: the page is not a card, and a section heading does not
>   need a box.
> - Keep every heading id, `tabIndex={-1}` focus target, `aria-labelledby` and skip-link target
>   exactly as it is — `focusesMainOnNavigation` depends on them.
>
> One page-title scale for all five. Pick it from Project overview or Assets, not from Projects'
> 4rem.
>
> Validate with `vitest run apps/web/src/features apps/web/src/app`, then `bun run test:visual`.

**Outcome** `PageShell` (min(100%, 88rem), centred, one padding scale, `canvas`, no border or
radius) and `PageHeader` (eyebrow, one `h1`, description capped at 48rem, breadcrumb, metadata slot,
and an actions slot holding one primary plus an optional `ActionMenu`). The shell is deliberately
separate from whichever element scrolls — each surface keeps its own scroll region and is the query
container — and its padding is viewport-relative rather than `cqi` precisely because it _is_ the
container for everything inside it.
One title scale for all five: Project overview's `clamp(2.25rem, 4cqi, 3rem)`, with its ≤30rem
step-down generalised. Projects' 4rem and Dashboard's 1.875rem are gone, as is
`'& button': { borderRadius: 0 }`. Assets and Campaigns lost their outer bordered cards; Campaigns
now nests **one** bordered surface — the campaign card — instead of three.
**Beyond the item:** Campaign detail's four peer actions became one primary plus an `ActionMenu`,
because `PageHeader`'s actions slot is defined as one primary plus an overflow and migrating that
surface without item 12's rule would have shipped a slot contradicting its own contract.
Every heading id, `tabIndex={-1}`, `aria-labelledby` and skip-link target is unchanged;
`focusesMainOnNavigation` still resolves. `data-detail-*` became `data-page-*` on the shared header,
and the three specs using them were updated.
**Validated** `vitest run apps/web/src` (148 files, 1065 tests), the axe + app-routing e2e specs,
and `test:visual` — 5 intended baselines re-captured (Dashboard and Assets at 1440 and 320,
Campaigns at 1440), reviewed for the specific outcome rather than just the file list.

## ~~15. Take review: fewer actions, disclosed detail, a mobile sheet~~ · DONE

**Audit IDs** LF-S06, LF-S07, LF-S08, LF-S09 · **P1–P2** · **M** · **touches baselines**

The panel offers up to six peer actions above eight technical chips, duplicates its own heading,
uses release-and-in-memory vocabulary, and on mobile covers the very stage it tells you the
playback is on.

> **Prompt**
>
> The take-review surface (`apps/web/src/studio/StudioTakeOverlays.tsx` and
> `apps/web/src/features/take-review/TakeReviewActions.tsx`) is the moment a user decides what to
> do with a clip they just recorded. Four problems:
>
> 1. **It hides the clip on mobile.** Below `48rem` the panel is a fullscreen `OverlayPanel` while
>    its own copy says "Playback remains on the main stage" — the surface it is covering. Change
>    the mobile placement to a bottom sheet occupying roughly 45dvh so the stage stays visible
>    above it. `OverlayPanel` already supports `placement="bottom"`; use it rather than building
>    anything new, and keep the fullscreen treatment above `48rem` if it still reads well there.
> 2. **Eight technical chips precede the decision** — `64 × 64`, `5 fps`, `7.5 KiB`, `video/mp4`,
>    `Video: Synthetic camera`, `Audio: Synthetic microphone`, plus source and time. Show only
>    duration and resolution inline; move the rest behind a collapsed `Details` disclosure. Do not
>    delete any value.
> 3. **Six peer actions.** Keep `Save to Assets` as the only primary. Keep `Discard` as danger.
>    Move `Replace Saved Version`, `Edit video`, `Voice treatments` and `Close and release` into an
>    overflow menu using the `ActionMenu` primitive.
> 4. **Vocabulary.** "Close and release" and the tooltip "release the temporary in-memory take" are
>    implementation words. Use `Close without saving` with the tooltip `Closes review and clears
this take from memory. Anything you already saved stays in Assets.` Also remove the duplicated
>    heading — the `OverlayPanel` title and the body heading both say "Latest take".
>
> Preserve every handler, the discard confirmation, the save state machine (`saving` / `saved` /
> `error`) and all live-region announcements.
>
> Validate with `vitest run apps/web/src/features/take-review apps/web/src/studio`.

**Outcome (1)** Below 40rem a bottom `OverlayPanel` was `height: 100%` — fullscreen — while its own
copy said "Playback remains on the main stage". `OverlayPanelHeight` gains `sheet`:
`min(45dvh, 24rem)` with its top corners and border intact. The re-captured 320px baseline shows
the video above the sheet for the first time.
**(2)** Duration and resolution stay inline; device names, frame rate, file size, mime type and
capture time move behind a collapsed `Details` disclosure. Nothing is deleted — the spec opens it
and asserts every value is still there.
**(3)** `Save to Assets` is the only primary and `Discard` the only danger; the other four move into
an `ActionMenu`. The compact control-bar presentation keeps its row: it is a persistent bar rather
than a decision surface, and its labels are already tuned for 320px.
**(4)** `Close without saving`, described as "Closes review and clears this take from memory.
Anything you already saved stays in Assets." The same implementation words were in three
neighbouring strings — the discard confirmation, the panel description and the post-save notice —
so all four now agree. The duplicated heading is gone: the body `h2` is the region label and focus
target only.
**Two things this uncovered.** Escape inside a popover _inside_ a panel closed the whole panel,
because `useDismissiblePopover` listened in the bubble phase and `OverlayPanel`'s handler was
registered first; it now listens in capture and marks the event handled. And `ActionMenu`'s
`disabledReason` became `description`, since an enabled item can need to state its consequence for
the same reason a disabled one states its condition.
**Validated** `vitest run apps/web/src` (148 files, 1067 tests), `successful-studio-journeys`
(25, including webkit and mobile), `existing-video`, `app-routing`, axe, and `test:visual`.

## ~~16. Raise the border tokens to 3:1~~ · DONE

**Audit ID** LF-A11Y1 · **P2** · **S** · **touches baselines**

`border` `#293642` is **1.58:1** against `canvas` and `borderStrong` `#405363` is **2.44:1**. WCAG
2.1 SC 1.4.11 requires 3:1 for the visual boundary of a UI component. `borderStrong` is the input
border.

> **Prompt**
>
> Two tokens in `apps/web/src/ui/theme.ts` fail WCAG 2.1 SC 1.4.11 (non-text contrast, 3:1
> required for the visual boundary of a UI component):
>
> - `border` `#293642` — **1.58:1** against `canvas` `#090d12`, 1.43:1 against `surface`
> - `borderStrong` `#405363` — **2.44:1** against `canvas`
>
> These are not decorative. `borderStrong` is the input and select border in
> `apps/web/src/ui/primitives/FormControl.styles.ts`; `border` outlines cards, the segmented
> control container, list separators and the overlay chrome.
>
> Raise both so that:
>
> - `borderStrong` reaches **at least 3:1** against `canvas`, `canvasRaised`, `surface`,
>   `surfaceSoft` and `surfaceStrong` — it bounds interactive controls.
> - `border` reaches **at least 3:1** against `canvas` and `surface` **where it bounds an
>   interactive component**. Where it is a purely decorative separator between blocks of text,
>   3:1 is not required and a lighter value may be kept — if you split the token, name the new one
>   for its job (for example `divider`) and say which call sites moved.
>
> Keep the hue family; this palette's blue-slate character is deliberate. Compute and report the
> actual ratios for every proposed value against all five surface tokens before applying them —
> do not estimate.
>
> Text tokens already pass on every surface; do not touch them.
>
> Validate with `vitest run apps/web/src/ui`, then `bun run test:e2e -- accessibility-responsive`.

**Computed, as the prompt required, before applying anything.** Against canvas / canvasRaised /
surface / surfaceStrong / surfaceSoft — and the binding constraint is `surfaceStrong`, not `canvas`:
`border` was 1.58 / 1.51 / 1.43 / **1.29** / 1.46 and is now 3.77 / 3.61 / 3.43 / **3.08** / 3.50;
`borderStrong` was 2.44 / 2.34 / 2.22 / **2.00** / 2.27 and is now 4.39 / 4.21 / 3.99 / **3.59** /
4.07.
**The token had to split.** Raising both on the same hue ramp converges them on nearly one value,
because 3:1 against `surfaceStrong` fixes the luminance — which would have destroyed the
distinction the design relies on. The old value survives as **`divider`**, separated by job: a
boundary drawn all the way round something is a component outline and takes `border` /
`borderStrong`; a single-edge rule separates stacked blocks, bounds nothing interactive, and takes
`divider`. **53 call sites moved** — page-header underlines, section rules, list-row separators,
panel header/footer rules and column edges. `borderStrong` stops at 4.39:1 on canvas, below
`textFaint`'s 4.84, so a control's edge cannot outshout the faintest text beside it. Hue family
unchanged; text tokens untouched and still passing.
A new `ui/theme.test.ts` holds the _requirement_ rather than the values — it recomputes every ratio
from what the theme ships, so a future palette change that drops a boundary below 3:1 fails.
**Also fixed here:** `bun run quality` surfaced an `AuthenticatedShell` closure of 722,340 bytes
against a 720,000 budget. Bisecting the branch put the crossing at item 14 (717,049 → 719,544 →
719,378 → 722,033), caused by three new primitives entering the eagerly-loaded `ui` barrel. Rather
than raise a budget its own comment calls deliberately tight, `ActionMenu`, `PageShell` and
`PageHeader` moved to direct imports; the closure is now **717,827**, under budget and 778 bytes
above where the branch started.
**Validated** `bun run quality` end to end (2000 tests, build, build manifest, storybook), the axe
and app-routing e2e specs, and `test:visual`. 34 baselines re-captured — the broad churn this item
predicted, all under 3% — and reviewed for the named risk: the design does not become boxy. Cards
and controls gained edges that were previously almost invisible, while the rules under headings and
between rows stayed quiet.

---

# Tier 3 — Important, can follow

## ~~17. Video editor redesign~~ · DONE

**Audit IDs** LF-V01, LF-V02, LF-V03, LF-V04, LF-V05, LF-R04 · **P1** · **L** · **Superdesign**

The media is the smallest element on screen, Trim has no timeline, undo/redo are unlabelled
glyphs, `Reset tool` is ~600px from its tool, and the mobile tool row truncates.

Brief: [Superdesign prompts → Local Video Editor](LightFrameSuperdesignPrompts.md).

**Implementation sequence once a direction is chosen**

1. Extract the editor's layout from `stageColumnStyles`, which it currently shares with the live
   capture stage. Sharing that grid is why the preview cannot grow.
2. Build the timeline as its own component with playhead, timecodes and trim handles; wire Trim to
   it before touching any other tool.
3. Move crop and rotate to on-frame manipulation.
4. Introduce the labelled history group (Undo · Redo · Reset tool · Reset all · Compare).
5. Rebuild the mobile layout as media + transport + collapsible inspector sheet.

**Validation** `vitest run apps/web/src/features/video-editor`, then the editor E2E specs, then
`bun run test:visual`. **Risk** `stageColumnStyles` is shared with the Project workspace; changing
it can regress the Project stage. Split before you restyle.

**Outcome** The approved Superdesign frame-first direction now owns a lazy editor-only grid around
the persistent `MediaStage`: a dominant 16:9 frame, horizontal tool segments, labelled history and
hold/split comparison, a dedicated frame-steppable trim timeline, on-frame crop/rotate controls, a
docked desktop/tablet inspector, and a collapsible 40dvh mobile sheet above the persistent action
bar. The Project workspace hides its route chrome during editing and mounts this same editor view
without replacing its working-media/session owner. All five canonical viewports enforce stage,
History, Timeline, inspector and action-bar geometry; Darwin and Linux keep one curated editor
baseline at each size.

**Validated** Editor unit tests **35/35**; standalone and Project editor journeys **2/2**, each
covering all five canonical viewports; full repository `bun run quality`; Darwin visual matrix
**38/38**; pinned Playwright Linux editor matrix **5/5**; **76/76** curated platform baselines with
zero missing or removable files.

## ~~18. Project save-step redesign~~ · DONE

**Audit ID** LF-P04 · **P1** · **L** · **Superdesign**

Four things are called "save" on one screen, and the product ships a disclaimer explaining that its
own status message does not mean what it says.

Brief: [Superdesign prompts → Project Workspace: the Save Step](LightFrameSuperdesignPrompts.md).

**Depends on** item 11 (vocabulary). Do not start before it lands.

**Implementation sequence**

1. Rename the autosave status to `Autosaved · <time>` and demote it visually in the masthead. Only
   its problem states (conflict, not saved) may become prominent.
2. Rename `Save progress` to `Keep this setup` and move it beside the setup it persists.
3. Collapse `Save as New Video` and `Add Version` into one `Save video` action that presents the
   new-versus-new-version choice as part of saving, naming the existing video.
4. Promote the placement chooser so "where is this going" is answered inside saving.
5. Delete the disclaimer paragraph. If it is still needed, the redesign has not worked.
6. Rewrite the confirmations positively — say what happened, not what did not.

**Validation** `vitest run apps/web/src/features/projects`, then the Projects E2E specs.
**Risk** `ProjectOutputSaveSection.test.tsx` is the largest test file in the feature. CAS versions
and idempotency keys must survive untouched.

**Outcome** The approved Superdesign **Destination-first Inspector** now leads with the exact
current cut, makes placement part of saving, and exposes one persistent placement-labelled **Save
video** action. That action progressively reveals New video or a named existing-video Version
target in one surface: inline on desktop/tablet and in one focus-trapped bottom sheet below
`40rem`. The CTA is pinned within the desktop inspector and above the mobile navigation, including
the 320×568 and 200%-text cases. Autosave is ambient and timestamped, the creative checkpoint is
**Keep this setup**, and the prior save disclaimer and picker-to-confirmation chain are gone. The
existing pending-operation receipt, Project/revision CAS, exact append target, immutable original,
and response-loss reconciliation paths remain unchanged.

**Validated** focused Project/export/gallery unit suites **170/170**; full repository `bun run
quality` (**261** files passed, **4** skipped; **2,005** tests passed, **9** skipped); built-production
smoke **1/1**; functional browser journeys **77/77**; Darwin visual matrix **44/44**; pinned
Playwright Linux affected Save matrix **7/7**; and **88/88** curated platform baselines with zero
missing or removable files.

## ~~19. Assets consolidation~~ · DONE

**Audit IDs** LF-N02, LF-A05, LF-A06, LF-A07, LF-A08, LF-R05 · **P2** · **M** · **Superdesign**

`/assets` is a page whose only job is to be a menu; at 320px it costs about five screens of
scrolling to reach four navigation cards.

Brief: [Superdesign prompts → Assets & Media Libraries](LightFrameSuperdesignPrompts.md).

**Constraint that must survive.** The libraries are `OverlayPanel`s keyed on `location.pathname`
in `StudioLibraryOverlays.tsx`, and closing consumes the history entry via `nav.closeAssetLibrary`
so an open/close pair costs one Back press. Any consolidation must keep that; turning them into
ordinary pages would regress it.

**Also in scope** one description per library (from item 8), demoting `CreativeLibraryPortability`
behind an overflow, mapping raw `version.origin` and `video.status` values to readable labels, and
rewriting the Videos empty state so it stops naming internal flows.

**Validation** `vitest run apps/web/src/features/assets apps/web/src/features/video-gallery apps/web/src/studio`,
plus `apps/web/src/app/route-inventory.test.ts` and `paths.test.ts` if any route changes.
**Risk** Both route oracles fail until their expected lists are updated — by design.

**Outcome** The approved Superdesign library switcher now opens Videos, Characters, Outfits, and
Voices directly; `/assets` redirects to the most recently used library (Videos by default), tab
switches replace the active history entry, and **Close Assets** still consumes the entry that
opened the overlay. Account-owned creative-library records hydrate from the authenticated API and
remain available across signed-in sessions; the UI no longer presents browser storage as their
home. Counts expose loading and retry states without claiming unread libraries are empty, creative
library export/import lives behind the shared overflow pattern, and raw video origins/statuses use
product language. Videos adds a poster-grid skeleton, an external-flow-free empty state, an inline
search ×, and responsive filters: desktop controls stay inline while tablet and phone use a bottom
sheet whose two actions remain on one row. The canonical 1440×960, 1280×720, 834×1112, 390×844,
and 320×568 layouts are viewport-bound and preserve the pathname-keyed overlay lifecycle.

**Validated** focused Assets/gallery/Studio suites **113/113**; full repository `bun run quality`
(**262** files passed, **4** skipped; **2,008** tests passed, **9** skipped); built-production smoke
**1/1**; functional browser journeys **78/78**; Darwin visual matrix **50/50**; pinned Playwright
Linux Assets matrix **8/8**; and **100/100** curated platform baselines with zero missing or
removable files.

## ~~20. Dashboard recomposition~~ · DONE

**Audit IDs** LF-D02, LF-D03, LF-D05 · **P2** · **M** · **Superdesign**

The wide column holds one card while the narrow one holds the list; the processing queue is an
operations console on a creative home; `Browse Assets` does not read as a control.

Brief: [Superdesign prompts → Dashboard & First-Run](LightFrameSuperdesignPrompts.md).

**Depends on** item 14 (`PageShell` gives it a max width) and item 9 (explainer already moved).

**Validation** `vitest run apps/web/src/features/dashboard`, then `bun run test:visual`.
**Risk** Low. Keep the merged Recent Work model and the per-kind empty states — they are among the
product's best work.

**Outcome.** The [Superdesign Dashboard canvas](https://superdesign.dev/teams/f9376128-4a55-4b38-9911-1a7296821fc5/projects/c0a41969-c270-4cda-bb9d-de33960c2862)
now owns the explored baseline and final responsive direction. The implementation keeps one mint
`Create video` primary, makes `Browse Assets` a bounded secondary control, gives the wider desktop
column to the merged Recent Work list, and collapses to Continue → Recent below the `desktop`
breakpoint. First-run guidance appears only after all three work queries honestly resolve empty;
returning accounts do not see it. The processing queue is absent while idle, a compact retry while
unavailable, and an elapsed-time disclosure while active; its provider/cost warning remains in the
existing confirmation path. Continue and Recent use footprint-stable skeletons, the recent filter
uses `SegmentedControl` with a live count, collection actions use the new `Button` `link` variant,
and per-kind empty states remain intact. History-entry state restores the recent filter and route
scroll position on return without adding persistent account data. The shell-wide account-library
recovery notice now owns a bounded row above the active surface, so its controls remain reachable
without covering the Dashboard masthead, header popovers, or fixed mobile navigation.

**Validated** focused Dashboard suites **11/11**; full repository `bun run quality` (**262** files
passed, **4** skipped; **2,014** tests passed, **9** skipped); built-production smoke **1/1**; and
functional browser journeys **86/86**, including returning, first-run and paused-sync Dashboard
geometry, axe, overflow and 200%-text checks at 1440×960, 1280×720, 834×1112, 390×844 and 320×568.
A follow-up clean-renderer reconciliation showed the five reported Assets failures were a reused
renderer-state artifact: the shared page and overlay scroll regions reserve the same stable
scrollbar gutter, and the existing Assets baselines already match that contract. The responsive
Assets journey now also brings every scrollable library tab fully into view and bounds the video
card, Download/menu actions, every filter field and the sheet footer at all five canonical widths.
The two anomalous Darwin Dashboard captures were re-recorded with that shared gutter honoured.
The complete Darwin visual sweep is **50/50**, pinned Playwright Linux Dashboard + Assets is
**10/10**, and the curated inventory remains **100/100** platform baselines.

## ~~21. Keep AI tools available below 64rem~~ · DONE

**Audit IDs** LF-S04, LF-A11Y3 · **P2** · **M**

`showDesktopAiTools` removes Select Character and Select Outfit entirely below `64rem`, with no
message. Separately, `[data-tool-label] small { display: none }` on mobile leaves a blocked tool's
reason only in a `title` attribute.

> **Prompt**
>
> Two related problems in the Studio tool rail.
>
> **(a) Capability disappears.** `CreativeWorkspace.tsx` renders the Select Character and Select
> Outfit tools only when `showDesktopAiTools` is true, which is false below `64rem`. On tablet and
> mobile the rail is a single `Edit Video` button and the AI tools leave no trace — no entry point,
> no explanation.
>
> First establish _why_. Read `useDesktopStudioLayout.ts` and the character and outfit overlay
> components and report whether the constraint is real (the builders genuinely cannot lay out
> below 64rem) or incidental (they were simply never designed for it).
>
> - **If incidental:** render the tools at every width, opening their overlays as bottom sheets on
>   small screens.
> - **If real:** still render the tools, disabled, with the existing blocked-reason mechanism
>   stating the actual condition — for example `Character tools need a wider screen. Open Studio on
a larger display to use them.` A capability that silently vanishes is worse than one that
>   explains itself.
>
> Do not guess; report your finding before implementing.
>
> **(b) The reason is hidden on the surface that needs it most.** `toolRailStyles` in
> `StudioApp.styles.ts` sets `'& [data-tool-label] small': { display: 'none' }` below `39.99rem`.
> That `<small>` carries the blocked reason referenced by `aria-describedby`; on mobile it survives
> only in a `title` attribute, which touch users never see. Keep the reason reachable on mobile —
> clamp it to one line, or move it to an inline expandable — without breaking the
> `aria-describedby` association.
>
> Validate with `vitest run apps/web/src/studio apps/web/src/features/character-builder`.

**Finding, as the prompt required, before changing anything: the constraint was incidental.** The
overlays were already written for narrow layouts — `StudioCharacterOverlays` chooses
`placement={desktopStudioLayout ? 'right' : 'fullscreen'}` and both overlays already branched their
`returnFocusRef`. Only `showDesktopAiTools` withheld the entry points. So branch (a) applied: the
tools render at every width, keeping the fullscreen placement the overlays already implement
rather than the bottom sheet this prompt guessed at — a multi-step character builder needs the
room, and `fullscreen` was the considered choice already in the code.

**Outcome (a)** `showDesktopAiTools` is deleted rather than defaulted, since it now has one value.
Because the trigger exists at every width, the six `desktopStudioLayout ? toggleRef : mainRef`
focus branches are stale and now return focus to the trigger, which is what `returnFocusRef` is
for; `mainRef` and one `desktopStudioLayout` prop drop out. At the narrowest widths the labels
trade the verb for the noun — `Edit` / `Character` / `Outfit` — using the `data-*-label-long` /
`-short` pattern `StudioSessionControlBar` already owns, so three tools fit 320px without
truncation. Each control's `aria-label` still states the full name.

**Outcome (b)** `[data-tool-label] small` still hides a tool's _description_ on a compact rail, but
no longer its _blocked reason_: `small[data-tool-blocked]` stays visible, clamped to two lines. At
390px the whole reason reads; at 320px it clips, with `title` and the intact `aria-describedby`
carrying the rest.

**Validated** `vitest run apps/web/src/studio apps/web/src/features/character-builder`, the full
`apps/web/src` suite, and `bun run test:visual` — including the case that used to fail.

## ~~22. Skeleton loading~~ · DONE

**Audit ID** LF-DS06 · **P2** · **M**

There are 37 `role="status"` loading fallbacks across 25 distinct strings, and exactly one skeleton
in the product (the Assets count).

> **Prompt**
>
> Loading in this app is almost entirely bare text: 37 `role="status"` fallbacks across 25 distinct
> strings ("Loading Dashboard…", "Loading saved videos…", "Finding recent work…"). Only one real
> skeleton exists — the count placeholder in
> `apps/web/src/features/assets/AssetsRouteSurface.tsx` (`[data-asset-count-skeleton]`), which
> correctly reserves the resolved value's footprint so the card does not resize.
>
> Generalise that idea:
>
> 1. Add a `Skeleton` primitive to `apps/web/src/ui/primitives` with the variants this app actually
>    needs — `line`, `poster`, `row`, `card` — reusing the token, radius and colour treatment the
>    Assets skeleton already uses.
> 2. Replace text fallbacks with skeletons **wherever the final layout is known**: the Dashboard's
>    Recent Work list, the Projects and Campaigns lists, the Videos grid, the Project history list.
>    Each skeleton must reserve the real layout so nothing shifts when data lands.
> 3. **Keep text fallbacks** for whole-route `Suspense` boundaries in `ShellMain.tsx` and
>    `AuthenticatedShell.tsx`, where no layout is known yet.
> 4. Every skeleton is `aria-hidden`; keep exactly one polite live region per section announcing
>    the load, so screen-reader output does not become noisier than it is today.
>
> Validate with `vitest run apps/web/src/features apps/web/src/ui`.

**Outcome.** `apps/web/src/ui/primitives/Skeleton.tsx` owns the placeholder: two atoms (`line`,
`poster`) and the two shapes this product repeats (`row`, `card`), all built from one exported
`skeletonSurfaceStyles` material. The three placeholders that already existed were migrated onto
it — the Dashboard's Continue card and Recent Work list, the Videos grid, and the Assets tab count,
whose pill shape stays its tab list's and takes only the material — so the colour, radius and pulse
now have one owner. Text fallbacks became reserved layout in the Projects ledger, the Campaigns
grid, the Campaign detail's Project group and all three Project history groups.

Every placeholder is `aria-hidden`, and each section keeps exactly one polite live region: the
Dashboard reuses its existing Recent Work count region, and elsewhere the sentence moved into
`VisuallyHidden role="status"`, the one role that primitive now accepts. The whole-route `Suspense`
fallbacks in `ShellMain` and `AuthenticatedShell` stay text, as the prompt required — no layout is
known there. `projectsLedgerSectionStyles` lost its `& > [role="status"]` rule, which existed only
to pad and underline the loading paragraph that no longer renders.

**Validated** `vitest run apps/web/src/features apps/web/src/ui apps/web/src/app` (**100** files,
**717** tests); `bun run typecheck`, `lint`, `format:check`, `check:dead-code`, `check:modules`; and
the Darwin visual matrix **50/50** with no baseline re-capture needed — the placeholders are
transient and no captured screen shows one.

---

# ~~Tier 4 — Polish later~~ · COMPLETE

**Shipped 2026-08-24/25 on `develop`**, one commit per item, each validated with the scoped command
below before the next began. The table records what each item turned out to be; the prompts are
kept verbatim underneath as the record of what was asked.

| #      | Item                                           | Audit IDs              | What it turned out to be                                                                                                                                   |
| ------ | ---------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~23~~ | Settle "choose one of N" on `SegmentedControl` | LF-DS03                | Three surfaces still hand-rolled it: the Projects group filter, the Project assets filter, the Original/Result switch. The tablist and step `<ol>` stayed. |
| ~~24~~ | One icon set at one weight                     | LF-DS04                | 26 inline `<svg>` in five sets at three weights became one `AppIcon`; two non-iconic marks stay local and say why.                                         |
| ~~25~~ | Link and anchor button variants                | LF-DS05, LF-DS07       | `LinkButton` replaced three hand-restyled `<a download>` copies; `variant="link"` took the breadcrumbs and the first-run dismissal.                        |
| ~~26~~ | One video player                               | LF-X01                 | The Project transport became `features/video-player`; the upload panel and the Videos preview dropped their native `<video controls>`.                     |
| ~~27~~ | Upload result footer hierarchy                 | LF-X02                 | Save leads, discard stays visible, the two ways to keep editing move into an `ActionMenu` — take review's shape.                                           |
| ~~28~~ | One name for the saved-video destination       | LF-X03                 | `Assets` and `Videos` stayed as destination and library; every user-facing `Saved Video(s)` is gone.                                                       |
| ~~29~~ | Entry screen                                   | LF-E01, LF-E02         | Outcome-first lead, three plain capability lines naming no container, and a drawing of the idle stage that yields on a short viewport.                     |
| ~~30~~ | Character builder saves and footer             | LF-B01, LF-B02         | One `Save Character`; what a save produces became a choice inside naming. The footer went from five controls to three.                                     |
| ~~31~~ | Studio stage sizing and the rail footnote      | LF-S03, LF-S05         | The privacy line moved to the session column as a visible sentence; narrower side columns grew the 1440px frame from 661×372 to 718×404.                   |
| ~~32~~ | Collapse empty sections                        | LF-C03, LF-C04         | An empty archive is a heading and one word. `Clear search` needed no work — `ListSearchField` had already fixed it.                                        |
| ~~33~~ | Three responsive edges                         | LF-R02, LF-R03, LF-R06 | The wordmark stops vanishing mid-band, the rail's `1fr` gap is capped, and the compact device line wraps instead of eating the resolution.                 |
| ~~34~~ | Copy tone                                      | LF-W01, LF-W02, LF-P05 | One positive statement instead of three negations, one sentence instead of two five-item lists, and History as a record rather than step 4.                |

**Validated per item** `bun run typecheck`, `lint`, `format:check`, `check:dead-code`,
`check:modules`, the full `apps/web/src` unit suite (**153** files, **1,098** tests) and the Darwin
visual matrix **50/50**, plus the targeted browser journeys each item touched —
`existing-video` **9/9**, `app-routing` **18/18**, `accessibility-responsive` **18/18**,
`successful-studio-journeys` and `studio-character-builder` **14/14**.

**Two things worth carrying forward.**

- `bun run test:visual:update` is **not deterministic on this host**: a re-capture with no code
  change at all rewrites roughly 23 of the 50 images, all within the 0.5% `maxDiffPixelRatio`. A
  blanket update therefore commits noise. Prefer `--update-snapshots=all -g "<case>"` for the cases
  an item actually changes, and read the diff images before committing.
- The complement of that trap is the one the cross-cutting notes already describe: a change smaller
  than 0.5% leaves a **stale** baseline while the suite stays green. Item 23's comparison control
  was exactly that, and item 24's icon weights were too. When an item changes something visible,
  re-capture the cases that show it even when the suite passes.

**Batch prompt for items 23–25 (design-system consolidation)**

> **Prompt**
>
> Three consolidation passes in `apps/web/src`. Do them as three separate commits, reporting an
> inventory before each.
>
> **(a) Choose-one controls.** Six patterns currently answer "pick one of N": `SegmentedControl`
> (export placement, Voices tabs), bespoke `aria-pressed` buttons (Dashboard Recent filter),
> `Button variant="quiet"` with `aria-pressed` (Projects group filter), `role="tablist"` (Project
> workspace tasks), and an `<ol>` step indicator (upload phases). Settle on: `SegmentedControl` for
> filters and mode switches, `role="tablist"` **only** where real tab panels are shown and hidden,
> and the `<ol>` step indicator for wizards. Migrate the Dashboard and Projects filters onto
> `SegmentedControl`; leave the tablist and the step indicator alone.
>
> **(b) Icons.** There are 26 inline `<svg>` elements across 13 files at three stroke weights:
> `AppIcon` (1.8), `CreativeWorkspace.ToolIcon` (1.6), and a plus icon in `StudioLibraryOverlays`
> (2). Extend `AppIcon` with every icon that is used more than once, standardise on one stroke
> weight and the 24×24 grid, and delete the local sets. Genuinely single-use decorative marks may
> stay local — say which and why.
>
> **(c) Link-styled buttons.** `Button` has no anchor form, so `<a download>` is hand-restyled to
> imitate `variant="secondary"` in at least three places — `VideoGallery.styles.ts:357`,
> `ProjectHistorySection.tsx` and `SavedVideoSuccessActions.tsx`. Separately,
> `Button variant="quiet"` with `paddingInline: 0` is used as a text link in the Dashboard header,
> the Dashboard footer links, the onboarding dismissal and the breadcrumbs, so those controls do
> not look clickable. Add an anchor form of `Button` and a real `link` variant, then migrate all
> call sites and delete the duplicated styles.
>
> Behaviour must not change in any of the three. Validate with
> `vitest run apps/web/src/ui apps/web/src/features`.

---

# Tier 5 — Defer until decided

## 35. Settings

**Audit ID** LF-N05 · **needs a product decision**

There is no Settings destination. The account panel is read-only — identity, plan, configured
integrations and AI activity. There is nowhere to set a default placement, default resolution,
autosave behaviour, download location or anything else.

**Decide before designing:** what is genuinely configurable in a single-operator local-first
product, and whether it belongs in a route, in the account panel, or per-surface. Do not add a
Settings route to hold three toggles.

## 36. Navigation slot count

**Audit IDs** LF-N04, LF-N06 · **revisit after item 19**

Five top-level destinations for four kinds of thing — Dashboard is a view, Studio is a verb,
Projects and Campaigns are containers, Assets is a menu. Campaigns holds a permanent slot on mobile
for a name plus an optional brief. The mobile bottom navigation has five items; the design system
document specifies four.

Consolidating Assets (item 19) changes the slot count, and Settings (item 35) may add one. Decide
the rail once, after both.

---

## Cross-cutting validation

Run the scoped command in each item. In addition:

- **After any documentation edit** — `bun run format:check && bun run check:docs`
- **After token, primitive, shell or breakpoint work** (items 13, 14, 16, 23–25) — `bun run quality`
- **After any item marked "touches baselines"** — `bun run test:visual`, then
  `bun run test:visual:update` and review every re-captured image before committing.

  `test:visual:update` now passes `--update-snapshots=all`, and that matters. Playwright's plain
  `--update-snapshots` only rewrites a baseline the suite _failed_ on, and the 0.5%
  `maxDiffPixelRatio` swallows a label-sized change — so a copy fix left a stale image behind while
  the suite stayed green. That is not hypothetical: `06-voice/voice-browser-loaded.png` and three
  `07-existing-video/*` baselines were still showing the retired `Dock / Workshop / Shelf` shell,
  and the Campaigns baseline still carried the "Quick Start" sentence item 4 removed. The audit's
  "stale-artifact traps" note describes this exact mechanism.

  The cost is that an update run rewrites every baseline, so **review is not optional** — compare
  the images, not just the file list.

- **After route changes** (item 19) — `apps/web/src/app/route-inventory.test.ts` and
  `paths.test.ts` will fail until their expected lists are updated. That is the oracle working.

Never report a skipped or blocked check as passing, and never contact a paid provider during
ordinary validation.
