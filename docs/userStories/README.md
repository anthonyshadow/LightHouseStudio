# Lightframe Studio user stories

These stories describe observable behavior in the current local-first Studio. They are journey
references, not release-readiness claims or future requirements.

## Journeys

| Flow                                                 | Story                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Record or upload, then edit and download             | [Existing video and single visual processing](12-existing-video-and-ordered-processing.md) |
| Trim, crop, relight, filter, and replace a source    | [Local non-destructive video editing](13-local-video-editing.md)                           |
| Choose camera, microphone, local format, and quality | [Configure capture settings](01-configure-capture-settings.md)                             |
| Preview and record without provider work             | [Local camera capture](02-local-camera-capture.md)                                         |
| Run and record live Lucy 2.5                         | [Character AI session](03-character-ai-session.md)                                         |
| Run and record live VTON 3                           | [Virtual try-on session](04-virtual-try-on-session.md)                                     |
| Build Add, Replace, or Restyle directions            | [Structured prompt workshop](05-structured-prompt-workshop.md)                             |
| Save and reuse recipes                               | [Recipe Shelf](06-recipe-shelf.md)                                                         |
| Review, download, and release a take                 | [Take review and cleanup](07-take-review-and-cleanup.md)                                   |
| Apply browser-local voice effects                    | [Local voice treatments](08-local-voice-treatments.md)                                     |
| Apply a saved ElevenLabs voice                       | [ElevenLabs voice workflow](09-elevenlabs-voice-workflow.md)                               |
| Recover from missing capabilities                    | [Capability and recovery boundaries](10-capability-and-recovery-boundaries.md)             |
| Build and preload a reusable character               | [Studio character builder](11-studio-character-builder.md)                                 |

## Shared runtime rules

- `/` is the provider-free entry and `/studio` is the active Studio runtime. **Record New Video**
  and **Upload Video** are entry intents for that same runtime; every other path returns to `/`.
- Studio begins in neutral Local Camera mode with camera and microphone off. Only an explicit
  control-bar, upload-panel, or Dock action acquires media; only an explicit AI Start contacts a
  provider.
- When old browser-local project data is detected, Recipe Shelf can open the download/delete-only
  Legacy Projects manager. It has no route and cannot revive the retired Guided experience.
- Browser navigation cannot abandon recording/finalization or an active video render. Leaving with
  a temporary take, active Voice process, dirty local video edit, or dirty Shelf form requires
  confirmed discard.
- Camera access, provider contact, and billable work require an explicit action. Local Camera does
  not request provider credentials, load the Decart SDK, or send media externally.
- The primary flow records or uploads a source, reviews it, and optionally applies Character Swap,
  Virtual Try On, and/or Voice. Live Character/VTO transformation and Workshop are advanced flows.
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
- Recipe metadata is browser-local. Builder reference bytes are immutable local server assets;
  Dock portrait and garment uploads are tab-ephemeral.

## Evidence boundary

Deterministic tests cover the implemented journeys, including synthetic provider and 300-second
cases. The [testing strategy](../TESTING.md) maps those critical journeys to the smallest useful
domain, controller, API, browser, or visual layer. It does not qualify physical devices,
accessibility tools, codecs, memory behavior, live provider entitlement/output, or cleanup.
Controlled-pilot support remains blocked until the exact release candidate satisfies the
[qualification evidence gate](../PILOT_QUALIFICATION_EVIDENCE.md) and
[release contract](../CONTROLLED_PILOT_RELEASE_CONTRACT.md).
