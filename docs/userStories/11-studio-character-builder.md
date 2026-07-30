# Studio character builder

**Outcome:** create or edit one reusable Lucy 2.5 character, optionally with a local or generated
reference, then preload it into Studio without starting AI.

## Entry and journey

`/` remains the sole route and the Studio stage stays mounted behind the fullscreen Builder.
Create from the header or Shelf; edit from the active-character selector or a true character card.
Recording, finalization, and take review block Builder entry.

1. Open **Build Your Character** for a new character or the named edit panel for an existing one.
2. Optionally upload a reference, then define identity and visual direction. Image generation is
   never required.
3. Choose one save path:
   - prompt-only;
   - prompt plus the uploaded image;
   - **Save & Use Image Only**; or
   - a current generated/combined preview.
4. Name and save. Edit updates the existing character ID and preserves unrelated Shelf metadata.
5. Builder closes, restores focus, and preloads/selects the character in Lucy 2.5, Dock, and Shelf.
   It does not Start/Apply AI, create a Recent item, or increment use count.

The form and preview have one DOM instance. On narrow layouts, **Review & Generate** moves focus to
that preview; on wide layouts the preview is a sticky rail.

## Draft persistence

- One versioned active draft autosaves to `lightframe.character-builder` IndexedDB and restores
  after close/reload.
- Opening a different edit target requires explicit discard of the unfinished draft; reopening the
  same target resumes it.
- **Reset Draft** confirms, cancels active work, removes the draft, and starts fresh.
- If close cannot make the draft reload-safe, Builder requires the creator to stay or explicitly
  discard.
- Save retries resume the same caller-supplied character ID and unfinished stage, preventing
  duplicate characters after persistence or preload failure.

## References and provider work

- Upload accepts JPEG/PNG/WebP up to 10 MiB and 40 megapixels. Selection immediately stores an
  immutable owner-scoped local asset; **Detach** removes only the draft relationship.
- Prompt-only, direct-upload, and image-only save do not contact the optimizer or image provider.
- **Generate Preview** normally optimizes the structured direction, then makes one request to the
  startup-selected image provider. **Generate Combined Preview** also supplies the uploaded source.
- If optimization is unavailable/fails, generation may continue once with the validated raw
  direction and a visible warning. **Retry optimization and regenerate** retries optimization
  first. Image submission is never automatically retried and never falls back to another provider.
- Editing generation inputs marks the prior preview stale. It stays visible but cannot be attached
  as the generated reference until regenerated; valid prompt/upload save paths remain.
- **Regenerate** supports a fresh generation/composition or an instructed edit from the matching
  immutable source.
- Participant-mode Wiro generation is disabled. Wiro is reserved for an explicit operator
  qualification pass.

Uploaded, generated, composed, edited, detached, superseded, and character-deleted assets remain
immutable local bytes until whole-environment retirement. There is no per-asset deletion or
garbage-collection flow.

## Recovery invariants

- Invalid upload, missing stored reference, optimizer/generation/edit failure, or stale preview
  preserves the prior valid draft/reference and exposes a targeted retry or safe local save path.
- Durable Shelf failure does not publish in-memory success or close Builder.
- Studio preload failure keeps the saved character and retries only preload.
- Shared modal focus/inert/Escape/return-focus behavior, internal scrolling, status regions, and
  reduced-motion/reflow behavior remain part of the journey.

## Evidence status

Create/edit, all save variants, draft restore/reset, stale preview, optimizer fallback, combined
generation, regeneration/edit, idempotent save, and responsive single-preview behavior have
automated coverage. Live OpenAI/BFL/Wiro work, physical touch/mobile, assistive technology,
retention cleanup, and provider-output qualification remain controlled-pilot gates.
