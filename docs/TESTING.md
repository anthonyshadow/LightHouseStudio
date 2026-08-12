# Testing strategy

Lightframe Studio uses the smallest test layer that can prove a meaningful product or engineering
contract. A test belongs in the repository only when its failure would identify a user-visible,
security, data, lifecycle, provider, accessibility, or release regression.

## Retained layers

| Layer                      | Owns                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Domain and contract tests  | Pure policy, validation, migrations, schemas, safe errors, recording limits, and state rules       |
| Component/controller tests | Async races, resource cleanup, focus/inert behavior, destructive confirmation, and complex state   |
| API integration tests      | Loopback/origin policy, route schemas, provider intent, bounded transport, and safe normalization  |
| Real Bun listener probes   | Pre-parse security, body ceilings, HEAD/static behavior, disconnects, bind ownership, and shutdown |
| Functional Playwright      | Critical journeys, persistent-stage ownership, recovery, responsive actions, and network denial    |
| Production smoke           | Built entry, direct Studio, and health routes from one loopback origin                             |
| Development database smoke | Local PostgreSQL migrations, transaction rollback, seeded-user write, and cleanup                  |
| Curated visual regression  | High-risk composition at the five canonical viewports; always explicit                             |
| Manual/live validation     | Physical media, codecs, memory, assistive technology, downloads, and paid provider behavior        |

Storybook remains a typed, statically built review catalog. Its previous browser sweep rendered
every story in addition to component and journey tests, so it is no longer a separate automated
test suite. Selected story `play` functions remain useful interactive examples when a reviewer
opens those stories.

## Commands

| Command                              | Scope                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `bun run test`                       | Default essential non-visual Vitest suite, including API integration tests        |
| `bun run test:unit`                  | Domain, contracts, web adapters, components, and controllers                      |
| `bun run test:integration`           | API routes/providers, Vite integration, and repository utility scripts            |
| `bun run test:coverage`              | Explicit coverage gate using the retained Vitest suite                            |
| `bun run test:e2e`                   | Focused functional browser journeys                                               |
| `bun run test:production`            | Built loopback static-serving smoke; run `bun run build` first                    |
| `bun run test:visual`                | Explicit curated visual regression suite                                          |
| `bun run test:visual:update`         | Intentionally regenerate curated baselines for an approved visual change          |
| `bun run screenshots:capture`        | Broad non-baseline screenshot artifact for manual design review                   |
| `bun run test:all`                   | Vitest, build, production smoke, functional E2E, and visual regression            |
| `bun run quality`                    | Normal implementation gate: types, lint, format, architecture, Vitest, and builds |
| `bun run check:dead-code:production` | Production file/dependency reachability; excludes test-only exports               |
| `bun run db:smoke:development`       | Local PostgreSQL connection, transaction, seeded-user, and cleanup smoke          |

The focused Project repository transaction test runs automatically in the CI database environment.
Against the isolated local development database, run it explicitly after migrations:

```bash
LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST=true node --env-file=.env.development \
  ./node_modules/vitest/vitest.mjs run \
  apps/api/src/infrastructure/database/project-repository.postgres.integration.test.ts
```

Campaign migration/repository integration cases use the same isolated database gate and run with
the Project case when `LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST=true`; ordinary tests never contact Neon.

`test:unit` and `test:integration` are useful focused subsets; `bun run test` runs both categories
once through a single Node-backed Vitest invocation. Bun owns package installation and the API
runtime, but `bun test` is a different runner and is not an alias for this retained suite. Selected
Vitest cases spawn the pinned Bun executable with `--no-env-file` to exercise the production
listener rather than Node's framework-neutral request harness.

## Critical automated journeys

The retained suite protects:

- provider-free entry, accessible Login, correct/incorrect credentials, 24-hour cookie attributes,
  restore/revoke/expiry behavior, deny-by-default private APIs, trusted mutation Origin, and no
  automatic media/AI before authenticated Studio entry;
- the shared `/studio`, `/studio/videos`, `/studio/characters`, and `/studio/outfits` runtime,
  centralized logout cleanup, and one persistent media stage across library transitions;
- idempotent Save Video, immutable append-only replacement, cross-owner denial, metadata-first
  gallery pagination, lazy thumbnail fallback, range content delivery, tombstones, local-only byte
  retention, and relationship-safe retryable deletion of R2 versions/thumbnails;
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
  exact-scope direct-part signing, staged upload ownership/expiry, post-upload declaration and
  media verification, abandoned multipart cleanup, local/shadow path preservation,
  database-level gallery paging, durable-session boundaries, accepted-job restart without a second
  billable submission, admission limits, and bounded expired-job tombstones;
- revision-granular Project media lineage, strict/canonical snapshots, normalized exact Saved Video
  Version references, immutable initiating/producing provenance, concurrent exact-versus-mismatched
  replay, active-job archive blocking, bounded current/history reads, migration preflight, and
  Project-retained byte cleanup across Saved Video/reference/generic paths;
- versioned local Project parsing, backup and prepared-journal recovery, restart-safe create
  receipts, owner isolation, lifecycle CAS, bounded active/archived lists, authenticated route
  validation/Origin policy, and local/shadow/relational authority composition;
- recognized protected Project list/detail routes and Login return, one shared Studio/media-stage
  owner, bounded Project controller pagination, replay-safe Quick Start, open/refresh, lifecycle
  cache invalidation, stale-rename preservation, focus/announcements, explicit library exit, and no
  empty-Project media/provider start;
- Campaign domain/contract parity, v1→v2 local migration, restart-safe receipts, owner/CAS and
  active-membership rules, relational same-owner/restrict constraints, authenticated routes,
  create/detail/New Project, move/detach, virtual No Campaign filtering, non-cascading lifecycle,
  blocked nonempty tombstone, and archived-empty tombstone;
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
and R2 unit tests use fakes and never require credentials or external traffic. The dedicated CI
database job starts ephemeral PostgreSQL, applies migrations, and uses fake R2 configuration; it
does not receive GitHub Environment secrets or contact Neon/R2. Manual/live checks use
`MANUAL_QA.md`, `LIVE_PROVIDER_SMOKE.md`, and `CLOUD_PERSISTENCE.md`.

## Browser and visual scope

Chromium runs the full functional journey set. WebKit runs one focused cross-browser media smoke.
The touch project runs that smoke plus the dedicated control-timeout/recording-Stop case. A
browser-specific test must be tagged in its title with `@cross-browser` or `@touch`; do not run
every desktop journey under every engine by default.

The current visual matrix contains 31 cases within the 31-case review budget. It retains Local live
and recording at all five canonical viewports, plus selected entry, idle, Character, Builder,
Shelf, playback, existing-video setup at all five viewports, processing/result, VTO, Voice,
finalizing, permission-error, desktop Campaigns workspace, and small-mobile empty-Project detail
compositions. Visual
tests are not part of `bun run test`, `bun run quality`, or ordinary push/pull-request CI.

Run `bun run test:visual` when:

- work materially changes layout, responsive behavior, overlays, stage composition, typography,
  design tokens, or a protected visual state;
- reviewing an intentional baseline or visual-matrix change; or
- validating an exact release candidate.

Run `bun run screenshots:capture` only for broad manual design review. Its 125 captures are artifacts,
not assertions or baselines.

### Safe baseline updates

1. Make the intentional UI or matrix change.
2. Run `bun run test:visual` and inspect the failure against the product contract.
3. Run `bun run test:visual:update` only when the new rendering is approved.
4. Inspect every changed Darwin/Linux image at every affected viewport.
5. Run `node scripts/prune-visual-baselines.mjs --check`.
6. Run `bun run test:visual` again without update mode.

Never regenerate a baseline merely to make a failure pass. Do not run `screenshots:prune` until
every required platform baseline exists.

## CI behavior

Ordinary pushes and pull requests run:

1. dependency audit;
2. `bun run quality`, including the static Storybook build;
3. the built production smoke;
4. focused functional Playwright journeys;
5. an isolated PostgreSQL migration/transaction smoke with fake R2 configuration;
6. on pull requests and `develop`/`main` pushes, CodeQL JavaScript/TypeScript analysis with the
   `security-extended` query suite; and
7. on pull requests, dependency review for newly introduced direct and transitive vulnerabilities
   and denied licenses.

The required `Quality` check aggregates the essential, functional-browser, and database jobs. Repository
branch protection also requires the separate `Dependency Review` and `CodeQL` checks. CodeQL runs
weekly in addition to ordinary push and pull-request analysis. GitHub Actions are pinned to full
commit SHAs; the `github-actions` Dependabot entry remains responsible for proposing pin updates.

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
