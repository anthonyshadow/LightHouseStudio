# User-flow audit

Every meaningful journey the product supports, traced through the code and — except where stated —
driven in the running application.

**Not driven:** any flow whose completion requires submitting paid provider work. Character Swap,
Virtual Try-On and ElevenLabs voice replacement were traced through the code and inspected in the
UI up to the point of submission, and are marked accordingly. No paid job was submitted.

Severity: **S1** blocks the goal · **S2** substantially degrades it · **S3** noticeable friction ·
**S4** polish.

---

## F1 · First entry and sign-in

**Entry** `/` · **Goal** Get into the product.

**Steps** Land on the entry page → "Log in" → dialog opens with the demo login prefilled →
submit → `/dashboard`.

**Expected** Sign in and land somewhere that explains what to do.
**Actual** Exactly that. The entry page states what the product does in three lines ("Record with
your camera, or upload a video you already have", "Change who is on screen, what they wear, or how
they sound", "Trim, crop, rotate, relight and filter on this device") before asking for anything.
A protected destination is preserved across login and restored afterwards.

**Friction** None found. The "Your session ended" message is correctly conditioned on
`auth.sessionEndReason === 'expired'` and does not appear on a genuinely cold first visit.

**Severity** — · **Recommendation** Leave alone.

---

## F2 · Dashboard orientation

**Entry** `/dashboard` · **Goal** Work out what to do next, or resume.

**Steps** Read "Continue work" → or pick from "Recent work" → or "Create video" / "Browse Assets".

**Expected** The most recent thing is one click away; everything else is findable.
**Actual** Works. "Continue work" surfaces the most recently updated Project with a poster and a
"Continue Project" button. "Recent work" merges Projects, Videos and Campaigns into one
recency-sorted list with a kind filter, real posters, and a live processing-queue trigger when jobs
are running. Empty states carry worked examples and an action.

**Friction**

- At 375 px the "Campaigns" filter label breaks mid-word to "Campai / gns". Confirmed by
  measurement: the segment is 80 px wide, the label needs ~85 px, and `SegmentedControl.tsx:48` sets
  `overflow-wrap: anywhere`. The control supports a `shortLabel`, and `DashboardRouteSurface.tsx:156`
  supplies one for `videos` only.
- Recent work is capped at four items with no "see all" beyond the destination links.

**Severity** S3 · **Recommendation** Supply `shortLabel` for the two long options. Roadmap step 3.

---

## F3 · Record a standalone video

**Entry** `/studio/create` · **Goal** Capture something to work with.

**Steps** "Start camera" → grant permission → record → take review → keep or discard.

**Expected** Camera stays off until asked; the take is reviewable before it is kept.
**Actual** As designed. The stage stays dark and states that camera and microphone remain off. The
right rail carries device state and capture settings. Recording memory is bounded by a measured
policy (`docs/RECORDING_MEMORY_POLICY.md`).

**Friction**

- The idle stage says _"Nothing leaves this browser in Local mode."_ unconditionally
  (`MediaStage.tsx:171`). In the audited configuration — `DATABASE_MODE=postgres`, R2 object
  storage, `creativeLibrary.cloudMirror: true` — media plainly does leave the browser. The claim is
  not conditioned on the persistence mode even though the mode is already exposed to the client
  through `/api/capabilities`.
- On a desktop viewport the stage renders as a narrow portrait column, leaving large empty areas
  either side before any media exists.

**Severity** **S2** for the privacy claim — a product that makes an explicit privacy promise must
condition it on the running configuration. S4 for the layout.
**Recommendation** Condition the copy. Roadmap step 2.

---

## F4 · Upload an existing video

**Entry** `/studio/create` → "Upload Video" · **Goal** Bring in footage already shot.

**Expected** Pick a file, get it validated, land on something you can edit.
**Actual** Works. Validation is explicit about container, codec, duration and size
(`videoValidation.ts`), the 300 MB ceiling is enforced in the contract, and the result lands in the
same overlay the editor and transforms live in.

**Friction** The overlay presents the raw capture filename to the operator —
`local-take-20260814T150841Z-ba6ebcb3.mp4`. It is an internal name, not something the operator
chose or can act on.

**Severity** S3 · **Recommendation** Roadmap step 7.

---

## F5 · Create a Project

**Entry** `/projects` → "New Project", or Dashboard → "Create Project" · **Goal** Keep a piece of
work together.

**Expected** Name it, land in it.
**Actual** Works well. Naming is explicitly optional and the dialog says so. On success the list
announces the creation and navigates to the Project. `createIntent` is cleared from the history
entry, so Back does not re-open the dialog over a list that already contains the result.

**Friction** None found. This flow is in good shape.

**Severity** — · **Recommendation** Leave alone.

---

## F6 · Create a Campaign and start its first Project

**Entry** `/campaigns` → "New Campaign" → open it → "New Project".

**Expected** The Campaign shapes the Projects inside it.
**Actual** The mechanics work. The Campaign detail surface shows name, status, updated date, the
brief or "No brief yet", "New Project", and active/archived Project lists with counts.

**Friction**

- **The Campaign gives its Projects nothing.** The entire record is name plus optional brief. It
  carries no target placements, no channel, no deadline, no shared creative direction, and shows no
  aggregate of the videos it has produced. Creating the second Project in a Campaign is exactly as
  much work as creating the first.
- An existing Project cannot be added to a Campaign from the Campaign; only a new one can be
  started. (`POST /api/projects/:projectId/campaign` exists, so the capability is there — the
  Campaign surface does not offer it.)
- The Projects list can filter to "All Active" or "No Campaign", but not to _a_ Campaign.

**Severity** **S2** — this is the layer that is supposed to make repeat work cheap, and it does not.
**Recommendation** Roadmap step 11.

---

## F7 · Bring media into a Project

**Entry** Project overview → "Add Asset", or Project workspace → Original tab.

**Expected** Attach a video, character, outfit or voice and use it.
**Actual** Works, and the semantics are carefully explained: "Saved items you use in this Project.
None of them is its original video", and "Removing an item here never deletes it or this Project's
history. It stays reusable everywhere else." An attached video's primary action correctly changes
label depending on whether the Project already has a source ("Use as the current cut" vs "Use as the
original video").

**Friction** Every asset card prints a truncated database identifier above the human name —
`CHARACTER / 01147510…fb0e1e / New Character 01` (`ProjectAssetsSection.tsx:411-413`). The operator
has one character; the id distinguishes nothing and cannot be acted on.

**Severity** S3 · **Recommendation** Roadmap step 7.

---

## F8 · Apply an AI transformation _(traced, not submitted)_

**Entry** Project workspace → bottom bar → "Edit Video".

**Steps** Open the workspace → note the tabs Original / **Create** / Save / History → the Create tab
offers a setup checkpoint and current-cut controls but no way to start → return to the bottom bar →
click **"Edit Video · Open the video editor"** → an overlay titled **"Use existing video"** opens
with its own three-step wizard (Source / **Edit** / Review) → "Choose your edits" → Character Swap →
configure → "Start Project Character Swap".

**Expected** The step named Create is where you create.
**Actual** It is not. `ProjectWorkspaceSurface.tsx:318-343` renders exactly three things into the
Create panel: `ProjectCreativeCheckpointPanel`, `ProjectWorkingMediaSection` and
`ProjectProcessingStatusPanel`. The last only refreshes, cancels or reconciles an operation that is
already running — its own copy says _"This check never submits provider work."_

**Friction**

- **The create action is not in the create step.** Its entry point is labelled for a different
  capability ("Edit Video", "Open the video editor"), and the overlay it opens is titled "Use
  existing video" — a title that makes no sense to someone already inside a Project that has one.
- **Two competing three-step models.** The operator is at step 2 of Original/Create/Save and opens
  a panel that puts them at step 2 of Source/Edit/Review.
- **The engine is chosen by vendor.** "Decart API" and "Pruna API" are presented as a toggle. The
  operator has no basis on which to choose, and the two behave materially differently — Pruna
  _requires_ a reference image, prepares input as H.264 MP4, accepts no custom prompt, offers 1080p,
  and needs explicit release after a terminal failure. None of that is what the labels say.
- The overlay occupies nearly the whole viewport, hiding the Project stage and tabs it was launched
  from.

**Severity** **S2** · **Recommendation** Roadmap steps 6 and 8.

---

## F9 · Replace the voice _(traced, not submitted)_

**Entry** the same overlay → "Voice".

**Actual** Local voice treatments and the ElevenLabs voice-changer path both exist, with a 20-voice
library, previews, and a saved-voice relationship endpoint. Capability-gated on
`elevenLabs.available`.

**Friction** Shares F8's entry-point problem: reached only through "Edit Video".

**Severity** S3 · **Recommendation** Folded into roadmap step 6.

---

## F10 · Edit the video locally

**Entry** the same overlay → "Adjust video · Trim, crop, rotate, relight, or filter on this device."

**Expected** Real editing without a server round-trip.
**Actual** Delivered. Trim, crop, rotate, lighting and filters render to MP4 in a WebCodecs worker
(`videoEditRender.worker.ts`), with feature detection and an explicit refusal rather than a silent
failure when the browser cannot do it.

**Friction** Discoverability only — it sits behind the same overloaded button.

**Severity** S3 · **Recommendation** Folded into roadmap step 6.

---

## F11 · Choose a placement and save — **the flow that fails**

**Entry** Project workspace → Save tab.

**Steps** "Where is this going?" → choose from Keep as it is / Widescreen / Phone / Square / Tall →
read the crop description → "Next, choose whether this becomes a new video or the next Version of a
video you own" → "Save video · Phone, full screen".

**Expected** The saved video is in the shape that was chosen. The panel says so, in as many words:
_"This frame and the selected placement are what the saved video will use."_
(`ProjectOutputSaveSection.tsx:519`)

**Actual** **The saved video is in its original shape.** `saveProjectOutputRequestSchema`
(`packages/contracts/src/projects.ts:849`) carries `{ expectedVersion, expectedRevisionNumber,
media, target }` — a reference to media that already exists. It carries no re-framed bytes and no
export specification. The placement is written to the revision snapshot as an intent. Re-framing
happens **in the browser, at download time**, through `useSavedVideoPlacementDownload` and the same
WebCodecs renderer — and only if the operator uses the specific "Download for phone" button.

The Assets library states this correctly: _"Re-framing happens in this browser; the saved version is
not changed."_ (`VideoExportPanel.tsx:52`). Two surfaces make opposite claims about the same
mechanism.

**Friction**

- The stored artifact is not the specified artifact.
- On a browser without WebCodecs the placement can never be produced at all, and the server has no
  path to produce it.
- At 375 px the fixed action bar covers the panel's own copy. Confirmed by hit-testing: the
  paragraph occupies y 632–670; the bar is `position: fixed`, `z-index: 5`,
  `background rgba(9,13,18,0.96)` at y 656–728; `document.elementFromPoint` at 85 % down the
  paragraph returns the bar, not the text.

**Severity** **S1** — the flow completes, but it does not deliver what it states.
**Recommendation** Roadmap step 4.

---

## F12 · Find the video again and download it

**Entry** Assets → Videos.

**Expected** Find it, and get the file you made.
**Actual** Finding it works well: search by title, filter by character used and by video format,
sort, a live match count, and a poster grid with durations. Downloading gives the file.

**Friction** **The placement does not travel with the video.** `VideoExportPanel` initialises with
`useState<ProjectExportSpecification | null>(null)`; nothing reads the `exportSpecification` on the
producing Project. A video saved for "Phone, full screen" downloads in its source shape unless the
operator remembers the decision and makes it again.

**Severity** **S2** · **Recommendation** Roadmap step 5.

---

## F13 · Make another version

**Entry** `/projects` → row menu → "Duplicate Project".

**Expected** A copy positioned to vary one thing.
**Actual** Good. The duplicate opens on the step it is actually ready for
(`stepForSnapshot(current.revision.snapshot)`), and the announcement is honest: _"… created.
Nothing has been generated yet."_

**Friction** Duplication copies the whole setup, but there is no "same Project, different placement"
path — which is the most common marketing variation and the one the export model is closest to
supporting.

**Severity** S3 · **Recommendation** Deferred; noted in step 11's rationale.

---

## F14 · Manage Characters and Outfits

**Entry** Assets → Characters / Outfits.

**Expected** Browse, reuse, and find things.
**Actual** Browse and reuse work. Delete is confirmed and failure is explained.

**Friction** **No search, no filter, no sort, and no pagination.** `SavedCreativeLibrary.tsx` renders
`items.map(...)` over the whole list. Projects, Campaigns, Videos and Voices all received search;
the two libraries whose contents cost real provider money to generate did not.

**Severity** S3, rising with use · **Recommendation** Roadmap step 9.

---

## F15 · Navigate anywhere

**Entry** Any surface.

**Actual** Every destination works, and URLs are canonical, legacy-aware and carefully preserved.

**Friction** **The entire authenticated application contains one `<a href>`, and it is the skip
link.** Verified in the running page. Primary navigation, Project rows, Campaign rows, asset cards
and Dashboard recent-work rows are all `<button>` with a JavaScript `navigate()`. Anchors are used
only for `download`. So: no cmd- or middle-click to open in a new tab, no "copy link address", no
hover URL preview, and screen readers announce "button" for what is navigation.

**Severity** S3 · **Recommendation** Roadmap step 10.

---

## Summary

| Flow                                                                             | Severity   |
| -------------------------------------------------------------------------------- | ---------- |
| F11 Choose a placement and save                                                  | **S1**     |
| F3 Record (privacy claim) · F6 Campaign · F8 AI transformation · F12 Re-download | **S2**     |
| F2 · F4 · F7 · F9 · F10 · F13 · F14 · F15                                        | S3         |
| F1 · F5                                                                          | none found |

No flow is broken. One flow does not deliver what it promises.
