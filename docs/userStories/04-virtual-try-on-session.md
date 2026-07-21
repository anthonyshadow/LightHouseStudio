# Virtual try-on session

## User story

As a creator, I want to preview a Lucy VTON 3 garment transformation, so that I can record a virtual try-on from a consciously prepared garment recipe.

## Starting state

- AI video is available and no media, recording, or reviewed take is active.
- The creator has a garment description, a valid JPEG/PNG/WebP garment image no larger than 10 MiB, or both.

## End-to-end steps

1. Open **Dock** and select **Virtual Try-On · Lucy VTON 3**. Confirm discarding/replacing a dirty prior draft when prompted.
2. In **Try-On recipe**, type a garment direction such as the replacement garment and visible qualities.
3. Optionally attach a garment reference image. Verify the temporary preview appears; use **Clear image** to remove it before starting.
4. Decide whether to enable **Prompt enhancement**. It is off by default and only changes the applied Decart prompt after an explicit Apply/Start.
5. Optional: select **Check camera & mic** to solve permission/device issues before contacting Decart.
6. Select **Start Virtual Try-On AI**. The start control remains unavailable until a direction or reference image exists.
7. Grant browser media access if needed, then wait through local acquisition, short-lived credential issuance, and the provider connection.
8. Confirm that live transformed video is present on stage. Before a usable transformed video track exists, recording stays unavailable and local fallback is retained.
9. Update garment text, image, or enhancement as needed. Select **Apply changes** to commit the complete draft, or **Revert draft** to restore the current applied snapshot.
10. Stop/reset the AI session or record the transformed output, then complete take review.

## Failure and alternate paths

- Invalid/oversized images are rejected before provider start; use another supported file.
- Empty recipe input disables Start before camera access and token issuance.
- Clearing a manual image revokes its ephemeral browser preview; it is not stored in Recipe Shelf.
- If provider video fails, ends, or disconnects, return to the local preview and retry/stop deliberately.

## Completion criteria

The creator has a live `lucy-vton-3` session with a deliberate applied recipe, a finalized take, or an intentionally stopped/reset session.

## UX investigation cues

- Whether creators understand the distinction between text direction, garment reference, and optional enhancement.
- Whether they understand why the Start button is disabled before they try to use it.
- Time and uncertainty between submitting the recipe and seeing recordable transformed video.
