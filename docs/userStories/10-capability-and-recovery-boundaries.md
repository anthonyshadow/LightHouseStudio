# Capability and recovery boundaries

**Outcome:** distinguish local browser support from optional provider configuration and use a named
recovery path without risking a valid artifact.

## Runtime behavior

1. The header reports **Studio available to try**, **Studio limited**, or **Integration status
   unavailable**. Its expanded integration details remain above the Studio workspace and reachable
   at every canonical viewport. The integration and account popovers are mutually exclusive;
   outside pointer and Escape dismiss the active popover, and Escape restores its trigger focus.
2. Local capture availability comes from browser feature detection. `/api/capabilities` reports
   configured Decart and ElevenLabs paths plus the startup-selected image provider, independent
   optimizer state, and provider-neutral `wardrobe.addOutfitAvailable` state.
3. The capability response does not contact providers or prove health, quota, entitlement,
   retention, billing, or output quality.
4. Missing provider configuration degrades independently:
   - local preparation/capture, supported local video editing, and local voice work remain
     available without keys;
   - Character/VTO preparation remains available without Decart Start;
   - Builder prompt-only and direct-upload saves remain available without image generation;
   - Wardrobe browsing/use and Change Features remain available when Add Outfit is disabled;
   - Original/local voice choices remain available without ElevenLabs.
5. If the broker check fails, select the stage notice’s **Retry check**. If device access fails,
   select **Capture settings**, resolve browser/device state, then retry Start explicitly.
6. Missing persisted reference bytes offer **Retry** or **Continue without reference** where safe.
   Processing failures retain the original/last valid take.
7. Missing WebGL, dedicated workers, OffscreenCanvas, or worker WebCodecs exposes an actionable
   local-editor unsupported state. Studio does not attempt expensive synchronous processing;
   ordinary playback, download, Voice, and configured visual workflows remain available.

## Non-negotiable boundaries

- Opening tools, browsing Shelf, editing drafts, or listing devices does not request camera or
  provider work.
- Local Camera never requests Decart credentials or a provider connection.
- Voice browsing starts only from its labeled provider-contact action.
- The image provider is selected once at server startup; failure never falls back to another
  provider or silently resubmits billable work.
- A failed operation never silently replaces a valid reference or take.
- Dirty local edits warn on unload. An active render is cancelled explicitly before discard; stale
  worker generations cannot publish after cancellation or source change.

## Evidence status

Configuration truth and independent degradation are automated. Live provider capability and
physical/browser behavior require the separate live and manual procedures.
