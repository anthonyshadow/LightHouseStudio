# Architecture audit

Audit date: 2026-07-28  
System: Lightframe Studio (`webrtc2Sol`)  
Status: canonical audit of the current local-first architecture; recommendations are not implemented behavior

## 1. Executive summary

Lightframe Studio has a sound architecture for its documented deployment: one
operator, one browser profile, and a Fastify broker bound to loopback. The
strongest design choice is explicit ownership. Local camera and microphone
tracks, cloned Decart input tracks, provider output tracks, recorder attempts,
object URLs, voice-processing resources, and cancellable provider requests all
have named owners and generally deterministic cleanup. The React application
keeps one persistent `MediaStage`, one overlay system, app-owned contracts, and
pure domain rules. Local Camera is genuinely independent of provider keys,
token minting, SDK loading, and external media traffic.

The architecture is not a public or multi-user backend. Exact loopback
Host/Origin checks, short-lived Decart client tokens, server-held permanent
keys, validated uploads, safe provider errors, and owner-scoped local assets
are appropriate defenses for the supported local broker. They are not
authentication, authorization, tenancy, quotas, billing, moderation,
account-level deletion, or production operations. Any remote, LAN, tunnel,
reverse-proxy, or public deployment remains blocked by `SEC-001` through
`SEC-005` and `ARCH-003`.

The controlled-pilot gaps are narrower than a rewrite:

1. `ARCH-001`: runtime implementation now preserves the authoritative Decart active-session
   limit, presents a monotonic countdown/warning, and orders expected completion safely; the paid
   maximum-duration live qualification remains open.
2. `PERF-001` and `SYS-TEST-002` / consolidated `TEST-005`: recording and
   optional voice processing retain multiple in-memory artifacts without a
   supported-duration decision or checked-in physical-target measurements.
3. `SEC-004`: immutable reference assets outlive browser relationships; the
   product needs truthful retention copy and a verified isolated-data cleanup
   procedure before people use personal images.
4. `PERF-002`: successful ElevenLabs audio is streamed through the server but
   is not bounded, then is buffered into a browser `Blob`.
5. `ARCH-002`: Decart errors are safely flattened, but too aggressively for
   useful recovery.
6. The cross-specialist review also confirmed three architecture-adjacent
   release issues: touch-only controls could become inaccessible (`UX-001`; its
   runtime/automated correction landed 2026-07-28 while physical evidence
   remains open), saved-character entry opens the wrong Shelf category
   (`UX-002`), and direct Character/VTO Start lacks the Decart disclosure shown
   in Recipe Dock (`PROD-003`).

The recommended release decision is:

- **Controlled, operator-assisted pilot:** viable after the scoped contract,
  trust/journey, provider-limit, recording-evidence, retention, provider-policy,
  and included-provider live-smoke gates in section 18.
- **Unassisted local beta:** also requires coherent erase-all-local-data
  behavior, broader accessibility/device evidence, bounded ElevenLabs output
  if Voice remains enabled, and stronger activation/recovery guidance.
- **Remote/public MVP:** blocked until authentication, authorization, tenant
  ownership, rate/entitlement/usage enforcement, deployment security,
  moderation operations, account-safe retention/deletion, observability, and
  durable multi-process coordination exist.

### Evidence discipline

This document uses the following labels:

| Label                       | Meaning                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Code-confirmed**          | Directly verified in the current repository.                                                                       |
| **Provider-doc-confirmed**  | Confirmed in current official provider documentation linked in section 5.                                          |
| **Repository-documented**   | An explicit current project contract, not independent runtime proof.                                               |
| **Audit-baseline evidence** | Observed during the read-only specialist audits; concurrent modernization may change the referenced test artifact. |
| **Assumption / unverified** | Requires credentials, entitlement, provider policy, physical devices, a fresh command run, or a product decision.  |
| **Recommendation**          | Proposed behavior; it must not be read as implemented.                                                             |

The three specialist challenge passes agree that “MVP” must not collapse
different release categories. In this document, a **controlled pilot** means
operator-assisted, loopback-only, touch/mobile-inclusive on a named physical
device/browser matrix, a 300-second maximum take, all approved provider paths,
isolated local data, assigned provider credentials/billing/evidence ownership,
explicit provider allowlists/limits, and no untrusted shared server. A
self-serve, remote, or public release has additional gates.

## 2. Current system map

### Runtime and build inventory

| Concern            | Current implementation                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Runtime            | Node `>=24 <25`; npm `>=11`; ESM workspaces                                                           |
| Browser app        | React 19.2, Vite 8.1, TypeScript, Emotion                                                             |
| Local API          | Fastify 5.10, Zod 4.4, `@fastify/helmet`, `@fastify/static`                                           |
| Pure packages      | `@studio/domain` and `@studio/contracts`, built with tsup                                             |
| Realtime video     | `@decartai/sdk` 0.1.15; browser WebRTC through an app adapter                                         |
| Local recording    | `MediaRecorder`; parallel audio sidecar; Mediabunny remux                                             |
| Image work         | Server-selected OpenAI, BFL FLUX.2 Pro, or Wiro Seedream adapter                                      |
| Voice work         | ElevenLabs saved-voice browse/preview and Voice Changer conversion                                    |
| Tests              | Vitest, Testing Library, Storybook browser tests, Playwright functional/production/visual suites, axe |
| Primary validation | `npm run quality`; release adds coverage, E2E, visual, production audit, and manual/live evidence     |

### Execution map

```text
Browser: React StudioExperience
  ├─ useStudioSession
  │    ├─ useSessionDraftState
  │    ├─ useOwnedLocalMedia
  │    ├─ useCapturePreferences
  │    └─ useModelSessionActions
  │         ├─ same-origin realtime-token client
  │         └─ useRealtimeResource
  │              └─ DecartRealtimeGateway
  │                   └─ lazy @decartai/sdk import
  ├─ useTakeReviewFlow
  │    ├─ useRecording
  │    ├─ recordingAttempt / recordingArtifacts
  │    └─ useVoiceProcessing
  │         ├─ local Web Audio + Mediabunny
  │         └─ same-origin ElevenLabs API client
  ├─ Character Builder and creative repositories
  │    ├─ Recipe Shelf localStorage repository
  │    ├─ character draft IndexedDB repository + save journal
  │    └─ legacy project IndexedDB compatibility repository
  └─ one persistent MediaStage + shared OverlayPanel

Loopback: Fastify broker
  ├─ exact loopback Host/Origin and provider-intent boundary
  ├─ Decart client-token route/provider
  ├─ ElevenLabs routes/service/provider
  ├─ reference-image routes/service/coordinator
  │    ├─ OpenAI prompt optimizer
  │    ├─ exactly one image provider selected at startup
  │    └─ immutable filesystem asset store
  └─ app-owned Zod contracts + safe error normalization

Pure packages
  ├─ packages/domain: session, recording, prompt, asset, and safe-error rules
  └─ packages/contracts: provider-independent HTTP schemas and IDs
```

### Route and deployment shape

- `/` is the only application route. Retired and unknown SPA entries are
  compatibility redirects, not active pages.
- Development uses Vite on loopback with `/api` proxied to the fixed Fastify
  port. Production-mode local use serves the built browser app and API from one
  Fastify origin.
- The normal server binds to `127.0.0.1`, rejects non-loopback Hosts, and
  validates exact loopback Origin for provider mutations.
- There is no remote deployment workflow, infrastructure-as-code, account
  service, database, analytics backend, job service, payment system, or cloud
  take library.
- `GET /api/health` is local liveness. `GET /api/capabilities` reports
  configuration presence, not live reachability, quota, entitlement, or storage
  health.

## 3. Major feature boundaries

| Boundary                     | Owns                                                                   | Must remain outside                       |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `packages/domain`            | Pure session, prompt, asset, recording, and error policy               | React, browser APIs, HTTP, provider SDKs  |
| `packages/contracts`         | Zod HTTP schemas, app IDs, provider-independent request/response types | Raw provider payloads and secrets         |
| `apps/web/src/features`      | Capability-focused UI and presentation models                          | Permanent credentials, server persistence |
| `apps/web/src/orchestration` | Async sequencing, lifecycle, cancellation, resource handoff            | Raw provider protocol decisions           |
| `apps/web/src/adapters`      | Browser APIs, same-origin clients, Decart SDK, audio processing        | Product policy and account rules          |
| `apps/api/src/application`   | Transport-neutral server payloads                                      | Fastify replies and concrete providers    |
| `apps/api/src/features`      | Route validation and application services                              | Browser state and UI assumptions          |
| `apps/api/src/providers`     | Decart, OpenAI, BFL, Wiro, ElevenLabs protocol adaptation              | Product UI and unsafe upstream errors     |
| `apps/api/src/http`          | Local trust boundary, safe errors, streaming lifetime                  | Provider-specific business policy         |

`StudioApp.tsx` is intentionally a composition boundary, not an all-purpose
domain object. `StudioExperience` composes focused controllers without a global
store. The persistent `MediaStage` owns media presentation; `OverlayPanel` owns
modal presentation/focus behavior; neither tool overlays nor feature panels own
or restart media.

Character Builder owns its create/edit draft, durable upload, optimization,
generation/composition/editing, preview freshness, save journal, and atomic
Shelf handoff. Prompt Workshop owns only its three non-character structured
prompt intents. Recipe Shelf owns saved text/provenance/opaque asset
relationships, not image bytes. The legacy project repository is a compatibility
boundary and should not be generalized into the current product model.

Provider selection is explicit:

- Decart model selection is app-owned (`lucy-2.5`, exact `lucy-vton-3`).
- Reference image generation selects one API provider at startup through
  `REFERENCE_IMAGE_PROVIDER`; there is no browser selector or automatic
  fallback.
- ElevenLabs is isolated behind API routes and an app-owned voice service.

These boundaries support replacement without putting provider payloads in
presentation components. A “universal provider” abstraction or automatic
fallback engine would reduce clarity and introduce cost, safety, and
idempotency ambiguity; avoid it until product policy actually requires it.

## 4. State ownership

| State/resource                             | Owner                           | Lifetime and cleanup                                                   |
| ------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------- |
| Mode-specific prompt/reference draft       | `useSessionDraftState`          | Tab memory; ephemeral object URLs revoked on replacement/reset         |
| Applied realtime snapshot                  | session orchestration           | Last successful full prompt/image/enhance state                        |
| Local camera/mic tracks                    | `useOwnedLocalMedia`            | Replaced atomically; owner stops replaced/current tracks               |
| Capture device/profile draft               | `useCapturePreferences`         | Tab only; device IDs are not persisted                                 |
| Decart client, cloned input, remote tracks | realtime resource/gateway       | Aborted/disconnected on stop, reset, unmount, or superseding operation |
| Stage video binding                        | persistent `MediaStage`         | One video node; unused `src`/`srcObject` cleared before source switch  |
| Recorder instances/chunks                  | recording orchestration         | Finalized once; duplicate Stop coalesces                               |
| Original, sidecar, processed artifact URLs | recording artifact controller   | Revoked on replacement, Close, Discard, or unmount                     |
| Voice-processing abort/Web Audio/remux     | voice-processing controller     | Cancelled/disposed without mutating immutable originals                |
| Saved recipes/characters metadata          | creative asset repository       | Versioned/sanitized localStorage; no image bytes                       |
| Character draft/save journal               | Character Builder repository    | Versioned IndexedDB with revision/CAS behavior                         |
| Legacy project media                       | legacy compatibility repository | IndexedDB Blobs; explicit lifecycle                                    |
| Reference image bytes/metadata             | API asset store                 | Immutable filesystem records under `LIGHTFRAME_DATA_DIR`               |
| Reference operation coalescing             | API coordinator                 | Process-local owner/operation Maps                                     |

Async work uses operation generations and `AbortController` checks before
committing. Replacement media is validated before the prior healthy stream is
stopped. Provider input clones are independent from local preview. Remote
replacement preserves shared track identities and stops only absent tracks.
This is a strong stale-result and cleanup posture.

Two state distinctions must remain explicit:

1. **Draft versus applied:** edits do not silently mutate the live provider
   state; Apply sends a complete validated snapshot and Revert restores the
   working draft.
2. **Entry intent versus selected state:** the requested Shelf category is not
   the same as the active recipe. The `UX-002` fix should add a one-shot,
   app-owned Shelf entry intent and use the existing controller; it must not
   overload active-recipe state or create another picker/store.

## 5. External-provider boundaries

### Official source set

Provider claims in this audit were checked against these current official
sources:

- Decart: [Platform overview](https://docs.platform.decart.ai/getting-started/overview),
  [client tokens](https://docs.platform.decart.ai/getting-started/client-tokens),
  [Lucy 2.5 Realtime](https://docs.platform.decart.ai/models/realtime/lucy-2.5),
  [Virtual Try-On](https://docs.platform.decart.ai/models/realtime/virtual-try-on),
  [reference images](https://docs.platform.decart.ai/models/realtime/reference-images),
  [streaming best practices](https://docs.platform.decart.ai/models/realtime/streaming-best-practices),
  and [SDK-direct integration](https://docs.platform.decart.ai/integrations/sdk-direct).
- ElevenLabs: [Voice Changer overview](https://elevenlabs.io/docs/overview/capabilities/voice-changer),
  [Voice Changer API](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert),
  [voices API](https://elevenlabs.io/docs/api-reference/voices/search),
  [models API](https://elevenlabs.io/docs/api-reference/models/list),
  [streaming guidance](https://elevenlabs.io/docs/api-reference/reducing-latency),
  [API introduction and cost headers](https://elevenlabs.io/docs/api-reference/introduction/),
  and [Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode).

Official documentation is evidence for provider contracts, not proof of the
configured account’s entitlement, quota, billing, reachability, or retention
terms. Those require dated live/operator evidence.

### Decart

**Code-confirmed:** the permanent key stays on the API. The browser asks the
broker for a short-lived model/origin-scoped client token only after validated
model input and healthy local media. The SDK loads lazily. Provider input uses
cloned tracks, and local preview remains usable if provider output is absent or
released. Start/Apply sends one complete prompt/image/enhance snapshot;
`image: null` clears the reference.

**Provider-doc-confirmed:** Lucy 2.5 supports text, reference image, or both and
uses atomic full-state updates. The current docs recommend at least 512×512
JPEG/PNG/WebP references and clear, well-lit, framing-matched inputs. Realtime
sessions distinguish token connection-start lifetime from active-generation
duration and expose session/lifecycle events. Decart’s current VTO examples use
the moving `lucy-vton-latest` alias.

**Assumption / unverified:** the app intentionally pins `lucy-vton-3`, which is
recognized by installed SDK 0.1.15, but static code and current docs do not prove
that the configured account can use it. Real WebRTC reachability, exact
max-duration termination reason, reconnect/tick semantics, billing mapping, and
physical-device behavior require live smoke.

**Recommendation:** retain the exact model pin until a deliberate migration.
Preserve the returned active-session constraint, add an app-owned monotonic
clock once connected, subscribe to `generationTick` and `generationEnded`
through allowlisted app-owned events, and distinguish expected cap completion
from transport failure. Provider ticks may reconcile display/diagnostics, but
must not be labeled as credits or billing truth without live evidence.

### Reference optimization and image providers

**Code-confirmed:** a server-only OpenAI Responses request produces structured
character optimization. The user description is treated as untrusted input,
tools are disabled, response storage is disabled, and strict output is
validated. One image provider is selected at startup: OpenAI `gpt-image-2`,
BFL `flux-2-pro`, or Wiro
`seedream-v5-lite-uncensored`. There is no automatic fallback or automatic
billable-task resubmission. BFL/Wiro result downloads use hardened URL,
DNS/private-network, redirect, MIME, and byte policies. Wiro cleanup is
best-effort.

**Recommendation:** keep startup selection explicit. A controlled pilot needs a
release provider/settings allowlist and content policy; exclude the uncensored
Wiro path by default unless it is an explicit, consented research requirement.
Provider moderation settings do not constitute product moderation.

### ElevenLabs

**Code-confirmed:** the API key stays server-side. The browser can list/search
saved voices, request a validated preview, and apply Voice Changer to the
completed recording sidecar. Provider contact requires
`X-Lightframe-Provider-Intent: voice`. Conversion revalidates saved-library
membership and model conversion capability. The UI blocks source recordings
over five minutes. The server validates MIME, non-empty input, and a 25 MiB
body, forwards successful audio, and the browser buffers the result into a
`Blob`.

**Provider-doc-confirmed:** Voice Changer preserves delivery characteristics and
has a five-minute maximum segment. The convert endpoint accepts multipart audio
and supports `remove_background_noise`; zero-retention requests use
`enable_logging=false` and are restricted by account eligibility. Text to
Speech is documented by ElevenLabs but is not part of this implementation.

**Assumption / unverified:** configured-account zero-retention eligibility,
actual provider retention, current prices/credits, normal/maximum output sizes,
and full browse → preview → Apply → remux → Download behavior require operator
or live evidence.

## 6. Real-time media lifecycle

The current start sequence is intentionally ordered:

1. Validate the selected model draft.
2. Acquire or reuse app-owned local camera/microphone.
3. Resolve the selected model’s camera requirements.
4. Request a scoped token from the local broker.
5. Lazy-load the Decart adapter and connect a cloned provider-input stream.
6. Keep local preview visible until usable transformed video exists.
7. Commit the full prompt/image/enhance snapshot only for the current operation
   generation.

Stop/Reset invalidates the operation generation, aborts the browser token
request, disconnects the provider, stops provider-owned clones/remote tracks,
and ignores late results. Reset also clears applied/ephemeral reference state.
The API’s installed token SDK call is raced and its late result discarded, but
that upstream request itself is not cancellable in SDK 0.1.15.

`MediaStage` is mounted once and owns one persistent `<video>`. Live streams use
`srcObject`; finalized playback uses `src`; the unused binding is cleared before
each source-kind switch. Only local preview is mirrored. Provider output and
playback retain native orientation. Overlays do not resize, remount, or take
ownership of the stage.

Known lifecycle gaps:

- The client drops `constraints.maxSessionDurationSeconds`.
- Provider duration/end events are not propagated as app-owned state.
- A max-duration provider stop can look like a generic failure.
- The exact behavior when provider output ends during recording requires an
  explicit contract and test. The safest default under current policy is to
  finalize the provider-source take before source ownership changes, then
  preserve local preview.
- Capability presence is configuration, not active provider health.

The touch-control issue is adjacent to lifecycle safety. As implemented on
2026-07-28, the persistent stage owns one control timer plus pointer, touch,
focus, and keyboard recovery; the control subtree renders the resulting
visible/inert state. Recording suspends auto-hide and collapses the bar to Stop.
Named physical touch/browser evidence is still required before any support
claim.

## 7. Recording lifecycle

Recording borrows an explicit composed source without owning or stopping source
tracks:

| Session state              | Video source      | Audio source                                         |
| -------------------------- | ----------------- | ---------------------------------------------------- |
| Local                      | Local camera      | Local microphone when present                        |
| Model before usable output | Not recordable    | Not applicable                                       |
| Model with usable output   | Transformed video | Provider audio when live, otherwise local microphone |

At Start, track identities and metadata are pinned. Later source changes
finalize the take instead of rewriting it. Main video and a same-attempt audio
sidecar are recorded in one-second chunks. Duplicate Stop calls coalesce into
one finalization promise. Main video is authoritative: a sidecar failure is
reported but does not discard a valid video.

`finalizeTakeForReview` waits for final recorder data before
`releaseForRecordedReview` stops live session resources. A finalizing stage
layer retains the last live presentation until playback is ready. The Latest
Take overlay opens only by explicit action.

Voice processing starts from immutable originals. Local processing uses Web
Audio/Mediabunny; ElevenLabs receives only the completed sidecar. A processed
replacement is committed before the prior processed URL is revoked.
Cancellation/failure preserves the last playable artifact. Close/Discard
cleanup is idempotent and unload protection remains while an undownloaded take
exists.

This correctness has a memory cost: chunk arrays, finalized original and
sidecar Blobs, decode/remux intermediates, and a processed replacement can
coexist. There is no runtime duration cap. The correction is not silent chunk
eviction. Decide the supported take duration and devices, run the documented
physical-target measurements, then choose a warning, safe-finalization cap,
narrower support matrix, or future persistent/streaming architecture only if
evidence requires it. AI-session duration, recording duration, and the
ElevenLabs five-minute input limit are separate contracts.

## 8. Persistence model

| Store                      | Data                                                                     | Current suitability                              | Migration note                                                |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- |
| localStorage Recipe Shelf  | Versioned saved prompt/character metadata and opaque asset relationships | Appropriate for bounded local text/provenance    | Preserve provider-independent IDs and migrations              |
| IndexedDB character draft  | One active draft, revisions, save journal                                | Appropriate for browser-local authoring recovery | Do not equate profile ownership with account ownership        |
| IndexedDB legacy projects  | Compatibility checkpoints and media Blobs                                | Acceptable retired boundary                      | Minimize churn; do not make it the new cloud model            |
| In-memory take             | Original, sidecar, processed artifact                                    | Deliberate one-take local workflow               | Needs supported-duration evidence                             |
| Filesystem reference store | Immutable bytes + versioned private metadata + idempotency mapping       | Strong single-operator local store               | Needs relationship-aware account storage later                |
| Process-local coordinator  | In-flight owner/request work                                             | Adequate for one API process                     | Replace with durable idempotency/leases only at backend stage |

The reference store atomically publishes owner-only immutable records under
`LIGHTFRAME_DATA_DIR`. Browser-visible asset IDs do not expose storage keys.
Metadata retains provider/model/adapter/settings provenance, source/parent
relationships, request fingerprints, and timestamps. Missing exact
owner/request mappings can be repaired by scanning valid metadata without
rebilling.

Detached, regenerated, or unlinked assets are deliberately retained because
browser Shelf records, recent items, Builder drafts/save journals, legacy data,
and derivation chains are not represented by one authoritative server graph.
Therefore:

- “Remove” or detach must not imply deletion of bytes.
- Clearing browser site data does not clear the filesystem store.
- A per-asset “delete unreferenced” feature based only on browser metadata is
  unsafe.
- A controlled pilot should use isolated data directories and a verified
  operator whole-dataset retirement procedure.
- An unassisted local beta needs coherent erase-all behavior across browser and
  server stores.
- A public account product needs authoritative ownership/relationships,
  retention, tombstones/audit, backup policy, and tenant-safe deletion.

## 9. Error model

App-owned Zod contracts validate HTTP boundaries. Expected failures map to safe
codes; unexpected programming/storage faults become `internal_error`. Raw
provider bodies, prompts, signed/polling URLs, credentials, arbitrary causes,
and raw messages do not reach the browser or structured diagnostics. Fastify
request logs avoid request URLs/query/body where they could contain ephemeral
user data.

The current model is strongest at:

- browser media and permission classification;
- reference validation and provider-safe error mapping;
- OpenAI/BFL/Wiro download validation;
- ElevenLabs entitlement versus invalid-audio distinction;
- abort propagation and preservation of the prior playable artifact;
- generic fallbacks that do not leak provider details.

The main gap is Decart classification. The gateway accepts an unknown SDK error,
but upstream orchestration discards its structure and emits one generic
provider error. Add a small adapter-local allowlist for installed/documented
codes (for example authentication/model/transport categories) and preserve the
generic fallback. Never surface arbitrary provider text.

Expected active-session completion also needs its own normalized outcome. A
countdown is not an error. If the provider event/reason cannot be safely
recognized, use the authoritative cap and a conservative “AI session ended”
message rather than inventing a provider explanation.

## 10. Security posture

### Existing strengths

- No permanent provider secret is sent to browser code.
- Realtime tokens are short-lived, model-scoped, exact-origin-scoped, and
  active-duration-scoped.
- The broker binds to loopback; Host and mutation Origin are constrained.
- Provider-contacting ElevenLabs routes require explicit app intent.
- Inputs use app schemas; reference images have byte, MIME, dimensions, and
  decoded-pixel limits.
- Remote image transport rejects unsafe schemes, redirects, private-network
  addresses, invalid media, and oversized bodies.
- Browser storage is sanitized as untrusted input.
- React text rendering is used; no app-package `dangerouslySetInnerHTML`,
  arbitrary `innerHTML`, or dynamic evaluation was found in the audit.
- Structured diagnostics deliberately omit secrets, prompts, media, URLs, raw
  causes, and provider payloads.
- The production dependency graph passes `npm audit --omit=dev`; the full
  development graph still has the toolchain advisories recorded in `SEC-007`.

### Acceptable only inside the declared local trust model

- Host-derived owner identity is a namespace, not authentication.
- An origin-scoped client token is defense-in-depth and may be replayed by a
  non-browser client able to spoof Origin while valid.
- Wiro remote cleanup is best-effort.
- ElevenLabs `enable_logging=false` is a request and account entitlement, not a
  repository-proven retention guarantee.
- The local operator controls provider credentials, data directory, participant
  access, and cleanup.

### Controlled-pilot gates

- Inline disclosure at the actual direct Decart Start action must state what is
  sent, who receives it, that provider usage begins, and the session maximum.
- Upload/save/remove surfaces must distinguish retaining/detaching/deleting.
- Use isolated pilot data and verify cleanup.
- Define release-enabled provider/settings and a content/support policy; exclude
  uncensored generation by default.
- Keep the broker loopback-only and document the prohibition on remote exposure.

### Public-launch blockers

Authentication, secure sessions/CSRF, per-resource authorization, tenant
isolation, rate and concurrency limits, entitlements/usage settlement,
deployment-specific CSP/TLS/secrets, public moderation/reporting, relationship-
aware retention/deletion, audit/support operations, backups, and incident
response are absent. CSP and COEP are currently disabled for variable provider
WebSocket/media origins; enabling them requires a tested production origin
inventory and is not a checkbox change.

## 11. Performance posture

Strengths include dynamic loading of the realtime SDK and rare Studio tools,
disabled production browser source maps, bounded request/poll timeouts, no
automatic billable resubmission, bounded/normalized reference images, a
30-second shared successful ElevenLabs model-discovery cache, and cleanup of
replaced tracks/object URLs.

Primary risks:

1. **Recording memory (`PERF-001`):** the approved 300-second maximum is not
   enforced, and sustained chunks plus finalization, processing, and replacement
   Blobs lack physical-target evidence at that duration.
2. **ElevenLabs successful output (`PERF-002`):** an unexpectedly large or
   endless successful stream can consume server bandwidth and browser memory.
3. **Reference repair scan (`PERF-003`):** missing idempotency mappings trigger
   an O(number of retained assets) metadata scan. This is a low-impact repair
   path locally but unsuitable as a scaled object-storage pattern.
4. **Physical mobile:** WebRTC, recording, decode/remux, bandwidth, battery,
   background/foreground behavior, and tab memory are not proven by emulation.

Do not infer performance support from unit tests or screenshots. Record
physical-target measurements with browser/OS/device, codec, durations, observed
rates/peaks, finalization/remux times, cleanup recovery, and pass/fail.

## 12. Testability

The architecture has strong seams:

- pure domain and contract tests;
- hook/controller race and cleanup tests;
- injected repositories, providers, and `fetch`;
- browser API adapters for media, recorder, Web Audio, and Decart;
- Fastify route/provider contract tests;
- a Vite-development-only deterministic realtime driver guarded from
  production output;
- default denial of unexpected external HTTP and WebSockets;
- functional E2E, production-serving smoke, Storybook browser tests, and
  platform-specific Chromium visual baselines;
- exact responsive sizes: `1440×960`, `1280×720`, `834×1112`, `390×844`, and
  `320×568`.

The specialist audits found these test gaps:

| Consolidated ID | Origin                               | Missing evidence                                                                        |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `TEST-001`      | `UX-001`, formerly UI `TEST-005`     | Touch/pointer recovery after full auto-hide timeout and Stop visibility while recording |
| `TEST-002`      | `UX-002`, formerly UI `TEST-003/004` | Both saved-character entry points through Characters → Use → Start                      |
| `TEST-003`      | UI visual findings                   | Semantically ready, state-driven curated matrix; no unresolved lazy fallback            |
| `TEST-004`      | `SYS-TEST-001`                       | Decart cap, tick/end/error, warning, expected stop, recording ordering, cleanup         |
| `TEST-005`      | `SYS-TEST-002`                       | Versioned physical recording-memory evidence for every claimed target                   |
| `TEST-006`      | `SYS-TEST-003`                       | Oversized declared/chunked ElevenLabs success, cancellation, boundary success           |
| `TEST-007`      | Cross-specialist live evidence       | Included-model/device/provider entitlement and full Voice journey smokes                |

The `SYS-TEST-*` prefix is retained in detailed findings to avoid colliding with
the UI audit’s independent `TEST-*` IDs. Consolidated implementation work
should use `TEST-001` through `TEST-007` above.

At the audit baseline, the curated matrix had 29 cases but did not protect the
true closed initial Studio, actual saved-character selection, or a settled
small-mobile Take Review; one reviewed image contained only
`Loading studio tool…`. The target remains a 29-case review budget, not a proof
of correctness:

- closed initial, local live, and recording at all five viewports;
- desktop/small-mobile pairs for AI choice, selected-character live, Character
  Builder combined-ready, saved-character selection, and settled Take Review;
- focused desktop VTO and Voice Browser if included in release;
- focused small-mobile finalizing and permission error;
- semantic readiness assertions that reject unresolved lazy fallbacks;
- deterministic media/time/network denial and manually reviewed Darwin/Linux
  baselines.

Behavior must be fixed before snapshots. Touch is a functional E2E requirement,
not a pixel-baseline substitute. A shared typed scenario registry is useful
after correctness is restored, but not a prerequisite for the first focused
repair.

No fresh quality, coverage, E2E, visual, production, provider, or physical-device
command result is claimed by this audit. Test presence is not a pass result.

## 13. Maintainability

The dependency direction and ownership model are maintainable. Large modules
should be watched, not split by arbitrary line limits:

| Module                     | Audit assessment                                                         | Refactor trigger                                                                                |
| -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Character draft repository | Large, cohesive IndexedDB CAS/migration boundary                         | Codecs, migrations, and transactions evolve independently                                       |
| `StudioApp.tsx`            | Large composition boundary that delegates policy                         | New workflows create sustained overlay/prop-wiring ownership                                    |
| Domain asset operations    | Broad but pure saved-asset operations                                    | Aggregates gain independent migration/release policy                                            |
| Creative repository        | Cohesive localStorage migration/sanitation boundary                      | A second durable implementation is actually introduced                                          |
| Legacy project repository  | Compatibility boundary                                                   | A concrete compatibility defect, not cleanup preference                                         |
| Reference image service    | High-impact orchestration with existing provider/store/coordinator seams | New operation families make preparation/persistence independent                                 |
| `MediaStage.tsx`           | Cohesive persistent media/presentation lifecycle                         | Static visual subtrees grow; never extract media ownership casually                             |
| `useRecording.ts`          | Dense critical lifecycle with supporting modules                         | Recorder-attempt and finalization state machines can be separated without duplicating ownership |
| Wiro provider              | Provider-specific submit/poll/download/cleanup                           | Keep provider-specific; share only identical transport invariants                               |
| ElevenLabs provider        | Provider-specific HTTP normalization                                     | Add a bounded audio transport helper for `PERF-002`                                             |

Avoid a global state rewrite, generic provider mega-adapter, line-count-driven
refactor, duplicated media/modal/storage system, or cloud repository abstraction
before there is a second implementation with a real contract.

## 14. Future backend readiness

### Stabilize now

- Provider-independent opaque IDs and app-owned schemas.
- Explicit schema versions and migrations.
- Created/updated/start/duration timestamps.
- Immutable source/provider/model/adapter/settings provenance.
- Idempotency request IDs and fingerprints.
- Parent/source/final-reference relationships.
- A provider-independent realtime usage record: model/profile, authoritative
  maximum, app elapsed time, provider-reported seconds when available,
  start/stop timestamps, and normalized stop reason.
- The distinction between local operator namespace and future authenticated
  owner/tenant.

### Acceptable temporary implementation

- localStorage for bounded text/provenance.
- IndexedDB for browser-only drafts and retired local media.
- immutable local filesystem references.
- one in-memory take.
- process-local coalescing.
- exact-loopback Host-derived local owner namespace.

These remain acceptable only while the deployment stays explicitly local and
single-operator.

### Migration hazards

- Exposing storage keys as browser IDs.
- Treating Host hashes as user IDs.
- Publishing provider request/task payloads as product contracts.
- Treating browser deletion as server/media deletion.
- Persisting Decart client tokens or device IDs.
- Trusting client capability flags as entitlements.
- Silently switching model IDs or provider fallback semantics.
- Adding per-asset deletion before an authoritative relationship graph exists.

### Premature abstractions

- generic provider fallback;
- distributed jobs before user-owned async jobs exist;
- cloud take history before the local recording contract is validated;
- a billing ledger before pricing/failure/refund decisions;
- one repository interface spanning Shelf, drafts, legacy Blobs, recording, and
  immutable reference media despite their different transactions/ownership.

## 15. Critical risks

### Findings summary

| ID                            | Severity                        | Finding                                                                                             | Release classification                                            |
| ----------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ARCH-001`                    | High                            | Runtime cap/tick/end boundary implemented; paid live maximum-duration qualification pending         | Controlled-pilot evidence gate                                    |
| `ARCH-002`                    | Medium                          | Decart errors are flattened beyond useful recovery                                                  | Recommended before wider local release                            |
| `ARCH-003`                    | High for public scale           | Coordinator, storage, and owner model are single-process/single-operator                            | Safe to defer; public-launch blocker                              |
| `SEC-001`                     | Critical for remote exposure    | No public authentication, authorization, or tenant boundary                                         | Safe to defer locally; public-launch blocker                      |
| `SEC-002`                     | High for remote exposure        | No rate, entitlement, concurrency, or provider-cost enforcement                                     | Safe to defer locally; public-launch blocker                      |
| `SEC-003`                     | High for public deployment      | CSP/COEP disabled for provider-origin compatibility                                                 | Safe to defer locally; public-launch blocker                      |
| `SEC-004`                     | High for external personal data | Immutable reference media has no ordinary deletion/retention lifecycle                              | Disclosure/cleanup gate; full fix deferred                        |
| `SEC-005`                     | High                            | Provider settings are not an application moderation policy                                          | Operational pilot gate; full public system deferred               |
| `SEC-006`                     | Medium                          | ElevenLabs five-minute duration is enforced only by UI                                              | Safe locally; public-backend requirement                          |
| `SEC-007`                     | Medium repository/tooling risk  | Development-only lint/build dependencies have unresolved high-severity advisories                   | Maintain before broader contributor/CI exposure                   |
| `PERF-001`                    | High                            | Recording and processing memory grow with take size                                                 | Controlled-pilot evidence gate                                    |
| `PERF-002`                    | Medium                          | Successful ElevenLabs audio has no output-byte ceiling                                              | Recommended pilot hardening; required before self-serve/public    |
| `PERF-003`                    | Medium at scale, Low locally    | Reference idempotency repair scans retained assets                                                  | Safe to defer                                                     |
| `SYS-TEST-001` / `TEST-004`   | Medium                          | Cap/tick/end automated coverage implemented; live boundary and broader typed-error evidence pending | Live required with `ARCH-001`; errors recommended with `ARCH-002` |
| `SYS-TEST-002` / `TEST-005`   | High                            | Physical-target recording-memory evidence is absent                                                 | Required for every support claim                                  |
| `SYS-TEST-003` / `TEST-006`   | Medium                          | No negative tests for oversized successful provider audio                                           | Required with `PERF-002`                                          |
| `DOC-001` / `TEST-007`        | High release-evidence risk      | Included provider paths lack live account/device qualification                                      | Required for the controlled pilot                                 |
| `UX-001` / `TEST-001`         | Critical interaction risk       | Runtime/automated recovery is complete; named physical and assistive evidence is pending            | Unconditional controlled-pilot gate until physical evidence       |
| `UX-002` / `TEST-002`         | High journey risk               | Saved-character entry opens generic Saved, not Characters                                           | Required for the default Character pilot                          |
| `PROD-003`                    | High trust risk                 | Direct Decart Start omits the Dock’s provider/data/session disclosure                               | Controlled-pilot gate                                             |
| `UI-TEST-VISUAL` / `TEST-003` | High sign-off risk              | Curated visual states can be semantically wrong or unsettled                                        | Required for visual/mobile sign-off                               |

### ARCH-001 — Browser drops Decart active-session constraints

- **Category:** Architecture / provider lifecycle / usage visibility.
- **Severity:** High.
- **Evidence:** **Code-confirmed:** the realtime route returns
  `constraints.maxSessionDurationSeconds`; the Decart token provider applies
  that active-session scope. `requestRealtimeToken` validates the response and
  returns only `apiKey` and `expiresAt`. The gateway currently registers an
  error listener, not app-owned duration/end handling.
  **Provider-doc-confirmed:** Decart distinguishes token connection-start expiry
  from active-session duration; installed SDK 0.1.15 exposes
  `generationTick { seconds }` and `generationEnded { seconds, reason }`.
- **Affected files:** `apps/api/src/features/realtime/routes.ts`,
  `apps/api/src/providers/decart/token-provider.ts`,
  `packages/contracts/src/realtime.ts`,
  `apps/web/src/adapters/api-client/apiClient.ts`,
  `apps/web/src/adapters/decart-realtime/DecartRealtimeGateway.ts`,
  `apps/web/src/orchestration/session/useRealtimeResource.ts`,
  `apps/web/src/orchestration/session/useModelSessionActions.ts`, Studio
  status/control UI, and their tests.
- **User or developer impact:** A normal Studio AI session can reach its
  enforced five-minute maximum without visible elapsed/remaining state or a
  warning. Expected completion may look like a crash. Developers cannot
  reconcile or test provider duration, reconnect behavior, or cleanup.
- **Recommended correction:** Preserve the constraints in the app-owned token
  result. Start an app-owned monotonic budget only when connected; subscribe and
  unsubscribe to allowlisted tick/end events; reconcile ticks without treating
  them as billing truth; show elapsed/remaining and a near-expiry warning;
  normalize expected limit completion separately from disconnect. Do not
  persist the token. If provider output ends during recording, follow the
  existing finalize-before-source-change policy and preserve local preview.
- **MVP timing:** **Required before a controlled AI pilot.**
- **Dependencies:** Product copy for provider usage/session maximum; decision
  for expected-cap behavior during recording; live smoke for actual end reason
  and reconnect semantics.
- **Regression risk:** Medium; additive types/state touch a critical realtime
  lifecycle and require deterministic accelerated-clock coverage.

### ARCH-002 — Decart errors are flattened beyond useful recovery

- **Category:** Architecture / error model.
- **Severity:** Medium.
- **Evidence:** **Code-confirmed:** the gateway callback receives an unknown SDK
  error; realtime/session orchestration discards its shape and emits one
  `realtime-provider-error`. The generic mapping prevents leakage.
  **Provider-doc/SDK-confirmed:** documented/installed errors distinguish
  authentication, model, WebRTC/transport, and other categories.
- **Affected files:** Decart gateway, realtime resource, model session actions,
  `packages/domain/src/errors/safe-error.ts`, stage notices, and tests.
- **User or developer impact:** Different failures receive the same recovery
  advice and diagnostics, making retries less useful while hiding whether a
  selected model/account is unavailable.
- **Recommended correction:** Map only a small documented/installed allowlist
  into app-owned safe categories and recoveries. Never forward raw messages,
  arbitrary codes, provider URLs, or causes. Keep the generic fallback.
- **MVP timing:** **Recommended before wider local/self-serve release; not a
  hard operator-assisted pilot gate if generic recovery is supported.**
- **Dependencies:** Confirm the pinned SDK’s exported error shapes; align
  expected-session-end handling with `ARCH-001`.
- **Regression risk:** Low to medium; error-only behavior, but incorrect mapping
  could mislead users.

### ARCH-003 — Current coordination and ownership are local-only

- **Category:** Architecture / backend readiness.
- **Severity:** High for horizontal/public deployment; Low for the declared
  local deployment.
- **Evidence:** **Code-confirmed:** reference work is coalesced in process-local
  Maps; assets use local directories and atomic renames; owner identity is a
  hash of exact loopback Host including port. **Repository-documented:** the
  backend is database-free and single-operator.
- **Affected files:** reference coordinator/store/layout, owner derivation,
  persistence repositories, API composition, future deployment.
- **User or developer impact:** Multiple API processes could duplicate billable
  work, race mappings, or disagree about locks. Host namespace is not account
  identity. None of this is a defect for one loopback operator.
- **Recommended correction:** Keep the current implementation for the pilot.
  Stabilize opaque IDs, operations, fingerprints, provenance, relationships,
  versions, and timestamps. At backend stage, use authenticated subject/tenant
  ownership, transactional records/object storage, durable idempotency, and
  leases. Do not add distributed machinery before that deployment exists.
- **MVP timing:** **Safe to defer until backend work; blocks multi-process or
  public claims.**
- **Dependencies:** Account/tenant model, retention, billing semantics, and
  deployment topology.
- **Regression risk:** High when implemented; requires data migration,
  concurrency, tenancy, and recovery testing.

### SEC-001 — No public authentication, authorization, or tenancy

- **Category:** Security / deployment.
- **Severity:** Critical for any remote exposure.
- **Evidence:** **Code-confirmed:** the server accepts loopback Host/Origin and
  has no user session or per-resource authorization; runtime host is loopback
  and `trustProxy` is false. **Repository-documented:** LAN, tunnel, ingress,
  reverse proxy, and public hostname exposure are prohibited.
- **Affected files:** API app/security, every provider and asset route, future
  session/account/deployment/storage code.
- **User or developer impact:** If the local boundary is bypassed or changed
  without a new design, callers could consume provider credits or access another
  user’s assets without accountability.
- **Recommended correction:** Preserve loopback-only operation. Before remote
  launch, add secure authentication/session/CSRF design, per-resource
  authorization, tenant isolation, TLS, secret rotation, auditability, deletion,
  and support tooling. Treat Decart Origin scope as defense-in-depth only.
- **MVP timing:** **Safe to defer for the controlled local pilot; mandatory
  before any remote/public launch.**
- **Dependencies:** Account/tenant model, deployment topology, privacy policy.
- **Regression risk:** High; cross-cutting security and migration work.

### SEC-002 — No rate, entitlement, or provider-cost enforcement

- **Category:** Security / abuse / cost.
- **Severity:** High for remote/public deployment.
- **Evidence:** **Code-confirmed:** body/time limits and reference-operation
  serialization exist, but no per-user rate limit, concurrency budget, plan
  entitlement, credit reservation, or usage ledger exists. Provider calls can
  consume paid resources.
- **Affected files:** all provider routes/services, future auth/usage store,
  capabilities/status UI, cost disclosure.
- **User or developer impact:** A public caller could mint tokens, generate
  images, or run Voice requests until quota/spend is exhausted. Disabled browser
  buttons do not enforce policy.
- **Recommended correction:** For the controlled pilot, use operator-owned
  accounts, an allowlist, scripted limits, and support procedures. At backend
  stage, enforce authenticated rate/concurrency/entitlement controls and
  idempotent usage settlement, with provider-side quotas where available.
- **MVP timing:** **Operationally bounded for controlled pilot; mandatory
  server enforcement before remote/public launch.**
- **Dependencies:** `SEC-001`, plans/pricing, failure/refund policy, provider
  usage semantics.
- **Regression risk:** Medium to high; enforcement errors can block valid use or
  mis-settle usage.

### SEC-003 — Browser policy is relaxed for realtime compatibility

- **Category:** Security / browser policy.
- **Severity:** High for public deployment; Low for declared loopback use.
- **Evidence:** **Code-confirmed:** Helmet is enabled, while CSP and COEP are
  disabled because Decart WebSocket/media origins vary. No application use of
  unsafe HTML/dynamic evaluation was found.
- **Affected files:** `apps/api/src/app.ts`, deployment configuration, provider
  origin inventory, static/media policy.
- **User or developer impact:** A future injection would face fewer browser
  restrictions. A guessed strict policy could also break WebRTC/media.
- **Recommended correction:** At deployment design time, inventory exact
  HTTPS/WSS/media/worker origins and test a deployment-specific CSP. Verify COEP
  compatibility rather than enabling it blindly.
- **MVP timing:** **Safe to defer locally; required deployment review before
  public launch.**
- **Dependencies:** Stable production/provider origins and hosting topology.
- **Regression risk:** High for provider connectivity if misconfigured.

### SEC-004 — Immutable reference media lacks deletion/retention lifecycle

- **Category:** Security / privacy / persistence.
- **Severity:** High when external participants use personal media.
- **Evidence:** **Code-confirmed:** the store supports immutable read/write and
  idempotency, not ordinary deletion. Browser relationships can be removed while
  bytes remain. **Repository-documented:** site-data clearing does not remove
  `LIGHTFRAME_DATA_DIR`; only operator directory removal does.
- **Affected files:** reference store/routes/service, Recipe Shelf, Character
  Builder drafts/save journal, privacy/UI copy, future account storage.
- **User or developer impact:** A person may reasonably believe Remove,
  character deletion, or browser clearing erased a photo when the bytes remain.
  Unsafe orphan deletion could instead break drafts, history, or derivations.
- **Recommended correction:** Controlled pilot: disclose retention at
  upload/save/remove, use an isolated disposable directory per participant or
  cohort, record requests, and verify whole-dataset retirement after browser
  relationships are handled. If that procedure cannot be supplied, do not offer
  personal-image upload externally. Self-serve local: coherent erase-all across
  browser and server stores. Public account product: authoritative ownership,
  relationships, retention, tombstones/audit, backups, and tenant-safe deletion.
- **MVP timing:** **Disclosure and verified cleanup are controlled-pilot gates;
  per-asset/full account lifecycle is deferred.**
- **Dependencies:** Retention policy, ownership model, backups, export/cleanup
  semantics.
- **Regression risk:** High for any deletion implementation without complete
  relationship integrity.

### SEC-005 — Provider configuration is not moderation policy

- **Category:** Security / content safety / abuse.
- **Severity:** High for external/public use.
- **Evidence:** **Code-confirmed:** Wiro pins an uncensored Seedream endpoint;
  OpenAI uses low moderation; BFL has configured safety tolerance; safe refusal
  mapping exists but no app-level pre/post policy, release allowlist, reporting,
  or enforcement workflow exists.
- **Affected files:** environment/provider factory, reference service/providers,
  prompt optimizer, release policy/docs/tests.
- **User or developer impact:** Safety varies by deployment configuration.
  External users may receive disallowed/harmful output or create policy/support
  exposure.
- **Recommended correction:** For a controlled pilot, define participants,
  allowed content, reviewed provider/settings, refusal/support handling, and
  exclude the uncensored provider by default. Before public use, implement
  audience-appropriate server enforcement, reporting, audit metadata, and
  deterministic safety tests. Do not present a provider setting as a guarantee.
- **MVP timing:** **Operational/configuration gate before external pilot; full
  moderation system before self-serve/public launch.**
- **Dependencies:** Audience, acceptable-use policy, provider terms,
  support/escalation.
- **Regression risk:** Medium; stricter policy can alter success/output.

### SEC-006 — Voice duration is enforced only by the browser

- **Category:** Security / provider contract / cost.
- **Severity:** Medium.
- **Evidence:** **Code-confirmed:** `VoiceEffectsPanel` blocks originals over
  five minutes; the API validates MIME, non-empty data, and 25 MiB but does not
  derive decoded duration. **Provider-doc-confirmed:** Voice Changer accepts a
  maximum five-minute segment.
- **Affected files:** voice route/service, future media inspection/ingestion,
  contracts, tests.
- **User or developer impact:** A direct request to a future untrusted API could
  submit more than five minutes under the byte limit, causing avoidable provider
  work/rejection.
- **Recommended correction:** Keep the UI guard locally. At an untrusted server
  boundary, derive duration server-side or use an authenticated ingestion record
  whose duration was server-derived; never trust a client number alone.
- **MVP timing:** **Safe to defer for the supported local UI; required before a
  public API.**
- **Dependencies:** Upload/media-inspection architecture.
- **Regression risk:** Medium because codec/container support is complex.

### SEC-007 — Development-only dependency advisories remain

- **Category:** Security / development toolchain / supply chain.
- **Severity:** Medium effective repository risk; npm classifies six transitive
  advisories as High and one as Low.
- **Evidence:** **Command-confirmed:** `npm audit --omit=dev --audit-level=high`
  reports zero production vulnerabilities. A full `npm audit` reports
  `brace-expansion` through the ESLint/minimatch toolchain and a Windows
  development-server file-read advisory in tsup's nested esbuild. npm's forced
  remediation proposes a breaking `eslint-plugin-jsx-a11y` downgrade, so it is
  not an audit-safe automatic change.
- **Affected files:** `package.json`, `package-lock.json`, lint/build tooling,
  CI dependency installation.
- **User or developer impact:** No vulnerable package is shipped in the
  production dependency graph. The findings still matter for contributors and
  CI that process untrusted patterns or run a development server on affected
  Windows environments.
- **Recommended correction:** Track compatible upstream releases, upgrade the
  direct toolchain dependencies or use a tested narrow override when supported,
  rerun the complete quality/build matrix, and retain the production audit as a
  release gate. Do not run `npm audit fix --force` or accept a breaking
  downgrade merely to clear the report.
- **MVP timing:** **Recommended repository maintenance before broader
  contributor/CI exposure; not a controlled local-pilot or production-runtime
  blocker.**
- **Dependencies:** Compatible ESLint/plugin/minimatch and tsup/esbuild release
  graph.
- **Regression risk:** Medium; toolchain overrides can break lint resolution or
  package builds.

### PERF-001 — Recording and processing memory are duration-dependent

- **Category:** Performance / reliability / resource exhaustion.
- **Severity:** High.
- **Evidence:** **Code-confirmed:** recorder attempts retain main and sidecar
  chunk arrays; finalization creates Blobs; original, sidecar, and a processed
  replacement may coexist until Close/Discard. There is no runtime duration
  limit. **Product-owner decision:** the intended maximum is 300 seconds.
  **Repository-documented:** the memory policy requires idle, 1/5-minute,
  finalization, processing, and cleanup measurements. No committed
  physical-target result table was found in the audit.
- **Affected files:** recording attempt/artifact/controller modules, voice
  processing/remux, stage/review, memory/browser-support/release docs.
- **User or developer impact:** Long/high-bitrate takes can peak again during
  finalization and processing; constrained browsers may terminate the tab and
  lose an undownloaded take.
- **Recommended correction:** Enforce 300 seconds with an accessible warning and
  safe automatic Stop/finalize. Measure 1 and 5 minutes, finalization, local and
  ElevenLabs processing, and cleanup on every named target. Publish the support
  contract only after those results pass. Never silently evict
  chunks/originals.
- **MVP timing:** **Required controlled-pilot behavior and evidence gate.**
- **Dependencies:** Final device/browser matrix.
- **Regression risk:** Medium/high for cap/finalization behavior; none for
  evidence.

### PERF-002 — Successful ElevenLabs output is unbounded

- **Category:** Performance / availability.
- **Severity:** Medium.
- **Evidence:** **Code-confirmed:** successful upstream audio forwards optional
  `Content-Length` without enforcing a ceiling; the stream helper forwards the
  body; browser clients call `response.blob()`.
- **Affected files:** ElevenLabs HTTP provider, audio stream contract, streaming
  helper, browser voice client, tests.
- **User or developer impact:** An unexpectedly large/endless successful
  response can consume server bandwidth and browser memory. Provider trust
  lowers likelihood but does not eliminate the availability risk.
- **Recommended correction:** Define separate preview/conversion ceilings;
  reject oversized declared length; count chunked bytes and cancel upstream on
  overflow; return a safe invalid-response/payload error; preserve the original
  or prior valid artifact. Add a browser defense if practical.
- **MVP timing:** **Recommended before controlled pilot when Voice is included;
  required before unassisted/public use.**
- **Dependencies:** Observed valid output sizes, selected output format/bitrate,
  five-minute input policy.
- **Regression risk:** Low to medium; too-low limits could reject valid output.

### PERF-003 — Idempotency repair is linear in retained assets

- **Category:** Performance / storage.
- **Severity:** Medium at scale; Low locally.
- **Evidence:** **Code-confirmed:** a missing/malformed request mapping triggers
  directory enumeration and sequential metadata reads; detached assets are
  retained.
- **Affected files:** reference asset store/layout and future durable
  persistence.
- **User or developer impact:** Repair latency grows with retained asset count;
  this is currently an uncommon recovery path.
- **Recommended correction:** Keep the scan for local resilience. During
  backend migration use a transactional unique `(owner_id, request_id)` index
  and durable fingerprint; retain a bounded admin repair path.
- **MVP timing:** **Safe to defer until backend work.**
- **Dependencies:** `ARCH-003` storage migration.
- **Regression risk:** Medium during migration.

**Implementation update (2026-07-28):** the browser now preserves and validates the app-owned
maximum, starts one monotonic clock only after session commit, exposes maximum/elapsed/remaining
with a static 30-second warning, reconciles allowlisted SDK tick/end seconds without exposing raw
reasons, retains reconnect budget, distinguishes early end/disconnect from expected completion,
and preserves local fallback/current recipe. Expected expiry during recording routes through the
existing finalize-before-release owner. Deterministic unit/controller and focused Chromium
coverage pass, as do the matching WebKit and mobile-project journeys. The finding remains a
controlled-pilot evidence gate until both claimed Decart configurations pass the gated paid
maximum-duration smoke on the supported physical matrix.

### SYS-TEST-001 / TEST-004 — Decart lifecycle behavior is not covered

- **Category:** Testing / provider lifecycle.
- **Severity:** Medium.
- **Evidence:** **Code-confirmed:** API tests cover constraint values and web
  fixtures can include constraints, but production client types drop them. No
  web journey covers generation tick/end, max-session warning, expected cap
  completion, or typed Decart error recovery.
- **Affected files:** gateway/resource/session tests, Studio tests, deterministic
  realtime driver, E2E harness.
- **User or developer impact:** `ARCH-001`/`ARCH-002` can regress without
  observable failure until a paid/live session.
- **Recommended correction:** Extend the deterministic seam with tick/end and
  allowlisted error events. Test countdown start, near-expiry warning, reconnect
  budget, expected completion during recording, finalization-before-release,
  local fallback, cleanup, and raw-message non-leakage.
- **MVP timing:** **Required with `ARCH-001`; recommended with `ARCH-002`.**
- **Dependencies:** App-owned session usage/error types.
- **Regression risk:** Low.

**Implementation update (2026-07-28):** automated coverage now includes API constraint
preservation/rejection, accelerated monotonic boundary and warning, forward-only provider
reconciliation, reconnect-budget retention, expected and early generation ends, listener cleanup,
late/cancel/unmount owners, raw-reason non-leakage, and expiry-during-recording ordering. The
remaining `TEST-004` work is live maximum-duration evidence plus the broader safe typed-error
classes tracked with `ARCH-002`.

### SYS-TEST-002 / TEST-005 — Physical recording evidence is absent

- **Category:** Testing / release evidence.
- **Severity:** High.
- **Evidence:** **Repository-documented:** the memory policy requires real
  target measurements and rejects emulator-only proof for physical mobile.
  **Audit-baseline evidence:** no checked-in target result table was found.
- **Affected files:** recording memory policy, manual QA/release evidence,
  browser support claims.
- **User or developer impact:** Automated tests cannot establish Blob/heap
  peaks, codec bitrate, finalization/remux stability, cleanup recovery, or
  mobile tab survival.
- **Recommended correction:** Record versioned device/browser/OS, codec,
  duration, main/sidecar rates, memory observations, finalization/processing
  time, cleanup recovery, and pass/fail. Re-run after recorder/remux/support
  policy changes.
- **MVP timing:** **Required before claiming each target and duration.**
- **Dependencies:** `PERF-001`.
- **Regression risk:** None to product behavior.

### SYS-TEST-003 / TEST-006 — Oversized successful audio lacks tests

- **Category:** Testing / security.
- **Severity:** Medium.
- **Evidence:** **Code-confirmed:** tests cover normal streams, request size,
  MIME, cancellation, and safe errors, but no response ceiling or declared/
  chunked overflow tests exist.
- **Affected files:** ElevenLabs provider/route/browser-client tests.
- **User or developer impact:** A `PERF-002` fix could truncate output, fail to
  cancel upstream, leak errors, or discard a valid original without detection.
- **Recommended correction:** Cover oversized `Content-Length`, absent/false
  length with cumulative overflow, exact-boundary success, upstream
  cancellation, safe error mapping, and original/prior-artifact preservation.
- **MVP timing:** **Required with `PERF-002`.**
- **Dependencies:** Output-ceiling policy and counting stream helper.
- **Regression risk:** Low.

### DOC-001 / TEST-007 — Included provider qualification is unverified

- **Category:** Provider compatibility / release evidence.
- **Severity:** High for the selected pilot scope.
- **Evidence:** **Code-confirmed:** app/contracts/token allowlist/tests and
  installed SDK 0.1.15 pin `lucy-vton-3`. **Provider-doc-confirmed:** current
  official examples use `lucy-vton-latest`, which does not prove exact v3
  entitlement. **Repository-documented:** Lucy, VTO, ElevenLabs, and
  OpenAI/BFL/Wiro use deterministic fakes in ordinary tests; those fakes cannot
  prove account entitlement, quota, retention eligibility, output quality, or
  the separately selected image-provider configurations.
- **Affected files:** provider model/configuration constants, contracts,
  token/voice/reference adapters and tests, `docs/LIVE_PROVIDER_SMOKE.md`, and
  release evidence.
- **User or developer impact:** CI may pass while the configured accounts cannot
  start VTO, convert through the saved voice, or complete one of the three
  selected reference-provider workflows.
- **Recommended correction:** Keep the pin unless product approves a migration.
  Record dated Lucy 2.5 and exact VTO 3 smokes, the complete ElevenLabs
  browse/preview/Apply/remux/Download path, and separate OpenAI, BFL, and Wiro
  optimize/generate/compose/edit passes. Include account/environment class,
  exact model/configuration, safe outcome, and provider-doc link. Treat model
  changes as contract migrations, never silent aliases or fallback.
- **MVP timing:** **Required because all provider paths are included.**
- **Dependencies:** Assigned credential/billing/evidence owner, authorized
  provider accounts, network, and named physical devices.
- **Regression risk:** None for evidence; high for silent model migration or
  fallback.

### UX-001 / TEST-001 — Touch recovery implementation; physical evidence pending

- **Category:** Accessibility / interaction architecture.
- **Severity:** Critical. Touch/mobile creation is an approved pilot
  requirement.
- **Audit-time evidence:** the live/playback control bar hid after an idle
  timeout, then became `aria-hidden` and `inert`; recovery covered mouse
  movement and keyboard, not explicit pointer/touch. Stop Recording lived
  inside the bar. A physical cross-engine reproduction remains **unverified**.
- **Affected files:** `StudioSessionControlBar.tsx` and tests, persistent stage
  activity boundary, E2E touch coverage.
- **User or developer impact:** A touch-only user may be unable to recover
  camera/microphone/AI/playback actions or Stop Recording.
- **Recommended correction:** Keep one auto-hide owner and timer; observe
  stage-scoped pointer activity outside the inert subtree; retain keyboard/mouse
  behavior; never auto-hide while recording; test full-timeout recovery in live
  and playback and perform a recovered action.
- **MVP timing:** **Required before the touch/mobile-inclusive controlled pilot
  because Stop loss is severe.**
- **Dependencies:** Supported device/browser declaration and real-device smoke.
- **Regression risk:** Low to medium; event/timer ownership can cause flicker or
  competing timers if duplicated.
- **Implementation status (2026-07-28):** corrected in `MediaStage` and
  `StudioSessionControlBar` with one timer owner, stage-bound pointer/touch/focus
  recovery, keyboard recovery, dominant never-hidden Stop, component lifecycle
  coverage, and a real-time mobile touch E2E. Physical matrix and
  assistive-technology evidence remain open.

### UX-002 / TEST-002 — Saved-character entry loses category intent

- **Category:** Architecture-adjacent journey/state routing.
- **Severity:** High for the Character-first product.
- **Evidence:** **Code-confirmed:** both “Choose saved character” entries call
  the same Studio open helper, which changes model mode and opens Recipe Shelf
  without a category. The Shelf controller initializes to `saved`; it changes
  to `characters` only after an active character changes. Current chooser tests
  assert callback invocation, not the resulting collection.
- **Affected files:** `StudioApp.tsx`, AI chooser/header entry wiring,
  `useRecipeShelfController.ts`, integration/E2E tests.
- **User or developer impact:** The promised action opens generic Saved work,
  adding ambiguity and corrupting any measurement of character reuse.
- **Recommended correction:** Add a one-shot app-owned Shelf entry intent
  (mode/category and optional heading context), apply it through the existing
  controller, and clear/consume it deterministically. Do not create a second
  picker/store or encode navigation intent in active recipe state.
- **MVP timing:** **Required for the default Character/reuse pilot.**
- **Dependencies:** Existing Shelf controller/category API and copy.
- **Regression risk:** Low; integration state must not persist accidentally
  across later Shelf opens.

### PROD-003 — Direct Decart Start lacks action-surface disclosure

- **Category:** Provider trust / explicit cost-sensitive contact.
- **Severity:** High.
- **Evidence:** **Code-confirmed:** Recipe Dock says Start sends live camera,
  applied recipe, and optional reference to Decart and says when usage ends.
  Prepared Character/VTO actions in `AIExperienceChooser` start the model
  directly without equivalent data/provider/session disclosure. The action is
  visibly AI; the gap is what leaves, who receives it, and the boundary.
- **Affected files:** `AIExperienceChooser.tsx`, `SessionComposer.tsx`, shared
  disclosure UI/copy, Studio integration tests.
- **User or developer impact:** The primary decision can begin external media
  traffic and provider usage without the same informed context as the advanced
  Dock path; duplicated copy can drift.
- **Recommended correction:** Put concise inline disclosure beside the direct
  Start actions, backed by one app-owned disclosure component/copy source shared
  with Dock. Avoid a persisted consent ledger or new modal for the local pilot.
  Test that disclosure is visible before token/provider contact.
- **MVP timing:** **Required before a controlled external AI pilot.**
- **Dependencies:** `ARCH-001` session-limit copy and provider/retention policy.
- **Regression risk:** Low; layout/readability and snapshot changes.

### UI-TEST-VISUAL / TEST-003 — Visual regression can protect false states

- **Category:** Testing / release confidence.
- **Severity:** High for visual/mobile sign-off; not proof of a runtime defect.
- **Evidence:** **Audit-baseline evidence:** “idle” opened Recipe Dock, the
  selected-character live state used a direct prompt, and a small-mobile Latest
  Take baseline showed only `Loading studio tool…`. Character Builder and the
  actual saved-character path were absent. The executable/pruning inventory
  treated exact 29 equality as the main guard.
- **Affected files:** `e2e/studioVisualMatrix.ts`,
  `e2e/studio.visual.spec.ts`, broad screenshot helpers, prune inventory,
  screenshot coverage docs and baselines.
- **User or developer impact:** Passing screenshots can falsely suggest that
  initial impression, character reuse, Take Review readiness, and high-risk
  responsive states are protected.
- **Recommended correction:** Stabilize behavior first. Add semantic readiness
  assertions and fail unresolved fallback. Rebalance within a 29-case review
  budget toward the state topology in section 12. Review Darwin and Linux
  outputs manually. Treat required scenarios/readiness—not count alone—as the
  invariant. Consolidate a shared typed scenario registry only after the
  immediate states are truthful.
- **MVP timing:** **Required before claiming visual/mobile sign-off; not by
  itself a blocker for the first operator-assisted desktop research session.**
- **Dependencies:** `UX-001`, `UX-002`, `PROD-003`, `ARCH-001`, settled lazy
  boundaries, final release scope.
- **Regression risk:** Medium; broad rebaselining can hide unrelated regressions
  if performed before semantic review.

## 16. Architectural strengths

1. **Dependency direction is clean.** Pure domain/contracts do not depend on
   React or provider payloads; browser/API/provider responsibilities are
   explicit.
2. **Local Camera is a real local mode.** It works without provider credentials,
   token minting, SDK load, or external media traffic.
3. **Media ownership is unusually disciplined.** Healthy stream replacement,
   cloned provider input, remote track identity preservation, abort/generation
   guards, and deterministic cleanup reduce race/leak risk.
4. **Stage continuity is first-class.** One persistent player survives overlays,
   mode changes, finalization, and playback handoff without tool panels owning
   media.
5. **Recording prioritizes artifact safety.** Final data precedes release;
   duplicate Stop coalesces; valid main video survives sidecar failure;
   immutable originals survive processing cancellation/failure.
6. **Provider boundaries protect secrets and cost intent.** Permanent keys stay
   server-side, selection is explicit, request formats remain in adapters, and
   automatic fallback/rebilling is avoided.
7. **Reference storage has strong local integrity.** Immutable atomic records,
   private modes, provenance, idempotency fingerprints, opaque IDs, and repair
   behavior are appropriate for one operator.
8. **Errors are defensive.** Inputs are validated, upstream data is normalized,
   unsafe URLs are rejected, and raw provider/secret/user content is excluded
   from browser errors and diagnostics.
9. **Tests are layered and provider-free by default.** Domain, hook, provider,
   route, Storybook, E2E, production, visual, and manual/live seams are distinct.
10. **Documentation states the local/public boundary honestly.** The repository
    does not pretend loopback safeguards are public authorization.

## 17. Architectural weaknesses

### Confirmed weaknesses

- Enforced Decart runtime limits are not carried through to the browser.
- Realtime provider error distinctions are lost.
- Recording support is not backed by physical-target evidence.
- Successful Voice output is not bounded.
- Immutable references do not have an ordinary user-facing lifecycle.
- Local ownership/idempotency cannot scale horizontally or become account
  ownership without replacement.
- Public security, cost, moderation, deletion, CSP, and operations controls are
  intentionally absent.
- Development-only lint/build dependencies have unresolved advisories despite a
  clean production audit.
- Configuration presence is easy to overstate as provider readiness.
- High-impact responsive/dynamic states lack real-device/assistive-tech proof.
- The visual suite’s case-count invariant can pass while scenarios are not
  semantically ready.

### Cross-specialist disagreements and final resolutions

| Question                                                       | Challenge positions                                                                 | Canonical architecture resolution                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is first-run onboarding a pilot blocker?                       | Product initially said required; challenge passes found no observed user evidence   | Not a technical gate for an operator-assisted pilot. Use a moderator task and gather evidence; add the smallest in-context guidance before unassisted activation measurement. No new route/modal tour.                                   |
| Should Dock/Shelf/Workshop/Recipe be renamed now?              | Dense vocabulary is accepted; exact replacement labels are disputed                 | Keep internal ownership/names for now; add action-first subtitles/copy and validate labels before repository-wide churn. Correct “Systems ready” to configuration language now.                                                          |
| Is touch auto-hide P0 for a desktop pilot?                     | Systems treated consequence as P0; product/UI made it conditional on support matrix | Superseded by the product-owner decision: touch/mobile creation is required, so pointer/touch recovery and physical evidence are unconditional pilot gates.                                                                              |
| Is saved-character category equivalent to stranded Stop?       | Both are real; harm differs                                                         | It is a controlled-pilot gate because Character reuse is the default product spine, but its immediate physical harm is lower than inaccessible Stop.                                                                                     |
| Must `generationTick` be the acceptance criterion?             | Systems favored wiring it; product/UI emphasized authoritative cap and UX           | Preserve server cap and app monotonic budget as the user contract; wire tick/end through the existing SDK seam for reconciliation/recovery, but never equate ticks with billed credits without evidence.                                 |
| Is a per-asset data manager required now?                      | Outcome accepted; implementation disputed                                           | No. Controlled pilot uses disclosure + isolated data + verified whole-dataset retirement. Coherent erase-all precedes self-serve; relationship-aware deletion belongs to account storage.                                                |
| Does unbounded recording require an arbitrary five-minute cap? | No measurement supported a particular recording limit at audit time                 | Superseded by the product-owner decision: enforce and measure a 300-second maximum. The numerically equal AI and Voice limits remain separate provider contracts.                                                                        |
| Must VTO block a Character-only pilot?                         | No                                                                                  | Superseded by the product-owner decision to include VTO. Exact `lucy-vton-3` entitlement/output smoke is now required; do not silently switch aliases.                                                                                   |
| Is full moderation required for controlled use?                | Public system is overreach; policy is not                                           | Reviewed provider/settings and an operator policy are pilot gates. Enforcement/reporting/appeal/abuse operations are public-launch work.                                                                                                 |
| Is analytics infrastructure required?                          | Product learning is valuable; network analytics conflict with local posture         | Use moderated observation or opt-in content-free local diagnostics first. No prompts, media, names, voice IDs, URLs, or secrets in telemetry.                                                                                            |
| Is a Voice confirmation threshold required?                    | No evidence supports an arbitrary threshold                                         | Show duration/provider usage context; gather cost/behavior evidence before adding confirmation friction.                                                                                                                                 |
| Must all 29 visual cases be replaced before first research?    | Systems accepted target topology after behavior; product favored surgical repair    | False/fallback central states must be corrected for visual sign-off. Keep 29 as current review budget and adopt semantic readiness/state topology after behavior settles; wholesale infrastructure refactor is not a runtime-pilot gate. |
| Should large files be split now?                               | No                                                                                  | Refactor only at ownership/lifecycle triggers, not line counts.                                                                                                                                                                          |

### Unresolved evidence, not architecture disagreements

- Exact pilot cohort and named device/browser support matrix.
- Retention/deletion promise, provider/settings/content policy, and assigned
  live-smoke credential/billing/evidence owner.
- Physical touch/assistive-tech behavior across claimed targets.
- Recording bitrate/memory/finalization/remux/cleanup measurements at the
  approved 300-second maximum.
- Decart tick/end/reconnect and billing semantics for the configured account.
- `lucy-vton-3` entitlement and quality.
- ElevenLabs zero-retention eligibility and valid maximum output sizes.
- Provider retention/deletion and Wiro cleanup outcomes.
- User comprehension of provider contact, retention, vocabulary, and output
  expectations.
- Fresh `quality`, coverage, E2E, visual, production, audit, live, and device
  results.

## 18. Recommended changes

Changes must preserve the existing dependency direction, persistent stage,
single overlay system, app-owned contracts, Local Camera isolation, immutable
original, and explicit provider selection.

### Gate 0 — Freeze the release contract

Decisions already recorded: touch/mobile creation is included; Character,
VTO, local Voice, ElevenLabs, and separate OpenAI/BFL/Wiro configurations are
included; the maximum take is 300 seconds; deployment remains loopback-only.

Still decide and document:

- operator-assisted or unassisted cohort;
- exact desktop/touch/mobile browser/device matrix;
- reviewed provider settings and external-participant content policy;
- credential, billing authorization, live-smoke evidence, and escalation owner;
- per-participant/cohort isolated data directory and cleanup procedure;
- success metrics and support/escalation.

Character remains primary, VTO remains a named beta, and no included provider
path may reach external participants before its smoke and policy gates pass.

### Gate 1 — Trust and primary-journey correctness

1. `UX-002` + `TEST-002`: carry one-shot Shelf entry intent to Characters from
   both saved-character entry points and test Use/Start.
2. `PROD-003`: place shared Decart data/provider/usage/session disclosure at the
   actual chooser Start actions.
3. `UX-001` + `TEST-001`: stage-owned pointer recovery and always-visible Stop
   while recording; unconditional because touch/mobile is included.
4. Replace capability-health overstatement with “configured/limited/available
   to try”; active connecting/connected health belongs to the session.

### Gate 2 — Observable provider lifecycle

1. `ARCH-001`: retain token constraints; add connected-time monotonic budget.
2. Subscribe/clean up allowlisted `generationTick`/`generationEnded`; normalize
   expected cap versus disconnect.
3. Display AI elapsed/remaining and warning without displacing recording
   controls.
4. Test expected cap during recording, finalization/source release order, local
   fallback, reconnect budget, and cleanup using `TEST-004`.
5. Run a dated live max-duration smoke; do not claim provider ticks are billing
   truth until verified.

### Gate 3 — Resource, retention, safety, and included-provider evidence

1. `PERF-001` + `TEST-005`: enforce the 300-second maximum with warning and safe
   Stop/finalize, then complete physical measurement for each claimed target,
   including local and ElevenLabs Voice processing.
2. `SEC-004`: add concise retain/detach/delete copy; verify isolated data and
   whole-dataset retirement.
3. `SEC-005`: fix release provider/settings and operational content/support
   policy. Wiro is included for qualification but cannot be offered externally
   until that policy explicitly approves its configured model/settings.
4. `DOC-001` + `TEST-007`: live Lucy 2.5 prompt/image/both; exact VTON 3; full
   ElevenLabs browse/preview/Apply/remux/Download; and separate OpenAI, BFL, and
   Wiro reference-provider passes.
5. Exercise auth/quota/outage/refusal/disconnect/expected-cap recoveries and
   confirm Local Camera makes no provider request.
6. `PERF-002` + `TEST-006`: bound Voice output before unassisted/public use;
   prefer completing it for any external Voice pilot once valid output sizes are
   measured.

### Gate 4 — Truthful automated and visual evidence

1. Fix behavior before updating baselines.
2. Add semantic readiness; reject unresolved lazy fallback.
3. Protect true initial closed Studio, actual saved-character selection,
   deterministic selected-character live, Character Builder combined-ready, and
   settled Take Review.
4. Use the 29-state topology and five canonical viewports described in section
   12 as the current review budget; scenario/readiness invariants are the
   correctness rule.
5. Preserve deterministic media/time, denied external network, platform-specific
   Darwin/Linux baselines, and manual visual review.
6. Keep touch/provider lifecycle in behavioral tests; do not add live provider
   output or cross-browser pixel baselines.
7. Consolidate shared scenario setup only after false states are repaired.

### Gate 5 — Pilot learning

Use moderated observation or explicitly opted-in, content-free local diagnostics
to decide onboarding, vocabulary, Builder mobile presentation, VTO/Voice
prominence, returning-user resume, and cost-confirmation behavior. Do not build
accounts, billing, cloud storage, analytics infrastructure, or collaboration to
answer questions that a controlled pilot can answer first.

## 19. Deferred changes

### Safe to defer until backend work

- `ARCH-003`: durable multi-process coordination, database/object storage, and
  authenticated ownership.
- `SEC-001`: authentication, secure sessions/CSRF, authorization, tenancy.
- `SEC-002`: server rate/concurrency/entitlement/usage settlement.
- `SEC-003`: deployment-specific CSP/COEP/TLS/secrets.
- `SEC-006`: server-derived Voice duration at an untrusted boundary.
- `PERF-003`: indexed idempotency and scalable asset storage.
- relationship-aware retention/deletion, backup treatment, audit history.
- production metrics/traces/alerts, incident response, deployment/rollback.

These are deferred only while the release stays loopback-only and
operator-controlled. They are absolute prerequisites for remote/public use.

### Post-MVP, evidence-triggered

- cloud recording/history and account media libraries;
- accounts and account-level settings;
- credits/subscriptions/billing after pricing, failure, and refund semantics;
- provider fallbacks only after cost/safety/idempotency policy;
- creator sharing/collaboration/templates;
- privacy-reviewed analytics backend;
- persistent/streamed recording chunks if supported duration and demand justify
  it;
- multi-region/distributed infrastructure after a real load/deployment need.

### Avoid for now

- automatic provider fallback;
- a generic provider mega-interface;
- a global state-management rewrite;
- duplicating media, overlay, picker, repository, or modal systems;
- line-count-driven splits of cohesive lifecycle modules;
- silent VTO alias migration;
- unsafe per-asset orphan deletion;
- silent chunk/original eviction;
- arbitrary recording or Voice confirmation thresholds without evidence;
- a new onboarding route or mandatory modal tour before research.

## 20. File-level evidence

The evidence below is the concrete audit trail. Line numbers are intentionally
omitted because concurrent modernization can move them; use the named symbols
and tests.

| Area                              | Primary evidence                                                                                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace/runtime                 | `package.json`, `package-lock.json`, `.nvmrc`, `apps/web/package.json`, `apps/api/package.json`, `packages/domain/package.json`, `packages/contracts/package.json`                                                                                                                              |
| Canonical architecture/deployment | `docs/ARCHITECTURE.md`, `docs/PRIVACY_AND_TEMPORARY_DATA.md`, `docs/BROWSER_SUPPORT.md`, `docs/RECORDING_MEMORY_POLICY.md`, `docs/LIVE_PROVIDER_SMOKE.md`, `README.md`, `AGENTS.md`                                                                                                             |
| Studio composition and routes     | `apps/web/src/studio/StudioApp.tsx`, `apps/web/src/studio/routeResolution.ts`, `apps/web/src/studio/useStudioOverlayController.ts`                                                                                                                                                              |
| Stable stage and overlays         | `apps/web/src/features/live-stage/MediaStage.tsx`, `stagePresentation.ts`, `apps/web/src/ui/OverlayPanel.tsx`, their tests/Stories                                                                                                                                                              |
| Control accessibility             | `apps/web/src/studio/StudioSessionControlBar.tsx`, `StudioSessionControlBar.test.tsx`                                                                                                                                                                                                           |
| AI chooser and disclosure         | `apps/web/src/studio/AIExperienceChooser.tsx`, `apps/web/src/features/media-session/SessionComposer.tsx`, `apps/web/src/studio/StudioApp.tsx`                                                                                                                                                   |
| Saved-character entry             | `apps/web/src/studio/StudioApp.tsx`, `apps/web/src/features/creative-assets/useRecipeShelfController.ts`, chooser/Shelf/Studio tests                                                                                                                                                            |
| Session ownership                 | `apps/web/src/orchestration/session/useStudioSession.ts`, `useSessionDraftState.ts`, `useModelSessionActions.ts`, `useRealtimeResource.ts`, `useOwnedLocalMedia.ts`, `useCapturePreferences.ts`                                                                                                 |
| Decart browser/API boundary       | `apps/web/src/adapters/decart-realtime/DecartRealtimeGateway.ts`, `apps/web/src/adapters/api-client/apiClient.ts`, `apps/api/src/features/realtime/routes.ts`, `apps/api/src/providers/decart/token-provider.ts`, `packages/contracts/src/realtime.ts`                                          |
| Model IDs/domain rules            | `packages/domain/src/session/modes.ts`, `packages/domain/src/session`, `packages/contracts/src/contracts.test.ts`                                                                                                                                                                               |
| Recording attempts/finalization   | `apps/web/src/orchestration/recording/useRecording.ts`, `recordingAttempt.ts`, `recordingArtifacts.ts`, `useRecordingArtifacts.ts`, `recordingMetadata.ts`, `apps/web/src/studio/useTakeReviewFlow.ts`                                                                                          |
| Voice processing/browser client   | `apps/web/src/features/voice-effects/VoiceEffectsPanel.tsx`, `apps/web/src/adapters/api-client/voicesApi.ts`, voice-processing/remux orchestration and tests                                                                                                                                    |
| ElevenLabs server boundary        | `apps/api/src/features/voices/routes.ts`, `voice-service.ts`, `apps/api/src/providers/elevenlabs/http-provider.ts`, `types.ts`, `apps/api/src/http/streaming.ts`, route/provider tests                                                                                                          |
| Character Builder state           | `apps/web/src/features/character-builder/useCharacterBuilderController.ts`, `draftRepository.ts`, `characterBuilderPersistence.ts`, `useCharacterSaveJournal.ts`, reference upload/generation hooks, tests                                                                                      |
| Creative repositories             | `apps/web/src/features/creative-assets/repository.ts`, `types.ts`, `RecipeShelf.tsx`, `useRecipeShelfController.ts`, `apps/web/src/features/guided-flow/projectRepository.ts`                                                                                                                   |
| Reference routes/service/store    | `apps/api/src/features/reference-images/routes.ts`, `reference-image-service.ts`, `reference-image-operation-coordinator.ts`, `asset-store.ts`, `reference-image-preparation.ts`, their tests                                                                                                   |
| Image provider isolation          | `apps/api/src/providers/reference-images/provider-factory.ts`, `apps/api/src/providers/openai/reference-image-provider.ts`, `character-prompt-optimizer.ts`, `apps/api/src/providers/bfl/flux2-reference-image-provider.ts`, `apps/api/src/providers/wiro/seedream-reference-image-provider.ts` |
| Safe remote transport             | BFL/Wiro `safe-image-downloader.ts`, `apps/api/src/providers/transport/safe-remote-image-downloader.ts`, contract tests                                                                                                                                                                         |
| Security/config/errors            | `apps/api/src/app.ts`, `apps/api/src/http/security.ts`, `app-error.ts`, `errors.ts`, `apps/api/src/config/environment.ts`, provider/feature error mappers                                                                                                                                       |
| Domain/contracts                  | `packages/domain/src/assets`, `packages/domain/src/prompts`, `packages/domain/src/recording`, `packages/domain/src/errors/safe-error.ts`, `packages/contracts/src/reference-images.ts`, `voices.ts`, `realtime.ts`                                                                              |
| Functional/visual evidence        | `e2e/successful-studio-journeys.spec.ts`, `e2e/support/studioHarness*.ts`, `e2e/studio.visual.spec.ts`, `e2e/studioVisualMatrix.ts`, `e2e/capture-screenshots.screenshots.ts`, `scripts/prune-visual-baselines.mjs`, platform screenshot directories                                            |
| Quality/release gates             | root `package.json` scripts, `.github/workflows/quality.yml`, Playwright/Vitest/Storybook configs, `docs/MANUAL_QA.md`, `docs/LIVE_PROVIDER_SMOKE.md`                                                                                                                                           |

### Audit provenance and validation boundary

This document consolidates three independent specialist audits and their three
cross-specialist challenge passes. Graphify was used first to scope dependency,
provider, media, persistence, and test relationships; owning source, contracts,
tests, docs, installed SDK types, and current official provider documentation
were then checked directly.

No test pass is inferred from file presence. The read-only audit did not itself
run `npm run quality`, coverage, functional E2E, visual regression, production
smoke, dependency audit, live provider smoke, or physical-device memory/
accessibility checks. Concurrent screenshot modernization was present in the
shared worktree while this canonical document was written; section 12 therefore
records the audit-baseline defects and target invariants rather than claiming
that in-progress baselines are accepted.
