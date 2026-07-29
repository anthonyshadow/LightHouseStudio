# Virtual try-on session

## User story

As a creator, I want to preview a Lucy VTON 3 garment transformation, so that I can record a virtual try-on from a consciously prepared garment recipe.

## Starting state

- AI video is configured (not health-checked) and no media, recording, or reviewed take is active.
- The creator has a garment description, a valid JPEG/PNG/WebP garment image no larger than 10 MiB, or both.

## End-to-end steps

1. Optionally prepare a garment recipe in the Recipe Dock or choose one from the Recipe Shelf.
2. Select **Start Camera + Mic**, grant permission, and confirm a healthy local preview.
3. Select **Start AI**, then choose the secondary **Virtual Try-On Beta** experience. Character
   Transformation remains the visually primary path.
4. If the current VTON draft is ready, review the inline Decart transfer/usage/300-second/Stop
   disclosure and select **Start Virtual Try-On**. Otherwise select **Configure Virtual Try-On** to
   open the Dock, or **Choose Saved Try-On** to use the Shelf.
5. In **Try-On recipe**, read the **Virtual Try-On beta guidance**, then provide a garment
   direction, attach a temporary garment image, or both. Use one garment on a plain background.
   The app makes no fit, sizing, fabric-behavior, or purchase-accuracy claim. Prompt enhancement is
   optional and off by default. Start stays unavailable until text or an image exists.
6. Start the configured experience and wait through short-lived credential issuance and the provider connection.
7. Confirm that live transformed video is present on stage. Before a usable transformed video
   track exists, recording stays unavailable and local fallback is retained. After connection, the
   stage shows the authoritative **5:00 maximum** and elapsed/remaining time.
8. Update garment text, image, or enhancement as needed. Select **Apply changes** to commit the complete draft, or **Revert draft** to restore the current applied snapshot.
9. Use **Change**, **Stop AI**, or Dock **Reset AI** deliberately. To capture the result, select
   **Record**, then **Stop recording**, and complete take review. Recording announces its own final
   30 seconds at 4:30 and auto-finalizes at 5:00 independently of the Decart session clock.
10. At 30 seconds remaining, read the accessible **AI session ending soon** warning. Expected
    completion preserves the current garment recipe and local preview; an active take finalizes
    before provider/local resources release.

The Dock remains an alternate direct path: select **Virtual Try-On · VTON 3**,
optionally **Check camera & mic**, and choose **Start Virtual Try-On AI** after
the draft is valid. The implementation model ID remains `lucy-vton-3`.

## Failure and alternate paths

- Invalid/oversized images are rejected before provider start; use another supported file.
- Empty recipe input disables Start before camera access and token issuance.
- Clearing a manual image revokes its ephemeral browser preview; it is not stored in Recipe Shelf.
- If provider video fails, ends, or disconnects, return to the local preview and retry/stop deliberately.
- An expected maximum-duration completion is shown as completion, not as a provider crash. An early
  generation end remains a distinct safe recovery state.
- If the recording cap and provider/source completion coincide, Stop coalesces and the take
  finalizes once before AI/local resources release.

## Completion criteria

The creator has a live `lucy-vton-3` session with a deliberate applied recipe, a finalized take, or an intentionally stopped/reset session.

## UX investigation cues

- Whether creators understand the distinction between text direction, garment reference, and optional enhancement.
- Whether they understand why the Start button is disabled before they try to use it.
- Time and uncertainty between submitting the recipe and seeing recordable transformed video.
