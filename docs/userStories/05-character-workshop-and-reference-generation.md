# Structured prompt workshop

## User story

As a creator, I want to compose one focused object edit, so that I can prepare a clear Lucy 2.5 Add, Replace, or Restyle direction without starting camera media.

Character creation, character editing, character reference upload, and character reference generation are owned exclusively by Character Builder. They are not Workshop intents.

## Starting state

- Prompt Workshop is available because no recording is active and the current media state permits Character mode.
- Workshop drafting is local and requires no provider or image-generation capability.

## End-to-end steps

1. Select **Workshop** from the tool rail, or open a legacy structured object-edit record from Recipe Shelf.
2. Select **Add one object**, **Replace one object**, or **Restyle one object**. Each intent retains its own in-tab draft while switching.
3. Define the visible target/change and optional guardrails.
4. Expand **Generated recipe summary** and resolve blocking feedback.
5. Select **Use in working draft** to atomically hand the complete text recipe to Lucy 2.5.
6. Optionally select **Save to Recipe Shelf**, name the recipe, and save its normalized text and structured object-edit draft.

## Failure and alternate paths

- Required-field errors block Use and Save without changing the Studio draft.
- Reset warns only when the current intent has content and never clears another intent.
- Ordinary close preserves the three Workshop drafts for the current tab.
- Historical `SavedCharacterPrompt` records whose structured intent is Add, Replace, or Restyle remain Workshop-owned for compatibility. A true character record never exposes **Open workshop**.

## Completion criteria

The creator has a validated Add, Replace, or Restyle recipe in the Lucy 2.5 working draft or Recipe Shelf. No character reference, optimizer request, image generation, camera, token, or provider session was started by Workshop.
