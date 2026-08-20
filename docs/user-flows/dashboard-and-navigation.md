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
| Primary nav  | Dashboard · Studio · Projects · Campaigns · Assets, with `aria-current="page"` from `activeDestination` (`ShellChrome.tsx`)                      |
| Quick Create | New video · New Project · New Campaign · Create Asset · Live AI · Beta (only when live is enabled)                                               |
| Status menu  | "Core Studio ready" / "Studio limited" / "Checking integrations" with a breakdown of Local capture, Existing-video AI, Live AI Beta, Voice cloud |
| Account menu | Display name, login, **Log out** only                                                                                                            |

`isCampaignsPath` matches both `/campaigns` and `/campaigns/{id}`, so both highlight "Campaigns"
correctly. The Studio routes fall through to `'studio'`, which the rail and the mobile bottom nav
both render, so the create surface marks its own destination like every other one.

## Dashboard anatomy

Sections in DOM order:

1. **Header** — a visible greeting, "Welcome back, {display name}", then `h1` **Dashboard** and two
   actions: **Create video** (primary) and **Browse Assets**. The heading's visible text is also its
   accessible name; the greeting used to exist only as a `title` tooltip, and the heading used to
   read "Momentum Workspace" while announcing "Dashboard".
2. **Continue Work** — the first project from the active project list, or an empty panel offering
   **New Project**.
3. **Recent Work** — merged list of the newest 4 projects, 4 videos and 4 campaigns, sorted by
   `updatedAt` descending, filtered by an All / Videos / Projects / Campaigns toggle, then sliced to
   4 items. Every row opens the specific record it names: projects go to `/projects/{id}`, campaigns
   to `/campaigns/{id}`, and videos to `/assets/videos?video={id}`, which opens that video's preview
   in the Videos library.

   Each row leads with a poster resolved from the list responses it already has: a project from the
   `previews` its list carries, a video from `thumbnailAvailable` and its current Version. Neither
   costs a request of its own. A row with nothing to show says "No preview yet"; a campaign says
   "Campaign", because it organizes work rather than producing it and no poster is coming.

4. **Footer links** — All Projects · All Videos · All Campaigns.
5. **Getting-started card** — "Start with the outcome you need". Dismissed per account via
   `localStorage` (`dashboardOnboarding.ts`); if the write fails a warning notice appears
   (`DashboardRouteSurface.tsx:436-440`).
6. **Processing Queue** — `GET /api/video-jobs` via `listActiveVideoJobs`, polled every 3 s **only
   while at least one job exists** (`DashboardRouteSurface.tsx:151`).

   With no job, the section is one line: the label, "No queued or active video jobs." and
   **Refresh**. A job expands it back to a full section — its description, and a row per job
   showing a derived status ("Queued" / "Finalizing" / "Active"), the operation, the provider and
   the start time, plus a destructive **Remove from queue / Stop tracking** action guarded by a
   `ConfirmationDialog` that explicitly warns the provider may still bill.

The work comes first deliberately. The queue is an engineering view of provider jobs, and on most
visits it has nothing to report; leading with it, and with an explanation of Projects versus
Campaigns, put two blocks the operator did not ask for above everything they had made.

There is no separate "Start New" section. It offered **New Project** and **New Campaign**, both
already reachable from Quick Create, from the Recent Work empty state, and — for New Project —
from the Continue Work empty panel seven lines above it.

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

| State                                 | Present?                                                                  | Where                  |
| ------------------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| Loading — projects                    | Yes, `role="status"` "Finding recent work…"                               | `:291`                 |
| Loading — recent work                 | Yes, "Loading recent work…"                                               | `:348`                 |
| Loading — queue                       | Yes, "Checking processing jobs…"                                          | `:451`                 |
| Error — projects / videos / campaigns | Yes, per-kind `StatusNotice` with Retry                                   | `:292-298`, `:349-359` |
| Error — queue                         | Yes, `role="alert"` with Retry                                            | `:465-471`             |
| Empty — continue work                 | Yes, with **New Project**                                                 | `:318-325`             |
| Empty — recent work                   | Yes, message + a filter-specific action                                   | `:399-404`             |
| Empty — queue                         | Yes, "No queued or active video jobs.", on the section's one compact line | `:452-454`             |
| Success feedback                      | Yes, `queueNotice` after abandoning a job                                 | `:476-480`             |

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

_None outstanding for this surface._
