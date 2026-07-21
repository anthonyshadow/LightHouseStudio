# Character AI session

## User story

As a creator, I want to turn my live camera into a Lucy 2.5 character performance, so that I can preview, refine, and record a deliberate AI transformation.

## Starting state

- The capability strip reports AI video available.
- No local preview, AI session, recording, or take review is active.
- The creator has either character-direction text, a valid reference image, or both.

## End-to-end steps

1. Open **Dock** and select **Character · Lucy 2.5**. If another dirty model draft has content, respond to the confirmation before replacing it.
2. In **Character recipe**, type a character direction, attach a valid reference image, or use **Open structured prompt workshop** to prepare one. Optionally enable **Prompt enhancement**.
3. Confirm the Start button is enabled. If it is disabled, add a direction or image; the app does not request media or a token until this validation passes.
4. Optional: select **Check camera & mic**. Grant permission and resolve device issues while remaining disconnected from Decart. Use **Release camera & mic** afterward if needed.
5. Select **Start Character AI**. Grant camera/microphone permission if it has not already been granted.
6. Wait while the app obtains healthy local media, requests a short-lived loopback credential, and connects a Decart session using cloned local input tracks.
7. Continue watching the local fallback until the stage displays transformed video and **AI live**. The local preview remains the recovery source if transformed video is missing or ends.
8. Refine the recipe. The Dock displays **Changes are pending**; no live state changes yet.
9. Select **Apply changes** to send prompt, image (or explicit image clear), and enhancement setting as one snapshot. Or select **Revert draft** to restore the last applied snapshot.
10. Choose one ending: **Stop AI** releases the active connection but keeps the draft; **Reset AI** confirms then clears prompt, ephemeral image, and applied state; or record the transformed video and follow [Take review and cleanup](07-take-review-and-cleanup.md).

## Failure and alternate paths

- Connection start can be cancelled before it completes.
- On disconnect, unusable video, or audio-only output, the stage announces **AI disconnected — local fallback** and retains local preview rather than becoming blank.
- Mode, capture-source, and cross-model recipe changes are locked while local/AI media is active or a take is in review.

## Completion criteria

The creator has a live applied Character AI recipe, a stopped/reset session, or a finalized model take. Starting AI is the explicit boundary that sends live camera media plus the complete applied recipe to Decart.

## UX investigation cues

- Number of steps from a blank character mode to first usable transformed video.
- Comprehension of “working draft,” “pending,” “applied,” “revert,” and “reset.”
- Whether fallback/reconnect information provides enough confidence to continue recording.
