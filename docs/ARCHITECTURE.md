# Architecture and ownership

Lightframe Studio is a TypeScript workspace with a React browser app, a loopback Bun/Elysia broker,
pure domain rules, and runtime API contracts. Its design is local-first and single-operator.

## Product model boundary

The implemented runtime is a video-focused creative Studio. Current user-facing durable concepts
are Campaigns, source-bearing Projects, Saved Videos and their immutable versions, reusable
Characters and Character variants, Outfits, Voices, reference media, and non-owning Project asset
memberships. The generic word **asset** is appropriate for the supported Videos, Characters,
Outfits, and Voices collection and when describing byte storage or media ownership, but it must not
obscure an actual video-, image-, audio-, or feature-specific contract and lifecycle. Recipe data is
retained only as an internal compatibility/provider concept and is not a user-facing asset type.

The intended product hierarchy is **Workspace → Campaign → Project → Assets**, with current-state
qualifications:

- Campaign is a deliberately lightweight optional organizer with name, optional brief, lifecycle,
  version CAS, and non-cascading Project membership.
- Project has domain rules, contracts, local and relational authority, authenticated lifecycle and
  source/working-media APIs, and browser lifecycle/source UI. A source is immutable while attached
  and explicitly removable, which never deletes a revision, output Version, or retained bytes. Snapshot v2 is
  video-oriented by design; durable source and current working-media resume plus explicit creative
  checkpoints are implemented. Project-bound Character Swap/VTO now use the backend admission,
  recovery, and durable result-retention authority through visible Start/status/retry UX. Project
  provider Voice remains gated. Explicit Saved Video output save and immutable Version append are
  implemented. Bounded Project changes, processing attempts/results, and output-Version history
  plus exact-Version preview/reuse/Download are implemented without a restore or Export aggregate.
  A separately persisted non-owning collection can associate Videos, Characters, Outfits, and
  Voices without changing the Project source, active snapshot, output, history, or retention
  authorities. A Project can be duplicated: `duplicateProject` derives a new Project from an
  existing revision **by reference**, copying no bytes, clearing the last successful output, and
  deriving a truthful workflow phase, while the duplicate's own asset links keep the shared source
  retained. Each output records the `exportSpecification` it was saved for, so a Version states the
  placement it was produced for rather than leaving it to be inferred.
- Dashboard, Create, and Assets are browser information-architecture surfaces over existing owners;
  they are not new domain aggregates or persistence authorities.

One Campaign may group multiple Projects, while a Project represents a focused resumable production
effort and may remain independent. Campaign never owns Project/media processing state. Multi-format support
requires explicit format-specific contracts, snapshot migration, validation, storage, preview,
retention, and cleanup decisions. See [Product Vision](PRODUCT_VISION.md) and
[Product Roadmap](PRODUCT_ROADMAP.md); neither document changes current runtime authority.

## Dependency boundaries

| Boundary                      | Owns                                                                        | Must not own                                 |
| ----------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/domain`             | Pure Campaign, Project, session, prompt, asset, recording, and voice policy | React, browser APIs, HTTP, provider payloads |
| `packages/contracts`          | Zod HTTP schemas and app-owned request/response types                       | Secrets or raw provider types                |
| `apps/web/src/features`       | Capability-focused presentation and local view models                       | Permanent credentials or server persistence  |
| `apps/web/src/orchestration`  | Async lifecycles, policy sequencing, and resource handoff                   | Raw provider assumptions                     |
| `apps/web/src/adapters`       | Browser APIs, same-origin API calls, Decart SDK, audio processing           | Product policy                               |
| `apps/api/src/features`       | Route validation and application services                                   | Browser state or account data                |
| `apps/api/src/providers`      | Decart, OpenAI, BFL, Wiro, and ElevenLabs protocols                         | UI state or unsafe upstream errors           |
| `apps/api/src/http`           | Loopback/origin checks, safe errors, and streaming lifetime                 | Provider-specific policy                     |
| `apps/api/src/infrastructure` | Drizzle/PostgreSQL repositories and persistence composition                 | UI/product policy or browser state           |
| `apps/api/src/storage`        | Local/R2 byte adapters and media-asset lifecycle                            | Feature-specific ownership decisions         |

Imports point inward toward domain rules and contracts. The web app does not import API
implementation code, and the API does not know about React.

## Authentication and ownership

Phase 1 has one configured, server-seeded local user. The API verifies the Argon2id password hash
and issues a session-specific HS256 JWT in a host-only, HTTP-only, `SameSite=Strict` cookie. The
cookie has a 24-hour `Max-Age`, so a healthy session can be restored after browser closure. JWT
issuer, audience, subject, expiry, ID, and user status are checked on each private request. In
`local` mode, revocation state is process-memory and a broker restart invalidates sessions. In
`neon` mode, session and revocation records are durable; `shadow` keeps local auth behavior.

The API uses a deny-by-default `/api/*` authentication hook with a small exact public allowlist.
State-changing cookie-authenticated routes also require the exact trusted Origin. `ownerUserId`
comes only from the verified JWT subject; browser bodies, queries, multipart fields, Host hashes,
provider IDs, storage paths, and device IDs cannot choose ownership. The legacy Host-hash namespace
is accepted only by the idempotent reference-asset claim migration into the stable seeded user.

The browser keeps the authenticated session snapshot in React memory and restores it through
`GET /api/auth/me`; it never reads or stores the cookie/JWT. A centralized cleanup coordinator
blocks logout during non-discardable work, confirms discardable work, cancels temporary work,
releases media, calls the idempotent logout endpoint, clears user caches, and returns to `/`.
Development may fetch the configured demo login and password prefill from the loopback-only
demo-config endpoint. Production never returns that prefill and rejects the checked development
JWT secret and password hash.

## Studio composition

`AppRouter.tsx` is the browser URL boundary. React Router's data browser router renders the
provider-free entry at `/` and protects the recognized lazy route family. `/dashboard` is
Dashboard; `/studio/create` is standard video creation; `/studio/create/live` is Live AI Beta;
`/studio/:videoId` directly loads the current version of an owner-checked Saved Video into review;
`/assets` and its `/videos`, `/characters`, `/outfits`, and `/voices` children are reusable-resource
surfaces; and Projects/Campaigns use `/projects`, `/projects/:projectId`,
`/projects/:projectId/workspace`, `/campaigns`, and `/campaigns/:campaignId`. The reserved create
routes are matched before the UUID-only Saved Video route. Legacy organization, library, Recipe,
and `/studio/live` URLs replace-navigate to their canonical replacements.
The data-router form is required for route blocking. Route metadata, protected
Login return, focus handoff, and loading/error surfaces remain router-owned; unknown paths return
to `/`. Every authenticated route renders the same `AuthenticatedShell` instance, so moving between a
workspace and its libraries preserves the remote-state cache, the session lifecycle and the creative
library. The Studio's capture runtime is a child of that shell and belongs only to the routes that
own live media.

The entry does not mount `StudioApp`, request capabilities, acquire media, load Decart, open a
WebSocket, or contact a provider. `AuthenticatedShell.tsx` is the persistent authenticated
composition boundary and `StudioApp.tsx` the live-media runtime inside it. There is no second
product shell, media session, global client store, or provider client.

`StudioHeader` belongs to the shell, not the runtime, and owns three mutually exclusive panels: the
status menu (configured capability presentation), the account menu and its `AccountPanel`
(`features/account`), and the static **How Lightframe works** explainer
(`studio/HowLightframeWorksPanel.tsx`). `AccountPanel` reads the session already held by the shell
plus one bounded `GET /api/video-jobs` for what is currently running; it stores nothing, and the
explainer is static content in a shared `OverlayPanel` with no persistence of its own beyond the
existing dashboard dismissal flag.

Studio initializes the session draft in Local Camera mode and the media lifecycle at `idle`.
Dashboard and organization routes mount no stage and no capture graph, and retain the same shell. Entry
intent on `/studio/create` may open the upload panel or start the explicit local-recording flow,
but it never starts AI or provider work. The control-bar **Start camera** action starts a normal
local take and enters Latest Take review after finalization. The upload panel's **Record a local
video** action separately marks the finalized artifact for adoption by the existing-video editor.
Character and Virtual Try-On starts retain the advanced live-session and Latest Take paths;
post-recording workflow state is not mixed into provider session orchestration.

The mounted Studio owns focused controllers for:

- local/realtime media and per-mode drafts;
- recording, review, and voice processing;
- existing-video selection, local inspection, and one mutually exclusive batch transformation;
- Character Builder, Outfit Builder, and compatibility prompt-library handoff;
- Campaign/Project lifecycle queries and mutations, plus Saved Videos, Saved Characters, and Saved
  Outfits library presentation and handoff;
- account navigation and ordered logout cleanup;
- overlays and route-owned workspace presentation.

`StudioApp.tsx` assembles those owners but does not implement their lifecycles inline. Project
route/media bridging, creative-repository scoping, stage presentation derivation, saved-video
load/save/edit publication, character and outfit workflows, and ordered logout cleanup live in
focused Studio controllers. The persistent workspace, tool overlays, library overlays, and
lifecycle dialogs are presentation surfaces over those controllers. This keeps cross-feature
wiring visible at the sole composition boundary without giving that boundary a second copy of
feature state, provider work, persistence, or media ownership.

Activity locks and experience labels are pure Studio policy. The persistent workspace consumes
grouped route, controller, stage, activity, and action models rather than a flat cross-feature prop
surface. Existing Video, Outfit, and Character overlays are separate presentation families; they
share the same controller instances and never create another stage, session, repository, or media
owner.

The authenticated Studio composition boundary owns one TanStack Query client for lightweight
same-origin server state; the provider-free entry does not load that runtime. The client is
recreated when the authenticated user changes and its previous cache is cleared. Queries and
mutations do not retry by default and do not refetch on window focus or reconnect. The local,
non-billable capability read is the only bounded automatic retry. Project summary/current reads,
saved-video metadata/cursor pages, voice-library metadata pages, and accepted video-job status reads
use Query cancellation and targeted cache updates or invalidation. Project lists use separate
bounded active/archived cursor pages. Quick project retains one operation key through an uncertain
response; rename/archive/restore reconcile server CAS before invalidating the current Project and
list caches. Voice pages remain fresh for five minutes. Video-job status
polling follows the server-provided cadence and never retries a failed read automatically. Video
bytes and Blobs, editor and camera state, current timeline edits, temporary UI state, local
creative-asset repositories, provider submission, result retrieval, and finalization remain under
their existing owners and never enter this cache.

Dashboard composes three bounded, independently cached reads—active Projects, active Campaigns, and
recent Saved Videos—in parallel, then limits each presentation list. It deliberately has no new
aggregate/count endpoint: the existing calls do not create an N+1 path, already preserve feature
ownership, and are appropriate for the loopback runtime. Add an aggregate only if measured latency
or future cross-resource counts justify a versioned contract and cache lifecycle of its own.

The dismissible Dashboard orientation card stores only a versioned environment-and-user-scoped
browser preference. It is account-based within this local installation, clears on logout/site-data
cleanup as other browser preferences do, never authorizes ownership, and is not claimed to sync
across devices.

Saved-video character attribution is pinned when a live recording or completed Character Swap
artifact is created. Each immutable video version stores the parent character name as its gallery
filter key and an optional exact variant name as display-only metadata. Voice and later local edits
inherit that pinned attribution; the gallery never treats variants as separate character facets.

`MediaStage` is mounted once per Studio visit and owns one `<video>` element. Dashboard, Assets,
Campaign, Project list, and Project overview routes mount none: the runtime that owns it is not
there. A hidden stage would still hold a camera and the whole capture graph on a route with no use
for either. A Project's explicit `/workspace` route renders its
workspace beside this existing stage and hydrates its accepted
source through the recording-artifact owner; it never creates another player, media session, object
URL owner, or Project authority. A discriminated presentation state
switches among idle, live, finalizing, and playback. Live media uses `srcObject`; playback uses
`src`. Opening or closing a tool must not replace the player, restart media, alter playback time,
or create a second take player. One scoped exception is the **Use existing video** panel's inline
source/result `<video>`. A second scoped exception is the Saved Videos thumbnail Preview:
it mounts one authenticated content player only while its centered dialog is open, owns no tracks,
object URL, media/provider session, recording, or finalization, and detaches `src` on close or
unmount. The existing-video player borrows a controller-owned artifact URL and likewise detaches
listeners and `src` on replacement or unmount.
The recording-artifact owner may repair one stale playback URL from its retained Blob after a media
error. `MediaStage` reports the error but never creates or owns the replacement URL.
Original/Result comparison drives both this inline player and the stage.

Local video editing extends the same stage through an optional presentation contract; it does not
introduce another media node or URL owner. The contract supplies the normalized draft, playback
bounds, playhead updates, and crop callbacks. A lazily mounted WebGL canvas renders the composed
preview above the authoritative video. **Before** temporarily removes that canvas without seeking
or mutating history. Crop mode instead draws the full rotated source and a keyboard/pointer crop
overlay. The shared color shader is framework-independent and is reused by the export worker.

The standard Studio workspace uses that same stage for both landscape and portrait
capture. At large desktop widths it is centered between the existing creative-tool rail and the
session/device region; tablet and mobile stack those same regions below it. The session control
bar is an in-flow sibling immediately below the bounded video frame, so Record, Stop, and take
actions never cover the video or compete with native playback chrome. This is a presentation-only
reflow: it does not duplicate controls, media nodes, controller state, or capture ownership.
New phone and tablet sessions start with the local 9:16 format; desktop sessions start with 16:9.
That viewport-sensitive choice is only the initial session value. The explicit format controls in
Capture Settings can switch either way and are never overwritten by a later viewport resize.
At the desktop breakpoint, the right-side session/device region renders the single Capture
Settings form inline. Below that breakpoint the inline form unmounts and the same controller is
presented through the shared overlay; the compact capture strip is the launcher. A breakpoint
change never leaves two mounted settings forms. Capture choices auto-apply, device discovery runs
on mount and `devicechange`, and failed live replacement restores the last applied draft while
preserving the visible safe error. There are no manual Apply, Refresh, or Discard actions.

`video-edit` is a Studio-owned workspace mode rather than an overlay. It replaces the capture/tool
regions while active: desktop uses categories / stage / named-scroll settings columns;
tablet and mobile use stage / horizontal category strip / bounded settings rows. The settings
footer remains sticky and safe-area-aware. `useVideoEditSession` is the sole owner of the pinned
source, baseline, draft, 50-entry grouped history, generation, candidate, and worker cancellation.

At the existing `64rem` desktop breakpoint, the focused Studio header has no AI selection control.
The creative-tool rail owns **Edit Video**, **Select Character**, and **Select Outfit**. The
persistent header owner renders one navigation chrome for every protected surface:
a left rail at `48rem` and above, and a compact top bar plus five-item bottom navigation below it.
The rail contains the brand, **Quick Create**, primary navigation, and mutually exclusive
integration/account popovers. Dashboard, Assets, Projects, Campaigns and focused Create all mount
that same shell, so the studio surfaces keep the rail and the bottom navigation rather than a
standalone header. Character and Outfit choices use
the same AI chooser and creation overlays while the compact tool rail retains Edit Video. The
reference-hydration failure notice is `ReferenceUseFailureNotice`, a sibling of the rail rather than
part of it — the failure belongs to hydration, not to any tool — so a failed restore is visible
wherever the selection began. All responsive
presentations share one overlay controller, creative-selection handoff, activity locks, and
return-focus behavior. They never mount duplicate stateful selectors or start media/provider work.

All tools use the shared `OverlayPanel` portal. It owns focus trap, inert background, Escape,
topmost dismissal, scroll lock, transition-safe backdrop behavior, and return focus. A popover
opened _inside_ a panel — an `ActionMenu` — takes Escape first: `useDismissiblePopover` listens in
the capture phase and marks the event handled, so the innermost layer closes and the panel still
owns Escape once nothing is open inside it. The portal
follows the active browser fullscreen element. In stage fullscreen, the existing media stage fills
the viewport and the creative-tool and session/device regions are hidden; the stage control bar
remains beneath the video frame. A panel triggered from the stage still renders above the
full-screen video. Each overlay has one named internal scroll region; the document does not scroll.
Character Builder is fullscreen and uses one preview/generation DOM.
Narrow screens reveal that same region through **Review & Generate** instead of duplicating
stateful controls.

`StudioExitGuard` blocks navigation leaving the protected application route family while recording, finalization, local video
render/validation, or Project working-media adoption is active. A temporary take, active Voice process, dirty video-edit draft, or
dirty AI-settings or Outfit Builder form requires confirmed discard before the route proceeds. Rendering
must be cancelled before discard; navigation cannot abandon the worker. A session that ends
underneath the operator is the third exit path alongside in-app navigation and hard unload: the shell
holds teardown, `useStudioSessionExpiryController` names what is about to be lost, and the guard
stands aside for the redirect that follows so the operator never faces two prompts for one exit. A URL-owned Project
session removes the prior blanket exemption for `/studio/*` navigation: changing Project identity
or entering Studio/global-library context first flushes its semantic proposal, stays on failure or
conflict, or requires explicit discard. Hard unload receives the matching browser warning for
temporary work and dirty/saving Project proposals. The browser cannot await an ordinary fetch
during forced unload, so only already accepted server revisions are crash-safe.

The shell is viewport-bound with safe-area padding and deliberate support for `1440×960`,
`1280×720`, `834×1112`, `390×844`, and `320×568`. The stage, responsive tool/session regions, and
primary actions must remain reachable at short heights, touch sizes, and 200% text. Stage notices
overlay the video frame rather than changing its geometry.

## Session lifecycle

`useStudioSession` coordinates the session; pure domain rules decide valid modes and transitions.
The three modes are Local, `lucy-latest`, and pinned `lucy-vton-latest`.

Realtime modes are additionally controlled by the strict server-only
`REALTIME_VIDEO_BETA_ENABLED` flag, which defaults to `false`. Capability metadata reports provider
configuration (`available`) separately from product admission (`betaEnabled`). The browser may show
Live AI Beta entry only when both are true, and the realtime-token route repeats the gate before it
parses submission data or contacts the provider. A direct `/studio/create/live` visit while gated
renders a safe unavailable surface and cannot mint a token.

1. The user edits a mode-specific in-memory draft. Text and enhancement survive mode switches;
   every departing reference relationship is cleared, and owned object URLs are revoked.
2. Model input is validated before camera, token, SDK, or provider work. Local needs no provider
   input.
3. Explicit Start acquires or reuses local media. Replacement media commits only after the new
   stream is healthy; the old owned stream remains valid on failure.
4. For AI modes, the browser requests a short-lived model/origin-scoped credential from the
   loopback broker, then lazily loads Decart.
5. The Decart adapter connects a clone of the local input. Local preview remains independently
   owned until transformed video is usable.
6. Start and Apply send one complete prompt/reference/enhancement snapshot. `image: null` clears
   provider image state. The last successful snapshot is the applied state; later edits remain
   pending until Apply. Revert restores it.
7. Stop and Reset invalidate the operation generation, abort where supported, disconnect provider
   resources, dispose late results, and remove listeners. Reset replaces the whole mode draft and
   clears prompt, enhancement, reference, and applied state.

The active-session clock begins only after a healthy AI connection commits. Provider ticks may
move its display forward but cannot reset it. At the app boundary, an active recording finalizes
before AI/local resources release; otherwise Studio returns to local preview with the working
draft preserved.

Capture preferences are tab-memory state, not recipe data. Device enumeration does not request
permission and device IDs are not persisted. Local format is an app-owned 16:9 or 9:16 choice:
orchestration swaps the selected quality profile's width/height, the browser adapter constrains
the camera aspect, and the stage follows the applied format. Recording continues to
borrow that same negotiated source track. Apply during local preview performs atomic stream
replacement. Source changes are blocked while AI or recording owns the source. Facing-mode and
track zoom controls appear only when the active camera exposes those capabilities.

## Character and creative-library ownership

Character Builder exclusively owns character create/edit, its resumable IndexedDB draft,
reference upload, prompt optimization, image generation/edit/composition, durable save journal,
and creative-library persistence. Its completion handoff is destination-specific: general Studio
entry selects the saved Character for the current session, while uploaded-video entry hydrates and
selects it in the originating unsubmitted Character Swap step. For an editable-prompt binding, a
saved character with a reference hydrates only that image and a prompt-only character copies its
prompt. For a server-default binding such as Pruna, only image-backed choices are offered and the
step prompt is always empty.

New character reference generation uses one provider-neutral swap-ready staging profile. The
browser removes the background chooser, normalizes restored legacy draft options to neutral gray,
and normalizes options again before each generation request. The broker independently forces
neutral gray for optimize, generate, edit, and composition routes, while the final provider prompt
requires one centered character, even lighting, no scene/depth cues, and no unrelated props.
Existing uploaded or immutable references are not rewritten.

Structured prompt authoring has no UI: the retired Prompt Workshop's Add, Replace and Restyle
intents remain in `packages/domain/src/prompts` only because stored character records are still
sanitized against `PROMPT_INTENTS`. AI Settings takes a plain **Character direction** or **Garment
direction**. The creative library owns saved/recent/character metadata and atomic reuse. Retained internal recipe-shaped
records support compatibility and provider requests but have no Assets route, card, chooser, count,
or Studio presentation as Recipes. Character, Outfit, and AI Settings surfaces use the retained
data only through their own product vocabulary. Neither owner controls Character generation or a
media session.

Saved Character Wardrobe extends that repository with normalized version metadata, not another
character store. Each variant points to one parent and one immutable result asset. A pure resolver
turns `{ characterId, variantId }` into the ordinary character prompt, label, and exact image ID
used by Studio and Existing Video. The original remains the default; only successful hydration/use
persists a different selected version and updates exact parent/variant usage attribution. Parent
deletion cascades variant metadata and Recent links. Individual variant deletion resets a matching
selected-version link and detaches Recent attribution for that version. Retained image bytes follow
the existing immutable-asset policy. Wardrobe owns no media node or provider client.

Each character may also retain one nullable ElevenLabs voice preference containing only the opaque
voice ID and display name. Wardrobe loads the existing Voice library only after explicit voice
configuration. Selecting that character/version in Existing Video copies the preference into the
tab-local edit plan; the ordinary Voice workspace remains authoritative for manual override and
provider membership is revalidated only when processing starts. Creating a new character from a
saved character hydrates the source into a new Builder create target rather than updating the
source ID.

Wardrobe **Add Outfit** is an independent optional Pruna operation. Its garment may be an explicit
upload/import or an existing image-backed saved outfit; prompt-only outfits remain editor settings
and are not treated as garment images. The server uploads the owner-scoped person and one garment,
submits one pinned `p-image-try-on` prediction, polls bounded
starting/processing states, downloads through the authenticated allowlisted delivery path,
validates decoded output, and stores a flexible-dimension derived asset before returning. Browser
abort stops local polling but is not described as provider cancellation or deletion. **Change
Features** remains an edit through the startup-selected OpenAI/BFL/Wiro adapter with prompt
optimization disabled. Original-source edits include the parent character prompt. Variant-source
edits use the selected immutable image as authoritative through the image-only edit contract, so
the parent prompt is absent from both the browser request and provider prompt. Every saved result
still points directly to the original parent character as a sibling Wardrobe variant. The
default-off major-departure option also selects the image-only contract for an original source and
adds explicit server-owned prompt policy allowing identity and other defining traits to change.

Outfit Builder exclusively owns reusable Outfit creation, edit, copy, naming, prompt/image mode
exclusion, prompt enhancement, temporary reference files, and idempotent final-save upload. It
uses the same validated JPEG/PNG/WebP picker and explicit public-HTTPS importer as the
existing-video Character Swap/VTO reference fields. New outfits are prompt-or-image; migrated
combined prompt/reference outfits remain usable and editable. Selector-originated Save creates and
selects the Outfit without acquiring media, loading Decart, or contacting a provider. Editing
updates the existing ID; Save a copy creates a new ID. The creative library remains the metadata
repository and immutable reference storage remains the local broker's responsibility.

Character references follow these rules:

- JPEG, PNG, and WebP uploads are validated before storage.
- Upload and prompt-only Save do not contact an image provider.
- A stale generated preview may remain visible but cannot be attached to Save.
- Optimization failure may continue with the raw direction and an explicit warning.
- Image-provider failure never triggers fallback or automatic billable resubmission.
- Generation uses one startup-selected provider: OpenAI, BFL, or Wiro.
- Generated, edited, and composed assets are immutable; new work creates a child asset.
- Handoff commits prompt, reference bytes, provenance, and enhancement as one validated state.

## Recording, review, and voice

Recording composes a new stream from borrowed live tracks:

| Session                 | Video             | Audio                                                |
| ----------------------- | ----------------- | ---------------------------------------------------- |
| Local                   | Local camera      | Local microphone when present                        |
| AI before usable output | Not recordable    | Not applicable                                       |
| AI with usable output   | Transformed video | Provider audio when live, otherwise local microphone |

The chosen track identities and take metadata are pinned at Start. Recording never owns or stops
source tracks.

For the primary record flow and live AI recordings, the existing Latest Take review remains
authoritative. Recording from inside the existing-video upload flow instead adopts a healthy,
normalized local artifact into that editor after finalization. Both paths borrow the same
stage-owned recording lifecycle and preserve its cleanup ordering.

Recording orchestration owns the `MediaRecorder` instances, chunks, optional audio sidecar,
warning/cap timer, MediaBunny conversion, and finalization:

- warn accessibly at 270 seconds;
- route the 300-second cap and manual Stop through one coalesced path;
- settle final recorder data and the optional sidecar before releasing live resources;
- force the settled main video through an on-device H.264/AAC MP4 conversion;
- publish only the converted MP4, never the raw recorder container, even when the sidecar fails;
- cancel conversion and withhold the gallery-ready artifact if ownership ends or a required track would
  be dropped; and
- release local/provider resources only after finalization settles.

MediaBunny uses the browser's AVC/H.264 WebCodecs encoder and its official AAC encoder extension
when native AAC encoding is unavailable. The conversion keeps the raw recorder Blob private to
finalization and creates the artifact URL only after a complete MP4 exists. Review, Voice, and
Save therefore remain unavailable while transcoding.

Recorded and uploaded media publish through one artifact boundary:

`immutable source → latest healthy result`.

Stage artifacts carry either complete owned bytes or an explicit URL-backed presentation
(`features/recording/types.ts`). Only the original/source slot may be URL-backed — every processed,
edited or voiced artifact is produced from owned bytes. `ownedRecordingArtifact` is the single
declared narrowing from "presentable" to "owned bytes", and any consumer that needs the complete
media goes through it and handles `null` rather than reading `media` off a presented artifact. This
is what lets a Project open against a ranged content URL without downloading the file first.

Placement is applied on the way out, not on the way in. `features/export-placements` renders the
chosen placement in the browser immediately before upload, with progress and cancellation, and the
domain (`packages/domain/src/projects`) owns the aspect list and the resolution and crop each one
produces, so the operator-facing copy cannot drift from what is actually encoded. An unsupported
browser keeps the save path and offers only "Keep as it is".

An edited export crosses that boundary only after worker completion, browser-local decode and
track validation, and a three-action replacement confirmation: Cancel, Replace Without Saving, or
Replace and Save. The Save path must commit the pinned source to Saved Videos before replacement.
The dedicated module worker lazily
loads MediaBunny and its AAC extension, uses `Conversion` for trim/baked rotation/crop and
H.264/AAC encoding, and runs the shared WebGL shader after geometric transforms for flips, filters,
and lighting. Its `StreamTarget` writes into offset-aware 4 MiB blocks with a 300,000,000-byte
maximum; cancellation and failure release all blocks. There is no synchronous main-thread export
fallback. The preview creates one renderer for a stable canvas/media/geometry binding and sends
crop, filter, and lighting changes through shader uniforms; those edits do not churn WebGL
contexts. Partial shader/program setup is unwound, the worker disposes partially initialized
resources on every exit, and feature probes explicitly release their temporary context.

Validation requires non-empty playable H.264/AAC MP4 output, expected primary tracks, exact even
dimensions and orientation, duration within 500 ms, and a newly extracted immutable audio sidecar
when the pinned source has audio. A confirmed controller transaction publishes an `edited` child
with `parentArtifactId`, updates selected-video metadata and compatibility, then releases
superseded source/visual/voice URLs. Failure before publication leaves the prior source and draft
intact. Provider compatibility is derived from edited output geometry; only 16:9 and 9:16 within
the existing 1% tolerance can create Character Swap or VTO intent, while Voice and Save remain
available for uploaded or edited sources at other ratios.

The finalized or validated source replaces live media on the same stage. The artifact
owner creates and revokes every source/visual/voice URL. Changing source invalidates downstream
layers. During a combined edit, the transcoded visual is staged privately while voice conversion
runs; only the healthy voiced result is published. If Voice fails or is canceled, the healthy
visual is then published for comparison and retry. The combined plan is not reported complete
before the voiced result commits. A Voice retry after visual success continues from the retained
visual, not the original frame source. Every Voice treatment reads immutable source audio and
remuxes it onto the explicitly selected Original or Result video. Existing-video comparison
selects the immutable source or latest result without changing artifact ownership. The controller
retains inspected metadata for both layers, so comparison, local editing, provider compatibility,
and iterative result editing use the dimensions of the artifact actually selected. Its
source-preserving Start over revokes the latest result, retains the source, and returns
presentation to that source. Every artifact has a UUID, app-owned name, creation time, kind, and
parent lineage; generated filenames include the operation, UTC timestamp, and UUID suffix.

Uploaded and restored saved-video audio sidecars are lossless packet remuxes. MP4 AAC encoder-
priming packets with negative presentation timestamps are excluded because they are not playable
source audio and standalone MP4/WebM muxers reject negative timestamps. The source video remains
unchanged; reopening a saved video derives a fresh sidecar from its retained original bytes.

The lazy ElevenLabs library keeps independent Saved and Browse criteria, pagination, error, and
cache state inside the existing Voice workspace. Browse uses authenticated `/v1/shared-voices`
server-side search/filter/sort with fixed 20-item pages. The adapter always sends
`include_custom_rates=false`, then fails closed unless the exact shared response fields satisfy
`rate === 1` and `free_users_allowed === true`; authenticated visibility is the account-plan
entitlement check. `available_for_tiers` and interface labels are not eligibility inputs. Add
re-fetches the exact `public_owner_id`/`voice_id` candidate before an idempotent provider bookmark
when needed, then writes an app-owned user/voice relationship. The first explicit Saved read may
claim eligible provider-workspace memberships for the seeded user. Remove deletes only the
Lightframe relationship; it never calls the ElevenLabs voice-delete API. Preview and conversion
fail closed unless the authenticated user owns the relationship.

Saved search continues through `/v2/voices?voice_type=saved`. Search runs upstream, while exact
language, gender, age, accent, use-case, and descriptive matching incrementally aggregates cached
provider cursor pages behind an app-owned opaque cursor. Server metadata caches are bounded to
five minutes/60 shared entries and 60 seconds/40 saved entries; identical in-flight reads share
work, failures and aborts are not cached, and mutations invalidate saved membership/pages. The
browser keeps at most 40 visited pages for five minutes, debounces three-character text search for
300 ms, aborts superseded requests, and guards against late response commits.

The existing-video controller uses Mediabunny plus browser decode confirmation for an early check.
The API streams bytes to generated private paths and performs authoritative
container/track/codec/duration/aspect/size inspection before visual-provider contact. One app job
runs at a time. An uploaded workflow can switch its single active choice between Character Swap
and VTO before submission, and only that active operation is submitted. Browser and HTTP contracts
use `character-swap` and `virtual-try-on`; Lucy model identifiers remain inside Decart/live and
retained creative-configuration mappings.

The workflow coordinator delegates reducer/state policy, source adoption, accepted-job lifetime,
result finalization, Voice composition, and recipe hydration to feature-local owners. These are
ownership boundaries, not parallel workflows: one coordinator still controls the selected source,
one retained provider job, one pending visual, and ordered artifact cleanup. The panel separately
owns only tool selection, focus, saved Character/Outfit recovery presentation, and confirmation UI.

Before the potentially billable `PUT`, the browser creates one operation UUID in `submitting`
state. A valid success response advances it to `accepted`; an aborted, malformed, or lost success
response advances it to `acceptance-unknown` without changing the UUID. Both accepted states lock
resubmission controls. Recovery performs `GET` for that exact UUID and never repeats `PUT`; only a
confirmed not-found response unlocks a new explicit submission with a new UUID. A valid submission
response is passed directly into polling, avoiding a redundant immediate status read.

Startup configuration creates every enabled existing-video Character Swap binding through one
centralized factory and selects the editor's default. The capabilities contract advertises only
configured Decart/Pruna choices and their app-owned behavior; the submitted recipe identifies the
creator's explicit choice, which the broker validates before provider work. The Decart binding keeps
its exact Lucy endpoint, multipart fields, fixed 720p
output, and retry behavior. The Pruna binding is Character Swap only: it requires one reference,
requires H.264 MP4 submission input, disables prompt enhancement, pins `p-video-replace`, and
advertises the documented approximate 1 MP (`720p`) and 2 MP (`1080p`) output classes through the
provider-neutral capabilities contract. The editor stores one resolution on the visual step and
the broker validates it against that operation binding before passing it to Pruna. Its prediction
input also pins `seed=0`, `turbo=false`, `target_fps=original`, `save_audio=true`,
`ignore_audio=false`, and `disable_safety_checker=true`. Its capability advertises
`promptInput=server-default`: the browser renders no prompt/enhancement controls and submits an
empty prompt, the broker rejects non-empty prompt text before provider work, and the adapter always
uses the app-owned Pruna replacement instruction. Reference image 1 is
authoritative for facial identity, body, hair, wardrobe, costume, clothing, footwear, and worn
accessories. Source-person clothing is replaced and must not transfer onto the reference character.
The source supplies expression, lip sync, gaze, pose, hand placement, gestures, movement, timing,
and blocking. Every non-worn object and item the source person holds, carries, touches, picks up,
puts down, or otherwise interacts with retains its appearance, visibility, position, motion,
contact, occlusion, and interaction timing. Every other non-character scene/audio property is kept.
Its server-only sizing policy records
content-free informational metadata for non-canonical dimensions and continues with the inspected
result; Decart keeps exact canonical 720p validation. When a server-approved result is selected as
the next frame source, a non-canonical result is fitted locally inside the smallest canonical
16:9/9:16 canvas at explicit Start. That ephemeral H.264 MP4 copy is revalidated before upload;
the retained result is never cropped, stretched, or replaced. There is no automatic provider
fallback. Virtual Try-On always resolves independently to Decart. The shared
server provider contract normalizes submit, queued/processing/completed/failed status, opaque
output location, bounded download, retryable failure classification, output resolution, and
safe failure data. Environment reads do not enter UI or orchestration.

The broker owns upstream polling cadence. Stable queued/processing states back off through
2/3/5/8/10-second intervals, reset to two seconds when state changes, and expose a nullable
`nextPollAfterMs` hint. Rapid browser reads return cached app state without another provider
request. The job registry uses a job map, owner-to-active-job index, and generation-token deadline
min-heap; matching replays of the same owner/job UUID coalesce while a different fingerprint for
that UUID fails safely. Temporary cleanup is idempotent, protects active delivery leases, retries
transient removal failures, retains pending cleanup state, and emits at most one safe job-ID-only
diagnostic when retries are exhausted.

`GET /api/capabilities` exposes availability, `none | h264-mp4` input preparation,
`optional | required` reference policy, `editable | server-default` prompt ownership,
prompt-enhancement support, and terminal-failure release
ownership per operation. It exposes no batch model/provider name. When H.264 MP4 preparation is required, the browser converts MOV/WebM at
explicit Start, revalidates the ephemeral Blob, submits it, and leaves the immutable source and
audio sidecar unchanged. MP4 remains pass-through unless iterative result editing needs the
canonical contain-fit preparation above. Downloaded metadata is compared with the server-approved
result rather than a browser-hard-coded 720p size.
VTO recipes carry an explicit batch input discriminator for saved/recent outfit, direct reference
image, or prompt. Saved and recent recipe records separately persist `vtonInputKind` as `prompt` or
`saved-outfit` plus `enhancePrompt`; image-only records are valid only with an opaque persisted
reference ID. Prompt recipes restore Prompt mode and enhancement. Saved-image and migrated combined
recipes restore Saved outfit mode with enhancement off. An explicit Character Builder, Outfit
Builder, Character Swap, or VTO remote reference import goes through the loopback API with its own
`reference-image-import` intent: HTTPS-only URL parsing,
credential/private/mixed-address rejection, per-hop DNS pinning, bounded redirects/bytes,
JPEG/PNG/WebP header and decoded-content validation, cancellation, no-store bytes, and sanitized
errors. The URL is neither persisted nor forwarded to a visual provider.

## Durable Campaign and Project authority

The Project aggregate is implemented in domain, contracts, versioned local metadata, authoritative
relational persistence, and feature-local browser adapters/controllers. Authenticated routes back
`/projects`, `/projects/:projectId`, and the focused `/projects/:projectId/workspace`, where the
operator can list, create named or quick
Projects, inspect, open, rename, archive, restore, attach one source, remove that source to choose
another, checkpoint creative intent, adopt working
media, reconnect visual processing, save exact outputs, and browse bounded history. `Project` is the
owner-scoped durable workspace for one focused production effort; Saved Videos remain outputs and
immutable output versions rather than work-in-progress authority. One Project can link any number
of Saved Video outputs while its current revision keeps one active working context. The separately
documented deferred Deliverable model is required only when several child video workflows must
remain independently editable and resumable at once.

A Project may intentionally remain empty and collection-only. The deferred UI name for future
independent children is **Videos**, while `Project Deliverable` remains the proposed internal model
term. One exact Saved Video Version may be related to several Projects or future Project Videos;
each reuse relationship is owner-checked and role-specific, copies no bytes, and does not create
false producer provenance.

Campaign is a separate owner-scoped aggregate containing only normalized name, optional bounded
brief, lifecycle timestamps, and version CAS. Project has a nullable `campaignId`; create-in,
move, and detach use Project CAS and validate an active same-owner Campaign inside the mutation.
One Project belongs to zero or one Campaign, and “No Campaign” is a virtual query rather than a
synthetic row. Campaign archive leaves Projects unchanged and rejects new membership. Tombstone
requires an archived Campaign with zero attached active or archived Projects and never deletes
Project, revision, job, output, resource, or media data.

Project asset membership is a separate organizational relation with kind `video`, `character`,
`outfit`, or `voice`. Its unique owner/Project/kind/resource key makes attach idempotent. Detach
removes only the membership and never deletes or changes the underlying resource, Project source,
working media, output, revision, or retained Version. Archived Projects remain readable and reject
membership mutations. Missing resources remain unavailable memberships until explicit detach.
Server-owned Videos and Voices are owner-validated; relational creative records are validated when
that authority is active. In local-file mode Character and Outfit IDs are opaque authenticated
references resolved only from the current owner's namespaced IndexedDB and grant no server media
access. Visible Videos are summary-resolved in one bounded query; Characters and Outfits use one
owner-scoped browser snapshot and Voices use one existing saved-library query.

Every Project starts with an immutable revision 1, including an empty named Project. Snapshot V2
stores validated creative intent and durable IDs: source and working/presented media, exact applied
Character/Variant and Outfit labels/revisions/reference IDs, Voice settings, one Character Swap or
VTO choice, relevant live metadata, prompt/recipe labels and applied prompt/revision, the validated
`VideoEditSpec`, export specification, last output, and workflow phase. The explicit V1 read
migration maps missing applied provenance to `null`; it never fabricates labels, revisions, prompts,
or references. Media bytes, Blob/object URLs, provider credentials/bodies/locations, mutable
creative-library records, undo history, render candidates, and browser or React state are excluded.
A source-bearing Project is resumable only after the same-owner media asset is `ready` in the
configured durable byte store.

A Project source is immutable while it is attached: a second acceptance returns an
`immutable-source` conflict rather than overwriting the first. Removal is a separate explicit
command that appends a sourceless revision and deletes only the current `project_sources` pointer
row in the same transaction, under the same Project-version and revision CAS and the same
active-attempt refusal that guards archive. The revision-scoped `project_assets` `role='source'`
link is deliberately left in place, so the owner-scoped Project retention policy keeps protecting
the removed bytes for any output Version already produced from them; no byte deletion is performed
and no physical purge is claimed. The command creates no bytes and no provider work, so it carries
no operation receipt: removing an already-removed source converges on current authority instead of
conflicting. Upload and finalized-recording commands
store an owner-bound ready asset, server-computed checksum, inspected video metadata, source record,
and revision-scoped source/working/presented links before claiming resume. Exact Saved Video Version
reuse verifies an active same-owner Version and references its existing asset without copying bytes;
the used-by relationship does not claim Project production and does not select an existing-video save
target. Authenticated metadata and byte-range/HEAD content routes expose only normalized metadata
and a controlled relative content URL, never storage keys, paths, checksums, or provider bodies.

Snapshot V2 remains deliberately video-specific: its local edit type and MP4 export specification
are not a generic multi-format asset contract. Supporting images, graphics, or another content type
requires a new validated snapshot version or a separately owned workflow payload, plus migration
and unknown-version behavior; documentation terminology alone cannot broaden this schema safely.

`projects.version` is the aggregate compare-and-swap token. Revision append also compares the
current revision number, locks the Project, verifies the linear parent, strictly parses/canonicalizes
snapshot v2, and validates exact same-owner ready assets and active Saved Video Versions. Direct
asset and used-by Version links are revision-scoped. Job links keep one immutable initiating
revision; output links keep one immutable producing revision per Video Version. Later reuse is a
used-by relation, not another producer. Exact link replay is idempotent and a changed replay is a
typed conflict. `lastSuccessfulOutput` must match an existing output relation retained by the same
Project. Current status uses current-revision/current-attempt facts, and material changes clear a
stale output pointer. Archive is rejected while a linked job remains active.

Normal reads return only the Project summary and current revision. Revision, processing, and output
histories are separately cursor-paginated metadata projections; list responses never include full
snapshot history or bytes. Output projection preserves both the producing revision and a verified
later `output-save` reference revision. Exact Version metadata/content is owner-checked through the
retaining Project relation, including when the Saved Video is tombstoned globally. The repository
exposes a composite metadata unit-of-work seam for
the owner-derived **Save Project Output** command. One PostgreSQL transaction commits the Saved
Video/immutable Version mutation, producer output relation, post-save hydration record and
revision, exact `lastSuccessfulOutput`, Project status/CAS, and durable operation receipt. The
output relation remains attached to the pre-save producing revision; the distinct `output-save`
revision presents that exact Version and becomes `completed`. The application opens, inspects, and
verifies the already-durable current bytes before entering the metadata transaction and reuses the
asset ID, so this path stages no new bytes and invents no distributed transaction or compensation
claim. Exact receipt replay returns the originally stored public result; a changed Project/media/
target/title fingerprint conflicts without mutation. One owner-scoped Project retention policy is
consulted by Saved Video cleanup, reference-image cleanup, and the generic relational byte deletion
claim. Direct asset links, used-by Version links, and produced outputs retain bytes for active,
archived, and tombstoned Projects. A tombstoned Saved Video disappears globally, while an exact
same-owner Project output relation authorizes only its Project-scoped Version content. Physical
Project purge remains undefined.

The owner-derived **Adopt Project Working Media** command accepts either a validated local render
whose durable bytes were inspected and checksummed or an exact same-owner ready Media Asset/Saved
Video Version. It flushes the Project session, uses Project/revision CAS plus an operation-key
fingerprint, appends normalized working/presented lineage and the exact local edit, clears obsolete
output status, and never changes `sourceAssetId`, chooses an existing-video save target, or adds produced-by
provenance. Exact replay returns the original adoption revision; changing media, edit, or base
tokens under the key conflicts. A Render preview remains worker-owned and temporary until this
command succeeds. The creator aborts or releases failures and consults Project retention before
deleting any staged durable bytes.

The browser treats TanStack Query/controller state only as an owner-scoped cache. Active and
archived summary lists are separately bounded and never request snapshots or media. Project detail
requests current summary/revision only. Quick Start sends `Untitled Project` with an app-owned UUID
operation key; exact response-loss replay resolves through the durable server receipt. Metadata
mutations use Project-version CAS. A stale rename retains the proposed title until explicit reload
and retry or discard. Empty detail does not hydrate media or start camera/provider work. Accepted
detail fetches current source metadata/content with cancellation and hands a fresh Blob to the
existing artifact owner, which alone creates/revokes playback object URLs. Source staging keeps its
initiating Project ID and operation key; exact retry reuses the key, and a route change aborts or
isolates late completion.

One feature-local Project session controller owns URL-derived detail hydration, the current server
base, a typed semantic proposal, a 750 ms bounded coalescing timer, Project/revision CAS, and flush.
Feature-local creative adapters publish explicit semantic checkpoints for applied reusable
resources, one visual treatment, optional Voice, live metadata, intent, and local edit; they never
append per keystroke, frame, slider tick, or undo entry and never become a second session. Source,
working, and presented media remain copied from server authority and change only through their
existing commands. Hydration validates reusable records through the owner-scoped creative store;
saved Voices use a minimal app-owned relationship read that derives the owner from authentication
and never contacts ElevenLabs. A missing, tombstoned, wrong-owner, or changed record does not fail
the Project or reveal cross-owner existence: historical applied labels/prompt/reference/settings
remain explanatory and the UI offers **Choose another**. A same-semantic response-loss replay returns current authority without
appending another revision. A different stale CAS preserves the proposal, fetches current authority,
and waits for explicit reapply or discard; there is no collaborative merge. The controller
publishes a narrow proposal/flush/retry/discard port to `StudioApp` and delegates fresh source and
working-media Blobs to the existing recording-artifact owner. Active Project identity exists only
in `/projects/:projectId/workspace`; global-library URLs are explicit guarded exits. No dormant
IndexedDB Project store is activated, so only the current tab retains an unsaved proposal and
confirmed reload/crash may discard it. A feature-local Project-processing controller reads current
authority on Project hydration, routes Character Swap/VTO Start through one app-owned command,
replays only the exact operation key after response loss, and polls/reconciles accepted work without
resubmission. It asks the Project session to checkpoint exact creative intent before admission and
asks server authority to refresh the existing source/working-media bridge only after a current
result is durably retained. The browser never owns job truth or downloads result bytes through a
second path. Ambiguity remains locked until status can be checked or the operator explicitly
confirms a potentially duplicate-cost retry. Closing or switching Project context stops browser
polling, not accepted provider work; reopen reconnects it. Configuration alone still makes no
provider request. Provider-backed Voice and live Character/VTO starts remain composition-gated
because they cannot satisfy this command's recovery contract.

The Project review surface offers one placement-labelled **Save video** action. It reveals one
destination choice: a titled new Saved Video, or a new Version of one explicitly selected active
Saved Video. The latter loads and names the target plus its expected current Version inside that
same surface; Project source lineage never selects it, and no picker-to-confirmation modal chain
exists. Desktop and tablet keep the choice in the inspector; mobile uses one focus-trapped bottom
sheet. Before sending, the browser flushes the Project session and stores a strict
environment/user/Project-scoped v1 pending operation containing the exact request and UUID. A lost
response or reload reuses that operation unchanged until the durable receipt returns the one
original result. Final 4xx/conflict responses clear the pending operation; ambiguous transport
failure preserves it for explicit or automatic reconciliation. This small browser record
coordinates retry only and is never Project or Saved Video authority.

Project processing admits one app-owned operation against the exact current Project revision and
durable working/source Media Asset before provider contact. The atomic local journal or relational
transaction creates both the normalized `submitting` record and revision-scoped job relation first.
Provider acceptance only adds a private durable provider identity. A restart may resume bounded
status/retrieval for that identity, but a `submitting` record without it becomes
`submission_ambiguous` and is never submitted automatically. Retry is a new explicit operation;
ambiguous retry additionally requires acknowledgement that provider cost may be duplicated. The
broker waits for a terminal in-memory job's pending durable trace before returning status, so
Project reconciliation cannot schedule another poll after a known terminal failure. Normalized
provider-account billing failure remains distinct from media/intent rejection without retaining an
upstream body or numeric code. The
current-attempt response is current-revision scoped, while bounded history preserves prior attempts.
The currently configured queued Character Swap and VTO adapters can use this authority; provider-
backed Voice remains unavailable here because its synchronous response supplies no durable
reconnect identity. The current providers expose no verified cancellation operation. The Project
workspace and Dashboard therefore offer the same explicitly labeled local-abandon command for a
queued or active job. It aborts Lightframe recovery, durably marks the trace `cancelled`, removes
temporary bytes, releases owner admission, and stops the Project archive blocker; both surfaces
warn that provider work and cost may continue and never represent this as provider cancellation or
deletion.
An ambiguous historical attempt stops blocking archive once a later durable attempt for that same
Project exists, whether the later attempt is an explicit retry or belongs to a newer revision; the
history remains intact, while the newest unresolved attempt still blocks.

After provider retrieval, the byte-store owner durably stores and inspects the result before its
delivery lease and temporary output are released. A still-current attempt appends one idempotent
`job-result` revision, advances working/presented media, and creates a normalized job-result asset
relation. A paid success whose initiating revision is obsolete is retained instead as a historical
owner-bound `job-output` asset on that initiating revision and cannot change current Project media.
Neither path creates a Saved Video, Video Version, or `project_outputs` producer relation.

`local` and `shadow` use one owner-namespaced Campaign/Project metadata file as authority. Schema
version 7 explicitly migrates v1/v2/v3/v4/v5/v6 metadata, preserves Campaigns/receipts, immutable
source, working-media adoption, and processing records, and adds Project asset memberships while
retaining Project-output operation receipts plus a composite Saved Video/Project prepared journal.
The deterministic v6→v7 loader backfills distinct supported memberships from Saved Video sources,
working-media references, outputs, and resolvable Character, Outfit, and saved-Voice snapshot IDs;
it neither fabricates IDs from labels nor exposes retained Recipe records. The metadata is
atomically replaced with a validated backup. Create, Campaign membership, Project asset membership,
source acceptance, working-media adoption, processing admission,
result retention, and output save mutations publish a
versioned prepared journal containing the next metadata and owner-scoped operation receipt;
startup either observes the committed receipt or reconciles that journal before serving reads.
For output save, the prepared envelope contains both complete next owner libraries, commits Saved
Video metadata before Project metadata, and remains until both primary records are durable; restart
replays either side idempotently. The shared owner lock serializes both repositories. Exact replay
returns the stored Saved Video/Version/Project result, while a changed fingerprint conflicts. This
is local crash convergence over ordered atomic files, not a transaction spanning independent files,
R2, or shadow traces.

Persistence representation is kept adjacent but separate from transaction mechanics. The local
repository delegates strict schema evolution and prepared-journal parsing to its persistence-schema
module. The Drizzle repository delegates row/domain conversion and insert projections to its mapper
module while retaining locks, relationship validation, CAS, and transaction ordering in the
repository itself.

The Drizzle repository is authoritative in `postgres` and `neon` modes only; `shadow` may still
write configured remote processing traces but does not replicate or defer Project authority to
Drizzle. Existing Saved Videos and processing jobs remain valid and unassigned. Migration `0010` preflights and
rekeys existing Prompt 01 Project relations without fabricating undeclared lineage, and adds the
normalized used-by Version relation. A job relationship pins the initiating revision so future
orchestration can reject stale result promotion without losing safe lineage. Migration `0011`
then aligns Project history and asset-retention indexes with their bounded batch queries. Additive
migration `0012` adds the owner/operation-key Project create receipt used for transactional,
restart-safe relational idempotency. Additive migration `0014` adds Campaigns, Campaign create
receipts, nullable Project membership, lifecycle/list checks/indexes, and a restrictive composite
same-owner foreign key. Existing Projects remain unassigned. Additive migration `0015` adds the
active/archived Campaign-membership list indexes used by grouped Project views.
Additive migration `0016` adds the one-row-per-Project inspected source authority, exact owner/
revision/asset/Version foreign keys, and owner-scoped operation-key uniqueness. Additive migration
`0018` permits snapshot schema v2 and adds the owner-scoped working-media adoption table with exact
revision/media/edit fingerprint replay. Additive migration `0019` extends processing jobs with the
preallocated result asset and retry identity, extends Project job links with the retained result
revision, and adds only the constraints/indexes needed for transactional admission, reconnect, and
idempotent result retention. Additive migration `0020` adds the `output-save` revision source and
one owner/operation-key Project-output receipt containing the exact original public result. It
rewrites no Project, Saved Video, Version, or output row and is never applied automatically to
production. Additive migration `0021` adds the Project asset-kind enum, non-owning membership table,
same-owner Project foreign key, unique owner/Project/kind/resource constraint, and bounded list
index. Owner-scoped application migration `project-asset-memberships-v1` deterministically derives
legacy memberships on first membership access and records completion atomically; it does not
rewrite source/output/history rows or create Recipe memberships. Existing unlinked content remains
unassigned. See
[ADR 0002](decisions/0002-durable-project-aggregate.md).

## Persistence

| Store                       | Data                                                                                                                                                                                                                                                                                                | Lifetime and trust boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creative library IndexedDB  | Environment-and-user-namespaced v7 prompt compatibility data, Character, Outfit, Wardrobe metadata, voice preferences, and opaque asset IDs                                                                                                                                                         | The `idb` adapter stores owner-scoped logical records and indexes in strict transactions. Production alone migrates pre-separation browser keys and may initialize an empty remote library from that browser copy. Development treats local PostgreSQL as authoritative on startup, including when empty. Later changes synchronize through an owner-derived revision CAS; divergence pauses sync and preserves the browser copy. Never stores media bytes or credentials. Retained Recipe-shaped records are compatibility data and are not presented as assets.                                                                                                                                                                                                                                                                                             |
| Character Builder IndexedDB | Environment-and-user-scoped resumable draft and save journal                                                                                                                                                                                                                                        | Compare-and-swap autosave prevents duplicate save/preload after retry or reload. Drafts remain device-local, production alone retains access to the pre-separation database name, and development starts in a distinct database.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Local persistence           | Campaign/Project metadata and create/source/working-media/processing/output journals, non-owning Project memberships, Project source, adopted local renders, retained processing/results/outputs, saved-video aggregates/versions, thumbnails, references, saved voices, and safe processing traces | Default `local` authority under `LIGHTFRAME_DATA_DIR`; Campaign/Project and saved-video metadata use versioned owner namespaces, atomic publication, validated recovery, durable idempotent receipts, and owner checks. One shared owner lock and schema-v7 prepared envelope converge composite output metadata after interruption. Membership rows have no media-retention authority and cascade only with Project tombstoning. `shadow` retains local Campaign/Project authority; configured relational traces remain best-effort side effects. Accepted source, adopted working media, retained Project-job results, and Project outputs are private assets protected by Project retention. Sessions, unadopted render candidates, and the browser retry coordinator are not metadata authority.                                                          |
| PostgreSQL / Neon           | Users/credentials, sessions, Campaigns, Projects/revisions/relationships and non-owning asset memberships, videos/versions/receipts, voices, references, creative records, jobs, media lifecycle, and outbox                                                                                        | Standard `node-postgres` transport supports Docker PostgreSQL in authoritative `postgres` development and Neon in `shadow`/`neon` production. Neon URLs explicitly require TLS through `sslmode=require`, `verify-ca`, or `verify-full`. Transactions protect Campaign/Project CAS and membership, Project revision append, exact link replay, Project-job admission/result retention, composite Saved Video/Version/output/post-save revision receipt, byte-deletion claims, and creative revision replacement. Campaign/Project persistence is not authoritative in `shadow`.                                                                                                                                                                                                                                                                               |
| Cloudflare R2               | Private video, thumbnail, and reference bytes selected through `AssetByteStore`                                                                                                                                                                                                                     | Opaque app keys, server-mediated range reads, SHA-256 verification, multipart abort, and database pending/ready/deleting/deleted states. Authoritative PostgreSQL/R2 and Neon/R2 Saved Video writes use owner-scoped one-hour staged rows and five-minute exact-part presigned URLs; only the browser-to-R2 part PUT bypasses the API. The API verifies object metadata, bounded bytes, checksum, and media structure before registration and attachment. Deletion claims the persisted provider/key identity and interrupted cleanup remains retryable. Provider, account, bucket, or prefix changes require a reviewed migration. Unsaved references remain subject to relationship-safe discard and 24-hour inactive-orphan cleanup. Credentials remain server-only; bucket, key, and provider multipart scope appear only inside short-lived signed URLs. |
| Session memory              | Auth snapshot, URL-owned Project semantic proposal/base token, edit history/candidate, streams, tokens, files, direct-import outfit recents, device IDs, takes, and sidecars                                                                                                                        | JWT remains only in the HTTP-only cookie. The bounded Project proposal contains validated creative/live/edit values but no bytes, mutable records, or provider state; it is cleared after server save, explicit discard, Project exit, logout, or tab close and is never browser authority. Render candidates remain creator-owned until explicit adoption. Other state is cleaned on auth change, replacement, release/discard, unmount, or tab close as applicable.                                                                                                                                                                                                                                                                                                                                                                                         |
| Video-job temp root         | Streamed input/reference and inspected provider output                                                                                                                                                                                                                                              | Process-temporary. A Project record/link exists before submission in every mode. Jobs with a durable provider identity can resume status/retrieval after restart without resubmission; an unconfirmed submission becomes ambiguous. Valid current or stale output is moved into the configured durable byte store before this temporary owner releases it. The fixed accepted-at-plus-60-minute deadline remains authoritative.                                                                                                                                                                                                                                                                                                                                                                                                                               |

Browser storage is untrusted, schema-migrated, and user-namespaced. Opaque IDs, provenance, and
timestamps are preserved. The filesystem store uses atomic publication and never exposes internal paths,
provider URLs, credentials, or raw payloads. Local reference storage conservatively retains
detached assets. Authoritative Neon/R2 derives the complete saved reference set from canonical
creative-library rows. The trusted-origin discard route and creative-library replacement cleanup
delete only owner-scoped assets absent from that set; metadata/content access refreshes temporary
activity, and later library reads/writes purge unreferenced assets inactive for 24 hours. Reference lookup uses versioned
owner/request transaction mappings plus a versioned, atomically replaced derived index. A clean
startup reads that index once rather than reading every asset metadata and mapping file. A missing,
schema-invalid, or dirty index triggers the conservative legacy scan, mapping repair, and index
rebuild; a dirty marker is published before an asset commit and removed only after the replacement
index is durable. Ordinary new reads and misses do not rescan the asset directory. The repository
contract distinguishes a missing asset from a backend that cannot return a streamable local file:
only the latter may fall back to buffered content, so a miss performs one storage lookup.

Persisted timestamps cross application and filesystem boundaries as canonical UTC ISO strings.
Neon/PostgreSQL may return its native space-separated timestamp representation; every Drizzle
repository normalizes that value before returning an application contract. Local saved-video,
saved-voice, and media-manifest reads atomically rewrite parseable legacy timestamp forms to the
canonical representation. Saved-video durations are integer milliseconds at the repository
boundary; legacy fractional millisecond values are rounded during migration before a Neon insert.

The retired Guided repository and compatibility presentation were removed after the one-time local
reset period. No current code lists, imports, downloads, promotes, or hydrates those records. New
saved media is written only through the authenticated server Saved Video service.

See [privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md) for the user-facing data contract.

The broker assigns one immutable deadline when it accepts a job: `acceptedAt + 60 minutes`. That
same deadline covers validating, submitting, queued, processing, retrieving, and ready states;
status reads, retries, and the transition to ready never extend it. A service-owned nearest-deadline
timer enforces expiry without requiring another request, preserves an expired in-memory tombstone,
and guards late provider work from restoring state or bytes. Successful delivery, explicit release,
or broker shutdown may delete local state earlier. A content stream admitted before the deadline
may finish after it, but no new content stream may start at or after the deadline. This is local
lifecycle cleanup only, not provider cancellation or provider-side deletion. Pruna uploads expire
after approximately 30 minutes and generated delivery content is typically available for 24 hours;
no documented Pruna cancellation/deletion endpoint is treated as part of local cleanup.
Pruna terminal failures remain visible through their safe app-owned status until explicit user
discard/replacement or the fixed deadline; browser polling does not issue an automatic DELETE.

## Backend boundary

The Bun process binds an exclusive `node:http` compatibility listener to `127.0.0.1` and delegates
every request to Elysia for routing and lifecycle hooks. This listener is intentional: it preserves
fixed `Content-Length` responses and socket finish/close semantics for backpressured file streams,
which the pinned Bun native listener cannot provide together. The boundary rejects non-loopback
Host headers and requires exact loopback Origin checks for provider or reference mutations.
Public request/socket events drive cancellation first. Bun 1.3.14 does not emit those events when a
client disconnects after its request body is complete but before a waiting handler sends headers,
so a feature-detected, request-scoped compatibility watchdog observes only the native handle's
boolean closed state. It is cleared on response finish, close, or error; if Bun changes that private
shape, provider and application timeouts remain the fail-safe.
Browsers may omit `Origin` on same-origin `GET`
requests, so provider reads accept an exact loopback `Origin` or referrer, or browser
`Sec-Fetch-Site: same-origin`; their explicit provider-intent header remains mandatory. ElevenLabs
provider-contact routes require `X-Lightframe-Provider-Intent: voice`; the authenticated saved-Voice
relationship read is app-owned and requires neither provider intent nor provider contact. Visual batch routes require
`X-Lightframe-Provider-Intent: video`; remote reference import requires
`X-Lightframe-Provider-Intent: reference-image-import`; Pruna Wardrobe generation requires the
independent `X-Lightframe-Provider-Intent: wardrobe`. Responses are `no-store`.

The compatibility listener leaves body acceptance to the app-owned Elysia boundary so Host,
authentication, Origin, and provider-intent hooks run before any body is consumed. Every route uses
its exact declared-length and counted/spooled limit; the largest accepted application request is
310,551,296 bytes. Request receipt has an absolute 100-second deadline, after which handlers and
response streams receive a fresh activity-based lifetime budget.

Permanent keys remain in server environment memory. App-owned schemas validate every HTTP
boundary. Provider adapters normalize upstream data into allowlisted safe codes; raw messages,
bodies, URLs, prompts, credentials, causes, and arbitrary codes never reach clients or logs.

Pino remains the operational log authority. Every response includes an `X-Request-ID`; when
explicitly enabled with both `OTEL_TRACING_ENABLED=true` and an OTLP trace endpoint, the official
Elysia OpenTelemetry plugin supplies W3C trace propagation and sampled request roots while
application-owned spans define workflow admission, database idempotency, temporary files, storage,
provider submit/poll/retrieval, MediaBunny inspection, and Sharp boundaries. Trace IDs
are added to request logs and returned as `X-Trace-ID`. The OTLP exporter allowlists bounded route,
status, workflow, provider-kind, attempt, and byte-count attributes; it removes full URLs, query
strings, headers, prompts, object keys, local paths, bodies, and exception messages/stacks. Browser
MediaBunny/WebCodecs transcoding remains outside the server trace and is correlated through its
following API request rather than a browser telemetry SDK.

Wiro availability follows the startup-selected reference provider and its required server-only
credentials. There is no separate runtime access-mode layer. Missing configuration disables only that
provider path and never causes provider fallback.

| Boundary                    | Routes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication              | `GET /api/auth/demo-config`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Local status                | `GET /api/health`, authenticated `GET /api/capabilities`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Campaigns                   | `GET/POST /api/campaigns`, `GET/PATCH /api/campaigns/:campaignId`, and `POST` archive/restore/tombstone subroutes; create requires `Idempotency-Key`, mutations use Campaign-version CAS, lists are bounded, and tombstone is archived-empty only                                                                                                                                                                                                                                                                                        |
| Projects                    | `GET/POST /api/projects`, `GET/PATCH /api/projects/:projectId`, `POST /api/projects/:projectId/duplicate`, `POST /api/projects/:projectId/revisions`, archive/restore subroutes, and `POST /api/projects/:projectId/campaign`; duplicate takes both `expectedVersion` and `Idempotency-Key` and refuses a stale or deleted source; create requires `Idempotency-Key`, semantic checkpoints use Project/revision CAS, metadata mutations use Project-version CAS, and lists support bounded lifecycle plus Campaign/No Campaign filtering |
| Project asset membership    | Cursor-bounded `GET /api/projects/:projectId/assets`, idempotent `POST /api/projects/:projectId/assets`, and idempotent `DELETE /api/projects/:projectId/assets/:membershipId`; ownership is server-derived, archived Projects reject mutation, visible Saved Videos resolve in one bounded summary read, and detach never deletes an underlying resource or retained relation                                                                                                                                                           |
| Project media               | `POST/GET /api/projects/:projectId/source`, `POST /source/reuse`, `GET /source/content`, `POST/GET /working-media`, `POST /working-media/reuse`, and exact revision content; uploads are bounded and inspected, replays are idempotent, reuse is exact/same-owner, and every content response is owner-checked. Source and working-media content are served as HTTP ranges (`sendRangedAsset`), so opening a Project presents a URL-backed artifact instead of downloading the whole file                                                |
| Project history and output  | `POST /api/projects/:projectId/outputs` performs the composite output save; cursor-bounded metadata-only `GET /history` and `/outputs`, exact output metadata at `/outputs/:videoVersionId`, and owner-checked range/HEAD/download content at `/outputs/:videoVersionId/content` keep producing/reference revisions distinct and authorize tombstoned Saved Videos only through exact retaining Project relations                                                                                                                        |
| Project processing          | `POST /api/projects/:projectId/processing/submit`, `GET` current/history and retained result content, and `POST` reconcile/retry/cancel; provider-contact routes require trusted Origin plus video intent, admission pre-links the exact revision, history/content are owner-checked, retry is explicit, and cancel performs only the disclosed local-abandon transition because current providers have no verified cancellation API                                                                                                     |
| Decart                      | `POST /api/realtime-token`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Existing-video processing   | `GET /api/video-jobs` lists the owner queue; `PUT /api/video-jobs/:jobId`, `GET /api/video-jobs/:jobId`, `GET /api/video-jobs/:jobId/content`, and `DELETE /api/video-jobs/:jobId` own temporary submission/delivery; acknowledged `POST /api/video-jobs/:jobId/abandon` durably releases local tracking without claiming provider cancellation                                                                                                                                                                                          |
| Saved videos                | `POST/GET /api/videos`, `GET/PATCH/DELETE /api/videos/:videoId`, `POST /api/videos/:videoId/versions`, owner-checked current/version content, and optional thumbnail upload/content. Authoritative Neon/R2 also registers `POST /api/videos/uploads`, staged part list/sign/complete, and `DELETE /api/videos/uploads/:uploadId`; all expose only the app upload UUID.                                                                                                                                                                   |
| Creative library            | `GET/PUT /api/creative-library` with an owner-derived revision compare-and-swap when Neon is authoritative. A paused mirror is recoverable from the browser: `CreativeLibrarySyncNotice` offers Try again, Keep this browser's copy (fresh read, then full-store PUT) and Use the cloud copy (`replaceFromRemote`). No merge exists, because the contract has no per-record identity                                                                                                                                                     |
| Reference optimization/work | `POST /api/reference-images/optimize`, `POST /api/reference-images`, `POST /api/reference-images/import`, `POST /api/reference-images/:sourceAssetId/edits`, `POST /api/reference-images/:sourceAssetId/compositions`, `POST /api/reference-images/:sourceAssetId/outfit-try-ons`                                                                                                                                                                                                                                                        |
| Reference asset lifecycle   | `POST /api/reference-images/uploads`, `GET /api/reference-images/:assetId`, `GET /api/reference-images/:assetId/content`, trusted-origin `DELETE /api/reference-images/:assetId`                                                                                                                                                                                                                                                                                                                                                         |
| Saved-Voice relationship    | Authenticated `GET /api/elevenlabs/voices/:voiceId/relationship`; returns only the submitted ID and current owner's saved boolean without provider contact                                                                                                                                                                                                                                                                                                                                                                               |
| ElevenLabs                  | `GET /api/elevenlabs/voices`, `GET /api/elevenlabs/voices/:voiceId/preview`, `DELETE /api/elevenlabs/voices/:voiceId`, `GET /api/elevenlabs/shared-voices`, `GET /api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/preview`, `POST /api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/save`, `POST /api/elevenlabs/voice-changer/recording`                                                                                                                                                                                       |

Capabilities report configuration presence only. The backend has one configured demo user and no
signup, analytics, public tenancy, billing, or general durable worker queue. Local mode uses files
and process-memory sessions. Configuration-gated Neon provides SQL metadata, durable sessions, and
accepted-job recovery; private R2 provides bytes. Neither changes the loopback trust boundary.
Host-derived legacy namespaces are migration inputs only, never authenticated identity.

## Resource ownership

The creator of a resource owns idempotent cleanup.

| Owner                 | Resources                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session orchestration | Owned local/remote streams, cloned provider input, provider client, token abort, active-session clock                                                          |
| Session draft         | Ephemeral files and preview object URLs                                                                                                                        |
| Recording/review      | Recorders, chunks, conversion abort, immutable source/sidecar, edited/visual/voice artifact URLs, cap timer, unload protection                                 |
| Existing-video flow   | Validation generations, one ephemeral visual draft, job-status observer, provider-result download                                                              |
| Project processing UI | Exact-operation command continuity, bounded status timers, explicit retry/cost confirmation, and server-authority refresh; never job/result-byte authority     |
| Video edit session    | Pinned source/draft/history, module worker generation, render candidate, chunk accumulator, validation abort                                                   |
| Character Wardrobe    | Variant creation draft, generation abort, stale-result rejection, uncommitted reference discard, exact version handoff                                         |
| Voice processing      | Abort controllers, Web Audio/Mediabunny resources, temporary processed URLs                                                                                    |
| Media stage           | DOM media attachment and control-visibility timer                                                                                                              |
| Overlay               | Focus/inert/scroll state only; never media                                                                                                                     |
| API request/service   | Request abort, upstream streams, shared-operation subscribers, provider deadline                                                                               |
| Video-job service     | Active map, durable accepted-job restore, admission, exact-once submission, private temp paths, expiry and cleanup                                             |
| Project processing    | Exact-revision admission, current-attempt reconciliation, ambiguity/retry policy, durable current-or-historical result retention, and archive blockers         |
| Reference store       | Storage-neutral byte streams, metadata/request mappings, activity refresh, saved-relationship checks, lifecycle registration, and idempotent temporary cleanup |

Late async results check their generation or abort state before commit. A healthy replacement
commits before the previous owned resource is released. Duplicate Stop coalesces. Recording only
borrows source tracks.

## Deployment and tests

Development uses Docker PostgreSQL on `127.0.0.1:5433`, Vite on `127.0.0.1:4173`, the API on
`127.0.0.1:4100`, and the private `lightframe-studio-development` R2 bucket. Production mode serves
the built client and API from Elysia through Bun's loopback `node:http` compatibility listener on
one origin while retaining the existing Neon database and private production R2 bucket. Explicit
environment profiles never infer resource selection from the Git branch. There is no supported
public deployment, authentication, tenancy, billing, backup, remote observability, or blanket
asset garbage collection.

Tests keep provider and browser effects behind injectable seams:

- domain tests cover pure policy;
- component/controller tests cover state, races, focus, and cleanup;
- Elysia tests inject provider dependencies and exercise the app-owned HTTP boundary;
- Storybook uses typed local doubles and is typechecked/statically built as a review catalog;
- Playwright uses deterministic synthetic media and denies unexpected HTTP/WebSockets;
- live provider and physical-device checks are manual release evidence.

The visual and responsive suites protect all five canonical viewports, one player per Studio visit,
bounded scrolling, accessible actions, source continuity, finalization ordering, and provider-free
local preparation. See [testing strategy](TESTING.md),
[screenshot coverage](screenshot-test-coverage.md), [manual QA](MANUAL_QA.md), and
[live provider smoke](LIVE_PROVIDER_SMOKE.md).
