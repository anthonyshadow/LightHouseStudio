# Save and reuse Videos in Assets

## Story

As the authenticated operator, I can save a finalized video, browse lightweight gallery records,
select and download an exact immutable Version, and load the current Version into the existing
Studio stage.

## Observable behavior

1. A healthy review artifact exposes **Save to Assets**, never a direct Download action. Saving first
   prompts for an optional video name; a blank field keeps the existing generated artifact name.
   Saving is explicit, reports progress/result, and repeated submission of the same artifact is
   idempotent. Release remains disabled until the current artifact is saved.
2. **Save as New Video** creates a titled gallery record and immutable first version. In the
   standalone workflow, **Replace Existing Video** is secondary, requires confirmation, checks the
   expected current version, and appends bytes rather than overwriting history. In a Project,
   **Add Version** is a separate explicit target selection and confirmation; it is never inferred
   from a Saved Video Version reused as source.
   In authoritative Neon/private-R2 mode, the authenticated API stages the save and the browser
   transfers multipart bytes directly to R2; the result is not visible until the API verifies and
   attaches it. Local and shadow modes retain their existing API-mediated upload behavior.
3. `/assets/videos` reuses the mounted `StudioApp` and persistent `MediaStage`; the Assets
   view hides the stage without unmounting its owner. The gallery first loads filtered/sorted
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
   origin, version count, and a lazy optional thumbnail. Missing or failed thumbnail generation
   renders a placeholder and does not fail Save.
6. Activating a ready thumbnail explicitly fetches owner-checked bytes into a centered video
   preview over a darkened gallery. The dialog traps focus, closes with Escape, returns focus to the
   thumbnail, and detaches its player source when closed; it owns no tracks, object URL, recorder,
   or provider session. The dialog lists immutable Versions with ordinal, current marker, origin,
   timestamp, media facts, and status. Selecting an older Version previews and downloads that exact
   content without changing the Saved Video current pointer.
7. **Open in Studio** navigates to `/studio/:videoId`, fetches owner-checked metadata and only the
   current Version bytes, enforces the 300 MB bound, and opens the existing review workspace.
   Direct entry, refresh, and pasted URLs work without navigation state; **Adjust video** remains
   an explicit action from review rather than opening the editor automatically.
   **Add to Project** links the exact ready Version to a selected empty same-owner Project through
   the existing source-acceptance contract; the Video remains reusable and no bytes are copied.
   Separately, **Import Saved Video** can add a non-owning Project Asset membership without
   replacing that Project's immutable source.
8. Rename changes metadata. **Remove from Assets** confirms, tombstones only the chosen record, and
   removes it from the visible gallery. Every video can be removed independently in any order; retained derived
   records keep their historical source lineage even when that source record is deleted. With
   private R2 selected, deletion removes only immutable-version and thumbnail objects that no
   Project output still retains. A tombstoned global record stays hidden, while an exact
   same-owner Project-retained Version remains available through Project-scoped content.
   Download is available for the selected exact ready Version through an authenticated content
   response. Project history may also download an exact Project-retained Version.
9. A legacy or independently saved record with no trustworthy Project output relation is labeled
   **Unassigned Content**, remains fully usable, and receives no fabricated producer. Later source
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
