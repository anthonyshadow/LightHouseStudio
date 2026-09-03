# Save and reuse Videos in Assets

## Story

As the authenticated operator, I can save a finalized video, browse lightweight gallery records,
select and download an exact immutable Version, and load the current Version into the existing
Studio stage.

## Observable behavior

1. A healthy review artifact exposes **Save to Assets** and no Download action **before** it is
   saved. Saving first prompts for an optional video name and an optional preview image source; a
   blank field keeps the existing generated artifact name. The preview source is one of an
   automatic early frame, the video's first frame, or an uploaded JPEG/PNG/WebP image; choosing
   Upload without attaching an image falls back to the automatic frame, so deciding nothing keeps
   the long-standing behaviour. When the displayed frame has been measured, the same prompt also
   asks **where is this going** — keep as it is, phone full screen (9:16), widescreen (16:9), square
   (1:1), or tall feed post (4:5) — previewing the crop and stating what it trims. Keeping the shape
   is the default and re-frames nothing. Choosing a placement re-frames the bytes locally before
   they are retained, reporting progress and offering cancel while the dialog stays open; a
   cancelled or failed re-frame saves nothing. The retained file, its poster and its filename are
   the re-framed ones, and a re-framed save never inherits the receipt of the save it replaced.
   Once that exact artifact is retained, review acknowledges completion and
   offers **Download**, **View in Assets** and **Create another** for that exact Version; a Project
   video context keeps its own attach-and-return behavior instead.
   Saving is explicit, reports progress/result, and repeated submission of the same artifact is
   idempotent. An artifact with unsaved changes shows **Discard** but not **Close**. Once that
   artifact is saved, or when an unchanged Saved Video is opened in Studio, the same control slot
   shows **Close without saving** but not **Discard**.
2. **Save video** creates a titled gallery record and immutable first version. In the
   standalone workflow, **Replace Existing Video** is secondary, requires confirmation, checks the
   expected current version, and appends bytes rather than overwriting history. In a Project, one
   **Save video** action offers either **New video** or **New version of an existing video** inside
   one destination surface; that existing target is explicit and is never inferred from a Saved
   Video Version reused as source.
   In authoritative Neon/private-R2 mode, the authenticated API stages the save and the browser
   transfers multipart bytes directly to R2; the result is not visible until the API verifies and
   attaches it. Local and shadow modes retain their existing API-mediated upload behavior.
3. `/assets/videos` reuses the mounted `AuthenticatedShell`; it mounts no `MediaStage` at all,
   because a library needs no camera. Choosing **Use in Studio** hands the selection to the runtime
   through the shell's handoff channel and navigates there. The gallery first loads filtered/sorted
   metadata in cursor pages; it does not eagerly load video bytes. The default order is Latest,
   with Oldest, Shortest, and Longest alternatives.
4. The gallery can show only videos attributed to a chosen saved character and/or the chosen
   current-version format: Landscape, Portrait, or Square. Available character and format facets
   cover the full owner library rather than only the current page. Older saved versions without
   character attribution remain available under All characters. A saved Wardrobe variant retains
   both its parent character name and its exact variant name; filtering uses only the parent while
   cards and Preview show the variant as additional information. When no retained version has
   attribution yet, the character control remains operable and explains why it has no named option.
5. Cards show safe title, time, duration, dimensions, format, optional character attribution,
   origin, version count, and a lazy optional thumbnail. Thumbnails preserve the source aspect
   ratio: the long edge is bounded and the short edge follows, so a 9:16 source produces a portrait
   poster rather than a centre-cropped landscape tile, and a source already inside the bound is
   never upscaled. The route re-encodes what arrives on that same bound, so the stored poster keeps
   the shape the browser produced.
   Thumbnail generation is client-side and retried once, and never fails Save. A record with no
   stored poster renders a deliberate `No preview yet` placeholder; one whose poster exists but
   could not be fetched says `Preview didn't load` instead. The two are kept apart because a
   surface that cannot tell them apart reports an absence as a failure — every surface showing a
   poster reads `thumbnailAvailable` to choose between them. Such a record offers an inline
   **Generate preview** action that regenerates from the current Version — automatic frame, first
   frame, or an uploaded image — uploads it through the existing thumbnail endpoint, and refreshes
   the card without a page reload. A failed repair reports an actionable message with a retry and
   leaves the record unchanged. Listing the library issues no per-row request.
6. Activating a ready thumbnail explicitly fetches owner-checked bytes into a centered video
   preview over a darkened gallery, played by the product's one `VideoPlayer` — the same transport
   the upload panel and the Project surfaces use. The dialog traps focus, closes with Escape,
   returns focus to the thumbnail, and detaches its player source when closed; it owns no tracks,
   object URL, recorder, or provider session. The dialog lists immutable Versions with ordinal, current marker, origin,
   timestamp, media facts, and status. Selecting an older Version previews and downloads that exact
   content without changing the Saved Video current pointer. **Export** opens the placement chooser
   on the placement that Version was produced for, because a Version records one exactly when a
   rendition was stored for it: those bytes already are that shape, so the offer stays the plain
   server download until a _different_ placement is chosen, and only then is anything re-framed.
7. **Open in Studio** navigates to `/studio/create` (push navigation), fetches owner-checked
   metadata and only the current Version bytes, enforces the 300 MB bound, and opens the existing
   review workspace. The `/studio/:videoId` deep link exists for direct entry but is not the
   gallery's navigation target.
   Direct entry, refresh, and pasted URLs work without navigation state; **Edit video** remains
   an explicit action from review rather than opening the editor automatically.
   **Use as Project source** links the exact ready Version to a selected empty same-owner Project
   through the existing source-acceptance contract; the Video remains reusable and no bytes are
   copied. It is named for that consequence and refuses a Project that already has a source.
   Separately, **Import Saved Video** can add a non-owning Project Asset membership without
   replacing that Project's immutable source.
8. Rename changes metadata under compare-and-set: the request carries the `revision` the row was
   rendered from, and the server answers `409` when the video moved on since. The dialog then
   fetches the winning record, re-seeds itself with the fresh token and keeps the operator's typed
   title, so the retry compares against what is actually stored rather than resubmitting a token
   that can never win again. **Remove from Assets** confirms, tombstones only the chosen record, and
   removes it from the visible gallery. The confirmation states what this deployment actually does
   to the file, from the `savedVideos.removalDeletesStoredMedia` capability: object storage says the
   stored file is deleted unless something still uses it, local storage says the file is not erased,
   and an unread capability claims neither. Every video can be removed independently in any order; retained derived
   records keep their historical source lineage even when that source record is deleted. With
   private R2 selected, deletion removes only immutable-version and thumbnail objects that no
   Project output still retains. A tombstoned global record stays hidden, while an exact
   same-owner Project-retained Version remains available through Project-scoped content.
   Download is available for the selected exact ready Version through an authenticated content
   response. Project history may also download an exact Project-retained Version.
9. A legacy or independently saved record with no trustworthy Project output relation is labeled
   **No Project**, remains fully usable, and receives no fabricated producer. Later source
   reuse records only truthful used-by lineage.

## Acceptance checks

- Empty, loading, incremental-load, error, missing-media, thumbnail-fallback, populated, and open
  preview states remain operable at all five canonical viewports with approximately 44px touch
  targets.
- Parent-character/format filters combine, variants remain grouped under their parent character,
  sort applies to the complete filtered result before
  pagination, and an empty match keeps the controls available for recovery. The Neon repository
  performs filtering, ordering, counts, and facets in SQL and fetches version rows only for the
  selected page.
- List/detail responses expose no local path, asset key, provider URL, credential, or raw error.
- Direct-upload contracts expose only an owner-checked staged UUID, bounded part metadata, and a
  five-minute exact-part URL. Wrong-owner signing/list/abort/complete is non-enumerating. A size,
  metadata, checksum, or media-inspection mismatch never creates a ready gallery version; expired
  multipart state is aborted and discarded. Transfer retries never repeat provider operations.
- Wrong-owner and missing records use safe non-enumerating responses. Content supports controlled
  range delivery without reading the full file into application memory.
- Saved timestamps remain canonical UTC ISO strings across local and Neon persistence. Loading
  legacy local metadata atomically normalizes parseable timestamps and rounds fractional duration
  milliseconds before any Neon backfill or new version insert.

## Retention

Local-only deletion retains detached video and thumbnail bytes until whole-environment retirement.
When private R2 is selected, explicit user deletion tombstones the record first, collects every
version and thumbnail asset ID, rechecks the owner's remaining active Saved Video relationships,
and deletes only unshared stored objects. A failed physical deletion returns a safe storage error;
repeating the delete reuses the tombstoned lineage and retries cleanup. This does not add automatic
orphan collection, backup expiry, legal-hold, or account deletion. Retired Guided compatibility
code is removed and those records are not imported. Project output relations retain their exact
Version bytes and owner-checked Project content access even after the logical Saved Video disappears
from the global gallery; they do not restore it to that gallery.
