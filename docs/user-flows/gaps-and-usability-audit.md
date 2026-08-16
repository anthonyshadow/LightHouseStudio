# User-Flow Gaps and Usability Audit

Consolidated findings from the code-first audit. Every item cites the code that produced it.
Severities are **Critical / High / Medium / Low / Observation**. Nothing here was fixed — this is a
findings register.

Two framing notes before the list:

- The engineering quality of this codebase is high. Optimistic concurrency, idempotency receipts,
  fail-closed sync, explicit provider-cost warnings, and exit guards are implemented more carefully
  than in most products of this size. Almost every finding below is about **discoverability and
  conceptual load**, not correctness.
- The same rigour is also the main usability problem: the domain model (immutable source, working
  media, presented media, revisions, checkpoints, outputs, Versions, memberships) is exposed almost
  verbatim in the UI.

## 1. Critical broken flows

**None found.** No flow was found that cannot be completed end-to-end when its provider is
configured. The two flows that cannot be completed at all are gated rather than broken:

| Flow                                    | Why                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Live AI realtime session                | Requires `REALTIME_VIDEO_BETA_ENABLED` + a Decart key; otherwise `/studio/create/live` renders an honest unavailable surface |
| Selecting a voice from `/assets/voices` | `VoiceLibrary` is mounted with `disabled` and `onSelect={() => undefined}` (`StudioLibraryOverlays.tsx:158`)                 |

## 2. Major product gaps

### G1 — The Assets ▸ Voices library cannot do anything (High)

`/assets/voices` is one of four equally-weighted cards on the Assets hub, but the overlay it opens
is read-only. The description tells the user to "Select a voice from an active video workflow when
you are ready to use it." A library the user is told not to use from the library is a dead end.

_Expectation:_ parity with Characters and Outfits (preview, save, remove, and "Use in Studio").
_Direction:_ either wire `onSelect` to the same handoff the other libraries use, or demote Voices
from a top-level Assets card to a contextual picker.

### G2 — Saving a video has no destination (High)

After **Save to Assets** succeeds in Studio, the user stays exactly where they were. There is no
success screen, no "View in Assets" link, no download button, and no "create another". The only
confirmation is the button's own state, and
`ExistingVideoActionBar.tsx:114` tells the user to "Open Saved Videos when you are ready to
download."

_Expectation:_ the end of the core creation loop should acknowledge completion and offer the two
obvious next actions (download, open in Assets) plus a third (start another).
_Impact:_ the primary product loop terminates without closure; users must know to navigate to
Assets ▸ Videos and find their own file.

### G3 — Project overview hides the entire workflow (High)

`/projects/{id}` shows a header and an attached-assets list. Source, Create, Save and History exist
only behind **Continue editing** at `/projects/{id}/workspace`
(`ProjectRouteSurface.tsx:1043-1049`). A user who opens a brand-new empty project sees an empty
asset list and one primary button whose label ("Continue editing") implies resuming something that
does not exist yet.

_Direction:_ for a project with no source, the overview should present the Source task directly, or
the primary button should read "Add source" / "Start".

### G4 — "Source" and "attached asset" are different things and nothing says so (High)

Adding a video from the overview's Assets section, from the Videos library's **Add to Project**, or
from Quick Create creates an _asset membership_. It does **not** give the Project a source. Only
the workspace's Source task does that. Both are labelled with the word "video".

_Impact:_ a user can attach three videos to a project and still see "No source yet".

### G5 — No account or settings surface (Medium)

`AccountMenu` contains only **Log out** (`AccountMenu.tsx:245-247`). There is no profile, no
preferences, no storage usage, no provider configuration view, no way to see the plan or
entitlements that the API already returns in the session payload.

### G6 — Campaigns cannot be managed from the list (Medium)

The Projects list offers Rename, Archive, Restore and Delete inline
(`ProjectRouteSurface.tsx:184-222`). The Campaigns list offers only **Open** and — when archived —
**Delete** (`CampaignRouteSurface.tsx:98-121`). Editing or archiving a campaign requires opening it
first. Two comparable entities behave differently for no discoverable reason.

### G7 — Nothing guides a user from a Project to its output (Medium)

The workspace tabs are static; nothing marks the current task, nothing advances to the next one
after a step completes, and the derived `workflowPhase` (`source → creative → processing → review →
export → complete`) is never shown as progress. The user must know that Source → Create → Save is
the order.

### G8 — First-time-user guidance is one dismissible card (Medium)

`dashboardOnboarding.ts` stores a single boolean. Once dismissed, no product surface ever explains
Projects vs Campaigns vs Assets again. The Studio "first take guide"
(`StudioWorkspace.tsx:236-270`) is gated on `firstSuccessGuideVisible`, which is initialised to
`false` in `StudioApp.tsx:329` and never set to `true` anywhere in the codebase — **the guide is
therefore unreachable in the current build**.

## 3. UX and navigation problems

### N1 — `/campaign` is singular; everything else is plural (Medium)

`APP_PATHS.campaigns = '/campaign'` (`paths.ts:9`) while the nav label, the page heading and the
detail path segment all read "Campaigns". Projects use `/projects`. This is visible in the URL bar
and in every shared link.

### N2 — Opening a video from the gallery destroys the gallery history entry (Medium)

`navigateToStudio` uses `navigate(APP_PATHS.create, { replace: true })`
(`StudioApp.tsx:711-713`, called from `useStudioSavedVideoController.ts:157`). Pressing Back from
Studio after "Open in Studio" does **not** return to `/assets/videos`.

### N3 — Closing a library overlay pushes history (Low)

Each overlay's close handler calls `onNavigate(APP_PATHS.assets)`
(`StudioLibraryOverlays.tsx:67, 85, 125, 147`) — a push. Open and close a library three times and
Back must be pressed six times to leave Assets.

### N4 — Recent Work "video" rows open the whole gallery (Medium)

`DashboardRouteSurface.tsx:184` sets `open: onOpenVideos` for every video item, ignoring the item's
id. Clicking a specific recent video navigates to `/assets/videos` with no filter, selection or
scroll target — while project and campaign rows open the specific record.

### N5 — Two competing create actions on the Projects list (Medium)

**Quick project** creates an "Untitled Project" immediately and navigates into it; **New Project**
opens a naming dialog (`ProjectRouteSurface.tsx:319-337`). The buttons sit side by side with no
explanation; the difference is only described in the empty-state paragraph below them
(`:162`), which disappears as soon as one project exists.

### N6 — No nav item is active while in Studio (Low)

`activeDestination` resolves to `'studio'` on `/studio/create`
(`StudioApp.tsx:1094-1103`), but the primary nav renders only Dashboard, Projects, Campaigns and
Assets (`StudioHeader.tsx:279-286`). In the product's main creation surface, the navigation shows
no current location.

### N7 — Two different confirmation mechanisms (Medium)

The app has a well-built `ConfirmationDialog` primitive and uses it widely, yet two destructive or
consequential actions use the native `window.confirm`:

- switching experience mode over an existing draft (`StudioApp.tsx:667-672` via
  `confirmModeReplacement`)
- replacing the loaded gallery version (`useStudioSavedVideoController.ts:267-273`)

Native dialogs are unstyled, not screen-reader-consistent with the rest of the app, and block the
event loop.

### N8 — The dashboard greets the user in a tooltip (Low)

`DashboardRouteSurface.tsx:247` renders the visible text "Authenticated Studio" with
`title={`Welcome back, ${displayName}`}`. The human-readable greeting is only available on hover;
the visible text is implementation vocabulary.

### N9 — The dashboard heading and its accessible name disagree (Low)

`<h1 id="dashboard-heading" aria-label="Dashboard">Momentum Workspace</h1>`
(`DashboardRouteSurface.tsx:250-252`). Sighted users see "Momentum Workspace"; assistive technology
announces "Dashboard".

### N10 — Archived projects ignore the campaign filter (Medium)

In `ProjectsWorkspace`, selecting **No Campaign** applies `campaignId: 'none'` to the active
section only; the archived section is always rendered unfiltered
(`ProjectRouteSurface.tsx:372-388`). Selecting a filter therefore produces a screen where half the
content contradicts it.

### N11 — Project counts are "N loaded", never totals (Low)

Both list surfaces show `{items.length} loaded` (`ProjectRouteSurface.tsx:145`,
`CampaignRouteSurface.tsx:58`) because the contracts return no total
(`packages/contracts/src/projects.ts:703-708`). The Videos gallery, by contrast, does have a
`total`. The word "loaded" exposes pagination mechanics.

## 4. Missing UI

| #   | Missing                                                                                                                       | Where                                     | Severity |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------- |
| M1  | Success state after saving a video (see G2)                                                                                   | Studio take review / action bar           | High     |
| M2  | Download affordance anywhere except the Videos gallery and Project History                                                    | Studio review, project workspace Save tab | High     |
| M3  | Empty-state call to action on the Outfits library (the create button is above the empty state, not in it)                     | `SavedCreativeLibrary.tsx:394-398`        | Low      |
| M4  | Loading/error state for the Assets hub counts (they silently read 0 before the local repository hydrates)                     | `AssetsRouteSurface.tsx:139-143`          | Low      |
| M5  | Breadcrumbs anywhere except Project detail, Project workspace and Campaign detail                                             | Assets libraries, Studio                  | Medium   |
| M6  | Progress indication for the Project workflow phase                                                                            | Project workspace masthead                | Medium   |
| M7  | A "what is a Project / Campaign / Asset" explanation reachable after onboarding is dismissed                                  | Global                                    | Medium   |
| M8  | Confirmation before a project-source upload replaces a previously _failed_ staging attempt                                    | `ProjectRouteSurface.tsx:585-621`         | Low      |
| M9  | Any surfacing of `entitlements` returned by `/api/auth/me`                                                                    | Account menu                              | Low      |
| M10 | An error boundary message that distinguishes a chunk-load failure from an application crash                                   | `AppRouter.tsx:104-112`                   | Low      |
| M11 | Retry affordance for the Assets hub when the creative repository fails to open                                                | `useStudioCreativeRepository.ts`          | Low      |
| M12 | Visible indication that `/assets/*` libraries are overlays over the hub (Escape closes to `/assets`, which is not signposted) | `StudioLibraryOverlays.tsx`               | Low      |

## 5. Unnecessary or redundant UI

Deliberately conservative — each item was verified before listing.

| #   | Item                                                                                                                                                                                                                                                   | Evidence                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| R1  | **"Create another Campaign" on the Campaign detail page.** A secondary action competing with "New Project" on the surface whose job is to fill _this_ campaign. The same action exists in Quick Create and on the Campaigns list.                      | `CampaignRouteSurface.tsx:471-478`                                  |
| R2  | **Four paths to create a video** — Dashboard "Create video", Quick Create ▸ New video, Quick Create ▸ Create Asset ▸ Video ▸ New Video, Assets "Upload video". Three land on `/studio/create` with different intents; the difference is not explained. | `StudioApp.tsx:1106, 1179, 1236-1244`, `AssetsRouteSurface.tsx:145` |
| R3  | **Duplicate campaign error surface.** `actionError` renders both inline on the page and inside the open dialog.                                                                                                                                        | `CampaignRouteSurface.tsx:427-431` vs `:519-523, 561-565`           |
| R4  | **"Start New" section on the dashboard** duplicates Quick Create ▸ New Project / New Campaign and the empty-state buttons directly above it.                                                                                                           | `DashboardRouteSurface.tsx:391-405`                                 |
| R5  | **`/studio/assets/recipes`** — a compatibility route for a UI that no longer exists; it silently redirects to `/assets`.                                                                                                                               | `paths.ts:18-19, 169-170`                                           |
| R6  | **`studioVideoPath()`** is exported and unit-tested but never called by application code, so `/studio/{videoId}` is an orphaned deep link.                                                                                                             | `grep studioVideoPath` matches only `paths.ts` and `paths.test.ts`  |

## 6. Potential bugs

### B1 — `?intent=record` only ever starts recording once per session (Medium)

`handledRecordIntentRef` is keyed on `${location.pathname}${location.search}`
(`StudioApp.tsx:972-979`). Because the Studio shell never unmounts while the user moves between
protected routes, the ref survives navigation.

_Repro:_ Quick Create ▸ Create Asset ▸ Video ▸ **Record Video** (capture starts) → navigate to
Dashboard → Quick Create ▸ Create Asset ▸ Video ▸ **Record Video** again. The URL is identical, the
ref already holds it, and **capture never starts**. The user lands on an idle Studio with no
explanation.

_Fix direction:_ include `location.key` in the guard key.

### B2 — Browser Back re-opens the create dialog (Medium)

`createIntent` is carried in router state on the `/projects` and `/campaign` history entries
(`StudioApp.tsx:1110-1115`). After creating, the app pushes the new detail route without clearing
that state. Pressing Back returns to the list entry with the state intact, so
`routeCreateRequested` is true again and `NewProjectDialog` / `CampaignFormDialog` re-opens over a
list that already contains the just-created record
(`ProjectRouteSurface.tsx:258, 402-408`; `CampaignRouteSurface.tsx:161, 191-201`).

### B3 — Session expiry silently discards in-memory work (Medium)

When `expire()` fires (401 event or TTL timer), `ProtectedRoute` immediately returns `<Navigate>`
instead of its children (`ProtectedRoute.tsx:20-27`). The Studio shell — and with it
`StudioExitGuard` — unmounts in the same commit, so an unsaved take, an active render or a dirty
editor is discarded with no prompt. The exit guard protects in-app navigation and unload, but not
this path.

### B4 — `/studio/{videoId}` is outside the exit guard (Low, low reachability)

`studioWorkspaceKeyFromPath` returns a key only for `/studio/create`, `/studio/create/live` and
project workspaces (`StudioExitGuard.tsx:34-39`). `/studio/{videoId}` is a full review/edit surface
that is not covered, and the route's own effect calls `directVideoActionsRef.current.reset()`
unconditionally on entry (`StudioApp.tsx:763`), discarding local work. Currently only reachable by
typing a URL.

### B5 — `getProject` re-verification runs on every navigation into a project-scoped create (Low)

`creationContextRequestKey` embeds `location.key` (`StudioApp.tsx:219-222`), so returning to the
same `/studio/create?projectId=…` URL issues a fresh `GET /api/projects/{id}` each time. Correct
but redundant; on a slow link the Studio renders in an unverified state until it resolves.

### B6 — Cloud creative-library sync has no recovery path (Medium)

`useCreativeLibraryCloudSync` fails closed on conflict or transport error, unsubscribes, and shows
a notice (`useCreativeLibraryCloudSync.ts:40-45, 63-76, 106-112`). Nothing in the UI can resume
sync — the user must reload the page, and reload will hit the same divergence and pause again. A
user whose two browsers both have local characters is permanently unsynced with no merge, no
"keep mine / keep theirs", and no visible diff.

### B7 — Thumbnail generation failure is swallowed (Low)

`saveThumbnailWhenAvailable` catches every non-abort error and returns the un-thumbnailed video
(`useSaveVideo.ts:49-61`). The gallery then renders a placeholder with the label "Thumbnail
unavailable", and the user is never told the save partially degraded.

### B8 — Route errors are silently swallowed (Low)

`RouteErrorBoundary.componentDidCatch` has an empty body with a comment explaining that raw errors
are not exposed (`AppRouter.tsx:117-119`). Nothing is logged or reported anywhere, so a production
crash leaves no trace beyond the fallback screen.

### B9 — Dashboard "Continue Work" assumes list ordering (Low, unverified)

`continueProject = projects[0]` (`DashboardRouteSurface.tsx:166`). `projectsResponseSchema`
specifies no ordering (`packages/contracts/src/projects.ts:703-708`) and the client does not sort.
If any repository returns creation order, "Continue Work" will surface the oldest project. Marked
`Unverified` — the audit did not run all four `DATABASE_MODE` repositories.

### B10 — Detached `AbortController` listener leak on aborted saved-video loads (Observation)

`loadSavedVideo` adds an `abort` listener to the caller's signal and removes it in `finally`
(`useStudioSavedVideoController.ts:128-130, 173`). The removal uses the same function reference, so
this is correct, but the `gallerySourceLoadControllerRef` is only cleared when it still points at
the current controller — a rapid double-open leaves the superseded controller referenced by the
closure until GC. No user-visible effect was identified.

## 7. Inconsistent terminology

The product uses several vocabularies at once. Every term below is user-visible.

| Concept                    | Terms in the UI                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A retained video           | "Video", "Saved Video", "Asset", "Version", "output", "retained Version"                                               |
| Work in progress           | "take", "temporary take", "in-memory take", "presented media", "working media", "draft", "proposal", "candidate"       |
| Saving                     | "Save to Assets", "Save as New Video", "Add Version", "adopt", "checkpoint", "commit", "retain", "Save creative setup" |
| A reusable creative record | "Character", "Outfit", "saved prompt", "recipe", "creative resource", "creative asset"                                 |
| Creating a project         | "Quick project", "New Project", "Untitled Project"                                                                     |
| The app itself             | "Lightframe", "Lightframe Studio", "Studio", "Momentum Workspace", "Authenticated Studio"                              |

Domain vocabulary that leaks directly into user-facing copy:

- "Committing the immutable original and Project revision." (`ProjectRouteSurface.tsx:494`)
- "A semantic Project checkpoint is queued for the bounded autosave interval." (`:677`)
- "Committing one coalesced semantic Project revision." (`:683`)
- "Project authority is unavailable. Your proposal was preserved." (`:699`)
- "The validated render is temporary until adoption stores, inspects, and checksums it. Adoption
  advances working/presented media without replacing the immutable original…"
  (`StudioLifecycleDialogs.tsx:103`)
- "No provider starts from source selection, hydration, recording acceptance, or resume."
  (`ProjectRouteSurface.tsx:629-631`)

These sentences are _accurate_. They are also written for the person who implemented the aggregate,
not for the person trying to make a video.

## 8. First-time-user problems

1. **The vocabulary must be learned before the product can be used.** Project vs Campaign vs Asset
   vs Version vs source vs working media is six concepts before the first video.
2. **The first-take guide never appears** (`firstSuccessGuideVisible` is initialised `false` and
   never set — `StudioApp.tsx:329`), so the Studio's only inline coaching is dead code from the
   user's perspective.
3. **"Continue editing" on an empty project** implies prior work that does not exist (G3).
4. **Nothing explains that Studio work is temporary** until the user tries to leave and hits a
   discard dialog. The stage looks like a document editor; it behaves like a scratchpad.
5. **Campaign creation is the only guided next step in the product** — every other create action
   drops the user somewhere with no suggestion of what to do next.
6. **The Assets hub promises four libraries; one is inert** (G1).

## 9. Mobile and responsive concerns

Responsiveness is taken seriously — there is a dedicated `e2e/accessibility-responsive.spec.ts`
covering 200 %-text reflow at small-mobile, tablet and desktop, plus a visual matrix. Remaining
concerns:

| #   | Concern                                                                                                                                                                       | Evidence                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P1  | The mobile bottom nav only renders on organization routes (`StudioHeader.tsx:381`). On `/studio/create` — the primary mobile use case — there is no bottom navigation at all. | `StudioHeader.tsx:381-397`                         |
| P2  | The Project workspace tablist is four horizontal tabs; at small widths with large text they compete with the media stage in the same viewport.                                | `ProjectRouteSurface.tsx:870-888`                  |
| P3  | The account menu becomes a 2.75 rem icon with the label hidden below 48 rem (`AccountMenu.tsx:126-129`), leaving logout behind an unlabelled avatar.                          | `AccountMenu.tsx:126-129`                          |
| P4  | Asset library overlays are `placement="fullscreen"`, which is correct on mobile but means the hub's context is entirely lost with no breadcrumb (M5, M12).                    | `StudioLibraryOverlays.tsx:70-73`                  |
| P5  | Capture settings collapse from a desktop sidebar to a right-side overlay based on `useDesktopStudioLayout`; the transition point is not aligned with the nav breakpoints.     | `useDesktopStudioLayout.ts`, `StudioApp.styles.ts` |

## 10. Technical risks affecting user flows

| #   | Risk                                                                                                                                                                                                            | Impact on flows                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Creative library is browser-local first.** Characters and Outfits live in IndexedDB; the cloud mirror is best-effort and fails closed (B6).                                                                   | A user on a second device sees an empty Characters library and no explanation beyond a sync notice                                     |
| T2  | **Feature availability is configuration-dependent at four levels** (`DATABASE_MODE`, `ASSET_STORE_PROVIDER`, provider keys, beta flags). Route registration itself is conditional (`app.ts:327, 412, 507`).     | The same build shows structurally different products; `503 feature_unavailable` is a legitimate response the UI must handle everywhere |
| T3  | **The Studio shell never unmounts.** This is what makes the persistent stage work, and it is also the root cause of B1 and the reason state leaks across "pages".                                               | Long sessions accumulate in-memory state that only a reload clears                                                                     |
| T4  | **Provider work is billable and only partially cancellable.** The UI says so honestly (`DashboardRouteSurface.tsx:490`, `ProjectProcessingStatusPanel.tsx:52-55`), but "Remove from queue" reads like a cancel. | Users may believe they stopped a charge                                                                                                |
| T5  | **300 MB client-side bounds** on every media read (`useStudioSavedVideoController.ts:139`, `useProjectSourceController.ts:21`).                                                                                 | Larger legitimate videos fail with a safety-limit message rather than a size-policy explanation up front                               |
| T6  | **No client-side telemetry or error reporting** (B8).                                                                                                                                                           | Field failures are invisible                                                                                                           |
| T7  | **`window.confirm` in two flows** (N7) blocks the event loop and cannot be automated or styled.                                                                                                                 | Inconsistent behaviour under test and on mobile                                                                                        |

## 11. Recommended priorities

Ordered so that navigation and flow integrity are fixed before polish. Each is small and
independent.

**Tier 1 — close the core loop (do these first)**

1. **G2/M1/M2** — add a post-save success state in Studio with Download, Open in Assets, and Create
   another. This is the single highest-value change in the list.
2. **B1** — include `location.key` in the record-intent guard so "Record Video" always records.
3. **G1** — make `/assets/voices` functional or remove it from the Assets hub.
4. **B3** — flush or warn about in-memory work before an expiry-driven redirect.

**Tier 2 — make the model legible**

5. **G3** — show the Source task (or an "Add source" primary action) on an empty project overview.
6. **G4** — one sentence and a visual distinction between "Project source" and "Attached assets".
7. **G7/M6** — surface `workflowPhase` as progress in the workspace masthead and mark the current
   task.
8. **§7** — a terminology pass: pick one word per concept and rewrite the six worst strings listed
   above into user language. Keep the precision; change the register.

**Tier 3 — navigation consistency**

9. **N4** — make Recent Work video rows open the specific video.
10. **N2/N3** — stop replacing history on "Open in Studio"; close overlays with a history-aware back
    rather than a push.
11. **B2** — clear `createIntent` router state after a successful create.
12. **N10** — apply the campaign filter to the archived project section, or hide it while filtered.
13. **N1** — rename `/campaign` to `/campaigns` with a legacy redirect (the redirect infrastructure
    already exists in `paths.ts`).
14. **G6** — bring campaign list actions to parity with the projects list.

**Tier 4 — consistency and hygiene**

15. **N7** — replace both `window.confirm` calls with `ConfirmationDialog`.
16. **N5** — clarify or merge "Quick project" and "New Project".
17. **G8** — either wire up `firstSuccessGuideVisible` or delete the dead guide markup.
18. **N8/N9** — make the dashboard greeting visible and align the heading with its accessible name.
19. **B6** — give cloud-library sync a retry and an explicit "keep local / keep cloud" choice.
20. **B8/T6** — add minimal error reporting behind the existing route error boundary.
21. **R1/R3/R4/R5** — remove the redundant surfaces once the flows above settle.

## 12. Unverified items

| Item                                                                                | Why it could not be verified                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/projects` and `GET /api/campaigns` ordering                               | Not specified in contracts; four repository implementations exist and none was executed |
| Whether `VoiceLibrary`'s `disabled` prop suppresses add/remove as well as selection | Requires a runtime check not performed                                                  |
| Effective maximum recording duration and memory ceiling                             | Computed from configuration at runtime                                                  |
| Live AI end-to-end behaviour                                                        | No provider key available                                                               |
| Behaviour of `DEMO_AUTH_ENABLED=false` in the browser                               | No dedicated UI found; not covered by tests                                             |
| Cross-tab session invalidation                                                      | No code or test found either way                                                        |
| Whether any repository actually returns a `total` for projects                      | Contract forbids it; UI compensates                                                     |

No lint, type-check, unit, integration or e2e suite was executed during this audit — the working
copy staged for analysis excludes `node_modules`, so tooling could not run. All findings are from
static reading of source, tests and SQL.
