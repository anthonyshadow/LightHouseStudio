## Implementation Prompt — Step 7: Stop showing internal identifiers

### Objective

Remove database identifiers, internal filenames and internal operation vocabulary from the parts of
the interface an operator reads, and rewrite the four hardest sentences in the product.

### Context

Lightframe Studio has already done most of its language work: placements are "Phone, full screen"
rather than "9:16", empty states carry worked examples, and costs are stated plainly. A specific
residue remains, where the product still shows its own bookkeeping.

**Confirmed instances, all verified in the running product:**

| Where                                                             | What the operator sees                                                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/features/projects/ProjectAssetsSection.tsx:411-413` | `01147510…fb0e1e` rendered **above** every asset's real name, via `abbreviatedId(membership.resourceId)`. It appears on every Character, Outfit, Voice and Video card in "Used in this Project". |
| Project Save panel                                                | "Project change 37"                                                                                                                                                                              |
| "Use existing video" overlay                                      | `local-take-20260814T150841Z-ba6ebcb3.mp4` as the file's name                                                                                                                                    |
| Character Swap configuration                                      | `reference-da0ec4aa-951e-4acd-81bc-c3eb19a3ce1d.jpg` as the reference image's name                                                                                                               |
| `ProjectProcessingStatusPanel`                                    | "Looking for a durable current or accepted earlier-revision operation. This check never submits provider work."                                                                                  |
| Project Create tab                                                | "Picks one exact version of one of your own videos, and never sets a target for Add Version."                                                                                                    |
| Project Create tab                                                | "This result is for an earlier change. It was kept, but it did not replace what you're viewing and no version was saved."                                                                        |

The operator typically has one or two characters. The identifier distinguishes nothing and cannot be
acted on.

### User Problem

The interface describes the system's bookkeeping instead of the operator's work, and its two hardest
sentences appear on the tab reached second.

### Required Behavior

- No database identifier — full or truncated — is rendered as visible text on any surface.
- Files are named by what they are, not by their internal generated name.
- "Project change N" is replaced by something an operator can interpret.
- The four sentences above are rewritten and still convey the same state. **The states are real and
  must still be communicated** — "this result was kept but is not what you are looking at" is genuine
  information, not noise.

### Existing Areas to Inspect

- `apps/web/src/features/projects/ProjectAssetsSection.tsx` — `abbreviatedId` (line 66) and its single
  call site (line 412). Confirm it has no other caller before removing it.
- `apps/web/src/features/projects/ProjectOutputSaveSection.tsx` — where `revisionNumber` is rendered
- `apps/web/src/features/projects/ProjectHistorySection.tsx` — History, where an ordinal **is**
  legitimately useful. Keep it, but make sure it says what it means.
- `apps/web/src/features/projects/ProjectProcessingStatusPanel.tsx`
- `apps/web/src/features/projects/ProjectWorkingMediaSection.tsx` — the "Add Version" and
  "Kept in this Project" copy
- `apps/web/src/features/existing-video/ExistingVideoSourceCard.tsx` and
  `ExistingVideoPanelSections.tsx` — where the capture filename is displayed
- `apps/web/src/features/media-session/ReferenceImageField.tsx` — the reference image's displayed name
- `apps/web/src/features/export-placements/placements.ts` — the model to follow: user-facing copy
  derived from the domain so it cannot drift
- `scripts/check-retired-program-references.mjs` — some words fail a repository gate; check your new
  copy against it

### Scope

- Remove the identifier from the Project asset cards.
- Present capture and reference files by a human description rather than a generated name.
- Replace "Project change N" outside History.
- Rewrite the four sentences.

### Out of Scope

- **Any change to identifiers in the data model, the API, or `data-*` test hooks.** This is a
  presentation change only.
- Renaming domain concepts in code — `revisionNumber`, `resourceId`, `membership` and the rest stay.
- Removing the ordinal from History, where it is useful.
- Any layout or structural change beyond removing an element.
- Rewriting copy that is already clear.

### UX Requirements

- Every replaced sentence must be understandable by someone who has never read the schema. Read each
  one aloud; if it needs a glossary, it is not finished.
- Do not lose information. If a state is worth telling the operator about, tell them in plainer words
  — do not delete the message.
- If the identifier has a genuine support purpose, it may remain in a `title` attribute or a
  copy-to-clipboard affordance, but not as visible text. Say in your report which you chose and why.
- Accessible names must remain at least as informative as they are now.
- Check every changed surface at 375 px — shorter copy can change wrapping.

### Technical Requirements

- Audit each call site before editing. `abbreviatedId` currently has exactly one caller; confirm that
  is still true before deleting it, and delete it if it becomes unused so `knip` stays clean.
- Where a file needs a human name, derive it from what the file _is_ (a recorded take, a reference
  image) rather than inventing per-call-site strings. Keep the derivation in one place.
- Do not change any `data-*` attribute, element id, or `aria-controls` relationship used by tests.
- Make no unrelated edits.

### Acceptance Criteria

- No UUID or truncated UUID appears as visible text anywhere in the application.
- No internal generated filename is presented as the primary name of a file.
- "Project change N" no longer appears outside History; where an ordinal remains, it is labelled so
  its meaning is clear.
- All four sentences are rewritten, and each still communicates the same state.
- No test hook, element id or accessible name is broken.
- `bun run check:retired-program` passes.
- `bun run check:dead-code` still reports nothing.
- Every changed surface renders correctly at 375 px.

### Regression Protection

- Existing unit tests assert on some of the removed strings. **Update the assertions to the new copy
  rather than restoring the old strings.**
- E2E specs may select by visible text. Search `e2e/` for each string you change.
- Do not change what any control does — this step changes words, not behaviour.

### Validation

Run only:

```bash
bun run --filter @studio/web exec vitest run src/features/projects src/features/existing-video src/features/media-session
bun run check:retired-program
bun run check:dead-code
```

Then any E2E spec that selects on a string you changed. Do not run the full suites.

### Completion Report

State: every file changed; each string removed and its replacement, verbatim, in a table; whether
`abbreviatedId` was deleted and whether `knip` is still clean; where you kept an identifier for
support purposes and why; every test assertion you updated; the validation commands and their output;
and any instance you found that you deliberately left, with the reason.
