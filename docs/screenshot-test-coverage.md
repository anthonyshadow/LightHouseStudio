# Screenshot test coverage

**Suite:** `e2e/studio.visual.spec.ts`

**Matrix:** `e2e/studioVisualMatrix.ts`

**Configuration:** `playwright.visual.config.ts`

The curated suite protects high-value visual composition and responsive states. Functional,
accessibility, physical-device, and live-provider behavior belongs to other test layers.

## Matrix

The curated matrix is **50 Chromium cases over 25 baselines**, against a budget of 50 asserted in
`e2e/studioVisualMatrix.ts`. Fifty is the review budget, not the definition of correctness: the
executable invariants require unique baseline paths, all five viewport IDs, and every
local-live / recording-state / viewport pair.

| Viewport ID    |       Size |
| -------------- | ---------: |
| `desktop`      | 1440 × 960 |
| `compact`      | 1280 × 720 |
| `tablet`       | 834 × 1112 |
| `mobile`       |  390 × 844 |
| `small-mobile` |  320 × 568 |

## Protected states

Derived from the committed baselines; `bun run screenshots:prune` is the executable check that this
list and the tree agree.

| Viewports                  | Baseline                                             |
| -------------------------- | ---------------------------------------------------- |
| small-mobile               | `00-entry/initial.png`                               |
| desktop                    | `01-studio/initial-closed.png`                       |
| desktop                    | `01-studio/initial-portrait.png`                     |
| All viewports              | `01-studio/local-camera-live.png`                    |
| small-mobile               | `01-studio/media-permission-error.png`               |
| All viewports              | `01-studio/recording-active.png`                     |
| desktop                    | `01-studio/selected-character-ai-live.png`           |
| small-mobile               | `01-studio/take-finalizing.png`                      |
| small-mobile               | `02-character-builder/combined-reference-ready.png`  |
| desktop                    | `03-character-library/saved-character-selection.png` |
| small-mobile               | `04-take-review/playback-review-settled.png`         |
| desktop                    | `05-virtual-try-on/prepared-with-reference.png`      |
| desktop                    | `06-voice/voice-browser-loaded.png`                  |
| small-mobile               | `07-existing-video/chooser.png`                      |
| compact                    | `07-existing-video/processing.png`                   |
| desktop                    | `07-existing-video/result.png`                       |
| compact/tablet/mobile      | `07-existing-video/validated-setup.png`              |
| mobile/small-mobile        | `08-video-editor/crop-dirty.png`                     |
| desktop/compact/tablet     | `08-video-editor/lighting-dirty.png`                 |
| desktop/small-mobile       | `09-projects/output-destination.png`                 |
| All viewports              | `09-projects/output-review.png`                      |
| desktop                    | `10-campaigns/workspace.png`                         |
| desktop/small-mobile       | `11-dashboard/overview.png`                          |
| tablet/mobile/small-mobile | `12-assets/filters.png`                              |
| All viewports              | `12-assets/overview.png`                             |

The matrix intentionally emphasizes Dashboard orientation, Assets discovery and its responsive
filter sheet, the record/upload first impression, neutral Local Camera startup, provider-free live
capture, dominant recording Stop, the densest Builder/review states, deterministic dirty
Lighting/Crop editor layouts, the active/archived Campaigns workspace, the Project output-review
and destination boundaries, and representative loading/error states.

## Platform baselines and the H.264 boundary

Baselines are kept per platform, in `screenshots/chromium-<platform>/`, because the same page does
not rasterise identically on two operating systems. Two platforms are curated: `chromium-darwin`
and `chromium-linux`.

They do not hold the same set, and that is deliberate. This product gates every published file on a
local H.264/AAC MP4 conversion — a recording that cannot be transcoded is refused rather than
published. Playwright's Linux Chromium is an open-source build with **no H.264**:
`VideoEncoder.isConfigSupported({ codec: 'avc1.42001f' })` answers `false` there and `true` on the
branded browsers this product targets. Nine scenarios reach their state through that gate, so on
Linux they cannot be produced at all — not in the capture container, and not on the CI runner, which
installs the same build.

Those cases are therefore **skipped** on a browser without H.264, named in
`H264_DEPENDENT_SCENARIO_IDS` in `e2e/studioVisualMatrix.ts`, and no `chromium-linux` baseline is
kept for them. A baseline nothing can ever compare is worse than an absent one, because it looks
like coverage. `bun run screenshots:prune` enforces the split: it expects each platform to hold only
what its browser can produce.

| Platform          | Cases | Missing                                            |
| ----------------- | ----: | -------------------------------------------------- |
| `chromium-darwin` |    50 | —                                                  |
| `chromium-linux`  |    31 | The 19 cases whose media needs H.264 (9 scenarios) |

### Capturing the Linux set from a Mac

`bun run test:visual:linux:update` regenerates them, and `bun run test:visual:linux` checks them.
The script starts the dev server here on the host, then runs the suite inside the pinned
`mcr.microsoft.com/playwright:v1.62.1-noble` container against it — the runner has to be on Linux
too, because the baseline folder is chosen by the _runner's_ platform, not the browser's. Inside the
container the server is republished on loopback, because the e2e harness blocks any request whose
host is not `127.0.0.1` or `localhost`; that guard is how the suite proves it contacts no provider,
so it is worked around rather than widened.

## Updating a baseline

`bun run test:visual:update` passes `--update-snapshots=all`, which rewrites **every** baseline.
Two things about that matter, and both have bitten this repository:

- A change smaller than the 0.5% `maxDiffPixelRatio` leaves a **stale** baseline behind a green
  suite. A relabelled control, a stroke-weight change and a swapped segmented control have each
  done it. When a change is visible, re-capture the cases that show it even when the suite passes.
- On at least one macOS host the capture is **not deterministic**: a re-capture with no code change
  rewrites roughly 23 of the 50 images, all within tolerance. A blanket update therefore commits
  noise. Prefer `--update-snapshots=all -g "<case>"` for the cases a change actually touches, and
  compare the diff images rather than the file list.

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
- every overlay, confirmation, error, creative-library branch, Builder branch, or legacy state; or
- cross-browser pixel identity.

Pure/domain tests own rules; component tests and manual Storybook review own variants and ARIA;
functional Playwright owns journeys, focus, scrolling, persistence, and network boundaries; broad
screenshot capture is a review artifact; physical QA and gated provider smoke own release
validation.

See [Manual QA](MANUAL_QA.md), [Browser support](BROWSER_SUPPORT.md), and
[Live provider smoke](LIVE_PROVIDER_SMOKE.md) for the remaining evidence gates.
