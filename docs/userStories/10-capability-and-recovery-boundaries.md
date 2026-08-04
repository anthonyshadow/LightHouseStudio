# Capability and recovery boundaries

**Outcome:** distinguish local browser support from optional provider configuration and use a named
recovery path without risking a valid artifact.

## Runtime behavior

1. The header reports **Studio available to try**, **Studio limited**, or **Integration status
   unavailable**.
2. Local capture availability comes from browser feature detection. `/api/capabilities` reports
   configured Decart and ElevenLabs paths plus the startup-selected image provider, independent
   optimizer state, and provider-neutral `wardrobe.addOutfitAvailable` state.
3. The capability response does not contact providers or prove health, quota, entitlement,
   retention, billing, or output quality.
4. Missing provider configuration degrades independently:
   - local preparation/capture and supported local voice work remain available without keys;
   - Character/VTO preparation remains available without Decart Start;
   - Builder prompt-only and direct-upload saves remain available without image generation;
   - Wardrobe browsing/use and Change Features remain available when Add Outfit is disabled;
   - Original/local voice choices remain available without ElevenLabs.
5. If the broker check fails, select the stage notice’s **Retry check**. If device access fails,
   select **Capture settings**, resolve browser/device state, then retry Start explicitly.
6. Missing persisted reference bytes offer **Retry** or **Continue without reference** where safe.
   Processing failures retain the original/last valid take.

## Non-negotiable boundaries

- Opening tools, browsing Shelf, editing drafts, or listing devices does not request camera or
  provider work.
- Local Camera never requests Decart credentials or a provider connection.
- Voice browsing starts only from its labeled provider-contact action.
- The image provider is selected once at server startup; failure never falls back to another
  provider or silently resubmits billable work.
- A failed operation never silently replaces a valid reference or take.

## Evidence status

Configuration truth and independent degradation are automated. Live provider capability and the
controlled-pilot physical/browser matrix remain unqualified until the release evidence gate
passes.
