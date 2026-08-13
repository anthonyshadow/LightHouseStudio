# Recipe Shelf

**Outcome:** save, find, maintain, and reuse Character or Try-On recipes without creating a Project
or contacting a provider. The recipes remain owner-scoped browser records and may revision-sync to
authoritative persistence when configured.

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
   detaches links. Authoritative Neon/R2 then deletes only image assets with no remaining saved
   relationship; local mode retains detached immutable bytes.
7. A saved-character card or the active-character control opens **Wardrobe**. The wide right panel
   becomes fullscreen on narrow viewports, labels the original first, and searches an internally
   scrolling grid of original/variant versions. **Use** hydrates the exact image before recording
   parent/variant usage and persisting that character's selected version. Saving a new variant does
   not select it.
8. **Add Outfit** uses the selected original/variant as the person source plus one shared
   upload/public-HTTPS garment input or one image-backed saved outfit. Prompt-only saved outfits
   remain available to the video editor but are not garment-image choices. Only explicit
   Generate/Regenerate contacts the independently
   configured Pruna try-on path. **Change Features** shows the exact source and sends required
   changes through the configured reference-image edit provider with optimization disabled. The
   parent prompt accompanies Original-source edits only; variant-source edits send the selected
   image without the parent prompt. Requested feature changes override conflicting source or
   parent-prompt traits and must all be visible; when no degree is specified, each change is strong,
   obvious, and realistic while non-conflicting traits preserve character continuity. Both show a
   preview, require a non-empty title, reject stale results, and save only the latest valid result
   under the original parent character.
9. **Attach default voice** opens the existing Saved/Browse Voice library only after that explicit
   action. Selecting a saved voice persists its opaque ID and display name on the character;
   **Remove default voice** returns it to no default without removing the saved-voice relationship.

## Guards and recovery

- Dirty inline forms block search/filter/model/category changes until saved, cancelled, or
  explicitly discarded.
- Browsing and editing remain available when insertion is locked. Insertion is blocked by
  recording/take review and by incompatible cross-model changes during active AI.
- Missing reference bytes pause Use with **Retry**. **Continue without reference** appears only
  when a usable prompt remains; image-only outfits offer Retry or removal.
- Valid v1-v6 data migrates to Recipe Shelf v7. V4 VTO records with references become saved-image
  outfits, other VTO records become prompt outfits, enhancement defaults false, and Character
  records use a null VTO kind/false enhancement. Older characters receive an empty Wardrobe with
  the original selected. Dangling/cross-parent/malformed selections are repaired and Wardrobe
  metadata is capped at 500 records. V6 characters gain a null default voice.
- If IndexedDB is unavailable, the Shelf continues in session-only mode and says changes will
  be lost when the tab closes.
- IndexedDB contains allowlisted metadata, provenance, and opaque reference IDs—not video blobs,
  recordings, device IDs, or provider secrets. Large media remains in the File System Access or R2
  path.
- Wardrobe browsing and Use remain available when Add Outfit or Change Features is unavailable.
  Prompt-only originals remain usable, while creation is disabled with Character Builder guidance.
- Dirty Wardrobe source/input/result/title state and active generation join the existing
  discard/route-exit guard. Cancel writes no variant metadata and requests cleanup for its staged
  upload/result. Authoritative Neon/R2 deletes only after the saved-relationship check; local mode
  keeps its conservative retention policy.
- In browser fullscreen, the video fills the viewport and the bottom tool and capture rails are
  hidden. Any panel triggered from the stage overlays the video.
- Project selection uses this same owner-scoped repository and hydration path; Project does not
  copy Shelf records or become their persistence/cleanup owner. An explicit Project checkpoint
  retains only stable IDs and the exact applied labels/revisions/prompt/reference/settings needed
  to explain history. A missing, tombstoned, wrong-owner, or changed record is reported generically
  with its historical label and **Choose another**, without revealing cross-owner existence or
  failing the Project source.
