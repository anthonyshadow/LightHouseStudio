# Lightframe Studio user stories

This directory documents the product flows implemented in Lightframe Studio. These are behavioral references for product, design, QA, and engineering; they describe the current local-first implementation rather than future requirements.

## How to use these stories

Each story is written as an observable end-to-end journey:

1. **Starting state** identifies prerequisites and locks that must be absent.
2. **End-to-end steps** records every user action, system transition, and visible checkpoint.
3. **Failure and alternate paths** captures the recovery choices that a creator encounters.
4. **Completion criteria** defines when the goal is complete.
5. **UX investigation cues** identifies the friction, comprehension, and timing points to test before redesigning the flow.

Use the documents to run usability sessions or journey walkthroughs: ask participants to attempt the primary flow without help, note where they pause or mispredict the result, then compare that behavior with the documented guardrails and recovery paths.

| Flow                                                           | Document                                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Configure camera, microphone, and local quality                | [01 Configure capture settings](01-configure-capture-settings.md)                                                       |
| Preview and record without provider work                       | [02 Local camera capture](02-local-camera-capture.md)                                                                   |
| Create and control a live Character AI session                 | [03 Character AI session](03-character-ai-session.md)                                                                   |
| Create and control a virtual try-on session                    | [04 Virtual try-on session](04-virtual-try-on-session.md)                                                               |
| Build a character prompt and generate a reference              | [05 Character workshop and reference generation](05-character-workshop-and-reference-generation.md)                     |
| Save, find, and reuse creative recipes                         | [06 Recipe Shelf](06-recipe-shelf.md)                                                                                   |
| Finalize, review, download, or discard a take                  | [07 Take review and cleanup](07-take-review-and-cleanup.md)                                                             |
| Apply a browser-local voice treatment                          | [08 Local voice treatments](08-local-voice-treatments.md)                                                               |
| Discover, import, and apply an ElevenLabs voice                | [09 ElevenLabs voice workflow](09-elevenlabs-voice-workflow.md)                                                         |
| Work safely when providers or browser features are unavailable | [10 Capability and recovery boundaries](10-capability-and-recovery-boundaries.md)                                       |
| Build, preview, save, and preload a reusable Studio character  | [11 Studio character builder](11-new-user-character-ai-voice-download/complete-new-user-character-ai-voice-download.md) |

Shared product rules:

- The app is a single-operator, loopback-only Studio. It has no accounts or cloud project history. `/` is the sole application route; retired entries canonicalize there without remounting the Studio runtime.
- The fullscreen character builder is opened from Studio, autosaves one active draft to IndexedDB, and exposes an explicit Reset Draft action. Existing Guided projects remain downloadable or deletable through the temporary Legacy Projects manager, but cannot be reopened.
- Camera/microphone access, provider contact, and billable work begin only through explicit actions.
- Saving a character does not imply image generation: prompt-only, new reference, and compatible existing reference are separate choices.
- Character visual suggestions adapt to Woman, Man, Non-binary, or Not specified without deleting an existing selection; shared choices and custom text remain available.
- The Studio stage remains mounted while overlays are open; closing the character builder preserves its durably autosaved draft.
- Studio keeps one temporary take and locks new capture work until the operator downloads and closes it or confirms discard. Legacy Guided project media remains in its existing browser-local repository until explicit deletion.
