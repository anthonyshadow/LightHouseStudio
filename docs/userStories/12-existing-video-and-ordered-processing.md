# Record or upload and edit a video

## Goal

Use an uploaded or newly recorded browser-local video as the immutable source, optionally apply
either Character Swap or Virtual Try-On and/or a saved voice, compare the latest healthy result with the source,
then edit either base, download, start over, or discard.

## Journey

1. From `/`, the creator chooses **Record New Video** or **Upload Video**. Direct `/studio` visits
   keep neutral Local Camera mode with camera, microphone, and AI off.
2. The idle Studio control bar exposes the same **Record New Video** and **Upload Video** actions.
   Upload needs no camera permission, provider credentials, Decart SDK, or external traffic.
3. Studio accepts a file picker or drop, validates browser metadata and decode, and publishes a
   playable temporary source on the persistent stage and the upload panel's accessible inline
   player. Both expose play/pause, seek, volume, and fullscreen where supported. **Use existing
   video** presents a compact **Source → Edit → Review** progress indicator, a stable source
   preview, and the next action without requiring the creator to scan the whole form. The inline player
   is the sole second-video exception: it borrows source/result artifact URLs, owns no
   tracks/session, and detaches on replacement or close. The panel also shows local-only
   duration, resolution, and audio availability. Filename, size, orientation, and codec remain
   available under **Technical details**.
   Once a video is selected, backdrop clicks cannot dismiss the panel; the creator must use an
   explicit close action or complete the workflow.
4. Instead of selecting a file, the creator may choose control-bar **Record New Video** or panel
   **Record a local video**. Camera and microphone start only after that action. The one persistent
   stage owns live preview, Record, Stop, the independent 270/300-second warning/limit, and
   finalization. After a healthy finalization, Studio validates and adopts the normalized
   recording as the source, then opens the editor. The inline player is not mounted during live
   preview, recording, or finalization.
5. The creator may use confirmed **Replace source video** or **Discard source video**, then choose
   zero or one visual transformation from status-bearing tool cards:
   **Character Swap** or **Virtual Try On**, never both. Availability and input requirements are
   operation-specific; provider selection and model names are never shown. The currently viewed visual edit is selected; after any visual value is
   entered or selected, that card remains selected while Voice is viewed. Switching away from an
   empty visual edit is immediate. Switching away from a visual edit with settings requires a
   topmost confirmation that names the settings to be cleared and states that Voice is compatible
   with the replacement and will not be affected. Cancel preserves the original visual settings
   and configuration view; confirm clears them and selects the replacement. Only the active
   transformation owns the submitted prompt, capability-supported prompt-enhancement switch, and
   validated reference. Character Swap may require one identity reference and disable prompt
   enhancement; prompt-only saved recipes then remain selectable but cannot Start until a
   reference is attached. This guidance remains provider-neutral. Saved characters and
   outfits open in a keyboard-operable custom chooser with an optional local thumbnail, recipe
   name, and a two-line prompt summary. The saved-character chooser ends with
   **Create A Character**. That action opens Character Builder; a successful save returns to this
   panel with the new saved character selected in the same Character Swap step. Selecting any
   saved character with a reference attaches only that image and leaves Prompt empty so the
   creator may write a different prompt. A prompt-only saved character fills Prompt. Character
   and VTO reference fields accept local JPEG/PNG/WebP or the explicitly revealed public-HTTPS URL
   importer. An attached reference renders a local preview with replace and remove actions.
   Explicitly closing the panel retains the tab-local selection and plan; an **Edit video** action
   in the recorded-take controls reopens the same workflow. Whenever a playback is retained and
   **Edit Video** is available, the main Studio tool row/column disables its live-only **Select
   Character**, **Select Outfit**, **Workshop**, and **Shelf** launchers. The editor's own Character
   Swap, Virtual Try On, Voice, recipe, and builder controls remain governed only by the editor
   workflow and stay available when their existing step-specific requirements are met.
6. VTO uses exactly one input mode. **Saved or recent outfit** selects a saved recipe or tab-local
   recent import; **Reference image** prefers a local JPEG/PNG/WebP and reveals its HTTPS URL field
   only after **Use an image URL instead**; **Prompt** alone exposes Enhance Prompt. Switching
   modes clears incompatible fields. Saved prompt outfits restore Prompt mode and their exact
   enhancement setting; saved-image and migrated combined outfits restore Saved outfit mode with
   enhancement off. New, edit, and Save a copy outfit library actions route through Outfit Builder.
   A missing saved image exposes Retry and, only when a usable prompt remains, **Continue without
   reference**; image-only outfits expose Retry or removal. VTO retains calm controlled-pilot,
   consent, one-garment, plain-background, and no-fit/sizing/purchase-accuracy disclosure.
7. **Voice** opens the same cohesive treatment workspace used by Latest Take; the existing-video
   editor does not introduce a second Voice entry or nested browser. It exposes browser-local
   effects first and lazily loads saved ElevenLabs voices only when the creator chooses **Saved AI
   Voice**. Preview and row selection are distinct, with one active provider-sample player. The
   creator must confirm **Use this voice for the edit** or **Use this treatment for the edit** before it is stored in the edit
   plan. That confirmation transfers no take and starts no processing; the outer **Start edit**
   action executes the captured plan. Library search and selection state survive returning to the
   treatment pane and viewing either visual editor. The confirmed selection remains until **Use
   original audio** or a broader explicit source/plan reset. Local effects identify their
   no-provider path. Voice is independent of the mutually exclusive visual choice: it appears
   selected while viewed, remains selected after configuration, and never clears or replaces
   Character Swap or Virtual Try On. Review truthfully summarizes no provider work, one accepted
   visual-processing job, one local voice render, one ElevenLabs conversion, or visual processing
   followed by voice.
8. Studio executes one immutable captured plan: visual submit/poll/retrieve → validate → restore
   immutable source audio where required → H.264/AAC MP4 transcode/validate/commit → convert
   immutable source sidecar → compose/transcode/validate/commit voiced result. A validated H.264
   MP4 result with no audio may commit directly only when the immutable source also has no audio;
   this avoids a redundant decoder pass without weakening the publication gate. Voice-only uses
   the selected video's frames. A combined plan is ready only after Voice commits. If Voice fails
   after visual success, its explicit retry uses the retained visual frames and does not resubmit
   visual processing. Every operation publishes truthful stage copy and never retries a billable submission.
9. **Original** and conditional **Result** update both players. **Edit original** snapshots the
   immutable source; **Edit result** snapshots the latest result as the next frame source. Review
   keeps **Download result**, the selected edit summary, and the destructive action visible. Only the
   immutable source plus latest healthy Result remain after successful replacement. A voice failure
   after visual success retains the visual Result.
10. Every source/result has a UUID, app-owned name, timestamp, kind, and parent lineage. Generated
    downloads use operation, UTC timestamp, and UUID suffix. Uploaded originals remain unchanged;
    recorded and all generated results pass the local H.264/AAC MP4 gate before publication.
11. **Start over from original** revokes generated visual and voice URLs, retains and presents the uploaded
    original, clears the selected transformation and voice selection, and returns to **Choose your
    edits**. The creator can choose either operation and make another explicit submission.
12. Confirmed **Discard video and result** in the panel, or **Discard** in the recorded-take control bar,
    revokes the uploaded source and all generated results. The control bar returns from **Edit
    video** to **Upload Video**, and the next panel open starts at **Add a video** with
    no retained plan, chooser state, or prior source.

## Validation and failure behavior

- Accepted input is H.264 MP4/MOV or VP8 WebM, more than zero and at most 300 seconds, within 1% of
  16:9 or 9:16. Character Swap/local input is capped at 300,000,000 bytes; any VTO plan is capped at
  200,000,000 bytes.
- A playable visual-only source remains useful. Voice explains when no usable source-audio
  sidecar exists.
- HEVC, ProRes, aliases, and undocumented codecs are blocked with export guidance. When the active
  Character Swap capability requires H.264 MP4, H.264 MOV or VP8 WebM is converted locally only
  at explicit Start. The converted Blob is revalidated, remains ephemeral, and never replaces the
  immutable source. MP4 passes through.
- Decart results must be 1280×720 or 720×1280. Pruna's configured `720p`/`1080p` value is an
  approximate 1 MP/2 MP budget. A different inspected width/height emits a content-free server
  warning and continues instead of failing the job. Every result still preserves orientation, stays under
  300,000,000 bytes, and remains within 500 ms of source duration; the browser compares downloaded
  metadata with the server-approved result rather than hard-coding 720p. Provider-output inspection
  keeps exact dimensions fatal for Decart and never reuses source-upload aspect-ratio guidance.
- Visual failure preserves the source and selected draft. Voice failure preserves the last
  visual/source layer.
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
- A failed provider status may contain private diagnostics. The server reduces those diagnostics to
  an allowlisted failure class (content safeguards, account attention/limit, submitted media,
  cancellation, timeout, or upstream failure), discards the provider text, and exposes only
  provider-neutral guidance. No class triggers an automatic submission retry.
- If an accepted job's status or content request is interrupted, prompt, reference, enhancement,
  and saved-recipe fields remain editable. The UI states that **Resume accepted job** still checks
  the immutable accepted recipe and creates no submission; draft edits apply only after that job
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

After Decart accepts a batch VTO submission, a persistent prompt or explicitly saved-image outfit
records an exact Recipe Shelf recent. Directly uploaded or imported reference files enter only the
bounded tab-local recent registry and are never automatically persisted.

The UI reports one planned submission, not credits or currency. The controlled pilot has no fixed
participant-total or per-operation batch submission-count cap. Every provider submission remains
an explicit, potentially billable action with no automatic retry or fallback.

## Evidence boundary

Automated tests use deterministic local media and fake provider responses. They prove contract,
mutual exclusion, single submission, source/result stage comparison, result-download initiation,
source-preserving Start over, responsive controls, failure preservation, immutable active/ready
expiry, pre-deadline delivery leases, denied post-deadline content, explicit release, shutdown,
owner isolation, and protection against late-result resurrection. Live model entitlement/output,
Pruna pricing approval and 720p/1080p dimensions, real mobile pickers, H.264 MOV/WebM preparation,
five-minute memory, and physical downloads remain
gates in
[Manual QA](../MANUAL_QA.md) and [Live provider smoke](../LIVE_PROVIDER_SMOKE.md).
