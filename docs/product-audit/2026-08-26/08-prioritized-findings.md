# Prioritized findings

The full register. Every finding carries its evidence, both kinds of impact, effort, risk,
dependencies and the reason for its priority.

**P0** Critical — broken, dangerous, data-loss or security · **P1** Core product value ·
**P2** Major UX or product improvement · **P3** Quality, scalability, maintainability ·
**P4** Deliberately deferred.

Effort: **XS** under an hour · **S** half a day · **M** one to three days · **L** about a week ·
**XL** more.

---

## P0 — Critical

**None.**

This is a finding in itself and it is stated plainly rather than padded. No confirmed data-loss
path, no confirmed security hole, no broken journey, no destructive action without confirmation.
The first pass's two P0s — an unguarded provider safety switch and a browser-only creative library
with no export — are both closed and were re-verified here.

---

## P1 — Core product value

### F-01 · The saved video is not in the chosen placement

|                       |                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Area**              | Project save · contracts · export                                                                                                                                                                                                                                                                                                                                                                           |
| **Evidence**          | `saveProjectOutputRequestSchema` (`packages/contracts/src/projects.ts:849`) carries `{expectedVersion, expectedRevisionNumber, media, target}` — a reference to existing media, no re-framed bytes, no specification. Re-framing runs in the browser at download through `useSavedVideoPlacementDownload`. `ProjectOutputSaveSection.tsx:519` claims otherwise; `VideoExportPanel.tsx:52` states the truth. |
| **User impact**       | Specifies an output shape, is told it was applied, receives the original shape. The library holds a file that is not the deliverable.                                                                                                                                                                                                                                                                       |
| **Technical impact**  | The deliverable depends on browser codec support. The server can never produce the artifact it stores a specification for. Blocks any future sharing, publishing or multi-placement output.                                                                                                                                                                                                                 |
| **Priority**          | **P1**                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Effort**            | **L**                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Risk**              | Medium — touches the save path, which is idempotency- and CAS-guarded. Mitigated by reusing the existing renderer and working-media upload rather than building a server pipeline.                                                                                                                                                                                                                          |
| **Dependencies**      | None                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Action**            | Render the placement at save time with the existing WebCodecs worker, upload the re-framed bytes through the working-media path, reference them in the save. Keep the honest fallback where the browser cannot render, and record that the placement was not applied.                                                                                                                                       |
| **Why this priority** | It is the difference between the product's stated purpose and what it does. Everything downstream — variants, campaigns, publishing — is built on the artifact being real.                                                                                                                                                                                                                                  |

### F-02 · The placement is discarded between Project and Assets

|                       |                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Area**              | Assets export                                                                                                                                  |
| **Evidence**          | `VideoExportPanel.tsx:33` — `useState<ProjectExportSpecification \| null>(null)`. Nothing reads the producing Project's `exportSpecification`. |
| **User impact**       | A video saved for "Phone, full screen" downloads in source shape unless the operator remembers and re-picks.                                   |
| **Technical impact**  | Minor. The value is already on the revision and already reachable.                                                                             |
| **Priority**          | **P1**                                                                                                                                         |
| **Effort**            | **S**                                                                                                                                          |
| **Risk**              | Low                                                                                                                                            |
| **Dependencies**      | Reads better after F-01, but is independently correct and can ship first                                                                       |
| **Action**            | Default the export panel to the producing Project's recorded placement, and show the placement on the Video record.                            |
| **Why this priority** | Cheapest possible repair of the product's most important decision.                                                                             |

### F-03 · A privacy claim that is false in the running configuration

|                       |                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Area**              | Studio stage                                                                                                                                                                                                                                                                  |
| **Evidence**          | `MediaStage.tsx:171` — _"Nothing leaves this browser in Local mode."_ rendered unconditionally by `emptyCopy(mode)`, which branches on creative mode, not persistence mode. Audited configuration: `DATABASE_MODE=postgres`, R2 storage, `creativeLibrary.cloudMirror: true`. |
| **User impact**       | An explicit privacy promise stated where it does not hold.                                                                                                                                                                                                                    |
| **Technical impact**  | None — the persistence posture is already exposed through `/api/capabilities`.                                                                                                                                                                                                |
| **Priority**          | **P1**                                                                                                                                                                                                                                                                        |
| **Effort**            | **XS**                                                                                                                                                                                                                                                                        |
| **Risk**              | Very low                                                                                                                                                                                                                                                                      |
| **Dependencies**      | None                                                                                                                                                                                                                                                                          |
| **Action**            | Condition the sentence on the actual persistence and storage mode.                                                                                                                                                                                                            |
| **Why this priority** | Trust claims are either true or they are not features. XS effort, and the data is already there.                                                                                                                                                                              |

### F-04 · The step named "Create" cannot start creation

|                       |                                                                                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Area**              | Project workspace information architecture                                                                                                                                                                                                                                   |
| **Evidence**          | `ProjectWorkspaceSurface.tsx:318-343` renders only a setup checkpoint, current-cut management and a status panel whose own copy reads _"This check never submits provider work."_ Transforms start from "Edit Video · Open the video editor" → overlay "Use existing video". |
| **User impact**       | The primary creative action is two hops from the step named for it, behind a control labelled for a different capability.                                                                                                                                                    |
| **Technical impact**  | The workflow model in the domain and the navigation model in the UI disagree.                                                                                                                                                                                                |
| **Priority**          | **P1**                                                                                                                                                                                                                                                                       |
| **Effort**            | **M**                                                                                                                                                                                                                                                                        |
| **Risk**              | Medium — the overlay is a large, stateful surface with its own lifecycle                                                                                                                                                                                                     |
| **Dependencies**      | None                                                                                                                                                                                                                                                                         |
| **Action**            | Make the Create tab the entry point for Character Swap, Virtual Try-On and Voice. Retire or subordinate the overlay's competing wizard. Rename the bottom-bar control to what it opens.                                                                                      |
| **Why this priority** | It is the last major navigational confusion in an interface that has otherwise been cleaned up.                                                                                                                                                                              |

---

## P2 — Major UX or product improvement

### F-05 · Two competing three-step wizards

**Area** Project workspace · **Evidence** Project shows `1 Original / 2 Create / 3 Save`; the
overlay shows `Source / Edit / Review`, opened from inside step 2. **User impact** Two mental models
held at once. **Technical impact** None. **Effort** included in F-04 · **Risk** Low ·
**Dependencies** F-04 · **Action** One progress model per workflow.
**Why P2** Real cognitive cost, but subordinate to F-04, which is where it gets fixed.

### F-06 · Internal identifiers shown to the operator

**Area** Several · **Evidence** `ProjectAssetsSection.tsx:411-413` (`01147510…fb0e1e` above every
asset name); "Project change 37"; `local-take-20260814T150841Z-ba6ebcb3.mp4`;
`reference-da0ec4aa-….jpg`; _"durable current or accepted earlier-revision operation"_.
**User impact** Bookkeeping presented as information; nothing the operator can act on.
**Technical impact** None. **Effort** **S** · **Risk** Low · **Dependencies** None ·
**Action** Remove the identifiers, name files by what they are, and rewrite the two hardest
sentences. **Why P2** Finishes language work that is otherwise ~90 % complete, at low cost.

### F-07 · The AI engine is chosen by vendor name

**Area** Character Swap configuration · **Evidence** "Decart API" / "Pruna API" as a toggle. Their
real differences — Pruna requires a reference image, prepares input as H.264 MP4, accepts no custom
prompt, offers 1080p, needs explicit release after terminal failure — are modelled in
`/api/capabilities` and shown nowhere. **User impact** A consequential choice with no basis for
making it. **Technical impact** None; the data exists. **Effort** **S** · **Risk** Low ·
**Dependencies** None · **Action** Label engines by what they do; keep the vendor name in an
advanced disclosure. **Why P2** Exposes an implementation concept at the most expensive moment.

### F-08 · No search in Characters and Outfits

**Area** Creative libraries · **Evidence** `SavedCreativeLibrary.tsx` renders `items.map(...)`; no
search, filter, sort or pagination. Projects, Campaigns, Videos and Voices all have server-side
search. **User impact** The only libraries whose contents cost provider money to generate are the
only ones you cannot search. **Technical impact** Unbounded render at scale. **Effort** **S** ·
**Risk** Low · **Dependencies** None · **Action** Client-side search over the local store, matching
the existing `ListSearchField` and `SearchEmptyState` pattern. **Why P2** Cheap, and the gap grows.

### F-09 · A Campaign carries nothing

**Area** Campaigns · **Evidence** Schema and contract are `{id, ownerUserId, name, brief, status,
version, timestamps}`. Only functional edge is `projects.campaignId`. **User impact** The layer
meant to make repeat work cheap makes the second Project exactly as expensive as the first.
**Technical impact** None currently; the aggregate is well built and empty. **Effort** **L** ·
**Risk** Medium — new fields, new contract, migration · **Dependencies** F-01 (target placements are
meaningless until placements are real) · **Action** Give a Campaign target placements it hands to
each Project, and one view of every video it produced. **Why P2 not P1** High value, but it depends
on F-01 and the product is usable without it.

### F-10 · The application has no links

**Area** Navigation · **Evidence** Verified in the running page: exactly one `<a href>` in the whole
authenticated app — the skip link. All destinations are `<button onClick={navigate}>`; anchors are
used only for `download`. **User impact** No cmd- or middle-click, no copy link address, no hover
preview; assistive technology announces "button" for navigation. **Technical impact** None —
`paths.ts` already produces every URL. **Effort** **M** · **Risk** Medium — touches every list row
and the primary nav · **Dependencies** None · **Action** Render destinations as anchors that also
call `navigate`. **Why P2** A standard web affordance is entirely absent from a product whose URL
handling is otherwise meticulous.

### F-11 · No account-level record of AI spend

**Area** Account · **Evidence** `AccountPanel.tsx` shows entitlement _limits_ and a running-job
count; there is no usage endpoint in the 87-route inventory. AI history is per-Project only.
**User impact** Every submission costs money and nothing totals it. **Technical impact**
`processingJobs` and `projectJobs` already hold the records. **Effort** **M** · **Risk** Low ·
**Dependencies** None · **Action** An account-level ledger of submissions by operation and provider.
**Why P2** The product is scrupulous about cost at the moment of spending and silent about it
afterwards.

### F-12 · The fixed action bar covers the Save panel's copy at 375 px

**Area** Project workspace, small mobile · **Evidence** Hit-tested: paragraph y 632–670; fixed bar
`z-index: 5`, `rgba(9,13,18,0.96)`, y 656–728; `elementFromPoint` at 85 % down returns the bar.
**User impact** Copy hidden on the primary save surface at the most common phone width.
**Technical impact** Reveals a viewport-fixed element over a triply nested scroll stack.
**Effort** **XS** · **Risk** Low · **Dependencies** None · **Action** Reserve the bar's height in the
scroll region, or anchor the bar to the scroll container rather than the viewport.
**Why P2** Confirmed defect, trivially fixed, on the surface that matters most.

---

## P3 — Quality, scalability, maintainability

| ID       | Finding                                                             | Evidence                                                                                                                                        | Impact                                                                 | Effort | Risk | Action                                               |
| -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ | ---- | ---------------------------------------------------- |
| **F-13** | Three nested scroll regions on the mobile workspace                 | `main` 756 px → `aside` 543 px → `div` 473 px holding a 1,224 px panel                                                                          | Ambiguous touch scrolling; root cause of F-12                          | S      | Med  | Collapse to one scroll owner per surface             |
| **F-14** | "Campaigns" breaks mid-word at 375 px                               | `SegmentedControl.tsx:48` `overflowWrap:'anywhere'`; `shortLabel` given for `videos` only (`DashboardRouteSurface.tsx:156`)                     | Visible defect on the landing surface                                  | XS     | Low  | Supply the two missing short labels                  |
| **F-15** | Creative tool labels truncate on mobile                             | "New Charact"; "Record or upload a…"                                                                                                            | Visual only — accessible names are correct                             | XS     | Low  | Shorten or wrap the compact labels                   |
| **F-16** | Two Project repositories, no shared conformance suite               | 2,524 + 3,861 lines implementing one ~50-method interface; two unrelated test suites                                                            | Structural divergence risk; both modes live                            | M      | Low  | One parameterized suite over both                    |
| **F-17** | Provider logging split across two channels                          | BFL/Wiro via `pino` with request + trace id; video jobs via bare `console.warn`                                                                 | Paid-job failures are the hardest to diagnose and the least correlated | S      | Low  | Route all provider logging through the child logger  |
| **F-18** | `bun run check:docs` failing                                        | 13 broken links from an in-progress move into `docs/archived/`                                                                                  | Every later doc change validates against a red gate                    | XS     | Low  | Update the six referrers                             |
| **F-19** | Five components over 800 lines                                      | `VideoGallery.tsx` 1,057; `useExistingVideoWorkflow.ts` 924; `StudioApp.tsx` 840; `DashboardRouteSurface.tsx` 821; `video-job-service.ts` 1,424 | Slower review, easier regressions                                      | M each | Med  | Split when a change lands in one — not as a campaign |
| **F-20** | Creative libraries render unpaginated                               | `items.map(...)` over the whole store                                                                                                           | Fine at tens, not thousands                                            | S      | Low  | Fold into F-08                                       |
| **F-21** | An existing Project cannot be added to a Campaign from the Campaign | `POST /api/projects/:projectId/campaign` exists; no surface offers it                                                                           | Organizing after the fact means going to the Project                   | S      | Low  | Offer it on the Campaign surface                     |
| **F-22** | Projects cannot be filtered to one Campaign                         | Segmented control offers only "All Active" / "No Campaign"                                                                                      | Retrieval gap at scale                                                 | S      | Low  | Add a campaign filter                                |
| **F-23** | No path from one cut to several placements                          | Export model supports one specification per revision                                                                                            | The natural unit of marketing output                                   | M      | Med  | After F-01                                           |

---

## P4 — Deferred

| ID       | Finding                                                 | Why deferred                                                                                  |
| -------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **F-24** | No sharing or publishing; download is the only exit     | Publishing an asset that is the wrong shape is worse than not publishing. Revisit after F-01. |
| **F-25** | Single seeded user; no accounts, roles or collaboration | Already correctly deferred by the repository's own roadmap                                    |
| **F-26** | No multi-clip timeline editor                           | Out of scope for a single-source product                                                      |
| **F-27** | No brand kit or template system                         | Premature before Campaigns carry anything                                                     |

Full reasoning in [09-future-opportunities.md](09-future-opportunities.md).

---

## Quick wins

Low effort, disproportionate value. All are XS or S, all independently shippable.

| Rank | Finding                                  | Effort | Why it is a quick win                                               |
| ---- | ---------------------------------------- | ------ | ------------------------------------------------------------------- |
| 1    | **F-18** repair the docs link gate       | XS     | Five minutes, and it unblocks validation for everything after it    |
| 2    | **F-03** condition the privacy claim     | XS     | Removes a false trust claim; the data is already on the client      |
| 3    | **F-12** fix the Save panel occlusion    | XS     | Confirmed defect on the most important surface, one CSS change      |
| 4    | **F-14** two missing short labels        | XS     | Visible defect on the landing surface; the mechanism already exists |
| 5    | **F-02** carry the placement into Assets | S      | Rescues the product's most important decision from being discarded  |
| 6    | **F-06** drop the asset-card UUIDs       | S      | One line removed; visible everywhere assets appear                  |
| 7    | **F-08** search the creative libraries   | S      | Reuses `ListSearchField` and `SearchEmptyState` wholesale           |

Items 1–4 together are well under a day and close one false claim and two confirmed visual defects.
