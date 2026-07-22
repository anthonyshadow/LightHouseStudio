# Architecture and ownership

Lightframe Studio is a strict TypeScript npm workspace with a React browser app, a loopback Fastify broker, pure domain rules, runtime API contracts, and an explicit deny-external test policy. It was organized around product capabilities rather than around a previous implementation.

## Workspace boundaries

| Boundary                     | Responsibility                                                    | Must not own                                |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `packages/domain`            | Pure session, prompt, asset, recording, and voice rules           | React, browser globals, HTTP, provider SDKs |
| `packages/contracts`         | Zod schemas and app-owned request/response types                  | Raw provider response types, secrets        |
| `packages/testing`           | Shared deny-external test policy                                  | Live providers or physical devices          |
| `apps/web/src/features`      | Focused UI and presentation models by capability                  | Permanent credentials, server persistence   |
| `apps/web/src/orchestration` | Async lifecycle coordination and resource handoff                 | Raw provider payload assumptions            |
| `apps/web/src/adapters`      | Browser APIs, same-origin API calls, Decart SDK, audio processing | Product policy decisions                    |
| `apps/api/src/application`   | Transport-neutral server payload types                            | Fastify replies or provider implementations |
| `apps/api/src/features`      | HTTP route validation and application services                    | Browser state, product database             |
| `apps/api/src/providers`     | Decart and ElevenLabs protocol adaptation                         | UI/domain leakage, unsafe upstream errors   |
| `apps/api/src/http`          | Loopback/origin boundary, safe errors, streaming lifetime         | Provider-specific business rules            |

Imports should point inward toward pure rules and contracts. The web app does not import API implementation code, and the API does not know about React.

## Studio shell and presentation ownership

`StudioApp.tsx` is the composition and URL-dispatch boundary. `/` is the sole application route. The dependency-free `resolveLegacyEntry()` helper history-replaces `/advanced`, `/guided`, `/projects`, deprecated queries, and other SPA paths with `/`; project-oriented entries additionally initialize the legacy-project overlay. There is no rollout flag, global client store, or third-party router.

`CharacterBuilderCoordinator` owns character-form state beneath Studio without owning a second media session or creative repository. It restores one active IndexedDB draft, autosaves through revision compare-and-swap, coordinates automatic prompt optimization and immutable preview generation/editing, and journals the caller-owned character ID through durable Shelf persistence and Studio preload. The reusable visual catalog retains nine starters, four presentation profiles, shared skin-tone choices, profile-aware suggestions, and lossless custom values.

`StudioExperience` is the sole runtime composition boundary and owns the session, recording, voice-processing, recipe repository, reactive active-recipe identity, active overlays, and tool drafts. The fullscreen character builder and legacy-project manager are Studio-owned overlays, so opening either cannot unmount streams, the stage, the Dock, or the Shelf.

The shell is deliberately viewport-bound:

- `StudioDesignProvider.tsx` gives `html`, `body`, and `#root` a full viewport size and `overflow: hidden`.
- `StudioApp.styles.ts` uses a viewport-bound application page with `100vh`/`100svh` fallbacks and `100dvh` as the preferred size, plus safe-area padding. Its fixed rows are the header, `minmax(0, 1fr)` stage host, fixed-height capture strip, and tool launcher.
- Every shrinking grid/flex boundary has `min-width: 0` and `min-height: 0`. The document and fixed shell are not scroll owners. Each overlay has one intentional, bounded body scroller with sticky header and primary-action regions.
- Recipe Dock, Capture Settings, Take Review, Voice Treatments, Character Workshop, Recipe Shelf, Character Builder, and Legacy Projects are always portal overlays. None participates in shell columns or rows. The Character Builder is fullscreen at every breakpoint and owns its bounded internal scroller.
- The stage and capture-strip row allocations do not change for mode switches, notices, recording, finalization, playback, or overlay visibility. Recording, review lock, mode changes, and unsafe settings changes remain controlled by the same orchestration state.

`MediaStage` is mounted once in the stable stage region and owns one persistent `<video>` element. A discriminated `StagePresentation` selects idle, live, finalizing, or playback presentation without keying or replacing that node. Live media is attached imperatively with `srcObject`, muted and inline; finalized playback uses `src`, native controls, and audio. The unused source is cleared before each source-kind switch. Finalization retains the last live binding/frame under a blocking stage layer until playback is ready. Opening or closing any tool overlay must not recreate the stage, change its source, alter playback time, or restart a provider controller. Video uses `object-fit: contain`; only local preview is mirrored. Provider output and recorded playback use native orientation, and local video remains the fallback until a transformed live video track is usable.

`OverlayPanel` is the shared portal primitive for drawers, sheets, fullscreen panels, and stacked dialogs. It keeps its backdrop present through the exit transition, intercepts a backdrop-targeted pointer-down before it can click through, and dismisses only the topmost overlay. It locks body overflow, labels the modal, makes the application root and covered dialogs inert/hidden from assistive technology, excludes hidden, disabled, and inert descendants from focus trapping, and centralizes initial/return focus. Its close guard disables Escape and the close button during the atomic part of character Save. Ordinary builder closure first flushes autosave; an unsafe storage failure requires explicit discard.

## Session data flow

1. The user edits a mode-specific `SessionDraft`. `useSessionDraftState` keeps one in-memory draft for Local, Lucy 2.5, and VTON 3. Text and enhancement choices survive idle mode switches independently; the departing mode's `File` and preview URL are always cleared and revoked. Text assets and the structured workshop may be used without media access.
2. Model input is validated before camera access. Local mode needs no AI input.
3. Explicit Start obtains or reuses local media. A model start resolves the selected model's camera requirements only after validation.
4. After healthy local video exists, the browser requests a short-lived credential from the loopback broker.
5. The broker validates Host, an Origin with the exact same loopback host and port, the body, the session profile, and the model allowlist. It then asks Decart for an origin/model-scoped credential with a five-minute connection-start TTL. Studio uses the retained internal `advanced` policy identifier with a five-minute active session; the retired Guided profile remains an internal compatibility contract rather than a UI route.
6. The browser dynamically imports the official Decart SDK and connects a cloned provider-input stream derived from the owned local tracks. Local preview remains independently owned and available as the display fallback until a live transformed video track exists.
7. Start or Apply sends one complete prompt/image/enhancement snapshot. `image: null` is meaningful: it clears provider image state.
8. The last successful snapshot becomes `AppliedRealtimeState`. Further edits stay pending until Apply; Revert restores the working draft.
9. Stop/Reset invalidates the operation generation, aborts the browser token request, disconnects provider resources, and disposes late results. Reset also clears the ephemeral reference and applied state.

Capture preferences are a separate tab-memory controller, not part of a prompt or recipe. The draft/applied pair contains selected camera id, microphone id, and the local `720p30`/`1080p30` target. Device enumeration does not call `getUserMedia`, and no device id is persisted. Apply without a live stream only stages the selection for the next explicit Start. Apply during a local preview acquires and validates a complete replacement stream before committing it and stopping the previous owned stream; on failure the current preview remains active. Source changes are blocked while recording or while AI is starting/live. Model capture dimensions remain provider-required, while the chosen devices still apply.

The guide's Lucy 2.1 character identifier was intentionally superseded by the user's approved `lucy-2.5`. The VTON boundary remains independently selectable and testable as `lucy-vton-3`.

### Character reference prompt pipeline

The Character Workshop keeps three values deliberately separate. The structured workshop recipe is the raw character description and remains editable through its normal fields. A server-only OpenAI Responses API call compiles that recipe plus the selected reference settings into a strict structured result containing an editable image-generation prompt and a compact Lucy 2.5 character-replacement prompt. The image provider receives only the optimized image prompt while optimization is enabled; the Lucy prompt is stored with the immutable asset and becomes the prompt used when that asset is inserted into a session.

The fullscreen builder maps visual selections into the canonical Character draft, including first-class Skin Tone, Body Shape, Hairstyle, and Hair Color fields. Prompt-only Save never calls the optimizer or image endpoint. `Generate Preview` always optimizes the frozen current prompt before generation. Editing any character or output setting keeps the old preview visible but marks it stale, excluding it from Save until regeneration; prompt-only Save remains available.

The optimizer result is keyed to the raw recipe and normalized reference settings. Blank regeneration creates a fresh image and sends no source asset. Written regeneration calls `POST /api/reference-images/:sourceAssetId/edits`; the server resolves owner-scoped source bytes, preserves the immutable parent, and creates a new child asset. Request fingerprints bind owner, operation kind, source, prompt/settings, optimization, and an in-memory change instruction; persisted metadata retains only the instruction hash. Generated-asset handoff hydrates the saved bytes and commits the saved Lucy prompt, image, and `enhance: true` together through the existing atomic realtime snapshot path.

New references default to full-body framing with the complete silhouette and safe margin whenever the character's anatomy permits it. A closer crop remains an explicit workshop choice. The app's target media profile is known landscape 16:9, so the reference `auto` orientation resolves to `1536x1024`; explicit portrait and square choices continue to override it.

## Recording and processing flow

Recording source composition is explicit:

| Session                    | Video                  | Audio                                                |
| -------------------------- | ---------------------- | ---------------------------------------------------- |
| Local                      | Live local camera      | Live local microphone when present                   |
| Model before usable output | Not recordable         | Not applicable                                       |
| Model with usable output   | Live transformed video | Provider audio when live, otherwise local microphone |

`MediaRecorder` receives a new composed stream that references source tracks but does not own or stop them. An audio-only sidecar is recorded at the same time when audio is available. The chosen video and audio track identities are pinned while recording. The take also snapshots mode, start time, source labels, and available track dimensions/frame rate at Start, so later live-source changes cannot rewrite completed metadata. If a selected track ends or a provider callback would change the selected source, the take finalizes first; source recomposition and provider-audio/microphone fallback apply to the next take.

Decart may emit successive `MediaStream` objects that share accumulated track instances as audio and video subscribe independently. Session orchestration retains partial streams without displaying them, promotes only a live-video stream, preserves shared track identities across callbacks, and stops only tracks absent from a true replacement.

Recording orchestration separates the recorder attempt/lifecycle from a focused artifact owner for takes, processing state, unload protection, and object-URL release. Finish is an ordered handoff: duplicate requests are ignored, both recorders are stopped, final `dataavailable`/`stop` events settle within the existing sidecar grace and terminal timeout, and the main Blob, object URL, immutable metadata, and truthful stop duration are published first. Main-video finalization is authoritative: an optional sidecar timeout or failure produces a sidecar warning while preserving valid video. Only after finalization settles does `releaseForRecordedReview()` abort pending work, disconnect provider resources, remove listeners, stop remote/cloned input and owned local tracks, and dispose analysers and timers. Recording borrows source tracks and never stops them itself.

The finalized artifact then replaces live media in the same stage. The app does not fall back to or reacquire local preview, and all new media acquisition, mode/device changes, and recording are locked while a take is under review. Empty output, recorder timeout, or Blob/object-URL failure still releases live resources and returns to private idle with a stage error; if a valid artifact was already published, a later secondary failure cannot remove it from review. Recording stop always settles, including construction and URL-creation exceptions.

Studio owns one temporary take at a time; it does not implement take history, rename, trim, or persistent media save. `Download take` dispatches a browser download but leaves playback active. Because completion is not browser-observable, successful synchronous dispatch only enables `Close take`; Close revokes original and processed URLs and returns to private idle. A failed dispatch leaves review intact. Confirmed Discard performs the same cleanup without download. Until Close or Discard, the persistent main-stage player is the only take player.

The retired Guided IndexedDB repository remains a compatibility boundary for existing project/media records. Studio's Legacy Project Manager can list, download the chosen video variant, and transactionally delete a project with its owned artifacts, but it cannot reopen the retired journey. No legacy media is deleted automatically. On first character-builder initialization, the newest valid `character-design` checkpoint may seed the active builder draft; a migration marker prevents repeated import after reset or completion.

The original video and sidecar are immutable processing sources. Every local or ElevenLabs treatment starts from those originals, never from the currently presented processed result. Local Web Audio effects render offline, then Mediabunny copies encoded video while replacing audio. ElevenLabs conversion sends only the sidecar after explicit Apply and remuxes the returned audio the same way. Processing pauses and locks the existing stage player. A replacement URL is created before the prior processed URL is revoked; success restores the prior time, clamped to the replacement duration, and remains paused. Cancel, failure, or replacement-URL creation failure preserves the last valid playable artifact.

## Creative asset persistence

The Recipe Shelf is behind a repository interface. It treats `localStorage` as untrusted input, validates a schema version, allowlists fields, normalizes records, enforces collection limits, and reports one of three health states:

- `ready`: durable browser storage is available;
- `recovered`: corrupt or outdated records were dropped and the usable subset was repaired;
- `session-only`: storage is unavailable or a write failed, so the in-memory repository continues for this tab.

The v3 payload keeps prompt text, bounded metadata, nullable opaque reference-image asset IDs, the complete canonical character draft, and optional guided-design provenance. Image bytes and content URLs never enter `localStorage`. The strict character-save operation accepts a caller-owned ID, writes sanitized localStorage before publishing repository state, and treats the same ID/payload as an idempotent replay. The builder's separate IndexedDB journal advances from intent through durable character persistence and Studio preload so retry/reload cannot duplicate a character.

Generated character references are the one durable server-owned media type. `ReferenceImageAssetStore` is injectable; the default filesystem implementation writes immutable image bytes, versioned private metadata, and request-id mappings atomically under `LIGHTFRAME_DATA_DIR`. Opaque browser-visible IDs are distinct from internal storage keys. Failed temporary writes are removed, while detached, regenerated, or otherwise unlinked assets are intentionally retained because historical records may still reference them and there is no complete server-side relationship graph.

## Backend boundary

The Fastify server binds to `127.0.0.1` and rejects non-loopback Host headers. Provider mutations—realtime token issuance, public voice import, and voice conversion—also require a canonical loopback `Origin`. Responses use no-store headers.

Permanent provider keys remain in server environment memory. App-owned Zod contracts validate every HTTP boundary, and provider adapters normalize upstream data. Automatic request URL logging is disabled because voice search terms and provider ids are ephemeral user data. Error mapping may retain a numeric upstream status and inspects only bounded allowlisted error-code/parameter fields; it excludes raw bodies/messages, request IDs, provider URLs, keys, temporary credentials, and stack traces. Invalid-audio codes are classified before plan guidance, and zero-retention guidance requires both an exact entitlement code and `param: enable_logging`, so malformed sidecars are never mislabeled as entitlement problems.

The backend remains database-free and single-operator, with no accounts, analytics, jobs, SQL migrations, or session history. It is stateful only for immutable generated-reference assets and their idempotency metadata. Generation requires exact loopback Origin/Host matching; reads require the local owner identity. This keeps the local-first privacy model inspectable, but it is not a public multi-user security design.

## Ownership and cleanup rules

- Session orchestration owns local/remote streams, cloned provider-input tracks, provider client, start abort controller, operation generation, preview URL, live timers, and the single post-finalization `releaseForRecordedReview()` cleanup path.
- The session draft controller owns the per-mode text/enhancement map and a discriminated reference: either an ephemeral manual `File` with an owned object URL or a persisted asset ID with hydrated bytes and a stable content URL. Atomic recipe replacement validates persisted bytes before changing the draft, and stable asset IDs define pending/applied identity.
- Capture preferences own session-only device/profile drafts and negotiated-setting display. Owned local media performs atomic stream replacement; neither recipes nor browser storage receive device ids.
- Recording orchestration owns `MediaRecorder` instances, recording chunks, the audio sidecar, immutable original/processed artifact URLs, download-initiation state, and unload protection.
- The legacy Guided project repository owns allowlisted checkpoint metadata and IndexedDB media Blobs. The Studio manager creates a short-lived object URL only for an explicit download and revokes it immediately after dispatch without deleting durable media.
- Voice processing owns processing abort controllers and temporary Web Audio/remux resources; it never mutates the originals.
- The Recipe Shelf owns serialized text, metadata, and opaque asset relationships, never image bytes or storage keys.
- The reference asset store owns atomic filesystem writes and private metadata. Detach and regeneration only change browser relationships; there is no ordinary delete route, and retained orphan cleanup is an explicit future operator policy.
- The stable stage owns video DOM attachment and audio metering. Modal panels own only presentation/focus state and never own or restart media resources.
- The API owns request abort/timeout wiring and upstream stream closure for the duration of each HTTP request. ElevenLabs fetches receive the abort signal. Decart SDK `0.1.14` token creation does not expose one, so the broker races and discards a late token result but cannot cancel that already-started upstream fetch.

Late async work checks its operation or abort signal before committing. Replaced owned streams and object URLs are disposed; referenced source tracks used for recording are not stopped by recording or processing code. Review cleanup is idempotent and occurs after finalization, while artifact URL cleanup occurs only on processed replacement, Close, Discard, or unmount.

## Deployment assumptions

Development uses two loopback ports with Vite proxying `/api`. A production build is served by Fastify from one origin. `localhost`/loopback is treated as the secure local camera context; non-loopback deployment requires HTTPS plus a separate design for authentication, CSRF, authorization, tenant isolation, rate limiting, provider-cost abuse, observability, and secrets.

## Testing seams

Pure domain functions cover deterministic rules. Recipe and project repositories and the voice-library client are injectable. Reducer tests cover guarded transitions and stable restore; catalog tests cover every presentation profile, shared choices, custom values, and out-of-suggestion preservation; project tests cover revision conflicts, Blob integrity, immutable originals, sanitation, deletion, session-only fallback, retention reporting, and URL cleanup. Fastify provider dependencies and `fetch` are injectable. Browser adapters isolate `MediaStream`, `MediaRecorder`, Web Audio, and Decart SDK effects. Network contracts use app-owned schemas. Vitest replaces both external `fetch` and `WebSocket`; Playwright journeys route-deny external HTTP and WebSockets.

Responsive Playwright coverage uses `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`. In addition to keyboard-only preparation and WCAG A/AA axe checks, the Chromium state matrix traverses Local live/record/finalizing/review, Character live, and VTON live at every exact size. It asserts document/body containment, named overlay scroll ownership, persistent Record/Finish visibility, stage geometry within one CSS pixel, one persistent video/player, source and playback-time continuity across tools, final-data-before-release ordering, and no automatic provider/camera reacquisition. Component tests cover overlay isolation/focus/exit behavior, stage live-to-playback binding and mirroring, capture-preference replacement, reference validation, recording shortcut guards, failure settlement, URL ownership, and session cleanup.

Successful browser journeys use a narrow Vite-development-only realtime driver for synthetic media and provider callbacks. The branch is guarded by `import.meta.env.DEV`. A Vite `generateBundle` guard fails every production build if the seam identifier remains in executable chunks, and production source maps are disabled so the development source is not published indirectly. Default tests therefore cover Local, Lucy 2.5, and VTON 3 without devices, credentials, paid traffic, or a production mock switch.
