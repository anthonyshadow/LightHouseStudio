# Save and reuse videos

## Story

As the authenticated operator, I can save a finalized video, browse lightweight gallery records,
download only from that gallery, and load a chosen version into the existing Studio stage.

## Observable behavior

1. A healthy review artifact exposes **Save Video**, never a direct Download action. Saving is
   explicit, reports progress/result, and repeated submission of the same artifact is idempotent.
   Release remains disabled until the current artifact is saved.
2. **Save as New Video** creates a titled gallery record and immutable first version. **Replace
   Existing Video** is secondary, requires confirmation, checks the expected current version, and
   appends bytes rather than overwriting history.
3. `/studio/videos` reuses the mounted `StudioApp` and persistent `MediaStage`. The gallery first
   loads filtered/sorted metadata in cursor pages; it does not eagerly load video bytes. The
   default order is Latest, with Oldest, Shortest, and Longest alternatives.
4. The gallery can show only videos attributed to a chosen saved character and/or the chosen
   current-version format: Landscape, Portrait, or Square. Available character and format facets
   cover the full owner library rather than only the current page. Older saved versions without
   character attribution remain available under All characters.
5. Cards show safe title, time, duration, dimensions, format, optional character attribution,
   origin, version count, and a lazy optional thumbnail. Missing or failed thumbnail generation
   renders a placeholder and does not fail Save.
6. Activating a ready thumbnail explicitly fetches owner-checked bytes into a centered video
   preview over a darkened gallery. The dialog traps focus, closes with Escape, returns focus to the
   thumbnail, and detaches its player source when closed; it owns no tracks, object URL, recorder,
   or provider session.
7. **Use** fetches owner-checked bytes only after selection, validates them through the existing
   source path, and returns to the Studio stage/editor with saved video/version lineage.
8. Rename changes metadata. Delete confirms, tombstones only the chosen record, and removes it from
   the visible gallery. Every video can be deleted independently in any order; retained derived
   records keep their historical source lineage even when that source record is deleted. With
   private R2 selected, deletion also removes all unshared immutable-version and thumbnail objects.
   Download exists only in Saved Videos and uses an authenticated content response.

## Acceptance checks

- Empty, loading, incremental-load, error, missing-media, thumbnail-fallback, populated, and open
  preview states remain operable at all five canonical viewports with approximately 44px touch
  targets.
- Character/format filters combine, sort applies to the complete filtered result before
  pagination, and an empty match keeps the controls available for recovery. The Neon repository
  performs filtering, ordering, counts, and facets in SQL and fetches version rows only for the
  selected page.
- List/detail responses expose no local path, asset key, provider URL, credential, or raw error.
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
code is removed and those records are not imported.
