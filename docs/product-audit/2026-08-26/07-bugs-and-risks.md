# Bugs and risks

**Confirmed** means reproduced in the running product or read directly in the code, with the
evidence quoted. **Potential** means reasoned but not reproduced; nothing in that section is given
a priority above P3.

---

# Confirmed bugs

## B1 · The saved video is not in the chosen placement, and the save panel says it is

**Severity** High · **Area** Project save, contracts, export

`ProjectOutputSaveSection.tsx:519` renders:

> This frame and the selected placement are what the saved video will use.

`saveProjectOutputRequestSchema` (`packages/contracts/src/projects.ts:849`) is:

```ts
{
  (expectedVersion, expectedRevisionNumber, media, target);
}
```

`media` is a reference to media that already exists. No re-framed bytes are sent, and no export
specification is sent. The placement is written to the revision snapshot as intent only; re-framing
happens later, in the browser, via `useSavedVideoPlacementDownload`.

The Assets library states the opposite, and is correct — `VideoExportPanel.tsx:52`:

> Re-framing happens in this browser; the saved version is not changed.

**Impact** The operator specifies an output shape, is told it was applied, and receives a file in
the original shape. Two surfaces make contradictory claims about the same mechanism.

**Fix** Roadmap step 4 — render at save time and store the re-framed bytes. Until then the copy is
false and should not be left standing.

---

## B2 · The placement is discarded between Project and Assets

**Severity** High · **Area** Assets export

`VideoExportPanel.tsx:33`:

```ts
const [placement, setPlacement] = useState<ProjectExportSpecification | null>(null);
```

Nothing reads the producing Project's `exportSpecification`. A video saved for "Phone, full screen"
opens its export panel with no placement selected, and the primary control becomes a plain
`Download` of the source shape.

**Impact** The most important decision in the product is silently discarded at the boundary between
Project and Asset.

**Fix** Roadmap step 5.

---

## B3 · A privacy claim that is false in the running configuration

**Severity** High (trust) · **Area** Studio stage

`MediaStage.tsx:171`, on the idle stage, unconditionally:

> Camera and microphone remain off until you select Start camera. Nothing leaves this browser in
> Local mode.

`emptyCopy(mode)` branches on `StudioMode` — the creative mode — not on the persistence mode. In the
audited configuration (`DATABASE_MODE=postgres`, `ASSET_STORE_PROVIDER=r2`, and
`/api/capabilities` reporting `creativeLibrary.cloudMirror: true` and
`savedVideos.directMultipartUpload: true`) media demonstrably does leave the browser.

**Impact** A product that makes an explicit privacy promise states it in a deployment where it does
not hold. The information needed to condition it is already on the client.

**Fix** Roadmap step 2.

---

## B4 · The fixed action bar covers the Save panel's own copy at 375 px

**Severity** Medium · **Area** Project workspace, small mobile

Measured at 375×812 on `/projects/:id/workspace?task=save`:

| Element                                                                              | Box         |
| ------------------------------------------------------------------------------------ | ----------- |
| Paragraph "This frame and the selected placement are what the saved video will use." | y 632 – 670 |
| Action bar — `position: fixed`, `z-index: 5`, `background rgba(9,13,18,0.96)`        | y 656 – 728 |

`document.elementFromPoint` sampled down the paragraph returns:

- 15 % down → `<p>` (visible)
- 50 % down → `<p>` (visible)
- **85 % down → the `<div>` containing "Save video · Phone, full screen"**

The panel does set `padding-bottom: 104px`, but the bar is positioned against the **viewport**, so
that padding only clears it at the bottom of the innermost scroll — not at intermediate positions.

A general occlusion sweep of every text-bearing leaf in `<main>` at that width found exactly one
occluded element: this one. It is a specific defect, not systemic.

**Contributing cause** Three nested scroll regions: `main#studio-main` (756 px, `overflow-y: auto`,
72 px bottom padding for the mobile nav) → `aside` (543 px) → inner `div` (473 px) containing a
1,224 px panel.

**Fix** Roadmap step 3.

---

## B5 · "Campaigns" breaks mid-word in the Dashboard filter at 375 px

**Severity** Low · **Area** Dashboard, small mobile

Renders as "Campai / gns". Measured: segment width 80 px, label needs ~85 px at 13.28 px.

- `SegmentedControl.tsx:48` — `overflowWrap: 'anywhere'`
- `DashboardRouteSurface.tsx:156` — `shortLabel` is supplied for `videos` only; `projects` and
  `campaigns` have none.

The mitigation already exists in the primitive and was not applied to the longest labels.

**Fix** Roadmap step 3.

---

## B6 · Creative tool labels truncate on small mobile

**Severity** Low · **Area** Project workspace, small mobile

"New Character 01" clips to "New Charact"; "Edit · Record or upload a video to edit it." truncates
mid-word to "Record or upload a…". The accessible names are correct
(`aria-label="Selected character: New Character 01. Open character options"`), so this is visual
only.

**Fix** Roadmap step 3.

---

## B7 · The step named "Create" cannot start creation

**Severity** Medium · **Area** Project workspace information architecture

`ProjectWorkspaceSurface.tsx:318-343` renders exactly three things into the Create tab panel:
`ProjectCreativeCheckpointPanel`, `ProjectWorkingMediaSection`, `ProjectProcessingStatusPanel`.

The last only refreshes, cancels or reconciles work that is already running. Its own copy:

> Looking for a durable current or accepted earlier-revision operation. This check never submits
> provider work.

Character Swap and Virtual Try-On are started from the bottom bar's **"Edit Video · Open the video
editor"**, which opens an overlay titled **"Use existing video"** running a second three-step wizard
(Source / Edit / Review) inside the first (Original / Create / Save).

**Impact** The primary creative action is two hops from the step named for it, behind a control
labelled for a different capability.

**Fix** Roadmap step 6.

---

## B8 · Internal identifiers shown to the operator

**Severity** Low–Medium · **Area** Several

| Where                              | What                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ProjectAssetsSection.tsx:411-413` | `abbreviatedId(membership.resourceId)` renders `01147510…fb0e1e` above every asset's real name   |
| Save panel                         | "Project change 37"                                                                              |
| Existing-video overlay             | `local-take-20260814T150841Z-ba6ebcb3.mp4`, `reference-da0ec4aa-951e-4acd-81bc-c3eb19a3ce1d.jpg` |
| Character Swap config              | "Decart API" / "Pruna API" as the user-facing engine choice                                      |
| Processing status                  | "durable current or accepted earlier-revision operation"                                         |

**Fix** Roadmap steps 7 and 8.

---

## B9 · No search in the Characters and Outfits libraries

**Severity** Low, rising with use · **Area** Creative libraries

`SavedCreativeLibrary.tsx` renders `items.map(...)` over the whole collection. No search, filter,
sort or pagination. Projects, Campaigns, Videos and Voices all have server-side search
(`listSearchSchema` in their contracts); these two do not.

**Fix** Roadmap step 9.

---

## B10 · `bun run check:docs` is currently failing

**Severity** Medium (process) · **Area** Repository

Thirteen broken links, from an in-progress move of three UX documents into `docs/archived/` without
updating referrers:

```
docs/README.md -> LightFrameUXAudit.md                              (×2)
docs/README.md -> LightFrameUXImplementationPlan.md                 (×2)
docs/README.md -> LightFrameSuperdesignPrompts.md                   (×2)
docs/archived/LightFrameSuperdesignPrompts.md -> user-flows/feature-behavior/README.md
docs/archived/LightFrameUXImplementationPlan.md -> ../CLAUDE.md
docs/product-audit/03-ui-ux-audit.md -> ../LightFrameUXAudit.md
docs/product-audit/03-ui-ux-audit.md -> ../LightFrameUXImplementationPlan.md
docs/product-audit/README.md -> ../LightFrameUXAudit.md
docs/product-audit/README.md -> ../LightFrameUXImplementationPlan.md
docs/user-flows/gaps-and-usability-audit.md -> ../LightFrameUXImplementationPlan.md
```

This is uncommitted working-tree state, not a shipped defect. It matters because it is the
validation gate for every documentation change that follows.

**Fix** Roadmap step 1.

---

# Potential risks — need reproduction

## R1 · Project overview status may contradict its own progress model

The Project detail surface showed step **3 Save** as current while the sentence above it read
_"Original video ready • Review workflow active."_ Whether these are two consistent views of one
state or a genuine mismatch requires reading `stepForSnapshot` against `projectStatusPresentation`
across every workflow phase. **Not verified. P3.**

## R2 · The workspace shows the idle capture stage before the Project's media arrives

On both desktop and mobile, opening `/projects/:id/workspace` briefly rendered the "Your private
creative stage" idle panel — including its privacy claim — before the recorded take appeared. Likely
a legitimate transient while the source is probed, but it means a Project with media momentarily
looks like a Project without any. **Timing not characterised. P3.**

## R3 · The two Project repositories may already have diverged

No divergence was found, because nothing systematically checks. 6,385 lines implementing the same
~50-method interface, tested by two suites with different strategies and no shared expectations.
**The risk is structural, not observed. P3.** See [06](06-technical-architecture-audit.md).

## R4 · Placement cannot be produced at all without WebCodecs

`videoEditRenderingSupported()` requires `Worker`, `OffscreenCanvas`, `VideoEncoder` and
`VideoDecoder`. Where any is missing the product falls back honestly to the source shape — but the
specified deliverable then cannot be produced by any path, because the server has none. Which
supported browsers this affects was **not measured** against
[`BROWSER_SUPPORT.md`](../../BROWSER_SUPPORT.md). **P3, and largely resolved by roadmap step 4.**

## R5 · Paid-job failures are hard to correlate in a deployed environment

Video-job failures log through `console.warn` without request or trace id, while reference-image
work logs through `pino` with both. Whether this has actually obstructed a real diagnosis is
unknown. **P3.**

---

# Deliberately checked and found sound

Recorded so that a later audit does not re-litigate them.

| Checked                               | Result                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Swallowed exceptions                  | None in `apps/web/src` or `apps/api/src`                                       |
| Object-URL leaks                      | 11 created, 10 revoked; asymmetry accounted for; no leak                       |
| Duplicate network requests            | The doubled dev requests are React StrictMode with `AbortSignal`, not a defect |
| N+1 / request waterfalls              | None on Dashboard, Projects, Campaigns or workspace load                       |
| Dead code                             | `knip` clean                                                                   |
| `TODO`/`FIXME`/`HACK`                 | Zero in application source                                                     |
| Duplicate navigation in the a11y tree | Mobile nav is `display: none` on desktop — genuinely absent                    |
| Tab accessible names                  | Correct; the tree reader's blank labels were a reader artifact                 |
| Login "session ended" copy            | Correctly conditioned on `sessionEndReason === 'expired'`                      |
| Full-video buffering                  | Fixed — sources stream over `206 Partial Content`                              |
| Creative-library data loss            | Fixed — export/import exists, with an honest warning                           |
| Provider safety switch                | Fixed — configuration, default `false`                                         |
| Save interrupted by reload            | Explicitly prevented and reconciled, with user-facing copy                     |
