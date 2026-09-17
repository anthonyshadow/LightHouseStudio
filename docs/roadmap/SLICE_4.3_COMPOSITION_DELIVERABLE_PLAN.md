# Slice 4.3 — The composition as the deliverable: audit, plan, record

**Document type:** the approved plan for the work that closes implementation prompt 35's gate, and
the record of what it builds. The gate's evidence is
[`PHASE_4_COMPOSITION_VERIFICATION.md`](../audits/PHASE_4_COMPOSITION_VERIFICATION.md); it found
nine of fourteen checks passing and five failing. This plan fixes all five, in six stages, approved
by the operator on 2026-09-16 at head `cc5bd262`.

Three of the five are slice 4.3's own scope as the roadmap states it — "the composition is what Save
operates on; variant sets from 2.3 apply to it". One is the caption authoring the roadmap's Phase 4
required tests already name ("two-clip stitch → caption → variant export journey") without any slice
line owning it. One is a defect outside composition entirely that the gate found on the way, and it
is first here because it blocks a vision promise for every Project in the product.

---

## 1. What failed, and what owns each failure

| Gate finding                                          | Vision item | Owner                                       |
| ----------------------------------------------------- | ----------- | ------------------------------------------- |
| An archived Project holding media cannot be restored  | 10          | nothing — found by the gate                 |
| The save state is invisible while arranging           | 8           | nothing — found by the gate                 |
| Save does not operate on the arrangement              | 9           | slice 4.3                                   |
| Export variants re-frame the cut, not the arrangement | 9           | slice 4.3                                   |
| No control authors a caption on an arrangement        | 6           | unowned; Phase 4's required tests assume it |

Plus five smaller defects the audit confirmed and the gate filed, which are cheap enough to carry
in the first stage rather than leave open.

## 2. The order, and why it is this order

**1 → 2 → 3 → 4 → 5 → 6.** Stage 2 shares no file with any other stage and may move; the rest is
load-bearing.

- **Stage 1 first** because its one-line session fix makes the un-arranged branch reachable at
  runtime for the first time, and because the test harness every later stage appends to reproduces
  that same bug and has to be rewritten before thirty-five cases depend on it rather than
  twenty-three.
- **Stage 3 before 4, 5 and 6** because every failure those three introduce — a refused proposal
  carrying new cues, a flush that fails before an adoption, a conflict raised mid-render — is
  silent on that surface today. Stage 3 is what makes the rest observable.
- **Stage 4 before 5** because both edit the same forty lines of the render hook, and because
  stage 5 is what makes an over-long render expensive a second time: it becomes an upload and a
  revision, not just a discarded preview.
- **Stage 6 last** because it is the largest, touches the same surface as all of the others, and is
  the only stage that adds a domain concept.

Every intermediate state is shippable. One consequence is deliberate: between stages 1 and 5 the
product tells an operator their arrangement is not included in a save and offers no way to fix
that. That is honest, and better than today's silence, but it argues against a long gap.

## 3. The stages

### 3.1 Stage 1 — small truths

| Change                                                | File                           |
| ----------------------------------------------------- | ------------------------------ |
| A staged proposal that un-arranges is read as such    | `useCompositionSession.ts`     |
| Undo and Redo respect `blocked`, not only `rendering` | `CompositionSurface.tsx`       |
| Archived and never arranged states its reason         | `CompositionSurface.tsx`       |
| A duplicated Project's empty Media area says so       | `ProjectMediaSection.tsx`      |
| Save says the arrangement is not included             | `ProjectOutputSaveSection.tsx` |

The session reads `session.proposal?.composition ?? snapshot.composition`, and the proposal's
`composition` is required-and-nullable — so a proposal that deliberately stages `null` falls through
to the old value. Removing the last clip, and undoing past the first arrangement, both take that
path: the surface announces the Project is no longer arranged while the strip still shows a clip,
and only the autosave landing some hundreds of milliseconds later makes it true. If that write
fails, it never becomes true.

**Decided here: Undo stops at the first arrangement.** Once the fix lands, undoing past `arrange`
reaches the un-arranged branch, which carries no Redo — the history survives in the hook and is
unreachable from the screen. Adding a Redo to a screen whose whole job is one button is worse than
declining to step back past the arrangement's own beginning.

The existing test asserting "no longer arranged" breaks, because that announcement is rendered
inside the branch that now unmounts. The harness itself reproduces the `??` bug on two lines and is
rewritten first.

### 3.2 Stage 2 — restore

`ProjectService.restore` refuses whenever the snapshot carries media, because it hands the domain
rule empty facts and would otherwise derive a wrong status. It is a placeholder standing in for
three lines of derivation the same file already writes twice. A `snapshotFacts` helper replaces it,
the guard goes, and the checkpoint path reuses the helper so the rule has one owner. No domain,
contract or repository change: the transition table already permits every status real facts can
produce.

**A second dead end sits behind the first.** The processing recovery sweep filters on `deletedAt`
but not `archivedAt`, so an archived Project whose attempt later fails is flipped to
`needs-attention`, drops out of the archived list, and then fails restore with a different error.
Both sweeps gain the predicate.

**Accepted, not fixed here:** deriving `validatedLastSuccessfulOutput` from the snapshot always
matches, so a Project with a saved output restores as `completed` without re-validating that the
Version still exists. That is exactly what the checkpoint path already does. Making restore
stricter than its sibling would be a divergence; the two should be fixed together, later.

### 3.3 Stage 3 — the save state while arranging

The only save indicator in the product lives on the workspace masthead, which the shell hides
outright while an editor holds the stage. The arrangement surface reads the render's phase and
never the session's, although the session port it already holds carries all of it.

`projectWorkspaceSaveStatus` and `ProjectSessionNotice` move to their own module, retyped from the
hook's return to `ProjectSessionPort`, and the arrangement renders the stamp in its header and the
notice beside its others. That notice is flow 13's reapply-or-discard choice, which is currently
offered only when a navigation is blocked — so staying on the surface with a conflict offers
nothing at all.

**Rejected: un-hiding the masthead.** It would make the masthead's own **Arrange** button live
during a takeover, where pressing it does nothing visible and then drops the operator into the
arrangement when they close the editor. That is a new defect, and it would touch every breakpoint
branch keyed on the editor-active flag.

The masthead is hidden rather than unmounted, so two live regions would otherwise announce the same
change. Assertions scope to the arrangement, and the hidden region stops announcing.

### 3.4 Stage 4 — refuse an over-long render before paying

The preview is validated against the intake's five-minute ceiling _after_ the encode, and the
refusal is the intake's own sentence: "Choose a video that is 5 minutes or shorter." The operator
did not choose a video. They arranged clips, waited through a full encode and a full validation
decode, and were told to pick a different file.

It is reachable in two gestures, not theoretical: intake caps each source at five minutes rather
than at less, **Add a clip** appends the whole of a video, and the picker offers a video the
arrangement already holds. The slice 4.2 record's claim to the contrary was corrected in
`cc5bd262`.

A third refusal branch on the surface compares the arrangement's own length to the ceiling and
folds into the render control, where this surface already states its refusals with reasons. The
render hook additionally restates a validation failure in the arrangement's voice, which also
covers the byte-ceiling variant that a duration check cannot.

**The trap:** the control compares the trimmed sequence length and the validator compares the
plan's duration. One test pins them together, refusing and then enabling across the boundary, with
the worker never called in either case.

### 3.5 Stage 5 — adopt the stitched render as the current cut

The arrangement's rendered file becomes the Project's current cut through the adoption path that
already exists. Save and the export variants then deliver the multi-clip video with no further
change, because both already operate on the cut.

**Rejected: making Save itself composition-aware.** The placement re-frame applies a crop to one
source's geometry, which for an arrangement exists only after a stitch — so that route is also
"stitch once, then re-frame", minus a durable middle. It additionally needs a new concept in the
save contract for primary bytes with no placement spec, plus its idempotency fingerprint, receipt
replay and version-cap arithmetic. The two compose, and this one comes first.

Provenance is `localEdit: null`, which is true of a stitched render and is what three existing
adopt callers already send, plus a new `'stitched-render'` value on the working-media kind, which
is where "what made these bytes" already lives. No snapshot version bump.

**The trap, and the reason this stage is bigger than its diff.** A raw SQL predicate decides which
adoption is the current cut by listing the two existing kinds. Add a kind without touching it and
the write succeeds, the response is correct, and every later read returns not-found — in Postgres
only, with file mode green throughout. There is no runtime list of those kinds and no parity test,
so five hand-written copies across four files can drift in silence. Introducing that list and its
parity case is a prerequisite.

Two smaller findings: the validator already builds the adoptable `File` and discards it, so keeping
it costs one wrapper rather than a second copy of the video — but only the file is kept, because
the whole validated result pins a full in-memory copy of the audio for the life of the preview. And
the recovery check that establishes "my upload landed" compares the edit spec, which is `null` on
both sides here and therefore vacuously true; it is replaced by facts the server returns, anchored
on the adoption sitting at exactly the revision this attempt would have produced.

**Accepted, and stated in the copy rather than fixed:** nothing durably records that the adopted
cut is still current with the arrangement. Edit the arrangement after adopting, reload, and Save
delivers the previous render. The Save step says so in words; the durable fix is one nullable
column and is filed, not built.

The adopted cut also becomes offerable as a clip of itself, which would nest the arrangement inside
its own render. The catalogue marks a presented cut the source collection never held, and the
picker skips it.

### 3.6 Stage 6 — captions on the arrangement

The cue type, its validation and the renderer are all already shared; only the authoring surface is
missing. The existing cue editor is extracted behind a narrow port, the single-clip editor becomes
a thin adapter over it, and the arrangement gets a second adapter and a collapsible band between
the playhead and the preview.

**Decided here: a new cue mints with placeholder text.** The wire refuses empty cue text and
arrangement cues autosave, so the single-clip gesture of adding an empty cue and typing into it
cannot be copied. The cue is minted selected with its text selected, so the first keystroke
replaces it.

**Decided here: clearing a cue's text deletes the cue.** That is the policy the single-clip editor
already applies at its finalize step, and a composition never finalizes. Refusing is not reachable
as a state, and restoring the previous text puts words back in a field the operator just cleared.

**Text editing is transactional, for a reason worth recording.** The contract's trim is a
transform, not only a check, so staging a keystroke would eat the space between words as it
round-trips through the proposal.

**The bundle is the binding constraint, and not where the 4.2 record left it.** Studio's closure has
449 bytes of headroom and the new domain gestures measure about 600. The ledger names the fix — a
chunk rule for the domain barrel edge — and also says it is a build-config change and not a slice's
to make in passing. **The operator approved making it here.** It recovers roughly two kilobytes
from both closures, because the composition operations module has no static shell consumer at all
and is in the graph only through the barrel edge.

## 4. Validation

Narrowest per stage, per `CLAUDE.md`'s table. The full gate runs three times: after stage 2, after
stage 5, and at the end of stage 6. The real stack runs after stage 5 — the first stage a real save
can falsify — and again after stage 6. The bundle is measured inside the full gate, and stage 6's
number is read rather than its exit code.

Postgres-mode coverage is not optional in stages 2 and 5: both have file-mode and Postgres-mode
paths that differ, and stage 5's central trap is invisible in file mode.

## 5. Record

Filled in as the stages land.
