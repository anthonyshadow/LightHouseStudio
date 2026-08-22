# User-Flow Gaps and Usability Audit

Consolidated findings from the code-first audit. Every item cites the code that produced it.
Severities are **Critical / High / Medium / Low / Observation**.

**Status:** every tier is now closed. The four **High** product gaps — G1, G2, G3 and G4 — plus
**Tier 1** (B1, B3), **Tier 2** (G3, G4, G7/M6, the §7 terminology pass), **Tier 3** (N4, N2, N3,
B2, N10, N1, G6) and **Tier 4** (N7/T7, N5, G8, N8, N9, B6, B8/T6, R1, R4, R5). **R3** closed as a
consequence of G6. Each entry below records what shipped. Everything else remains an open finding.

**The fifteen-step roadmap in [`../product-audit/10-implementation-roadmap.md`](../product-audit/10-implementation-roadmap.md)
has since landed as well**, closing four findings this document had left open: **G5** and **M9**
(step 14, the account panel), **G8** and **M7** (step 15, the persistent explainer) and **M3**
(step 15, the Outfits empty state). **M10** was closed separately — `isChunkLoadError` now tells a
stale lazy chunk apart from a crash. Still open: **M5**, **M8**, **M12**, **R2**, **R6**, **B4**,
**B5**, **B7**, **B9** and **B10**.

**Two Tier 4 findings were already closed before the tier ran** — N7/T7 and G8's dead guide — by
refactors that landed for other reasons. Their entries below record that correction rather than new
work; verifying a finding still holds before acting on it is part of the job.

**Not a finding, but shipped alongside Tier 4:** the **Prompt Workshop was removed** as a product
decision. It was _not_ dead code — it had four live entry points and four E2E specs that drove it —
so this is recorded as a deliberate removal, not hygiene. See the note at the end of §5.

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

| Flow                                        | Why                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Live AI realtime session                    | Requires `REALTIME_VIDEO_BETA_ENABLED` + a Decart key; otherwise `/studio/create/live` renders an honest unavailable surface |
| ~~Selecting a voice from `/assets/voices`~~ | **Resolved (G1).** The library is interactive and hands a saved voice to Studio                                              |

## 2. Major product gaps

### G1 — The Assets ▸ Voices library cannot do anything (High) — **Resolved**

`/assets/voices` was one of four equally-weighted cards on the Assets hub, but the overlay it opened
was read-only. The description told the user to "Select a voice from an active video workflow when
you are ready to use it." A library the user is told not to use from the library is a dead end.

The audit's `Unverified` question about the `disabled` prop is now answered: it suppressed
**Select, Remove _and_ Add to Saved** together (`VoiceList.tsx:228, 240, 261`), leaving only preview,
search and paging. The surface could not even manage saved voices, contradicting its own card copy.

_Shipped:_ the overlay mounts `VoiceLibrary` interactively, labels the per-voice action **Use in
Studio** through a new `selectLabel` prop (the four in-workflow mounts keep "Select"), and is
disabled with an explanation only when ElevenLabs is unconfigured. **Use in Studio** navigates to
`/studio/create` and opens the upload overlay; the voice is applied immediately when a source
exists, otherwise held by the existing-video workflow as `pendingVoiceSelection` and promoted by the
`source-ready` reducer case — that case resets the rest of the workflow, so an early write to
`voiceSelection` would be discarded. Keeping the hold inside the workflow leaves one owner for voice
selection and needs no cross-component effect. A stage notice names the held voice; reset drops it.

### G2 — Saving a video has no destination (High) — **Resolved**

After **Save to Assets** succeeded in Studio, the user stayed exactly where they were. There was no
success screen, no "View in Assets" link, no download button, and no "create another".

_Shipped:_ `SaveVideoSuccessPanel` opens from `StudioLifecycleDialogs` on an explicitly requested
save, naming the Saved Video and its Version, with **Download** · **View in Assets** · **Create
another** · **Stay in Studio**. The same three actions render inline through
`SavedVideoSuccessActions` in the take-review dock and the existing-video result bar, so they
survive dismissing the panel; **Download** and **View in Assets** render the same way on the Project
workspace Save tab once an output save settles. Download reuses `downloadSavedVideoUrl` and the
retained filename; **Create another** reuses `discardTemporaryWork` rather than routing through
`?intent=record`: the panel opens after any explicit save, including one that began as an upload, so
auto-starting the camera would demand a permission prompt nobody asked for and would push a history
entry back onto the just-saved state. (It was also a B1 workaround; B1 is now fixed, and the
behaviour stands on its own merits.) The panel is suppressed while a Project video context owns the
save, and a pre-edit save inside **Replace and Save** does not trigger it
(`useStudioSavedVideoController.saveOutcome`). This also closes **M1** and **M2**.

### G3 — Project overview hides the entire workflow (High) — **Resolved**

`/projects/{id}` showed a header and an attached-assets list. Source, Create, Save and History
existed only behind **Continue editing**, whose label implied resuming work that did not exist yet.

_Shipped:_ an active Project with no source now renders the Source task directly on the overview —
the same `ProjectSourceSection` the workspace uses, with Record · Upload · Use Saved Video — and the
primary action reads **Add source** until a source exists. A `ProjectWorkflowProgress` strip shows
Source → Create → Save → History with the current step marked. The strip is intentionally not
clickable, because workspace tasks are not deep-linkable; that belongs with **G7**.

The mount condition is load-bearing: the section renders **only** while `sourceAssetId === null`.
`useProjectSourceController` hydrates a source-bearing Project by downloading the full source bytes,
which on the overview would stream into a hidden stage.

### G4 — "Source" and "attached asset" are different things and nothing says so (High) — **Resolved**

**Correction to the original finding.** The Videos library's **Add to Project** never created a
membership. `AddVideoToProjectDialog` calls `reuseSavedVideoAsProjectSource`, sets the immutable
source, refuses any Project that already has one, and navigates to that Project's workspace. The
original entry — and `projects.md` and `assets-and-libraries.md` — described it backwards. The
membership paths are the overview's **Import Saved Video**, the creative builders with a Project
destination, and a Studio save made with `?projectId=`.

_Shipped:_ the misleading label is gone — the Videos library action and its dialog now read **Use as
Project source**. The attached-assets section carries a standing line stating that memberships never
change the Project source, instead of burying it in an empty state. Adopting an attached Video is
labelled by consequence: **Use as Project source** on an empty Project, **Use as working media** once
it has one, replacing the single ambiguous "Open in Workspace". The source branch is irreversible
(`acceptProjectSource` is one-shot), so it is now confirmed through `ConfirmationDialog`. With G3 in
place, "Project source" and "Project Assets" sit as adjacent, differently-named sections on the
overview.

### G5 — No account or settings surface (Medium) — **Resolved**

`AccountMenu` contained only **Log out**. There was no profile, no preferences, no storage usage, no
provider configuration view, no way to see the plan or entitlements the API already returns in the
session payload.

**Shipped (step 14).** The account menu now offers **Account details**, opening a read-only
`AccountPanel` (`features/account/AccountPanel.tsx`) built entirely from data the product already
holds: identity, plan and session expiry from the in-memory session; the plan's included
capabilities and its Saved Video/Character/Outfit and monthly-credit limits from `entitlements`;
the configured integrations in the same wording the header status menu uses; and one bounded
active-jobs read for what is running right now. It adds no polling and no new endpoint, and it says
plainly that Lightframe keeps no lifetime total across Projects — a Project's own History is the
record. This is not preferences or billing; neither exists to configure.

### G6 — Campaigns cannot be managed from the list (Medium) — **Resolved**

The Projects list offered Rename, Archive, Restore and Delete inline. The Campaigns list offered
only **Open** and — when archived — **Delete**. Editing or archiving a campaign required opening it
first. Two comparable entities behaved differently for no discoverable reason.

_Shipped:_ campaign rows now carry **Open · Edit · Archive/Restore · Delete**, tagged
`data-campaign-action` to match `data-project-action`. Nothing new was needed underneath: the list
response returns full `campaignSchema` records including `version`, so every mutation takes its
`expectedVersion` straight from the row — no detail fetch, no new endpoint.

`CampaignListSection` became presentational with the same callback-prop shape as
`ProjectListSection`, and `CampaignsWorkspace` took over the dialogs and the (previously duplicated
per-section) live region. A new `CampaignLifecycleDialog` joined `CampaignFormDialog` and
`DeleteCampaignDialog` in `CampaignDialogs.tsx`, and **`CampaignDetail` was switched onto all
three**, deleting its two inline `OverlayPanel`s — the archive/restore panel and a near-verbatim
re-implementation of `DeleteCampaignDialog`. Sharing rather than copying is the whole point: a
second archive dialog written for the list would have been the duplication this repo forbids. The
two surfaces differ only in what success means, which the callbacks carry: the detail page navigates
to `/campaigns` after a delete, the list refreshes in place.

Deliberately **not** copied from `ProjectLifecycleDialog`: its reload-and-retry path.
`useCampaignsController` has no `changeLatestLifecycle` equivalent, and inventing one would re-apply
a lifecycle change against a version the operator never saw. A stale CAS says "Change not applied"
and re-sends the same `expectedVersion` if retried. Parity here means the same _actions_, not new
recovery machinery.

The status pill moved out of the card's action row into its metadata, because it is not an action
and the row now holds up to four buttons — the mobile 200 %-text reflow case in
`accessibility-responsive.spec.ts` is the constraint that made this non-optional.

This also closes **R3**: with both handlers inside dialogs that own their own error, `actionError`
and its three competing render sites on the detail page have no writer left and are gone. A
dismissed failure no longer lingers as a page-level banner behind the dialog that produced it.

### G7 — Nothing guides a user from a Project to its output (Medium) — **Resolved**

The workspace tabs were static; nothing marked the current task, nothing advanced to the next one
after a step completed, and the derived `workflowPhase` was never shown as progress. The user had to
know that Source → Create → Save is the order. The active tab was `useState('source')`, so it reset
on every remount and never moved.

A correction the fix turned up: the phase sequence in the original finding is the _contract enum_,
not a reachable path. No domain rule ever writes `processing` or `export`; the reachable sequence is
`source → creative → review → complete`.

_Shipped:_ `ProjectWorkflowProgress` gained a compact `variant="masthead"` and now renders in the
workspace masthead as well as the overview, and it became the single owner of the step list —
`projectWorkspaceTasks` derives its four tabs from `PROJECT_WORKFLOW_STEPS`, so progress and
navigation cannot drift. The strip stays **non-interactive** deliberately: the tablist already owns
moving between those tasks, and a clickable strip would give one piece of state two competing owners
(the exact complaint §5 makes about other surfaces). The masthead is a fixed `3rem` row, so the
compact variant never wraps and drops its labels below `64rem`, keeping ordinals and per-step
`aria-label`.

The workspace now opens on the step the Project is up to, via an exported `stepForSnapshot`, and
tasks are deep-linkable through `?task=<id>`. The initial choice is **latched on entry** — a phase
change mid-session does not pull the open panel out from under the user — and any explicit choice
outranks it. A query parameter rather than a path segment because the anchored
`PROJECT_WORKSPACE_PATH` regex would otherwise break `projectIdFromPath`, `isProjectWorkspacePath`,
`isProtectedAppPath` and `canonicalizeLegacyAppPath` at once; it is also invisible to
`StudioExitGuard`, which keys on pathname alone, so changing task cannot read as leaving a Project
with unsaved changes. Task changes `replace` rather than push, or `useRouteBack` would walk back
through tasks instead of leaving. This also closes **M6**.

### G8 — First-time-user guidance is one dismissible card (Medium) — **Resolved**

`dashboardOnboarding.ts` stores a single boolean. Once dismissed, no product surface ever explained
Projects vs Campaigns vs Assets again.

**Shipped (step 15).** A quiet **How Lightframe works** control sits in the header on every
protected route and opens a static explainer (`studio/HowLightframeWorksPanel.tsx`) covering when a
Project helps, when a Campaign helps, and what each Asset library holds — reachable long after the
getting-started card is dismissed, and storing nothing beyond the boolean that already existed.
Each list empty state also gained a visual and one worked example, so a surface teaches when it has
nothing to show. This closes **M7** with it.

_Correction:_ the second half — the unreachable Studio "first take guide" gated on
`firstSuccessGuideVisible` — **no longer exists**. The symbol and the guide markup were both removed
by the shell/runtime split, before Tier 4 ran. Nothing was left behind: `firstSuccessGuide` matches
nowhere in `apps/web/src`. Tier 4 item 17 asked to "wire it up or delete the dead markup"; deleting
it had already happened.

## 3. UX and navigation problems

### N1 — `/campaign` is singular; everything else is plural (Medium) — **Resolved**

`APP_PATHS.campaigns` was `/campaign` while the nav label, the page heading and the detail path
segment all read "Campaigns". Projects use `/projects`. This was visible in the URL bar and in every
shared link.

_Shipped:_ `/campaigns` and `/campaigns/{id}` are canonical. Only **two** non-test source
occurrences of the old literal existed — the constant and the hardcoded `CAMPAIGN_DETAIL_PATH`
regex — because everything else already routed through `APP_PATHS.campaigns` / `campaignPath()`.

The old paths redirect, modelled exactly on how `/studio/assets/recipes` is handled: a
`legacyCampaignsSingular` constant, a `LEGACY_CAMPAIGN_SINGULAR_DETAIL_PATH` regex folded into
`legacyCampaignRedirect`, and a `switch` arm in `canonicalizeLegacyAppPath` — but **no** entry in
`PROTECTED_LEAF_PATHS`. That last part is load-bearing: it is what keeps the one-hop guard in
`canonicalizeProtectedDestination` honest, so a saved login return to `/campaign?x=1` resolves to
`/campaigns?x=1` instead of being rejected as still-legacy. The two regexes cannot collide, because
`^\/campaign\/` requires a literal `/` immediately after `campaign`.

Note the limit: `AppRouter`'s `<Navigate replace to={legacyRedirect} />` carries pathname only, so a
typed `/campaign?x=1` lands on `/campaigns` without the query. Nothing in the product ever linked
`/campaign` with a query string, and the login-return path — which does preserve it — goes through
`canonicalizeProtectedDestination` instead.

### N2 — Opening a video from the gallery destroys the gallery history entry (Medium) — **Resolved**

`navigateToStudio` used `navigate(APP_PATHS.create, { replace: true })`, so pressing Back from Studio
after "Open in Studio" did **not** return to `/assets/videos`.

_Shipped:_ the wiring now passes `nav.openStudio` (a push), and `replaceWithStudio` — whose only
consumer this was — is deleted along with its now-false doc comment. The other caller,
`loadSavedVideoRoute`, passes `preserveRoute: true` and never navigated in the first place, so
`/studio/{videoId}` is untouched.

Back from Studio now lands on `/assets/videos`. If a take is loaded, `StudioExitGuard` raises its
usual discard prompt — the same prompt every other Studio exit already raises, just with a different
destination behind it.

**Not covered by an automated test, deliberately.** Reaching the assertion needs a real
`GET /api/videos/{id}/content` response, and no e2e harness serves video bytes; building one for a
one-line wiring change would be a larger and more fragile addition than the fix. Verified by reading
the single call path and by driving the running app.

### N3 — Closing a library overlay pushes history (Low) — **Resolved**

Each overlay's close handler called `onNavigate(APP_PATHS.assets)` — a push. Open and close a
library three times and Back had to be pressed six times to leave Assets.

_Shipped:_ `StudioLibraryOverlays` now takes `onClose` instead of `onNavigate` (which had no other
use in the file), wired to a new `nav.closeAssetLibrary` that goes through the existing
`useRouteBack`. Closing consumes the entry the library was opened with, and falls back to a
`replace` onto `/assets` on direct entry, so a deep-linked library still lands somewhere sensible.

The consequence is intended and worth stating: a library reached from somewhere other than the hub —
the Dashboard's "All Videos", the save-success panel's "View in Assets" — now closes back to _that_
origin rather than to `/assets`. Back means back.

The unit test asserts the property that holds in both branches (the close never pushes), because a
memory router has no `window.history.state.idx` and therefore always takes the replace fallback; the
real pop is covered in `e2e/app-routing.spec.ts`.

### N4 — Recent Work "video" rows open the whole gallery (Medium) — **Resolved**

Every video item set `open: onOpenVideos`, ignoring the item's id, so clicking a specific recent
video navigated to `/assets/videos` with no filter, selection or scroll target — while project and
campaign rows opened the specific record.

_Shipped:_ video rows call a new `onOpenVideo(video.id)` and land on `/assets/videos?video={id}`,
which opens that Saved Video's preview — the version selector, Download, Open in Studio and Edit
that the library already provides for one record. `onOpenVideos` is kept: "All Videos" and the
save-success panel still want the whole shelf.

**Why not `/studio/{videoId}`.** That orphaned deep link (**R6**) is the other candidate "specific"
destination and would have closed R6 too, but it downloads the video's bytes, unconditionally resets
in-memory work on entry, and sits outside `StudioExitGuard` (**B4**). Making it one click from the
Dashboard would have raised B4's severity to pay for a route-hygiene win. R6 stays open.

A query parameter rather than a path segment, because the library is an overlay whose `open` prop
compares `pathname` alone — `/assets/videos/{id}` would close the very overlay it was trying to
focus. `VideoGallery` stays router-free: it takes `focusVideoId` and reports back through
`onFocusVideoConsumed`, and the shell replaces the entry without the parameter, so closing the
preview or pressing Back never re-opens it. That is the same consume-and-strip shape the
`creationIntent: 'upload'` handling already uses.

The id resolves through `getSavedVideo` under the same query key the preview itself reads, so a
video already on screen costs no extra request and one from a later page costs only the request the
preview would have made anyway. An unknown or removed id surfaces the gallery's existing danger
notice instead of an empty overlay.

### N5 — Two competing create actions on the Projects list (Medium) — **Resolved**

**Quick project** created an "Untitled Project" immediately and navigated into it; **New Project**
opened a naming dialog. The buttons sat side by side with no explanation; the difference was only
described in the empty-state paragraph below them, which disappeared as soon as one project existed.

_Shipped:_ merged rather than relabelled. The header keeps one primary **New Project**, and
`NewProjectDialog` gained a quiet **Create without a name** beside **Create Project**. Standing
next to the naming field, it reads as "skip this" — which two unexplained header buttons never did.

No new controller work was needed: the dialog already held `useProjectsController()`, which exposes
both `createNamedMutation` and `createMutation`, and the quick path already accepted a `campaignId`.
That last part is the merge's actual gain — the unnamed action now carries whichever Campaign the
dialog has selected, which the standalone header button could never do. No opt-in prop:
`CampaignRouteSurface` mounts the same dialog with `campaignLocked`, an untitled Project inside that
Campaign is what that flow wants, and a flag with one meaningful value would be dead weight.

The dialog's error state is now scoped to the action that produced it — a named failure still blames
the name field, an unnamed one renders a `StatusNotice`, because it has no field to blame. The
page-level `createError` and its "Retry quick project" notice had exactly one writer and are gone.
The idempotency-key retention that made the old quick path replay-safe is unchanged and still
tested, now driven through the dialog.

### N6 — No nav item is active while in Studio (Low) — **Resolved**

`activeDestination` resolved to `'studio'` on `/studio/create`, but the primary nav rendered only
Dashboard, Projects, Campaigns and Assets, so the product's main creation surface showed no current
location. The rail and the mirrored mobile navigation now carry a **Studio** destination
(`StudioHeader.tsx`), and the id `activeDestination` already produced marks it.

### N7 — Two different confirmation mechanisms (Medium) — **Resolved, before Tier 4**

The app had a well-built `ConfirmationDialog` primitive and used it widely, yet two consequential
actions used the native `window.confirm`: switching experience mode over an existing draft, and
replacing the loaded gallery version.

_Correction:_ **this was already fixed** when Tier 4 began. `apps/web/src` contains **zero**
`window.confirm` calls, and `confirmModeReplacement` no longer exists. Both sites now `await` a real
dialog through `useConfirmationRequest` / `ConfirmationRequestDialog`
(`ui/primitives/confirmationRequest.tsx`), built on a generic `useAwaitableQuestion` whose docstring
records the reasons this finding gave — main-thread blocking, no theming, invisible to the overlay
stack's focus-return contract, and needing `window` stubbed to test. Mode replacement is gated by
`modeReplacementNeedsConfirmation` in `features/media-session/draftPolicy.ts`; the version replace
asks at `useStudioSavedVideoController.ts:278`.

The lesson is the finding's, not the fix's: an audit entry is a claim about a moment, and it needs
re-checking before it is acted on.

### N8 — The dashboard greets the user in a tooltip (Low) — **Resolved**

The header rendered the visible text "Authenticated Studio" with
`title={`Welcome back, ${displayName}`}`. The human-readable greeting was only available on hover,
and only to a pointer; the visible text was implementation vocabulary.

_Shipped:_ the eyebrow is now the greeting itself — visible text, no `title` attribute. Its styling
moved with it: the old uppercase, `0.2em`-tracked, `0.625rem` treatment made "Welcome back, …" read
as a category label rather than a sentence addressed to the operator, so it is now sentence case at
a readable size.

### N9 — The dashboard heading and its accessible name disagree (Low) — **Resolved**

`<h1 id="dashboard-heading" aria-label="Dashboard">Momentum Workspace</h1>`. Sighted users saw
"Momentum Workspace"; assistive technology announced "Dashboard".

_Shipped:_ the `h1` reads **Dashboard** and the `aria-label` is gone, so the visible text _is_ the
accessible name. `id="dashboard-heading"` stays — the section's `aria-labelledby` is its only
consumer, and the whole landmark was already named "Dashboard" through the override — as does
`tabIndex={-1}`, the focus target.

Every existing `getByRole('heading', { name: 'Dashboard' })` assertion keeps passing, which is the
point: they were passing on an override that contradicted the screen. Only the
`getByText('Momentum Workspace')` assertion changed, and a new one asserts the greeting is visible.
This also retires two of the six competing app names in §7.

### N10 — Archived projects ignore the campaign filter (Medium) — **Resolved**

In `ProjectsWorkspace`, selecting **No Campaign** applied `campaignId: 'none'` to the active section
only; the archived section was always rendered unfiltered, so selecting a filter produced a screen
where half the content contradicted it.

_Shipped:_ the archived section takes the same `campaignId`, retitled **Archived · No Campaign**
while filtered, with empty-state copy that says "no archived Projects _without a Campaign_" rather
than implying there are none at all. Nothing below the component needed changing —
`useProjectList` already keys on `campaignId ?? 'all'`, `projectsQuerySchema` already permits
`lifecycle=archived&campaignId=none`, and both repositories already apply the two filters
conjunctively. `CampaignDetail` had the correct shape all along; this brings the Projects list to it.

The finding survived this long because the surface's own test handler short-circuited the archived
lifecycle **before** reading `campaignId`, so the request it should have asserted was never
observed. The capture moved above the branch and the archived request is now asserted.

### N11 — Project counts are "N loaded", never totals (Low) — **Resolved**

Both list surfaces showed `{items.length} loaded` because the contracts returned no total. The
Videos gallery, by contrast, already had one. The word "loaded" exposed pagination mechanics.

_Shipped:_ the Project and Campaign list responses now carry a bounded `total`
(`listTotalSchema`), counted before the cursor is applied so it describes the query rather than the
remainder. Every surface states a real count in a polite live region — "3 Projects", or "More than
200 Projects" once the count is only a floor. No surface says "loaded" any more. The bound is
deliberate: a total must not become an unbounded `COUNT(*)` behind a search box, so both Project
repositories and both Campaign repositories stop counting one row past `LIST_TOTAL_CEILING`.

## 4. Missing UI

| #       | Missing                                                                                                                                                                                                                                                  | Where                                      | Severity |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------- |
| ~~M1~~  | ~~Success state after saving a video~~ — **resolved with G2**                                                                                                                                                                                            | Studio take review / action bar            | High     |
| ~~M2~~  | ~~Download affordance anywhere except the Videos gallery and Project History~~ — **resolved with G2** for Studio review and by the Project workspace Save tab's post-save actions                                                                        | Studio review, Project Save                | High     |
| ~~M3~~  | ~~Empty-state call to action on the Outfits library (the create button is above the empty state, not in it)~~ — **resolved (step 15)**: one create action, defined once, rendered inside the empty state when the library teaches and above it otherwise | `account-library/SavedCreativeLibrary.tsx` | Low      |
| ~~M4~~  | ~~Loading/error state for the Assets hub counts (they silently read 0 before the local repository hydrates)~~ — **resolved**: all four cards count, and say they are counting until they know                                                            | `AssetsRouteSurface.tsx`                   | Low      |
| M5      | Breadcrumbs anywhere except Project detail, Project workspace and Campaign detail                                                                                                                                                                        | Assets libraries, Studio                   | Medium   |
| ~~M6~~  | ~~Progress indication for the Project workflow phase~~ — **resolved with G7**                                                                                                                                                                            | Project workspace masthead                 | Medium   |
| ~~M7~~  | ~~A "what is a Project / Campaign / Asset" explanation reachable after onboarding is dismissed~~ — **resolved (step 15)** with G8                                                                                                                        | `studio/HowLightframeWorksPanel.tsx`       | Medium   |
| M8      | Confirmation before a project-source upload replaces a previously _failed_ staging attempt                                                                                                                                                               | `ProjectSourceSection.tsx:130-166`         | Low      |
| ~~M9~~  | ~~Any surfacing of `entitlements` returned by `/api/auth/me`~~ — **resolved (step 14)** with G5: the account panel lists each capability as Included / Not included, plus every limit                                                                    | `account/AccountPanel.tsx`                 | Low      |
| ~~M10~~ | ~~An error boundary message that distinguishes a chunk-load failure from an application crash~~ — **resolved**: `isChunkLoadError` splits a stale lazy chunk from a crash, and each states its own recovery                                              | `AppRouter.tsx`, `clientDiagnostics.ts`    | Low      |
| ~~M11~~ | ~~Retry affordance for the Assets hub when the creative repository fails to open~~ — **resolved**: an unopenable library offers a retry that reopens the repository                                                                                      | `useStudioCreativeRepository.ts`           | Low      |
| M12     | Visible indication that `/assets/*` libraries are overlays over the hub (Escape closes to `/assets`, which is not signposted)                                                                                                                            | `StudioLibraryOverlays.tsx`                | Low      |

## 5. Unnecessary or redundant UI

Deliberately conservative — each item was verified before listing.

| #      | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Evidence                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| ~~R1~~ | ~~**"Create another Campaign" on the Campaign detail page.**~~ — **Removed.** It competed with "New Project" on the surface whose job is to fill _this_ campaign, and the same action already exists in Quick Create and on the Campaigns list. Its `creatingCampaign` state and the `CampaignFormDialog` it was the only writer for went with it; `returnFocusRef` stayed, because New Project, Edit and Archive share it. No test clicked it.                                                                                                                                                                                       | `CampaignRouteSurface.tsx`                                          |
| R2     | **Four paths to create a video** — Dashboard "Create video", Quick Create ▸ New video, Quick Create ▸ Create Asset ▸ Video ▸ New Video, Assets "Upload video". Three land on `/studio/create` with different intents; the difference is not explained.                                                                                                                                                                                                                                                                                                                                                                                | `StudioApp.tsx:1106, 1179, 1236-1244`, `AssetsRouteSurface.tsx:145` |
| ~~R3~~ | ~~**Duplicate campaign error surface.** `actionError` renders both inline on the page and inside the open dialog.~~ — **resolved with G6**: each shared dialog owns its error, so the page-level `actionError` has no writer left                                                                                                                                                                                                                                                                                                                                                                                                     | `CampaignDialogs.tsx`                                               |
| ~~R4~~ | ~~**"Start New" section on the dashboard.**~~ — **Removed.** Literal duplication, not merely visual: both buttons called the same `nav.createProject` / `nav.createCampaign` the Quick Create menu uses, and **New Project** was repeated seven lines above in the Continue Work empty panel. `quickActionsStyles`, whose only call site it was, went with it. Its one real coupling was the `dashboard-overview` visual scenario, which gated on a visible **New Campaign** button that only Start New supplied on a seeded dashboard; that gate now uses the **All Campaigns** footer link.                                         | `DashboardRouteSurface.tsx`                                         |
| ~~R5~~ | ~~**`/studio/assets/recipes`**~~ — **Removed.** The constant and its `LEGACY_PATH_REDIRECTS` entry were the whole route: it was never in `PROTECTED_ROUTES` or `PROTECTED_LEAF_PATHS`, so deleting them makes `isProtectedAppPath` stop matching and the `*` branch send it to `/`. Three assertions moved; `/assets/recipes` (a different path) stays in both rejection lists, and `/studio/assets/recipes` joins them. The unrelated technical `recipes` identifiers in `existingVideoRecipes.ts`, the existing-video chooser and `packages/domain` are untouched — `feature-behavior/06-recipe-shelf.md` keeps those deliberately. | `paths.ts`                                                          |
| R6     | **`studioVideoPath()`** is exported and unit-tested but never called by application code, so `/studio/{videoId}` is an orphaned deep link. **Still open, deliberately** — N4 considered and rejected linking to it, because the route resets in-memory work and is outside `StudioExitGuard` (**B4**). Closing R6 means fixing B4 first, or deleting the route.                                                                                                                                                                                                                                                                       | `grep studioVideoPath` matches only `paths.ts` and `paths.test.ts`  |

**The Prompt Workshop was removed** alongside Tier 4, as a product decision rather than a §5 finding.
It is recorded here because the premise matters: it was **not** dead code. It had four live entry
points — the **Workshop** tool-rail button, **Open structured prompt workshop** in AI Settings and
again inside `lucy-latest` recipe fields, and the Project **Choose another ▸ prompt** path — and four
E2E specs that clicked it. Only `openSavedWorkshop` and the entire never-rendered save chain were
genuinely dead.

Prompt authoring survives: `ModelRecipeFields` already rendered the plain **Character direction** /
**Garment direction** field the Workshop's only output path wrote into, and VTO never showed a
Workshop button at all. Character Builder is untouched — it uses the `character-transform` intent,
which the Workshop explicitly early-returned on.

Three consequences worth stating:

- **The reference-hydration failure notice moved, and improved.** "Reference image could not be
  restored", with **Retry** and **Continue without reference**, rendered _only inside the Workshop
  panel_ — so it was already invisible to an operator who had not opened that panel, which every
  path that can produce it fails to do. It is now `ReferenceUseFailureNotice`, rendered
  unconditionally as a sibling of the tool rail: the failure belongs to reference hydration, not to
  any tool, so the rail does not own it.
- **`packages/domain/src/prompts` stays.** `PROMPT_INTENTS` is load-bearing for stored-record
  sanitization (`packages/domain/src/assets/sanitize.ts`), so the three Workshop-only intents cannot
  leave the domain without a separate stored-data compatibility decision.
- **Stray `lightframe.workshop-drafts.*` localStorage entries remain** in existing browsers. They are
  unsaved scratch text that never reached the API, nothing enumerates them, and a cleanup path whose
  only purpose is a deleted feature would have a very short useful life. Recorded rather than fixed.

`repository.createSavedCharacterPrompt` lost its only production caller and was **kept**: five test
files use it to seed characters, and `persistSavedCharacterPrompt` has different semantics, so
deleting it would have churned unrelated tests to change what they exercise.

## 6. Potential bugs

### B1 — `?intent=record` only ever started recording once per session (Medium) — **Resolved**

`handledRecordIntentRef` was keyed on `${location.pathname}${location.search}`. At the time the
Studio shell never unmounted while the user moved between protected routes, so the ref survived
navigation, a second visit to the identical URL was a no-op, and the user landed on an idle Studio
with no explanation. The Studio runtime is now torn down on leaving Studio, which would mask the
original bug; the `location.key` keying stays because it is what makes a return _within_ Studio
record again, and a dedicated test covers that path.

_Shipped:_ the guard key is now `` `${location.key}:${location.pathname}${location.search}` ``, with
`location.key` added to the effect dependencies — the CLAUDE.md gotcha verbatim, and the pattern
`creationContextRequestKey` and `directVideoRequestKey` already use in the same file. Scoping the
ref to one history entry also bounds a second, smaller defect: the ref is written before
`startLocalRecording`'s capability check, so an unsupported browser used to poison the key for the
whole session and now spends only that entry.

Not changed, deliberately: with an invalid or archived `projectId`, the verification effect replaces
the URL and fires capture twice. That predates this fix — the search string changes too, so the old
key changed as well — and it is bounded, because `startLocal` aborts its predecessor. It belongs
with **B5**, which owns the re-verification behaviour.

### B2 — Browser Back re-opens the create dialog (Medium) — **Resolved**

`createIntent` is carried in router state on the `/projects` and `/campaigns` history entries. After
creating, the app pushed the new detail route without clearing that state. Pressing Back returned to
the list entry with the state intact, so `routeCreateRequested` was true again and
`NewProjectDialog` / `CampaignFormDialog` re-opened over a list that already contained the
just-created record.

_Shipped:_ both surfaces gained a `clearRouteCreateIntent` — the repo's existing
`navigate(pathname, { replace: true, state: null })` idiom, already used on the cancel path — and
**every** close path now calls it, including the successful create that used to skip it. The success
handler replaces the list entry and then pushes the detail route; with no loaders on these routes
the replace settles before the push, so Back lands on a list entry whose state is `null`.

Consuming the intent on arrival was the other candidate and was rejected: it requires latching the
dialog's open state into `useState` from inside an effect, which `react-hooks/set-state-in-effect`
forbids repo-wide, and the workarounds are worse — a mount-time initializer breaks Quick Create
fired while already on the list (the shell persists across protected routes, so the component does
not remount), and a
scheduled setter adds async for no reason. Clearing at the close boundary keeps
`routeCreateRequested` as the single render-time owner and touches nothing else.

### B3 — Session expiry silently discarded in-memory work (Medium) — **Resolved**

When `expire()` fired (401 event or TTL timer), `ProtectedRoute` immediately returned `<Navigate>`
instead of its children. The Studio shell — and with it `StudioExitGuard` — unmounted in the same
commit, so an unsaved take, an active render or a dirty editor was discarded with no prompt. The
exit guard protects in-app navigation and unload, but expiry is neither a navigation nor an unload,
so neither mechanism ever saw it.

_Shipped:_ `AuthStatus` gained `'expiring'`, and `expire()` parks there — keeping the session
readable — **only while a hold is registered**. `holdSessionEnd()` is the seam; the Studio shell
holds for as long as it is mounted. Without a holder, teardown stays exactly as immediate as before,
which is what keeps the lazy-load, `legacyRedirect` and error-boundary paths from stranding the user
in a dead app with no route to login. Releasing the last hold while `'expiring'` finalizes, so a
shell that disappears for any other reason cannot strand it either — the same guarantee a timeout
backstop would give, without a wall clock.

`ProtectedRoute` renders children while `'expiring'`, which is what keeps the in-memory work alive.
`useStudioSessionExpiryController` reuses the aggregate signals the voluntary-logout path already
computes: with no work it finalizes at once, byte-identical to the old behaviour; with work it opens
a single-action `OverlayPanel` naming what ends. The decision is latched, because a poller failing
mid-notice can otherwise flip the work flags underneath it. `StudioExitGuard` takes a `sessionEnding`
prop and stands aside, so one exit never raises two prompts — an invariant that previously held only
by React's passive-effect flush ordering, and is now explicit and tested.

**Nothing is flushed, and that is the answer, not a shortcut.** The audit's remediation said "flush
or warn"; the session is genuinely gone, so a Project flush would return `401` like everything else.
The panel warns instead, and `sessionEndReason` lets the entry page say the session ended rather
than the generic "your session is required".

The keeping-the-session-readable part is load-bearing: three call sites use `auth.session!.user.id`
and must never see `null` while the shell is mounted. `useStudioSessionCleanup` was extracted so
logout and expiry share one `SessionCleanupCoordinator` rather than registering against two.

### B4 — `/studio/{videoId}` is outside the exit guard (Low, low reachability)

`studioWorkspaceKeyFromPath` returns a key only for `/studio/create`, `/studio/create/live` and
project workspaces (`StudioExitGuard.tsx:34-39`). `/studio/{videoId}` is a full review/edit surface
that is not covered, and the route's own effect calls `directVideoActionsRef.current.reset()`
unconditionally on entry (`StudioApp.tsx`), discarding local work. Currently only reachable by
typing a URL.

### B5 — `getProject` re-verification runs on every navigation into a project-scoped create (Low)

`creationContextRequestKey` embeds `location.key` (`StudioApp.tsx`), so returning to the
same `/studio/create?projectId=…` URL issues a fresh `GET /api/projects/{id}` each time. Correct
but redundant; on a slow link the Studio renders in an unverified state until it resolves.

Also owned here, surfaced while fixing **B1**: when the verified `projectId` is invalid, archived or
unreachable, this effect replaces the URL with `studioCreatePath({ intent: 'record' })`, which fires
capture a second time. It predates the B1 fix — the search string changes too, so the old
`pathname+search` key changed as well — and it is bounded, because `startLocal` aborts its
predecessor. The real fix is not to auto-start until the project context resolves, which is this
finding's territory rather than B1's.

### B6 — Cloud creative-library sync has no recovery path (Medium) — **Resolved**

`useCreativeLibraryCloudSync` failed closed on conflict or transport error, unsubscribed, and set a
notice. Nothing in the UI could resume sync — the user had to reload, and reload hit the same
divergence and paused again.

**Correction to the original finding: it was worse than "no recovery path".** The finding says the
hook "shows a notice". It did not. `setSyncNotice` wrote into `state.notice`, and **no component in
`apps/web/src` read that field**. A user whose two browsers both held local Characters was
permanently unsynced with no merge, no "keep mine / keep theirs", _and no visible indication that
anything had stopped_.

_Shipped:_ `useCreativeLibraryCloudSync` now owns a structured `CreativeLibrarySyncStatus` and
returns it beside its actions. A sentence cannot be branched on without matching its own copy, and
the recovery surface needs different actions per reason. The status lives with the hook, **not** in
the repository: the repository owns _local_ storage, and the old `setSyncNotice` seam was writing
cloud state into `state.notice`, a field that also carries storage health. Removing the seam
entirely leaves the repository smaller than before this work started, and spares every repository
test fake a field it never cared about.

The hook keeps its single effect and gains the operator's answer in its deps, so each attempt runs
exactly once — the `useProjectVideoAttachment` re-arm shape. `notice` stays for **local storage
health** alone.

`CreativeLibrarySyncNotice` offers **Try again** · **Keep this browser's copy** · **Use the cloud
copy**, the last two behind `ConfirmationDialog` because both overwrite data. **Keep this browser's
copy re-reads the revision first** — the one the hook was holding when it paused is precisely the
one the server rejected, so a fresh read is required, not an optimization. `unavailable` offers only
**Try again**; there is nothing to choose between.

It mounts **once**, in `ShellChrome`. The pause affects every Character and Outfit save wherever the
operator is, not just `/assets`; the Asset libraries are fullscreen overlays that would hide a
hub-level notice; and a chrome-level slot sits outside `mainGridStyles`, so it cannot disturb the
Studio stage or any visual baseline. There is no intermediate `syncing` state — the notice renders
nothing but a pause, so a status the UI cannot show would be pure re-render noise.

**No merge, deliberately.** Divergence is a whole-store `JSON.stringify` comparison, the contract
exposes only a full-store PUT with a numeric CAS, and there is no per-record identity or timestamp.
A "merge" would be invented semantics. Picking a side is the honest option the finding asked for.

**Discovered and left open:** the storage-health `notice` — recovered records, session-only
fallback, IndexedDB CAS conflicts — is still rendered nowhere. That is a separate finding with a
separate owner, recorded here rather than fixed under a cloud-sync heading.

### B7 — Thumbnail generation failure is swallowed (Low)

`saveThumbnailWhenAvailable` catches every non-abort error and returns the un-thumbnailed video
(`useSaveVideo.ts:49-61`). The gallery then renders a placeholder with the label "Thumbnail
unavailable", and the user is never told the save partially degraded.

### B8 — Route errors are silently swallowed (Low) — **Resolved**

`RouteErrorBoundary.componentDidCatch` had an empty body with a comment explaining that raw errors
are not exposed. Nothing was logged or reported anywhere, so a production crash left no trace beyond
the fallback screen — and `apps/web` had no logger, no `console.*`, no telemetry and no `VITE_*`
variable of any kind.

_Shipped:_ local only. Nothing leaves the browser, no endpoint was added, no dependency, no flag.
`app/clientDiagnostics.ts` keeps a bounded ten-entry in-memory ring buffer — bounded because a crash
loop must not grow the heap it is already failing in — holding error name, message, a stack
truncated to twelve lines, and the component stack. `componentDidCatch` records into it and
`console.error`s.

The original comment's rationale survives and is restated rather than deleted: the fallback copy
stays generic, and the raw message is never rendered. What changed is that the detail is now
_retrievable_ — **Copy diagnostic details** puts it on the operator's clipboard, so a report is
possible without devtools.

**This also closes M10.** The boundary now keeps the caught error, so a stale-deploy chunk miss is
told apart from a crash: `LazyAuthenticatedShell` and thirteen other `lazy()` sites all sit inside
this boundary, and a 404 on a hashed chunk used to read as "Studio could not load". It now reads
"A newer version of Lightframe is available", with the same reload button. Detection matches Vite's
and the browsers' own messages plus `ChunkLoadError`, because no error class is shared across
engines.

`vite.config.ts` sets `sourcemap: false`, so a production stack is minified. That is stated rather
than papered over. **T6** is downgraded, not closed: field failures are now legible to a user who
asks for them, but nothing is aggregated.

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

| Concept                    | Terms in the UI                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A retained video           | "Video", "Saved Video", "Asset", "Version", "output", "retained Version"                                                        |
| Work in progress           | "take", "temporary take", "in-memory take", "current cut", "draft", "proposal", "candidate"                                     |
| Saving                     | "Save to Assets", "Save as New Video", "Add Version", "commit", "retain", "Save progress"                                       |
| A reusable creative record | "Character", "Outfit", "saved prompt", "recipe", "creative resource", "creative asset"                                          |
| Creating a project         | "New Project", "Create without a name", "Untitled Project" — down from three competing verbs to one action and its opt-out (N5) |
| The app itself             | "Lightframe", "Lightframe Studio", "Studio" — "Momentum Workspace" and "Authenticated Studio" retired (N8/N9)                   |

~~Domain vocabulary that leaks directly into user-facing copy:~~ — **the six worst strings are
rewritten.** They were _accurate_, and also written for the person who implemented the aggregate
rather than the person trying to make a video. What shipped, and why the list needed correcting:

| Was                                                                                     | Now                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Committing the immutable original and Project revision."                               | "Saving the source video and this change to your Project."                                                                                          |
| "A semantic Project checkpoint is queued for the bounded autosave interval."            | "Your changes are queued and save automatically in a moment."                                                                                       |
| "Committing one coalesced semantic Project revision."                                   | "Saving your recent changes together as one change."                                                                                                |
| "Project authority is unavailable. Your proposal was preserved."                        | "Lightframe could not be reached. Your unsaved changes are still here."                                                                             |
| "The validated render is temporary until adoption stores, inspects, and checksums it…"  | "This render only exists on your device until you keep it. Keeping it stores and checks the file, then makes it the video this Project works from…" |
| "No provider starts from source selection, hydration, recording acceptance, or resume." | "Choosing, recording, or reopening a source never starts paid AI work."                                                                             |

Three of the six were **fallbacks the user rarely actually saw**, so the reachable copy was fixed
too: the "proposal was preserved" text users hit comes from `projectSessionController`, with a
user-reachable twin in `StudioExitGuard`; the adoption text is usually overridden by
`useProjectWorkingMediaController`. The sibling notices in the same source-phase mapper moved with
string 1, or the panel would have read as two different products, and the workspace source heading
went from "Immutable original" to "Source video" — the most exposed instance of the worst offender.

Words now absent from rendered copy: **coalesced**, **semantic**, **hydration**, **presented media**.
One word per concept, for the concepts these strings touch: **source** for the Project's first video,
**saved change** in prose (keeping "Revision _n_" only where it is an identifier the user can cite),
**unsaved changes** for local state, **Lightframe** for the server. **provider** is kept on purpose —
it is honest, and **T4** depends on the user understanding that provider work costs money.

**Correction to this table:** "candidate" is listed above as a user-facing term for work in progress.
It is not. Every occurrence in `apps/web/src` is an identifier (`recordingCandidate`,
`deleteCandidate`, `.find((candidate) => …)`); zero are rendered.

**Still open — the wider consolidation.** This pass deliberately did not unify the vocabulary tables
above, because that is a product decision wearing a copy-edit's clothes. "A retained video" alone has
five competing nouns across roughly 45 rendered strings in 10 files; "make this durable" has eight
verbs; "work in progress" is three different objects wearing eight names, and consolidating it
requires first deciding whether the recorded clip, the unsaved settings form and the Project media
pointer are one user-facing thing or three. `ProjectOutputSaveSection` already contains a sentence
whose only job is to disambiguate three of those verbs — the argument for the work, in the product's
own words. Doing it half-way across 45 strings would leave the vocabulary _more_ inconsistent, not
less.

## 8. First-time-user problems

1. **The vocabulary must be learned before the product can be used.** Project vs Campaign vs Asset
   vs Version vs source vs working media is six concepts before the first video.
2. ~~**The first-take guide never appears.**~~ — resolved: the flag and the guide markup were both
   removed by the shell/runtime split (see G8). The Studio now has no inline coaching at all, which
   is honest rather than dead, and the remaining gap is the one **M7** tracks.
3. ~~**"Continue editing" on an empty project** implies prior work that does not exist~~ —
   resolved (G3): the label reads **Add source** and the Source task is on the overview.
4. **Nothing explains that Studio work is temporary** until the user tries to leave and hits a
   discard dialog. The stage looks like a document editor; it behaves like a scratchpad.
5. **Campaign creation is the only guided next step in the product** — every other create action
   drops the user somewhere with no suggestion of what to do next. Partly eased by G7: a Project
   workspace now opens on the step it is up to and marks it, so at least within a Project the order
   is visible rather than remembered.
6. ~~The Assets hub promises four libraries; one is inert~~ — resolved (G1).

## 9. Mobile and responsive concerns

Responsiveness is taken seriously — there is a dedicated `e2e/accessibility-responsive.spec.ts`
covering 200 %-text reflow at small-mobile, tablet and desktop, plus a visual matrix. Remaining
concerns:

| #   | Concern                                                                                                                                                                                                                                                                     | Evidence                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P1  | ~~The mobile bottom nav only renders on organization routes. On `/studio/create` there is no bottom navigation at all.~~ — resolved: the shell renders one navigation chrome (rail plus bottom bar) on every protected route.                                               | `StudioHeader.tsx`                                 |
| P2  | The Project workspace tablist is four horizontal tabs; at small widths with large text they compete with the media stage in the same viewport.                                                                                                                              | `ProjectWorkspaceSurface.tsx:244-261`              |
| P3  | The account menu becomes a 2.75 rem icon with the label hidden below 48 rem (`AccountMenu.tsx:126-129`), leaving logout behind an unlabelled avatar.                                                                                                                        | `AccountMenu.tsx:126-129`                          |
| P4  | Asset library overlays are `placement="fullscreen"`, which is correct on mobile but means the hub's context is entirely lost with no breadcrumb (M5, M12).                                                                                                                  | `StudioLibraryOverlays.tsx`                        |
| P5  | Capture settings collapse from a desktop sidebar to a right-side overlay based on `useDesktopStudioLayout`; the transition point is not aligned with the nav breakpoints. The desktop sidebar itself now rests collapsed behind a control, but the breakpoint is unchanged. | `useDesktopStudioLayout.ts`, `StudioApp.styles.ts` |

## 10. Technical risks affecting user flows

| #      | Risk                                                                                                                                                                                                                                                                                                                          | Impact on flows                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | **Creative library is browser-local first.** Characters and Outfits live in IndexedDB; the cloud mirror is best-effort and fails closed (B6).                                                                                                                                                                                 | A user on a second device sees an empty Characters library and no explanation beyond a sync notice                                                  |
| T2     | **Feature availability is configuration-dependent at four levels** (`DATABASE_MODE`, `ASSET_STORE_PROVIDER`, provider keys, beta flags). Route registration itself is conditional (`app.ts:327, 412, 507`).                                                                                                                   | The same build shows structurally different products; `503 feature_unavailable` is a legitimate response the UI must handle everywhere              |
| ~~T3~~ | ~~**The Studio shell never unmounts.**~~ **Resolved.** The persistent shell now owns only what a session needs — remote state, lifecycle, chrome, creative library — and the capture runtime mounts only on routes that own live media (`isStudioRuntimePath`), shedding ~319 KB and the whole capture graph everywhere else. | In-memory Studio state no longer accumulates across "pages"; capture device choices and unsaved Workshop drafts are persisted so they still survive |
| T4     | **Provider work is billable and only partially cancellable.** The UI says so honestly (`DashboardRouteSurface.tsx:490`, `ProjectProcessingStatusPanel.tsx:52-55`), but "Remove from queue" reads like a cancel.                                                                                                               | Users may believe they stopped a charge                                                                                                             |
| T5     | **300 MB client-side bounds** on every media read (`useStudioSavedVideoController.ts:139`, `useProjectSourceController.ts:21`).                                                                                                                                                                                               | Larger legitimate videos fail with a safety-limit message rather than a size-policy explanation up front                                            |
| T6     | **No client-side telemetry or aggregation.** Downgraded, not closed (B8): a route crash is now recorded locally and the operator can copy it, and a stale-chunk failure is told apart from a crash — but nothing is collected anywhere, and production stacks are minified (`sourcemap: false`).                              | A field failure is legible to a user who is asked for it, and invisible otherwise                                                                   |
| ~~T7~~ | ~~**`window.confirm` in two flows** (N7).~~ **Resolved before Tier 4** — `apps/web/src` has none. Both sites `await` a real dialog through `useConfirmationRequest`.                                                                                                                                                          | —                                                                                                                                                   |

## 11. Recommended priorities

Ordered so that navigation and flow integrity are fixed before polish. Each is small and
independent.

**Tier 1 — close the core loop (do these first)** — **complete**

1. ~~**G2/M1/M2** — add a post-save success state in Studio with Download, Open in Assets, and
   Create another.~~ **Done.**
2. ~~**B1** — include `location.key` in the record-intent guard so "Record Video" always records.~~
   **Done.** The G2 "Create another" action still avoids `?intent=record`, now on its own merits
   rather than as a workaround.
3. ~~**G1** — make `/assets/voices` functional or remove it from the Assets hub.~~ **Done** — made
   functional.
4. ~~**B3** — flush or warn about in-memory work before an expiry-driven redirect.~~ **Done** —
   warn. A flush is impossible on this path: the session is gone, so any save would `401`.

**Tier 2 — make the model legible** — **complete**

5. ~~**G3** — show the Source task (or an "Add source" primary action) on an empty project
   overview.~~ **Done** — both.
6. ~~**G4** — one sentence and a visual distinction between "Project source" and "Attached
   assets".~~ **Done**, plus the label corrections the finding's own premise turned out to need.
7. ~~**G7/M6** — surface `workflowPhase` as progress in the workspace masthead and mark the current
   task.~~ **Done** — masthead strip, phase-derived entry task latched on entry, and `?task=`
   deep links. The strip stays non-interactive so it does not compete with the tablist.
8. ~~**§7** — a terminology pass: pick one word per concept and rewrite the six worst strings listed
   above into user language.~~ **Done** for the six and their reachable twins. The wider vocabulary
   consolidation is now tracked as an open finding in §7 — it needs a product decision first.

**Tier 3 — navigation consistency** — **complete**

9. ~~**N4** — make Recent Work video rows open the specific video.~~ **Done** — the Videos library
   opened on that video's preview, via `?video=`. Not the `/studio/{videoId}` deep link, so **R6**
   stays open on purpose.
10. ~~**N2/N3** — stop replacing history on "Open in Studio"; close overlays with a history-aware
    back rather than a push.~~ **Done** — both. Closing a library now returns to wherever it was
    opened from, which is the point.
11. ~~**B2** — clear `createIntent` router state after a successful create.~~ **Done** — every close
    path clears it, not just cancel.
12. ~~**N10** — apply the campaign filter to the archived project section, or hide it while
    filtered.~~ **Done** — applied, with an honest heading and empty state.
13. ~~**N1** — rename `/campaign` to `/campaigns` with a legacy redirect.~~ **Done** — two source
    literals, and the legacy paths follow the `recipes` compatibility shape exactly.
14. ~~**G6** — bring campaign list actions to parity with the projects list.~~ **Done**, by
    extracting the dialogs and sharing them with the detail page rather than copying them — which
    also closed **R3**.

**Tier 4 — consistency and hygiene** — **complete**

15. ~~**N7** — replace both `window.confirm` calls with `ConfirmationDialog`.~~ **Already done**
    before the tier ran, by `useConfirmationRequest`. Verified, and the entry corrected.
16. ~~**N5** — clarify or merge "Quick project" and "New Project".~~ **Done** — merged. The unnamed
    action lives in the dialog, where it can carry the Campaign the standalone button never could.
17. ~~**G8** — either wire up `firstSuccessGuideVisible` or delete the dead guide markup.~~
    **Already deleted**, with nothing left behind. The onboarding half of G8 stays open with **M7**.
18. ~~**N8/N9** — make the dashboard greeting visible and align the heading with its accessible
    name.~~ **Done** — and it retired two of §7's six app names as a side effect.
19. ~~**B6** — give cloud-library sync a retry and an explicit "keep local / keep cloud" choice.~~
    **Done**, plus the surface the finding assumed already existed and did not.
20. ~~**B8/T6** — add minimal error reporting behind the existing route error boundary.~~ **Done**,
    local only. **M10** closed with it; **T6** is downgraded rather than closed.
21. ~~**R1/R4/R5** — remove the redundant surfaces once the flows above settle.~~ **Done**, all
    three. (**R3** already went with G6.) **R6** stays open on purpose — it needs **B4** first.

**What is left.** Every tier is closed. The open findings are G5, the onboarding half of G8,
M3–M9 and M11–M12, B4, B5, B7, B9, B10, R2, R6, the §7 vocabulary consolidation, P2–P5, and
T1/T2/T4/T5/T6. None is a broken flow; the largest of them (**G5**, account and settings) is a
missing surface rather than a defect.

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

No lint, type-check, unit, integration or e2e suite was executed during the original audit — the
working copy staged for analysis excluded `node_modules`, so tooling could not run. All findings
were from static reading of source, tests and SQL. The G1–G4 fixes were validated with targeted
component and E2E runs. The Tier 1 and Tier 2 fixes (B1, B3, G7/M6, §7) were validated with the full
`apps/web` unit suite, the full Chromium E2E suite, and `bun run quality`.

The Tier 3 fixes (N4, N2/N3, B2, N10, N1, G6) were validated with the full `apps/web` unit suite,
the `app-routing` and `accessibility-responsive` Chromium E2E specs, and `bun run quality`. Two
caveats recorded honestly: **N2 has no automated coverage** (see its entry — no e2e harness serves
video content bytes), and `e2e/app-routing.spec.ts` "a Project saves exact Versions, reconciles
response loss, and retains truthful history" fails **on the unmodified baseline too**, so it is a
pre-existing failure rather than a Tier 3 regression.

The Tier 4 fixes (N5, N8, N9, B6, B8/T6, R1, R4, R5) and the Prompt Workshop removal were validated
with the full `apps/web` unit suite, `bun run quality`, `bun run check:docs`, and the Chromium E2E
suite. Recorded honestly:

- **`bun run check:dead-code:production` fails on the unmodified baseline** as well, on
  `apps/api/src/infrastructure/database/scripted-database.test-support.ts`. Confirmed by stashing
  the change and re-running; it is pre-existing, not a Tier 4 regression. (`bun run quality`, which
  runs the non-production `check:dead-code`, passes.)
- **Three `e2e/local-first-preparation.spec.ts` cases fail on the unmodified baseline too**, all at
  the same `expect(login.ok()).toBe(true)` before reaching any assertion this work touched.
  Environmental, and confirmed by the same stash-and-re-run.
- **One genuine accessibility defect surfaced and was fixed.** Removing the Workshop step from the
  full-desktop axe scan exposed a `color-contrast` violation on the _selected_ capture-format
  option's caption: `textFaint` on the `accentSoft` background. It had been hidden because the scan
  previously ran with the Workshop overlay open, which made the rest of the page inert. Only the
  selected state needed the step up to `textMuted`.
- **The `dashboard-overview` Darwin baselines were regenerated, and only those.** N8/N9 and R4 both
  change the dashboard header and body. The update was run with `--grep "dashboard-overview"`
  deliberately: **26 of the 35 curated cases already fail on the unmodified tree** in this
  environment, so a blanket `test:visual:update` would have rewritten 26 unrelated baselines to one
  machine's rendering — exactly what `docs/TESTING.md` forbids. Both regenerated images were
  inspected. `node scripts/prune-visual-baselines.mjs --check` reports 35 curated baselines across
  2 platforms and nothing to prune.
- **The two `chromium-linux` `11-dashboard/overview.png` baselines are still stale** and cannot be
  produced on macOS. They must be regenerated where Linux images are made.
- **The Workshop removal deleted three screenshot scenarios** (`03-character-workshop`) from
  `capture-screenshots.screenshots.ts`. No _visual baseline_ was affected: the visual matrix never
  contained a Workshop scenario, and `screenshots/` has no such directory.
