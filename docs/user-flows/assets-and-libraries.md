# Assets and Libraries

"Assets" is the account-level library of retained content. It is a hub page plus four full-screen
overlays.

## Structural fact

`/assets/videos`, `/assets/characters`, `/assets/outfits` and `/assets/voices` are **not separate
pages**. `AssetsRouteSurface` renders for all five paths (because `isAssetsPath` matches them all,
`paths.ts:99-104`), and `StudioLibraryOverlays` layers a `placement="fullscreen"` `OverlayPanel`
whose `open` prop is a pathname comparison (`StudioLibraryOverlays.tsx:66,84,124,146`). The hub
grid is behind the overlay; the persistent Studio media stage is hidden on these routes
(`StudioWorkspace.tsx:223`).

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
   which the Studio shell converts into an open video-upload overlay (`StudioApp.tsx:304-318`).
3. Four cards: Videos · Characters · Outfits · Voices. Characters and Outfits show a live "N saved"
   count sourced from the local creative repository; Videos and Voices show no count.
4. Each card has an **Open {name}** button.

**Missing** — the hub has no loading or error state of its own, because the two counts come from
in-memory local state and the other two are not fetched.

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

**States** — loading, error, empty, per-card busy, thumbnail fallback, and a preview error fallback
are all present.

## Flow: Characters library (`/assets/characters`)

Rendered by `SavedCharacterLibrary` (`features/account-library/SavedCreativeLibrary.tsx:220`).

- Data source is the **local creative repository** (IndexedDB), not the API. Items are
  `store.savedCharacterPrompts`.
- Overlay header carries a **Create new character** action.
- Card: reference image (or an initial placeholder), name, prompt text, and actions
  **Use in Studio** · create-a-copy · **Wardrobe** · delete (confirmation dialog with a failure
  message).
- Every action navigates to `/studio/create` first and then opens the relevant builder overlay
  (`StudioApp.tsx:1305-1328`).
- Empty state: _"No saved characters yet — Create a character in Studio and save it to see it here."_

## Flow: Outfits library (`/assets/outfits`)

Rendered by `SavedOutfitLibrary` (`SavedCreativeLibrary.tsx:352`).

- Source is `store.savedPrompts` filtered to `modelModeId === 'lucy-vton-latest'`
  (`StudioLibraryOverlays.tsx:133`).
- **Create new saved outfit** sits inside the body (not in the overlay header, unlike Characters).
- Card: reference image if present, title, prompt (or "Reference-image outfit"), **Use in Studio**,
  **Delete** (confirmation dialog).
- Empty state present, but with no create call-to-action inside it (the create button is above).

## Flow: Voices library (`/assets/voices`)

Rendered by `VoiceLibrary` with the same interactive contract as every other mount
(`StudioLibraryOverlays.tsx:145-166`).

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

| Situation                                           | Behaviour                                 |
| --------------------------------------------------- | ----------------------------------------- |
| Remote empty, local non-empty, production scope     | Push local up                             |
| Remote empty, local non-empty, non-production scope | Overwrite local from remote               |
| Remote non-empty, local empty                       | Pull remote down                          |
| Both non-empty and different                        | **Pause sync**, keep local, show a notice |
| Revision conflict or transport failure              | Pause sync, keep local, show a notice     |

There is no merge and no manual resolution UI — the notice is terminal for the session.

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
