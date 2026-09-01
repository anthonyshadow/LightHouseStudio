# Lightframe Studio — Target user flows and information architecture

**Document type:** canonical target experience. These are the flows the product is converging on —
not a description of every current screen. Where a flow differs materially from today's behavior,
the difference is called out as **(gap)**. Vocabulary: [domain model](DOMAIN_MODEL.md). Sequencing:
[roadmap](../roadmap/PRODUCT_ROADMAP.md).

## Information architecture

Primary destinations (desktop rail): **Dashboard · Studio · Projects · Campaigns · Assets**.

- **Dashboard** — orientation and resume: continue work, recent items, processing queue.
- **Studio** — the capture/quick-create stage (camera or upload) for standalone videos.
- **Projects** — the product's center: the list of production workspaces.
- **Campaigns** — the optional organizer over Projects.
- **Assets** — the Libraries (Videos, Characters, Outfits, Voices), opened as overlays.

Compact (phone) navigation carries four slots and spends the fourth on Assets rather than Campaigns
(decision D13): Campaigns are optional and finished work is not. Campaigns stays on the rail and one
press away from the Dashboard and the Projects list. Every destination is a real link, on both the
rail and the compact bar. The Project workspace is the flagship editing surface; the manual editor
is a first-class part of it, not an annex of an AI wizard **(gap)**.

## 1. First-time entry

**Sees:** a public entry page stating what the product is — a studio that turns footage into
finished, platform-ready marketing video; editing on-device; AI optional — and a Log in action. The
capabilities are listed in the order the work happens: bring footage in, edit it, deliver it, and
only then the optional AI. The document description says the same thing.
**Does:** logs in.
**System:** restores any requested deep link, else lands on Dashboard.
**Next:** Dashboard's first-run card points at the two honest starts: "Create a Project" or "Start
with a quick video."

## 2. Dashboard

**Sees:** welcome + first-run onboarding (dismissible); Continue Work (most recent active Project,
with poster); Recent Work (Videos / Projects / Campaigns, filterable, with posters); a processing
queue when AI work is running; links to All Projects / All Videos / All Campaigns.
**Does:** continues a Project (one click into its workspace), creates (Quick Create: New video /
New Project / New Campaign / Create Asset), or browses.
**System:** every list is paginated and partial-failure tolerant; queue entries name the Project
they belong to **(gap)** and link back to it.
**Next:** always one click from resuming the most recent outcome-producing work.

## 3. Quick start (standalone video)

**Sees:** the Studio stage — camera off, private-by-default copy, Start camera / Upload video.
**Does:** records a take (with a fast "record another take" loop **(gap)**) or uploads a file.
**System:** validates the file (with a local transcode offer for phone-shot HEVC footage
**(gap — today HEVC is rejected outright)**); presents the take/upload for review.
**Next:** from review, three honest paths, all visible: **Edit** (opens the manual editor on this
footage — **(gap: today a fresh take cannot reach the editor without saving first)**), **Save to
Videos**, or **Make it a Project** (creates a Project with this as its first source). Nothing about
this path requires AI.

## 4. Creating a standalone Project

**Sees:** Projects list → New Project → name (optional) + optional Campaign picker.
**Does:** creates; lands in the Project workspace.
**System:** Project exists immediately (idempotent create); empty state shows exactly one next
step: "Add your first video."
**Next:** upload / record / choose from Videos.

## 5. Creating a Campaign

**Sees:** Campaigns list → Create Campaign → name + optional brief.
**Does:** creates; lands on Campaign detail with "Create Project in Campaign" offered.
**System:** Campaign detail lists its Projects with posters and shows what the Campaign has
produced (its Projects' deliverables) **(gap — today cards are bare)**.
**Next:** create the first Project inside it.

## 6. Creating a Project inside a Campaign

Identical to flow 4 with the Campaign preselected. A Project can later move between Campaigns or
detach; Campaign archive never touches its Projects.

## 7. Media upload and import (into a Project)

**Sees:** the Project's Media area listing its source videos **(gap — today exactly one source)**
with posters, durations, and states (uploading / processing / ready / failed).
**Does:** adds media by upload, camera recording, or reuse of a Library video Version; previews any
source; removes a source (bytes retained by history).
**System:** uploads are idempotent and resumable across a reload **(gap)**; originals are
immutable; failures show a reason and a retry that never duplicates work.
**Next:** edit a clip, or go straight to the composition.

## 8. Asset organization

**Sees:** within a Project, what the Project uses ("Used in this Project": videos, characters,
outfits, voices); in Assets, the account Libraries with search, filters, and posters.
**Does:** attaches/detaches Library items to a Project (organizational, never destructive); from a
Video's card, sees which Projects use it; renames, previews, downloads.
**System:** attached items surface first in the workspace's pickers **(gap — today the workspace
pickers ignore memberships)**.
**Next:** attached material is one click from being used in the edit.

## 9. Manual editing (no AI required)

**Sees:** the editor as a first-class Project surface: preview stage (WYSIWYG), tool rail — Trim,
Split **(gap)**, Crop/Reframe (aspect presets), Rotate, Lighting, Filters, Audio **(gap: levels,
mute, replace)**, Subtitles **(gap)** — timeline with frame stepping, undo/redo, compare-to-original.
**Does:** edits non-destructively; renders a preview on-device; adopts it as the current cut.
**System:** edit specifications persist with the revision so edits can be reopened and loosened
**(gap — today re-editing starts from the baked render)**; the original is never modified.
**Next:** keep editing, add AI, or save.

## 10. Optional AI editing

**Sees:** AI tools presented beside — not above — manual tools: Character Swap, Virtual Try-On,
Voice **(gap — voice does not run in Projects today; the rail entry and the Add Voice picker both
say so, and attaching one is organizing for later)**, each with a plain cost note and provider
status.
**Does:** configures (choose character/outfit/voice from Libraries or build one), explicitly
starts; may leave and return while work runs.
**System:** durable job with visible queued/processing/ready/failed states; unknown acceptance is
reconciled, never resubmitted; results are retained server-side and appear in the Project as
adoptable assets — nothing dangles **(gap for standalone flow: results are session-only until
saved, though closing the tab on an unsaved one now warns first)**.
**Next:** adopt the result as the current cut, keep both, or discard — all reversible via History.

## 11. Composition and stitching **(gap — the target centerpiece)**

**Sees:** the Project's composition: ordered clips on a multi-clip timeline, each with its own
trim; subtitle track(s); audio settings.
**Does:** adds clips from the Project's sources and adopted results; splits, reorders, stitches;
positions subtitles over specific time ranges; sets per-clip audio gain.
**System:** the composition is autosaved state like everything else; preview plays the stitched
sequence accurately.
**Next:** refine, then save the composition as the deliverable.

## 12. Final refinement and identifying the deliverable

**Sees:** Save: a placement chooser ("Where is this going?" — as-is / widescreen / phone / square /
tall), destination (new Video or next Version of an owned one), and after saving, the Project
overview shows **the final deliverable** — poster, placement, Download, View in Assets
**(gap — today saving still marks the Project "completed")**.
**Does:** saves one or several placements in one pass **(gap — today one per save)**.
**System:** placements are rendered into real bytes and recorded on the Version; saving never ends
the Project — the user continues editing and later saves supersede.

## 13. Autosave and recovery

**System:** every meaningful change autosaves within a second, visibly ("Autosaved · 9:36 PM");
conflicts (another tab) surface a reapply/discard choice; interrupted uploads resume; interrupted
AI work reconciles on return; a crashed browser loses at most the unsaved in-memory take, and the
UI says exactly what is at risk before any destructive step.

## 14. Reopening work

**Does:** returns via Dashboard → Continue, Projects list, or a deep link.
**System:** the workspace restores the exact state — sources, composition, pending jobs, history —
and opens at the step that makes sense (source missing → media; result ready → review; else where
the user left off).

## 15. Export and download

**Does:** downloads the final deliverable, an exact historical Version, or a placement variant —
from the Project overview, from History, or from Videos in Assets.
**System:** the file matches what was chosen — the placement decision travels with the Version;
downloads are exact bytes, ranged, and resumable.

## 16. Archiving and restoration

**Does:** archives a finished Project (or Campaign) from its overflow menu; restores from the
Archived section.
**System:** archived work is read-only but fully viewable; deletion exists only behind archive,
confirms, and never destroys bytes that retained history references.

## 17. Error and processing recovery

Every persistent state carries a control: a failed upload → retry; a failed AI job → the reason and
a no-new-cost recovery or an explicit paid retry; an ambiguous submission → "we're confirming what
the provider accepted" with reconcile; a missing file → a repair state, not a broken tile; an
unknown URL → a "that page doesn't exist" surface, shown to a signed-in operator with a way back to
the Dashboard, while anyone not signed in still lands on the entry page rather than learning which
addresses exist. The user is never told less than what happened, and never stranded without a next
step.
