# Navigation Map

Derived from `apps/web/src/app/paths.ts`, `apps/web/src/app/AppRouter.tsx`,
`apps/web/src/app/shell/AuthenticatedShell.tsx` and `apps/web/src/app/shell/ShellMain.tsx`.

## Router shape

There is exactly one route entry: `createBrowserRouter([{ path: '*', element: <RoutedApplication /> }])`.
`RoutedApplication` renders either the public entry page or, for any path recognised by
`isProtectedAppPath`, the lazily-loaded `AuthenticatedShell` inside `ProtectedRoute`. Anything
unrecognised is answered by who is asking: a signed-in operator gets a "That page doesn't exist"
surface with a Dashboard link, at the address they typed, while everyone else still redirects to
`/` — so a typo and a real protected route stay indistinguishable to anyone without a session. The
decision waits for session restoration, because deciding while the session is unknown would send a
signed-in operator to the entry page, which forwards them straight to the Dashboard.

Consequences that matter for every flow:

- **The shell persists; the Studio runtime does not.** `AuthenticatedShell` stays mounted while the
  user moves between Dashboard, Projects, Campaigns, Assets and Studio, and owns what has to survive
  that: the remote-state cache, the session lifecycle, the navigation chrome, and the creative
  library. The capture runtime mounts only where the stage is visible — `isStudioRuntimePath` in
  `paths.ts` — and is torn down on the way out. Camera state, a reviewed take and an in-flight edit
  do **not** survive leaving Studio; `StudioExitGuard` prompts before that happens, and capture
  device choices are persisted so they do survive.
- Surface selection is `if`-based inside `ShellMain`, keyed on the route context rather than on
  nested route elements.
- Asset libraries are `OverlayPanel`s whose `open` prop is a pathname comparison
  (`StudioLibraryOverlays.tsx`).

## Canonical routes

| Path                              | Protected | Surface rendered                        | Notes                                                                                                                                                          |
| --------------------------------- | --------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                               | No        | `EntryPage`                             | Redirects to `/dashboard` when already authenticated (`EntryPage.tsx:73-80`)                                                                                   |
| `/dashboard`                      | Yes       | `DashboardRouteSurface`                 | Organization chrome                                                                                                                                            |
| `/studio/create`                  | Yes       | Media stage + `CreativeWorkspace`       | Studio chrome. Accepts `?intent=record\|upload` and `?projectId=<uuid>`                                                                                        |
| `/studio/create/live`             | Yes       | `LiveBetaRouteSurface`                  | No stage, so no capture runtime. If beta **and** provider are configured, the shell opens the AI-experience overlay and replaces the URL with `/studio/create` |
| `/studio/{videoId}`               | Yes       | Media stage, take review                | `videoId` must match a UUID. Loads the Saved Video's current Version into review. **No UI links here**                                                         |
| `/projects`                       | Yes       | `ProjectsListSurface`                   | Accepts router state `{ createIntent: 'project' }`                                                                                                             |
| `/projects/{projectId}`           | Yes       | `ProjectOverviewSurface`                |                                                                                                                                                                |
| `/projects/{projectId}/workspace` | Yes       | `ProjectWorkspaceSurface` + media stage | The only organization route that mounts the capture runtime, because it records source into the Project                                                        |
| `/campaigns`                      | Yes       | `CampaignsWorkspace`                    | Accepts router state `{ createIntent: 'campaign' }`, consumed and stripped on close or successful create                                                       |
| `/campaigns/{campaignId}`         | Yes       | `CampaignDetail`                        |                                                                                                                                                                |
| `/assets`                         | Yes       | Compatibility redirect                  | Replaces to the shell session's last-used Asset library, defaulting to `/assets/videos`                                                                        |
| `/assets/videos`                  | Yes       | Videos fullscreen overlay               | Optional `?video=<uuid>` opens that Saved Video's preview, then replaces the parameter away                                                                    |
| `/assets/characters`              | Yes       | Characters fullscreen overlay           | Account-hydrated creative library                                                                                                                              |
| `/assets/outfits`                 | Yes       | Outfits fullscreen overlay              | Account-hydrated creative library                                                                                                                              |
| `/assets/voices`                  | Yes       | Voices fullscreen overlay               | Browse, preview, save, remove, and **Use in Studio**; disabled only when ElevenLabs is unconfigured                                                            |

## Legacy redirects

`canonicalizeLegacyAppPath` rewrites these with `<Navigate replace>`:

| Legacy                                            | Canonical                  |
| ------------------------------------------------- | -------------------------- |
| `/studio`                                         | `/dashboard`               |
| `/studio/projects`                                | `/projects`                |
| `/studio/projects/{id}`                           | `/projects/{id}`           |
| `/studio/projects/{id}/workspace`                 | `/projects/{id}/workspace` |
| `/studio/campaigns`                               | `/campaigns`               |
| `/studio/campaigns/{id}`                          | `/campaigns/{id}`          |
| `/campaign`                                       | `/campaigns`               |
| `/campaign/{id}`                                  | `/campaigns/{id}`          |
| `/studio/assets`                                  | `/assets`                  |
| `/studio/videos`, `/studio/assets/videos`         | `/assets/videos`           |
| `/studio/characters`, `/studio/assets/characters` | `/assets/characters`       |
| `/studio/outfits`, `/studio/assets/outfits`       | `/assets/outfits`          |
| `/studio/assets/voices`                           | `/assets/voices`           |
| `/studio/live`                                    | `/studio/create/live`      |

`/studio/assets/recipes` was removed with the retired Recipe UI; it now falls through like any other
unknown path. `/campaign` carries a compatibility comment and is **not** a
member of `PROTECTED_LEAF_PATHS`, so it is reachable only through the final
`canonicalizeLegacyAppPath` clause of `isProtectedAppPath`, and `canonicalizeProtectedDestination`
still resolves it in one hop (so a login return to `/campaign?x=1` lands on `/campaigns?x=1`).

## Reachability graph (what links to what)

Arrows are actual code paths, with the originating call site.

```text
EntryPage
  └─ Log in ────────────────────────────► /dashboard              EntryPage.tsx:110

StudioHeader (all protected routes)
  ├─ brand ─────────────────────────────► /dashboard              StudioHeader.tsx:317
  ├─ nav: Dashboard/Studio/Projects/Campaigns/Assets              StudioHeader.tsx
  │      (real links, not buttons; compact bar below 48rem drops Campaigns, which
  │       stays on the rail and is reached from the Dashboard and Projects — D13)
  │      Studio ──────────────────────► /studio/create            useStudioNavigationActions.ts
  ├─ Quick Create ▸ New video ──────────► /studio/create          ShellChrome.tsx
  │              ▸ New Project ─────────► /projects + createIntent ShellChrome.tsx
  │              ▸ New Campaign ────────► /campaigns + createIntent ShellChrome.tsx
  │              ▸ Create Asset ────────► AssetCreationLauncher    ShellChrome.tsx
  │              ▸ Live AI · Beta ──────► /studio/create/live      ShellChrome.tsx
  └─ Account ▸ Log out ─────────────────► /                        ShellChrome.tsx

DashboardRouteSurface
  ├─ Create video ──────────────────────► /studio/create
  ├─ Continue Project ──────────────────► /projects/{id}
  ├─ Recent Work · project ─────────────► /projects/{id}
  ├─ Recent Work · campaign ────────────► /campaigns/{id}
  ├─ Recent Work · video ───────────────► /assets/videos?video={id}  (that video's preview)
  ├─ All Projects / All Videos / All Campaigns
  └─ Processing Queue ▸ Remove ─────────► DELETE-equivalent abandon, stays on page

StudioHeader · Assets
  └─ open last-used library ────────────► /assets/{videos|characters|outfits|voices}

Asset libraries tab strip
  └─ switch library (replace) ──────────► /assets/{videos|characters|outfits|voices}

Videos overlay (VideoGallery)
  ├─ Open in Studio ────────────────────► /studio/create (push, so Back returns to the library)
  ├─ Edit video ────────────────────────► /studio/create then video editor
  ├─ Use as Project source ─────────────► /projects/{id}/workspace (source accepted)
  ├─ Download ──────────────────────────► /api/videos/{id}/content?download=true
  ├─ Rename / Remove ───────────────────► in-place
  └─ Close Assets ──────────────────────► back one entry, fallback /dashboard

ProjectsWorkspace
  ├─ New Project ▸ Create without a name ► /projects/{new id}
  ├─ New Project (dialog) ──────────────► /projects/{new id}
  └─ row ▸ Open ────────────────────────► /projects/{id}

ProjectDetail (overview)
  ├─ breadcrumb ────────────────────────► back, fallback /projects or /campaigns/{id}
  ├─ Add source / Continue editing ─────► /projects/{id}/workspace
  ├─ Project source ▸ Record ───────────► /projects/{id}/workspace, capture starts (empty Project only)
  ├─ Project source ▸ Upload / reuse ───► /projects/{id}/workspace once accepted
  ├─ Move Project ──────────────────────► ProjectCampaignDialog
  ├─ Assets ▸ attached Video ▸ adopt ───► /projects/{id}/workspace as source or working media
  ├─ Saved output ▸ Download ───────────► /api/projects/{id}/outputs/{versionId}/content
  ├─ Saved output ▸ View in Assets ─────► /assets/videos?video={savedVideoId}
  └─ Assets section ▸ add video ────────► /studio/create?projectId={id}[&intent=…]

ProjectDetail (workspace)
  ├─ Overview breadcrumb ───────────────► /projects/{id}
  ├─ Source ▸ Record ───────────────────► starts local capture on the stage, stays on route
  ├─ Create ▸ Keep this setup ──────────► checkpoint revision
  ├─ Save ▸ Save video ─────────────────► new Saved Video or new Version (stays)
  └─ History ▸ Download ────────────────► /api/projects/{id}/outputs/{versionId}/content?download=true

CampaignsWorkspace
  ├─ Create Campaign ───────────────────► /campaigns/{new id} with state {campaignCreated}
  ├─ card ▸ Open ───────────────────────► /campaigns/{id}
  └─ card ▸ Edit | Archive/Restore | Delete ──► in-place, no navigation

CampaignDetail
  ├─ ← All Campaigns ───────────────────► back, fallback /campaigns
  ├─ New Project ───────────────────────► /projects/{new id}
  ├─ project ▸ Open ────────────────────► /projects/{id}
  └─ project ▸ Move or detach ──────────► MoveProjectDialog

Studio (create)
  ├─ Start camera / Stop ───────────────► take review on the stage
  ├─ Upload Video ──────────────────────► video-upload overlay
  ├─ Change experience ─────────────────► AI experience chooser
  ├─ Voice ─────────────────────────────► voice-treatments overlay
  ├─ Save ──────────────────────────────► SaveVideoDialog → Saved Video → SaveVideoSuccessPanel
  └─ Saved result ▸ Download | View in Assets (/assets/videos) | Create another (stays)
```

## Back-navigation behaviour

`useRouteBack` (`app/useRouteBack.ts`) prefers the real browser history entry when
`window.history.state.idx > 0`, otherwise `navigate(fallback, { replace: true })`. It is used by:

- `ProjectDetail` overview breadcrumb (fallback `/projects` or the campaign)
- `ProjectDetail` workspace "Overview" breadcrumb (fallback `/projects/{id}`)
- `CampaignDetail` "← All Campaigns" (fallback `/campaigns`)
- Every Asset library overlay's **Close Assets** control (fallback `/dashboard`), via
  `nav.closeAssetLibrary`. Library tab changes replace the current entry so close still consumes
  the one that opened Assets.
  A library opened from somewhere other than the hub therefore closes back to _that_ origin — the
  point of the change, since closing used to push `/assets` and cost two Back presses per visit.
- The Saved-Video-route error notice action (`StudioApp.tsx`)
- Live-beta "Back to Dashboard"

`StudioExitGuard` (`studio/StudioExitGuard.tsx`) intercepts `popstate` and `beforeunload` while a
recording, finalization, render, or dirty creative state exists.

## Route-driven side effects

| Trigger                                                  | Effect                                                                                                                                                                       | Code                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `/studio/create?intent=record`                           | Starts local capture once per history entry (keyed on `location.key`), so returning to the same URL records again — within Studio as well as after leaving it                | `useStudioRecordingLaunch.ts`                         |
| `/studio/create?intent=upload`                           | Opens the video-upload overlay; the query string is the intent's only carrier                                                                                                | `StudioApp.tsx`                                       |
| `/projects/{id}/workspace?task=<id>`                     | Selects that guided task; an operator's pinned task outranks the step the Project is up to, and switching tasks is not leaving                                               | `ProjectWorkspaceSurface.tsx`                         |
| `/studio/create?projectId=…`                             | Verifies the project is not archived/deleted, else strips the param                                                                                                          | `StudioApp.tsx`                                       |
| Saving a video while `projectId` context is verified     | Attaches the new video to the project and replaces the URL with `/projects/{id}`; the save-success panel is suppressed                                                       | `StudioApp.tsx`                                       |
| An explicitly requested save outside a project context   | Opens `SaveVideoSuccessPanel` with Download / View in Assets / Create another                                                                                                | `StudioLifecycleDialogs.tsx`                          |
| **Use in Studio** on a saved voice                       | Navigates to `/studio/create`, opens the upload overlay, and holds the voice until a source is ready                                                                         | `existingVideoWorkflowState.ts` (`source-ready`)      |
| `/studio/{uuid}`                                         | Resets local work, fetches the Saved Video, loads it into review                                                                                                             | `StudioApp.tsx`                                       |
| `/studio/create/live` with beta enabled                  | Opens AI-experience overlay, replaces URL with `/studio/create`                                                                                                              | `StudioApp.tsx`                                       |
| `/assets/videos?video=<uuid>`                            | Opens that Saved Video's preview, then replaces the entry without the parameter so Back cannot re-open it                                                                    | `VideoGallery.tsx`, `useStudioNavigationActions.ts`   |
| Router state `{ createIntent: 'project' \| 'campaign' }` | Auto-opens the corresponding create dialog. Every close path — cancel _and_ a successful create — strips the state with a `replace`, so Back to the list does not re-open it | `ProjectsListSurface.tsx`, `CampaignRouteSurface.tsx` |
| Router state `{ campaignCreated: id }`                   | Shows the "Create the first Project" next-step notice                                                                                                                        | `CampaignRouteSurface.tsx`                            |
