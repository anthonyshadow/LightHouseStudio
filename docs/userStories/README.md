# Lightframe Studio user stories

These stories describe observable behavior in the current local-first Studio. They are journey
references, not release-readiness claims or future requirements.

## Journeys

| Flow                                         | Story                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| Choose camera, microphone, and local quality | [Configure capture settings](01-configure-capture-settings.md)                 |
| Preview and record without provider work     | [Local camera capture](02-local-camera-capture.md)                             |
| Run and record Lucy 2.5                      | [Character AI session](03-character-ai-session.md)                             |
| Run and record VTON 3                        | [Virtual try-on session](04-virtual-try-on-session.md)                         |
| Build Add, Replace, or Restyle directions    | [Structured prompt workshop](05-structured-prompt-workshop.md)                 |
| Save and reuse recipes                       | [Recipe Shelf](06-recipe-shelf.md)                                             |
| Review, download, and release a take         | [Take review and cleanup](07-take-review-and-cleanup.md)                       |
| Apply browser-local voice effects            | [Local voice treatments](08-local-voice-treatments.md)                         |
| Apply a saved ElevenLabs voice               | [ElevenLabs voice workflow](09-elevenlabs-voice-workflow.md)                   |
| Recover from missing capabilities            | [Capability and recovery boundaries](10-capability-and-recovery-boundaries.md) |
| Build and preload a reusable character       | [Studio character builder](11-studio-character-builder.md)                     |

## Shared runtime rules

- `/` is the provider-free entry and `/studio` is the active Studio runtime. They are the only
  registered routes; every other path returns to `/`.
- When old browser-local project data is detected, Recipe Shelf can open the download/delete-only
  Legacy Projects manager. It has no route and cannot revive the retired Guided experience.
- Browser navigation cannot abandon recording/finalization. Leaving with a temporary take, active
  Voice process, or dirty Shelf form requires confirmed discard.
- Camera access, provider contact, and billable work require an explicit action. Local Camera does
  not request provider credentials, load the Decart SDK, or send media externally.
- Character Builder owns true character creation and editing. Workshop owns only Add, Replace, and
  Restyle object recipes. VTO is secondary/beta.
- Studio keeps one mounted media stage and one temporary take. A take blocks new media work until
  it is released after download initiation or explicitly discarded.
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
