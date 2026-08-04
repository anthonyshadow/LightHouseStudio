# Recipe Shelf

**Outcome:** save, find, maintain, and reuse Character or Try-On recipes without accounts or cloud
projects.

## Journey

1. Select **Shelf**. The bottom Shelf uses up to 75% of the viewport on larger screens so its
   library results remain visible; narrow screens use the established fullscreen overlay.
   Character-selection entries open the same Shelf directly on **Characters**.
2. Choose **Character recipes** or **Try-On recipes** in the Shelf header, then **Saved**,
   **Recent**, or Character-only **Characters**.
3. Search by name/title, prompt, note, or tag; Saved and Characters also support tag filtering.
   The tag filter uses the shared custom chooser, remaining anchored on larger viewports and
   becoming a safe-area-aware touch sheet on phones without changing the Shelf scroll owner.
4. **New character recipe** and true-character **Edit** open Character Builder. New, Edit, and
   **Save a copy** Try-On actions open Outfit Builder; legacy Add/Replace/Restyle records open
   Workshop. Outfit edits update the existing ID, while Save a copy creates a new ID.
5. Select **Use**. A text recipe commits immediately; an image-backed recipe first validates and
   hydrates its opaque local asset, then commits the complete draft.
6. Rename, edit, delete, or save a copy as available. Character deletion removes the record and
   detaches links but does not delete immutable image bytes.

## Guards and recovery

- Dirty inline forms block search/filter/model/category changes until saved, cancelled, or
  explicitly discarded.
- Browsing and editing remain available when insertion is locked. Insertion is blocked by
  recording/take review and by incompatible cross-model changes during active AI.
- Missing reference bytes pause Use with **Retry**. **Continue without reference** appears only
  when a usable prompt remains; image-only outfits offer Retry or removal.
- Valid v1-v4 data migrates to Recipe Shelf v5. V4 VTO records with references become saved-image
  outfits, other VTO records become prompt outfits, enhancement defaults false, and Character
  records use a null VTO kind/false enhancement. Corrupt values are sanitized or repaired.
- If `localStorage` is unavailable, the Shelf continues in session-only mode and says changes will
  be lost when the tab closes.
- Browser storage contains allowlisted metadata, provenance, and opaque reference IDs—not image
  bytes, recordings, device IDs, or provider secrets.
- In browser fullscreen, the video fills the viewport and the bottom tool and capture rails are
  hidden. Any panel triggered from the stage overlays the video.
