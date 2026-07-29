# Character AI session

## User story

As a creator, I want to turn my live camera into a Lucy 2.5 character performance, so that I can preview, refine, and record a deliberate AI transformation.

## Starting state

- The capability strip reports AI video configured; this is not a live health, entitlement, or
  quota check.
- No local preview, AI session, recording, or take review is active.
- The creator has a saved/selected character, or is ready to create or choose one.

## End-to-end steps

1. Use the header character selector to choose a saved character, or choose **Create new character** and save one. The selected name appears in the header.
2. Select **Start Camera + Mic**, grant permission, and confirm a healthy local preview.
3. Select **Start AI**. **Character Transformation** is the primary choice; **Virtual Try-On
   Beta** remains secondary. If provider configuration is still loading or unavailable, the
   chooser explains the recovery boundary and does not offer a start action.
4. If the selected character is ready, review the inline Decart disclosure and choose **Start with
   [character name]**. Otherwise choose **Create Character** or **Choose Saved Character**; the
   latter opens the existing Shelf directly on **Characters**, then complete **Use** and return to
   Start.
5. Wait while the app validates the loaded recipe, requests a short-lived loopback credential, and connects a Decart session using cloned local input tracks.
6. Continue watching the local fallback until the stage displays transformed video and **AI live**.
   Once the healthy connection commits, the stage shows the authoritative **5:00 maximum** with
   elapsed/remaining time. The local preview remains the recovery source if transformed video is
   missing or ends.
7. Open the Recipe Dock to refine the recipe. The Dock displays **Changes are pending**; no live state changes yet.
8. Select **Apply changes** to send prompt, image (or explicit image clear), and enhancement setting as one snapshot. Or select **Revert draft** to restore the last applied snapshot.
9. Use **Change** to return to experience choice, **Stop AI** to release the provider while retaining local media and the draft, or **Reset AI** in the Dock to clear prompt, ephemeral image, and applied state.
10. To capture transformed video, select **Record**, then **Stop recording**, and follow [Take
    review and cleanup](07-take-review-and-cleanup.md). Recording announces its own final 30 seconds
    at 4:30 and auto-finalizes at 5:00 independently of the Decart session clock.
11. At 30 seconds remaining, read the accessible **AI session ending soon** warning. Expected
    completion returns to local preview with the current recipe intact. If a take is active, Studio
    finalizes it before releasing AI/local resources and opens recorded playback.

For direct recipe work, the Dock remains an alternate entry: select **Character ·
Lucy 2.5**, enter prompt/image/enhancement, optionally **Check camera & mic**,
then select **Start Character AI**. Empty input blocks before camera or token
work. The Dock uses the same disclosure: live camera/microphone media, the complete applied recipe,
and any reference go to Decart; provider usage may begin for at most 300 seconds, and **Stop AI**
ends usage after any active recording finalizes.

## Failure and alternate paths

- Connection start can be cancelled before it completes.
- On disconnect, unusable video, or audio-only output, the stage announces **AI disconnected — local fallback** and retains local preview rather than becoming blank.
- Known Decart authentication/model/network/provider classes show app-owned recovery guidance.
  Unknown SDK errors use one generic retry/reset path. Raw provider codes, messages, data, URLs,
  and causes are never shown.
- An early generation end is reported separately from the expected five-minute completion; raw
  provider reasons/codes are never shown.
- If the recording cap and provider/source completion coincide, Stop coalesces and the take
  finalizes once before AI/local resources release.
- A ready local preview remains reusable across mode and recipe changes. Mode, capture-source, and cross-model changes lock while AI is starting/live, during recording, or while a take is under review.

## Completion criteria

The creator has a live applied Character AI recipe, a stopped/reset session, or a finalized model take. Starting AI is the explicit boundary that sends live camera media plus the complete applied recipe to Decart.

## UX investigation cues

- Number of steps from a blank character mode to first usable transformed video.
- Comprehension of “working draft,” “pending,” “applied,” “revert,” and “reset.”
- Whether fallback/reconnect information provides enough confidence to continue recording.
