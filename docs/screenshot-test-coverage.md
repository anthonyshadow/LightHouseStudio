# Screenshot test coverage

**Suite:** `e2e/studio.visual.spec.ts`

**Matrix:** `e2e/studioVisualMatrix.ts`

**Configuration:** `playwright.visual.config.ts`

The curated suite protects high-value visual composition and responsive states. Functional,
accessibility, physical-device, and live-provider behavior belongs to other test layers.

## Matrix

The current matrix has 31 Chromium cases:

| Group             | States | Viewports                    | Cases |
| ----------------- | -----: | ---------------------------- | ----: |
| Entry             |      1 | small mobile                 |     1 |
| Core Studio       |      2 | all five                     |    10 |
| Studio idle       |      2 | desktop                      |     2 |
| Focused high-risk |     10 | risk-selected viewport pairs |    12 |
| Desktop-specific  |      2 | desktop                      |     2 |
| Small-mobile risk |      2 | small mobile                 |     2 |
| Projects          |      2 | desktop and small mobile     |     2 |

Thirty-one is the review budget, not the definition of correctness. The current matrix uses all 31
cases. The executable invariants require unique paths, all five viewport IDs, and every
local-live/recording state/viewport pair.

| Viewport ID    |       Size |
| -------------- | ---------: |
| `desktop`      | 1440 × 960 |
| `compact`      | 1280 × 720 |
| `tablet`       | 834 × 1112 |
| `mobile`       |  390 × 844 |
| `small-mobile` |  320 × 568 |

## Protected states

| Scope                 | Baseline                                             |
| --------------------- | ---------------------------------------------------- |
| Small mobile          | `00-entry/initial.png`                               |
| Desktop               | `01-studio/initial-closed.png`                       |
| Desktop               | `01-studio/initial-portrait.png`                     |
| All viewports         | `01-studio/local-camera-live.png`                    |
| All viewports         | `01-studio/recording-active.png`                     |
| Desktop               | `01-studio/selected-character-ai-live.png`           |
| Small mobile          | `02-character-builder/combined-reference-ready.png`  |
| Desktop               | `03-character-library/saved-character-selection.png` |
| Small mobile          | `04-take-review/playback-review-settled.png`         |
| Small mobile          | `07-existing-video/chooser.png`                      |
| Compact/tablet/mobile | `07-existing-video/validated-setup.png`              |
| Compact               | `07-existing-video/processing.png`                   |
| Desktop               | `07-existing-video/result.png`                       |
| Desktop               | `08-video-editor/lighting-dirty.png`                 |
| Small mobile          | `08-video-editor/crop-dirty.png`                     |
| Desktop               | `10-campaigns/workspace.png`                         |
| Small mobile          | `09-projects/output-review.png`                      |
| Desktop               | `05-virtual-try-on/prepared-with-reference.png`      |
| Desktop               | `06-voice/voice-browser-loaded.png`                  |
| Small mobile          | `01-studio/take-finalizing.png`                      |
| Small mobile          | `01-studio/media-permission-error.png`               |

The matrix intentionally emphasizes the record/upload first impression, neutral Local Camera
startup, provider-free live capture, dominant recording Stop, the densest Builder/review states,
deterministic dirty Lighting/Crop editor layouts, the active/archived Campaigns workspace, the
small-mobile Project output-review boundary, and representative loading/error states. These cases
keep the review budget from 29 to 31 because durable Campaign navigation and exact-Version output
review are protected composition contracts.

## Determinism and readiness

Each case uses fixed time, reduced motion, synthetic media, simulated Decart, deterministic
reference/voice fixtures, seeded v6 creative metadata, hidden test-browser scrollbars, and denied
unexpected provider traffic. Hiding scrollbars keeps captures independent of host scrollbar
preferences; scroll containment remains asserted separately. No paid or live provider is
contacted.

A capture is valid only after the scenario asserts its observable state. Global readiness waits for
fonts and media, removes animation/caret noise, fixes the synthetic live frame, rejects unresolved
`Loading studio tool…`, checks document containment, and verifies no unexpected external HTTP or
WebSocket. Playback must have metadata, positive duration, and the expected Blob URL.

The screenshot threshold is `maxDiffPixelRatio: 0.005`. A visually stable fallback or wrong
category is still a failed scenario.

## Baselines

Platform-specific baselines live under:

```text
screenshots/chromium-<platform>/<viewport>/<scenario>
```

The repository contains platform-specific baselines tracked by the executable matrix. Linux
existing-video coverage may require generation on Linux because font rasterization prevents safe
cross-platform copying. The pruning inventory reports exact missing paths before any deletion.

The pruning script derives its inventory from the matrix and refuses deletion while any required
baseline is missing:

```bash
node scripts/prune-visual-baselines.mjs --check
bun run test:visual
```

Use `bun run test:visual:update` only for an intentional UI/matrix change. Inspect every changed
image on every affected platform and viewport before accepting it. Do not prune until replacement
baselines exist.

Visual regression does not run in `bun run test`, `bun run quality`, or ordinary push/pull-request CI.
Run it explicitly for material UI/UX changes and every exact release candidate. The manual CI
workflow also exposes it through `workflow_dispatch`.

## What this suite does not prove

Screenshots do not qualify:

- touch recovery, focus order, announcements, contrast, or assistive technology;
- real camera/microphone, codec, recording, memory, backgrounding, download, or mobile-browser
  behavior;
- live Decart/VTO output, provider entitlement, quota, cost, retention, or failure handling;
- live ElevenLabs preview/conversion/remux;
- every overlay, confirmation, error, Shelf branch, Builder branch, or legacy state; or
- cross-browser pixel identity.

Pure/domain tests own rules; component tests and manual Storybook review own variants and ARIA;
functional Playwright owns journeys, focus, scrolling, persistence, and network boundaries; broad
screenshot capture is a review artifact; physical QA and gated provider smoke own release
validation.

See [Manual QA](MANUAL_QA.md), [Browser support](BROWSER_SUPPORT.md), and
[Live provider smoke](LIVE_PROVIDER_SMOKE.md) for the remaining evidence gates.
