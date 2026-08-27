# User-flow audit

Every meaningful journey, traced through the code and — where the local environment allowed —
driven in the running application. Severities: **Critical / High / Medium / Low**.

**No broken flow was found.** Every journey the product offers completes when its provider is
configured. The findings below are about clarity, effort and confidence, not correctness.

---

## F1 — Enter the product

**Entry:** `/` · **Goal:** get in · **Steps:** Log in → prefilled credentials → Dashboard.

Works. Credentials prefill from `/api/auth/demo-config`, which fail-closes on
`nodeEnv === 'production'`. `ProtectedRoute` preserves the requested destination and
`canonicalizeProtectedDestination` refuses off-origin returns.

**Friction:** the entry page promise — _"Create a video quickly, resume focused Project work, or
organize Projects in Campaigns"_ — describes an organization system before it describes making a
video. **Low.**

---

## F2 — Dashboard → first video

**Entry:** `/dashboard` · **Goal:** make something.

**Actual:** the operator meets, in order: a greeting, an onboarding card about _organization_, a
**Processing Queue** section (usually "No queued or active video jobs"), then Continue Work and
Recent Work.

**Friction (High):** the two most prominent blocks above the fold are an explanation of Projects
versus Campaigns and an empty engineering queue. The one action that matters — **Create video** — is
a header button. A creative tool's home screen leads with an empty job queue.

**Friction (High):** Recent Work is four text rows with generic icons. There is no image of any
video anywhere on the Dashboard.

**Friction (Medium):** two of four recent items are titled "Untitled Project" — the default title is
applied to _videos_, so the library fills with identically-named records.

**Recommended:** lead with recent work as visual cards; demote the processing queue to a status
indicator that expands only when non-empty; give saved videos a better default title.

---

## F3 — Record a new video (standalone)

**Entry:** `/studio/create` · **Goal:** capture and keep a clip.

**Actual:** stage with _"Your private creative stage"_, **Record New Video** / **Upload Video**, a
tool rail (Edit Video · Select Character · Select Outfit), and — on desktop — a permanently docked
**Capture settings** column.

**Friction (High):** the capture panel occupies roughly a third of the desktop width before the
operator has any media, and its copy is written for an engineer: _"Listing devices does not start
the camera or microphone"_, _"Studio rescans after a successful Start or a browser-reported device
change. Opening this panel never requests permission."_ These are truthful reassurances about
implementation details nobody asked about.

**Friction (Medium):** the tool rail advertises Edit Video, Select Character and Select Outfit
before any media exists. They cannot do anything yet.

**Friction (Medium):** capture offers only **Landscape 16:9** and **Portrait 9:16**. No 1:1, no 4:5
— two of the most common social placements.

**Confirmed good:** the 270 s warning / 300 s auto-stop, device persistence, and the honest
"camera permission blocked" state are all handled carefully.

---

## F4 — Upload an existing video

**Entry:** Assets ▸ Upload video, Quick Create ▸ New video, or Studio ▸ Upload Video.

Works, with validation in `videoValidation.ts` and bounded reads. Direct multipart upload to R2 is
capability-gated.

**Friction (Medium):** four separate entry points reach video creation with different intents and
no explanation of the difference (restates **R2** in the existing gaps audit). **Low–Medium.**

---

## F5 — Apply an AI transformation

**Entry:** Studio ▸ Select Character or Select Outfit → _Choose your edits_.

**Actual:** choose Character Swap or Virtual Try-On, pick or build a character/outfit, choose output
resolution, submit, watch a job, receive a result, compare against the original.

**Confirmed good:** this is the strongest flow in the product. Submission is bounded, acceptance is
reconciled rather than retried, cost warnings are explicit and accurate, and the compare view is
genuinely useful.

**Friction (Medium):** cost is described only as a risk — _"may incur provider cost"_, _"may
duplicate that cost"_ — never as a quantity. The operator has no idea what anything costs or how
much they have spent.

**Friction (Medium):** the resolution control's hint, _"Higher resolution may take longer and cost
more provider usage"_, is the only place output quality is chosen — and it is not connected to any
notion of the destination placement.

---

## F6 — Edit a video locally

**Entry:** Studio ▸ Edit Video.

Trim, Crop, Rotate, Lighting, Filters — rendered in a `WebCodecs` worker with undo/redo and cancel.

**Friction (High, capability):** no text, captions, overlays, music, audio mixing, speed, or
multiple clips. For social marketing content, captions and text overlays are close to mandatory.
Crop exists but there is no way to say "crop this to 9:16 for Reels" as an intent.

**Friction (Medium):** the editor degrades to a warning on browsers without `WebCodecs`/
`OffscreenCanvas`, with no server-side fallback. Documented in
[`BROWSER_SUPPORT.md`](../BROWSER_SUPPORT.md); correct, but it means the editor is unavailable
rather than slow on unsupported hardware.

---

## F7 — Replace the voice

**Entry:** Studio ▸ Voice, or Assets ▸ Voices ▸ Use in Studio.

Works. Local effects (warm-studio, clear-presenter, robot) plus ElevenLabs speech-to-speech with
saved-voice management. The "Use in Studio" hand-off holds a selection until a source exists.

**Friction (Low):** voices are the only Asset library with search, which makes its absence elsewhere
more conspicuous.

---

## F8 — Save the result

**Entry:** Studio ▸ Save.

**Actual:** `SaveVideoDialog` → Saved Video + Version → `SaveVideoSuccessPanel` with
Download · View in Assets · Create another · Stay in Studio.

**Confirmed good:** this was a real gap (**G2**) and the fix is complete and well made.

**Friction (Medium):** the equivalent step inside a **Project** does not have it. The Project Save
tab reads _"Retain the current result as a new Video or an explicit Version"_ and its progress
message is _"Saving one immutable Video Version and its Project provenance."_ There is no Download
on that tab (restates **M2**). The same act has a friendly path outside Projects and a technical one
inside them.

---

## F9 — Create a Project and get to work

**Entry:** Dashboard, Projects list, Quick Create, or a Campaign.

**Actual (observed):** `/projects/{id}` shows the title, then `DRAFT · Updated … · Revision 5 ·
No Campaign`, a 1-2-3-4 workflow strip, and — with no source — a **Project source** panel offering
**Record**, **Upload**, **Use Saved Video** as three visually identical full-width buttons.

**Friction (High):** `Revision 5` is in the page header. Revision numbers are an internal
concurrency and lineage device; surfacing them at the top of the page teaches the user to worry
about them.

**Friction (Medium):** three identical buttons with no recommended path. Below them,
_"Choosing, recording, or reopening a source never starts paid AI work"_ — reassuring, but it
answers a question a new user has not yet thought to ask.

**Friction (Medium):** the adjacent **Project Assets** section explains _"Attached Assets are
reusable records kept alongside this Project. They are not its source — that is the one original
video the Project is built from."_ Two similarly-named sections whose difference needs a paragraph.

**Friction (Medium, performance):** once a source exists, opening the Project downloads the whole
video into a Blob before the workspace is usable (`useProjectSourceController.ts:176`).

---

## F10 — Work inside a Project

**Entry:** `/projects/{id}/workspace`.

**Actual:** stage on the left, a four-tab inspector on the right — **Source · Create · Save ·
History** — deep-linkable via `?task=`, opening on the step the Project is up to, with an
"All changes saved" indicator.

**Confirmed good:** this is a thoughtful design. The progress strip and the tablist derive from one
list so they cannot drift, and the initial task is latched so a background phase change does not
move the panel under the user.

**Friction (High):** the vocabulary. "Project Source", "working media", "presented media",
"Revision N", "checkpoint", "Save creative setup" — all shown. The Create tab contains a
"creative checkpoint" panel, a "working media" section and a processing panel; understanding which
one to touch requires the domain model.

**Friction (Medium):** **History** is presented as step 4 of a 4-step workflow. History is not a
step; nothing is completed by visiting it.

---

## F11 — Organize with Campaigns

**Entry:** `/campaigns`.

Create with name + optional brief, open detail, add Projects, move/detach, archive/restore/delete
with the correct guards. Parity with Projects was fixed (**G6**).

**Friction (Medium):** a Campaign is a name and a brief. It has no dates, no channel, no goal, no
count of finished assets, no visual identity. It is a folder that the product describes as strategy.
Its value to the operator is currently near zero, and the Dashboard onboarding still spends its
whole message explaining it.

---

## F12 — Find something again

**Entry:** any library.

**Actual:** Videos offers character/format filters and a sort. Projects offers active/archived and a
campaign filter. Campaigns offers nothing. **None of them offers text search.**

**Friction (High):** `savedVideosQuerySchema` and the project/campaign list schemas in
`packages/contracts` carry `cursor`, `pageSize`, filters and sort — and no search term. Retrieval
past one page is scrolling. Lists report "1 loaded", not a total (**N11**).

---

## F13 — Get the finished file out

**Entry:** Videos overlay, Project History, or the save-success panel.

Downloads the exact Version via `?download=true`. Correct and exact.

**Friction (High):** one file, source aspect ratio, no choice. No 9:16 crop for Reels, no 1:1 for a
feed, no 4:5, no resolution choice, no filename convention, no bulk download, no ZIP. The domain has
`ProjectExportSpecification` ready for exactly this and nothing writes it.

---

## F14 — Make a second version for another placement

**Entry:** none.

**Friction (High, missing capability):** there is no duplicate, no "make a variant", no re-run with
a changed character/outfit/voice. Producing a second cut means starting a new Project, re-choosing
the source, re-selecting the creative resources, and re-paying for a new provider job. For a
marketing tool this is the central repeated task.

---

## F15 — Manage the account

**Entry:** account menu.

Contains **Log out** and nothing else. No profile, preferences, storage usage, provider status
detail, or the `entitlements` the API already returns (**G5**, **M9**). **Medium.**

---

## Severity roll-up

| Severity | Flows                              |
| -------- | ---------------------------------- |
| Critical | none                               |
| High     | F2, F3, F6, F9, F10, F12, F13, F14 |
| Medium   | F4, F5, F8, F11, F15               |
| Low      | F1, F7                             |
