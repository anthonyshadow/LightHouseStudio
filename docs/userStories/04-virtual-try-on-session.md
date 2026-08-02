# Virtual try-on session

**Outcome:** deliberately preview and optionally record an advanced live `lucy-vton-latest`
garment transformation. Post-recording Virtual Try On is also available in the primary editor.

## Journey

1. Prepare an outfit before starting media. On desktop, **Select Outfit** appears after **Select
   Character** and immediately before **Workshop** in the creative-tool rail. On phones and
   tablets, header **Select AI** opens a provider-free chooser and **Virtual Try-On** routes to the
   same Outfit panel.
2. The Outfit panel has **Saved** and **Recent** views plus **Create new outfit**. Successful live
   Start/Apply uses appear in Recent; saved prompt and explicitly saved-image uses are persistent,
   while direct upload/import files remain bounded tab-only recents.
3. Outfit Builder creates one exclusive mode: a garment direction up to 1,200 characters with a
   remembered Enhance Prompt setting, or a validated JPEG/PNG/WebP reference selected by picker,
   drop, or explicit public-HTTPS import. Final Save requires an 80-character-or-shorter name.
   **Save & Select** stores metadata and any final image through the idempotent local upload path,
   selects the outfit, and does not start media or contact Decart or an image provider.
4. Until an outfit recipe has content, the stage control bar keeps local **Record** as its primary
   action and does not present **Start AI**. Once prepared, explicitly start local media from
   **Record New Video** or Dock **Start local preview**, then select **Start AI** and **Virtual
   Try-On**.
5. The Dock's advanced **Try-On recipe** continues to accept garment direction, a temporary
   JPEG/PNG/WebP image up to 10 MiB, or both. Prompt enhancement is optional and off by default.
   In **Use existing video**, the corresponding batch recipe instead requires exactly one mode:
   saved/recent outfit, reference image, or prompt. Reference mode prefers upload and hides its
   public-HTTPS URL importer until explicitly revealed; enhancement exists only in Prompt mode.
6. Read the one-garment/plain-background guidance and Decart transfer, cost, Stop, and 300-second
   disclosure, then select **Start Virtual Try-On**.
7. Wait for usable transformed video; recording remains unavailable and local fallback stays
   visible until it arrives.
8. Edit text, image, or enhancement, then **Apply changes** as one complete snapshot or **Revert
   draft**.
9. Record if desired. Recording and AI each have independent 4:30 warnings and 5:00 Stop/end paths.
10. Use **Stop AI** to retain local preview and the draft, or **Reset AI** to clear the recipe.

The Dock can start directly after valid input and optional **Check camera & mic**. It always uses
the pinned `lucy-vton-latest` model.

## Guards and recovery

- Empty input blocks Start before camera, token, or provider work.
- Invalid or oversized images are rejected before provider contact. Dock images remain
  tab-ephemeral and are revoked when replaced or cleared.
- A missing persisted image offers Retry. Continue without reference appears only when a migrated
  combined outfit still has a usable prompt; image-only outfits offer Retry or removal.
- Studio makes no fit, sizing, fabric-behavior, or purchase-accuracy claim.
- **Use existing video** presents consent, garment, and accuracy guidance contextually as calm
  disclosure, without overemphasizing pilot status or presenting it as a warning alert.
- Expected 300-second completion preserves the recipe and local preview; early end/disconnect is a
  distinct safe recovery state.
- An active take finalizes once before source resources release.

## Evidence status

Image-only start, explicit Apply, fallback, and duration races have deterministic coverage. Live
VTO output, provider maximum-duration, and physical-device evidence remain pilot gates.
