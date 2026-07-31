# ElevenLabs voice workflow

**Outcome:** preview and apply a voice already saved in the configured ElevenLabs library without
ever uploading video or replacing the immutable original on failure.

## Runtime journey

1. Open **Voice** in the post-recording editor or **Voice treatments** in Latest Take for a source
   with a usable sidecar, browser audio replacement, and a duration no greater than five minutes.
2. Select **Browse saved voices · contacts ElevenLabs**. Browsing is explicit; opening Voice
   treatments alone does not fetch voices.
3. Search, page, refresh, and preview saved-library voices. Preview contacts ElevenLabs but does
   not upload the take.
4. Select a voice and read the exact clip duration, configured model, possible credit use, and
   zero-retention requirement.
5. Select **Apply [voice] to recorded audio**. Studio revalidates saved-library membership and
   model support, then sends only the immutable original audio sidecar through the same-origin
   broker.
6. On success, Studio remuxes the converted audio with local video. Return to Take Review to
   download, release, or discard.

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

## Controlled-pilot boundary

Configuration availability is not an entitlement or retention check. Participant conversion
remains prohibited unless zero-retention eligibility is confirmed; otherwise only operator
qualification may exercise the provider path. The synthetic saved-library journey is automated,
but live entitlement, retention, output quality, billing, codecs, and physical playback still
require gated evidence.
