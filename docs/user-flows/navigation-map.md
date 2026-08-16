# Navigation Map

Derived from `apps/web/src/app/paths.ts`, `apps/web/src/app/AppRouter.tsx`,
`apps/web/src/studio/StudioApp.tsx` and `apps/web/src/studio/StudioWorkspace.tsx`.

## Router shape

There is exactly one route entry: `createBrowserRouter([{ path: '*', element: <RoutedApplication /> }])`
(`AppRouter.tsx:216-222`). `RoutedApplication` renders either the public entry page or, for any
path recognised by `isProtectedAppPath`, the lazily-loaded `StudioApp` shell inside `ProtectedRoute`
(`AppRouter.tsx:178-206`). Anything unrecognised redirects to `/`.

Consequences that matter for every flow:

- **The shell never unmounts** while the user moves between Dashboard, Projects, Campaigns, Assets
  and Studio. Camera state, a reviewed take, an in-flight edit, and the creative repository all
  survive those transitions.
- Surface selection is `if`-based inside `StudioWorkspace`, not route-based.
- Asset libraries are `OverlayPanel`s whose `open` prop is a pathname comparison
  (`StudioLibraryOverlays.tsx:66,84,124,146`).

## Canonical routes

| Path                              | Protected | Surface rendered                          | Notes                                                                                                                                                   |
| --------------------------------- | --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                               | No        | `EntryPage`                               | Redirects to `/dashboard` when already authenticated (`EntryPage.tsx:73-80`)                                                                            |
| `/dashboard`                      | Yes       | `DashboardRouteSurface`                   | Organization chrome                                                                                                                                     |
| `/studio/create`                  | Yes       | Media stage + `CreativeWorkspace`         | Studio chrome. Accepts `?intent=record\|upload` and `?projectId=<uuid>`                                                                                 |
| `/studio/create/live`             | Yes       | `LiveBetaRouteSurface`                    | If beta **and** provider are configured, an effect opens the AI-experience overlay and replaces the URL with `/studio/create` (`StudioApp.tsx:320-324`) |
| `/studio/{videoId}`               | Yes       | Media stage, take review                  | `videoId` must match a UUID (`paths.ts:59-60`). Loads the Saved Video's current Version into review (`StudioApp.tsx:759-781`). **No UI links here**     |
| `/projects`                       | Yes       | `ProjectsWorkspace`                       | Accepts router state `{ createIntent: 'project' }`                                                                                                      |
| `/projects/{projectId}`           | Yes       | `ProjectDetail` (overview)                |                                                                                                                                                         |
| `/projects/{projectId}/workspace` | Yes       | `ProjectDetail` (workspace) + media stage | The only organization route that keeps the stage visible (`StudioWorkspace.tsx:223`)                                                                    |
| `/campaign`                       | Yes       | `CampaignsWorkspace`                      | **Singular** path, plural label. Accepts router state `{ createIntent: 'campaign' }`                                                                    |
| `/campaign/{campaignId}`          | Yes       | `CampaignDetail`                          |                                                                                                                                                         |
| `/assets`                         | Yes       | `AssetsRouteSurface`                      | Hub of four cards                                                                                                                                       |
| `/assets/videos`                  | Yes       | `AssetsRouteSurface` + Videos overlay     |                                                                                                                                                         |
| `/assets/characters`              | Yes       | `AssetsRouteSurface` + Characters overlay |                                                                                                                                                         |
| `/assets/outfits`                 | Yes       | `AssetsRouteSurface` + Outfits overlay    |                                                                                                                                                         |
| `/assets/voices`                  | Yes       | `AssetsRouteSurface` + Voices overlay     | Browse, preview, save, remove, and **Use in Studio**; disabled only when ElevenLabs is unconfigured                                                     |

## Legacy redirects

`canonicalizeLegacyAppPath` (`paths.ts:145-178`) rewrites these with `<Navigate replace>`:

| Legacy                                            | Canonical                  |
| ------------------------------------------------- | -------------------------- |
| `/studio`                                         | `/dashboard`               |
| `/studio/projects`                                | `/projects`                |
| `/studio/projects/{id}`                           | `/projects/{id}`           |
| `/studio/projects/{id}/workspace`                 | `/projects/{id}/workspace` |
| `/studio/campaigns`                               | `/campaign`                |
| `/studio/campaigns/{id}`                          | `/campaign/{id}`           |
| `/studio/assets`                                  | `/assets`                  |
| `/studio/videos`, `/studio/assets/videos`         | `/assets/videos`           |
| `/studio/characters`, `/studio/assets/characters` | `/assets/characters`       |
| `/studio/outfits`, `/studio/assets/outfits`       | `/assets/outfits`          |
| `/studio/assets/voices`                           | `/assets/voices`           |
| `/studio/assets/recipes`                          | `/assets`                  |
| `/studio/live`                                    | `/studio/create/live`      |

`/studio/assets/recipes` is documented in code as "Compatibility-only route. Recipe UI has no
canonical destination." (`paths.ts:18-19`). No Recipe UI exists in the current build.

## Reachability graph (what links to what)

Arrows are actual code paths, with the originating call site.

```text
EntryPage
  └─ Log in ────────────────────────────► /dashboard              EntryPage.tsx:110

StudioHeader (all protected routes)
  ├─ brand ─────────────────────────────► /dashboard              StudioHeader.tsx:317
  ├─ nav: Dashboard/Projects/Campaigns/Assets                     StudioHeader.tsx:296-301
  ├─ Quick Create ▸ New video ──────────► /studio/create          StudioApp.tsx:1106
  │              ▸ New Project ─────────► /projects + createIntent StudioApp.tsx:1110
  │              ▸ New Campaign ────────► /campaign + createIntent StudioApp.tsx:1113
  │              ▸ Create Asset ────────► AssetCreationLauncher    StudioApp.tsx:1116
  │              ▸ Live AI · Beta ──────► /studio/create/live      StudioApp.tsx:1120
  └─ Account ▸ Log out ─────────────────► /                        StudioApp.tsx:924

DashboardRouteSurface
  ├─ Create video ──────────────────────► /studio/create
  ├─ Continue Project ──────────────────► /projects/{id}
  ├─ Recent Work · project ─────────────► /projects/{id}
  ├─ Recent Work · campaign ────────────► /campaign/{id}
  ├─ Recent Work · video ───────────────► /assets/videos   (NOT the individual video)
  ├─ All Projects / All Videos / All Campaigns
  └─ Processing Queue ▸ Remove ─────────► DELETE-equivalent abandon, stays on page

AssetsRouteSurface
  ├─ Upload video ──────────────────────► /studio/create with state {creationIntent:'upload'}
  └─ Open <library> ────────────────────► /assets/{videos|characters|outfits|voices}

Videos overlay (VideoGallery)
  ├─ Open in Studio ────────────────────► /studio/create (replace: true)  useStudioSavedVideoController.ts:157
  ├─ Edit video ────────────────────────► /studio/create then video editor
  ├─ Use as Project source ─────────────► /projects/{id}/workspace (source accepted)
  ├─ Download ──────────────────────────► /api/videos/{id}/content?download=true
  ├─ Rename / Remove ───────────────────► in-place
  └─ close ─────────────────────────────► /assets  (push)

ProjectsWorkspace
  ├─ Quick project ─────────────────────► /projects/{new id}
  ├─ New Project (dialog) ──────────────► /projects/{new id}
  └─ row ▸ Open ────────────────────────► /projects/{id}

ProjectDetail (overview)
  ├─ breadcrumb ────────────────────────► back, fallback /projects or /campaign/{id}
  ├─ Add source / Continue editing ─────► /projects/{id}/workspace
  ├─ Project source ▸ Record ───────────► /projects/{id}/workspace, capture starts (empty Project only)
  ├─ Project source ▸ Upload / reuse ───► /projects/{id}/workspace once accepted
  ├─ Move Project ──────────────────────► ProjectCampaignDialog
  ├─ Assets ▸ attached Video ▸ adopt ───► /projects/{id}/workspace as source or working media
  └─ Assets section ▸ add video ────────► /studio/create?projectId={id}[&intent=…]

ProjectDetail (workspace)
  ├─ Overview breadcrumb ───────────────► /projects/{id}
  ├─ Source ▸ Record ───────────────────► starts local capture on the stage, stays on route
  ├─ Create ▸ Save creative setup ──────► checkpoint revision
  ├─ Save ▸ Save as New Video ──────────► Saved Video (stays)
  └─ History ▸ Download ────────────────► /api/projects/{id}/outputs/{versionId}/content?download=true

CampaignsWorkspace
  ├─ Create Campaign ───────────────────► /campaign/{new id} with state {campaignCreated}
  └─ card ▸ Open ───────────────────────► /campaign/{id}

CampaignDetail
  ├─ ← All Campaigns ───────────────────► back, fallback /campaign
  ├─ New Project ───────────────────────► /projects/{new id}
  ├─ Create another Campaign ───────────► /campaign/{new id}
  ├─ project ▸ Open ────────────────────► /projects/{id}
  └─ project ▸ Move or detach ──────────► MoveProjectDialog

Studio (create)
  ├─ Record New Video / Stop ───────────► take review on the stage
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
- `CampaignDetail` "← All Campaigns" (fallback `/campaign`)
- The Saved-Video-route error notice action (`StudioApp.tsx:845-848`)
- Live-beta "Back to Dashboard"

`StudioExitGuard` (`studio/StudioExitGuard.tsx`) intercepts `popstate` and `beforeunload` while a
recording, finalization, render, or dirty creative state exists.

## Route-driven side effects

| Trigger                                                                  | Effect                                                                                                                 | Code                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `/studio/create?intent=record`                                           | Starts local capture once per `pathname+search`                                                                        | `StudioApp.tsx:972-979`                                       |
| `/studio/create?intent=upload` or router state `creationIntent:'upload'` | Opens the video-upload overlay and strips the state                                                                    | `StudioApp.tsx:304-318`                                       |
| `/studio/create?projectId=…`                                             | Verifies the project is not archived/deleted, else strips the param                                                    | `StudioApp.tsx:257-302`                                       |
| Saving a video while `projectId` context is verified                     | Attaches the new video to the project and replaces the URL with `/projects/{id}`; the save-success panel is suppressed | `StudioApp.tsx:788-826`                                       |
| An explicitly requested save outside a project context                   | Opens `SaveVideoSuccessPanel` with Download / View in Assets / Create another                                          | `StudioLifecycleDialogs.tsx`                                  |
| **Use in Studio** on a saved voice                                       | Navigates to `/studio/create`, opens the upload overlay, and holds the voice until a source is ready                   | `existingVideoWorkflowState.ts` (`source-ready`)              |
| `/studio/{uuid}`                                                         | Resets local work, fetches the Saved Video, loads it into review                                                       | `StudioApp.tsx:759-781`                                       |
| `/studio/create/live` with beta enabled                                  | Opens AI-experience overlay, replaces URL with `/studio/create`                                                        | `StudioApp.tsx:320-324`                                       |
| Router state `{ createIntent: 'project' \| 'campaign' }`                 | Auto-opens the corresponding create dialog                                                                             | `ProjectRouteSurface.tsx:258`, `CampaignRouteSurface.tsx:161` |
| Router state `{ campaignCreated: id }`                                   | Shows the "Create the first Project" next-step notice                                                                  | `CampaignRouteSurface.tsx:395-397`                            |
