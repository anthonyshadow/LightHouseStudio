# Save and reuse videos

## Story

As the authenticated operator, I can save a finalized video separately from downloading it,
browse lightweight gallery records, and load a chosen version into the existing Studio stage.

## Observable behavior

1. A healthy review artifact exposes distinct **Download** and **Save Video** actions. Saving is
   explicit, reports progress/result, and repeated submission of the same artifact is idempotent.
2. **Save as New Video** creates a titled gallery record and immutable first version. **Replace
   Existing Video** is secondary, requires confirmation, checks the expected current version, and
   appends bytes rather than overwriting history.
3. `/studio/videos` reuses the mounted `StudioApp` and persistent `MediaStage`. The gallery first
   loads metadata in newest-first cursor pages; it does not eagerly load video bytes.
4. Cards show safe title, time, duration, dimensions, origin, version count, and a lazy optional
   thumbnail. Missing or failed thumbnail generation renders a placeholder and does not fail Save.
5. **Use** fetches owner-checked bytes only after selection, validates them through the existing
   source path, and returns to the Studio stage/editor with saved video/version lineage.
6. Rename changes metadata. Delete confirms, enforces source dependencies, tombstones the record,
   and removes it from the visible gallery. Download uses an authenticated content response.

## Acceptance checks

- Empty, loading, incremental-load, error, missing-media, thumbnail-fallback, and populated states
  remain operable at all five canonical viewports with approximately 44px touch targets.
- List/detail responses expose no local path, asset key, provider URL, credential, or raw error.
- Wrong-owner and missing records use safe non-enumerating responses. Content supports controlled
  range delivery without reading the full file into application memory.

## Retention

Logical delete does not physically erase unreferenced video or thumbnail bytes in Phase 1. They
remain retained until Phase 2 provides a reviewed relationship-safe reconciliation policy.
Retired Guided videos are intentionally cleared at Studio initialization and are not imported.
