# ElevenLabs voice workflow

**Outcome:** browse plan-accessible ElevenLabs voices, manage eligible community copies in Saved
Voices, and preview or apply a saved voice without uploading video or replacing the immutable
original on failure.

## Runtime journey

1. Open **Voice** in the existing-video editor or **Voice treatments** in Latest Take for a source
   with a usable sidecar, browser audio replacement, and a duration no greater than five minutes.
   A confirmed local video edit supplies a newly extracted sidecar from its validated H.264/AAC
   candidate before this action becomes available.
2. Select **Saved AI Voice** in the shared Voice workspace. The library replaces the treatment
   detail pane instead of opening a nested dialog. Loading remains lazy: opening Voice treatments
   alone does not contact ElevenLabs.
3. Use **Saved Voices** to search, filter, page, refresh, preview, and select voices already in the
   configured account. Use **Browse Voices** to discover authenticated catalog voices by text,
   language, gender, age, accent, use case, tone/style, or Trending/Newest/Most used/Most saved.
   Each page contains at most 20 voices and each tab preserves its current criteria and page.
4. Text search begins after three trimmed characters and waits 300 ms. One or two characters keep
   the last settled page visible with a short hint; clearing applies immediately. Superseded
   requests are cancelled and late results cannot replace current results.
5. Preview uses one dedicated player and only the provider sample. **Add to Saved** performs an
   exact fresh eligibility check and becomes **Already saved** after success; duplicate concurrent
   adds coalesce. Browse never shows a custom-rate, separately licensed, or malformed-eligibility
   candidate.
6. Saved community copies expose **Remove** only when provider metadata confirms a bookmark,
   non-ownership, and a shared public owner. Removal requires confirmation and warns that a voice
   withdrawn from the catalog may be unrecoverable. Owned, cloned, workspace, default, legacy,
   non-community, and currently selected voices cannot be removed here.
7. Select a saved voice separately from previewing it. The confirmation area states the exact clip
   duration, configured model, possible credit use, and zero-retention requirement. From Latest
   Take, **Apply treatment** revalidates saved membership and model support before sending only the
   immutable original audio sidecar through the same-origin broker. In the existing-video editor,
   **Use this voice for the edit** only updates the captured plan; conversion waits for the outer
   **Start edit** action.
8. On success, Studio remuxes the converted audio with local video. Return to treatments or Take
   Review to download, release, or discard.

## Eligibility and provider contract

- Shared discovery always sends ElevenLabs `include_custom_rates=false`, then defensively requires
  the exact response fields `rate === 1` and `free_users_allowed === true`. Missing or malformed
  fields fail closed. Authenticated visibility under the configured key is the plan-entitlement
  check; `available_for_tiers` and UI labels are not used.
- Add re-fetches the exact `public_owner_id` and `voice_id`, uses the provider-returned name, and
  requests `bookmarked: true`. Saved membership and per-voice mutation locking make the action
  idempotent.
- Remove re-fetches the exact saved voice before deletion and requires `is_bookmarked === true`,
  `is_owner !== true`, and a shared public owner ID.
- Every list, preview, add, remove, and conversion request requires the app-owned voice-intent
  header. Add and remove also require the trusted loopback Origin/Host boundary.

## Guards and recovery

- A plan/permission rejection shows that Browse Voices is unavailable under the current plan.
- Stale, removed, custom-rate, or policy-ineligible voices are rejected with safe app-owned
  guidance; provider preview URLs, rates, bodies, and raw errors never reach the browser.
- Preview output is capped at 2 MiB and conversion output at 8 MiB. Empty, malformed, oversized,
  endless, or cancelled output cannot replace the take.
- Retry repeats only the safe metadata read. Cancel, error, or **Original** preserves/restores the
  immutable capture.
- Edited 1:1, 4:5, or incompatible Freeform sources remain Voice-eligible when their sidecar is
  valid even when Character Swap and Virtual Try On are disabled.

## Live-provider boundary

Configuration availability is not entitlement, pricing, or retention evidence. Automated tests
use synthetic providers and make no catalog mutation. Live catalog visibility, eligibility,
preview, add, remove, conversion, retention, billing, codecs, and physical playback require the
owner-authorized procedure in [Live provider smoke](../LIVE_PROVIDER_SMOKE.md).
