# Configure capture settings

**Outcome:** choose session-only camera, microphone, and local quality preferences without starting
media or contacting a provider.

## Journey

1. Open **Device settings** (**Open capture settings**).
2. Wait for device discovery or select **Refresh**. Listing devices does not request permission;
   labels may stay generic until a later explicit camera start.
3. Choose a camera and microphone. In Local Camera, also choose `720p · 30 fps` or, when supported,
   `1080p · 30 fps`; AI modes use provider-required dimensions.
4. Select **Apply settings**. With no preview, the choices apply to the next Start. During a ready
   local preview, Studio commits a healthy replacement before releasing the old stream.
5. Confirm the negotiated sources and resolution under **Active capture**.

The list refreshes on `devicechange` and after a successful Start. Studio never auto-selects a
newly attached phone. During an eligible local preview, the stage exposes **Switch camera** only
for browser-reported front/rear modes and hardware zoom only when the track reports zoom support.

## Guards and recovery

- **Discard** restores the last applied preferences without changing live media.
- If a selected device disappears, Studio retains the choice, explains that the browser default
  will be used, and allows reselection after reconnection.
- A failed live replacement leaves the current preview active and reports **Settings unchanged**.
- Settings are disabled during AI start/live, recording/finalization, and take review.
- Preferences are in-memory for the tab; device IDs are not written to Recipe Shelf storage.

## Evidence status

Atomic replacement, post-permission refresh, unavailable-device fallback, front/rear switching,
and zoom gating have automated coverage. Physical camera discovery and controls remain part of the
[pilot qualification gate](../PILOT_QUALIFICATION_EVIDENCE.md).
