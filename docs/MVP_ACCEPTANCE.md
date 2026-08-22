# Local Campaign/Project MVP acceptance

**Status:** completed local Campaign/Project MVP acceptance

**Reviewed:** 2026-08-14

**Current conclusion:** **GO — local Campaign/Project MVP.** This is a local-MVP conclusion only.
It is not approval for public exposure, real signup, shared tenancy, billing, collaboration,
production migration, or live-provider use.

## How to use this record

The objective criteria remain authoritative in [MVP definition](MVP_DEFINITION.md). The source files
and tests below identify the evidence exercised for the 2026-08-14 local working-tree candidate;
they do not broaden the product boundary. Record the exact candidate, command, result, environment,
and any skipped boundary for a future rerun rather than inferring a pass from an earlier prompt or
commit.

Physical devices, assistive technologies, real camera/microphone and codec/memory behavior, live
Neon/R2, and paid providers are separately authorized manual gates. Their absence must be reported,
but it does not broaden the local MVP or public-service boundary.

**The product has changed since this candidate.** The fifteen-step roadmap in
[`product-audit/10-implementation-roadmap.md`](product-audit/10-implementation-roadmap.md) landed
between 2026-08-18 and 2026-08-21 and altered surfaces this record exercised — the Project surfaces
were split, saving gained an export placement, Projects gained duplication, and Project source now
streams. The 2026-08-14 conclusion stands for the 2026-08-14 candidate only; quoting it as current
requires a rerun against the current working tree, recorded here as a new dated candidate.

## Objective-criterion evidence map

| #   | Acceptance intent                                                                                                                                                             | Candidate implementation and focused evidence                                                                                                                                    | Current outcome |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | Entry, shell, and empty states explain the optional Campaign/Project video workspace.                                                                                         | `apps/web/src/app/EntryPage.tsx`; `ProjectRouteSurface.tsx`; `CampaignRouteSurface.tsx`; entry, routing, and accessibility Playwright cases.                                     | **Pass**        |
| 2   | Complete bounded Campaign lifecycle, including guarded empty-only tombstone.                                                                                                  | `packages/domain/src/campaigns/campaigns.test.ts`; `apps/api/src/features/campaigns/routes.test.ts`; `apps/web/src/features/campaigns/CampaignRouteSurface.test.tsx`.            | **Pass**        |
| 3   | Named or quick creation produces a standalone Project; Campaign detail creates a named Campaign Project with minimal metadata.                                                | `ProjectRouteSurface.test.tsx`; `CampaignRouteSurface.test.tsx`; `e2e/app-routing.spec.ts`.                                                                                      | **Pass**        |
| 4   | Move/detach, virtual No Campaign, and non-cascading Campaign lifecycle remain truthful.                                                                                       | `packages/domain/src/projects/projects.test.ts`; Campaign route/component tests; Campaign migration constraints.                                                                 | **Pass**        |
| 5   | Upload, finalized recording, or exact Saved Video Version reuse becomes resumable only after durable acceptance.                                                              | `project-source-service.test.ts`; `routes.test.ts`; `useProjectSourceController.test.tsx`; `useStudioProjectBridge.test.tsx`; Project source browser journey.                    | **Pass**        |
| 6   | Refresh, browser restart, and application restart restore Project identity, semantic state, and fresh playable media.                                                         | `file-project-repository.test.ts`; source/session/controller restart and response-loss tests; Project refresh browser journeys.                                                  | **Pass**        |
| 7   | Project creative/resource choices and local edit state checkpoint without moving lifecycle ownership; supported processing retains first and unsupported Voice remains gated. | `projectCreativeSessionAdapter.test.ts`; `useProjectCreativeSessionAdapter.test.tsx`; working-media tests; Project creative/local-render browser journey; processing-gate tests. | **Pass**        |
| 8   | Saving, saved, conflict, processing, needs-attention, ready, and completed states are visible and distinct.                                                                   | Project domain status tests; `projectSessionController.test.ts`; processing presentation/controller tests; Project surface tests.                                                | **Pass**        |
| 9   | Accepted jobs reconnect, ambiguous submission does not resubmit, retry is explicit, and stale success cannot replace current work.                                            | `project-processing-routes.test.ts`; `useProjectProcessingController.test.tsx`; accepted-processing refresh browser journey.                                                     | **Pass**        |
| 10  | Immutable original remains recoverable and Project Revision is distinct from playable Video Version.                                                                          | `packages/domain/src/projects/projects.test.ts`; source/working-media/output service tests; Project history component tests.                                                     | **Pass**        |
| 11  | New-video and Add-Version saves are atomic/recoverable, exact, and idempotent.                                                                                                | `project-output-service.test.ts`; PostgreSQL Project repository integration test; Project output routes/component tests; response-loss browser journey.                          | **Pass**        |
| 12  | Bounded history, exact old-Version preview/use/download, retained Project content, and videos with no producing Project work.                                                 | `ProjectHistorySection.test.tsx`; `VideoGallery.test.tsx`; Project history/output route tests; exact-Version browser journey.                                                    | **Pass**        |
| 13  | Dashboard, Create, Campaigns, Project overview/workspace, and Assets navigate coherently without silent loss.                                                                 | `StudioExitGuard.test.tsx`; shared-stage and Back/Forward Playwright cases; Project/Assets exit and deep-link tests.                                                             | **Pass**        |
| 14  | Exact Download is distinct from checkpoint, render, new-video save, and Add Version.                                                                                          | `ProjectOutputSaveSection.test.tsx`; `ProjectHistorySection.test.tsx`; exact-Version download browser journey.                                                                   | **Pass**        |
| 15  | Ownership, missing/deleted, replay, conflict, retention, refresh, and full forward migrations have negative coverage.                                                         | Campaign/Project domain, route, service, repository, retention, migration, and local-format suites; dedicated pre-MVP-to-current PostgreSQL fixture.                             | **Pass**        |
| 16  | Complete no-paid-provider E2E, relevant visual/accessibility cases, typechecks, database checks, audits, and quality all pass.                                                | Canonical/failure Playwright suites, curated 31-case visual matrix, 200%-text/axe cases, and the command record below.                                                           | **Pass**        |
| 17  | Canonical product, architecture, privacy, persistence, testing, story, and accepted-decision docs match the candidate.                                                        | Prompt 13 documentation diff plus `bun run check:docs` and formatting checks.                                                                                                    | **Pass**        |

## Deterministic browser evidence

The no-paid-provider browser suite must exercise one connected journey:

```text
Login
→ create/open Campaign or standalone Project
→ accept a durable source
→ checkpoint a reusable creative choice and/or local edit
→ reconnect accepted synthetic processing
→ Save as New Video and Add Version
→ inspect bounded history
→ preview/use/download an exact older Version
→ leave and resume
→ archive without cascade
```

Focused browser journeys must also prove CAS conflict, response-loss replay, refresh during accepted
synthetic processing, a missing reusable resource, Project-aware cleanup retention, Campaign
archive, Project switch/exit protection, exact old-Version Download, and legacy **Unassigned
Content**. They must deny unexpected external HTTP and WebSocket traffic. Unit/component evidence may
remain the lower-layer authority for exhaustive matrices, but it does not replace the cross-boundary
browser cases named here.

## Relational and local compatibility evidence

The PostgreSQL fixture must start from the repository state immediately before migration `0010`,
include valid historical Project rows plus legacy Saved Videos and reusable resources, apply every
reviewed migration through `0020`, and prove:

- no Campaign, Project, output, or reusable-resource lineage is fabricated;
- legacy content remains usable and is chipped **No Project** without a trustworthy output relation;
- same-owner and restrictive relationships hold after the full chain; and
- current Project source, processing, output, and replay authorities work after migration.

Local fixtures must read supported schema versions 1–5 into schema v6, recover prepared writes at
each owned journal boundary, reopen idempotently, retain committed media, and fail closed on invalid
or unknown formats. These tests never migrate production or contact Neon/R2.

## Exact-candidate command record

Record results for one immutable candidate revision. `bun run quality` includes typecheck, lint,
format, architecture/document checks, the default Vitest suite, and builds, but it does not replace
coverage, browser, visual, audit, or real-PostgreSQL gates.

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Required result                                          | Recorded result                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run quality`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Pass                                                     | **Pass** — 235 files passed, 4 skipped; 1,678 tests passed, 7 skipped; typechecks, Storybook typing, ESLint, Prettier, knip, module/script/document/retired checks, application/package/API builds, build manifest, and Storybook build passed |
| `bun run test:coverage`                                                                                                                                                                                                                                                                                                                                                                                                                                               | Pass                                                     | **Pass** — 231 files passed, 4 skipped; 1,669 tests passed, 7 skipped; 81.25% statements, 72.17% branches, 83.67% functions, 83.83% lines                                                                                                      |
| `bun run test:e2e`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Pass, with no unexpected external traffic                | **Pass** — 69/69 across Chromium and focused WebKit/mobile cases                                                                                                                                                                               |
| `bun run test:production`                                                                                                                                                                                                                                                                                                                                                                                                                                             | Pass against the exact built candidate                   | **Pass** — 1/1 against the built local candidate                                                                                                                                                                                               |
| `bun run test:visual`                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Pass and reviewed at the required platform baseline      | **Pass** — Darwin 35/35; pinned `mcr.microsoft.com/playwright:v1.62.1-noble` Linux 35/35; 35 × 2 baseline prune check with no leftovers; every changed baseline visually inspected                                                             |
| `bun run audit:prod`                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Pass the documented high-severity gate                   | **Pass** — exit 0                                                                                                                                                                                                                              |
| `bun run audit:all`                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Pass with only the documented Drizzle CLI exception      | **Pass** — exit 0; configured `GHSA-67mh-4wv8-2f99` Drizzle CLI exception remains explicit                                                                                                                                                     |
| `bun run --filter @studio/api db:check`                                                                                                                                                                                                                                                                                                                                                                                                                               | Migration history valid                                  | **Pass**                                                                                                                                                                                                                                       |
| `bun run db:smoke:development`                                                                                                                                                                                                                                                                                                                                                                                                                                        | Local PostgreSQL connect/transaction/seed/cleanup pass   | **Pass**                                                                                                                                                                                                                                       |
| `LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST=true node --env-file=.env.development ./node_modules/vitest/vitest.mjs run apps/api/src/infrastructure/database/project-migration.postgres.integration.test.ts apps/api/src/infrastructure/database/campaign-migration.postgres.integration.test.ts apps/api/src/infrastructure/database/project-repository.postgres.integration.test.ts apps/api/src/infrastructure/database/campaign-repository.postgres.integration.test.ts` | Full isolated PostgreSQL migration/repository cases pass | **Pass** — 4 files, 7 tests                                                                                                                                                                                                                    |

The baseline acceptance was recorded on 2026-08-14; affected quality, browser, and visual gates
were rerun on 2026-08-15 in the local macOS environment. Visual verification additionally used
the pinned Linux image named above. No live provider, Neon, R2,
physical-device, or assistive-technology manual check was run or required for this local automated
acceptance boundary.

If the development PostgreSQL service or another required local dependency is unavailable, record
the check as blocked; do not mark criteria 15 or 16 complete. Never substitute production Neon/R2 or
paid providers for deterministic acceptance.

## Manual and live limits

The automated local MVP does not qualify:

- physical Safari, Firefox, Chrome, iOS, Android, camera, microphone, touch, safe-area, software
  keyboard, download, codec, or five-minute memory behavior;
- screen-reader announcements or other assistive-technology output beyond automated accessibility
  checks;
- live Neon migration/restore, live R2 multipart/inventory/cleanup, backup, PITR, or production
  rollback;
- live Decart, Pruna, ElevenLabs, OpenAI, BFL, or Wiro entitlement, output quality, cancellation,
  retention, quota, or cost; or
- LAN, tunnel, proxy, public hosting, shared tenancy, signup, billing, collaboration, or publishing.

Use [Manual QA](MANUAL_QA.md), [Browser support](BROWSER_SUPPORT.md),
[Live provider smoke](LIVE_PROVIDER_SMOKE.md), and [Cloud persistence](CLOUD_PERSISTENCE.md) for those
separate authorized records.

## Go/no-go rule

The local Campaign/Project MVP is **GO** only when all 17 rows are Pass and every required automated
command above has a passing exact-candidate result. Any failed, blocked, skipped, or unrecorded
required check keeps the conclusion **NO-GO**. A local-MVP GO still does not claim public-service,
physical-device, live-storage, or paid-provider readiness.
