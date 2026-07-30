# Recipe Shelf

**Outcome:** save, find, maintain, and reuse Character or Try-On recipes without accounts or cloud
projects.

## Journey

1. Select **Shelf**. Character-selection entries open the same Shelf directly on **Characters**.
2. Choose the Character or Try-On model, then **Saved**, **Recent**, or Character-only
   **Characters**.
3. Search by name/title, prompt, note, or tag; Saved and Characters also support tag filtering.
4. **New character recipe** and true-character **Edit** open Character Builder. Generic Try-On
   recipes use the inline editor; legacy Add/Replace/Restyle records open Workshop.
5. Select **Use**. A text recipe commits immediately; an image-backed recipe first validates and
   hydrates its opaque local asset, then commits the complete draft.
6. Rename, edit, delete, or save a copy as available. Character deletion removes the record and
   detaches links but does not delete immutable image bytes.

## Guards and recovery

- Dirty inline forms block search/filter/model/category changes until saved, cancelled, or
  explicitly discarded.
- Browsing and editing remain available when insertion is locked. Insertion is blocked by
  recording/take review and by incompatible cross-model changes during active AI.
- Missing reference bytes pause Use with **Retry** and **Continue without reference**.
- Valid v1-v3 data migrates to Recipe Shelf v4; corrupt values are sanitized or repaired.
- If `localStorage` is unavailable, the Shelf continues in session-only mode and says changes will
  be lost when the tab closes.
- Browser storage contains allowlisted metadata, provenance, and opaque reference IDs—not image
  bytes, recordings, device IDs, or provider secrets.
