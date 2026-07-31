# Architecture and ownership

Lightframe Studio is a TypeScript workspace with a React browser app, a loopback Fastify broker,
pure domain rules, and runtime API contracts. Its design is local-first and single-operator.

## Dependency boundaries

| Boundary                     | Owns                                                              | Must not own                                 |
| ---------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `packages/domain`            | Pure session, prompt, asset, recording, and voice policy          | React, browser APIs, HTTP, provider payloads |
| `packages/contracts`         | Zod HTTP schemas and app-owned request/response types             | Secrets or raw provider types                |
| `apps/web/src/features`      | Capability-focused presentation and local view models             | Permanent credentials or server persistence  |
| `apps/web/src/orchestration` | Async lifecycles, policy sequencing, and resource handoff         | Raw provider assumptions                     |
| `apps/web/src/adapters`      | Browser APIs, same-origin API calls, Decart SDK, audio processing | Product policy                               |
| `apps/api/src/features`      | Route validation and application services                         | Browser state or account data                |
| `apps/api/src/providers`     | Decart, OpenAI, BFL, Wiro, and ElevenLabs protocols               | UI state or unsafe upstream errors           |
| `apps/api/src/http`          | Loopback/origin checks, safe errors, and streaming lifetime       | Provider-specific policy                     |

Imports point inward toward domain rules and contracts. The web app does not import API
implementation code, and the API does not know about React.

## Studio composition

`AppRouter.tsx` is the browser URL boundary. React Router's data browser router renders the
provider-free entry at `/` and lazy-loads Studio at `/studio`; the data-router form is required for
route blocking. It also owns route titles/descriptions, focus handoff, and loading/error surfaces.
Only `/` and `/studio` are registered; every other path returns to `/`. The loopback Vite/Fastify
SPA fallback already serves both paths, and origin-scoped browser storage requires no migration.

The entry does not mount `StudioApp`, request capabilities, acquire media, load Decart, open a
WebSocket, or contact a provider. `StudioApp.tsx` remains the sole runtime composition boundary.
There is no second product shell, media session, global client store, or provider client.

The mounted Studio owns focused controllers for:

- local/realtime media and per-mode drafts;
- recording, review, and voice processing;
- existing-video selection, local inspection, and one mutually exclusive batch transformation;
- Character Builder, Prompt Workshop, and Recipe Shelf handoff;
- overlays and the data-triggered compatibility project manager.

`MediaStage` stays mounted once and owns one `<video>` element. A discriminated presentation state
switches among idle, live, finalizing, and playback. Live media uses `srcObject`; playback uses
`src`. Opening or closing a tool must not replace the player, restart media, alter playback time,
or create a second take player.

All tools use the shared `OverlayPanel` portal. It owns focus trap, inert background, Escape,
topmost dismissal, scroll lock, transition-safe backdrop behavior, and return focus. The portal
follows the active browser fullscreen element. In stage fullscreen, the existing media stage fills
the viewport and the bottom tool and capture rails are hidden. A panel triggered from the stage
still renders above the full-screen video. Each overlay has one named internal scroll region; the
document does not scroll. Character Builder is fullscreen and uses one preview/generation DOM.
Narrow screens reveal that same region through **Review & Generate** instead of duplicating
stateful controls.

`StudioExitGuard` blocks navigation leaving `/studio` while recording or finalization is active.
A temporary take, active Voice process, or dirty Shelf form requires confirmed discard before the
route proceeds. Hard unload receives the matching browser warning, while future navigation among
`/studio/*` children is deliberately exempt so a shared runtime layout can remain mounted.

The shell is viewport-bound with safe-area padding and deliberate support for `1440×960`,
`1280×720`, `834×1112`, `390×844`, and `320×568`. The stage, capture strip, and primary actions
must remain reachable at short heights, touch sizes, and 200% text. Stage notices overlay the
player rather than changing its geometry.

## Session lifecycle

`useStudioSession` coordinates the session; pure domain rules decide valid modes and transitions.
The three modes are Local, `lucy-2.5`, and pinned `lucy-vton-3`.

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
permission and device IDs are not persisted. Apply during local preview performs atomic stream
replacement. Source changes are blocked while AI or recording owns the source. Facing-mode and
track zoom controls appear only when the active camera exposes those capabilities.

## Character and recipe ownership

Character Builder exclusively owns character create/edit, its resumable IndexedDB draft,
reference upload, prompt optimization, image generation/edit/composition, durable save journal,
and Shelf persistence. Its completion handoff is destination-specific: general Studio entry
atomically preloads the Lucy Dock, while uploaded-video entry hydrates and selects the saved
character in the originating unsubmitted Swap Character step.

Prompt Workshop owns only Add, Replace, and Restyle structured object recipes. Recipe Shelf owns
saved/recent/character metadata and atomic reuse. Neither owns Character generation or a media
session.

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

Recording orchestration owns the `MediaRecorder` instances, chunks, optional audio sidecar,
warning/cap timer, MediaBunny conversion, and finalization:

- warn accessibly at 270 seconds;
- route the 300-second cap and manual Stop through one coalesced path;
- settle final recorder data and the optional sidecar before releasing live resources;
- force the settled main video through an on-device H.264/AAC MP4 conversion;
- publish only the converted MP4, never the raw recorder container, even when the sidecar fails;
- cancel conversion and withhold the download artifact if ownership ends or a required track would
  be dropped; and
- release local/provider resources only after finalization settles.

MediaBunny uses the browser's AVC/H.264 WebCodecs encoder and its official AAC encoder extension
when native AAC encoding is unavailable. The conversion keeps the raw recorder Blob private to
finalization and creates the artifact URL only after a complete MP4 exists. Review, Voice, and
Download therefore remain unavailable while transcoding.

Recorded and uploaded media publish through one artifact boundary:

`immutable source → latest successful visual → optional voiced layer → presented artifact`.

The finalized or validated source replaces live media on the same persistent stage. The artifact
owner creates and revokes every source/visual/voice URL. Changing source invalidates downstream
layers; restoring Original voice removes only the voice layer and returns to the latest visual.
Every Voice treatment reads immutable source audio and remuxes it onto `visual ?? source`.
Existing-video comparison selects the immutable source or visual result for presentation without
changing artifact ownership. Its source-preserving Start over revokes the visual and optional
voice layers, retains the source, and returns presentation to that source.

The existing-video controller uses Mediabunny plus browser decode confirmation for an early check.
The API streams bytes to generated private paths and performs authoritative
container/track/codec/duration/aspect/size inspection before Decart contact. One app job runs at a
time. An uploaded workflow can switch its single active choice between Lucy and VTO before
submission, and only that active model is submitted.

## Persistence

| Store                       | Data                                                                  | Lifetime and trust boundary                                                                                                    |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Recipe Shelf `localStorage` | Versioned, allowlisted prompt/character metadata and opaque asset IDs | Sanitized on read; degrades to session memory on failure; never stores image bytes                                             |
| Character Builder IndexedDB | One resumable draft and save journal                                  | Compare-and-swap autosave; prevents duplicate save/preload after retry or reload                                               |
| Reference asset filesystem  | Immutable image bytes, private metadata, idempotency mappings         | Owner-scoped under `LIGHTFRAME_DATA_DIR`; no ordinary deletion route                                                           |
| Legacy project IndexedDB    | Compatibility project metadata and media Blobs                        | List/download/delete plus one-time valid character-design seeding; Guided is not restored                                      |
| Session memory              | Streams, tokens, files, device IDs, recordings, sidecars, voice state | Cleaned on replacement, release/discard, unmount, or tab close as applicable                                                   |
| Video-job temp root         | Streamed input/reference and inspected provider output                | Process-temporary; inputs drop after acceptance, output after delivery, jobs expire at 60 minutes, and startup purges the root |

Browser storage is untrusted and schema-migrated. Opaque IDs, provenance, and timestamps are
preserved. The filesystem store uses atomic publication and never exposes internal paths,
provider URLs, credentials, or raw payloads. Detached reference assets are retained because the
runtime lacks a complete relationship graph and deletion route.

See [privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md) for the user-facing data contract.

## Backend boundary

Fastify binds to `127.0.0.1`, rejects non-loopback Host headers, and requires exact loopback Origin
checks for provider or reference mutations. Browsers may omit `Origin` on same-origin `GET`
requests, so provider reads accept an exact loopback `Origin` or referrer, or browser
`Sec-Fetch-Site: same-origin`; their explicit provider-intent header remains mandatory. ElevenLabs
provider-contact routes require `X-Lightframe-Provider-Intent: voice`; Decart batch routes require
`X-Lightframe-Provider-Intent: video`. Responses are `no-store`.

Permanent keys remain in server environment memory. App-owned schemas validate every HTTP
boundary. Provider adapters normalize upstream data into allowlisted safe codes; raw messages,
bodies, URLs, prompts, credentials, causes, and arbitrary codes never reach clients or logs.

`PILOT_ACCESS_MODE=participant` server-disables Wiro even when configured. The separate
`operator-qualification` mode is required for technical Wiro evidence with no participant
present. This is an access boundary, not provider fallback.

| Boundary                    | Routes                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local status                | `GET /api/health`, `GET /api/capabilities`                                                                                                                                       |
| Decart                      | `POST /api/realtime-token`                                                                                                                                                       |
| Decart batch video          | `PUT /api/video-jobs/:jobId`, `GET /api/video-jobs/:jobId`, `GET /api/video-jobs/:jobId/content`, `DELETE /api/video-jobs/:jobId`                                                |
| Reference optimization/work | `POST /api/reference-images/optimize`, `POST /api/reference-images`, `POST /api/reference-images/:sourceAssetId/edits`, `POST /api/reference-images/:sourceAssetId/compositions` |
| Local reference storage     | `POST /api/reference-images/uploads`, `GET /api/reference-images/:assetId`, `GET /api/reference-images/:assetId/content`                                                         |
| ElevenLabs                  | `GET /api/elevenlabs/voices`, `GET /api/elevenlabs/voices/:voiceId/preview`, `POST /api/elevenlabs/voice-changer/recording`                                                      |

Capabilities report configuration presence only. The backend has process-local temporary video
jobs but no accounts, analytics, durable job database or queue, SQL database, or session history.
Host-derived owner IDs are a local namespace, not identity.

## Resource ownership

The creator of a resource owns idempotent cleanup.

| Owner                 | Resources                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Session orchestration | Owned local/remote streams, cloned provider input, provider client, token abort, active-session clock                   |
| Session draft         | Ephemeral files and preview object URLs                                                                                 |
| Recording/review      | Recorders, chunks, conversion abort, immutable source/sidecar, visual/voice artifact URLs, cap timer, unload protection |
| Existing-video flow   | Validation generations, one ephemeral visual draft, provider polling/download                                           |
| Voice processing      | Abort controllers, Web Audio/Mediabunny resources, temporary processed URLs                                             |
| Media stage           | DOM media attachment and control-visibility timer                                                                       |
| Overlay               | Focus/inert/scroll state only; never media                                                                              |
| API request/service   | Request abort, upstream streams, shared-operation subscribers, provider deadline                                        |
| Video-job service     | In-memory owner/job map, exact-once submission, private temp paths, expiry and result cleanup                           |
| Reference store       | Atomic files, metadata, request mappings, conservative temporary cleanup                                                |

Late async results check their generation or abort state before commit. A healthy replacement
commits before the previous owned resource is released. Duplicate Stop coalesces. Recording only
borrows source tracks.

## Deployment and tests

Development uses Vite on `127.0.0.1:4173` and the API on `127.0.0.1:4100`. Production mode serves
the built client and API from Fastify on one loopback origin. There is no supported public
deployment, authentication, tenancy, billing, infrastructure automation, backup, remote
observability, or asset garbage collection.

Tests keep provider and browser effects behind injectable seams:

- domain tests cover pure policy;
- component/controller tests cover state, races, focus, and cleanup;
- Fastify tests inject provider dependencies and fetch;
- Storybook uses typed local doubles and is typechecked/statically built as a review catalog;
- Playwright uses deterministic synthetic media and denies unexpected HTTP/WebSockets;
- live provider and physical-device checks are manual release evidence.

The visual and responsive suites protect all five canonical viewports, one persistent player,
bounded scrolling, accessible actions, source continuity, finalization ordering, and provider-free
local preparation. See [testing strategy](TESTING.md),
[screenshot coverage](screenshot-test-coverage.md), [manual QA](MANUAL_QA.md), and
[live provider smoke](LIVE_PROVIDER_SMOKE.md).
