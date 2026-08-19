# Assets and Libraries

"Assets" is the account-level library of retained content. It is a hub page plus four full-screen
overlays.

## Structural fact

`/assets/videos`, `/assets/characters`, `/assets/outfits` and `/assets/voices` are **not separate
pages**. `AssetsRouteSurface` renders for all five paths (because `isAssetsPath` matches them all,
`paths.ts:99-104`), and `StudioLibraryOverlays` layers a `placement="fullscreen"` `OverlayPanel`
whose `open` prop is a pathname comparison (`StudioLibraryOverlays.tsx`). The hub
grid is behind the overlay; no Studio media stage is mounted on these routes at all, because a
library needs no camera.

Each overlay's close control calls `nav.closeAssetLibrary`, a history-aware back
(`useRouteBack`): it consumes the entry the library was opened with, falling back to a `replace`
onto `/assets` when the library was entered directly. Closing therefore adds **no** history entry.
A library reached from somewhere other than the hub — the Dashboard's "All Videos", the save-success
panel's "View in Assets" — closes back to that origin rather than to `/assets`.

## Flow: Assets hub (`/assets`)

**Entry** — nav "Assets", dashboard "Browse Assets", a library overlay closed from the hub.

**Journey**

1. Header: `h1` "Assets", a one-paragraph explanation that _"Saving to Assets never silently adds
   content to a Project or Campaign"_, and a primary **Upload video** action.
2. **Upload video** navigates to `/studio/create` with router state `{ creationIntent: 'upload' }`,
   which the Studio shell converts into an open video-upload overlay (`StudioApp.tsx`).
3. Four cards: Videos · Characters · Outfits · Voices. Characters and Outfits show a live "N saved"
   count sourced from the local creative repository; Videos and Voices show no count.
4. Characters and Outfits additionally state where that library is stored — "Stored in this browser
   only — clearing site data deletes it." when no cloud route is registered, "Stored in this browser
   and copied to your account." when one is. Videos and Voices carry no such line, because they are
   the server's. The distinction comes from `CreativeLibraryCloudSync.mirror`, which records whether
   `GET /api/creative-library` answered or 404'd; `status: 'idle'` cannot express it, because a
   deployment with no cloud route and a healthy mirror are both idle.
5. Each card has an **Open {name}** button.

**Missing** — the hub has no loading or error state of its own, because the two counts come from
in-memory local state and the other two are not fetched. Until the mirror check resolves the
storage line says only "Stored in this browser.", which is true in every mode.

## Flow: Videos library (`/assets/videos`)

Rendered by `apps/web/src/features/video-gallery/VideoGallery.tsx` — the richest library surface.

**Journey**

1. `GET /api/videos` (infinite query) with `sort`, optional `characterName` and `format` filters
   driven by server-provided facets.
   Arriving with `?video=<uuid>` — how the Dashboard's Recent Work opens one specific video — the
   gallery resolves that id through `getSavedVideo` under the same query key the preview itself
   uses, opens its preview, and reports an unknown or removed id as a notice rather than an empty
   overlay. The shell then replaces the entry without the parameter, so closing the preview or
   pressing Back never re-opens it.
2. Grid of cards: thumbnail (with a graceful placeholder when the thumbnail is absent or fails to
   load), duration badge, title, dimensions, created date, and chips for version count, origin,
   format, character name, character variant, non-ready status, and `Unassigned Content`.
   A record with no thumbnail states `No preview yet` rather than posing as a broken image, and
   carries an inline **Generate preview** action; one whose stored thumbnail fails to load states
   `Preview didn't load`.
3. Card actions:
   - **Preview** (the poster button) — opens a preview overlay with a version selector and a
     download link for the selected version
   - **Open in Studio** — primary
   - ⋯ menu: **Edit video** · **Use as Project source** · **Download** · **Rename** · **Remove
     from Assets**
4. **Open in Studio** / **Edit video** run `useStudioSavedVideoController.loadSavedVideo`
   (`useStudioSavedVideoController.ts:114-180`): abort any prior load → `GET /api/videos/{id}/content`
   with a 300 MB bound and a strict content-type check → build a `File` →
   **`navigate('/studio/create')`** — a push, so Back from Studio returns to the library — → open
   the video-upload overlay → hand the file to the existing-video workflow. `intent: 'edit'`
   additionally opens the local video editor once the workflow reaches `ready`.
5. **Use as Project source** opens `AddVideoToProjectDialog`, which calls
   `reuseSavedVideoAsProjectSource` — `POST /api/projects/{projectId}/source/reuse`. It sets the
   Project's **immutable source** and navigates to that Project's workspace. It is _not_ an asset
   membership, and it refuses any Project that already has a source. Attaching a Video as a
   membership is a different action, available from the Project overview as **Import Saved Video**.
6. **Download** is a plain anchor to `/api/videos/{id}/content?download=true`.
7. **Rename** and **Remove** are dialog-confirmed mutations with in-place cache updates.
8. **Generate preview** opens a repair dialog offering the same three poster sources as the save
   dialog — an automatic early frame, the first frame, or an uploaded image. A frame source reads
   the current Version through the shared 300 MB bounded reader; an uploaded image reads no video
   bytes at all. Generation stays in the browser, the result is `PUT` to the existing thumbnail
   endpoint, and success invalidates the saved-video lists so the poster appears without a reload.
   Failure keeps the record unchanged and offers a retry.

**States** — loading, error, empty, per-card busy, no-preview, thumbnail fallback, preview
generation in flight/failed, and a preview error fallback are all present.

## Flow: Characters library (`/assets/characters`)

Rendered by `SavedCharacterLibrary` (`features/account-library/SavedCreativeLibrary.tsx:220`).

- Data source is the **local creative repository** (IndexedDB), not the API. Items are
  `store.savedCharacterPrompts`.
- Overlay header carries a **Create new character** action.
- Above the grid, `CreativeLibraryPortability` states where the library lives, that an export never
  contains image bytes, and offers **Export library** / **Import library** — see
  [Export and import](#export-and-import). It is mounted by `StudioLibraryOverlays`, not by
  `SavedCharacterLibrary`, because that component also mounts as an in-session character picker
  where managing the library is not the job.
- Card: reference image (or an initial placeholder), name, prompt text, and actions
  **Use in Studio** · create-a-copy · **Wardrobe** · delete (confirmation dialog with a failure
  message).
- Every action navigates to `/studio/create` first and then opens the relevant builder overlay
  (`StudioApp.tsx`).
- Empty state: _"No saved characters yet — Create a character in Studio and save it to see it here."_

## Flow: Outfits library (`/assets/outfits`)

Rendered by `SavedOutfitLibrary` (`SavedCreativeLibrary.tsx:352`).

- Source is `store.savedPrompts` filtered to `modelModeId === 'lucy-vton-latest'`
  (`StudioLibraryOverlays.tsx`).
- **Create new saved outfit** sits inside the body (not in the overlay header, unlike Characters).
- The same `CreativeLibraryPortability` block sits above it. Both surfaces show it because both
  export and import the one shared store, not just the records that surface lists.
- Card: reference image if present, title, prompt (or "Reference-image outfit"), **Use in Studio**,
  **Delete** (confirmation dialog).
- Empty state present, but with no create call-to-action inside it (the create button is above).

## Flow: Voices library (`/assets/voices`)

Rendered by `VoiceLibrary` with the same interactive contract as every other mount
(`StudioLibraryOverlays.tsx`).

- Browse the provider catalog, preview a sample, **Add to Saved**, **Remove**, and **Use in Studio**
  are all available. The per-voice action is labelled by the hosting surface through
  `VoiceLibrary`'s `selectLabel` prop; the in-workflow mounts keep the default "Select".
- **Use in Studio** appears on saved voices only, because a catalog voice must be saved to the
  account first (`VoiceList.tsx:224-234`).
- **Use in Studio** navigates to `/studio/create` and opens the video-upload overlay. When the
  existing-video workflow already has a source, the voice is applied immediately. When Studio is
  empty the voice is **held by the existing-video workflow itself** as `pendingVoiceSelection` and
  promoted to `voiceSelection` by the `source-ready` reducer case — that case resets the rest of the
  workflow, so writing `voiceSelection` early would be discarded. A stage notice names the held
  voice, and reset or **Clear Voice setup** drops it.
- The library is disabled only when ElevenLabs is not configured. In that state it explains why
  instead of failing: browsing and previewing stay available, and `disabled` suppresses **Select,
  Remove and Add to Saved** together (`VoiceList.tsx:228, 240, 261`).
- The same component is used interactively in three other places: the project asset section
  (`ProjectAssetsSection.tsx`), the Quick-Create voice attach view
  (`AssetCreationLauncher.tsx:170`), and the character default-voice panel
  (`CharacterDefaultVoicePanel.tsx:48`).

## Creative library persistence

Characters, outfits, prompts and wardrobe variants live in a browser store created by
`createCreativeAssetRepository` (`features/creative-assets/repository.ts`), keyed per account and
per environment scope (`persistence/environmentScope.ts`, `studio/useStudioCreativeRepository.ts`).

`useCreativeLibraryCloudSync` mirrors that store to `GET/PUT /api/creative-library` when the route
exists (relational database modes only — see `app.ts:432-436` and the route inventory oracle at
`apps/api/src/route-inventory.test.ts:81-84`). The sync is deliberately **fail-closed**:

| Situation                                           | Behaviour                                         |
| --------------------------------------------------- | ------------------------------------------------- |
| Remote empty, local non-empty, production scope     | Push local up                                     |
| Remote empty, local non-empty, non-production scope | Overwrite local from remote                       |
| Remote non-empty, local empty                       | Pull remote down                                  |
| Both non-empty and different                        | **Pause sync** (`reason: 'diverged'`), keep local |
| Revision conflict                                   | Pause sync (`reason: 'conflict'`), keep local     |
| Transport failure                                   | Pause sync (`reason: 'unavailable'`), keep local  |

`useCreativeLibraryCloudSync` also reports `mirror` — `'checking'`, `'browser-only'` or `'cloud'` —
recorded from whether that first `GET` answered or 404'd. It exists because `status` cannot answer
"is there a cloud copy at all": a deployment with no route and a healthy mirror are both `idle`. A
transport failure leaves it `'checking'`, because being unable to reach the server is not evidence
either way, and the surfaces that read it claim nothing in that state.

**A pause is recoverable.** `useCreativeLibraryCloudSync` owns a structured
`CreativeLibrarySyncStatus` — the repository owns _local_ storage and neither stores nor reads cloud
status — and `CreativeLibrarySyncNotice` renders it once, in `ShellChrome`, on every
protected route — the pause affects every Character and Outfit save, not only `/assets`, and the
Asset libraries are fullscreen overlays that would hide a hub-level notice. It offers:

- **Try again** — re-runs the whole startup sequence, including the divergence check;
- **Keep this browser's copy** — re-reads the current server revision, then PUTs the local store
  over it. The revision the hook was holding when it paused is the one the server already rejected,
  so the fresh read is required rather than an optimization;
- **Use the cloud copy** — pulls the remote store through `replaceFromRemote`, which re-sanitizes it
  and refuses a non-canonical remote.

Both resolutions overwrite one copy with the other and are confirmed through `ConfirmationDialog`.
A transport failure offers only **Try again**, because there is nothing to choose between.

**There is still no merge, and that is deliberate.** Divergence is detected by a whole-store
deep-equality comparison, the contract exposes only a full-store PUT with a numeric CAS, and no
per-record identity or timestamp is available — so a "merge" would be invented semantics rather
than a reconciliation. Picking a side is the honest option.

An **import** replaces the store through the same `replaceFromRemote` the `keep-cloud` resolution
uses, so the mirror observes an ordinary local change and pushes it; it does not pause. See
[Export and import](#export-and-import).

The repository's separate `notice` field carries **local storage health** (recovered records,
session-only fallback, IndexedDB CAS conflicts). It is still rendered nowhere; that is an open gap
tracked in [`gaps-and-usability-audit.md`](gaps-and-usability-audit.md), not part of cloud sync.

## Export and import

Rendered by `features/creative-assets/CreativeLibraryPortability.tsx` on `/assets/characters` and
`/assets/outfits`. It is browser-local: no endpoint was added, and the file never leaves the tab.

**Export** downloads `creative-library-<YYYY-MM-DD>.json` immediately, with no dialog, because
nothing is destroyed. The envelope is built by `createCreativeLibraryExportFile`
(`packages/domain/src/assets/portability.ts`):

| Field                    | Contents                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| `kind`                   | `lightframe.creative-library`                                            |
| `fileVersion`            | `1` — the envelope's version, independent of the store's `schemaVersion` |
| `exportedAt`             | ISO timestamp                                                            |
| `referenceImageAssetIds` | Every reference image the records point at, deduplicated and sorted      |
| `store`                  | The sanitized `CreativeAssetStore` (schema v7)                           |

**The file holds no image bytes.** `referenceImageAssetIds` is a manifest, so the file states what
an import expects the account to already hold; the images themselves stay server-side reference
assets.

**Import** is destructive and goes through `ConfirmationDialog`, which names what the file holds and
says plainly that anything not in the file is lost. Before that dialog opens, the file must pass
every rule below; a refusal renders as a `StatusNotice role="alert"` and changes nothing:

| Refusal                     | Cause                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| `too-large`                 | Larger than 2 MiB — checked against the file, so it is never read        |
| `unreadable`                | Not JSON                                                                 |
| `not-a-library-file`        | Wrong `kind`, or a malformed `exportedAt`, manifest or `store`           |
| `unsupported-file-version`  | Unknown `fileVersion`                                                    |
| `unsupported-store-version` | The store is not schema v7 — refused, never migrated                     |
| `lossy`                     | `sanitizeCreativeAssetStore` reports `recovered` or `droppedRecords > 0` |

The last two are the point of the format: a backup that is silently rewritten on the way in is not a
backup. The `lossy` rule is deliberately the same one `PUT /api/creative-library` applies.

The 2 MiB bound matches that route's `bodyLimit`, so an accepted import can never produce a store
the cloud mirror would then reject.

A confirmed import replaces through `repository.replaceFromRemote` — the repository's existing
whole-store swap, which re-sanitizes, refuses a non-canonical store, commits once and notifies
subscribers. That last part is why the cloud mirror keeps pushing normally afterwards rather than
pausing: the sync hook's subscription sees an ordinary local change.

**Not offered:** merge semantics of any kind (import replaces), image bytes, and automatic backup.

## Reference images

Character and outfit imagery is stored server-side as reference image assets and rendered via
`referenceImageContentUrl(assetId)` → `GET /api/reference-images/{assetId}/content`. Generation,
import, upload, edit, composition and outfit try-on all have dedicated routes
(`apps/api/src/features/reference-images/routes.ts`) and are gated by
`referenceImagesAvailable` / `referenceImageEditAvailable` / `wardrobeAddOutfitAvailable`.

## Exit points

- Any library overlay → back one entry, fallback `/assets`
- Videos → `/studio/create` (push) with the video loaded
- Characters / Outfits → `/studio/create` with a builder overlay open
- Videos ⋯ ▸ Use as Project source → `/projects/{id}/workspace` with the source accepted

## Unverified

- Whether `Unassigned Content` on a video chip is a user-facing concept anywhere else. The string
  appears only in `VideoGallery.tsx:190`.
