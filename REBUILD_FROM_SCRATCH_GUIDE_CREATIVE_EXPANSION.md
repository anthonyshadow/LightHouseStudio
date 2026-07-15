# Rebuild From Scratch Guide
> Last updated: 2026-07-14

## Purpose

This document is the sole prompt for rebuilding the product in a completely empty project directory. Recreate the product's essential capabilities and behavioral guarantees, but do not copy any prior implementation, architecture, file structure, UI, UX, flow, styling, or source code.

Build a fresh, complete TypeScript application. Treat the requirements below as the product contract while retaining freedom to choose a better greenfield architecture and a new, polished experience.

## Product Essence

Build a local-first browser webcam studio for solo creators, presenters, streamers, and teams experimenting with realtime AI video. It should let one local user:

- preview and record an ordinary webcam and microphone session;
- transform a live camera feed into a prompted character or visual style with Decart Lucy 2.1;
- perform realtime virtual garment try-on with Decart Lucy VTON 3;
- update model instructions and reference imagery during a live session;
- record either the local or transformed result in the browser;
- optionally apply a browser-local or ElevenLabs voice effect to a completed recording; and
- download the latest clip before its temporary browser artifact is lost.

This is a focused creation and recording tool, not a livestream distribution platform or cloud media service by default. Its essential identity is a local-first creative webcam studio with realtime AI video, recording, prompt assets, and optional post-recording voice effects. Preserve that identity, but do not treat the prior app as a parity ceiling. Purposeful, scoped additions are allowed when they close real gaps, improve the creative workflow, strengthen reliability/privacy, or make the product more useful and memorable.

## Product Evolution and Missing-Flow Freedom

This document defines the minimum product contract, not the maximum possible product. The rebuilding agent should not perform a literal parity clone. While building, actively look for missing, awkward, underpowered, or incomplete capabilities and improve them when the improvement is coherent with the product.

The agent may:

- redesign flows end-to-end rather than replicate old sequences;
- add new features, modes, shortcuts, helpers, safety rails, onboarding moments, preview/review tools, asset organization, recovery flows, browser-local take management, or quality-of-life capabilities when they make the product more useful;
- simplify, merge, or replace existing flow concepts when a better product design preserves the underlying capability;
- choose different technical implementations, state models, API boundaries, and interaction patterns where better.

The agent should add or change something when:

- it removes friction from a required capability;
- it closes an obvious user need or missing product step;
- it makes privacy, consent, reliability, debugging, or recoverability stronger;
- it makes creation more fun, memorable, or polished without adding clutter;
- it can be implemented cleanly with small reusable modules and tests.

The agent should not add something when:

- it turns the local-first creator tool into a different product category without a deliberate written rationale;
- it requires permanent cloud storage, accounts, collaboration, social publishing, analytics, payments, or remote hosting without an explicit security and product design;
- it adds provider cost or sensitive-data exposure without explicit consent and clear boundaries;
- it exists only because it is easy, trendy, or superficially related.

The agent does not need to ask permission before improving a weak or missing flow. Use judgment. For each meaningful addition or changed flow, document the rationale in the project README or implementation notes: what user problem it solves, why it fits this product, how it remains scoped, and what tests or acceptance criteria cover it.

## Core Capabilities

### Session and media modes

- Support at least these three baseline session capabilities:
  - `local`: webcam and microphone preview with no Decart activity.
  - `lucy-2.1`: realtime character and style transformation using prompt text, a reference portrait, or both.
  - `lucy-vton-3`: realtime garment try-on using a garment prompt, garment image, or both.
- Use local camera as the safe default session capability.
- Keep local camera mode conceptually separate from provider model identifiers. Never send `local` to the Decart token or model APIs.
- Keep the required character transformation and virtual try-on baseline modes independently usable and testable. A new combined or experimental flow is allowed only as an additive, clearly justified enhancement that preserves explicit consent, provider-cost visibility, and the reliability of the required separate modes.
- Request camera and microphone access only after explicit user intent to start.
- For local capture, prefer the user-facing camera with adaptable ideal constraints around 1280x720 at 30 fps plus microphone audio; do not make those ideals hard device requirements.
- Allow model-session preparation, prompt generation, and text-asset management without opening the camera or consuming provider resources.
- Expose meaningful lifecycle states such as idle, requesting media, requesting a token, connecting, connected, generating, reconnecting, disconnected, and error.
- Allow users to start, stop, reset, and—during an eligible model session—explicitly apply pending changes.
- Track elapsed live-session and recording time independently.

### Realtime AI transformation

- A model-backed session requires a nonempty prompt, an image, or both. Reject an empty model draft before camera access, token issuance, or provider connection.
- Prompt enhancement is optional and disabled by default.
- Resolve the chosen model's required camera dimensions and frame rate, while also acquiring microphone audio for recordings.
- Obtain a short-lived, model-scoped browser credential from the backend and connect the local stream through the official Decart realtime browser integration.
- Keep local camera output available as fallback until transformed output contains a live video track. Audio-only, absent, or ended provider output is not usable transformed video.
- Treat prompt, image, and enhancement edits as a draft. Draft edits—including inserting saved or generated text—must not reach Decart until the user explicitly starts or applies.
- Send live updates as one atomic state snapshot because Decart's realtime state replacement semantics can clear omitted values.
- If the user removed an image, a full Apply must explicitly clear stale provider image state.
- For Lucy 2.1 image-only input, add the functional character-substitution instruction needed to use the portrait. For VTON image-only input, send the garment image without inventing prompt text.
- Reset must clear the current draft, selected image, pending-change state, and active provider image state. It must also invalidate any in-flight start so late asynchronous work cannot connect stale state.

### Structured character prompt creation

- In the character mode, support both free-form prompts and a structured prompt authoring capability.
- Support four authoring intents:
  - transform a character;
  - add one object at a specific placement;
  - replace one named visible object with a described replacement;
  - change an object's color, material, texture, finish, style, or similar attribute.
- Character descriptions may compose intentionally chosen details such as an adult character/base, reference matching, appearance, hair, outfit, accessories, expression, mood, details to preserve, and optional custom constraints.
- Starter presets are useful but their exact contents are not a product invariant. Do not introduce hidden trait defaults.
- Generated prompt text must be concise, normalized, based only on visible user choices, and omit empty fields.
- Applying generated text updates only the current session draft. It must not request media, start a model, or silently update a live model.
- Preserve enough structured draft data for a saved character prompt to be reopened and edited later.

### Images

- Accept JPEG, PNG, and WebP inputs.
- Accept files up to and including 10 MiB; recommend files below 5 MiB for realtime responsiveness.
- A character reference should support clear portrait-oriented identity guidance.
- A VTON reference should support a clearly visible garment, preferably on a simple background and with useful resolution.
- Show an in-session preview and allow the image to be cleared.
- Uploaded images are ephemeral. Never persist portraits, garments, generated object URLs, or image data in browser durable storage or on the backend.

### Browser-local creative assets

- Persist reusable text assets in a versioned, browser-local store behind a repository interface.
- Let users create, search, use, edit, rename, and delete model-scoped saved prompts.
- Record recent nonempty prompts only after a successful model Start or live Apply, not while typing.
- Let users save generated character prompt text as named character-prompt assets with editable metadata and restorable structured-generator state.
- Make it unambiguous in the data model that a saved character prompt does not include an uploaded or generated portrait.
- Reusing any asset changes only the current draft. It never starts media, issues a token, connects WebRTC, or applies a live update.
- If durable browser storage is corrupt or unavailable, recover safely and keep the library usable in memory for the current tab.

### Browser recording

- Record with browser capabilities such as `MediaRecorder`, using runtime feature detection.
- Support a recording lifecycle equivalent to idle, ready, recording, stopping, recorded, and error.
- Record local sessions from local video plus local microphone audio.
- Record model sessions from live transformed video. Prefer provider output audio when present; otherwise use the local microphone.
- Do not enable model recording until transformed output has a live video track.
- Record the selected source stream only; application controls and overlays are not part of the clip.
- Detect a suitable supported MIME type, with WebM variants preferred where available and MP4 fallbacks where supported. Allow the browser default when necessary.
- Produce a temporary recording artifact with its Blob, object URL, MIME type, mode-aware timestamped filename, duration, and size.
- Let users play, download, retain for the current tab, confirm discard, and start another take.
- Starting another take replaces the previous artifact and revokes its object URL. Confirmed discard clears the artifact without stopping an otherwise active live session.
- A local recording stop finalizes the clip while local media remains live.
- A model recording stop finalizes the clip first, then disconnects the model to stop provider usage and returns to local preview. Reuse the existing healthy local input stream; request a new one only when necessary.
- A completed clip must survive model release and full session stop until discard, replacement, or unmount.
- Clips are browser-memory artifacts only and do not survive refresh or tab closure.

### Post-recording voice effects

- Voice effects exist only for completed clips; they never alter the live stream or Decart session.
- Offer mutually exclusive choices:
  - no effect;
  - browser-local effects equivalent to a warm studio treatment, clear presenter treatment, and stylized robot treatment;
  - ElevenLabs speech-to-speech conversion.
- Capture an audio-only sidecar from the already selected recordable audio whenever a recording begins and audio is available. The sidecar must not request media or own source tracks.
- Preserve the original video and original sidecar as immutable sources. Every new effect must be rendered from those originals, never from an already processed clip.
- No effect immediately restores the original clip without a network request.
- Local effects process audio entirely in the browser and remux it with the original video.
- ElevenLabs conversion sends only the completed sidecar, only after explicit Apply, through a same-origin backend proxy. Browsing or selecting a voice must not start conversion.
- Support searchable, paginated workspace voices and eligible public voices, server-proxied previews, and importing a public voice into the configured workspace before selection.
- Replace playback and download with a processed artifact only after processing succeeds. During processing, prevent actions that would use an incomplete result. A failed replacement must leave the original or last successful clip recoverable.
- Do not persist voice selections, audio sidecars, provider audio, or processed clips.
- ElevenLabs is optional. Missing configuration must disable only that capability, not local sessions, recording, or local voice effects.

### Reliability and privacy

- Clean up provider clients, media tracks, recorder listeners, generated streams, audio contexts, timers, and object URLs according to clear ownership rules.
- Stop late media streams and disconnect late provider clients created by superseded requests.
- Distinguish expected cleanup from unexpected camera, microphone, or remote-track termination.
- Present actionable, sanitized errors without raw provider payloads, stack traces, keys, or tokens.
- Keep all permanent integration credentials server-only.

## User Roles and Permissions

There are no application accounts or explicit user roles. The product has one local operator using one browser profile.

- The local operator may configure sessions, grant browser media permissions, manage browser-local text assets, record, process, and download a clip.
- Browser camera and microphone permissions are the only end-user permission boundary.
- Browser-local assets belong implicitly to the current browser profile and are not synced.
- The backend is a trusted local integration broker, not an admin application. It may hold provider credentials and issue narrowly scoped temporary access.
- There are no ownership-sharing, organization, moderation, or admin rules to invent.

If the rebuilt product is ever hosted for multiple users, authentication, authorization, CSRF protection, abuse controls, and tenant isolation require a separate product and security design. They are not part of this rebuild.

## Domain Model

Use strong TypeScript types and runtime schemas at trust boundaries. Names may differ, but represent these concepts explicitly.

### Session mode and draft

- **SessionMode**: stable id, kind (`local` or `model`), optional provider model id, input semantics, and model-specific behavior.
- **SessionDraft**: selected mode, normalized prompt, ephemeral image file or null, and enhancement flag.
- Switching modes before start creates a clean mode-specific draft so prompt, image, and enhancement state cannot leak between models.
- The user cannot manually switch modes while a session is connecting, live, or recording. The system may perform the required model-to-local transition after a model recording has finalized.

### Live session

- **LiveSession**: active mode, lifecycle status, safe error, local input stream, optional usable model output stream, recordable stream metadata, connection/apply flags, and elapsed time.
- **AppliedRealtimeState**: the last successfully sent prompt, image identity, and enhancement flag, used to detect pending draft changes.
- The usable display/recording model stream must contain live video; local video remains the fallback otherwise.

### Structured character prompt

- **PromptIntent**: character transform, add object, replace object, or change attribute.
- **PromptBuilderDraft**: intent plus its structured fields, custom details, visible selections, and optional preset reference.
- **PromptValidation**: blocking issues and advisory warnings.
- Blocking rules:
  - character transform requires at least one meaningful character detail;
  - add object requires object description and placement;
  - replace object requires the existing target and replacement description;
  - change attribute requires the target and new value.
- Advisory guidance should cover generic or multi-goal prompts, contradictory traits, reference-dependent text without an image, and weak reference-image dimensions/aspect ratio.
- Keep structured age choices adult-oriented; do not generate minor descriptors or numeric ages below 18.
- Cap free-form builder details at a reasonable bound such as 500 characters.

### Creative asset store

- **CreativeAssetStore**: schema version, saved prompts, recent prompts, and saved character prompts.
- **SavedPrompt**: id, title, normalized prompt, model mode, manual/generated source, tags, created/updated/last-used timestamps, and use count.
- **RecentPrompt**: id, normalized prompt, model mode, optional saved-prompt id, and used timestamp.
- **SavedCharacterPrompt**: id, name, normalized prompt, manual/generator source, prompt intent, optional structured builder state and restorable draft, reference-image status, notes, tags, timestamps, and use count.
- Reference-image status should distinguish prompt-only, portrait required but not saved, and current-session portrait not saved.
- Search is case-insensitive across useful text metadata.
- Deduplicate recent prompts by mode plus case-insensitive, whitespace-normalized prompt; keep the latest use.
- A recent prompt matching a saved prompt in the same mode increments that saved asset's use count and last-used time.
- Deleting a saved prompt retains recent text while removing its optional relationship.
- Bound collections to 100 saved prompts, 30 recent prompts, and 50 saved character prompts. Normalize, deduplicate, and cap tags at 12.
- Require useful asset names in editing flows; cap names around 80 characters and character notes around 220 characters.
- Sanitize persisted data with allowlisted fields; discard empty/invalid records and unknown sensitive fields.
- Represent storage health as ready, recovered, or session-only.

### Recording and voice processing

- **RecordingArtifact**: lifecycle state, original Blob/object URL, MIME type, filename, source session mode, start time, duration, and size.
- **RecordingAudioSidecar**: state, audio Blob, and safe error; it is tied to the original recording attempt.
- **VoiceEffectSelection**: none, local effect id, or ElevenLabs voice id/name.
- **VoiceProcessingState**: idle, processing, ready, or error, with original and optional processed artifacts kept separate.
- **VoiceSummary**: provider voice id, name, category, description, labels, and preview availability. A public voice also needs its public-owner id.
- There is at most one current recording artifact. None of the recording or voice entities are durable.

### Persistence relationships

- Durable browser storage contains only sanitized creative text assets and metadata.
- Images, media streams, device ids, temporary tokens, recordings, object URLs, sidecars, voice selections, and generated audio/video must remain ephemeral.
- The backend has no product database, migrations, media store, or session history.

## Key Workflows as Capabilities

- A user can start and stop a local camera/microphone session without any Decart import, token request, SDK connection, or external Decart network traffic.
- A user can prepare a character or try-on draft, then explicitly start its supported model after supplying a prompt, image, or both.
- A user can edit a live model draft and explicitly apply the entire intended state without reconnecting. Saved/generated text insertion remains pending until Apply.
- A user can clear or reset model state without stale images or late async starts surviving.
- A user can generate a structured character prompt, validate it, place it in the working draft, save it as a text asset, and reopen the structured draft later.
- A user can save, search, edit, delete, and reuse prompt assets without starting media or consuming provider resources.
- A user can record local media immediately after it is ready, and model output only after transformed video is usable.
- A user can stop a model recording, retain the finalized clip, end model usage, and continue with a local preview.
- A user can review, download, retain temporarily, replace, or confirm discard of the latest clip.
- A user can restore the original audio, apply a local effect, or browse/preview/select/import/apply an eligible ElevenLabs voice after recording.
- The system validates input and exposes recoverable media, provider, storage, recording, and processing failures without losing a valid clip.

## Backend Requirements

Implement a small TypeScript backend that separates HTTP transport, runtime validation, application services, provider adapters, configuration, and safe error translation. It may use any appropriate TypeScript runtime/framework.

### Suggested API boundaries

| Capability | Suggested API | Essential behavior |
| --- | --- | --- |
| Health | `GET /api/health` | Return `{ "ok": true }` for local startup and tests. |
| Realtime credential | `POST /api/realtime-token` | Accept optional `{ model }`, default an omitted model to `lucy-2.1`, allowlist the two supported model ids, and return a short-lived scoped credential. |
| Workspace voices | `GET /api/elevenlabs/voices` | Support trimmed search, a page size capped at 10, and opaque next-page tokens. |
| Workspace preview | `GET /api/elevenlabs/voices/:voiceId/preview` | Resolve and stream preview audio without exposing upstream URLs. |
| Public voices | `GET /api/elevenlabs/shared-voices` | Support trimmed search, zero-based numeric pages, and a page size capped at 10. |
| Public preview | `GET /api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/preview` | Verify eligibility and proxy preview audio. |
| Public import | `POST /api/elevenlabs/shared-voices/import` | Require name, public-owner id, and voice id; return the imported workspace voice id. |
| Recorded conversion | `POST /api/elevenlabs/voice-changer/recording?voiceId=...` | Accept a completed audio sidecar up to 25 MiB and stream converted audio. |

Route names may change if the replacement boundary is clearer, but preserve these capabilities. A live/chunk voice-conversion endpoint is not needed for product parity; voice conversion in this product is post-recording only.

### Decart integration

- Keep `DECART_API_KEY` on the server. Never expose it through build-time frontend variables.
- Issue credentials scoped to exactly the requested supported model and configured application origin.
- Use short expiry and maximum session duration constraints; five minutes for each is a suitable parity target unless deliberately tightened.
- Return a nonempty temporary `apiKey` and `expiresAt`, plus only safe optional metadata such as permissions and constraints. The frontend should still send the model explicitly.
- Return a validation error for unsupported models and sanitized server errors for issuance failures.
- Never log permanent credentials or temporary client credentials.
- Use no-store semantics for token responses and requests where applicable.

### ElevenLabs integration

- Keep `ELEVENLABS_API_KEY` on the server; the browser calls only same-origin APIs.
- Normalize provider payloads into app-owned response types.
- Proxy previews rather than exposing provider URLs.
- Filter out professional voices when the configured speech-to-speech model cannot serve them.
- Expose only public voices explicitly marked eligible for free users, then apply the same model-compatibility filter.
- Because filtering occurs after an upstream query, do not claim an inaccurate filtered total; use an unknown/null total where necessary.
- Before conversion, validate a nonempty voice id, supported content type, nonempty audio, payload limit, configured model availability, voice-conversion support, and voice/model compatibility.
- Stream audio with no-store cache controls and propagate client aborts/timeouts to upstream work.
- Missing ElevenLabs configuration returns a sanitized optional-feature-unavailable response such as `503`.
- Invalid input returns a consistent `400` or normalized payload-too-large response. Sanitized upstream failure uses a gateway error such as `502` and may include only a numeric upstream status.
- Map authentication, policy, billing/plan, quota/rate-limit, missing voice, incompatible model, invalid audio, and provider outage failures to safe actionable messages.
- Never expose raw upstream response bodies, stack traces, API keys, or provider preview URLs.

### General backend behavior

- Serve frontend and API on the same origin or provide an equally secure boundary.
- Provide a secure local context suitable for camera/WebRTC development; the exact HTTP/HTTPS server arrangement is open.
- Bind to loopback interfaces by default for this local product, and validate Host/Origin on token issuance, voice import, and voice conversion. Any remote-access mode requires an explicit authentication, CSRF, rate-limit, and network-exposure design.
- Validate environment configuration and every body, query, and path parameter at runtime.
- Return consistent JSON for unknown API routes and parser errors; do not let API misses fall through to an SPA response.
- Add request timeouts, abort handling, and safe streaming cleanup.
- Restrict provider-supplied preview URLs before server-side fetching.
- There are no background jobs, scheduled tasks, database migrations, or product persistence requirements.
- If exposed beyond localhost, add security headers, origin policy, CSRF analysis, rate limiting for expensive endpoints, secret management, observability without sensitive data, and provider-cost/abuse controls.

## Frontend Requirements

Build a new responsive client without copying any former interface or journey. The frontend must:

- provide all session, prompt, asset, recording, review, and voice capabilities described above;
- separate draft state from last-applied realtime state;
- use explicit, typed state machines or similarly clear lifecycle models for media, model connection, recording, sidecar capture, voice libraries, and processing;
- keep browser API ownership clear so recording and post-processing never stop camera/model tracks they do not own;
- guard asynchronous starts with cancellation or generation ids and safely dispose late results;
- validate model input and image files before requesting media or provider resources;
- handle local media, transformed media, and recording source selection predictably;
- persist only versioned, sanitized text assets through a repository abstraction;
- feature-detect `getUserMedia`, `MediaRecorder`, MIME support, Web Audio, offline audio rendering, and any chosen remuxing APIs;
- expose loading, empty, pending, disconnected, reconnecting, unavailable, success, and recoverable error states;
- tell users when a clip or image is temporary and when ElevenLabs may receive audio/use credits;
- keep expensive/provider actions explicit; and
- clean up all streams, listeners, timers, contexts, generated URLs, and temporary artifacts on replacement, reset, stop, and unmount.

The UI implementation and user journey are intentionally unspecified. Design them from first principles around clarity, consent, trust, and fast creative iteration.

## Technology Constraints

- Use TypeScript throughout the frontend, backend, tests, scripts, and shared packages.
- React is allowed and is a strong fit. TanStack tools are allowed where they simplify routing, querying, forms, or state, but they are not mandatory.
- The backend must be TypeScript; its framework and runtime are open.
- Use Emotion CSS for all application styling. Do not substitute Tailwind, CSS Modules, styled-components, or another styling system.
- Emotion styles should use function consts as style names/patterns.
- Name Emotion styles with focused function constants, for example patterns such as `const rootStyles = (theme) => ...` and `const stateStyles = (state, theme) => ...`. Avoid anonymous piles of inline styling.
- Make the app responsive across mobile, tablet, laptop, desktop, and large screens.
- Use strict TypeScript settings and runtime validation at network, storage, environment, and file boundaries.
- Prefer the official Decart JavaScript SDK or another officially supported browser path that preserves direct realtime WebRTC behavior. Provider SDK/API versions should be verified when building.
- Browser-native `MediaRecorder`, Web Audio, and related media APIs are appropriate, but the exact recording/remux implementation is open.
- Use npm with a lockfile unless the empty environment gives a compelling reason otherwise.
- Do not require any former frontend, backend, or test library merely because it was used before.
- Keep components and modules small, reusable, focused, and strongly typed.

## Architecture Principles for the Rebuild

> The new architecture should not copy the old architecture. It should be thoughtfully redesigned, with project organization treated as a first-class requirement.

- Begin with clear domain boundaries: session/media, realtime provider, prompt authoring, creative assets, recording, voice processing, and backend integrations.
- Separate pure business rules from React components, browser effects, HTTP routes, and provider SDK adapters.
- Keep frontend presentation, orchestration, browser media ownership, persistence, and API access independently testable.
- Keep backend transport, validation, services, provider clients, and error mapping separate.
- Define shared request/response schemas and stable domain types without coupling the browser to provider payloads.
- Prefer composition over large monolithic implementations.
- Avoid bloated files and giant components. Split logic into small reusable hooks, utilities, services, and components, each focused on one responsibility.
- Do not add abstractions merely for abstraction's sake. Every module must have a clear reason to exist.
- Make ownership explicit: the creator of a stream, recorder, timer, object URL, or audio context is responsible for its cleanup.
- Keep data flow predictable. Make draft, active, applied, original-artifact, and processed-artifact state visibly distinct.
- Keep provider adapters replaceable and injectable so tests can use fakes without live services.
- Use feature-oriented naming, colocate close tests when useful, and prevent generic dumping-ground folders.
- Enforce boundaries with lint rules, type-only contracts, or dependency conventions where practical.
- Document intentional tradeoffs and update the guide/readme when behavior changes.

## Suggested Project Shape

A lean workspace is a reasonable greenfield option:

```text
apps/
  web/          browser application and browser-only media orchestration
  api/          TypeScript HTTP server and provider proxies
packages/
  domain/       pure domain types, state transitions, validation, and rules
  contracts/    runtime schemas and API request/response types
  config/       shared TypeScript, lint, test, and build configuration
  testing/      deterministic media/provider fakes and test helpers
```

Within each app, organize by capability rather than by an imitation of the old source tree. For example, media-session, realtime-video, prompt-authoring, creative-assets, recording, voice-effects, and provider integrations can each expose a small public boundary.

This shape is a suggestion, not a mandate. A well-organized single-package project is also acceptable if it maintains the same separation. Optimize for discoverability, ownership, small files, clear imports, and future extension—not the number of folders.

## Suggested Greenfield Build Plan

1. Choose and initialize a strict TypeScript workspace, npm scripts, lockfile, linting, formatting, typechecking, test runners, and build/preview commands.
2. Establish separate frontend, backend, shared domain/contracts, configuration, and testing boundaries. Add safe environment loading without real values.
3. Define session modes, lifecycle states, drafts, creative assets, recordings, voice effects, API contracts, and runtime validation schemas as provider-independent domain concepts.
4. Perform a product-evolution pass before locking the build shape: identify missing, awkward, weak, or incomplete flows; decide which purposeful additions or redesigned flows will make the product better; document the rationale and scope guardrails.
5. Implement the versioned browser-local creative asset repository, sanitation, caps, search, deduplication, recovery, and pure structured-prompt builder/validation logic.
6. Implement backend health, Decart token issuance, and ElevenLabs provider adapters/routes with validation, secret isolation, normalized types, safe errors, streaming cleanup, and injectable fakes.
7. Implement browser media acquisition and cleanup, then local-session behavior. Prove with tests that local mode never imports, requests, or connects Decart.
8. Add the two independent model-backed sessions, short-lived token flow, local fallback, remote-video gating, connection events, atomic Apply, Reset, cancellation, and track cleanup.
9. Build the redesigned responsive UI using Emotion CSS and named function-const style patterns. Make every state and action accessible without inheriting any former layout or flow.
10. Implement any chosen purposeful improvements from the product-evolution pass, keeping them scoped, tested, privacy-aware, and consistent with the local-first creative studio identity.
11. Implement recordable stream composition, recording state, Blob/object-URL lifecycle, metadata, playback/download, confirmed discard, new-take replacement, and model release after finalization.
12. Add sidecar capture, the three browser-local audio treatments, immutable-original processing, browser remuxing, and feature-detected failure handling.
13. Add ElevenLabs voice search/paging, preview proxying, eligible public voice import, explicit recorded-audio conversion, compatibility checks, and recoverable processing behavior.
14. Add unit, API, component, integration, end-to-end, accessibility, and responsive tests with deterministic media/provider mocks and external-network guards.
15. Add concise setup, environment, privacy, temporary-storage, provider-cost, browser-support, product-rationale, and manual QA documentation.
16. Run the full quality suite and manually verify real browser media/provider behavior where credentials and devices are available, then check every acceptance criterion below.

This order is implementation-guiding, not implementation-locking. Keep vertical slices runnable and tested; adjust sequencing when it produces a cleaner design. If a better feature or flow emerges during implementation, make the improvement when it is clearly useful, bounded, and testable.

## Creative Direction

Have fun and be creative. Redesign the product completely from scratch with full freedom over UI, UX, interaction patterns, styling, information architecture, and product flow.

- Treat the listed capabilities as the minimum contract. Preserve them, then improve or add missing flows/capabilities when doing so makes the product better.
- Do not clone awkward old flows. Redesign, simplify, merge, or extend them when a more intentional product experience emerges.
- Make every flow intentional and every major decision serve a clear purpose.
- Prioritize clarity around camera consent, provider usage, temporary files, recording readiness, and paid voice processing without burying the creative experience.
- Add features only when they solve a real problem, unlock a clearly better creative workflow, improve safety/reliability, or make the product meaningfully more delightful.
- Do not add words, screens, components, features, or code merely to make the product look larger.
- If a design, product, or workflow decision does not feel excellent, improve it.
- Prefer a small number of polished capabilities over speculative breadth.
- Quality beats quantity. Creativity must not create bloat.

Do not reproduce any earlier layout, visual language, navigation model, component arrangement, copy, or user journey. The only inherited material is the capability and behavior contract in this document.

## Responsiveness and Accessibility

- Design intentionally for mobile, tablet, laptop, desktop, and large screens; do not scale down a desktop-only assumption.
- Use responsive layout primitives, content-aware sizing, safe-area support, and sensible density changes.
- Keep all critical actions reachable and understandable at narrow widths, short viewports, zoomed layouts, and large displays.
- Support both touch and precise pointer input with adequate target sizes and no hover-only capability.
- Make every action keyboard operable with visible focus and sensible focus order.
- Use semantic landmarks, headings, fieldsets, labels, native controls where appropriate, descriptive media/file controls, and screen-reader-friendly status regions.
- Associate validation and error text with the relevant control. Announce important async, connection, recording, and processing state changes without excessive noise.
- Make confirmation for destructive discard explicit and accessible.
- Preserve controls while focused or actively used if any auto-hiding behavior is designed.
- Respect reduced motion and avoid animation that obstructs media, causes disorientation, or hides state.
- Test representative widths from small mobile through large desktop, landscape/portrait changes, keyboard-only use, screen readers, zoom, and automated accessibility checks.

## Data, Validation, and Edge Cases

### Session and realtime state

- Local mode needs no AI input. Model modes need prompt, image, or both.
- Trim prompt boundaries while preserving intentional internal wording. Do not record empty prompts as recent.
- A mode change resets incompatible draft state.
- Only connected/generating model sessions may Apply. Reconnecting, local, disconnected, or already-applying states may not.
- Send full prompt/image/enhancement state atomically; use explicit null to clear a provider image.
- Distinguish pending draft changes from successfully applied state.
- Cancel or invalidate in-flight media, token, model, and Apply work on reset, stop, mode replacement, and unmount.

### Images and structured prompts

- Reject unsupported MIME types and files larger than 10 MiB before provider work. Exactly 10 MiB is allowed.
- Decode dimensions when available and offer nonblocking quality guidance for images below roughly 512 px on the shortest side or poor portrait proportions.
- Clear an invalid selection and expose an actionable error.
- Warn rather than block for generic prompts, multiple edit goals, contradictory traits, background edits likely to reduce consistency, or reference language without an image.
- Sanitize and bound custom text, names, notes, tags, search queries, and generated prompt content.

### Browser-local persistence

- Parse persisted data as untrusted input with a schema version and field allowlist.
- Normalize whitespace, dates, counts, sources, prompt intents, tags, and reference-image status.
- Drop invalid or empty assets, enforce collection caps, and never deserialize arbitrary URLs, tokens, media, or device data.
- Recover corrupt or unknown-version data to an empty store with a nonfatal notice.
- If storage is unavailable or quota-limited, retain the current in-memory store and disclose that changes last only for the tab.

### Media and recording

- Handle missing browser media APIs, denied permission, missing/busy devices, no video track, no reported dimensions, and unexpected track endings.
- Do not mistake intentional track stop/replacement for a device failure.
- Keep local preview until provider output has live video; fall back if remote video ends.
- Treat absent provider audio as normal and use local microphone fallback when possible.
- Detect unsupported recording and MIME differences, especially Safari/iOS behavior.
- If a source stream disappears or changes during recording, finalize safely.
- Recording and sidecar layers must never stop source tracks they do not own.
- Revoke a recording object URL only on recording-specific reset/discard, replacement by a new take, or unmount. Session reset, model reset, prompt-builder reset, stream changes, and model disconnect must preserve a valid clip.
- A missing/empty sidecar makes non-none voice effects unavailable but must not invalidate the video recording.

### Voice providers and processing

- Support voice-library loading, empty results, search changes, next/previous pages, preview failure, import failure, refresh, and optional-key unavailable states.
- Validate public voice eligibility and configured speech-to-speech model compatibility on the server, not by trusting the client.
- Importing a public voice mutates the configured ElevenLabs workspace; make it an explicit action.
- Conversion may fail due to credentials, policy, plan/billing, credits, rate limits, incompatible professional voices, invalid audio, model configuration, or provider outage. Map each to safe recovery guidance.
- Lock playback/download only while a replacement artifact is incomplete. Preserve the valid original or previous successful artifact on failure.
- Selecting no effect must cancel/clear processed presentation state and restore the original without provider traffic.
- Clean up aborted processing, temporary streams, canvases, audio contexts, generated tracks, and processed URLs.

### General states and failures

- Every data-bearing capability needs intentional loading, empty, success, stale/pending, unavailable, and error behavior.
- Authorization failures are not an application role concern because there is no auth; provider authentication/permission failures are integration errors and must be sanitized.
- No error path may reveal a permanent key, temporary token, raw upstream body, internal stack, or sensitive media.
- A failed optional integration must not break unrelated local capabilities.

## Environment and Configuration

Document these variables by name and purpose, provide an `.env.example` with placeholders only, validate them at startup, and never commit values:

- `DECART_API_KEY` — required server-only credential for Decart token issuance.
- `ELEVENLABS_API_KEY` — optional server-only credential for voice discovery, preview, import, and conversion.
- `ELEVENLABS_STS_MODEL_ID` — optional speech-to-speech model selection.
- `ELEVENLABS_ENABLE_LOGGING` — optional strict boolean controlling provider logging/zero-retention request behavior.
- `PORT` — optional local server port.
- `NODE_ENV` — validated runtime mode.

Test tooling may define its own non-secret ports or mock switches, but those names are implementation choices rather than product configuration. Any mock-provider switch must be impossible to mistake for a credential and must not activate in normal production builds.

Never define or document a browser-exposed permanent-key variable such as `VITE_DECART_API_KEY` or `VITE_ELEVENLABS_API_KEY`. Do not put any real key, token, private credential, user data, or sensitive media in source, docs, tests, stories, logs, fixtures, screenshots, or browser storage.

## Testing Expectations

Use multiple focused test layers. All default automated tests must use deterministic fakes and block unexpected external HTTP/WebSocket traffic; they must not call live camera devices, Decart, ElevenLabs, or WebRTC services.

### Unit and domain tests

- Session-mode discrimination and clean mode-specific drafts.
- Atomic realtime payloads, explicit image clearing, Lucy image-only intent, and VTON image-only behavior.
- Structured prompt generation for all four intents, blocking validation, warnings, adult-only age handling, normalization, and bounds.
- Creative asset sanitation, CRUD, model scoping, search, recent deduplication, usage tracking, collection/tag caps, corruption recovery, and storage fallback.
- Media-track selection, stream composition, audio fallback, MIME selection, filename/duration/size formatting, error classification, and cleanup helpers.
- Recording and voice-effect state transitions, immutable-original behavior, sidecar rules, and object URL ownership.

### Backend/API tests

- Environment parsing and invalid/missing configuration.
- Supported-model allowlist and exact temporary-token scope, origin, expiry, and session constraints.
- Validation and safe errors for every API boundary, including `400`, normalized payload-too-large behavior, `502`, and `503`.
- ElevenLabs pagination, normalization, free-user/public eligibility, professional-voice compatibility, imports, preview proxying, conversion limits, no-store headers, aborts, and sanitized provider failures.
- Confirm raw keys, tokens, upstream bodies, and preview URLs never leak.

### Frontend integration and component tests

- No camera/provider work before explicit Start.
- Local mode never requests a token, imports/connects Decart, or touches external Decart paths.
- Empty model drafts block before media; camera denial occurs before token issuance.
- Saved/generated text changes only the draft; live insertion waits for Apply.
- Reset cancels stale asynchronous starts and clears stale file/provider state.
- Remote-video gating, local fallback, reconnecting, errors, and unexpected track endings.
- Correct local/model recording streams and provider-audio/local-microphone fallback.
- Model release occurs only after recording finalization and preserves both local preview and the clip.
- Download, temporary retain, confirmed discard, new take, session stop while recording, stream replacement, and URL revocation.
- Local effects make no network calls. ElevenLabs receives audio only after explicit Apply. Reprocessing always starts from original artifacts.
- Loading, empty, optional-integration unavailable, processing, success, retry, and failure states.
- Keyboard, focus, screen-reader semantics, validation association, destructive confirmation, and responsive behavior.

### End-to-end and manual validation

- Run mocked end-to-end journeys for all three modes and critical error/recovery paths with strict network guards.
- Run automated accessibility checks against stable states and interaction tests.
- Test representative mobile, tablet, laptop, desktop, and large-screen dimensions, including horizontal-overflow checks.
- Manually verify real camera/microphone permissions, recording formats, track cleanup, and browser differences in supported targets.
- Where credentials are available, manually verify live Decart and ElevenLabs behavior, provider billing implications, and output quality.
- Any live smoke suite must be explicitly gated, cost-aware, short-lived, excluded from default commands, and never run in stories or ordinary tests.
- Require clean typecheck, lint, unit, API, component, end-to-end, accessibility, and production build results before completion.

## Acceptance Criteria

- [ ] The product can be scaffolded and run from a completely empty directory using this document as its only product prompt.
- [ ] Core local camera, character transformation, virtual try-on, live Apply/Reset, creative text asset, recording, review/download, and post-recording voice capabilities are preserved.
- [ ] The agent performed a product-evolution pass and improved, redesigned, or added any missing/weak flows that clearly made the product better.
- [ ] Any added capabilities are scoped, documented, tested, privacy-aware, and consistent with the local-first creator workflow.
- [ ] Local mode performs no Decart token, SDK, WebRTC-provider, or external Decart work.
- [ ] The character and try-on modes remain separate and use `lucy-2.1` and `lucy-vton-3` respectively.
- [ ] Model work begins only after explicit Start with a prompt, image, or both; camera failure occurs before token issuance.
- [ ] Live Apply sends prompt, image, and enhancement state atomically and explicitly clears stale images.
- [ ] Saved/generated text never starts media or silently applies provider state.
- [ ] Text assets persist safely in one browser while all images, recordings, tokens, and voice media remain ephemeral.
- [ ] Local and model recording use the correct video/audio sources and clean up without stopping tracks owned elsewhere.
- [ ] Stopping a model recording finalizes the clip before ending model usage, preserves the clip, and returns to local preview.
- [ ] No effect, local effects, and explicit post-recording ElevenLabs conversion all operate from the immutable original recording/audio.
- [ ] Provider secrets stay server-only; no secrets or sensitive data appear in the project, browser storage, logs, docs, or fixtures.
- [ ] The project is TypeScript throughout, including a TypeScript backend.
- [ ] Emotion CSS is the only application styling system, using named function consts as the styling pattern.
- [ ] The architecture is clean, scalable, and intentionally redesigned rather than copied.
- [ ] Components, hooks, services, utilities, and modules are small, focused, reusable, and strongly typed.
- [ ] Files are not bloated, data flow is predictable, API boundaries are maintainable, and unnecessary abstractions are absent.
- [ ] The app is responsive and intentional on mobile, tablet, laptop, desktop, and large screens.
- [ ] The app is usable by keyboard, screen-reader friendly, touch/pointer friendly, and provides accessible forms, status, errors, and confirmations.
- [ ] The UI/UX, interaction design, styling, and flows are creative, polished, purposeful, and not copied from any previous version.
- [ ] Every major product and architecture decision, including new or changed capabilities, has a reason; no filler features, screens, components, words, or code were added.
- [ ] Default tests use mocks, prohibit unexpected external traffic, cover core business rules and integration boundaries, and all quality checks pass.
- [ ] Real-browser media/provider limitations and production-hardening gaps are documented honestly.
- [ ] The guide supplies enough domain, API, validation, persistence, security, testing, and implementation direction to scaffold the full project from zero.
- [ ] The guide includes a practical Suggested Greenfield Build Plan and Suggested Project Shape without requiring the old organization.

## Final Prompt for the Rebuilding Agent

> You are rebuilding this product from scratch in a completely empty project using this document as your only source of truth. Preserve its core capabilities and behavioral guarantees, but do not treat this as a strict parity clone or feature ceiling. Creatively redesign the architecture, project organization, UI, UX, styling, interactions, and flows. While building, actively look for missing, awkward, weak, or incomplete flows; when an addition or redesign clearly improves the product and remains scoped, implement it without asking for permission. Use TypeScript throughout, including the backend, and use Emotion CSS with named function-const style patterns. Keep the system modular, secure, responsive, accessible, testable, and maintainable. Favor small reusable components and focused modules, explicit media/resource ownership, strong runtime validation, safe provider boundaries, deterministic tests, and documented rationale for meaningful product decisions. Have fun and build something polished, intentional, memorable, and enjoyable without adding bloat. Do not stop at scaffolding: implement the complete product, verify the acceptance criteria, and leave the empty project transformed into a working, documented, greenfield application.
