# Lightframe Studio Product State

**Status:** Canonical product assessment and decision framework  
**Assessment date:** 2026-07-28  
**Scope:** Current repository behavior, controlled MVP validation, and explicitly speculative future product work

This document describes what Lightframe Studio is today, what can be validated
with the current local architecture, and what would be required before a
self-serve or public product. It is not a commitment to build every opportunity
listed here.

The following labels are used throughout:

- **Implemented** means the behavior exists in the current repository.
- **Controlled-pilot requirement** means it must be resolved before the
  affected experience is offered in the operator-assisted design-partner pilot
  defined below.
- **Self-serve requirement** means it is needed before unassisted external use,
  even if the application remains local.
- **Public-product requirement** means it is needed before remote hosting,
  multiple untrusted users, accounts, or paid access.
- **Proposed** means a hypothesis that needs evidence and prioritization. It is
  not a present product promise.
- **Avoid for now** means the work would add scope or risk before the core value
  proposition is validated.

Implementation details remain authoritative in
[Architecture](ARCHITECTURE.md), [Privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md),
[Browser support](BROWSER_SUPPORT.md), [Recording memory policy](RECORDING_MEMORY_POLICY.md),
the [observable user journeys](userStories/README.md), and the
[live provider smoke procedure](LIVE_PROVIDER_SMOKE.md). Historical rationale
belongs in [Product evolution](PRODUCT_EVOLUTION.md).

## 1. Product definition

Lightframe Studio is a local-first, single-operator browser studio for creating
short camera performances with a reusable AI character, optionally applying a
voice treatment, and downloading the result.

Its clearest current product loop is:

1. Prepare or reuse a character.
2. Start a local camera preview.
3. Explicitly start Lucy 2.5 with that character.
4. Record one short take.
5. Optionally apply a local or ElevenLabs voice treatment.
6. Download the finished file.

The product is **local-first, not offline-only**. Local Camera, local recording,
the prompt workshop, and local voice effects can operate without a media
provider. Decart, image generation, prompt optimization, and ElevenLabs are
explicit external-provider actions and may create usage or cost.

The current server is a trusted loopback integration broker for one operator.
It is not a public backend and must not be exposed through a public hostname,
LAN binding, tunnel, reverse proxy, or shared ingress.

Lightframe Studio is not currently:

- a multi-user creator platform;
- a cloud project or take library;
- a long-form editor;
- a collaboration or sharing service;
- a billing, subscription, or credits product;
- a public voice-cloning product; or
- a general-purpose AI toolbench whose every provider capability is part of the
  first-run promise.

## 2. Intended audience

### Audience for the next validation release

The intended audience for the controlled MVP is at most five invited solo short-form creators,
creative technologists, or design partners using qualified desktop and touch/mobile targets. Every
session is operator-assisted; no unassisted local-beta step is approved in the current
[release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md). Participants:

- are comfortable granting camera/microphone permissions and working within the published
  browser/device matrix;
- want a reusable visual persona more than a full editing suite;
- can work within short, planned takes;
- accept operator-assisted setup and support;
- understand that selected AI and cloud voice actions contact named providers;
  and
- can use an isolated local environment whose retained assets can be wiped by
  the operator after the engagement.

### Audiences that remain hypotheses

The following audiences may be attractive, but the present evidence does not
justify choosing among them:

- casual consumers who need highly guided onboarding;
- professional creators who expect predictable quality, project history, and
  repeatable production controls;
- social or commerce creators using virtual try-on;
- teams sharing characters, recipes, and takes; and
- developers or operators who prefer bring-your-own-provider credentials.

The controlled pilot should determine which audience experiences the strongest
repeat value before the product expands its platform or monetization scope.

## 3. Current audience fit

| Audience                                            | Current fit                | Why                                                                                                                                                      |
| --------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technically comfortable solo creator on one desktop | **Strongest today**        | The local-first, single-stage workflow and explicit provider controls match the current architecture.                                                    |
| Moderated design partner                            | **Strong**                 | A facilitator can explain terminology, bound take length, manage provider access, and perform cleanup while the product team observes the real workflow. |
| Unassisted local beta user                          | **Partial**                | First-use hierarchy, deletion ownership, terminology, touch recovery, and support guidance need work before activation can be measured fairly.           |
| Professional repeat-production user                 | **Partial**                | Reusable characters help, but there is no take history, cloud backup, timeline editing, collaboration, or service-level expectation.                     |
| Touch/mobile creator                                | **Required but not ready** | Responsive layouts exist, but touch recovery, narrow-screen Builder usability, physical media behavior, and a named device/browser matrix remain gates.  |
| Public or multi-user customer                       | **Not supported**          | There are no accounts, tenant boundaries, entitlements, abuse controls, public retention controls, or production operations.                             |

The present product fit is therefore deliberately narrow: one creator, one
browser profile, one local broker, one current take, and explicit provider
actions. Marketing, support, and research scripts should state these boundaries
instead of implying a public creator platform.

## 4. Core value proposition

### Primary promise

**Create a reusable visual identity, perform through it live, record a short
take, optionally shape the voice, and keep control of when media leaves the
browser.**

This promise is credible because the product already combines:

- a persistent camera stage rather than a sequence of disconnected pages;
- reusable saved characters rather than prompt re-entry on every session;
- explicit separation between local camera use and provider activation;
- atomic AI apply/revert/reset behavior;
- one understandable recording lifecycle with finalization before cleanup;
- an immutable original when voice processing is attempted; and
- a clear download handoff rather than an implied cloud library.

### Supporting promises

- **Local fallback:** local preview and recording remain useful when providers
  are unavailable or intentionally unused.
- **Intentional external use:** provider contact happens after a labeled user
  action, with disclosure at the relevant decision point.
- **Recoverable creation:** provider failures should preserve local preview,
  the original recording, and the user's prepared character state.
- **Reusable identity:** a saved character should make the next session faster
  and more consistent than starting from a blank prompt.

### Product hierarchy

Character Performance should define the MVP. Virtual Try-On may be offered as a
clearly secondary beta if its entitlement and live quality are verified.
Prompt Workshop should remain an advanced supporting tool. Neither should make
the first-run path feel like a catalogue of unrelated AI features.

## 5. Current feature inventory

### Implemented application and navigation

- `/` is the only application route.
- Retired and unknown SPA entries redirect to `/`; legacy project entry points
  open the Legacy manager rather than reviving retired pages.
- `StudioApp` composes a persistent `MediaStage`, shared `OverlayPanel`, and the
  Dock, Take, Workshop, and Shelf tools.
- The stage remains the owner of live media, playback, recording state, and
  provider transitions while overlays come and go.

### Implemented local capture and recording

- Local camera and microphone preview is independent of provider credentials,
  token minting, SDK loading, and external media traffic.
- Capture settings support device selection and a local quality target.
- Camera and microphone can be toggled during the live session.
- The user can record one current take, stop and finalize it, review it on the
  same stage, download it, close it, or confirm discard.
- Recording finalization settles before camera or provider resources are
  released.
- The current Studio take is in browser memory only. There is no current take
  history, cloud backup, or project library.

### Implemented Character workflow

- Character Builder supports prompt-only characters, direct image upload,
  prompt plus upload, generated previews, combined previews, regenerate/edit,
  and save.
- The Builder retains one sanitized draft and save journal in IndexedDB.
- Saved characters, prompts, and recent items are stored in the versioned Recipe
  Shelf.
- Uploaded, generated, edited, and composed reference images are retained as
  immutable owner-scoped files in the local asset directory. Browser records
  store opaque asset relationships rather than the bytes.
- Saving a character preloads its Lucy 2.5 recipe without starting provider
  media.
- A saved character can be selected and used in a later session, subject to the
  current entry-category defect described below.

### Implemented realtime AI

- Lucy 2.5 Character and Decart VTON 3 (`lucy-vton-3`) can start from
  prompt, image, or both.
- Realtime tokens are short-lived and scoped by the loopback broker.
- The Decart SDK is loaded only for an explicit AI start.
- Recipe changes use staged snapshots and atomic apply/revert/reset behavior.
- A provider disconnect returns the product to a safe local state rather than
  automatically starting another paid provider.
- Automatic provider fallback is intentionally not implemented.

### Implemented image and prompt tools

- Prompt Workshop can add, replace, or restyle recipe text locally.
- Character Builder can explicitly optimize prompts and generate or edit
  reference images through configured image providers.
- Direct upload and image-only save do not invoke an image-generation provider.
- Image-provider calls, their retained outputs, and any remote cleanup behavior
  follow the current privacy contract.

### Implemented Library and persistence

- Recipe Shelf v4 provides Saved, Recent, and Characters collections.
- Saved text, names, tags, notes, canonical Builder state, provenance, and opaque
  reference relationships are browser-profile local.
- Legacy Guided projects may retain checkpoint media in IndexedDB and can be
  downloaded or deleted through the Legacy manager; they cannot be reopened as
  active Guided projects.
- There is no account sync, portable library, sharing, or cross-device
  restoration.

### Implemented voice workflow

- Local voice treatments run with Web Audio and local remuxing.
- When configured, ElevenLabs saved voices can be browsed and previewed after
  explicit disclosure.
- Apply sends the completed audio sidecar, not the video, for speech-to-speech
  conversion.
- The original take remains immutable; a failed conversion does not destroy it.
- The product does not import, clone, add, or delete ElevenLabs voices.

### Implemented server scope

- A Fastify loopback broker validates local Host and Origin, sanitizes inputs and
  provider failures, keeps secrets server-side, and serves owner-scoped
  reference assets.
- The broker has no product database, accounts, sessions, tenant model, billing
  ledger, public authorization, or take history.
- Capability checks describe configured integrations; they do not prove live
  provider health, entitlement, or remaining quota.

## 6. Product strengths

1. **The core media lifecycle is unusually disciplined.** A single persistent
   stage owns the device, provider, recording, playback, and cleanup lifecycle.
   This reduces surprising handoffs and prevents overlays from becoming
   competing media applications.
2. **Local Camera is a real product, not a degraded provider state.** It does not
   require Decart credentials or external media traffic and remains useful when
   AI is unavailable.
3. **Provider use is generally explicit and cost-sensitive.** Token minting, SDK
   loading, image generation, and cloud voice conversion follow labeled user
   actions. The remaining direct-start disclosure gap is specific and fixable.
4. **Character state is reusable and durable.** Builder draft recovery, saved
   characters, immutable references, and recipe history support repeat creation
   better than an ephemeral prompt box.
5. **AI changes are recoverable.** Staged snapshots and atomic apply/revert/reset
   avoid partially applied provider state.
6. **Recording and voice preserve user work.** Finalization precedes cleanup,
   object URLs have explicit ownership, and voice processing never mutates the
   original recording.
7. **The codebase has sound ownership boundaries.** Domain and contract packages
   stay provider- and React-independent, while adapters translate external
   payloads. The current large components do not justify broad refactoring.
8. **The application has a useful safety posture for local operation.** Exact
   loopback checks, no-store responses, sanitized failures, local owner scoping,
   and denied unexpected external traffic in automated tests are strong
   foundations.
9. **The download boundary is honest.** The product does not pretend that a
   temporary browser Blob is a cloud project, and it does not claim to observe
   browser download completion.

## 7. Product weaknesses

### Core-journey weaknesses

- The product does not yet state one crisp MVP promise in the interface and
  operating policy. The number of tools can make it feel like an AI workbench
  before the Character Performance loop is understood.
- “Choose saved character” can open the generic Saved collection rather than
  Characters. This makes the reuse promise harder to discover and corrupts any
  reuse metric.
- The primary direct Character start surface does not state that live media,
  the recipe, and an optional reference are sent to Decart.
- The authoritative five-minute Decart session constraint is returned by the
  server but dropped by the browser adapter, so the user cannot see the expected
  limit or a trustworthy expiry state.
- “Systems ready” and similar capability language can imply live health when
  only configuration presence is known.
- First-use terminology—Dock, Shelf, Workshop, recipe, draft, applied state,
  Character, and VTO—creates a high comprehension burden.

### Input and layout weaknesses

- The live/playback control bar can auto-hide while its recovery is explicitly
  tested only for mouse and keyboard. Stop Recording is inside that bar. Touch
  and pointer recovery require a real fix and device verification; Stop should
  remain visible while recording.
- The narrow-screen Character Builder places preview/generation after a long
  configuration stack, making the key feedback loop difficult to reach and
  interpret.
- Recording controls give too many actions similar visual weight. Stop must
  remain the dominant, always-available action during recording.
- The ElevenLabs workflow is dense and lacks enough usage/duration context at
  the moment of Apply.

### Trust and ownership weaknesses

- Removing or resetting a reference relationship does not delete retained local
  bytes. The current implementation is deliberate, but a self-serve user lacks
  a coherent “erase my Lightframe data” path.
- Image-generation provider and cost disclosure is less prominent than the
  Decart and ElevenLabs boundaries.
- Capability configuration is not a provider health check.
- No in-product view explains usage consumed, failed-provider-request policy, or
  operator limits.

### Evidence weaknesses

- The supported maximum take length has not been backed by checked-in
  real-target memory measurements across recording, finalization, processing,
  and cleanup.
- Live provider behavior cannot be inferred from mocked tests; every provider
  experience offered to pilot users needs a successful gated smoke against the
  exact configured model/account.
- The visual regression estate has historically protected some misleading
  states, including an open Dock as “idle,” a loading fallback in a small-mobile
  take, and a direct prompt that did not prove saved-character identity.
  Release confidence requires semantically ready scenarios, not only a passing
  screenshot count.

### Platform weaknesses

- There are no accounts, tenant boundaries, cloud persistence, entitlements,
  rate limits, public deletion controls, moderation systems, observability, or
  production deployment operations.
- The present loopback trust model cannot be incrementally rebranded as public
  security.

## 8. MVP-readiness assessment

“MVP” must be qualified by release model. Treating a moderated local pilot and a
public paid product as the same milestone either overbuilds the first or
under-secures the second.

| Release model                                          | Readiness                                  | Assessment                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Controlled, operator-assisted design-partner pilot** | **Close after focused gates**              | The core loop is credible. Close the trust, lifecycle, entry-intent, provider-smoke, memory-evidence, and operating-policy gaps in Stage A.                                             |
| **Unassisted local beta**                              | **Not ready**                              | Needs fair first-use activation, coherent local-data deletion, accessibility/touch evidence, support guidance, and broader hardening.                                                   |
| **Remote or public MVP**                               | **Blocked by architecture and operations** | Requires accounts, authorization, tenant isolation, cost/abuse controls, public media retention/deletion, moderation, CSP/TLS/secrets design, observability, and deployment operations. |

### Controlled-pilot definition

The next release may be called ready only if all of these constraints are true:

- it follows the approved [controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md);
- it is fully operator-assisted, with at most five invited participants and no unassisted step;
- it runs on the documented loopback, single-operator broker;
- touch/mobile creation is included, but support cannot be claimed until a named physical
  device/browser matrix passes the touch, media, recording, processing, and cleanup protocol;
- it is not exposed over a public URL, LAN, tunnel, reverse proxy, or shared
  server;
- provider accounts are operator-controlled and have explicit participant and
  usage limits;
- recording is capped at an approved maximum of 300 seconds, with a warning and safe automatic
  finalization;
- each participant uses an isolated data directory or disposable environment;
- the operator has a verified procedure for wiping retained reference assets;
  and
- Lucy 2.5, exact `lucy-vton-3`, ElevenLabs, and separate OpenAI/BFL/Wiro image-provider
  configurations all pass the live smoke procedure.

Responsive screenshots do not establish touch/mobile support. Touch recovery, physical-device
media/recording behavior, and narrow-screen usability are unconditional stop-ship gates for this
pilot.

### Canonical finding register

This register preserves the Product audit identifiers and resolves overlaps with
the UI/UX, architecture, security, performance, test, and documentation audits.

| ID           | Canonical disposition                                                                                                                                                                                                                                                                                                        | Related findings                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **PROD-001** | Define Character Performance and the controlled-pilot boundary now.                                                                                                                                                                                                                                                          | Release-model consensus             |
| **PROD-002** | Lightweight first-use guidance is required before unassisted activation testing, not before moderated formative research. Avoid a modal tour or new route.                                                                                                                                                                   | UX-004, UX-005                      |
| **PROD-003** | Add concise Decart disclosure at direct Character start before that path enters the pilot.                                                                                                                                                                                                                                   | Provider-boundary trust gap         |
| **PROD-004** | Preserve and display the authoritative session cap, warn before expiry, and recover to local preview. Decart `generationTick` reconciliation is recommended when its semantics are verified, not a substitute for the cap.                                                                                                   | ARCH-001, UX-007                    |
| **PROD-005** | Keep the local broker loopback-only for the pilot. Public exposure is blocked.                                                                                                                                                                                                                                               | ARCH-003, SEC-001, SEC-002, SEC-003 |
| **PROD-006** | **Pilot runtime/procedure implemented:** detach-versus-delete is disclosed, the checklist isolates each tester's data, and the disposable drill verifies exact-leaf whole-dataset retirement. Real sessions still require completed operator evidence. Self-serve needs erase-all; public needs relationship-aware deletion. | SEC-004                             |
| **PROD-007** | **Pilot policy implemented:** participant/provider access, usage/failure limits, moderation/refusal, and support ownership are approved; participant mode server-disables Wiro. Live qualification remains. Do not build payments yet.                                                                                       | SEC-002, SEC-005                    |
| **PROD-008** | Include VTO as a named secondary beta; require exact `lucy-vton-3` model/account smoke and explicit expectation-setting before external use.                                                                                                                                                                                 | DOC-001                             |
| **PROD-009** | **Implemented:** VTO is a named beta with one-garment/plain-background guidance and no fit, sizing, fabric-behavior, or purchase-accuracy claim.                                                                                                                                                                             | UX content guidance                 |
| **PROD-010** | **Implemented:** image-generation actions name optimizer/provider/model contact, possible credits, retained output, and provider-free upload/save alternatives.                                                                                                                                                              | SEC-005                             |
| **PROD-011** | **Implemented for pilot observation:** Dock/Take/Workshop/Shelf retain their names and expose action-first descriptions; the first-take cue uses plain verbs. Test terminology before any wholesale IA rename.                                                                                                               | UX-004, UX-005                      |
| **PROD-012** | Fix saved-character entry intent before reuse is measured or offered unassisted. Use the existing Shelf rather than a second picker.                                                                                                                                                                                         | UX-002                              |
| **PROD-013** | Replace configuration-as-health claims with truthful states such as Configured or Limited; report active health only during an attempted connection.                                                                                                                                                                         | UX-007, ARCH-002                    |
| **PROD-014** | **Implemented policy:** the first-take cue and dismissal are local mounted-session UI only. The controlled pilot uses moderated observation/content-free evidence and no network analytics backend.                                                                                                                          | Privacy-safe instrumentation        |
| **PROD-015** | **Implemented:** ElevenLabs Apply shows clip duration, configured model, possible credit use, and the zero-retention requirement without inventing a confirmation threshold.                                                                                                                                                 | SEC-006                             |
| **PROD-016** | **Evidence contract implemented; qualification pending:** require exact-commit live smoke records for Lucy 2.5, exact VTO 3, ElevenLabs, and separate OpenAI/BFL/Wiro startup configurations before the pilot. The strict validator rejects stale, incomplete, or content-bearing records.                                   | DOC-001, Manual QA                  |
| **PROD-017** | Touch/mobile creation is required; ship only after `UX-001`, narrow-screen, assistive-technology, and named physical device/browser evidence pass.                                                                                                                                                                           | UX-001, UX-003, TEST-005, TEST-011  |
| **PROD-018** | Defer account portability until repeat local value is proven and an account model is chosen.                                                                                                                                                                                                                                 | Stage C                             |
| **PROD-019** | Defer cloud take history until users demonstrate repeat-take retrieval needs.                                                                                                                                                                                                                                                | Stage C/E                           |
| **PROD-020** | Defer metering and billing implementation until provider-unit economics and willingness to pay are measured.                                                                                                                                                                                                                 | Stage D                             |
| **PROD-021** | Defer library import/export until reuse and portability demand are observed.                                                                                                                                                                                                                                                 | Stage C/E                           |
| **PROD-022** | Post-MVP opportunity: take library and basic trim, triggered by repeat production demand.                                                                                                                                                                                                                                    | Stage E                             |
| **PROD-023** | Post-MVP opportunity: sharing and collaboration, triggered by repeated cross-person workflows.                                                                                                                                                                                                                               | Stage E                             |
| **PROD-024** | Post-MVP opportunity: garment extraction or commerce integration, only after VTO proves differentiated demand and acceptable quality.                                                                                                                                                                                        | Stage E                             |
| **PROD-025** | Post-MVP opportunity: curated templates or character packs, after workflow patterns repeat.                                                                                                                                                                                                                                  | Stage E                             |
| **PROD-026** | Avoid automatic provider fallback now; it obscures consent, quality, and cost.                                                                                                                                                                                                                                               | Provider policy                     |
| **PROD-027** | Avoid public voice import or cloning now; it materially expands consent, rights, and abuse scope.                                                                                                                                                                                                                            | Voice safety                        |
| **PROD-028** | Do not revive retired routes. Preserve `/` as the sole application route.                                                                                                                                                                                                                                                    | Architecture invariant              |
| **PROD-029** | Do not build a full cloud project system before validating the short-take loop.                                                                                                                                                                                                                                              | Scope control                       |
| **PROD-030** | Do not build payments before usage economics and repeat value are known.                                                                                                                                                                                                                                                     | Stage D                             |

## 9. Missing MVP capabilities

### Required for the controlled design-partner pilot

| Capability                           | Required outcome                                                                                                                                                                          | Findings                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Release scope and operating policy   | One documented audience, browser matrix, take limit, included providers, participant access rule, support owner, and explicit statement that the broker remains loopback-only.            | PROD-001, PROD-005, PROD-007                          |
| Safe touch/mobile recording controls | Stop Recording remains visible; touch/pointer/focus activity recovers hidden controls; the named physical matrix passes live and playback actions after timeout.                          | UX-001, PROD-017                                      |
| Correct character reuse entry        | “Choose saved character” opens the Characters collection and selection works through the existing Shelf.                                                                                  | UX-002, PROD-012                                      |
| Direct provider disclosure           | The direct Decart start decision states what is sent, to whom, and when usage ends.                                                                                                       | PROD-003                                              |
| Visible AI time boundary             | The server cap survives the adapter, is visible, warns before expiry, and produces an expected-limit recovery state.                                                                      | PROD-004, ARCH-001                                    |
| Truthful capability state            | UI distinguishes configured integrations from active provider health or entitlement. Provider failures preserve actionable classifications where safe.                                    | PROD-013, UX-007, ARCH-002                            |
| Recording cap and evidence           | An accessible warning and safe automatic Stop/finalize enforce 300 seconds; real-target memory/finalization/processing/cleanup measurements pass for every supported target.              | PERF-001                                              |
| Retained-data procedure              | Detach-versus-delete is explicit, participant data is isolated, and post-session whole-dataset cleanup is verified.                                                                       | PROD-006, SEC-004                                     |
| Provider release evidence            | Lucy 2.5, exact VTO 3, ElevenLabs, and separate OpenAI/BFL/Wiro startup configurations pass their gated live smokes.                                                                      | PROD-016, DOC-001                                     |
| Pilot cost and safety policy         | Provider access, request/time limits, failed-request handling, moderation/refusal rules, and escalation/support are assigned.                                                             | PROD-007, SEC-002, SEC-005                            |
| Trustworthy test evidence            | Critical functional journeys and the risk-based 29-case visual budget represent semantically ready states; loading fallbacks and false identity fixtures cannot pass as release evidence. | UX-TEST-001, UX-TEST-002, test-modernization findings |

Implementation note (2026-07-28): the runtime and automated portion of **Safe touch/mobile
recording controls** now passes component, real-time mobile touch-context, 200%-text, and five
canonical viewport checks. The capability remains incomplete until the named physical
browser/device and assistive-technology evidence passes.

Implementation note (2026-07-28): the runtime and automated portion of **Visible AI time
boundary** now preserves the validated server maximum, starts one monotonic post-commit budget,
shows elapsed/remaining time plus a static 30-second warning, distinguishes expected from early
end/disconnect, and finalizes a boundary-crossing take before resource release. The capability
remains a pilot gate until the paid five-minute live smoke passes for both claimed Decart
configurations on the qualified physical matrix.

Implementation note (2026-07-29): **Truthful capability state** now includes an allowlisted Decart
runtime error boundary with generic fallback, and successful ElevenLabs preview/conversion output
is byte-bounded on both the API and browser sides. Automated boundary, overflow, cancellation,
malformed-output, safe-error, and take-preservation evidence passes; live provider qualification
remains a separate release gate.

### Required before an unassisted local beta

- lightweight in-context first-use guidance based on observed hesitation points;
- a coherent, usable way to erase all local Lightframe browser and reference
  data, with consequences explained;
- keyboard, screen-reader, focus, touch, and narrow-screen acceptance on the
  stated support matrix;
- improved Character Builder action/preview reachability on narrow screens;
- clearer recording hierarchy and voice Apply usage context;
- actionable self-support and recovery guidance;
- an explicit user-facing policy for provider usage limits and failed requests.

### Required before a remote or public MVP

- authentication, session management, authorization, and tenant isolation;
- server-side ownership enforcement for every text, asset, take, and usage
  record;
- provider proxying with rate limits, entitlements, idempotency, budgets, and
  abuse controls;
- tenant-safe object storage, retention schedules, deletion workflows,
  tombstones/audit where appropriate, and account deletion;
- secure deployment architecture including TLS, CSP, CSRF posture, secret
  management, logging redaction, and incident response;
- durable jobs, retries, reconciliation, and observability;
- validated media limits and ingestion/processing protections;
- public content, moderation, rights, and support policies;
- provider terms and retention settings matched to product claims; and
- billing only after the pricing decision and ledger semantics are explicit.

## 10. Product decisions

### Product-owner decisions recorded 2026-07-28

| Decision                | Recorded outcome                                                                                                                                                                                                     | Consequence                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pilot cohort            | At most five invited, technically comfortable solo creators/design partners; every session operator-assisted; no unassisted local-beta step.                                                                         | Lightweight first-use guidance remains evidence-triggered rather than a prerequisite for moderated research.                                                         |
| Touch/mobile            | Full touch/mobile creation is included across the named desktop, five Apple-phone, five popularity-led Android-phone, Android 17 phone sentinel, five popularity-led tablet, and Android 17 tablet sentinel targets. | Every exact device/browser/OS row remains unsupported until physical evidence passes.                                                                                |
| Included experiences    | Character, VTO, local Voice, ElevenLabs, OpenAI, BFL, and Wiro are included in qualification.                                                                                                                        | Character remains primary and VTO beta. OpenAI/BFL/Wiro use separate startup configurations with no fallback. Wiro is operator qualification only.                   |
| Time boundaries         | Recording and Decart each have an independent 300-second maximum and a persistent accessible warning at 270 seconds.                                                                                                 | Recording auto-finalizes through the coalesced Stop path; expected Decart completion preserves/falls back to local preview and finalizes a recording before release. |
| Participant data        | Fresh browser profile and `LIGHTFRAME_DATA_DIR` per participant; retain through at most one seven-day return; retire within 24 hours after the final engagement and no later than day eight.                         | Detach is not delete. Whole-environment retirement is the only pilot local-deletion promise and must be verified.                                                    |
| Provider/content policy | Exact provider settings, adult/consented content allowlist, refusal rules, zero-retention requirement for ElevenLabs, and Wiro participant exclusion are approved.                                                   | A changed model, setting, entitlement, or retention term stops qualification rather than triggering fallback or silent substitution.                                 |
| Access and limits       | Operator-owned credentials; at most 30 Decart minutes, 10 billable image submissions, and three ElevenLabs conversions per participant; stop a path after two potentially billable failures.                         | Limits are operator policy, not app entitlements or billing truth.                                                                                                   |
| Local owners            | Generic Pilot Product Owner, Credential Custodian, Billing Authorizer, Evidence Recorder, and Support & Escalation Owner roles.                                                                                      | One operator may hold several roles; personal assignments must be revisited before leaving local-only operation.                                                     |
| Metrics                 | The content-free hypotheses in section 17 are approved with no participant content, raw provider data, credentials, device IDs, or network archives.                                                                 | Aggregate at cohort close and retire row-level participant codes with the isolated environment.                                                                      |
| Deferred decisions      | Monetization and future cloud ownership/portability.                                                                                                                                                                 | Defer to their evidence stages; Wave 0 does not authorize payments, accounts, or cloud persistence.                                                                  |

The complete operating detail is authoritative in the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md).

### Decisions intentionally left for later evidence

| Decision            | Current local outcome                                        | Later trigger                                                                   |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Broader customer    | Use the five-person design-partner cohort.                   | Choose a broader target after Stage B repeat-value evidence.                    |
| Character ownership | Browser-profile local with operator-owned reference storage. | Decide export/cloud/team ownership after reuse and portability evidence.        |
| Take persistence    | Keep the current temporary take and Download handoff.        | Decide history/cloud storage only after repeated retrieval demand.              |
| Upload limits       | Preserve current validated image/audio limits.               | Revisit from failure, cost, and target-device memory data.                      |
| Monetization        | No pricing, credits, allowance ledger, or checkout.          | Decide only after provider-unit economics and repeat value are measured.        |
| Automatic fallback  | None.                                                        | Reconsider only through a later explicit consent/cost/provider-policy decision. |

Current validated input boundaries should not be silently expanded: Character
Builder accepts JPEG, PNG, or WebP images up to 10 MiB and 40 megapixels; the
voice input path accepts up to 25 MiB. Future plan limits should be based on
observed failure rates, processing cost, and target-device memory.

## 11. Major risks

| Risk                                                   | Present consequence                                            | Release boundary                                              | Mitigation direction                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Ambiguous product promise                              | Users explore tools without reaching a valuable take.          | Controlled pilot                                              | Lead with Character Performance and use VTO/Workshop as secondary capabilities.                 |
| Hidden or misleading provider boundary                 | Users are surprised by media transfer, cost, or expiry.        | Controlled pilot                                              | Put disclosure and limits at the direct action; use truthful capability states.                 |
| Recording control becomes inaccessible                 | A user cannot stop or manage a recording.                      | Unconditional controlled-pilot blocker                        | Keep Stop visible and centralize stage-level touch/pointer/focus activity recovery.             |
| Saved-character journey routes incorrectly             | Reuse appears harder and pilot metrics become invalid.         | Controlled pilot if reuse is measured; self-serve always      | Carry one-shot Shelf entry intent into the existing collection.                                 |
| Recording memory peak exceeds target capacity          | Finalization/remux can stall, crash, or lose a take.           | Controlled pilot                                              | Enforce 300 seconds with warning/safe finalization and prove it on every named physical target. |
| Retained local references outlive perceived removal    | Trust and deletion expectations are violated.                  | Controlled pilot disclosure; self-serve/public implementation | Isolate and wipe pilot data; later add coherent erase and relationship-aware deletion.          |
| Provider account, model, or quota differs from mocks   | Paid journeys fail during research or release.                 | Every release containing provider use                         | Gated live smoke of exact configuration and explicit support fallback.                          |
| Provider spend is uncontrolled                         | A small cohort creates unexpected costs.                       | Controlled pilot policy; public architecture                  | Operator quotas now; entitlements, rate limits, and ledger later.                               |
| Public exposure of local broker                        | Missing auth/tenancy becomes a security incident.              | Public blocker                                                | Do not expose it; design a new public trust boundary in Stage C.                                |
| VTO creates unsupported fit expectations               | Users infer sizing, realism, or purchase guarantees.           | Any VTO release                                               | Secondary beta positioning, source guidance, and explicit limitation copy.                      |
| Voice/image rights and moderation expand unnoticed     | Harm, rights disputes, or provider-account action.             | Pilot policy; public blocker                                  | Allowlist use cases now; formal rights/moderation before public access.                         |
| Visual tests pass false states                         | Regressions in first impression or core journey escape review. | Visual sign-off                                               | Assert semantic readiness and make fixtures prove the named state.                              |
| Overbuilding backend or monetization before validation | Time is spent scaling a weak value proposition.                | Strategy risk                                                 | Complete Stages A and B before committing to C or D.                                            |
| Broad refactor destabilizes sound ownership            | Media lifecycle regressions replace product learning.          | Engineering risk                                              | Keep current composition and adapter boundaries; refactor only at ownership/lifecycle seams.    |

## 12. Opportunities

### Near-term opportunities supported by the current product

1. **Character reuse as the retention loop.** The product already has durable
   character state. Making reuse effortless may create more value than adding
   another provider.
2. **Trust as a differentiator.** Clear local/provider boundaries, immutable
   originals, expected limits, and explicit cleanup can distinguish Lightframe
   from less predictable AI camera tools.
3. **Short-form performance quality.** A focused capture protocol, selected
   character, reliable recording, and optional voice can serve a complete output
   rather than a collection of demos.
4. **Local-first resilience.** Users can rehearse, record locally, and retain
   their work when a provider is unavailable. This should remain a first-class
   benefit as the product evolves.
5. **Templates derived from observed success.** Once pilot sessions reveal
   repeated recipes or framing patterns, curated starting points could reduce
   activation time without inventing a large marketplace.

### Evidence-dependent future opportunities

- local or cloud take history and basic trim;
- portable or shared characters and recipes;
- creator/team collaboration and review links;
- usage-aware paid plans;
- curated character, framing, and voice packs;
- VTO-specific garment preparation; and
- commerce integrations.

These are **Proposed**, not present requirements. They should be triggered by
repeat behavior, explicit demand, and acceptable unit economics—not by the mere
availability of provider APIs.

## 13. Future backend considerations

This section applies only if Stage B validates a reason to move beyond the local
single-operator product.

### Public trust boundary

A future backend must be designed as a new multi-user security boundary. It
cannot rely on the current loopback Host/Origin assumptions. At minimum it needs:

- authenticated sessions and a documented account-recovery model;
- authorization on every resource and action;
- tenant identifiers and ownership enforced in storage queries, jobs, caches,
  and object paths;
- CSRF and CORS rules appropriate to the chosen deployment;
- TLS, CSP, secret rotation, key scoping, and incident response;
- sanitized structured logs and no user media or prompt payloads in ordinary
  diagnostics; and
- account deletion and export semantics.

### Provider gateway and cost control

- Provider credentials remain server-side and scoped by environment.
- Every provider operation has an authenticated owner, entitlement decision,
  idempotency key, bounded inputs/outputs, deadline, cancellation behavior, and
  safe error category.
- Usage events distinguish submitted, accepted, completed, failed,
  provider-billed, refunded/restored, and abandoned work.
- Rate limits and budgets apply at user, tenant, provider, model, and global
  levels.
- Automatic fallback remains off unless a later product decision defines
  consent, output consistency, and cost semantics.

### Durable jobs and observability

Longer image, voice, or media operations may need a durable job system with
leases, retries, dead-letter handling, and reconciliation. Observability should
measure latency, error class, media duration/bytes, and usage outcome without
recording prompts, images, video, audio, tokens, or signed provider URLs.

### Media architecture

A public system needs tenant-safe object storage, signed access, malware/content
validation appropriate to the product, upload and output byte limits, duration
limits, lifecycle policies, deletion propagation, and backups consistent with
the published retention promise. “Delete” must distinguish relationship removal,
trash/recovery, permanent byte deletion, provider-side deletion, and backup
expiry.

### Deployment and operations

The public product needs environment separation, migrations, rollback,
health/readiness probes, provider degradation controls, alerts, support tooling,
auditability for sensitive actions, and an explicit availability/support target.
These are Stage C concerns, not additions to the loopback MVP.

## 14. Account and persistence considerations

### Present state

- There are no Lightframe accounts.
- Recipe Shelf data belongs to one browser profile.
- The active Builder draft belongs to that browser's IndexedDB.
- Character reference bytes belong to the local operator's configured data
  directory.
- The current Studio take is temporary browser memory and disappears after
  close/discard, refresh, tab loss, browser crash, or device restart.
- Legacy Guided projects have a separate retained IndexedDB contract and can be
  managed only through the Legacy manager.

This model is coherent for a controlled pilot when the operator controls the
environment. It is not equivalent to account ownership, portability, backup, or
cross-device access.

### Controlled-pilot policy

- Use a fresh browser profile and isolated `LIGHTFRAME_DATA_DIR` for each participant.
- State clearly that removing a reference detaches the relationship but does
  not delete stored bytes.
- Retain the isolated dataset through at most one scheduled seven-day return, then complete
  verified whole-dataset retirement within 24 hours of the final engagement and no later than
  eight days after first use.
- Do not promise take history or recovery after refresh.
- Do not place personal production data in fixtures, screenshots, source, or
  ordinary logs.
- Follow the cleanup, provider, refusal, limits, and escalation rules in the
  [controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md).
- Complete the [pilot data retirement checklist](PILOT_DATA_RETIREMENT_CHECKLIST.md) for every
  participant and run the disposable retirement drill before admitting participant data.

### Self-serve local requirement

Before unassisted use, provide one understandable ownership path that clears
both browser storage and retained local reference bytes. It may begin as
“Erase all Lightframe data”; unsafe per-asset garbage collection should not be
built until every relationship and history owner is modeled.

### Public account options

The team should later choose among:

1. **Account-owned cloud assets:** simple mental model, but highest storage,
   deletion, and security scope.
2. **Local assets with account metadata/sync:** preserves local-first intent but
   introduces conflict resolution and partial availability.
3. **Export/import portability without cloud media:** lower platform scope, but
   more manual and difficult to use across devices.
4. **Hybrid local and cloud projects:** potentially strongest professional
   offering, but the most complex ownership and support model.

No option should be selected before Stage B measures whether character reuse,
take retrieval, or cross-device work is a real retention driver.

## 15. Credits-versus-subscription considerations

There is no approved pricing model. The current provider costs belong to the
operator's configured accounts. Building a ledger or checkout now would encode
unknown product and refund semantics.

### Options

| Model                                      | Potential benefit                                                    | Main risk                                                                                      | Evidence needed                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Credits**                                | Maps visible usage to variable provider cost and can bound exposure. | Users may hesitate to experiment; failures and partial work require precise restoration rules. | Cost per successful downloaded take, failure billing behavior, and user comprehension of units. |
| **Subscription**                           | Simple recurring value proposition and predictable customer price.   | Heavy users can create unbounded cost; light users may churn if repeat value is low.           | Repeat-use frequency, monthly provider-cost distribution, and willingness to pay.               |
| **Hybrid subscription + included credits** | Combines recurring access with bounded variable use.                 | More entitlement and support complexity; “included” and overage semantics can confuse users.   | Stable usage bands and evidence that both access and usage create value.                        |
| **Bring your own keys**                    | Reduces platform cost exposure and can fit technical users.          | Setup friction, fragmented support, provider-policy differences, and weak casual-market fit.   | Strong demand from a technical/professional segment.                                            |
| **Usage pass or cohort package**           | Useful for a bounded pilot or event.                                 | May not translate into a durable business model.                                               | Short-term willingness to pay for a defined output or program.                                  |

### Decisions needed before monetization

- What is sold: access, AI seconds, generations, successful outputs, storage, or
  a bundle?
- Does a failed or cancelled provider request consume allowance?
- Which provider-reported events are authoritative enough for billing?
- Are previews billable, and does regeneration differ from first generation?
- Does the product absorb retries caused by its own faults?
- What happens when AI expires during a recording?
- What is the free experience: local-only, a quota trial, watermarked output, or
  no free tier?
- How are refunds, restored allowance, charge disputes, taxes, and provider price
  changes handled?

Stage B should collect per-journey cost and value evidence. Stage C should create
content-free usage events and entitlements. Stage D may then implement the
selected model. The sequence must not be reversed.

## 16. Proposed roadmap

Everything in this section is **Proposed**. Stage A is the focused completion
work for the controlled pilot. Later stages are evidence-gated and do not become
commitments merely because they are listed.

Complexity uses **S/M/L** relative sizing. Priority is **P0** release gate,
**P1** important next, or **P2** evidence-dependent.

### Stage A — MVP Completion

| Item                                        | User problem and product value                                                                                                                                                                                                  | Dependencies                                                                                  | Complexity / risk                                                   | Priority                 | Evidence or trigger                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Define pilot promise and operating policy   | **Problem:** users and operators do not know what “MVP” includes. **Value:** one honest Character Performance contract makes recruitment, support, and release decisions coherent.                                              | Audience choice, named touch/mobile matrix, provider policy, credential/billing/support owner | S / Risk of marketing more than the implementation supports         | P0                       | Leadership accepts the touch/mobile-inclusive controlled-pilot definition and every included provider configuration has an owner and budget.                                      |
| Make recording controls safely recoverable  | **Problem:** hidden controls can strand a recording or touch user. **Value:** the creator remains in control of capture.                                                                                                        | Persistent stage activity owner; touch/device test                                            | S–M / Competing timers or regressions if ownership is duplicated    | P0                       | Physical touch tests pass on every supported target and Stop remains visible through the full recording.                                                                          |
| Repair saved-character entry intent         | **Problem:** the reuse action opens the wrong collection. **Value:** returning users reach their character directly and reuse metrics become valid.                                                                             | App-owned one-shot Shelf mode/category intent; integration test                               | S / Risk of coupling browse intent to persistent applied state      | P0 when measuring reuse  | Header and AI chooser journeys both open Characters and use a selection through the existing Shelf.                                                                               |
| Close provider trust and expiry gaps        | **Problem:** direct start omits transfer disclosure, the cap is invisible, and configuration can masquerade as health. **Value:** users know what leaves the browser, for how long, and what state the provider is actually in. | Shared disclosure copy; token contract; expiry timer/events; safe error categories            | M / Provider SDK semantics and timer drift                          | P0                       | Direct-start comprehension test; exact cap shown; warning and expected-expiry recovery pass; no “ready” claim based only on configuration.                                        |
| Enforce and prove the 300-second take limit | **Problem:** a take may fail at the memory-heavy finalization/processing boundary. **Value:** the pilot has a truthful, enforceable maximum take contract.                                                                      | Chosen target devices, warning/finalization UX, recording/local+ElevenLabs voice protocol     | M / Device variance, remux peaks, or unsafe cap finalization        | P0                       | Runtime warning and automatic Stop/finalize work; real-target measurements cover recording, finalization, both voice paths, cleanup, and failure recovery at 300 seconds.         |
| Establish retained-data retirement          | **Problem:** users can mistake detach for deletion. **Value:** the pilot can make a truthful, operationally enforceable retention promise.                                                                                      | Isolated data directories; disclosure; verified wipe runbook                                  | S / Destructive cleanup must target the exact participant directory | P0                       | A fresh test environment proves disclosure, isolation, and complete post-session operator retirement.                                                                             |
| Prove provider and safety readiness         | **Problem:** mocks cannot prove account entitlement, model availability, paid behavior, or acceptable outputs. **Value:** every offered experience has a known cost/support path.                                               | Gated credentials, operator allowlist, exact model IDs, usage limits                          | M / Paid calls, content risk, provider drift                        | P0 per included provider | Exact configured provider/model passes live smoke; participant limits, failure allowance, moderation/refusal, and escalation are approved.                                        |
| Make release tests semantically truthful    | **Problem:** a passing suite may capture loading or mislabeled states. **Value:** visual and journey evidence protects the actual customer-critical loop.                                                                       | Stable fixtures, readiness assertions, reviewed 29-case budget, two-platform baselines        | M / Snapshot churn can hide real regressions                        | P0 for visual sign-off   | No unintended loading fallback; true closed initial state; selected-character identity; Builder ready state; finalizing and settled Take states; reviewed Darwin/Linux baselines. |

Stage A explicitly does **not** require accounts, payments, cloud history, a new
route, a second character picker, automatic provider fallback, or a broad
component refactor.

### Stage B — MVP Validation

| Item                                       | User problem and product value                                                                                                                                                | Dependencies                                                                             | Complexity / risk                             | Priority        | Evidence or trigger                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run moderated Character Performance cohort | **Problem:** the team lacks behavioral evidence that the loop solves a recurring job. **Value:** observes activation, quality, trust, and reuse before platform investment.   | Stage A gates, research protocol, consent, isolated data                                 | M / Facilitator bias and small samples        | P0              | Recruit target cohort and complete enough sessions to see repeated patterns, not only one-off novelty.                                                             |
| Add content-free learning instrumentation  | **Problem:** failures and time sinks are hard to aggregate. **Value:** measures the funnel without collecting prompts or media.                                               | Event vocabulary, local export or privacy-reviewed collection, stable journey boundaries | M / Privacy creep and misleading denominators | P1              | Moderated observation cannot reliably answer where users fail or how provider cost maps to downloads.                                                              |
| Test lightweight first-use guidance        | **Problem:** unassisted users may not understand the primary loop or vocabulary. **Value:** faster activation without a new onboarding product.                               | Observed hesitation points, action-first copy, dismissible in-context pattern            | S–M / Teaching the wrong workflow too early   | P1              | At least two repeated comprehension failures appear in moderated sessions, or unassisted activation is about to begin.                                             |
| Measure character reuse and return value   | **Problem:** initial novelty may not create retention. **Value:** determines whether reusable identity is the durable wedge.                                                  | Correct entry intent, privacy-safe participant linking, return invitation                | M / Small cohort and external motivation bias | P1              | Users save characters in first sessions; measure seven-day return and reuse before cloud portability work.                                                         |
| Test VTO as a secondary beta               | **Problem:** VTO may add distraction or unsupported expectations. **Value:** discovers whether it attracts a distinct, valuable segment.                                      | Exact entitlement smoke, one-garment/plain-background guidance, no-fit claims            | M / Quality variance, rights, provider cost   | P2              | Recruited users explicitly ask for garment transformation or commerce outcomes; exclude otherwise.                                                                 |
| Test voice as optional value               | **Problem:** cloud voice may add cost and workflow density without improving take utility. **Value:** learns whether voice meaningfully increases download/usable-take rates. | Clip duration/cost context, exact ElevenLabs smoke, immutable original                   | M / Rights, retention eligibility, spend      | P1–P2           | Compare successful takes with and without voice and collect explicit usefulness ratings.                                                                           |
| Validate the required touch/mobile matrix  | **Problem:** responsive UI can be mistaken for usable mobile capture. **Value:** proves the owner-approved creation experience on named physical targets.                     | Stage A pointer fix, selected devices/browsers, Builder narrow-screen study              | M / Device and browser fragmentation          | P0 before pilot | Every named target completes local/AI capture, 300-second recording/finalization, review, voice, download, recovery, background/foreground, and cleanup protocols. |

### Stage C — Backend Foundation

Do not begin this stage until Stage B shows repeat value that requires remote
accounts, shared access, cloud persistence, or platform-funded provider use.

| Item                                                 | User problem and product value                                                                                                                      | Dependencies                                                                        | Complexity / risk                                  | Priority                            | Evidence or trigger                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Design identity, tenancy, and authorization          | **Problem:** local ownership cannot support untrusted users. **Value:** every action and asset has an enforceable owner.                            | Chosen account model, threat model, recovery/deletion policy                        | L / Security and privacy failure                   | P0 for any public service           | Validated need for remote access plus approved public threat model.                            |
| Build durable metadata and tenant-safe media storage | **Problem:** users cannot restore or access work across sessions/devices. **Value:** enables the specific persistence job proven in Stage B.        | Identity, data model, object lifecycle, backups, deletion semantics                 | L / Retention, migration, cost, orphaned media     | P0 if cloud persistence is promised | Measured demand for character portability or take retrieval exceeds local/export alternatives. |
| Build provider gateway, entitlements, and limits     | **Problem:** shared provider credentials can be abused and costs cannot be bounded. **Value:** safe platform-funded provider use.                   | Identity, usage events, idempotency, provider policies                              | L / Cost leakage and inconsistent billing outcomes | P0 for public provider use          | Decision to fund or resell provider usage rather than require operator/BYOK access.            |
| Establish durable jobs and reconciliation            | **Problem:** long provider operations can be lost across retries or deploys. **Value:** reliable completion and supportable failure state.          | Database, queue/lease design, idempotency, observability                            | L / Duplicate billable work and stuck jobs         | P1                                  | Real operations exceed synchronous request reliability or require asynchronous delivery.       |
| Establish privacy-safe observability and operations  | **Problem:** public failures cannot be diagnosed safely. **Value:** service health, incident response, and cost visibility without content logging. | Event taxonomy, redaction, alerts, runbooks, environment separation                 | M–L / Sensitive-data leakage and alert noise       | P0 for public launch                | Approved telemetry schema and operational owner exist.                                         |
| Implement public retention, export, and deletion     | **Problem:** users lack control over account-owned data. **Value:** trustworthy ownership and lifecycle compliance.                                 | Complete relationship graph, provider deletion capabilities, backups, account state | L / Partial deletion and unrecoverable mistakes    | P0 for public launch                | Published retention policy and deletion acceptance tests are approved.                         |

### Stage D — Monetization

Begin only after Stages B and C establish repeat value, provider cost per useful
output, and trustworthy usage events.

| Item                                      | User problem and product value                                                                                                            | Dependencies                                                       | Complexity / risk                                     | Priority            | Evidence or trigger                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| Select pricing and free-experience model  | **Problem:** neither customers nor the business know what is being paid for. **Value:** aligns price with repeat value and variable cost. | Cohort willingness-to-pay research, unit economics, segment choice | M / Choosing credits or subscription on weak evidence | P0 for monetization | Stable cost per downloaded/usable take and repeat-use distribution.                                 |
| Implement entitlement and credit ledger   | **Problem:** access and allowances cannot be enforced or explained. **Value:** deterministic usage, restoration, and support decisions.   | Stage C identity/gateway; approved billing-event semantics         | L / Ledger inconsistency and customer disputes        | P0                  | Pricing decision specifies authoritative billable events, failures, cancellations, and restoration. |
| Integrate billing provider and lifecycle  | **Problem:** customers cannot purchase or manage paid access. **Value:** acquisition, renewal, cancellation, refund, and tax workflows.   | Ledger, pricing, legal terms, support process                      | L / Financial, tax, webhook, and refund complexity    | P0                  | Entitlement model passes adversarial and reconciliation tests.                                      |
| Add usage visibility and budgets          | **Problem:** customers can be surprised by consumption or limits. **Value:** trust, self-management, and fewer support incidents.         | Accurate usage ledger, provider reconciliation                     | M / Presenting estimates as billing truth             | P0                  | Provider and internal events reconcile within an accepted tolerance.                                |
| Validate packaging and willingness to pay | **Problem:** a technically working checkout may package the wrong value. **Value:** proves sustainable acquisition and retention.         | Sellable cohort, support capacity, pricing experiments             | M / Small-sample or novelty bias                      | P1                  | Repeated paid use and renewal behavior, not only stated interest.                                   |

### Stage E — Creator Platform

These opportunities are optional. Each should compete for priority against the
validated core loop.

| Item                                   | User problem and product value                                                                                                                                   | Dependencies                                                   | Complexity / risk                                     | Priority | Evidence or trigger                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Take library and basic trim            | **Problem:** repeat creators cannot retrieve or make simple corrections to prior takes. **Value:** supports recurring production without becoming a full editor. | Cloud/local persistence choice, media lifecycle, deletion      | L / Scope expands toward NLE/editor                   | P2       | Repeated user attempts to retrieve or redo takes because only simple trim is missing. |
| Portable/shared characters and recipes | **Problem:** identity is trapped in one browser profile. **Value:** repeat use across devices or collaborators.                                                  | Ownership model, export/sync semantics, conflict resolution    | L / Rights and merge conflicts                        | P2       | Seven-day reuse is strong and portability is a top repeated request.                  |
| Sharing and collaboration              | **Problem:** creators need review or handoff. **Value:** team distribution and growth loop.                                                                      | Accounts, access control, share revocation, moderation         | L / Privacy leaks and permission complexity           | P2       | Observed workflows repeatedly leave Lightframe for review/handoff.                    |
| Templates and curated packs            | **Problem:** blank-state creation is slow. **Value:** faster activation from proven patterns.                                                                    | Repeated successful recipe patterns, rights/licensing          | M / Marketplace distraction and generic content       | P2       | Multiple cohorts converge on the same high-performing setups.                         |
| VTO garment preparation and commerce   | **Problem:** source garments are inconsistent and outcomes do not connect to purchase workflows. **Value:** potential vertical product.                          | VTO demand/quality proof, rights, merchant/catalog integration | L / Fit claims, product mismatch, provider dependence | P2       | VTO cohort shows differentiated retention or revenue and accepts output limitations.  |

## 17. Recommended success metrics

These are initial **hypotheses**, not contractual targets. Calibrate them after
the first cohort. Do not collect prompt text, image/audio/video content,
credentials, device identifiers, or provider payloads to measure them.

### Activation

- At least **70%** of first-time pilot users reach local preview without
  facilitator intervention within 90 seconds.
- At least **50%** complete review and Download within five minutes of beginning
  the supported flow.
- At least **60%** of users entering with Character intent save or select a
  character and start Lucy 2.5 within ten minutes.
- At least **80%** of character saves preload the intended prompt/reference
  combination on the first attempt.

### Reliability and safety

- At least **95%** of Local Camera starts succeed after permission on the stated
  supported matrix.
- At least **90%** of Decart starts succeed among sessions whose exact account,
  model, entitlement, and network prerequisites are verified.
- At least **98%** of recording stops produce a playable and downloadable take.
- **100%** of provider-recording paths finalize before releasing owned live
  resources.
- **100%** of failed voice treatments preserve the immutable original.
- **0** unexpected external HTTP or WebSocket connections occur in local-only
  automated journeys.
- **0** sessions exceed the stated support duration without a visible warning
  and defined recovery.

### User value

- At least **60%** of successful Character AI sessions lead to a recording.
- At least **50%** of completed AI takes are rated usable or exportable by the
  creator.
- At least **40%** of users who save a character return and reuse one within
  seven days.
- If ElevenLabs is included, at least **70%** of intentional Apply attempts
  complete successfully, and voice-treated takes improve the usable/downloaded
  rate enough to justify their added cost and complexity.

### Trust and comprehension

- At least **90%** of observed users can state what Decart and ElevenLabs receive
  before using them.
- **0** users report surprise that a provider was contacted.
- **0** users leave the session believing that “Remove” deleted retained bytes
  when it only detached a relationship.
- At least **90%** understand that Download is the durable handoff and that the
  current Studio take is not cloud-saved.

### Cost and operational learning

Track content-free counts and durations per completed Download:

- AI connected seconds and expected expiry outcomes;
- image generation and regeneration attempts by outcome;
- voice conversion input duration and outcome;
- provider-request failures that may still have incurred cost;
- number of successful takes per participant; and
- operator support time per completed take.

Use these measures to estimate cost per successful, usable, and downloaded take.
Do not treat a local timer as authoritative billing truth unless provider events
and account reporting validate it.

## 18. Validation questions

### Problem and audience

1. What recurring job causes a creator to return after the novelty of a first AI
   performance?
2. Do users describe the value as reusable identity, live transformation,
   faster content creation, privacy/control, or something else?
3. Which cohort produces and downloads multiple usable takes without heavy
   facilitation?
4. Which concrete iOS/iPadOS/Android and touch-capable desktop targets matter most to the
   highest-value early audience?

### Activation and comprehension

5. Can a new user explain the difference between Local Camera, Character AI,
   VTO, Workshop, and Shelf before starting a paid action?
6. Where do users pause in the Character → Record → Voice → Download loop?
7. Does action-first copy solve those pauses, or is lightweight guidance needed?
8. Can a returning user find and reuse a saved character without instruction?

### Output value

9. What makes a take usable: visual fidelity, latency, identity consistency,
   voice match, recording quality, or editability?
10. How many attempts are needed for one usable/downloaded take?
11. Does saved-character reuse improve speed, quality, or confidence on the
    second session?
12. Does voice treatment materially increase take utility, or only delight?
13. Does VTO solve a distinct job strongly enough to justify its separate
    guidance, provider risk, and support burden?

### Trust, limits, and retention

14. Do users understand when local media becomes provider media?
15. Is the five-minute AI boundary compatible with the target creative task?
16. What warning and recovery behavior feels least disruptive near expiry?
17. What local data do users expect Remove, Reset, Close, Discard, and site-data
    clearing to delete?
18. Is an operator wipe sufficient for the target pilot, and what deletion
    control is expected before unassisted use?

### Economics and platform

19. What is the provider cost distribution per successful and usable take?
20. Which failures incur provider cost, and which allowance behavior feels fair?
21. Do target users prefer predictable subscription access, visible credits,
    bring-your-own keys, or a hybrid?
22. Is account sync required for repeat value, or would export/import satisfy
    early portability?
23. Do users need take history, or is Download plus local file management enough?
24. What evidence would justify collaboration, templates, commerce, or mobile
    over improving the core performance loop?

## 19. Recorded Wave 0 decisions and remaining gates

The product owner approved the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md) on 2026-07-28. It freezes
the cohort, product hierarchy, physical target matrix, independent warning/end behavior,
participant isolation and retirement, provider settings, access limits, refusal/support rules,
generic local owners, and content-free metrics. First-use guidance is withheld during the entirely
moderated formative cohort unless repeated observed comprehension failures trigger it.

The remaining work is release evidence and later-wave implementation, not another Wave 0 choice:

1. Implement and verify the independent 270/300-second recording and Decart contracts.
2. Preserve the implemented touch recovery, saved-character entry, camera-permission recovery,
   direct disclosures, capability truth, and Wave 5 trust boundary while completing
   narrow-screen reachability and broader Voice usability.
3. Obtain every named physical target and complete the full media, accessibility, memory,
   background/foreground, download, and cleanup protocol on the exact stable versions.
4. Qualify Lucy 2.5, exact VTO 3, ElevenLabs, and the separate OpenAI/BFL/Wiro configurations under
   the approved provider policy.
5. Re-run the passing isolated whole-dataset retirement drill before admitting participant data
   and complete the operator checklist for every real participant environment.
6. Require semantically truthful journey, visual, physical, and live evidence for release sign-off.

## 20. Decisions that should be deferred

Defer these decisions until the evidence trigger is met:

- **Credits, subscription, hybrid, or BYOK as the public business model:** after
  Stage B shows repeat value, willingness to pay, and cost per usable take.
- **Free trial structure:** after the paid unit and abuse exposure are known.
- **Automated failed-generation refunds/restoration:** after provider billing
  outcomes can be reconciled reliably.
- **Full account and cloud-project model:** after users prove a portability,
  recovery, take-history, or collaboration need that local/export solutions
  cannot satisfy.
- **Cloud take retention duration:** after a cloud take is approved as a product
  capability and its customer job is known.
- **Character export, sync, team ownership, or marketplace rules:** after
  character reuse is a measured retention driver.
- **Whether mobile becomes the primary market position rather than a supported creation
  surface:** after physical-device and audience research.
- **VTO as a primary product vertical:** after a secondary beta proves demand,
  quality, and safe expectation-setting.
- **Public voice import or cloning:** until a separate rights, consent,
  moderation, and abuse product is deliberately approved.
- **Automatic provider fallback:** until consent, quality equivalence, pricing,
  and billing semantics are proven. The default remains no automatic fallback.
- **Take library, timeline editing, collaboration, sharing, templates, packs,
  garment extraction, and commerce:** until repeated user behavior triggers the
  corresponding Stage E item.
- **Broad architectural refactors:** until a concrete ownership or lifecycle
  boundary, rather than file size, requires one.
- **Retired route revival:** indefinitely. `/` remains the only application
  route.

## Official provider references

Provider behavior and limits can change. Release checks must use the current
official documentation and the exact configured accounts/models:

- Decart platform overview:
  <https://docs.platform.decart.ai/getting-started/overview>
- Decart Lucy 2.5:
  <https://docs.platform.decart.ai/models/realtime/lucy-2.5>
- Decart Virtual Try-On:
  <https://docs.platform.decart.ai/models/realtime/virtual-try-on>
- Decart realtime streaming best practices:
  <https://docs.platform.decart.ai/models/realtime/streaming-best-practices>
- Decart client tokens:
  <https://docs.platform.decart.ai/getting-started/client-tokens>
- ElevenLabs Voice Changer overview:
  <https://elevenlabs.io/docs/overview/capabilities/voice-changer>
- ElevenLabs speech-to-speech conversion API:
  <https://elevenlabs.io/docs/api-reference/speech-to-speech/convert>
- ElevenLabs saved-voices search API:
  <https://elevenlabs.io/docs/api-reference/voices/search?explorer=true>
- ElevenLabs zero-retention mode:
  <https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode>

## Canonical release conclusion

Lightframe Studio has a credible controlled MVP because its core local media
lifecycle, reusable Character workflow, explicit AI activation, recording
finalization, optional voice treatment, and Download boundary already form a
complete short-form creation loop. It should not be presented as a public
creator platform.

Complete Stage A, then use Stage B to determine whether creators return for the
reusable identity and finished-take value. Only that evidence should authorize
the account, backend, monetization, and creator-platform work in Stages C–E.
