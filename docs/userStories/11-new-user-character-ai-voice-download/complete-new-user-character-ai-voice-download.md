# Studio character builder

## Goal

A creator builds and saves a reusable Character AI direction without leaving or remounting Studio. Image generation is optional. A successful save preloads Lucy 2.5 and selects the new character in the Dock and Recipe Shelf, but never starts or applies the provider session automatically.

## Entry and routing

`/` is the sole application route and opens Studio directly. Retired `/advanced` and `/guided` entries history-replace to `/`. Retired `/projects`, `/?project=…`, and `/guided?project=…` entries also canonicalize to `/` and open the Legacy Projects manager. Deprecated `new` and `characterFlow` query parameters are stripped.

The Studio header exposes **Build Your Character**. The action is disabled while recording, finalization, or take review owns the workflow. Otherwise it opens a fullscreen modal panel while the Studio stage, session, recording state, and creative repository remain mounted beneath it.

## Character-builder flow

1. Open **Build Your Character**.
2. Optionally try a demo character, or build a direction from the identity and detailed visual controls.
3. Optionally expand the reference settings and select **Generate Preview**.
4. Save a prompt-only or matching image-backed character.
5. Continue in Studio with the character already selected and preloaded in Lucy 2.5.

The panel contains no journey stepper. Its DOM order is the full set of character choices and constraints followed by the preview. On wide layouts the preview is pinned as a sticky rail beside the form; on narrow layouts it follows the final control as the last item in the single-column flow. The preview keeps a stable 4:5 frame while provider work runs.

## Draft persistence and reset

The builder owns one active, versioned draft in the `lightframe.character-builder` IndexedDB database. Form, design, reference settings, preview relationship, and save journal are autosaved after a short debounce. Transient provider requests and regeneration instructions are never persisted.

Closing the panel flushes pending autosave and preserves the draft. Reopening or reloading restores it. **Reset Draft** requires confirmation, aborts active work, deletes the active draft, and returns to a fresh form. If durable persistence fails during close, the panel explains that the latest changes are not reload-safe and requires an explicit choice to stay or discard.

On first initialization, the newest valid legacy `character-design` checkpoint may seed the builder. A migration marker prevents repeated import after reset or completion. Later Guided media stages are never imported into the character form.

After a successful Save Character, the draft is finalized and removed best-effort. A completed marker prevents accidental resume if deletion fails, so the next open starts a fresh character.

## Optional preview generation

Image generation is never required to save a character. A prompt-only save makes no optimizer or image request.

**Generate Preview** always performs two phases:

1. Optimize the current structured direction.
2. Generate a new immutable reference asset from that optimized prompt.

The preview announces `Optimizing prompt…` and `Generating preview…` without fake percentages. The current image remains in the stable frame during loading or failure.

Editing a character input after generation marks the preview stale. The prior image remains visible, but it is detached from Save until a matching preview is regenerated. Prompt-only Save remains available.

**Regenerate** always opens a dialog for optional change instructions:

- Blank instructions perform fresh generation and do not send the prior asset.
- Written instructions send the prior opaque asset ID, the current optimized direction, and the requested change to the owner-scoped edit endpoint. The server resolves the prior bytes and creates a new immutable child asset.

Generated, edited, discarded, and superseded assets are not promoted or mutated. Assets that are no longer referenced may remain in server storage.

## Save and Studio preload

Save is single-flight and uses a journaled, caller-supplied character ID:

1. Freeze the exact builder snapshot and persist a save intent.
2. Validate any image relationship and hydrate the selected immutable asset.
3. Confirm Studio can safely replace the Lucy 2.5 draft.
4. Durably write the character to Recipe Shelf before publishing repository state.
5. Finalize the builder journal.
6. Preload Lucy 2.5 without starting or applying the provider.
7. Select the character in the Dock and Shelf, close the panel, and restore focus to the header action.

Prompt-only preload uses the structured prompt with no reference and enhancement disabled. Image-backed preload uses the stored Lucy prompt and hydrated persisted file with enhancement enabled.

Save does not create a Recent item or increment use count. Those changes remain tied to a successful Start or Apply boundary.

If the Studio draft is temporarily incompatible, Save remains disabled with an actionable reason. Persistence failure leaves the panel, Studio session, and selection unchanged. A finalization or preload failure retains the already valid character ID and retries only the unfinished stage, including after reload, so retries cannot create duplicate characters.

## Legacy projects

The Recipe Shelf conditionally exposes **Manage Legacy Projects** when old browser-local projects exist. The manager lists records from the retained Guided IndexedDB repository and can:

- Download the selected processed or original video.
- Permanently delete a project and its owned artifacts after accessible confirmation.

It never displays Reopen and never enters the retired Guided runtime. No legacy project or media is deleted automatically.

## Failure and recovery behavior

| Failure point                      | Required behavior                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| Invalid or incomplete character    | Keep every choice visible, identify the first incomplete field, and leave Save unavailable.         |
| Draft persistence failure          | Preserve the tab copy, expose retry, and require explicit discard before unsafe close.              |
| Optimization or generation failure | Keep form state and the previous preview; expose a targeted retry.                                  |
| Instructed edit unavailable        | Explain the provider capability boundary; blank regeneration and prompt-only Save remain available. |
| Stale preview                      | Keep it visible but exclude it from image-backed Save.                                              |
| Durable Shelf write failure        | Keep the panel open and do not publish in-memory success.                                           |
| Draft finalization failure         | Retain the saved ID and retry only finalization.                                                    |
| Studio preload failure             | Keep the saved character and retry preload without duplicating it.                                  |
| Missing legacy media               | Keep the project record visible and report that the selected bytes are unavailable.                 |

## Accessibility and responsive behavior

- The builder uses the shared modal focus trap, background inertness, Escape handling, and focus restoration.
- Reset, unsafe discard, regeneration, and legacy deletion use focused confirmation/dialog surfaces.
- Provider phases use a polite atomic status region; failures use an alert.
- Preview and Save regions expose busy state, and conflicting controls are disabled while work is active.
- The footer remains reachable through internal scrolling and safe-area padding.
- The exact **Build Your Character** label remains visible at mobile widths with at least a 44px touch target.
- Keyboard, screen-reader, reduced-motion, 200% zoom, short-height, portrait, landscape, and notched-safe-area layouts must remain operable.

## Completion criteria

- The URL remains `/` and Studio never remounts.
- The new character is durably saved exactly once.
- Lucy 2.5 is preloaded with the correct prompt/reference relationship.
- Dock and Shelf immediately show the active character.
- The builder closes and restores focus.
- No provider Start/Apply, Recent entry, or use-count increment occurs until the creator explicitly starts or applies the session.
