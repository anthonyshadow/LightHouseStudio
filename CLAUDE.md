# CLAUDE.md — agent quick guide

Routing layer for coding agents. Read this, then open only what your task touches.
Long-form policy lives in [`AGENTS.md`](AGENTS.md); do not duplicate it here.

## What this project is

Lightframe Studio: a local-first, single-operator browser video studio. Bun workspace,
TypeScript everywhere.

| Workspace            | Runtime                                                   | Owns                                                        |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/web`           | React 19 + Vite + Emotion + TanStack Query + react-router | Presentation, orchestration, browser adapters               |
| `apps/api`           | Bun + Elysia (wrapped as `ApplicationRuntime`)            | Auth, services, persistence, storage, providers             |
| `packages/domain`    | Pure TS                                                   | Product policy and invariants. No React, no HTTP, no I/O    |
| `packages/contracts` | Zod                                                       | App-owned HTTP request/response schemas shared by both apps |

Imports point inward. `apps/web` must never import `apps/api` implementation.

## Where things live

| Task touches                                                          | Look in                                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A route, redirect, or "where does this link go"                       | `apps/web/src/app/paths.ts`, `AppRouter.tsx`, `docs/user-flows/navigation-map.md`                                                                      |
| Any authenticated screen                                              | `apps/web/src/app/shell/AuthenticatedShell.tsx` (persistent) → `studio/StudioApp.tsx` (live media only)                                                |
| Dashboard / Assets / Projects / Campaigns surfaces                    | `apps/web/src/features/{dashboard,assets,projects,campaigns}`                                                                                          |
| Recording, take review, stage                                         | `apps/web/src/orchestration/{recording,session}`, `features/live-stage`, `studio/useTakeReviewFlow.ts`                                                 |
| Upload / Character Swap / Virtual Try-On / voice on an existing video | `apps/web/src/features/existing-video`                                                                                                                 |
| Local video editing                                                   | `apps/web/src/features/video-editor`                                                                                                                   |
| Playing a finished or borrowed video anywhere                         | `apps/web/src/features/video-player` — one player; the live capture stage is the only exception                                                        |
| Characters, outfits, prompts (browser-local)                          | `apps/web/src/features/{creative-assets,character-builder,character-wardrobe}`; the Characters/Outfits overlays render from `features/account-library` |
| Saved Videos and Versions                                             | `apps/web/src/features/{saved-videos,video-gallery}`, `apps/api/src/features/saved-videos`                                                             |
| Export placement (where the video is going) at save time              | `apps/web/src/features/export-placements`; aspects, resolutions and crop live in `packages/domain/src/projects`                                        |
| Account details, Settings, capabilities and usage; the help explainer | `apps/web/src/features/account`, `apps/web/src/studio/HowLightframeWorksPanel.tsx`                                                                     |
| An HTTP endpoint                                                      | `apps/api/src/features/<area>/routes.ts`; the canonical list is `apps/api/src/route-inventory.test.ts`                                                 |
| Business rules / invariants                                           | `packages/domain/src/<area>/rules.ts`                                                                                                                  |
| Request/response shape                                                | `packages/contracts/src/<area>.ts`                                                                                                                     |
| Database                                                              | `apps/api/src/infrastructure/database/schema.ts`, `apps/api/drizzle/*.sql`                                                                             |
| Byte storage (local or R2)                                            | `apps/api/src/storage`                                                                                                                                 |
| Provider integrations                                                 | `apps/api/src/providers/{decart,openai,bfl,wiro,pruna,elevenlabs}`                                                                                     |
| Feature flags / environment                                           | `apps/api/src/config/environment.ts`, `.env.example`                                                                                                   |

## Deeper documentation — consult only when relevant

| Need                                                            | Document                             |
| --------------------------------------------------------------- | ------------------------------------ |
| What the product is becoming (vision, MVP boundary, non-goals)  | `docs/product/PRODUCT_VISION.md`     |
| Canonical terminology and the domain model                      | `docs/product/DOMAIN_MODEL.md`       |
| The target user flows and where today's flows differ            | `docs/product/TARGET_USER_FLOWS.md`  |
| The roadmap and its implementation prompts                      | `docs/roadmap/`                      |
| The evidence-backed current-state assessment                    | `docs/audits/CURRENT_STATE_AUDIT.md` |
| Open product/architecture decisions                             | `docs/DECISIONS_REQUIRED.md`         |
| How a user moves through the product, and where it breaks down  | `docs/user-flows/`                   |
| Observable contract for one capability                          | `docs/user-flows/feature-behavior/`  |
| Module ownership, lifecycle, persistence, deployment boundaries | `docs/ARCHITECTURE.md`               |
| Test layers and release validation                              | `docs/TESTING.md`                    |
| Database/storage modes and migrations                           | `docs/CLOUD_PERSISTENCE.md`          |
| Privacy, provider contact, retention, cost                      | `docs/PRIVACY_AND_TEMPORARY_DATA.md` |
| Everything else                                                 | `docs/README.md` (the map)           |

Do not read every document before every task. Superseded documentation was permanently removed on
2026-08-31 per `docs/audits/DOCUMENTATION_PRUNING_REPORT.md`; git history is the record, never
implementation authority.

## Hard rules

**Understand before changing.** Inspect the code paths your task touches. Trace
UI → handler → hook → state → API → service → repository → storage before editing behaviour. Do not
infer behaviour from a file name, a comment, a stale document, or a passing test.

**Preserve existing behaviour.** Do not remove functionality, alter a user flow, or change an HTTP
contract unless the task says to. Verify callers before deleting anything.

**Keep changes scoped.** Modify only what the task requires. No opportunistic repo-wide refactors,
no formatting sweeps across unrelated files, no renames for taste.

**Reuse before creating.** Search for an existing component, hook, helper, service, schema, adapter
or policy first. The UI primitives in `apps/web/src/ui/primitives` (`Button`, `OverlayPanel`,
`ConfirmationDialog`, `StatusNotice`, form controls) cover most needs — do not hand-roll a dialog
and never use `window.confirm` in new code.

**Do not duplicate.** One owner per HTTP contract, domain rule, storage rule, provider
normalization, and media/modal lifecycle. Abstract only when two implementations genuinely share
semantics _and_ lifecycle.

**Respect the boundaries.** Domain and contracts stay free of React, browser APIs, persistence
clients and provider payloads. Route handlers stay thin; policy belongs in domain rules or
application orchestration.

**Security, ownership, cost.**

- Server credentials never reach `VITE_*`, bundles, logs, fixtures, or committed env files.
- Ownership comes from the verified session subject only — never from a body, query, path or
  device id.
- Provider work must stay explicit, bounded and normalized. No automatic paid retry or fallback.
  If a submission's acceptance is unknown, reconcile it; never resubmit silently.
- Never surface raw provider bodies, prompts, internal URLs or upstream error codes.

**Keep components understandable.** Avoid god components, deep ternary nesting, and wrapper
components that add no boundary. Split at ownership or lifecycle boundaries, not line counts.

**Watch for, but do not go hunting:** N+1 queries, duplicated network requests, unnecessary
re-renders, oversized payloads, repeated expensive work, avoidable sequential awaits. Fix them when
they are in your diff; do not open a performance audit for an unrelated change.

## Validation

Validate the smallest surface that proves the change. Match the scope, not the repository.

| Change                                                                              | Run                                                                                                       |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Documentation only                                                                  | `bun run format:check` and `bun run check:docs`                                                           |
| One component or hook                                                               | Its own test file(s); add `bun run typecheck` only if types changed                                       |
| Domain or contracts                                                                 | Focused package tests plus the directly affected consumers                                                |
| API route or service                                                                | That feature's API tests (`vitest run apps/api/src/features/<area>`)                                      |
| Database schema                                                                     | Drizzle generation/inspection, migration checks, repository tests. Never migrate production automatically |
| A user flow                                                                         | The component/controller tests for that flow, plus its targeted E2E spec                                  |
| Visual or responsive                                                                | Only the relevant visual cases                                                                            |
| Shared foundational code, auth, security, persistence, dependencies, tooling, build | `bun run quality`                                                                                         |
| Release candidate                                                                   | The full process in `README.md` and `docs/TESTING.md`                                                     |

Do **not** by default: run the whole `vitest` suite, run all Playwright specs, run a production
build, lint the whole repository, audit dependencies, or grep the entire tree. Escalate only when
targeted validation shows wider impact, or the change is in the shared-foundational row above.

Never contact a paid or live provider during ordinary validation. Never report a skipped or blocked
check as passing.

## Repo-specific gotchas

- **The shell persists; the Studio runtime does not.** `apps/web/src/app/shell/AuthenticatedShell.tsx`
  stays mounted across every protected route and owns what has to outlive a surface: the
  remote-state `QueryClient`, awaitable confirmations, and the session lifecycle (teardown hold,
  logout, expiry). The Studio capture runtime belongs only to the routes that own live media —
  `isStudioRuntimePath` in `app/paths.ts`. **Do not put cross-route state in the runtime**, and do
  not reach into it from a surface that outlives it: it reports work up through
  `StudioRuntimeRegistry` and receives creative selections through the shell's handoff channel
  (`app/shell/useStudioHandoff.ts`).
  Guard route-triggered effects with `location.key`, not just `pathname + search`: the shell
  persists, so arriving somewhere is a new history entry rather than a remount, and the same keying
  is what makes a return _within_ Studio behave like a fresh visit.
- **Asset libraries are overlays**, not pages — they key off `location.pathname` in
  `StudioLibraryOverlays.tsx`. That is also why the compact bottom navigation carries four
  destinations and not five: below `48rem` Assets is reached from the Dashboard, because a shelf
  you open over the current surface is not a place to stand. The rail keeps all five.
- **Route registration is conditional.** Project source/working-media/output and creative-library
  routes only exist in certain `DATABASE_MODE` configurations. `503 feature_unavailable` is a
  legitimate response; handle it.
- **Two route oracles, both intentional.** `apps/web/src/app/route-inventory.test.ts` covers
  `PROTECTED_ROUTES`, and `paths.test.ts` additionally forces every registered destination to state
  whether it mounts the Studio runtime. `apps/api/src/route-inventory.test.ts` covers HTTP
  endpoints. Adding or removing either kind of route fails its oracle until the expected list is
  updated.
- **Idempotency keys and CAS versions are load-bearing** on Project and Campaign mutations. Do not
  drop `expectedVersion`, `expectedRevisionNumber` or `Idempotency-Key` to "simplify" a call.
- **A stage artifact may not hold its bytes.** `PresentedRecordingArtifact.media` is either an owned
  `Blob` or a URL-backed `remote-presentation` (a Project source streamed over HTTP ranges). Never
  read `media` directly when you need the complete file — narrow through `ownedRecordingArtifact`
  and handle `null`.
- **`scripts/check-retired-program-references.mjs` fails on certain retired words** in any tracked
  text file. If a doc or test suddenly fails that check, that is why.
- **`bun run check:docs`** validates every relative link and heading anchor in `README.md`,
  `AGENTS.md` and all of `docs/`. Run it after touching documentation.

## Decision-making

Prefer: inspecting over guessing; the code over comments, names, docs and tests; the existing
pattern over a new one; the smallest intentional change; backwards compatibility.

Avoid: speculative rewrites, new abstractions with one consumer, broad refactors bundled into a
small fix, new dependencies without a clear justification, tests added only to raise a count.

When something looks obsolete, say so and cite the evidence — do not delete it as part of an
unrelated task.

## Reporting

Report: files changed, decisions made, validation run and its result, checks deliberately not run
and why, and any unresolved risk or assumption.
