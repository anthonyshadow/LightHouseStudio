# Testing strategy

Lightframe Studio uses the smallest test layer that can prove a meaningful product or engineering
contract. A test belongs in the repository only when its failure would identify a user-visible,
security, data, lifecycle, provider, accessibility, or release regression.

## Retained layers

| Layer                      | Owns                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Domain and contract tests  | Pure policy, validation, migrations, schemas, safe errors, recording limits, and state rules      |
| Component/controller tests | Async races, resource cleanup, focus/inert behavior, destructive confirmation, and complex state  |
| API integration tests      | Loopback/origin policy, route schemas, provider intent, bounded transport, and safe normalization |
| Functional Playwright      | Critical journeys, persistent-stage ownership, recovery, responsive actions, and network denial   |
| Production smoke           | Built entry, direct Studio, and health routes from one loopback origin                            |
| Curated visual regression  | High-risk composition at the five canonical viewports; always explicit                            |
| Manual/live validation     | Physical media, codecs, memory, assistive technology, downloads, and paid provider behavior       |

Storybook remains a typed, statically built review catalog. Its previous browser sweep rendered
every story in addition to component and journey tests, so it is no longer a separate automated
test suite. Selected story `play` functions remain useful interactive examples when a reviewer
opens those stories.

## Commands

| Command                           | Scope                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm test`                       | Default essential non-visual Vitest suite, including API integration tests        |
| `pnpm test:unit`                  | Domain, contracts, web adapters, components, and controllers                      |
| `pnpm test:integration`           | API routes/providers, Vite integration, and repository utility scripts            |
| `pnpm test:coverage`              | Explicit coverage gate using the retained Vitest suite                            |
| `pnpm test:e2e`                   | Focused functional browser journeys                                               |
| `pnpm test:production`            | Built loopback static-serving smoke; run `pnpm build` first                       |
| `pnpm test:visual`                | Explicit curated visual regression suite                                          |
| `pnpm test:visual:update`         | Intentionally regenerate curated baselines for an approved visual change          |
| `pnpm screenshots:capture`        | Broad non-baseline screenshot artifact for manual design review                   |
| `pnpm test:all`                   | Vitest, build, production smoke, functional E2E, and visual regression            |
| `pnpm quality`                    | Normal implementation gate: types, lint, format, architecture, Vitest, and builds |
| `pnpm check:dead-code:production` | Production file/dependency reachability; excludes test-only exports               |

`test:unit` and `test:integration` are useful focused subsets; `pnpm test` runs both categories
once through a single Vitest invocation.

## Critical automated journeys

The retained suite protects:

- provider-free entry, accessible Login, correct/incorrect credentials, 24-hour cookie attributes,
  restore/revoke/expiry behavior, deny-by-default private APIs, trusted mutation Origin, and no
  automatic media/AI before authenticated Studio entry;
- the shared `/studio`, `/studio/videos`, `/studio/characters`, and `/studio/outfits` runtime,
  centralized logout cleanup, and one persistent media stage across library transitions;
- idempotent Save Video, immutable append-only replacement, cross-owner denial, metadata-first
  gallery pagination, lazy thumbnail fallback, range content delivery, tombstones, and retained
  unreferenced bytes;
- reusable Character create/edit/save/preload and atomic reference hydration;
- Lucy 2.5 and VTO explicit Start/Apply, safe fallback, and independent 300-second boundaries;
- recording source pinning, duplicate Stop coalescing, recorder/sidecar/transcode ordering, forced
  H.264/AAC MP4 configuration, no-raw-fallback failure, playback, Download, Release, and confirmed
  Discard;
- immutable-original local and ElevenLabs Voice processing;
- local video-edit normalization/history, worker progress/cancellation/stale-result handling,
  offset-aware output limits, persistent-stage preview, keyboard crop, atomic source replacement,
  downstream Voice sidecars, and pre-provider aspect gating;
- upload and primary local-record adoption into the editor; discoverable Character Swap, Virtual
  Try On, and Voice; Original/Result synchronization; strict visual-before-voice ordering;
  latest-result cleanup; and post-generation MP4 validation;
- advanced live AI entry, Start/Apply behavior, Latest Take review, and cleanup remain independent
  from the primary post-recording workflow;
- versioned/sanitized user-scoped Recipe Shelf and Character Builder persistence, recovery,
  legacy-key migration, Neon creative-library CAS conflict safety, and destructive actions;
- storage-neutral byte streams, private opaque R2 keys, lifecycle registration, range reads,
  database-level gallery paging, durable-session boundaries, accepted-job restart without a second
  billable submission, admission limits, and bounded expired-job tombstones;
- app-owned saved-voice membership, first-read claim, owner-checked preview/conversion, and proof
  that relationship removal never calls provider voice deletion;
- loopback Host/Origin, explicit provider intent, bounded response/stream handling, SSRF-resistant
  image downloads/imports, DNS pinning, redirect/byte/content limits, safe errors, and no provider fallback;
- one persistent media stage, shared overlay focus/inert/Escape behavior, dominant recording Stop,
  200% text, and constrained mobile scrolling; and
- unexpected external HTTP and WebSocket denial in ordinary automated tests.

Physical devices, real codecs and browser memory, assistive-technology output, completed browser
downloads, live provider entitlement/output/retention, paid-provider behavior, real Neon migration
and restore, and live R2 multipart/inventory behavior remain outside ordinary automation. Database
and R2 unit tests use fakes and never require credentials or external traffic. Manual/live checks
use `MANUAL_QA.md`, `LIVE_PROVIDER_SMOKE.md`, and `CLOUD_PERSISTENCE.md`.

## Browser and visual scope

Chromium runs the full functional journey set. WebKit runs one focused cross-browser media smoke.
The touch project runs that smoke plus the dedicated control-timeout/recording-Stop case. A
browser-specific test must be tagged in its title with `@cross-browser` or `@touch`; do not run
every desktop journey under every engine by default.

The current visual matrix contains 29 cases within the 29-case review budget. It retains Local live
and recording at all five canonical viewports, plus selected entry, idle, Character, Builder,
Shelf, playback, existing-video setup at all five viewports, processing/result, VTO, Voice,
finalizing, and permission-error compositions. Visual
tests are not part of `pnpm test`, `pnpm quality`, or ordinary push/pull-request CI.

Run `pnpm test:visual` when:

- work materially changes layout, responsive behavior, overlays, stage composition, typography,
  design tokens, or a protected visual state;
- reviewing an intentional baseline or visual-matrix change; or
- validating an exact release candidate.

Run `pnpm screenshots:capture` only for broad manual design review. Its 125 captures are artifacts,
not assertions or baselines.

### Safe baseline updates

1. Make the intentional UI or matrix change.
2. Run `pnpm test:visual` and inspect the failure against the product contract.
3. Run `pnpm test:visual:update` only when the new rendering is approved.
4. Inspect every changed Darwin/Linux image at every affected viewport.
5. Run `node scripts/prune-visual-baselines.mjs --check`.
6. Run `pnpm test:visual` again without update mode.

Never regenerate a baseline merely to make a failure pass. Do not run `screenshots:prune` until
every required platform baseline exists.

## CI behavior

Ordinary pushes and pull requests run:

1. dependency audit;
2. `pnpm quality`, including the static Storybook build;
3. the built production smoke; and
4. focused functional Playwright journeys.

Coverage, curated visual regression, and broad screenshot capture run only through
`workflow_dispatch`. Exact-candidate release work still runs the full release command list in the
project README, including coverage and visual regression.

## Adding or retaining a test

Before adding a test, identify the regression and choose the lowest layer that observes it.

- Prefer one table/loop inside a logical contract test for input matrices that share setup and
  outcome.
- Use pure tests for policy and validation; do not repeat the same rule through several UI cases.
- Add component/controller coverage for races, cleanup, focus, destructive actions, and state that
  a pure test cannot observe.
- Add E2E only for a critical cross-boundary journey or browser behavior.
- Add a visual baseline only when geometry/composition is itself the contract.
- Do not test framework behavior, static copy, class names, exact DOM structure, or basic markup
  unless a product/accessibility contract depends on it.
- Do not add a regression at multiple layers without documenting what unique failure each layer
  catches.

When removing a test, verify that a stronger retained layer protects the meaningful behavior and
that fixtures, mocks, dependencies, snapshots, screenshots, and documentation do not become
orphaned.
