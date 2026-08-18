# Lightframe Studio — Current User Flows

This directory documents **how the application behaves today**, reconstructed from the running
code (routes, components, hooks, API handlers, domain rules, SQL) rather than from prior
documentation. Where behaviour could not be established from code, it is marked `Unverified`.

- Source of truth: `apps/web/src`, `apps/api/src`, `packages/domain/src`, `packages/contracts/src`,
  `apps/api/drizzle/*.sql`.
- Audit date: 2026-08-16, against the working tree at commit `0237235`.
- Nothing in this directory describes planned or aspirational behaviour. Planned work belongs in
  [`../PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md).

## Documents

| Document                                                       | Covers                                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`authentication-and-entry.md`](authentication-and-entry.md)   | `/`, login, session restore, protected routing, logout                                                            |
| [`dashboard-and-navigation.md`](dashboard-and-navigation.md)   | `/dashboard`, global navigation shell, Quick Create, processing queue                                             |
| [`projects.md`](projects.md)                                   | `/projects`, project overview, project workspace, source/working media/outputs/history, project-scoped processing |
| [`campaigns.md`](campaigns.md)                                 | `/campaigns`, campaign detail, project membership                                                                 |
| [`assets-and-libraries.md`](assets-and-libraries.md)           | `/assets` and the Videos / Characters / Outfits / Voices libraries                                                |
| [`studio-creation-workflows.md`](studio-creation-workflows.md) | `/studio/create`, recording, upload/import, Character Swap, Virtual Try-On, voice, local video edit, save         |
| [`navigation-map.md`](navigation-map.md)                       | Complete route table, redirects, and the reachability graph                                                       |
| [`gaps-and-usability-audit.md`](gaps-and-usability-audit.md)   | Consolidated usability, missing-UI, bug, and flow-gap findings                                                    |
| [`feature-behavior/`](feature-behavior/README.md)              | Per-capability observable-behaviour contracts (relocated from `docs/userStories/`)                                |

**Scope split.** The documents in this directory describe _route-level journeys_ — where a user
enters, what they see, what fires, and where they end up. `feature-behavior/` describes the
_observable contract of one capability_ in finer detail. Use this directory to understand how a
user moves through the product; use `feature-behavior/` to check what a specific feature must do.

## What the product is

Lightframe Studio is a **single-page browser video studio** with a small local/cloud API. A user
records or uploads a short video, optionally applies AI visual treatments (Character Swap, Virtual
Try-On) and voice treatments, optionally trims/adjusts it locally, and then saves it as an
immutable **Version** of a **Saved Video** in their Assets library. **Projects** add resumable,
server-authoritative workflow state around one immutable source video. **Campaigns** are an
optional organizer for Projects.

## The primary entities

| Entity                          | Owned by | Durable store                                                     | Notes                                                          |
| ------------------------------- | -------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| **Saved Video**                 | Account  | API (`saved_videos` / `video_versions` or local JSON)             | Append-only Versions; the only durable video library           |
| **Project**                     | Account  | API (`projects`, `project_revisions`, …)                          | One immutable source, a revision chain, working media, outputs |
| **Campaign**                    | Account  | API (`campaigns`)                                                 | Name + optional brief only; never owns Project working state   |
| **Character / Outfit / Prompt** | Account  | Browser IndexedDB, optionally mirrored to `/api/creative-library` | Local-first "creative library"                                 |
| **Saved Voice**                 | Account  | API (`saved_voices`)                                              | Provider-catalog voices retained for the account               |
| **Reference image**             | Account  | API (`reference_image_assets` + byte store)                       | Generated or uploaded character/outfit imagery                 |
| **Video job**                   | Account  | API (`processing_jobs`)                                           | A provider Character Swap / Virtual Try-On operation           |

Key architectural fact that shapes every flow: **the authenticated app is one persistent shell
with a runtime that comes and goes** (`apps/web/src/app/shell/AuthenticatedShell.tsx`). It is not a
tree of nested routes. `ShellMain` (`apps/web/src/app/shell/ShellMain.tsx`) conditionally renders
the Dashboard, Assets, Projects, Campaigns and Live-beta surfaces, and the asset libraries are
full-screen **overlays keyed off `location.pathname`**
(`apps/web/src/studio/StudioLibraryOverlays.tsx`).

The Studio's capture runtime mounts only where the stage is visible — `/studio/create`,
`/studio/{videoId}` and `/projects/:projectId/workspace` (`isStudioRuntimePath`). Capture state, a
reviewed take and an in-progress edit therefore do **not** survive leaving Studio: `StudioExitGuard`
prompts before that happens, and the choices that are not transient — camera, microphone, capture
format — are persisted so they do.

## Navigation model

One chrome serves every protected surface — Dashboard, Projects, Campaigns, Assets, Live-beta, the
Project workspace, and the focused Studio routes (`/studio/create`, `/studio/{videoId}`). It is a
left rail from `48rem` up, and a compact top bar plus a fixed four-destination bottom bar below it.
Both carry Dashboard, Projects, Campaigns and Assets; the rail also holds the Quick Create menu, the
integration-status menu, and the account menu.

`organizationRouteActive` in `StudioApp.tsx` no longer selects a chrome. It only decides which
surface renders inside the shell. Whether a media stage exists at all is `isStudioRuntimePath`.

```text
/  (Entry)
│   Log in
▼
/dashboard
├── Create video ─────────────► /studio/create
├── Continue Project ─────────► /projects/{id}
├── New Project (dialog) ─────► /projects  (createIntent) ──► /projects/{id}
├── New Campaign (dialog) ────► /campaigns  (createIntent) ──► /campaigns/{id}
├── Browse Assets ────────────► /assets
└── Recent Work ──────────────► /projects/{id} · /campaigns/{id} · /assets/videos?video={id}

/projects ──► /projects/{id} ──► /projects/{id}/workspace
                  │                    ├── Source  (record · upload · reuse Saved Video)
                  │                    ├── Create  (creative checkpoint · working media · processing)
                  │                    ├── Save    (Save as New Video · Add Version)
                  │                    └── History (revisions · outputs · download)
                  └── Assets section (attach Videos / Characters / Outfits / Voices)

/campaigns ──► /campaigns/{id} ──► project groups ──► /projects/{id}

/assets ──► /assets/videos      (overlay: preview · Open in Studio · Edit · Use as Project source · Download · Rename · Remove)
        ├─► /assets/characters  (overlay: create · copy · wardrobe · use)
        ├─► /assets/outfits     (overlay: create · use · remove)
        └─► /assets/voices      (overlay: browse · preview · save · remove · Use in Studio)

/studio/create ──► record | upload ──► review ──► Character Swap / Virtual Try-On / Voice / Adjust
                                                    └──► Save to Assets ──► Saved Video
                                                              └──► Download | View in Assets | Create another
/studio/{savedVideoId}  (deep link only; no UI produces this link)
/studio/create/live     (Live AI beta; renders an "unavailable" surface unless configured)
```

## Flow completeness

| Flow                                                                   | State                   | Notes                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry, login, session restore, protected deep link                     | **Complete**            | Covered by e2e (`e2e/app-routing.spec.ts`)                                                                                                                                            |
| Logout with unsaved-work guards                                        | **Complete**            | `useStudioLogoutController.ts`                                                                                                                                                        |
| Dashboard                                                              | **Complete**            | All sections load, empty and error states present                                                                                                                                     |
| Standalone record → review → save                                      | **Complete**            |                                                                                                                                                                                       |
| Standalone upload/import → review → save                               | **Complete**            |                                                                                                                                                                                       |
| Character Swap / Virtual Try-On on an uploaded video                   | **Complete**            | Requires a configured provider                                                                                                                                                        |
| Voice treatment (local effects)                                        | **Complete**            |                                                                                                                                                                                       |
| Voice treatment (ElevenLabs)                                           | **Complete**            | Requires `ELEVENLABS_API_KEY`                                                                                                                                                         |
| Local video adjust (trim/crop render in-browser)                       | **Complete**            |                                                                                                                                                                                       |
| Save to Assets, completion surface, Versions, rename, remove, download | **Complete**            |                                                                                                                                                                                       |
| Character builder, wardrobe variants, outfits                          | **Complete**            |                                                                                                                                                                                       |
| Projects: create, source, checkpoint, working media, output, history   | **Complete**            |                                                                                                                                                                                       |
| Project-scoped Character Swap / Virtual Try-On with reconnect          | **Complete**            |                                                                                                                                                                                       |
| Campaigns: create, edit, archive, restore, delete, membership          | **Complete**            | Every lifecycle action is reachable from the list as well as the detail page                                                                                                          |
| Attaching assets to a Project                                          | **Complete**            |                                                                                                                                                                                       |
| **Live AI (realtime) sessions**                                        | **Partial / gated**     | Code paths exist end-to-end but are disabled unless `REALTIME_VIDEO_BETA_ENABLED` **and** a Decart key are configured; `/studio/create/live` otherwise renders an unavailable surface |
| Voices library page                                                    | **Complete**            | `/assets/voices` browses, previews, saves and removes voices, and hands one to Studio; disabled with an explanation only when ElevenLabs is unconfigured                              |
| Cloud creative-library sync                                            | **Complete**            | Fails closed on divergence, conflict or transport error, and is recoverable in place: Try again · Keep this browser's copy · Use the cloud copy. No merge exists, by design           |
| **Project provider voice / live starts**                               | **Deliberately absent** | Blocked with an explicit reason (`ProjectCreativeCheckpointPanel.tsx:14`)                                                                                                             |
| **`/studio/{videoId}` deep link**                                      | **Orphaned**            | The route loads a Saved Video into review, but no UI in the app ever links to it                                                                                                      |
| **Account settings**                                                   | **Absent**              | The account menu contains only "Log out" (`AccountMenu.tsx:245-247`)                                                                                                                  |

## How a new user is expected to move through the product

1. Land on `/`, press **Log in**, authenticate with the seeded demo credentials.
2. Arrive at `/dashboard`, which shows a dismissible "Start with the outcome you need" card
   explaining that organization is optional.
3. Press **Create video** → `/studio/create` → **Record New Video** or **Upload Video**.
4. Review the take on the Studio stage; optionally apply one visual edit plus voice.
5. Press **Save to Assets** → the video becomes Version 1 of a Saved Video, and a completion panel
   offers **Download**, **View in Assets** and **Create another**.
6. Only if resumable, multi-session work is needed: create a Project, give it an immutable source,
   and use the four-task workspace (Source → Create → Save → History).
7. Only if several Projects belong to one initiative: create a Campaign and move Projects into it.

Whether that intended path is actually discoverable is assessed in
[`gaps-and-usability-audit.md`](gaps-and-usability-audit.md).
