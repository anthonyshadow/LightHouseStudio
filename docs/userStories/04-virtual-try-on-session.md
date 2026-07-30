# Virtual try-on session

**Outcome:** deliberately preview and optionally record a `lucy-vton-3` garment transformation.
VTO remains a secondary beta.

## Journey

1. Select **Start Camera + Mic**, then **Start AI** and **Virtual Try-On Beta**.
2. If no VTO recipe is ready, open the Dock or choose a saved Try-On recipe.
3. In **Try-On recipe**, provide garment direction, a temporary JPEG/PNG/WebP image up to 10 MiB,
   or both. Prompt enhancement is optional and off by default.
4. Read the one-garment/plain-background guidance and Decart transfer, cost, Stop, and 300-second
   disclosure, then select **Start Virtual Try-On**.
5. Wait for usable transformed video; recording remains unavailable and local fallback stays
   visible until it arrives.
6. Edit text, image, or enhancement, then **Apply changes** as one complete snapshot or **Revert
   draft**.
7. Record if desired. Recording and AI each have independent 4:30 warnings and 5:00 Stop/end paths.
8. Use **Stop AI** to retain local preview and the draft, or **Reset AI** to clear the recipe.

The Dock can start directly after valid input and optional **Check camera & mic**. It always uses
the pinned `lucy-vton-3` model.

## Guards and recovery

- Empty input blocks Start before camera, token, or provider work.
- Invalid or oversized images are rejected before provider contact. Dock images remain
  tab-ephemeral and are revoked when replaced or cleared.
- Studio makes no fit, sizing, fabric-behavior, or purchase-accuracy claim.
- Expected 300-second completion preserves the recipe and local preview; early end/disconnect is a
  distinct safe recovery state.
- An active take finalizes once before source resources release.

## Evidence status

Image-only start, explicit Apply, fallback, and duration races have deterministic coverage. Live
VTO output, provider maximum-duration, and physical-device evidence remain pilot gates.
