# Record or upload and edit a video

## Goal

Use an uploaded or newly recorded browser-local video as the immutable source, optionally apply
zero or one visual edit followed by optional Voice, compare the latest healthy result with the
source, then edit either base, save, start over, or discard.

## Journey

1. From `/`, the creator logs in or enters Studio. The entry route does not mount Studio, request
   media, or offer the creation actions. Direct `/studio/create` visits keep neutral Local Camera mode with
   camera, microphone, and AI off.
2. The idle Studio control bar exposes **Start camera** and **Upload Video** actions.
   Upload needs no camera permission, provider credentials, Decart SDK, or external traffic.
3. Studio accepts a file picker or drop, validates browser metadata and decode, and publishes a
   playable temporary source on the Studio stage and the upload panel's accessible inline
   player. Both expose play/pause, seek, volume, and fullscreen where supported. **Use existing
   video** presents a compact **Source → Edit → Review** progress indicator, a stable source
   preview, and the next action without requiring the creator to scan the whole form. The inline player
   is the sole second-video exception: it borrows source/result artifact URLs, owns no
   tracks/session, and detaches on replacement or close. The panel also shows local-only
   duration, resolution, and audio availability. Filename, size, orientation, and codec remain
   available under **Technical details**.
   On laptop and desktop, the overlay keeps its header, progress, source preview and controls, and
   contextual action bar fixed while only the right-side edit selection and configuration region
   scrolls. Tablet and phone retain one vertical reading order and one contained panel scroller.
   **Adjust video** stays with the source preview above Replace/Discard because it changes the
   immutable base rather than adding a visual or Voice treatment.
   Once a video is selected, backdrop clicks cannot dismiss the panel; the creator must use an
   explicit close action or complete the workflow.
4. Instead of selecting a file, the creator may choose control-bar **Start camera** or panel
   **Record a local video**. Camera and microphone start only after that action. The one
   stage owns live preview, Record, Stop, the independent 270/300-second warning/limit, and
   finalization. After a healthy finalization, Studio validates and adopts the normalized
   recording as the source, then opens the editor. The inline player is not mounted during live
   preview, recording, or finalization.
5. The creator may choose provider-free **Adjust video** for the artifact currently displayed.
   Studio closes the panel and replaces its ordinary tool/capture regions with the local editing
   workspace around the same stage and video node. Trim, crop, 90° rotation, flips,
   lighting, filters, Before, reset, and grouped undo/redo remain draft-only until a dedicated
   worker renders and validates an H.264/AAC MP4. The final dialog can cancel, **Replace Without
   Saving**, or **Replace and Save** the pinned pre-edit artifact to Videos before replacing
   it. A failed Save leaves the source unchanged. A successful edit becomes the immutable source
   with parent lineage and an updated audio sidecar.
6. The creator may use confirmed **Replace source video** or **Discard source video**, then choose
   zero or one visual transformation from status-bearing tool cards:
   **Character Swap** or **Virtual Try-On**, never both. Availability and input requirements are
   operation-specific; provider selection and model names are never shown. The currently viewed visual edit is selected; after any visual value is
   entered or selected, that card remains selected while Voice is viewed. Switching away from an
   empty visual edit is immediate. Switching away from a visual edit with settings requires a
   topmost confirmation that names the settings to be cleared and states that Voice is compatible
   with the replacement and will not be affected. Cancel preserves the original visual settings
   and configuration view; confirm clears them and selects the replacement. Only the active
   transformation owns the submitted recipe and validated reference. Capabilities determine
   whether prompt input is editable or server-owned. A server-default Character Swap requires one
   identity reference, hides prompt/enhancement controls, filters prompt-only saved characters,
   and keeps its submitted prompt empty. This guidance remains provider-neutral. Saved characters and outfits,
   output resolution, and saved/recent outfit selection use the same keyboard-operable custom
   chooser. It is an anchored listbox on larger viewports and a safe-area-aware bottom sheet on
   phones, with 44px-or-larger touch targets, typeahead, Escape/focus restoration, and no document
   scrolling. Saved Character/Outfit options may add a local thumbnail, display name, and a
   two-line prompt summary. Character Swap first selects a parent character, then uses the shared
   original/variant version grid. **Create new wardrobe variant** opens that parent's Wardrobe and
   a successful save returns to the same Character Swap step; **Create A Character** still opens
   Character Builder and returns with the new parent selected. Selecting any exact saved version
   with a reference attaches only that version's image. Editable-prompt bindings leave Prompt empty
   so the creator may write a different prompt and may use a prompt-only saved character.
   Server-default bindings expose neither behavior and keep prompt text empty. Character
   and VTO reference fields accept local JPEG/PNG/WebP or the explicitly revealed public-HTTPS URL
   importer. An attached reference renders a local preview with replace and remove actions.
   If the selected parent character has a default saved voice, its opaque voice ID and display name
   are also selected in the Voice plan. This performs no conversion and the creator can override it
   through the ordinary Voice workspace before Start edit.
   Explicitly closing the panel retains the tab-local selection and plan; an **Edit video** action
   in the recorded-take controls reopens the same workflow. Whenever a playback is retained and
   **Edit Video** is available, the main Studio tool row/column disables its live-only **Select
   Character** and **Select Outfit** launchers. The editor's own Character Swap,
   Virtual Try-On, Voice, saved-resource, and builder controls remain governed only by the editor
   workflow and stay available when their existing step-specific requirements are met.
7. VTO uses exactly one input mode. **Saved or recent outfit** selects a saved Outfit or tab-local
   recent import; **Reference image** prefers a local JPEG/PNG/WebP and reveals its HTTPS URL field
   only after **Use an image URL instead**; **Prompt** alone exposes Enhance Prompt. Switching
   modes clears incompatible fields. Saved prompt outfits restore Prompt mode and their exact
   enhancement setting; saved-image and migrated combined outfits restore Saved outfit mode with
   enhancement off. New, edit, and Save a copy outfit library actions route through Outfit Builder.
   A missing saved image exposes Retry and, only when a usable prompt remains, **Continue without
   reference**; image-only outfits expose Retry or removal. VTO retains calm contextual
   consent, one-garment, plain-background, and no-fit/sizing/purchase-accuracy disclosure.
8. **Voice** opens the same cohesive treatment workspace used by Latest Take; the existing-video
   editor does not introduce a second Voice entry or nested browser. It exposes browser-local
   effects first and lazily loads the Saved/Browse ElevenLabs library only when the creator chooses
   **Saved AI Voice**. Preview and row selection are distinct, with one active provider-sample
   player. Browse can add standard-rate plan-accessible voices; eligible community copies can be
   removed from Saved only when they are not the current selection. The
   creator must confirm **Use this voice for the edit** or **Use this treatment for the edit** before it is stored in the edit
   plan. That confirmation transfers no take and starts no processing; the outer **Start edit**
   action executes the captured plan. Library search and selection state survive returning to the
   treatment pane and viewing either visual editor. The confirmed selection remains until **Use
   original audio** or a broader explicit source/plan reset. Local effects identify their
   no-provider path. Voice is independent of the mutually exclusive visual choice: it appears
   selected while viewed, remains selected after configuration, and never clears or replaces
   Character Swap or Virtual Try-On. Review truthfully summarizes no provider work, one accepted
   visual-processing job, one local voice render, one ElevenLabs conversion, or visual processing
   followed by voice.
9. Studio executes one immutable captured plan: visual submit/poll/retrieve → validate → restore
   immutable source audio where required → H.264/AAC MP4 transcode/validate/stage → convert
   immutable source sidecar → compose/transcode/validate/commit voiced result. The staged visual
   remains private until Voice succeeds; a Voice failure or cancellation publishes that healthy
   visual for comparison and retry. A validated H.264
   MP4 result with no audio may commit directly only when the immutable source also has no audio;
   this avoids a redundant decoder pass without weakening the publication gate. Voice-only uses
   the selected video's frames. A combined plan is ready only after Voice commits. If Voice fails
   after visual success, its explicit retry uses the retained visual frames and does not resubmit
   visual processing. Every operation publishes truthful stage copy and never retries a billable
   submission. The browser records one operation UUID before `PUT`. A valid response marks it
   accepted; a lost, malformed, or aborted success response marks acceptance unknown and keeps the
   same UUID. Both states lock submission controls. **Resume accepted job** checks that UUID with
   `GET` and never repeats the potentially billable `PUT`. A new UUID is possible only after that
   lookup confirms not-found and the creator explicitly submits again.
10. **Original** and conditional **Result** update both players. **Edit original** snapshots the
    immutable source; **Edit result** snapshots the latest result and its inspected metadata as the
    next frame source. If an accepted approximate-resolution result is not exactly 16:9 or 9:16,
    the next explicit Start prepares and revalidates a temporary contain-fit canonical copy without
    changing the retained or saved result. Review keeps **Save Video**, the selected edit summary,
    and the destructive action visible. Save as New is default; confirmed Replace Existing appends an immutable gallery
    version and never overwrites prior bytes. Only the immutable runtime source plus latest healthy
    Result remain after successful replacement. A voice failure after visual success retains the
    visual Result.
11. Every source/result has a UUID, app-owned name, timestamp, kind, and parent lineage. Uploaded
    originals remain unchanged; recorded and all generated results pass the local H.264/AAC MP4
    gate before publication. Downloads are available only after Save, from Videos.
12. **Start over from original** revokes generated visual and voice URLs, retains and presents the uploaded
    original, clears the selected transformation and voice selection, and returns to **Choose your
    edits**. The creator can choose either operation and make another explicit submission.
13. Confirmed **Discard video and result** in the panel, or **Discard** in the recorded-take control bar,
    revokes the uploaded source and all generated results. The control bar returns from **Edit
    video** to **Upload Video**, and the next panel open starts at **Add a video** with
    no retained plan, chooser state, or prior source.

## Validation and failure behavior

- Accepted input is H.264 MP4/MOV or VP8 WebM, more than zero and at most 300 seconds, at any
  playable aspect ratio. Character Swap/local input is capped at 300,000,000 bytes; any VTO plan
  is capped at 200,000,000 bytes.
- The picker recommends 16:9 or 9:16 for the best experience and directs creators to **Adjust
  video** to crop after upload. Provider compatibility is derived in the app for uploaded and
  locally edited sources. Other ratios disable Character Swap/VTO before provider intent or HTTP
  while Save, local adjustment, and Voice stay available.
- A playable visual-only source remains useful. Voice explains when no usable source-audio
  sidecar exists.
- Standalone sidecar extraction losslessly copies playable audio packets and excludes MP4 AAC
  encoder-priming packets before timestamp zero. A saved original is re-inspected and receives a
  fresh sidecar when reopened, so this normalization also applies to videos saved before the fix.
- HEVC, ProRes, aliases, and undocumented codecs are blocked with export guidance. When the active
  Character Swap capability requires H.264 MP4, H.264 MOV or VP8 WebM is converted locally only
  at explicit Start. The converted Blob is revalidated, remains ephemeral, and never replaces the
  immutable source. MP4 passes through.
- When both server bindings are configured, Character Swap exposes a Decart API / Pruna API toggle
  before submission. The configured default is selected initially; changing it immediately applies
  that provider's reference, prompt, preparation, resolution, failure-retention, and output-sizing
  rules. Virtual Try-On remains Decart-only. The chosen provider is validated by the broker and
  there is no automatic provider fallback.
- Decart results must be 1280×720 or 720×1280. When Pruna Character Swap is active, the editor
  offers `720p` and `1080p` for each submission; the selected value is an
  approximate 1 MP/2 MP budget. A different inspected width/height emits a content-free
  informational server record and continues instead of failing the job. Every result still preserves orientation, stays under
  300,000,000 bytes, and remains within 500 ms of source duration; the browser compares downloaded
  metadata with the server-approved result rather than hard-coding 720p. Provider-output inspection
  keeps exact dimensions fatal for Decart and never reuses source-upload aspect-ratio guidance.
- Every Pruna prediction pins seed `0`, turbo off, the original frame rate, saved and conditioned
  source audio, and the enabled safety checker alongside the editor-selected resolution and exact
  model.
- Visual failure preserves the source and selected draft. Voice failure preserves the last
  visual/source layer.
- Local render/cancel/validation/replacement failure preserves the pinned pre-edit artifact, draft,
  sidecar, and every existing object URL. Output requires exact even dimensions, duration within
  500 ms, H.264 MP4, AAC when audio exists, local decode, and a matching extracted sidecar.
- Pruna non-2xx responses log the numeric upstream HTTP status server-side without forwarding its
  body, URL, or provider message. A successful HTTP 200 status poll can still report a terminal
  failed prediction; this is logged as a safe `generation-failed` category and shown as a distinct
  app-owned failure. The browser retains it until an explicit user discard/replacement or the
  broker deadline.
- Every generated result is revalidated after transcoding for a non-empty MP4, H.264 video, AAC
  when audio is required, duration, orientation, and playable tracks. An unconverted fallback is
  never published.
- Remote reference import accepts public HTTPS only, rejects credentials/private/link-local/mixed
  DNS and unsafe redirects, pins DNS per hop, caps redirects/bytes, validates actual decoded
  JPEG/PNG/WebP contents, supports abort, and never persists, logs, echoes, or forwards the URL.
- Retrying status, content retrieval, inspection, or audio composition reuses the accepted job.
  Retrying a provider submission is a new explicit potentially billable action.
- The broker caches provider status between server-owned 2/3/5/8/10-second polling intervals and
  returns a nullable next-poll hint. Repeated browser status reads inside that window do not contact
  the provider.
- A failed provider status may contain private diagnostics. The server reduces those diagnostics to
  an allowlisted failure class (content safeguards, account attention/limit, submitted media,
  cancellation, timeout, or upstream failure), discards the provider text, and exposes only
  provider-neutral guidance. Provider billing/credit failure is a distinct terminal class with
  account-recovery guidance; terminal status waits for its durable Project trace before the browser
  receives it, so reconciliation stops polling. No class triggers an automatic submission retry.
- Original/variant identity stays local metadata until explicit selection. Character Swap hydrates
  the exact selected asset; Virtual Try-On outfit/input selection remains unchanged.
- Selecting an exact saved character version initially leaves Character Swap Prompt empty so its
  image is authoritative. For Decart, text entered afterward is sent with its enhancement flag.
  Pruna advertises a server-default prompt: the editor provides no prompt or enhancement control,
  browser state is normalized to empty text, the broker rejects tampered non-empty text before
  provider contact, and the adapter always uses Lightframe's Pruna-specific instruction. Reference
  image 1 defines the exact facial identity, body, hair, clothing, footwear, and worn accessories;
  source-person clothing is replaced and must not transfer onto the saved character. The source
  supplies expressions/lip sync/gaze/pose/hand placement/gestures/movement/timing/blocking, and
  every non-worn, held, carried, touched, picked-up, put-down, or otherwise interacted-with item
  retains its appearance, visibility, position, motion, contact, occlusion, and timing. Source
  framing, lighting, background, scene structure, other objects, and audio remain unchanged.
- If an accepted job's status or content request is interrupted, prompt, reference, enhancement,
  and saved Character/Outfit fields remain editable. The UI states that **Resume accepted job**
  still checks the immutable accepted configuration and creates no submission; draft edits apply only after that job
  reaches a terminal failure and the creator explicitly starts a new submission.
- Same-origin browser status/content reads remain protected even when the browser omits `Origin`:
  the API verifies the exact loopback referrer or same-origin Fetch Metadata plus explicit video
  intent. Mixing `localhost` and `127.0.0.1` is rejected with actionable local-origin guidance.

## Temporary and cost boundaries

The workflow is tab/process-temporary. Refresh, crash, or API restart does not recover it. The
server stores generated paths and safe job state only while validating, submitting, polling, or
retrieving; it never persists prompts or original filenames. Cleanup is local and does not claim
provider cancellation or provider-side deletion.

The broker assigns one immutable deadline when it accepts the job, exactly
`acceptedAt + 60 minutes`, and the same deadline covers every active state and ready output without
sliding. Successful delivery, explicit release, or shutdown may remove local state earlier. If a
content stream starts before the deadline, it may finish after the deadline; no new content stream
may start at or after it. Expiry preserves a safe process-memory tombstone to prevent the same job
ID from creating another provider submission, while removing its local media. None of these local
events means provider cancellation or provider-side deletion. Pruna uploads expire after
approximately 30 minutes and generated delivery content is typically available for 24 hours;
Lightframe relies on no documented Pruna cancellation/deletion endpoint.
Pruna terminal failures retain their safe status until the creator explicitly discards/replaces the
video or the fixed local deadline expires. Successful content delivery cleans its local job without
a follow-up browser DELETE. Decart terminal-failure release behavior remains automatic.
Cleanup waits for any admitted delivery stream, retries transient filesystem failures, and retains
pending cleanup state. If retries are exhausted, the server emits one safe diagnostic containing
only the application job ID; it never logs temporary paths or provider data.

After Decart accepts a batch VTO submission, a persistent prompt or explicitly saved-image Outfit
records exact internal recent-use metadata for compatibility. Directly uploaded or imported
reference files enter only the bounded tab-local recent registry and are never automatically
persisted. Neither path exposes a Recipe card, Shelf, chooser, or route.

The UI reports one planned submission, not credits or currency. Every provider submission remains
an explicit, potentially billable action with no automatic retry or fallback.

An explicit **Use Saved Video** action inside an empty Project is a separate source command, not
this editing workflow. It selects the exact current Version, verifies same-owner active lineage,
and retains the existing bytes as the Project's immutable source without copying them, starting a
provider, or selecting an existing-video Version target. That accepted Project source is durable and
rehydrates through the Project content route; this standalone workflow remains temporary.

For a source-bearing Project, the existing-video controls remain the feature-local configuration
owner for one visual treatment followed by optional Voice. **Keep this setup** checkpoints the
plan without provider contact. Project **Start Character Swap** and **Start Virtual Try-On** first
save that exact setup, then use one app-owned operation command that commits the exact initiating
revision before provider submission. Refresh/reopen reads current authority and resumes bounded
status/retrieval for the same durable provider identity; a lost response replays only the same
operation key. It never falls through to the standalone `video-jobs` submit path. Local **Adjust
video** still produces a temporary **Render preview** whose explicit adoption remains separately
owned.

The Project action presents submitting, accepted/queued, processing, retrieving, retaining-result,
result-ready, needs-attention, and verified-cancelled states. Current Decart/Pruna visual adapters
do not expose verified cancellation, so closing or switching stops browser status checks but never
claims provider work or cost stopped. While an accepted Project operation remains active, **Clear
local editor** releases the panel's temporary source and setup after confirmation without claiming
to cancel the provider operation; durable Project status continues to track it. Failure retry is a
new explicit potentially billable attempt;
ambiguous submission requires an additional possible-duplicate-cost acknowledgement and never
auto-resubmits. A historical ambiguous attempt no longer creates an invisible archive dead end
after the Project has durably recorded a later attempt; its history remains visible, and any newest
active or ambiguous attempt still blocks archive. A current result is stored and inspected before a `job-result` revision makes it
Project working/presented media. It is **Result ready**, not Project `completed`, a Saved Video, or a
Video Version. A valid obsolete success is **Retained in this Project** as historical `job-output`
media and never replaces the current stage. Project ElevenLabs Start remains disabled because the
synchronous adapter has no durable reconnect identity. Local Voice keeps its existing temporary
artifact owner; neither Voice path fabricates durable Project-processing guarantees.

## Evidence boundary

Automated tests use deterministic local media and fake provider responses. They prove contract,
mutual exclusion, single submission, source/result stage comparison, gallery saving,
source-preserving Start over, responsive controls, failure preservation, immutable active/ready
expiry, pre-deadline delivery leases, denied post-deadline content, explicit release, shutdown,
owner isolation, and protection against late-result resurrection. Live model entitlement/output,
Pruna pricing approval and 720p/1080p dimensions, real mobile pickers, H.264 MOV/WebM preparation,
five-minute memory, and physical gallery downloads remain
gates in
[Manual QA](../../MANUAL_QA.md) and [Live provider smoke](../../LIVE_PROVIDER_SMOKE.md).
