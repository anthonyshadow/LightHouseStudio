# ElevenLabs voice workflow

**Outcome:** preview and apply a voice already saved in the configured ElevenLabs library without
ever uploading video or replacing the immutable original on failure.

## Runtime journey

1. Open **Voice** in the existing-video editor or **Voice treatments** in Latest Take for a source
   with a usable sidecar, browser audio replacement, and a duration no greater than five minutes.
   A confirmed local video edit supplies a newly extracted sidecar from its validated H.264/AAC
   candidate before this action becomes available.
2. Select **Saved AI Voice** in the shared Voice workspace. The saved library replaces the treatment
   detail pane instead of opening a nested dialog. Loading remains lazy: opening Voice treatments
   alone does not fetch voices.
3. Search, page, refresh, and preview saved-library voices. One dedicated player owns the active
   provider sample, and replacing it aborts/releases the prior preview. Preview contacts
   ElevenLabs but does not upload the take.
4. Select a voice separately from previewing it. Search and selection state remain available when
   moving between the treatment and library panes. The confirmation area states the exact clip
   duration, configured model, possible credit use, and zero-retention requirement.
5. From Latest Take, select **Apply treatment**. Studio revalidates saved-library membership and
   model support, then sends only the immutable original audio sidecar through the same-origin
   broker. In the existing-video editor, **Use this voice for the edit** only updates the captured
   plan; conversion waits for the outer **Start edit** action.
6. On success, Studio remuxes the converted audio with local video. Return to treatments or Take
   Review to download, release, or discard.

## Guards and recovery

- Studio exposes no public-library discovery or add/import action. Manage membership in
  ElevenLabs, then refresh Studio.
- Every provider-backed list, preview, and conversion request requires the app-owned voice-intent
  header.
- Stale/removed or policy-ineligible voices are rejected; safe guidance is shown without raw
  provider data.
- Preview output is capped at 2 MiB and conversion output at 8 MiB. Empty, malformed, oversized,
  endless, or cancelled output cannot replace the take.
- Cancel, error, or **Original** preserves/restores the immutable capture.
- Edited 1:1, 4:5, or incompatible Freeform sources remain eligible when their sidecar is valid
  even though Character Swap and Virtual Try On are disabled.

## Controlled-pilot boundary

Configuration availability is not an entitlement or retention check. Participant conversion
remains prohibited unless zero-retention eligibility is confirmed; otherwise only operator
qualification may exercise the provider path. The synthetic saved-library journey is automated,
but live entitlement, retention, output quality, billing, codecs, and physical playback still
require gated evidence.
