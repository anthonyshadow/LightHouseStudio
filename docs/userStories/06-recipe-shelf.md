# Recipe Shelf

## User story

As a creator, I want to manage reusable prompts and character recipes, so that I can restart familiar work without accounts, cloud projects, or browser-persisted personal media.

## Starting state

- No recording is active. The Shelf may still be opened when a live session blocks insertion into another model.
- The browser may have normal durable local storage, repaired/recovered storage, or a session-only fallback.

## End-to-end steps

1. Select **Shelf** from the tool rail.
2. Use **Recipe model** to choose Character recipes or Try-On recipes. If an inline form is dirty, decide whether to discard its pending changes before changing the model.
3. Choose **Saved**, **Recent**, or (for Character) **Characters**.
4. Type in **Search this mode** to find by title/name, prompt, note, or tag. Optionally filter Saved recipes by tag.
5. To create text from scratch, select **New character recipe** or **New garment recipe**, complete the recipe form, and save it.
6. To preserve a structured character recipe, use the Workshop’s **Save to Recipe Shelf** action; later select **Open workshop** on its card to restore the structured draft.
7. On any card, select **Use** to put its prompt into the relevant working draft. If it has a persisted reference asset, wait while the app validates metadata and hydrates its bytes before committing the recipe.
8. Use **Edit**, **Rename**, or **Delete** to maintain saved cards. Select **Save a copy** on an unlinked recent to preserve it as a saved recipe.
9. Close the Shelf normally to retain unsaved work; use an explicit Cancel/Delete/confirmation path for destructive changes.

## Failure and alternate paths

- Search/filter controls pause while a form is dirty, preventing a filter from unmounting unsaved edits.
- The repository repairs usable data from corrupt/outdated `localStorage` where possible. If storage is unavailable, it continues in **session-only** mode and explains the persistence limit.
- Insertion is blocked during recording, take review, or when live media would cross model boundaries. Browsing and editing remain available.
- A missing generated asset pauses the handoff with **Retry** and **Continue without reference** instead of silently substituting a text-only recipe.

## Completion criteria

The recipe is safely saved, edited, deleted, or inserted into the appropriate working draft. Stored browser data contains allowlisted metadata and opaque reference IDs only—never image bytes, recordings, device IDs, or provider secrets.

## UX investigation cues

- Discoverability of the three content categories and the distinction between a recent, saved text recipe, and saved structured character recipe.
- Whether card-level actions make persistence/deletion consequences clear.
- How often cross-model/live-media locks interrupt expected reuse.
