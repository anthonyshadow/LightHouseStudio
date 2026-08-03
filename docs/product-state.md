# Lightframe Studio product state

**Current as of:** 2026-08-03

**Release frame:** local-first, single-operator development runtime

This is the concise product authority. Implementation details live in
[Architecture](ARCHITECTURE.md), [Privacy](PRIVACY_AND_TEMPORARY_DATA.md), and the
[observable user stories](userStories/README.md). The former
[controlled-pilot contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md) is historical and does not gate
current application features or project validation.

## Product

Lightframe Studio is a local-first browser camera studio for one operator:

> Record or Upload → Review → optional Virtual Try On, Character Swap, and/or Voice → Download

Post-recording editing is primary. Live Character/VTO camera transformation and Workshop are
advanced tools.

The product is local-first, not offline-only. Camera preview, local recording, drafting, uploads,
saved browser metadata, and local voice effects can run without an external media provider.
Decart, OpenAI optimization/image generation, BFL, Wiro, and ElevenLabs are explicit provider
actions that may incur usage or cost.

The Fastify server is a loopback integration broker. It is not a public backend and must not be
exposed through LAN binding, a tunnel, proxy, shared ingress, or public hostname.

## Audience and release posture

The approved pilot has at most five invited, technically comfortable solo creators or design
partners. Every session is moderated from setup through verified cleanup. Touch/mobile creation is
required, but no physical target is qualified yet.

| Release model                 | State                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Operator-assisted local pilot | Runtime is substantially implemented; qualification evidence is open.                                          |
| Unassisted local beta         | Not approved by the current release contract.                                                                  |
| Remote/public product         | Unsupported; blocked by identity, authorization, tenancy, spend, retention, moderation, and operations design. |

## Current capabilities

- `/` is a provider-free entry and `/studio` is the lazy-loaded Studio runtime. They are the only
  registered routes; every other path returns to entry. Detected legacy projects remain
  compatibility-only downloads/deletions within Studio and have no URL entry.
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
- Character uses exact `lucy-latest`; VTO uses pinned `lucy-vton-latest`.
- Existing H.264 MP4/MOV and VP8 WebM sources can stay local or run exactly one selected visual
  operation. Character Swap uses startup-selected Decart or Pruna; VTO remains Decart. The two
  operations are mutually exclusive within an edited-video workflow.
- OpenAI, BFL, and Wiro are separate startup-selected image-provider passes with no fallback.
  Participant mode disables Wiro.
- Recording owns an accessible warning at 270 seconds and coalesced Stop/finalize at 300 seconds.
- Studio keeps one temporary source/visual/voice pipeline. Download is the durable handoff;
  Release or Discard revokes its URLs.
- Recording/finalization blocks route exit. A temporary take, active Voice operation, or dirty
  Shelf form requires confirmed discard before leaving Studio.
- Local and ElevenLabs voice treatments always start from immutable originals. ElevenLabs is
  limited to explicitly browsed saved voices and receives only the audio sidecar on Apply.
- Uploaded and generated references are immutable local assets. Detach, Reset, or browser-record
  deletion does not mean byte deletion.

## Current limitations

- There are no accounts, cloud projects, take history, sync, collaboration, sharing, billing, or
  public authorization.
- Capability status proves configuration, not live health, entitlement, quota, output quality, or
  retention settings.
- Takes and processing outputs are retained in browser memory; physical codec and memory support
  is unqualified.
- Video-job state is process-local and temporary; refresh, crash, restart, or expiry does not
  recover an upload workflow, and local cleanup is not provider-side deletion.
- Reference assets have no relationship-aware per-asset deletion route. Use a dedicated local data
  directory when whole-environment retirement is required.
- Host-derived ownership, filesystem persistence, and process-local coordination are valid only
  for the supported single-operator deployment.

## Validation status

The runtime and deterministic tests cover touch/pointer control recovery, never-hidden recording
Stop, saved-character entry, permission recovery, provider disclosures, truthful capability copy,
the independent Decart and recording time boundaries, immutable take processing, bounded
ElevenLabs output, responsive/reflow behavior, and provider-free network denial.

The former pilot validator and evidence thresholds are retired. Normal project quality remains the
automated implementation gate. Physical-device, accessibility, long-take memory, and live-provider
checks remain valuable manual evidence, but they do not disable configured features or block normal
project validation.

## Product decisions

- Keep record/upload, review, and optional post-recording edits as the first-run product promise.
- Preserve live Character/VTO transformation as an explicit advanced flow.
- Keep provider contact explicit and preserve startup selection with no automatic fallback.
- Keep the 300-second recording and Decart limits independent.
- Keep the two-route, one-runtime, one-stage, shared-overlay architecture.
- Keep downloaded files outside the Lightframe dataset and describe Download as the durable
  handoff.
- Use truthful Detach/retention language and support deliberate whole-environment retirement.
- Do not turn loopback identifiers, device IDs, storage paths, or provider IDs into future user
  identity.

## Archived controlled-pilot success metrics

These are small-cohort hypotheses, not release criteria. Record numerator, denominator, and
content-free timing so a percentage never hides a tiny sample.

### Activation

- At least 70% of first sessions reach local preview without intervention within 90 seconds.
- At least 50% reach review and initiate Download within five minutes of starting the supported
  capture loop.
- At least 60% of sessions with Character intent save/select a character and start Lucy 2.5 within
  ten minutes.

### Reliability and safety

- Local preview succeeds in at least 95% of attempts after permission on qualified targets.
- Decart connects in at least 90% of authorized attempts with verified prerequisites.
- At least 98% of Stop attempts produce a playable, downloadable main take.
- 100% of provider recordings finalize before owned live resources release.
- 100% of failed voice treatments preserve the immutable original.
- Zero sessions make an unexpected provider request or exceed a stated limit without its warning
  and defined recovery.

### Value, trust, and operations

- At least 60% of successful Character sessions produce a recording.
- At least 50% of completed AI takes are rated usable/exportable by the creator.
- Track seven-day character reuse as returning reusers divided by eligible returning
  participants; the initial hypothesis is at least 40%.
- Zero participants are surprised by provider contact or believe Detach deleted retained bytes.
- Track connected seconds, generation/conversion attempts, safe outcome class, support minutes,
  and provider cost per usable Download. Never record prompts, media, raw errors, URLs,
  credentials, provider payloads, or device identifiers.

## Archived pilot questions

- Does reusable identity, live transformation, faster capture, or local control drive return use?
- Where does the Record/Upload → Review → Edit → Download path still need operator explanation?
- Does saved-character reuse improve speed or output consistency at the return session?
- Does Voice materially improve usable output enough to justify cost and complexity?
- Does VTO solve a distinct job within its stated input and accuracy limitations?
- Is Download plus local files sufficient, or is portability/history a repeated unmet need?

## Deferred scope

Accounts, cloud persistence, entitlements, billing, take history, collaboration, sharing,
templates/marketplaces, public voice import/cloning, and commerce-aware VTO require pilot evidence
and separate product, security, privacy, cost, and operations approval. The
[remote backend handoff](REMOTE_BACKEND_HANDOFF.md) is design-only and authorizes no remote
implementation.
