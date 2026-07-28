# Screenshot Test Coverage

Date: 2026-07-28  
Suite: `e2e/studio.visual.spec.ts`  
Matrix source of truth: `e2e/studioVisualMatrix.ts`  
Configuration: `playwright.visual.config.ts`

## Purpose

The curated Studio screenshot suite protects high-centrality product states and responsive layout risks. It is not a gallery of every dialog or state-machine branch, and it does not validate live AI output.

The suite is designed to:

- represent the current single-stage Studio;
- protect the initial impression, local camera, recording, Character reuse, Builder, playback, loading, and error states;
- keep the five established responsive viewports;
- use deterministic local fixtures and simulated provider behavior;
- reject screenshots captured before the intended UI is semantically ready;
- detect meaningful regressions without turning every minor state into a baseline.

Behavioral correctness, accessibility, provider contracts, touch interaction, and live media quality remain the responsibility of component, domain, E2E, manual-device, and gated live-provider tests.

## Matrix summary

The current matrix contains 29 cases:

| Group             |     Scenarios | Viewport rule                 |  Cases |
| ----------------- | ------------: | ----------------------------- | -----: |
| Core Studio       |             3 | All five viewports            |     15 |
| Focused high-risk |             5 | Full desktop and small mobile |     10 |
| Desktop-specific  |             2 | Full desktop only             |      2 |
| Small-mobile risk |             2 | Small mobile only             |      2 |
| **Total**         | **12 states** |                               | **29** |

`e2e/studioVisualMatrix.ts` treats 29 as a maximum review/CI budget, not an equality-based definition of quality. Its semantic invariants require:

- every baseline path is unique;
- all five established viewport IDs appear;
- every core scenario/viewport pair exists;
- total cases do not exceed the budget.

## Established viewports

| ID             | Dimensions | Baseline folder               | Why it remains                                                           |
| -------------- | ---------: | ----------------------------- | ------------------------------------------------------------------------ |
| `desktop`      | 1440 × 960 | `01-full-desktop-1440x960`    | Primary controlled-pilot layout and full wide-drawer/Builder composition |
| `compact`      | 1280 × 720 | `02-compact-desktop-1280x720` | Short desktop height stresses fixed shell and vertical hierarchy         |
| `tablet`       | 834 × 1112 | `03-tablet-portrait-834x1112` | Exercises drawer-to-bottom-panel transitions                             |
| `mobile`       |  390 × 844 | `04-mobile-portrait-390x844`  | Established modern phone portrait layout                                 |
| `small-mobile` |  320 × 568 | `05-small-mobile-320x568`     | Highest density, scroll, label, and full-screen-overlay risk             |

No required viewport has been silently removed. Focused states use the two endpoints—1440 × 960 and 320 × 568—while core states remain protected at every established size.

## Screenshot manifest

All entries use route `/`. `<platform>` is the platform-specific Chromium folder, such as `chromium-darwin` or `chromium-linux`.

| Screenshot name / baseline                           | Entry and user state                                                                    | Viewports             | Primary components covered                                                                 | Why it is important                                                                           | Fixture or mock requirements                                                                    | Known intentional exclusions                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `01-studio/initial-closed.png`                       | Initial Studio, no dialog open, camera off, no character selected                       | All five              | `StudioHeader`, `MediaStage`, idle session controls, capture summary, creative rail        | Protects the real first impression and primary camera action                                  | Fixed capabilities/time; seeded saved character remains unselected and visually background-only | Not a truly empty storage state; no onboarding state exists                                                                   |
| `01-studio/local-camera-live.png`                    | Local camera/mic active, no AI provider                                                 | All five              | Persistent stage/video, live badge, session controls, recording controls                   | Protects the provider-free core and media-stage geometry                                      | Synthetic `getUserMedia`; stable live video frame                                               | Does not prove physical camera quality, touch reveal, or WebKit                                                               |
| `01-studio/recording-active.png`                     | Local preview recording; Stop Recording visible                                         | All five              | Stage recording indicator/timer, control bar, capture status                               | Protects the highest-consequence live control state and narrow density                        | Synthetic media and `MediaRecorder`                                                             | Does not prove long-duration memory, final data, or codec behavior                                                            |
| `01-studio/ai-experience-choice.png`                 | Local preview active; Start AI chooser open                                             | Desktop, small mobile | `AIExperienceChooser`, stage beneath overlay, Character and VTO cards                      | Protects the primary AI decision and full-screen mobile presentation                          | Synthetic local media; configured capabilities                                                  | Current screenshot cannot prove consent comprehension, entitlement, or provider availability                                  |
| `01-studio/selected-character-ai-live.png`           | Deterministic saved character selected; Character AI simulated active                   | Desktop, small mobile | Header character state, transformed stage, AI status, live controls                        | Protects actual selected-character identity/reuse rather than a generic direct prompt         | Seeded `CreativeAssetStore`; simulated Decart connection/media                                  | No live Decart output; setup currently selects the Characters tab when necessary and therefore does not prove UX-002 is fixed |
| `02-character-builder/combined-reference-ready.png`  | Builder with uploaded source and successful generated combined preview                  | Desktop, small mobile | `CharacterBuilderPanel`, upload preview, direction choices, generated preview, Save action | Protects the most layout-intensive central Character state and narrow-screen progression      | Stable 1×1 PNG upload; mocked optimizer/reference-generation response                           | Prompt-only, image-only save, loading, stale, regeneration, and error variants remain behavioral/component coverage           |
| `03-character-library/saved-character-selection.png` | Enter saved-character Shelf and show Characters category with deterministic character   | Desktop, small mobile | Character selector entry, `RecipeShelf`, category control, character card/list             | Protects the collection users expect from “Choose saved character”                            | Seeded `CreativeAssetStore`                                                                     | Fixture compensates by clicking Characters if needed; a separate journey test must catch the current entry-intent defect      |
| `04-take-review/playback-review-settled.png`         | Local take finalized; playback owns stage; Latest Take fully loaded                     | Desktop, small mobile | Playback `MediaStage`, Take Review, Download/action controls                               | Protects the handoff from live recording to review and rejects the old lazy-fallback baseline | Synthetic recording; stable local playback Blob/metadata                                        | Does not prove download completion, long takes, voice processing, or browser file handling                                    |
| `05-virtual-try-on/prepared-with-reference.png`      | VTO Dock prepared with prompt and ephemeral garment reference; not started              | Desktop               | Recipe Dock VTO fields, reference preview, provider-managed setup, enabled Start           | Protects VTO’s distinct prompt/image preparation without live AI output                       | Stable PNG upload; configured VTO capability                                                    | No live VTO, garment extraction, fit/size quality, mobile VTO, or provider entitlement                                        |
| `06-voice/voice-browser-loaded.png`                  | Recorded take → Voice Treatments → Voice Browser loaded with deterministic saved voice  | Desktop               | Playback context, nested overlays, Voice Treatments, Voice Browser/list                    | Protects the deepest provider-adjacent overlay and loaded/ready state                         | Synthetic take; mocked ElevenLabs availability/list with `Northstar Narrator`                   | No live preview/conversion/remux, search/pagination matrix, provider billing, or zero-retention proof                         |
| `01-studio/take-finalizing.png`                      | Stop requested while recorder terminal event is held; blocking Finalizing state visible | Small mobile          | Media Stage finalization overlay, locked controls                                          | Representative loading/blocking state at the highest-risk viewport                            | Synthetic recorder with deliberately withheld terminal event                                    | Does not prove real finalization latency or recovery from recorder failure                                                    |
| `01-studio/media-permission-error.png`               | Camera/mic permission rejected; contextual recovery alert shown                         | Small mobile          | Recipe Dock action, stage notice/error recovery                                            | Representative error state and narrow-screen recovery treatment                               | `getUserMedia` rejects with deterministic `NotAllowedError`                                     | Other provider, generation, playback, and storage errors remain behavioral coverage                                           |

## Deterministic fixtures and mocks

Every case begins with `prepareVisualPage`:

- fixes the clock to `2026-07-18T14:30:00.000Z`;
- fixes `performance.now()` to remove timing drift;
- emulates reduced motion;
- installs the successful Studio test harness with simulated browser media, Decart behavior, reference generation, recording/playback, capabilities, and ElevenLabs routes;
- seeds a deterministic v4 creative-asset store containing one saved `Cinematic Field Presenter`;
- uses fixed character copy, timestamps, use counts, and tags;
- loads `/` and waits for the main application and configured capability response;
- disables animations, transitions, backdrop filtering, and caret rendering;
- fixes the visual audio level.

Scenario-specific fixtures:

- Character and VTO uploads use the same in-memory PNG bytes and fixed file names.
- Character generation uses the mocked app-owned reference-image path; no live generated bitmap is requested.
- Selected Character AI uses a simulated realtime connection and stable transformed-media presentation.
- Recording and playback use synthetic media and local Blob metadata.
- Voice Browser uses a mocked saved-voice response containing `Northstar Narrator`.
- Permission error uses a deterministic `NotAllowedError`.
- Finalizing deliberately withholds the recorder terminal event.

## Readiness and stabilization contract

A screenshot is taken only after the scenario’s observable state is asserted.

Global readiness:

1. Wait for `document.fonts.ready`.
2. Wait for two animation frames and blur incidental focus.
3. For live media, require current video data and non-zero dimensions.
4. For playback, require the expected Blob URL, metadata-ready state, and positive duration.
5. Replace the active synthetic live frame with a fixed centered green field so camera-frame timing cannot alter pixels.
6. Assert no `Loading studio tool…` fallback remains anywhere on the page.
7. Assert no document overflow.
8. Assert no unexpected external provider traffic.
9. Capture the viewport—not a scrolling full-page document—at CSS scale.

Important scenario-specific readiness includes:

- no dialog and visible `Start Camera + Mic` for initial state;
- correct `data-stage-presentation` for live/playback;
- visible `Stop recording` and `data-recording=true`;
- selected character accessible label before simulated AI start;
- current uploaded reference, matched generated preview, and enabled Save in Builder;
- active `Characters` category and saved-character list;
- visible Latest Take heading and Download action with no lazy fallback;
- loaded deterministic voice and no `Loading voices…`;
- exact finalization or permission-error message.

The screenshot tolerance is `maxDiffPixelRatio: 0.005`. Animations are disabled in both the suite and screenshot assertion.

## Network and provider boundary

The visual suite must not contact live external AI or media providers.

- Decart sessions are simulated.
- Capability, reference-image, voice, and other app-owned API routes are fulfilled by the harness.
- ElevenLabs list data is deterministic.
- Unexpected external HTTP and WebSocket/provider traffic fails the scenario through `expectNoExternalProviderTraffic`.

This boundary protects cost, privacy, reliability, and reproducibility. Live entitlement, output quality, NAT/connectivity, provider retention, quota, and billing remain gated manual smoke checks.

## Semantic coverage invariants

The matrix is intentionally validated by meaning, not just count:

- all baseline paths are unique;
- all established viewports remain represented;
- initial, local-live, and recording states exist at every viewport;
- focused states use both the primary desktop and smallest mobile endpoints;
- lazy loading is not accepted as a final visual state;
- every scenario asserts its meaningful heading, control, status, category, or presentation before capture;
- no external provider traffic occurs.

The pruning/inventory script derives its curated set from the matrix rather than carrying a separate hard-coded list. It refuses destructive pruning when required baselines are missing.

## Intentional exclusions

The curated suite does not include:

- every modal, confirmation, empty state, and error variant;
- all Character Builder prompt-only, image-only, stale, regenerate, reset, discard, and failure branches;
- Prompt Workshop and Capture Settings as curated baselines;
- every Shelf category, search, tag, editor, rename, and delete state;
- live Decart/VTO generated output;
- live ElevenLabs preview/conversion/remux;
- provider outage, quota, entitlement, retention, or cost behavior;
- Legacy Projects;
- cross-browser pixel snapshots;
- every focused state at 390px, tablet, and compact desktop;
- sustained recording, memory peaks, battery, background/foreground, or physical-device camera/codec behavior;
- touch gestures, keyboard focus order, screen-reader announcements, or contrast measurement.

Those exclusions are deliberate when component stories, semantic E2E tests, responsive geometry tests, manual QA, or live-provider smoke provide a more stable and diagnostic assertion.

## Current visual issues and non-claims

The screenshot matrix improves state selection, but it does not itself fix product defects.

### Issues observed in the superseded reviewed baselines

- The old `local-idle.png` opened Recipe Dock, so mobile showed only the full-screen Dock instead of the initial Studio.
- The old `character-ai-live.png` showed no selected character and represented the direct-prompt path.
- The old 320 × 568 `latest-take.png` captured only `Loading studio tool…`.
- The old 320 × 568 recording state was crowded and clipped part of the Start AI label.

The new initial, selected-character, and settled-review scenario definitions address the first three test-state problems through explicit setup/readiness assertions. The recording-density concern remains a UI issue to resolve and review.

### Current unresolved product/test boundaries

- `openSavedCharacters` clicks the Characters tab when it is not already selected. This creates the intended screenshot but masks the code-confirmed UX-002 entry-intent defect. A separate end-to-end journey must require the tab to be active immediately after “Choose saved character.”
- Static screenshots cannot expose the code-confirmed touch auto-hide failure.
- No current visual state contains the proposed direct-start provider disclosure, AI-session timer, recording-duration policy, or retained-asset deletion clarification because those product changes are not yet implemented.
- A new scenario definition or local capture is not equivalent to a reviewed baseline. Platform baseline completeness, expected diffs, and human approval must be established by the visual release gate.

## Baseline lifecycle and review

Baselines are platform-specific under:

```text
screenshots/chromium-<platform>/<viewport folder>/<scenario baseline>
```

Use the normal visual command to compare against the current platform. Update baselines only as part of an intentional UI/matrix change:

1. Run the scenario and inspect the actual state.
2. Confirm semantic readiness and absence of fallback content.
3. Review diffs at every affected viewport.
4. Confirm the image represents the intended product state, not merely a stable state.
5. Generate/review each supported platform set deliberately.
6. Run the baseline inventory check.
7. Prune obsolete images only after every new curated baseline exists.

Do not update visual snapshots during unrelated work, and do not infer that passing Chromium screenshots establish physical mobile or WebKit support.

## Relationship to other test layers

| Layer                     | Owns                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Pure/domain tests         | State rules, identity, validation, destructive/persistence policy                     |
| Component/Storybook tests | Variant rendering, aria relationships, loading/error/empty branches                   |
| Functional Playwright     | Complete journeys, focus, scrolling, touch, persistence, provider-boundary assertions |
| Curated screenshots       | High-value visual composition and responsive regressions                              |
| Broad screenshot capture  | Optional product-review contact sheet, not checked regression                         |
| Manual device QA          | Camera/codec, touch, memory, battery, assistive technology, browser behavior          |
| Gated live-provider smoke | Entitlement, live connectivity, output, retention/account behavior                    |

Related canonical UX findings and release conditions are in [ui-ux-current-state.md](./ui-ux-current-state.md).
