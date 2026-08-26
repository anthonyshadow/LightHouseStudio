# Dashboard and Global Navigation

## Entry point

- Route `/dashboard`, rendered by `apps/web/src/features/dashboard/DashboardRouteSurface.tsx`
  (lazy-loaded by `app/shell/ShellMain.tsx`).
- Reached from: login success, the brand button, the "Dashboard" nav item, and the Live-beta
  "Back to Dashboard" action.

## Preconditions

- Authenticated session.
- Nothing else. Every section has an empty state.

## The shell around it

`StudioHeader` (`apps/web/src/studio/StudioHeader.tsx`) is rendered by the shell for every
protected route: one rail presentation from `48rem` up, plus a mobile bottom nav below it. It no
longer switches chrome by route — `useStudioRouteContext` only decides which surface renders inside
the shell.

Header regions:

| Region       | Contents                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand        | Logo + "Lightframe"; click → `/dashboard`                                                                                                                |
| Primary nav  | Dashboard · Studio · Projects · Campaigns · Assets, with `aria-current="page"` from `activeDestination` (`ShellChrome.tsx`)                              |
| Quick Create | New video · New Project · New Campaign · Create Asset · Live AI · Beta (only when live is enabled)                                                       |
| Help         | A quiet "How Lightframe works" button opening a static explainer panel — when to use Studio, Projects, Campaigns and each Asset library, with an example |
| Status menu  | "Core Studio ready" / "Studio limited" / "Checking integrations" with a breakdown of Local capture, Existing-video AI, Live AI Beta, Voice cloud         |
| Account menu | Display name, login, **Account details**, **Settings**, **Log out**                                                                                      |

`isCampaignsPath` matches both `/campaigns` and `/campaigns/{id}`, so both highlight "Campaigns"
correctly. The Studio routes fall through to `'studio'`, which the rail and the mobile bottom nav
both render, so the create surface marks its own destination like every other one.

The rail carries all five destinations. The compact bottom bar below `48rem` carries four —
Dashboard, Studio, Projects, Campaigns — because the asset libraries are overlays opened over the
current surface rather than places to stand; the Dashboard's **Browse Assets** is the way in there,
and it keeps a visible name at every width.

**Settings** opens from the account menu, not from a route. It holds the dismissed
getting-started guide (restorable), a read-only account of the capture defaults Studio remembers,
and the retention statement. Capture defaults are shown rather than edited: the Studio runtime
reads that record once when it mounts, so a second editor would lose to it.

## Dashboard anatomy

Sections in DOM order:

1. **Header** — a visible greeting, "Welcome back, {display name}", then `h1` **Dashboard**, a
   one-line description, and three actions: **Create video** (primary), **Browse Assets**, and the
   processing-queue control. The heading's visible text is also its accessible name; the greeting
   used to exist only as a `title` tooltip, and the heading used to read "Momentum Workspace" while
   announcing "Dashboard". Below 22rem Browse Assets trades its verb for its destination
   ("Assets"), keeping all three controls on one row.
2. **Processing-queue control** — the third header action, and the queue's only entry point. It is
   a status chip while the first read is in flight, a **Queue unavailable** retry button on error
   (with a visually hidden `role="alert"`, because below 22rem its label is hidden), a disclosure
   trigger showing the job count and elapsed time while work is active, and nothing at all when the
   queue is empty.
3. **Getting-started card** — shown only on a genuinely empty account (no Projects, Videos or
   Campaigns loaded, and no list erroring), and only until dismissed. It states that organization
   is optional and what Projects and Campaigns are for, so the vocabulary is defined before Recent
   Work uses it — that list shows `No Campaign`, `Campaign Project` and a Campaigns filter.
   Dismissed per account via `localStorage` (`dashboardOnboarding.ts`), and re-shown from
   **Settings → Getting started**. A browser that refuses the write still honours the dismissal for
   the rest of the session and says so in a warning notice.
4. **Continue Work** — the first project from the active project list, or an empty panel offering
   **New Project**.
5. **Recent Work** — merged list of the newest 4 projects, 4 videos and 4 campaigns, sorted by
   `updatedAt` descending, filtered by an All / Videos / Projects / Campaigns toggle, then sliced to
   4 items. Every row opens the specific record it names: projects go to `/projects/{id}`, campaigns
   to `/campaigns/{id}`, and videos to `/assets/videos?video={id}`, which opens that video's preview
   in the Videos library.

   Each row leads with a poster resolved from the list responses it already has: a project from the
   `previews` its list carries, a video from `thumbnailAvailable` and its current Version. Neither
   costs a request of its own. A row with nothing to show says "No preview yet"; a campaign says
   "Campaign", because it organizes work rather than producing it and no poster is coming.

6. **Processing Queue panel** — opened from the header control, never shown on its own. It carries
   a row per job with a derived status ("Queued" / "Finalizing" / "Active"), the operation, the
   provider and the start time, its own **Refresh**, and a destructive **Remove from queue / Stop
   tracking** action guarded by a `ConfirmationDialog` that explicitly warns the provider may still
   bill. It stays open until the operator closes it or the queue empties — polling changes the rows
   inside it, not whether it is open.
7. **Footer links** — All Projects · All Videos · All Campaigns.

The work comes first deliberately. The queue is an engineering view of provider jobs, and on most
visits it has nothing to report; a section leading the page put a block the operator did not ask
for above everything they had made, so it became a header control that disappears when idle. The
getting-started card is the one thing above the work, and it earns its place by appearing only when
there is no work yet and defining the words the sections below it use — it used to render _after_
Recent Work, so a first-time user met the vocabulary before the definition.

There is no separate "Start New" section. It offered **New Project** and **New Campaign**, both
already reachable from Quick Create, from the Recent Work empty state, and — for New Project —
from the Continue Work empty panel seven lines above it.

## System behaviour

| UI                                    | Request                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Continue Work, Recent Work (projects) | `GET /api/projects?lifecycle=active&pageSize=20`                        |
| Recent Work (campaigns)               | `GET /api/campaigns?lifecycle=active&pageSize=20`                       |
| Recent Work (videos)                  | `GET /api/videos?sort=latest`                                           |
| Processing Queue                      | `GET /api/video-jobs`, 3 s poll while non-empty, and again on tab focus |
| Remove job                            | `POST /api/video-jobs/{jobId}/abandon`, then invalidate the queue query |

All three list queries are React Query infinite queries; the dashboard fetches a full page of 20
and displays 4.

## States

Line numbers are deliberately omitted: they went stale the first time this surface moved.

| State                                 | Present?                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Loading — continue work               | Yes, skeleton panel with a polite announcement                              |
| Loading — recent work                 | Yes, skeleton rows; the section's existing count region does the announcing |
| Loading — queue                       | Yes, a "Checking jobs" `role="status"` chip in the header                   |
| Error — projects / videos / campaigns | Yes, per-kind `StatusNotice` with Retry. Whatever loaded still renders      |
| Error — queue                         | Yes, a header retry control plus a visually hidden `role="alert"`           |
| Empty — continue work                 | Yes, with **New Project**                                                   |
| Empty — recent work                   | Yes, message + a filter-specific action                                     |
| Empty — queue                         | Nothing: the header control is absent, and returning to the tab re-checks   |
| Success feedback                      | Yes, `queueNotice` after abandoning a job                                   |

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
