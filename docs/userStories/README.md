# Lightframe Studio user stories

These stories describe observable behavior in the current local-first Studio. They are journey
references, not release-readiness claims or future requirements. They use **video** and current
feature names deliberately where the implemented contract is video-specific; the broader
Campaign, Project, and Asset vocabulary in [Product Vision](../PRODUCT_VISION.md) does not make
future features current.

## Journeys

| Flow                                                   | Story                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Record or upload, then edit and save                   | [Existing video processing](12-existing-video-processing.md)                   |
| Trim, crop, relight, filter, and replace a source      | [Local non-destructive video editing](13-local-video-editing.md)               |
| Choose camera, microphone, local format, and quality   | [Configure capture settings](01-configure-capture-settings.md)                 |
| Preview and record without provider work               | [Local camera capture](02-local-camera-capture.md)                             |
| Run and record a live character transformation         | [Live character transformation](03-character-ai-session.md)                    |
| Run and record live virtual try-on                     | [Virtual try-on session](04-virtual-try-on-session.md)                         |
| Build Add, Replace, or Restyle directions              | [Structured prompt workshop](05-structured-prompt-workshop.md)                 |
| Save and reuse recipes                                 | [Recipe Shelf](06-recipe-shelf.md)                                             |
| Review, save, and release a take                       | [Take review and cleanup](07-take-review-and-cleanup.md)                       |
| Apply browser-local voice effects                      | [Local voice treatments](08-local-voice-treatments.md)                         |
| Browse, save, manage, and apply provider-backed voices | [ElevenLabs voice workflow](09-elevenlabs-voice-workflow.md)                   |
| Recover from missing capabilities                      | [Capability and recovery boundaries](10-capability-and-recovery-boundaries.md) |
| Build and preload a reusable character                 | [Studio character builder](11-studio-character-builder.md)                     |
| Log in, restore, and log out safely                    | [Login and local session](14-login-and-session.md)                             |
| Save, browse, version, and reload local videos         | [Saved Video Gallery](15-saved-video-gallery.md)                               |
| Reuse saved characters and outfits                     | [Saved creative libraries](16-saved-creative-libraries.md)                     |
| Create and manage durable empty Projects               | [Empty Project lifecycle workspace](17-empty-project-lifecycle.md)             |
| Organize Projects with optional Campaigns              | [Campaign organization](18-campaign-organization.md)                           |

## Shared runtime rules

- `/` is the provider-free entry and Login surface. `/studio`, `/studio/projects`,
  `/studio/projects/:projectId`, `/studio/videos`, `/studio/characters`, and `/studio/outfits` are
  authenticated views of one active Studio runtime; every other path returns to `/`.
- Studio begins in neutral Local Camera mode with camera and microphone off. Only an explicit
  control-bar, upload-panel, or Dock action acquires media; only an explicit AI Start contacts a
  provider.
- Retired Guided repositories and presentation code are removed. Their records are not imported
  into Saved Videos and cannot revive the retired Guided experience.
- Browser navigation cannot abandon recording/finalization or an active video render. Leaving with
  a temporary take, active Voice process, dirty local video edit, or dirty Shelf form requires
  confirmed discard.
- Camera access, provider contact, and billable work require an explicit action. Local Camera does
  not request provider credentials, load the Decart SDK, or send media externally.
- The primary flow records or uploads a source, reviews it, and optionally applies Character Swap,
  Virtual Try On, and/or Voice, then saves the result before download from Saved Videos. Live
  Character/VTO transformation and Workshop are advanced flows.
- Campaign and empty Project lifecycle management is user-facing, including optional membership,
  move/detach, and the virtual No Campaign group. Source resume, autosave, creative integration,
  processing, and Project output history are not.
- Character Builder owns true character creation and editing. Workshop owns only Add, Replace, and
  Restyle object recipes.
- Saved Character Wardrobe owns normalized original/variant browsing and variant creation while
  reusing the same Shelf metadata, immutable reference store, and overlay/media ownership.
- Studio keeps one mounted media stage and one temporary take pipeline. Its immutable source may
  be recorded, uploaded, or a validated local edit; presentation selects the voiced, visual, or
  source layer without mounting another player.
- An uploaded workflow may run either exact batch model once, never both. The creator may switch
  the single active model before submission; only the active choice is used.
- The recording and Decart session limits are independent: each warns at 270 seconds and ends
  through its own safe path at 300 seconds.
- Recipe metadata is user-namespaced browser data and may revision-sync to Neon when configured.
  Builder reference and saved-video bytes are authenticated assets in the selected local/R2 store.
  In authoritative Neon/R2, creative-library relationships retain saved references while explicit
  discard and 24-hour inactive-orphan cleanup remove unreferenced staged assets. Dock portrait and
  garment uploads are tab-ephemeral.

## Evidence boundary

Deterministic tests cover the implemented journeys, including synthetic provider and 300-second
cases. The [testing strategy](../TESTING.md) maps those critical journeys to the smallest useful
domain, controller, API, browser, or visual layer. It does not qualify physical devices,
accessibility tools, codecs, memory behavior, live provider entitlement/output, or cleanup.
Use [Manual QA](../MANUAL_QA.md) and the authorized
[live-provider procedure](../LIVE_PROVIDER_SMOKE.md) for those environment-dependent checks.
