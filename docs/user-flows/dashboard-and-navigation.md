# Dashboard and Global Navigation

## Entry point

- Route `/dashboard`, rendered by `apps/web/src/features/dashboard/DashboardRouteSurface.tsx`
  (lazy-loaded from `StudioWorkspace.tsx`).
- Reached from: login success, the brand button, the "Dashboard" nav item, and the Live-beta
  "Back to Dashboard" action.

## Preconditions

- Authenticated session.
- Nothing else. Every section has an empty state.

## The shell around it

`StudioHeader` (`apps/web/src/studio/StudioHeader.tsx`) is rendered for every protected route. On
organization routes (`organizationRouteActive`, `StudioApp.tsx`) it switches to a rail
presentation and additionally renders a mobile bottom nav (`StudioHeader.tsx:381-397`).

Header regions:

| Region       | Contents                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brand        | Logo + "Lightframe"; click → `/dashboard`                                                                                                        |
| Primary nav  | Dashboard · Projects · Campaigns · Assets, with `aria-current="page"` from `activeDestination` (`StudioApp.tsx`)                                 |
| Quick Create | New video · New Project · New Campaign · Create Asset · Live AI · Beta (only when live is enabled)                                               |
| Status menu  | "Core Studio ready" / "Studio limited" / "Checking integrations" with a breakdown of Local capture, Existing-video AI, Live AI Beta, Voice cloud |
| Account menu | Display name, login, **Log out** only                                                                                                            |

`isCampaignsPath` matches both `/campaigns` and `/campaigns/{id}`, so both highlight "Campaigns"
correctly. The Studio routes fall through to `'studio'`, which is **not** one of the four rendered
nav items, so no nav item is highlighted while in Studio.

## Dashboard anatomy

Sections in DOM order:

1. **Header** — eyebrow "Authenticated Studio" (the display name is only in a `title` attribute,
   `DashboardRouteSurface.tsx:247`), `h1` "Momentum Workspace", and two actions: **Create video**
   (primary) and **Browse Assets**.
2. **Getting-started card** — "Start with the outcome you need". Dismissed per account via
   `localStorage` (`dashboardOnboarding.ts`); if the write fails a warning notice appears
   (`DashboardRouteSurface.tsx:280-284`).
3. **Processing Queue** — `GET /api/video-jobs` via `listActiveVideoJobs`, polled every 3 s **only
   while at least one job exists** (`DashboardRouteSurface.tsx:138-142`). Each row shows a derived
   status ("Queued" / "Finalizing" / "Active"), the operation, the provider, and the start time,
   plus a destructive **Remove from queue / Stop tracking** action guarded by a
   `ConfirmationDialog` that explicitly warns the provider may still bill.
4. **Continue Work** — the first project from the active project list, or an empty panel offering
   **New Project**.
5. **Start New** — **New Project** and **New Campaign** buttons.
6. **Recent Work** — merged list of the newest 4 projects, 4 videos and 4 campaigns, sorted by
   `updatedAt` descending, filtered by an All / Videos / Projects / Campaigns toggle, then sliced to
   4 items. Every row opens the specific record it names: projects go to `/projects/{id}`, campaigns
   to `/campaigns/{id}`, and videos to `/assets/videos?video={id}`, which opens that video's preview
   in the Videos library.
7. **Footer links** — All Projects · All Videos · All Campaigns.

## System behaviour

| UI                                    | Request                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Continue Work, Recent Work (projects) | `GET /api/projects?lifecycle=active&pageSize=20`                        |
| Recent Work (campaigns)               | `GET /api/campaigns?lifecycle=active&pageSize=20`                       |
| Recent Work (videos)                  | `GET /api/videos?sort=latest`                                           |
| Processing Queue                      | `GET /api/video-jobs`, 3 s poll while non-empty                         |
| Remove job                            | `POST /api/video-jobs/{jobId}/abandon`, then invalidate the queue query |

All three list queries are React Query infinite queries; the dashboard fetches a full page of 20
and displays 4.

## States

| State                                 | Present?                                    | Where                  |
| ------------------------------------- | ------------------------------------------- | ---------------------- |
| Loading — projects                    | Yes, `role="status"` "Finding recent work…" | `:354`                 |
| Loading — recent work                 | Yes, "Loading recent work…"                 | `:427`                 |
| Loading — queue                       | Yes, "Checking processing jobs…"            | `:301`                 |
| Error — projects / videos / campaigns | Yes, per-kind `StatusNotice` with Retry     | `:355-361`, `:428-439` |
| Error — queue                         | Yes, with Retry                             | `:302-312`             |
| Empty — continue work                 | Yes, with **New Project**                   | `:380-388`             |
| Empty — recent work                   | Yes, message + a filter-specific action     | `:458-465`             |
| Empty — queue                         | Yes, "No queued or active video jobs."      | `:343-345`             |
| Success feedback                      | Yes, `queueNotice` after abandoning a job   | `:313-317`             |

The Dashboard is the most complete surface in the product for loading/empty/error coverage.

## Quick Create → Asset Creation Launcher

`AssetCreationLauncher` (`apps/web/src/studio/AssetCreationLauncher.tsx`) is a bottom-sheet overlay
with three views:

- **types** — Video · Character · Outfit · Add Voice
- **video** — New Video (`/studio/create`) · Record Video (`?intent=record`) · Upload Video
  (`?intent=upload`)
- **voice** — only when a project id is in context; otherwise choosing "Add Voice" closes the sheet
  and navigates to `/assets/voices`

When opened from a project route, `projectId` is passed through so the created asset is attached to
that project (`StudioApp.tsx`). Character and Outfit choices navigate to `/studio/create`
and open the respective builder overlay.

## Exit points

- `/studio/create` — Create video, Quick Create ▸ New video, Recent Work has no direct route here
- `/projects`, `/projects/{id}` — Continue Project, Recent Work, All Projects
- `/campaigns`, `/campaigns/{id}` — Recent Work, All Campaigns
- `/assets`, `/assets/videos` — Browse Assets, All Videos; Recent Work (videos) adds `?video={id}`
- `/studio/create/live` — Quick Create ▸ Live AI · Beta

## Unverified

- Whether "Momentum Workspace" is the intended product-facing name for the dashboard, or an
  internal design label. It is hard-coded at `DashboardRouteSurface.tsx:252`.
