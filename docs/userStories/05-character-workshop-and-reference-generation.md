# Character workshop and reference generation

## User story

As a creator, I want to compose a complete character recipe and optionally create a durable character reference, so that I can reuse a consistent Lucy 2.5 look without first starting camera media.

## Starting state

- The Character Workshop is available because no recording is active and the current media state permits Character mode.
- OpenAI reference capability is optional; workshop drafting itself always works locally.

## End-to-end steps

1. Select **Workshop** from the tool rail, or open it from Character recipe fields.
2. Select the intent: **Character transform**, **Add object**, **Replace object**, or **Change attribute**. Each intent retains its own draft while switching.
3. For Character transform, work through the accordion: optional preset; character concept; adult age and optional gender direction; appearance/hair; outfit/accessories; expression/mood; details to preserve; optional constraint. For the other intents, define the target/change and optional guardrails.
4. Expand **Generated recipe summary** and read the generated plain-language prompt. Resolve blocking feedback before continuing.
5. To apply text only, select **Use in working draft**. The workshop closes after the complete recipe is handed to Character mode.
6. To retain it, select **Save to Recipe Shelf**, enter a recipe name, and select **Save recipe**. This preserves text, structured choices, and an opaque reference relationship—not manual image bytes.
7. To make a durable reference for Character transform, use **Character reference image** settings: framing, orientation, rendering style, expression, and background. If choosing custom background, provide the required plain description.
8. Review the default-on **Optimize prompt with GPT** choice. With it on, select **Optimize prompt** or directly select **Generate reference image**; direct generate first optimizes stale/current input when needed.
9. Review the editable optimized image prompt and the read-only Lucy 2.5 character prompt. Edit the image prompt if desired, then select **Generate reference image**.
10. Wait for the generated local immutable asset. Confirm the preview is attached; select **Regenerate** for a new explicit request or **Detach** to remove its relationship from the current workshop.
11. Select **Use in working draft**. The app hydrates the asset, uses its stored Lucy character prompt, attaches the image, and enables enhancement atomically for Character AI.

## Failure and alternate paths

- Prompt changes, reference settings, optimizer model/version, or toggling optimization make prior results stale. Regenerate rather than assuming the preview matches.
- Optimization errors block generated-reference creation; no silent raw-prompt fallback occurs while optimization is enabled.
- Reference-generation errors are categorized for moderation, quota/rate limit, configuration, timeout, invalid image, storage, or concurrent generation.
- If a saved generated asset cannot be restored later, select **Retry** or choose **Continue without reference** deliberately.

## Completion criteria

The creator has a validated text recipe in the working draft or Shelf, and optionally an owner-scoped immutable reference asset attached to Character mode.

## UX investigation cues

- Steps and choices from idea → usable prompt → generated reference.
- Comprehension of the two prompt outputs and which one is editable/sent to which provider.
- Whether stale state, attachment, regeneration, and detachment are sufficiently visible.
