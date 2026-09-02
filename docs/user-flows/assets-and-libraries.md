# Assets and Libraries

Assets is the authenticated account-level destination for retained Videos, Characters, Outfits and
Voices. It opens a library directly; there is no intermediate card hub.

## Route and history model

- The Assets rail action opens the last library used during the mounted shell session, defaulting
  to `/assets/videos`.
- `/assets` remains a protected compatibility entry. It replaces itself with that same direct
  library destination, so old bookmarks do not create a second Back step.
- `/assets/videos`, `/assets/characters`, `/assets/outfits` and `/assets/voices` each open a
  pathname-keyed, full-screen `OverlayPanel` from `StudioLibraryOverlays`.
- The shared **Asset libraries** tab strip stays in every overlay header. Switching tabs replaces
  the current library pathname; it never pushes another history entry.
- **Close Assets** consumes the entry that opened Assets and returns to its real origin. A direct
  entry with no in-app predecessor replaces to `/dashboard`.
- Asset routes mount no Studio media stage or capture runtime.

The tab counts do not confuse unread data with an empty library. Videos and Voices read owner-scoped
server counts. Characters and Outfits show a reserved loading count until the creative repository
hydrates, and an unavailable state with retry if the cache cannot open.

## Account ownership and persistence

Every retained library is account-scoped:

| Library                                                  | Durable authority                                                                                 | Client role                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Videos                                                   | authenticated Saved Video API and configured asset storage                                        | TanStack Query cache                                                  |
| Voices                                                   | authenticated saved-voice relationships                                                           | TanStack Query cache                                                  |
| Characters, Outfits, wardrobe variants and saved prompts | owner-derived `GET/PUT /api/creative-library`; normalized Neon rows in relational/production mode | IndexedDB cache, local-first edits and configured local-mode fallback |
| Character and Outfit reference images                    | authenticated reference-image API and configured asset storage                                    | hydrated object URLs only while needed                                |

The server derives the owner from the verified session, never from a browser-supplied account ID.
On a fresh signed-in session, `useCreativeLibraryCloudSync` reads the account snapshot and hydrates
an empty local cache. Production requires Neon, so the same creative records are available wherever
that account signs in. A local-only development configuration reports that account sync is
unavailable and keeps export available as a backup path; it is not the production storage model.

Creative-library writes use one owner-scoped revision compare-and-swap. Sync fails closed:

| Situation                                         | Behavior                                    |
| ------------------------------------------------- | ------------------------------------------- |
| Account empty, current production cache non-empty | initialize the account snapshot             |
| Account non-empty, current cache empty            | hydrate from the account snapshot           |
| Both contain different records                    | pause and preserve the current session copy |
| Revision conflict                                 | pause and preserve the current session copy |
| Transport failure                                 | pause and preserve the current session copy |

`CreativeLibrarySyncNotice` is mounted once in `ShellChrome`, because a paused Library
affects saves on every protected route. **Try again** repeats the complete read/compare sequence.
**Save current copy** confirms a fresh-revision overwrite of the account snapshot. **Reload account
copy** confirms replacing the current cache. There is no automatic merge: the contract is a
full-snapshot CAS and has no per-record merge semantics.

## Shared library header

All four libraries have one capability description, one `Assets / <library>` eyebrow, the same
account-count tab strip and the same close action. At tablet and phone widths the tab strip scrolls
horizontally inside its own bounds; it never widens the document.

Characters and Outfits also show one compact account-availability statement and one creation action.
Whole-library export/import is demoted to **Creative library actions ▸ Export or import library** so
data replacement does not compete with normal retrieval and creation.

## Videos (`/assets/videos`)

`VideoGallery` reads `GET /api/videos` through an infinite query with title search, optional
character/format filters, and server-provided facets.

- Loading reserves a six-poster grid and keeps one polite status announcement.
- The empty state says that Videos saved to Assets appear here and explains preview, download and
  Version history without naming an internal workflow.
- Origin and status contract values are mapped to readable labels such as **Studio recording**,
  **Imported video** and **File unavailable**. Raw enum values are not shown.
- Cards retain thumbnail/no-preview states, duration, dimensions, created date, Version count,
  format, character attribution, project attribution, Download and the existing overflow actions.
- `?video=<uuid>` opens that exact Saved Video preview, then the shell replaces away the parameter
  so closing the preview or pressing Back cannot reopen it.

### Search and filters

The title search uses the shared debounced list search. While text is present, a labelled `×`
appears inside the input at its trailing edge; activating it clears immediately and returns focus to
the same input. There is no standalone Clear search button.

At `64rem` and wider, Character, format, sort and **Clear filters** remain in the desktop filter row.
Below `64rem`, a **Filters** action sits level with the search input and opens a focus-trapped bottom
panel. The panel footer is always a two-column, single-line row: **Clear filters** and **Show N
videos**. The 834×1112, 390×844 and 320×568 visual cases verify the sheet; all five canonical
viewports verify no document overflow or clipped controls.

### Video actions

- The poster opens an authenticated preview with exact Version selection.
- Download uses the selected/current Version's authenticated content URL.
- **Open in Studio** and **Edit video** load the current Version into `/studio/create`; the latter
  opens the local editor after source validation.
- **Use as Project source** accepts the Saved Video as a Project's immutable source.
- Rename and Remove are confirmed mutations with cache updates and actionable failure states.
- **Generate preview** can use an early frame, first frame or uploaded image and updates the existing
  thumbnail endpoint without changing the saved Version.
- Preview overflow **Export** can locally re-frame a downloaded Version for a placement; it never
  changes the saved Version.

## Characters (`/assets/characters`)

Characters are `store.savedCharacterPrompts` from the account-hydrated creative repository.
**Create character** opens Character Builder in Studio. Cards retain reference imagery (or an
initial placeholder), prompt, **Use in Studio**, **Wardrobe**, copy and confirmed delete actions.
The empty state remains explanatory without duplicating the toolbar creation action.

## Outfits (`/assets/outfits`)

Outfits are `store.savedPrompts` filtered to `modelModeId === 'lucy-vton-latest'`.
**Create outfit** opens Outfit Builder in Studio. Cards retain reference imagery, prompt,
**Use in Studio** and confirmed delete. The overlay toolbar owns the only creation action.

## Voices (`/assets/voices`)

`VoiceLibrary` keeps its existing provider boundary: browse the configured catalog, preview, add or
remove an account-saved voice, and **Use in Studio**. The library is disabled only when ElevenLabs is
not configured, and the disabled state explains which actions need that integration. Opening Assets
or reading the saved count does not make a provider call.

## Export and import

The creative-library management panel exports `creative-library-<YYYY-MM-DD>.json` with a versioned
schema-v7 store and a sorted manifest of referenced image IDs. It never embeds image bytes.

Import replaces rather than merges. Before confirmation it refuses files larger than 2 MiB,
unreadable JSON, the wrong kind, unknown file/store versions, malformed records or any sanitization
that would be lossy. A confirmed import goes through `repository.replaceFromRemote`, so ordinary
account sync observes and persists the replacement. The confirmation names both what arrives and
that records absent from the file are lost.

## Exit points

- **Close Assets** → consume the opening entry; direct-entry fallback `/dashboard`
- Videos → `/studio/create`, or a selected Project workspace
- Characters / Outfits → `/studio/create` with the relevant builder open
- Voices → `/studio/create` with the selected voice held or applied by the existing-video workflow
