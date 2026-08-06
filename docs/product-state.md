# Lightframe Studio product state

**Current as of:** 2026-08-05

**Release frame:** local-first, single-operator development runtime

This is the concise product authority. Implementation details live in
[Architecture](ARCHITECTURE.md), [Privacy](PRIVACY_AND_TEMPORARY_DATA.md), and the
[observable user stories](userStories/README.md).

## Product

Lightframe Studio is a local-first browser camera studio for one operator:

> Record or Upload → Review → optional Virtual Try On, Character Swap, and/or Voice → Download

Post-recording editing is primary. Live Character/VTO camera transformation and Workshop are
advanced tools.

The product is local-first, not offline-only. Camera preview, local recording, drafting, uploads,
saved browser metadata, and local voice effects can run without an external media provider.
Decart, Pruna video/try-on, OpenAI optimization/image generation, BFL, Wiro, and ElevenLabs are
explicit provider actions that may incur usage or cost.

The Fastify server is a loopback integration broker with one seeded local demo account and
authenticated resource ownership. It is not a public backend and must not be exposed through LAN
binding, a tunnel, proxy, shared ingress, or public hostname.

## Audience and release posture

The supported runtime is a local, single-operator creation tool. Touch/mobile creation is required.
A remote or public product remains unsupported until identity, authorization, tenancy, spend,
retention, moderation, and operations receive a separately approved design.

## Current capabilities

- `/` is a provider-free entry with Login. `/studio`, `/studio/videos`, `/studio/characters`, and
  `/studio/outfits` are authenticated views of the same lazy-loaded Studio runtime; every other
  path returns to entry.
- One server-seeded user logs in with an Argon2id-verified password. A host-only, HTTP-only,
  `SameSite=Strict` JWT cookie lasts up to 24 hours and can restore the session after browser
  closure. Development prefills both configured demo credentials; production does not expose the
  prefill.
- Studio starts in neutral Local Camera mode. It does not request camera/microphone permission or
  start AI until the creator explicitly uses the control bar, upload/record panel, or advanced
  Dock flow.
- One persistent stage owns local/AI preview, uploaded-video preview, recording, finalization,
  result comparison, and take playback. Shared overlays never own a second media session.
- Local capture supports 16:9 landscape or 9:16 portrait preview/recording, device choice,
  browser-exposed camera switching, and capability-gated zoom.
- Character Builder supports prompt-only, direct upload, image-only, generated, and combined
  references with recoverable draft/save state.
- Recipe Shelf stores sanitized, versioned browser metadata and opaque reference relationships.
- Creative metadata and Character Builder drafts are user-namespaced. Saved Characters and Saved
  Outfits have dedicated Studio library routes without a second repository or media runtime.
- Saved Characters include normalized Wardrobe variants. The original remains the default;
  successful exact-version Use persists selection. Pruna powers explicit Add Outfit only, while
  Change Features remains on the startup-selected OpenAI/BFL/Wiro image provider.
- Character uses exact `lucy-latest`; VTO uses pinned `lucy-vton-latest`.
- Existing H.264 MP4/MOV and VP8 WebM sources can stay local or run exactly one selected visual
  operation. Character Swap uses startup-selected Decart or Pruna; VTO remains Decart. The two
  operations are mutually exclusive within an edited-video workflow. When Pruna is active, the
  Character Swap editor exposes a per-submission `720p`/`1080p` output choice.
- The artifact currently displayed on the stage can be trimmed, cropped to six modes, rotated,
  flipped, relit, and filtered locally. A dedicated worker publishes a validated H.264/AAC MP4 as
  a new immutable `edited` source only after explicit replacement confirmation. Non-16:9/9:16
  edits keep Download and Voice but disable visual-provider intent.
- OpenAI, BFL, and Wiro are separate startup-selected image-provider passes with no fallback.
- Recording owns an accessible warning at 270 seconds and coalesced Stop/finalize at 300 seconds.
- Studio keeps one temporary source/visual/voice pipeline. Download remains an external handoff;
  Save Video creates an owner-scoped gallery record with immutable versions and an optional
  locally generated thumbnail. Saving as new is default; confirmed replacement appends a version.
- Recording/finalization and active local video rendering block route exit. A temporary take,
  active Voice operation, dirty video edit, or dirty Shelf, Outfit Builder, or Wardrobe form
  requires confirmed discard before leaving Studio.
- Local and ElevenLabs voice treatments always start from immutable originals. ElevenLabs is
  limited to app-owned saved-voice relationships and receives only the audio sidecar on Apply.
  Removing a saved voice never deletes the provider's voice.
- Uploaded and generated references are immutable local assets. Detach, Reset, or browser-record
  deletion does not mean byte deletion.
- Retired Guided project records and videos are cleared when the authenticated Studio initializes;
  they are intentionally not migrated into the Saved Videos gallery.

## Current limitations

- There is only one configured local demo account. There is no signup, recovery, multi-user
  tenancy, cloud sync, collaboration, sharing, billing, or public authorization.
- Capability status proves configuration, not live health, entitlement, quota, output quality, or
  retention settings.
- Unsaved takes and active processing outputs are retained in browser memory. Saved video bytes,
  versions, and thumbnails are local filesystem data; physical codec and memory support still
  requires manual validation on the target device.
- Local video edits are session-only. Safari/Firefox/Chrome worker codec behavior, real render
  cancellation, maximum-size/five-minute memory, touch, download, and external playback require
  physical validation.
- Video-job state is process-local and temporary; refresh, crash, restart, or expiry does not
  recover an upload workflow, and local cleanup is not provider-side deletion.
- Reference assets have no relationship-aware per-asset deletion route. Use a dedicated local data
  directory when whole-environment retirement is required.
- The authenticated seeded-user model, filesystem persistence, and process-local sessions are
  valid only for the supported single-operator deployment.

## Validation status

The runtime and deterministic tests cover touch/pointer control recovery, never-hidden recording
Stop, saved-character entry, permission recovery, provider disclosures, truthful capability copy,
the independent Decart and recording time boundaries, immutable take processing, bounded
ElevenLabs output, responsive/reflow behavior, and provider-free network denial.

Automated project quality is the implementation gate. Physical-device, accessibility, long-take
memory, and live-provider checks remain valuable manual validation, but they do not disable
configured features or block normal project development.

## Product decisions

- Keep record/upload, review, and optional post-recording edits as the first-run product promise.
- Preserve live Character/VTO transformation as an explicit advanced flow.
- Keep provider contact explicit and preserve startup selection with no automatic fallback.
- Keep the 300-second recording and Decart limits independent.
- Keep the public-entry/private-Studio route family, one runtime, one stage, and shared-overlay
  architecture.
- Keep downloaded files outside the Lightframe dataset and keep Download distinct from Save Video.
- Retain tombstoned/unreferenced local media bytes until Phase 2 supplies a relationship-safe
  reconciliation policy.
- Use truthful Detach/retention language and support deliberate whole-environment retirement.
- Do not turn loopback identifiers, device IDs, storage paths, or provider IDs into future user
  identity.

## Deferred scope

Real accounts, signup/recovery, a durable session database, cloud persistence, differentiated
entitlements, billing, collaboration, sharing, templates/marketplaces, public voice
import/cloning, and commerce-aware VTO require separate product, security, privacy, cost, and
operations approval. The
[remote backend handoff](REMOTE_BACKEND_HANDOFF.md) is design-only and authorizes no remote
implementation.
