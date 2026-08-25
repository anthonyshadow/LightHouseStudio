# Studio character builder

**Outcome:** create or edit one reusable Character, optionally with a local or generated reference,
then select it in the originating Studio or uploaded-video context without starting provider work.
The current live character workflow uses Lucy 2.5.

## Entry and journey

Enter the authenticated Studio; the one Studio stage stays mounted behind the fullscreen Builder. The Builder itself is shell-owned, so Quick Create can also open it from a Project route, where no stage exists. Create from the
desktop Character rail, **Quick Create → Create Asset → Character**, `/assets/characters`, or from
**Create A Character** at the end of an uploaded video's saved-character chooser. **Create new
character** in Saved Characters opens the same Builder with a
brand-new create target. **Create new from this character** hydrates that character into a distinct
create target, so saving creates a new ID and leaves the source unchanged. Edit from the
active-character selector or a true character card. Recording and
finalization block Builder entry. Take review blocks the general Studio entry but not the explicit
handoff from an unsubmitted edited-video Character Swap step.

1. Open **Build Your Character** for a new character or the named edit panel for an existing one.
2. Use the three-step guided workflow in any order:
   - **Start:** optionally upload a reference or import one from a public HTTPS image URL first,
     then choose presentation and adult age;
   - **Details:** refine appearance, identity, styling, role, mood, and setting; and
   - **Preview:** review the combined direction and optionally generate a reference image.
     Every step label remains enabled and directly clickable. **Back** and **Continue** are
     conveniences, not validation gates.
     Preview settings use the shared custom chooser for framing, orientation, rendering, and
     expression. Generated references always use a uniform neutral-gray studio background; there
     is no background chooser. The chooser supports keyboard/typeahead and pointer input on an
     anchored listbox, then adapts to a safe-area-aware touch sheet on phones without adding another
     Builder scroll owner.
3. Press **Save Character**. There is one save control; what a save produces is a choice inside
   naming, not a second button:
   - a **described character** — the prompt, its guided design, and a current
     generated/combined preview when one is attached; or
   - the **uploaded image only**, offered when an upload exists, which keeps the image and no
     description.
4. Name and save. The name dialog explains what each choice keeps, and its suggested name follows
   the choice. Edit updates the existing character ID and preserves unrelated creative-library
   metadata.
5. Builder closes and returns to its originating context:
   - general Studio entry selects the Character in Lucy 2.5 and keeps it available in Characters; or
   - uploaded-video entry reopens the upload panel with the new character selected. With an
     editable-prompt Character Swap binding, image-backed and prompt-only handoff retains its prior
     behavior. With a server-default binding such as Pruna, only an image-backed character can be
     selected, its image fills the step, and prompt text stays empty and unavailable.

   Neither path starts/applies AI, creates a Recent item, or increments use count.

Only the active step is presented. Changing steps moves focus to the new step heading. The step
rail is a full-height 260px orientation surface beside the active content on wide layouts and
becomes a compact horizontally scrollable row on narrow layouts. A single direction preview stays
visible as a 400px desktop rail and joins the reading order on the Preview step at narrower
viewports; no character stateful control is duplicated.

A saved Character and its Wardrobe Variant remain independent workspace resources when selected
inside a Project. Project snapshot v2 references their stable IDs and exact applied name/title,
resource revision, and immutable reference ID; it does not copy Builder drafts, images, Wardrobe
records, use counters, or cleanup ownership. Later edits/deletion therefore preserve the Project's
historical explanation but require **Choose another** before using a new current resource.

Every predefined option uses its profile-aware repository artwork when the catalog provides one.
Shared semantic options such as adult age, role, style, expression, and mood resolve to
the artwork for the selected presentation. A per-field **Describe My Own** control is collapsed by
default, reveals a specific 500-character text field on request, and collapses when a predefined
option is selected. Custom presentation uses presentation-neutral artwork suggestions without
erasing existing choices.

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
- When no active Builder draft exists, compatibility migration asks the legacy-project repository
  for its newest valid character-design record in one query. Invalid and unrelated legacy records
  remain ignored, and successful migration retains the existing one-time marker behavior.

## References and provider work

- Upload and public-HTTPS import accept JPEG/PNG/WebP up to 10 MiB and 40 megapixels. Remote import
  uses the same bounded loopback broker flow as Existing Video and never retains the URL. A valid
  selection immediately stages an immutable owner-scoped asset. In authoritative Neon/R2,
  **Detach**, replacement, Reset, and confirmed draft discard request physical deletion only when
  the server proves no saved creative record references it; ordinary close keeps the resumable
  draft and refreshes temporary activity when restored.
- Prompt-only, direct-upload, and image-only save do not contact the optimizer or image provider.
- **Generate Preview** normally optimizes the structured direction, then makes one request to the
  startup-selected image provider. **Generate Combined Preview** also supplies the uploaded source.
- Every new generation, regeneration, instructed edit, and composition is normalized in both the
  browser and broker to a swap-ready profile: exactly one centered character, uniform neutral-gray
  background, even diffuse lighting, no environment/depth cues, and no unrelated props. Restored
  legacy background choices are normalized for the next request. Existing uploaded and immutable
  reference assets remain unchanged.
- If optimization is unavailable/fails, generation may continue once with the validated raw
  direction and a visible warning. **Retry optimization and regenerate** retries optimization
  first. Image submission is never automatically retried and never falls back to another provider.
- Editing generation inputs marks the prior preview stale. It stays visible but cannot be attached
  as the generated reference until regenerated; valid prompt/upload save paths remain.
- **Regenerate** supports a fresh generation/composition or an instructed edit from the matching
  immutable source.
- Wiro availability follows startup configuration. There is no second runtime access-mode layer;
  live use still requires an explicitly authorized, cost-bearing check.
- Saved Character Wardrobe can delete an individual variant after confirmation. The variant,
  selected-version relationship, and Recent attribution links are removed. Authoritative Neon/R2
  deletes any source/result/garment asset that then has no saved relationship; local mode retains
  detached immutable bytes. **Change Features** preserves the selected character by default. The
  default-off **Allow major departure from source** checkbox makes the requested changes
  authoritative, omits the parent prompt, and permits a substantially different identity and
  defining traits.

Uploaded, generated, composed, and edited assets remain immutable. In authoritative Neon/R2 they
are temporary until canonical creative metadata references them. Explicit discard/replacement
clears unreferenced assets immediately when storage is available; abandoned assets become eligible
after 24 hours without metadata/content use and are purged on later cloud-library activity. Saved
relationships always win the server recheck. Local mode retains bytes until whole-environment
retirement.

## Recovery invariants

- Invalid upload, missing stored reference, optimizer/generation/edit failure, or stale preview
  preserves the prior valid draft/reference and exposes a targeted retry or safe local save path.
- Durable creative-library failure does not publish in-memory success or close Builder.
- Studio preload or uploaded-step hydration failure keeps the saved character and retries only the
  incomplete handoff.
- Shared modal focus/inert/Escape/return-focus behavior, internal scrolling, status regions, and
  reduced-motion/reflow behavior remain part of the journey.

## Evidence status

Create/edit, all save variants, draft restore/reset, stale preview, optimizer fallback, combined
generation, regeneration/edit, idempotent save, owner-scoped unsaved cleanup, and responsive single-preview behavior have
automated coverage. Live OpenAI/BFL/Wiro work, physical touch/mobile, assistive technology,
R2 deletion failure/retry, and provider-output quality remain manual validation areas, not runtime
feature gates.
