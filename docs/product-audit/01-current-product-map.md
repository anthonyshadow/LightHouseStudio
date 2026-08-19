# Current product map

What exists in the code today, verified by reading it and by running the application.

## Workspaces

| Workspace            | Runtime                 | Owns                                            | Size                   |
| -------------------- | ----------------------- | ----------------------------------------------- | ---------------------- |
| `apps/web`           | React 19, Vite, Emotion | Presentation, orchestration, browser adapters   | ~62 700 non-test lines |
| `apps/api`           | Bun + Elysia wrapper    | Auth, services, persistence, storage, providers | ~37 500 non-test lines |
| `packages/domain`    | Pure TypeScript         | Product policy and invariants                   | ~5 900 lines           |
| `packages/contracts` | Zod                     | Shared HTTP request/response schemas            | ~2 900 lines           |

244 test files against 524 source files. Coverage: 83.8 % lines, 81.3 % statements, 72.2 % branches
(`coverage/coverage-summary.json`).

## Shell and runtime split

`AuthenticatedShell` stays mounted for the whole session and owns the TanStack Query cache, the
session lifecycle, navigation chrome, the creative library and the Asset overlays. The **Studio
capture runtime** (`StudioApp`, 782 lines) mounts only on routes that own live media —
`/studio/create`, `/studio/{videoId}`, and `/projects/{id}/workspace` (`isStudioRuntimePath`).

This is a well-drawn boundary and it is enforced by `paths.test.ts`, which forces every registered
destination to declare which side it is on.

## Routes

Fourteen protected destinations, one public entry, and a legacy-redirect table. Full detail lives in
[`user-flows/navigation-map.md`](../user-flows/navigation-map.md), which was re-verified against
`paths.ts` and is accurate.

| Path                                            | Surface                          | Notes                                                |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| `/`                                             | `EntryPage`                      | Redirects to `/dashboard` when authenticated         |
| `/dashboard`                                    | `DashboardRouteSurface`          | Orientation and resume                               |
| `/studio/create`                                | Media stage + creative workspace | `?intent=record\|upload`, `?projectId=<uuid>`        |
| `/studio/create/live`                           | `LiveBetaRouteSurface`           | Gated off by default (`REALTIME_VIDEO_BETA_ENABLED`) |
| `/studio/{videoId}`                             | Media stage, take review         | **Nothing in the product links here**                |
| `/projects`                                     | Projects list                    |                                                      |
| `/projects/{id}`                                | Project overview                 |                                                      |
| `/projects/{id}/workspace`                      | Project workspace + stage        | `?task=source\|create\|save\|history`                |
| `/campaigns`, `/campaigns/{id}`                 | Campaigns list and detail        |                                                      |
| `/assets`                                       | Hub of four cards                |                                                      |
| `/assets/{videos\|characters\|outfits\|voices}` | Hub + fullscreen overlay         | Overlays keyed on `location.pathname`                |

## HTTP surface

`apps/api/src/route-inventory.test.ts` is the canonical list: **72 always-registered routes**, plus
**14 project source/working-media/output routes** and **2 creative-library routes** that are
conditional on `DATABASE_MODE`. Every `GET` has an explicit `HEAD` sibling.

Grouped: auth (4), system (2), campaigns (7), projects (26 including processing), video jobs (6),
saved videos (10), reference images (10), voices (8), realtime (1).

## Data model, as implemented

```text
User (exactly one, seeded)
├── Campaign 0..N ─── optional grouping only, owns no media
│     └── Project 0..N
├── standalone Project 0..N
│     ├── ProjectRevision 1..N        immutable snapshot of creative intent + media refs
│     │     └── ProjectSnapshot       source / working / presented media, character, outfit,
│     │                               voice, visual treatment, localEdit, exportSpecification,
│     │                               workflowPhase
│     ├── ProjectAssetMembership 0..N non-owning "attached" resources
│     ├── ProcessingJob 0..N          linked to the revision that initiated it
│     └── output links ──────────────► exact Saved Video Versions
└── Assets
      ├── Saved Video ──► immutable Video Version 1..N   (server; Postgres/Neon or file)
      ├── Character ──► Character Variant / Wardrobe     (browser IndexedDB, optional cloud mirror)
      ├── Outfit                                          (browser IndexedDB, optional cloud mirror)
      ├── Saved Voice relationship                        (server)
      └── Reference image                                 (server, immutable)
```

**The durability of these is not uniform, and the UI does not say so.** Saved Videos, Voices and
reference images are server-side. Characters, Outfits and saved prompts are browser-local, mirrored
to the server only when `DATABASE_MODE` is `postgres` or `neon`. The default is `local`.

## Capability gating

`/api/capabilities` drives the UI. Every provider-dependent surface degrades to an honest
"not configured" state rather than failing at click time. Gated capabilities:

`realtimeVideo` · `videoProcessing.characterSwap` (Decart or Pruna) · `videoProcessing.virtualTryOn`
· `elevenLabs` · `referenceImages` (OpenAI, BFL or Wiro) + `optimizer` · `wardrobe.addOutfitAvailable`
· `savedVideos.directMultipartUpload`.

## Persistence modes

| `DATABASE_MODE` | Metadata            | Bytes                | Creative library | Project source routes |
| --------------- | ------------------- | -------------------- | ---------------- | --------------------- |
| `local`         | JSON files          | Local filesystem     | **Browser only** | Registered            |
| `shadow`        | JSON files + traces | Local or R2 shadowed | **Browser only** | Registered            |
| `postgres`      | Drizzle/Postgres    | Local or R2          | Server-mirrored  | Registered            |
| `neon`          | Drizzle/Neon (TLS)  | Local or R2          | Server-mirrored  | Registered            |

The route-inventory test exercises `neon` without a project repository, which is a test fixture, not
production behaviour: `createConfiguredPersistence` wires `DrizzleProjectRepository` in both cloud
modes, so project routes are registered there too.

## What exists but is unreachable or unused

| Thing                                                  | Evidence                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `ProjectExportSpecification` (aspect/resolution/audio) | Modelled in `packages/domain/src/projects/types.ts:138`; only tests write it         |
| `workflowPhase` values `processing` and `export`       | No domain rule ever sets them; reachable sequence is source→creative→review→complete |
| `/studio/{videoId}` and `studioVideoPath()`            | Exported and unit-tested; no application caller                                      |
| `entitlements` from `/api/auth/me`                     | Returned by the API, rendered nowhere                                                |
| Live AI realtime session                               | `REALTIME_VIDEO_BETA_ENABLED=false`; surface explains unavailability honestly        |

`bun run check:dead-code` is clean, so none of this is dead _code_ — it is unfinished _product_.

## What does not exist at all

Sharing · publishing · collaboration · multi-user · signup · roles · templates · brand kits ·
captions/subtitles · text or graphic overlays · music or audio tracks · speed control ·
multi-clip timeline · scheduling · analytics · global search · usage or spend visibility ·
bulk operations · undo across surfaces (only inside the local video editor).
