# Controlled-pilot release contract

> Historical scope: retired on 2026-08-03. This contract is not a current runtime or release gate;
> pilot-specific access modes, submission caps, validators, and cleanup jobs have been removed.

**Approved:** 2026-07-28

**Scope:** Moderated, local, single-operator, loopback-only pilot

**State:** Target contract; not a support or qualification claim

Code and [observable user stories](userStories/README.md) define current behavior. This contract
defines what must be true before the pilot can start. A row remains unsupported until its
automated, physical-device, accessibility, memory, cleanup, and live-provider evidence passes.

## Pilot promise and boundary

- Primary promise: Record or Upload → Review → optional Virtual Try On, Character Swap, and/or
  Voice → Download. Direct `/studio` starts in neutral Local Camera mode with camera, microphone,
  and AI off until explicit action; upload requires no camera permission or provider credentials
  for local preview/download.
- Live Character/VTO camera transformation and Workshop are advanced supporting tools.
- Cohort: at most five invited, technically comfortable solo creators/design partners.
- Every session is scheduled, moderated, and operator-assisted from setup through cleanup.
- One isolated participant environment may be active at a time.
- Participants receive no provider credentials, shell access, shared ingress, or unsupervised
  provider-funded actions.
- The broker stays on loopback. LAN/tunnel/proxy/public hosting, accounts, billing, sharing, and
  cloud persistence are outside this contract.

## Qualification matrix

The exact executable matrix is
[`qualification/required-matrix.json`](qualification/required-matrix.json):

- `12` provider/local requirements: no-key Local; realtime Decart Character and VTO; Decart batch
  `lucy-latest`; Decart batch `lucy-vton-latest`; Pruna Character Swap at 720p and 1080p;
  Pruna Character Wardrobe; ElevenLabs; OpenAI; BFL; and operator-only Wiro.
- `45` physical device/browser rows across one desktop, Apple/Android phones, and
  Apple/Android tablets.

The frozen physical targets are:

- MacBook Pro 14-inch (2021, M1 Pro);
- iPhone 17, 17 Pro, 17 Pro Max, 16, and 16 Pro Max;
- Galaxy A07 4G, A16 5G, A56 5G, A36 5G, Redmi A5, plus Pixel 10 as the Android 17 sentinel;
- iPad (A16), iPad Air 11-inch (M3), iPad Pro 11-inch (M5), Galaxy Tab A9+, Galaxy Tab S10 FE,
  plus Pixel Tablet as the Android 17 tablet sentinel.

The 2026-07-28 version snapshot uses macOS/iOS/iPadOS/Safari 26.6, Android 17 sentinels, and the
stable Chrome/Firefox versions recorded in the matrix. Record the latest generally available
stable patch and its exact installed version when evidence is produced. Never use beta/nightly
builds or inherit support across a later OS/browser release.

An OEM device without stable Android 17 may be tested on its latest vendor-stable OS, but that does
not qualify an Android 17 claim. iOS browsers share WebKit but each browser app still needs its own
permission, viewport, download, interruption, and recovery pass. Safari is not an Android
requirement.

Use [Manual QA](MANUAL_QA.md), [live provider smoke](LIVE_PROVIDER_SMOKE.md), the
[memory protocol](RECORDING_MEMORY_POLICY.md), and the strict
[evidence contract](PILOT_QUALIFICATION_EVIDENCE.md). Responsive emulation, fakes, and evidence
from another commit do not qualify a physical/live row.

Current repository evidence remains historical; the pilot validator command has been removed.

## Independent five-minute boundaries

The runtime now enforces both app-owned limits and automated tests cover their ordering. Physical
and live qualification still remain open.

### Recording

- Maximum take: 300 seconds.
- At 270 seconds, show and announce a persistent 30-second warning without hiding Stop or moving
  the stage.
- At 300 seconds, invoke the coalesced Stop/finalize path once.
- Main video and optional sidecar settle before session-owned media/provider resources release.
- A valid main video remains authoritative if the sidecar fails.
- Playback, Voice, Download, Release, and confirmed Discard remain available, with the stop reason.

### Decart active session

- Every Character/VTO Start surface discloses the 300-second maximum before provider contact.
- The clock starts only after a healthy connection commits and does not reset on reconnect.
- At 270 active seconds, show and announce the ending-soon warning without displacing Record/Stop.
- Expected completion at 300 seconds preserves the recipe and returns to local preview; a new
  session requires an explicit Start.
- If recording is active, finalize it before releasing provider/local sources.
- Early disconnect, permission, quota, entitlement, and provider failures remain distinct safe
  recovery classes.

The two clocks are independent even though they share a number.

### Uploaded video and batch processing

- The accepted pilot subset is MP4 or MOV with H.264 and WebM with VP8, at 16:9 or 9:16, no
  longer than 300 seconds. Local/Character Swap input is at most 300,000,000 bytes; any VTO workflow is
  at most 200,000,000 bytes.
- A workflow may select Character Swap or VTO as its single active batch transformation, never
  both. The creator may switch the active choice before submission; only the active operation is
  submitted. Character Swap uses the startup-selected Decart or Pruna provider; VTO remains Decart.
- Pruna Character Swap requires one identity reference and locally prepared H.264 MP4. MP4 is
  pass-through; compatible MOV/WebM is converted and revalidated only at explicit Start. Prompt
  enhancement is unavailable. The UI exposes no provider choice or name.
- The UI reports one planned visual-processing submission, never fabricated percentages or hard-coded
  credit/currency pricing.
- Visual results must retain orientation, differ from source duration by no more than 500 ms, and
  restore immutable source audio before promotion. ElevenLabs receives source audio only.
- Upload, recipes, app jobs, inputs, results, and recovery are tab/process-temporary. Refresh,
  crash, or broker restart does not restore them. Local cleanup is not provider cancellation or
  provider-side deletion.

## Participant data promise

- Give each participant a fresh browser profile and dedicated, explicitly resolved
  `LIGHTFRAME_DATA_DIR`; never share or reuse an environment.
- Use a random code containing no name, email, device identifier, or provider identifier.
- Retain the isolated local dataset only through the scheduled engagement, including at most one
  planned seven-day return.
- Retire it within 24 hours after the final session, withdrawal, or cancellation, and no later
  than eight days after first use.
- Remove/Detach, draft reset, and character deletion remove relationships; they do not delete
  immutable reference bytes. Only verified whole-environment retirement makes the pilot deletion
  promise.
- The current recorded or uploaded source, visual layers, audio sidecar, and optional voiced layer
  are temporary browser memory. Download is the participant’s durable handoff and is outside the
  operator’s Lightframe dataset.
- Retain only aggregated content-free counts after cleanup, with no participant lookup key.
- Local cleanup is not provider-side deletion. Review the exact provider account terms/settings
  before contact and disclose that boundary.
- Pruna documents uploaded input availability of approximately 30 minutes and generated delivery
  availability typically lasting 24 hours. No documented cancellation/deletion endpoint is part
  of this contract; qualification records observed retention without claiming remote deletion.

Follow the [data retirement checklist](PILOT_DATA_RETIREMENT_CHECKLIST.md) for every participant.
Any uncertain path, shared profile/root, unresolved relationship, or provider-cleanup warning
blocks the next participant.

## Approved provider configurations

All permanent credentials are least-privilege, server-only, and operator-owned. Reference image
providers are separate startup-selected passes with no provider fallback or automatic retry of an
initial billable submission.

| Provider              | Approved configuration                                                                                              | Participant rule                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Decart Character      | Exact `lucy-latest`; model/origin-scoped token; 300-second active limit                                             | After disclosure and live qualification                                                                      |
| Decart VTO            | Exact `lucy-vton-latest`; no moving alias                                                                           | One garment/plain background; no fit/sizing/purchase claim                                                   |
| Decart batch Lucy     | Exact `lucy-latest`; asynchronous submit/status/content; fixed 720p; no automatic initial retry                     | One explicit submission per step after disclosure                                                            |
| Decart batch VTO      | Exact `lucy-vton-latest`; asynchronous submit/status/content; fixed 720p; no automatic initial retry                | Rights, consent, and limitations before each submission                                                      |
| Pruna Character 720p  | Exact `p-video-replace`; one reference; MP4 driver; `save_audio=true`; no webhook/fallback; $0.03/s published price | Separate pricing, entitlement, dimensions, retention, and recovery qualification                             |
| Pruna Character 1080p | Exact `p-video-replace`; one reference; MP4 driver; `save_audio=true`; no webhook/fallback; $0.06/s published price | Separate pricing, entitlement, dimensions, retention, and recovery qualification; no quantified timing claim |
| Pruna Wardrobe        | Exact `p-image-try-on`; one person and one garment; turbo off; JPEG 95; preserve input size; no retry/fallback      | Explicit Generate/Regenerate only; separate entitlement, pricing, retention, and output qualification        |
| OpenAI optimizer      | `gpt-5.6`, `medium`, version `lucy-character-reference-v1`, 120-second timeout, response storage disabled           | Explicit optimize/generate path only                                                                         |
| OpenAI image          | `gpt-image-2`, `high`, one result, 150-second timeout, zero SDK retries                                             | Explicit image action only                                                                                   |
| BFL image             | `flux-2-pro`, safety tolerance `2`, prompt upsampling disabled, one 150-second deadline                             | Separate live qualification                                                                                  |
| Wiro image            | `seedream-v5-lite-uncensored`, one 2k result, watermark off, one 180-second deadline, `InputOutputDelete`           | Operator qualification only; never external participants                                                     |
| ElevenLabs            | Saved voices; `eleven_multilingual_sts_v2`; `ELEVENLABS_ENABLE_LOGGING=false`; restricted key                       | Participant Apply requires confirmed zero-retention eligibility                                              |

Stop the pass if a model, safety/retention setting, entitlement, or account capability differs.
Do not follow aliases, loosen safety, enable provider logging, switch provider, or resubmit a paid
initial request to obtain a pass. An optimizer failure may use the documented raw-prompt branch
through the same selected image provider; that is not provider fallback.

## Content and refusal policy

Participants must be adults and have rights and consent for every face, voice, garment, prompt,
and reference. Refuse or stop minors/age-ambiguous subjects; sexual or exploitative content;
deceptive impersonation/fraud; non-consensual face or voice use; hateful, violent, illegal,
self-harm-promoting, or harassing content; safety-control bypasses; external-participant Wiro use;
and uncertain ownership/consent.

A provider refusal is final for that request. Do not rephrase to evade it or switch providers to
obtain disallowed output. A refusal may still have incurred provider cost.

## Roles and operator limits

One person may hold several roles, but every live pass records the authorizing/witnessing role:

| Role                       | Responsibility                                  |
| -------------------------- | ----------------------------------------------- |
| Pilot Product Owner        | Scope, policy, and go/no-go                     |
| Credential Custodian       | Key creation, scope, storage, rotation, removal |
| Billing Authorizer         | Paid-pass approval, quota/cost review           |
| Evidence Recorder          | Content-free qualification and cleanup records  |
| Support & Escalation Owner | Moderation, recovery, incidents, session stop   |

Limits per participant:

- 30 cumulative connected Decart minutes across Character and VTO;
- 10 image generation/edit/composition submissions across all separately selected provider passes;
- 3 ElevenLabs conversions;
- stop a provider path after two requests that may have incurred cost; and
- provider work only while the operator is present and the Billing Authorizer approves.

These are moderated operator limits, not runtime entitlements or billing truth. Visual batch
processing has no participant-total or per-operation submission-count cap; each submission still
requires an explicit creator action and operator-approved provider work.

## Evidence, support, and release gate

Evidence may contain only approved configuration/model labels, safe outcome codes, timing/duration
buckets, MIME type, stop/finalization/download outcomes, support time, and participant
comprehension results. It must not contain prompts, media, raw errors/bodies, URLs, credentials,
device IDs, provider IDs, or network archives.

On unsafe output, unexplained external traffic, repeated paid failure, possible credential/data
exposure, isolation doubt, or cleanup failure:

1. preserve local preview/recipe/valid take where safe;
2. stop provider and API work;
3. record only the safe app-owned event;
4. revoke affected credentials and retire the environment when exposure is possible; and
5. resume only after the responsible role records a safe disposition.

This former release gate no longer blocks current application use or project validation. Accounts,
cloud ownership/portability, billing, public sharing, and remote operations remain deferred.
