# Virtual try-on session

**Outcome:** deliberately preview and optionally record an advanced live `lucy-vton-latest`
garment transformation. Post-recording Virtual Try On is also available in the primary editor.

## Journey

1. Explicitly start local media from **Record New Video** or Dock **Start local preview**, then
   select **Start AI** and **Virtual Try-On**.
2. If no VTO recipe is ready, open the Dock or choose a saved Try-On recipe. Until an outfit
   recipe has content, the stage control bar keeps local **Record** as its primary action and does
   not present **Start AI**.
3. In **Try-On recipe**, provide garment direction, a temporary JPEG/PNG/WebP image up to 10 MiB,
   or both. Prompt enhancement is optional and off by default.
   In Upload Existing Video, the corresponding batch recipe instead requires exactly one mode:
   saved/recent outfit, reference image, or prompt. Reference mode prefers upload and hides its
   public-HTTPS URL importer until explicitly revealed; enhancement exists only in Prompt mode.
4. Read the one-garment/plain-background guidance and Decart transfer, cost, Stop, and 300-second
   disclosure, then select **Start Virtual Try-On**.
5. Wait for usable transformed video; recording remains unavailable and local fallback stays
   visible until it arrives.
6. Edit text, image, or enhancement, then **Apply changes** as one complete snapshot or **Revert
   draft**.
7. Record if desired. Recording and AI each have independent 4:30 warnings and 5:00 Stop/end paths.
8. Use **Stop AI** to retain local preview and the draft, or **Reset AI** to clear the recipe.

The Dock can start directly after valid input and optional **Check camera & mic**. It always uses
the pinned `lucy-vton-latest` model.

## Guards and recovery

- Empty input blocks Start before camera, token, or provider work.
- Invalid or oversized images are rejected before provider contact. Dock images remain
  tab-ephemeral and are revoked when replaced or cleared.
- Studio makes no fit, sizing, fabric-behavior, or purchase-accuracy claim.
- Upload Existing Video presents controlled-pilot, consent, garment, and accuracy guidance as calm
  disclosure, not a warning alert.
- Expected 300-second completion preserves the recipe and local preview; early end/disconnect is a
  distinct safe recovery state.
- An active take finalizes once before source resources release.

## Evidence status

Image-only start, explicit Apply, fallback, and duration races have deterministic coverage. Live
VTO output, provider maximum-duration, and physical-device evidence remain pilot gates.
