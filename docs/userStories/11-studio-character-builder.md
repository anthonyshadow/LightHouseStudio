# Studio character builder

This story describes the current Builder journey; it is not onboarding or a future implementation
plan.

## Goal

A creator builds and saves a reusable Character AI direction without leaving or remounting Studio. Image generation is optional. A successful save preloads Lucy 2.5 and selects the new character in the Dock and Recipe Shelf, but never starts or applies the provider session automatically.

## Entry and routing

`/` is the sole application route and opens Studio directly. Retired `/advanced` and `/guided` entries history-replace to `/`. Retired `/projects`, `/?project=…`, and `/guided?project=…` entries also canonicalize to `/` and open the Legacy Projects manager. Deprecated `new` and `characterFlow` query parameters are stripped.

The Studio header exposes a character selector labelled **Character: None Selected** or with the selected character name. Open it and choose **Create new character**. The Recipe Shelf’s **New character recipe** action opens the same Builder entry. **Edit character** in the header and **Edit** on a true character card open that exact saved record in Builder. These actions are disabled while recording, finalization, or take review owns the workflow; the selector itself still exposes current/available choices. Builder opens fullscreen while the stable Studio stage remains mounted and session, recording, and creative-repository state stays owned by Studio.

Prompt Workshop never creates or edits a character. It owns only Add, Replace, and Restyle object recipes. Direct **Use** of a saved character remains an atomic Shelf-to-Dock preload and does not open Builder.

## Character-builder flow

1. Open any Builder-owned create or edit entry.
2. Optionally upload a reference in the first **Reference image** drawer or build a direction from the identity and detailed visual controls. The retained demo-character catalog is not currently shown. **Ethnicity** is an optional self-described direction with representative portraits and custom text, independent of **Skin tone**.
3. Choose a local-only save path (prompt-only, prompt plus uploaded image, or **Save & Use Image Only**) or select **Generate Preview**. With an upload, the action becomes **Generate Combined Preview**.
4. Name and save the current valid character/reference combination.
5. Continue in Studio with the character already selected and preloaded in Lucy 2.5.

The panel contains no journey stepper. Its DOM order is the full set of character choices and constraints followed by the preview. On wide layouts the preview is pinned as a sticky rail beside the form; on narrow layouts it follows the final control as the last item in the single-column flow. The preview keeps a stable 4:5 frame while provider work runs.

## Draft persistence and reset

The builder owns one active, versioned draft in the `lightframe.character-builder` IndexedDB database. The draft records whether it creates a new character or edits a specific saved character. Form, design, reference settings, uploaded-reference ID/display name, preview relationship, and save journal are autosaved after a short debounce. Transient provider requests, upload bytes, and regeneration instructions are never stored in IndexedDB; uploaded bytes live in the immutable filesystem reference store.

Opening a different character for edit while another unfinished Builder draft exists shows **Unfinished character draft**. **Cancel** closes the prompt and leaves the draft and navigation unchanged. **Continue** durably discards the unfinished draft before hydrating the selected character. Reopening the same edit target resumes it without prompting.

Closing the panel flushes pending autosave and preserves the draft. Reopening or reloading restores it. **Reset Draft** requires confirmation, aborts active work, deletes the active draft, and returns to a fresh form. If durable persistence fails during close, the panel explains that the latest changes are not reload-safe and requires an explicit choice to stay or discard.

On first initialization, the newest valid legacy `character-design` checkpoint may seed the builder. A migration marker prevents repeated import after reset or completion. Later Guided media stages are never imported into the character form.

After a successful Save Character, the draft is finalized and removed best-effort. A completed marker prevents accidental resume if deletion fails, so the next open starts a fresh character.

## Reference upload and optional preview generation

Image generation is never required to save a character. The Reference image
field accepts validated JPEG, PNG, or WebP up to 10 MiB and 40 megapixels. Before
first selection it explains that an upload is written immediately as an
immutable owner-scoped local asset and remains until whole-environment
retirement. It restores by opaque ID after reload and does not contact an image
provider. **Detach uploaded character reference** detaches the draft
relationship but does not delete the stored asset.

Prompt-only, prompt+uploaded-image, and **Save & Use Image Only** paths make no
OpenAI optimizer or image-model request.

The first **Generate Preview** attempt performs two phases:

1. Optimize the current structured direction.
2. Generate a new immutable reference asset from that optimized prompt.

The action-adjacent disclosure names the OpenAI optimizer model and the startup-selected image
provider/model, says provider credits may be used, and states that successful output remains an
immutable local asset until participant-environment retirement. It also keeps upload and Save
without generation explicitly provider-free. The same disclosure is present in the Regenerate
dialog. A selected Wiro configuration remains generation-disabled under the default
`PILOT_ACCESS_MODE=participant`; only a separate operator-only technical run may enable it.

If optimization succeeds but image generation fails, selecting **Generate Preview**
again reuses the successful optimization while the normalized raw direction and
reference options remain unchanged. Editing either input requires a new optimization.

When an upload is attached, **Generate Combined Preview** replaces that action:
it optimizes the current structured direction and sends the owner-scoped source
bytes to the composition endpoint, which creates a new immutable result.

The preview announces `Optimizing prompt…` and `Generating preview…` without fake percentages. The current image remains in the stable frame during loading or failure.

Editing a character input after generation marks the preview stale. The prior image remains visible, but it is detached from generated-image Save until a matching preview is regenerated. Prompt-only Save remains available; when an upload is still current, direct-upload or image-only Save remains available too.

**Regenerate** always opens a dialog for optional change instructions:

- Blank instructions perform fresh generation without a prior generated asset when there is no upload. With an upload, they compose from that uploaded source again.
- Written instructions send the current owner-scoped source ID, optimized direction, and requested change to the edit endpoint. That source is the matching preview, or the current upload when the visible preview is stale and an upload remains available. The server resolves those bytes and creates a new immutable child asset.

Uploaded, generated, composed, edited, detached, discarded, and superseded assets are not promoted
or mutated. Reset and character-record deletion also say that they detach relationships without
deleting immutable bytes. Assets that are no longer referenced may remain in server storage; there
is no in-app asset deletion/garbage-collection flow.

## Save and Studio preload

Save is single-flight and uses a journaled, caller-supplied character ID:

1. Freeze the exact builder snapshot and persist a save intent.
2. Validate any image relationship and hydrate the selected immutable asset.
3. Confirm Studio can safely replace the Lucy 2.5 draft.
4. Durably create the new character or update the edited character in place before publishing repository state. Edit preserves its character ID and unrelated Shelf metadata such as notes and tags.
5. Preload and select Lucy 2.5 without starting or applying the provider.
6. Mark the Studio preload stage complete in the builder journal.
7. Complete and remove the builder journal, close the panel, and restore focus to the header character selector.

Prompt-only preload uses the structured prompt with no reference and enhancement disabled. Direct-upload and image-only preload use the uploaded reference with enhancement disabled. A generated/composed preload uses its stored Lucy prompt and hydrated persisted file with enhancement enabled. Recipe Shelf v4 records the uploaded source relationship and whether the final reference is uploaded or generated.

Save does not create a Recent item or increment use count. Those changes remain tied to a successful Start or Apply boundary.

If the Studio draft is temporarily incompatible, Save remains disabled with an actionable reason. Persistence failure leaves the panel, Studio session, and selection unchanged. A finalization or preload failure retains the already valid character ID and retries only the unfinished stage, including after reload, so retries cannot create duplicate characters.

## Legacy projects

The Recipe Shelf conditionally exposes **Manage Legacy Projects** when old browser-local projects exist. The manager lists records from the retained Guided IndexedDB repository and can:

- Download the selected processed or original video.
- Permanently delete a project and its owned artifacts after accessible confirmation.

It never displays Reopen and never enters the retired Guided runtime. No legacy project or media is deleted automatically.

## Failure and recovery behavior

| Failure point                      | Required behavior                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Invalid/incomplete save input      | Keep every choice visible and leave the affected Save unavailable; a valid upload alone still permits image-only save. |
| Upload validation/storage failure  | Reject unsupported, over-10-MiB, or over-40-megapixel input; preserve the prior valid draft/reference and allow retry. |
| Draft persistence failure          | Preserve the tab copy, expose retry, and require explicit discard before unsafe close.                                 |
| Optimization or generation failure | Keep form state and the previous preview; expose a targeted retry.                                                     |
| Generation/edit unavailable        | Explain the provider boundary; prompt-only and direct-upload/image-only Save remain available where valid.             |
| Stale preview                      | Keep it visible but exclude it from generated-image Save; retain the valid prompt/upload fallback.                     |
| Missing stored reference           | Keep recoverable character text available and expose the applicable retry, clear, or continue-without-reference path.  |
| Durable Shelf write failure        | Keep the panel open and do not publish in-memory success.                                                              |
| Draft finalization failure         | Retain the saved ID and retry only finalization.                                                                       |
| Studio preload failure             | Keep the saved character and retry preload without duplicating it.                                                     |
| Missing legacy media               | Keep the project record visible and report that the selected bytes are unavailable.                                    |

## Accessibility and responsive behavior

- The builder uses the shared modal focus trap, background inertness, Escape handling, and focus restoration.
- Reset, unsafe discard, regeneration, and legacy deletion use focused confirmation/dialog surfaces.
- Provider phases use a polite atomic status region; failures use an alert.
- Preview and Save regions expose busy state, and conflicting controls are disabled while work is active.
- The footer remains reachable through internal scrolling and safe-area padding.
- The header character selector retains its full accessible name and an approximately 44px touch target at mobile widths. The fullscreen dialog retains the exact **Build Your Character** title.
- Keyboard, screen-reader, reduced-motion, 200% zoom, short-height, portrait, landscape, and notched-safe-area layouts must remain operable.

## Completion criteria

- The URL remains `/` and Studio never remounts.
- The new character is durably saved exactly once.
- Lucy 2.5 is preloaded with the correct prompt/reference relationship, and the saved record has the matching v4 provenance.
- Dock and Shelf immediately show the active character.
- The builder closes and restores focus.
- No provider Start/Apply, Recent entry, or use-count increment occurs until the creator explicitly starts or applies the session.
