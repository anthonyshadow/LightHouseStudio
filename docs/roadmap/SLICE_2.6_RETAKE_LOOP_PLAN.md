# Slice 2.6 (Retake loop): audit and plan

**Document type:** the audit-and-plan output for implementation prompt 23 (Phase 2, slice 2.6 of the
[roadmap](PRODUCT_ROADMAP.md)), written 2026-09-07 against commit `cefbcbe4`. Prompt 23 is a **(B)**
prompt with no paired **(A)** audit prompt ([`IMPLEMENTATION_PROMPTS.md:268`](IMPLEMENTATION_PROMPTS.md)),
so unlike slices 2.1, 2.3 and 2.5 this plan was asked for rather than scheduled by the sequence. It
exists because the prompt folds a user-flow change and two defect fixes into one paragraph, and
because the guarantee it changes is written in the canon as an invariant. studio-2 is in the
[current-state audit](../audits/CURRENT_STATE_AUDIT.md) at `:151-152`; studio-8 and studio-9 are
**not** in that audit, and prompt 23 is their only definition anywhere in the repository (§1.7).
Both were nonetheless confirmed directly in code, so they are real defects with no canonical
evidence record. Every current-behaviour claim in §1 cites a file and a line that was read for this
document.

**Status: implemented 2026-09-07 by prompt 23.** §1 through §5 are preserved as written, so they
describe the tree as it stood at `cefbcbe4`, before the change. They are a record of the argument,
not of the current code. What landed, and what it is and is not evidence of, is in
[§6](#6-verification-evidence-prompt-23-2026-09-07), added by implementation prompt 24 while
walking the Phase 2 acceptance criteria
([Phase 2 verification](../audits/PHASE_2_VERIFICATION.md)).

**In one paragraph.** A take is one shot. Capture finalizes, the camera is stopped outright before
review renders, and the only way back to a live stage is Discard, then Start camera, then Record.
Slice 2.6 adds one action on take review that discards the current take, asking the existing
confirmation when it is unsaved, and re-acquires the camera. The privacy posture does not change:
the camera is still released at finalization, and the retake pays one fresh `getUserMedia` rather
than holding a stream through review. The ordering is the whole argument, because
`recording.discard()` returns nothing and refuses silently while a recorder attempt or an on-device
transcode still owns the bytes, so an action that discarded and started the camera in one breath
could start a camera while review still owned the take. That is studio-8, and it is fixed first:
`discard` becomes `() => boolean` with a documented post-condition, and every non-test call site
reads the answer. Two of them read it and deliberately continue anyway, each with the reason written
at the site; §3 names both. studio-9 is the same defect one layer up: `startProjectRecording` drops
a presented take with no confirmation and no check, then navigates and starts capture; it gains a
guard, a confirmation asked through the shell, and an assert. The new action is one entry in the
single `secondaryActions` array that take review already renders two ways, so the compact control
bar and the "Latest take" panel cannot drift. Ten questions in §5 change what prompt 23 builds; each
carries a recommendation, and Q1 is the one that changes the shape of the work.

## 1. Current behaviour, with evidence

### 1.1 A take is one shot, and the camera is gone before review renders

- The domain lifecycle a take moves through has six states, and `recorded` is the review state
  (`packages/domain/src/recording/types.ts:6`: `'idle' | 'ready' | 'recording' | 'stopping' | 'recorded' | 'error';`).
  `useRecording` owns the single mutable lifecycle, held in a ref rather than state
  (`apps/web/src/orchestration/recording/useRecording.ts:70`).
- **The domain already permits a second take.** `canStartRecording` accepts `recorded`
  (`packages/domain/src/recording/rules.ts:162`:
  `): boolean => (status === 'idle' || status === 'ready' || status === 'recorded') && source !== null;`).
  The only requirement is a non-null source descriptor, so nothing in `packages/domain/src/recording`
  blocks a retake and no domain change is needed. A discard resets to a fresh lifecycle
  (`useRecording.ts:518`), and `createRecordingLifecycle` defaults to `idle` when called with no
  argument (`rules.ts:40`), so a discarded runtime is `idle` even with a live source present;
  `start()` runs `prepareRecordingLifecycle` first (`useRecording.ts:391`), which maps that back to
  `ready` when a descriptor exists.
- **The camera is released before review is published, unconditionally.** `finishTake` awaits
  `releaseLiveResources()` (`apps/web/src/studio/useTakeReviewFlow.ts:97`) before `enterReview`
  (`:101`), and that release is `await releaseForRecordedReview()` (`:199`). The automatic-stop path
  (maximum duration, source ended, recorder error) releases the same way before flipping review
  ready (`:122`). There is no preference or flag guarding it.
- **"Release for review" is a full camera stop, not a track disable.** `releaseForRecordedReview` is
  one line, `await stopCamera();` (`apps/web/src/orchestration/session/useStudioSession.ts:391`),
  and `stopCamera` calls `releaseLocalMedia()` (`:382`) and ends at `setLifecycle('idle')` (`:387`).
  `release()` stops every owned track (`apps/web/src/orchestration/session/useOwnedLocalMedia.ts:214`)
  and, on the way, resets the microphone-enabled flag (`:206`), the camera-enabled flag (`:207`) and
  the camera zoom (`:212`).
- **So the only route back to capture today is three deliberate acts.** With the local stream gone,
  the control bar renders its idle row and its primary button reads `Start camera`
  (`apps/web/src/studio/StudioSessionControlBar.tsx:431`); while a take is presented that row is not
  even rendered, because the whole live control set is swapped for the take actions (`:325`).
  `RecordingAction` is unreachable during review for the same reason: `activeRecordingSource` is
  nulled while `reviewLocked` (`apps/web/src/studio/StudioApp.tsx:429-433`) and the component
  returns null without a source (`apps/web/src/features/recording/RecordingAction.tsx:181`).
- **Re-acquisition is one fresh `getUserMedia` and is visible.** There is exactly one production
  acquisition call (`apps/web/src/adapters/browser-media/browserMedia.ts:89`), it sends the selected
  aspect ratio as an exact constraint (`:75`), and it fails and stops the stream unless both a live
  video and a live audio track come back (`:94`). While it runs the control bar shows
  `'Starting camera…'` (`StudioSessionControlBar.tsx:246`) over an idle stage. `startLocal` also
  clears the applied AI recipe (`useStudioSession.ts:325`), so a retake after a Character Swap or
  Virtual Try-On take returns to local capture.
- **Nothing anywhere arms the recorder on stream arrival.** `recording.start` has exactly one call
  site in the app (`RecordingAction.tsx:139-140`), and the enclosing `start` callback has two
  callers: the Record button and the Space shortcut (`:173`). The `?intent=record` effect starts the
  _camera_ on arrival, keyed on `location.key` (`apps/web/src/studio/useStudioRecordingLaunch.ts:296-304`),
  never the recorder.

### 1.2 What a discard does, and when it refuses without saying so (studio-8)

- `discard` is declared with no return value (`useRecording.ts:511`) and the controller contract
  types it as `discard: () => void;` (`apps/web/src/features/recording/types.ts:233`).
- It has exactly two refusal conditions and returns silently for both:
  `if (attemptRef.current || transcodeControllerRef.current) return;` (`useRecording.ts:512`).
- When it does proceed it wipes the artifact slots first (`:513`) and resets the domain lifecycle
  (`:518`). The reducer's `discard` action returns the initial state, clearing original, visual,
  processed, the sidecar, the recording error and all processing state in one step
  (`apps/web/src/orchestration/recording/recordingArtifactState.ts:78`). Object URLs it removed are
  revoked by the pending-revocation effect under the `replacement` reason, and only for owned Blobs
  (`apps/web/src/orchestration/recording/useRecordingArtifacts.ts:76`). The beforeunload guard is
  keyed on the original slot (`:262`), so a discard also disarms the unload prompt.
- **The refusal window is exactly `recordingActive`.** The transcode controller is registered before
  it is awaited (`useRecording.ts:187`) and cleared in a `finally` (`:206-208`), and the domain
  lifecycle is `stopping` across that whole span, so
  `recording.lifecycle === 'recording' || recording.lifecycle === 'stopping'`
  (`useTakeReviewFlow.ts:133`) is a faithful proxy for "the discard will refuse". Most call sites
  never consult it.
- **The refusal is effectively unreachable from take review, and that matters for the fix.**
  `finalizeAttempt` clears `attemptRef.current = null` (`useRecording.ts:149`) and clears the
  transcode controller (`:206-208`), both **before** `artifacts.publishOriginal(artifact, sidecar);`
  (`:237`). A presented take therefore implies both refs are null, and `TakeReviewActions` renders
  nothing without an artifact (`apps/web/src/features/take-review/TakeReviewActions.tsx:86`). The
  boolean earns its keep on the programmatic paths, not on the button.
- `start()` carries the identical guard and is equally silent
  (`useRecording.ts:375`: `if (attemptRef.current || transcodeControllerRef.current) return Promise.resolve();`),
  plus a third silent refusal while voice or visual processing runs (`:366`) that `discard` does not
  share. So a refused discard followed by a start is two silent no-ops and a dead button.
- The same file already **throws** for the same condition on the restore path
  (`useRecording.ts:540`), so the two entry points into that state report a refusal in two different
  ways today.
- `start()` does not discard a previous take. It only clears the recording error and zeroes the
  timer (`useRecording.ts:471`, `:469`), so an old artifact stays presented until the new take
  finalizes and `publishOriginal` replaces it. That is why `RecordingAction` confirms and discards
  first.
- Finalization is bounded by a ten-second timer
  (`apps/web/src/orchestration/recording/recordingAttempt.ts:7`), so the refusal window can last that
  long plus the transcode.

### 1.3 Every caller of a discard today

There are seven call sites, not eight: six literal `recording.discard()` calls plus one reference
passed by name as the Project bridge's `clearSource` option (`StudioApp.tsx:215`). Rows 7 and 8
below are the same site reached two different ways, listed separately because the consequence
differs. The new retake in §3 makes eight.

| #   | Call site                                                                                                                          | What it does after the call                                                                            | Consequence of a silent refusal                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `TakeReviewActions.tsx:91` (Close without saving)                                                                                  | `onCloseTake?.()` (`:92`)                                                                              | Review closes over a take that is still there                                                                                                                        |
| 2   | `TakeReviewActions.tsx:107` (confirmed Discard)                                                                                    | `onDiscardTake?.()` (`:108`), `onCloseTake?.()` (`:109`)                                               | The operator answered "Discard take", the dialog closed, the existing-video selection dropped, and the take is still on the stage                                    |
| 3   | `useStudioRecordingLaunch.ts:246` (`startProjectRecording`)                                                                        | `navigate(...)` (`:247`), `session.startLocal()` (`:249`)                                              | A second capture launches while the first is finalizing                                                                                                              |
| 4   | `RecordingAction.tsx:138` (Record replaces a take)                                                                                 | `recording.start(...)` (`:139-140`)                                                                    | A dead button: `start` refuses on the same condition                                                                                                                 |
| 5   | `StudioApp.tsx:215` (`clearSource: recording.discard`)                                                                             | the bridge already nulled `presentedProjectIdRef` (`apps/web/src/studio/useStudioProjectBridge.ts:70`) | Exactly the "phantom take" the file's own comment names at `useStudioProjectBridge.ts:61`                                                                            |
| 6   | `apps/web/src/features/existing-video/useExistingVideoWorkflow.ts:181` (`resetWorkflowState(true)`)                                | `dispatchWorkflowState({ type: 'reset' })` (`:182`)                                                    | The editor forgets a video the controller still holds                                                                                                                |
| 7   | `apps/web/src/studio/useStudioSessionLifecycle.ts:80` (`discardLocalTemporaryWork`)                                                | outfit, wardrobe, saved-video and overlay resets (`:81-84`)                                            | Teardown believes it cleared a take it did not                                                                                                                       |
| 8   | the same site, reached as the cleanup coordinator's `cancel-operations` step (`apps/web/src/studio/useStudioSessionCleanup.ts:25`) | `release-media` runs next                                                                              | On session expiry, which proceeds even with active work (`apps/web/src/studio/useStudioSessionExpiryController.ts:80`), the discard can genuinely refuse mid-capture |

Three of those are guarded upstream and a refusal is harmless today. `StudioExitGuard.discardAndLeave`
(`apps/web/src/studio/StudioExitGuard.tsx:294`) is not offered while `recordingOrFinalizing`, because
the active-work panel wins (`:311`). `useStudioLogoutController.request` blocks on `hasActiveWork`
(`apps/web/src/studio/useStudioLogoutController.ts:63`), which is `recordingOrFinalizing` or
`videoRenderingActive` (`apps/web/src/app/shell/studioRuntimeWork.ts:77`). Call site 4 is guarded by
construction, because a published original implies the transcode has cleared.

**The repository already has the answer shape one layer up.** The Project session's discard returns
a boolean (`apps/web/src/features/projects/useProjectSession.ts:21`:
`readonly discard: () => boolean;`) and returns `false` for one reason, a save in flight
(`apps/web/src/features/projects/projectSessionController.ts:156`). All three of its callers throw
that boolean away (`StudioExitGuard.tsx:293`, `useStudioLogoutController.ts:42`,
`useStudioSessionExpiryController.ts:79`).

**A throw is the wrong shape for the cleanup path.** `SessionCleanupCoordinator.run` awaits its
tasks with no per-task `try` (`apps/web/src/orchestration/lifecycle/SessionCleanupCoordinator.ts:33`:
`for (const task of tasks) await task.cleanup();`), so a throw from `cancel-operations` would skip
`release-media` and leave the camera on at logout.

### 1.4 Take review is one component rendered two ways

- `TakeReviewActions` takes a `presentation` prop of `'panel' | 'control-bar'` defaulting to
  `'panel'` (`TakeReviewActions.tsx:13`). It renders at most one primary (Save), at most one
  destructive peer (Discard, only while `unsaved`), and a single list of secondary actions
  (`:122`) that the panel puts behind an `ActionMenu` (`:195`) and the control bar renders inline as
  plain buttons (`:183-193`).
- The comment at `:117-120` defends that shape, and gives the reason peer buttons were rejected:
  "this is the moment of highest decision pressure in the product, and six peer buttons made every
  option look equal" (`:117-118`).
- The list today is, in order: Replace Saved Version (`:127`, conditional on `onReplaceSavedVideo`),
  Edit video (`:134`, conditional on `onEditVideo`), Voice treatments (`:140`, with
  `compactLabel: 'Voice'` at `:141`), and Close without saving (`:152`, with `compactLabel: 'Close'`
  at `:153`), which exists only when the take is **not** unsaved (`:147`) and is absent rather than
  disabled.
- `locked` is the single processing gate applied to every action (`:81`), and `saving` and `saved`
  are matched per artifact (`:83-84`). `unsaved = !saved && (hasUnsavedChanges ?? true)` (`:88`) is
  the Discard-versus-Close switch, and an absent prop defaults to unsaved.
- `hasUnsavedChanges` comes from `presentedHasUnsavedChanges`
  (`apps/web/src/studio/useStudioSavedVideoController.ts:119-126`), which is also false when the
  presented artifact **is** the Assets video it was loaded from. So `Close` can appear without any
  save happening this session.
- Two consumers plus one story. The control bar passes `presentation="control-bar"`
  (`StudioSessionControlBar.tsx:328`) and swaps the whole live control set out during review
  (`:325`, gated by `takeReviewActive` at `:285`); it never passes `onEditVideo` (`:326-336`). The
  panel path is `StudioToolOverlays.tsx:299-320` into `StudioTakeOverlays.tsx:66-82` into
  `TakeDock.tsx:310-320`, all with conditional spreads so an absent handler stays absent.
  `TakeDock` returns the voice panel before any take actions when `view === 'voice'`
  (`TakeDock.tsx:232`).
- **`onDiscardTake` is narrower than its name.** It is `discardExistingVideoSelection`
  (`StudioWorkspace.tsx:231`, `StudioToolOverlays.tsx:308`), which is a no-op unless an
  existing-video selection is active (`StudioApp.tsx:679`). Neither it nor `onCloseTake` discards the
  take; `TakeReviewActions` does that itself.
- **Layout, at both breakpoints.** The control-bar row never wraps (`TakeReviewActions.tsx:29`), and
  below 22.49rem it becomes a three-column grid whose first child spans two columns (`:55-60`). The
  panel has its own breakpoint: at or below tablet or 36rem it becomes a single-column grid
  (`:40`, `:47-53`), inside a bottom sheet at `min(45dvh, 24rem)`
  (`07-take-review-and-cleanup.md:32-33`). **The compact bar tops out at four controls today**, not
  five: Save (`:167`), the inline Discard (`:177`) and the mapped secondary buttons (`:183-193`),
  which in the control bar are at most Replace Saved Version and Voice treatments while `unsaved`,
  or Replace, Voice and Close when it is not, because the inline Discard renders only when `unsaved`
  (`:177`) while the `close` entry exists only when it is not (`:147`), and `onEditVideo` is never
  supplied there. Adding the retake is exactly what raises that maximum from four to five.
- **Focus.** The confirmation dialog is mounted with no `returnFocusRef`
  (`TakeReviewActions.tsx:200`), so `OverlayPanel` falls back to the activeElement captured at open
  (`apps/web/src/ui/primitives/OverlayPanel.tsx:166-168`). The restore runs in the layout-effect
  cleanup queued as a microtask (`:238`), is skipped when the overlay merely re-registers (`:243`),
  selects `returnFocusRef` over that opener (`:244`), and only focuses the target when it is still
  connected and focusable (`:245`, `canRestoreFocus` at
  `apps/web/src/ui/primitives/overlayStack.ts:206`); otherwise it calls `focusTopmostDialog()`
  (`:246`), which itself returns immediately when no dialog is left (`overlayStack.ts:208-209`).
  `ActionMenu`'s own contract says a dialog opened from a menu item must return focus to the
  trigger, "the only element that survives"
  (`apps/web/src/ui/primitives/ActionMenu.tsx:15`), and the trigger is handed to `onSelect`
  (`ActionMenu.tsx:101`). The compact presentation throws it away by passing `null`
  (`TakeReviewActions.tsx:189`). So today's Discard from the panel menu already lands focus in the
  wrong place.
- **The description slot renders two different ways.** In the panel it is the menu item's second
  line and its `aria-describedby`, with the accessible name staying the label
  (`ActionMenu.tsx:94-96`, `:105-109`); in the compact bar it is a native `title` tooltip on the
  button (`TakeReviewActions.tsx:188`). `ActionMenu`'s contract for the slot is "why a disabled item
  is unavailable, or what an enabled one will do" (`ActionMenu.tsx:22-23`), and `closeDescription`
  (`:112-114`) is the existing example of switching that text by state.
- **Both presentations are mounted at once** while the panel is open: the control bar renders its
  copy under `takeReviewActive` (`StudioSessionControlBar.tsx:325`) and the panel path renders
  another (`StudioToolOverlays.tsx:299`). Any local state added to `TakeReviewActions` is therefore
  per instance. Only one of the two can be pressed at a time, because the panel is an `OverlayPanel`
  whose backdrop is `position: fixed; inset: 0`
  (`apps/web/src/ui/primitives/OverlayPanel.styles.ts:19-20`) around an `aria-modal="true"` dialog
  (`OverlayPanel.tsx:288`).

### 1.5 The two confirmations that already exist

Both are real dialogs driven by `useConfirmationRequest`, never `window.confirm`. A superseded
question and one still open at unmount both resolve `false`
(`apps/web/src/ui/primitives/useAwaitableQuestion.ts:20-22`), and the three lines that do it are
distinct: `:40` returns `false` for an `ask` after unmount, `:42` settles the in-flight question as
declined when a second `ask` supersedes it, and `:52` settles it from the unmount cleanup. Declining
is the safe default. The cancel label defaults to `'Stay'`
(`apps/web/src/ui/primitives/ConfirmationDialog.tsx:45`) and takes initial focus (`:57`).

Two owners is the sanctioned shape, not drift: `ConfirmationRequestDialog`'s own contract is "mount
one per owner of a request", because "the overlay stack handles layering, so a surface embedded
inside another overlay can mount its own without coordinating with the shell"
(`apps/web/src/ui/primitives/confirmationRequest.tsx:30-32`). What must not be duplicated is the
question itself, and §3 gives it one owner.

|                         | Take review                    | Record button                             |
| ----------------------- | ------------------------------ | ----------------------------------------- |
| Where                   | `TakeReviewActions.tsx:97-103` | `RecordingAction.tsx:128-136`             |
| Title                   | `'Discard this take?'` (`:98`) | `'Start another take?'` (`:129`)          |
| Confirm                 | `'Discard take'` (`:101`)      | `'Start new take'` (`:132`)               |
| Cancel                  | default `'Stay'`               | `'Keep current take'` (`:133`)            |
| Fires when              | `unsaved` is true              | `recording.original` exists, saved or not |
| Reachable during review | yes                            | no (§1.1)                                 |

The Record-button copy also calls a take an "in-memory clip" (`RecordingAction.tsx:131`), which is
wrong twice over: `docs/product/DOMAIN_MODEL.md:194` names that object a **Take**, and `:116` gives
**Clip** an incompatible meaning, "a reference into source media with in/out trim points". This
slice already edits that file at `:138`, so the one string is corrected here rather than deferred
(§3, step 3). The Space shortcut is suppressed while any modal is open (`RecordingAction.tsx:152`),
so a confirmation cannot be double-triggered from the keyboard.

### 1.6 `startProjectRecording`, and what it drops (studio-9)

- The function is synchronous (`useStudioRecordingLaunch.ts:235-259`). Its guard checks the Project
  id, the source activity's `accepted` and `busy`, and capture support (`:237-240`). It never checks
  `recording.presented` and never checks `recordingActive`, which is already one of the hook's own
  options (`:25`).
- It then sets the editor intent (`:244`), closes the overlay (`:245`), discards (`:246`), navigates
  (`:247`), focuses the stage (`:248`) and starts the camera (`:249`), all in one synchronous
  callback. Inserting a confirmation between the guard and the discard makes the whole launcher
  asynchronous.
- Its discard is load-bearing, not cosmetic. `deriveTakeStagePresentation` returns `playback`
  whenever `reviewReady && recording.presented` (`useTakeReviewFlow.ts:45`) and `reviewLocked` nulls
  the recording source (`:134`, `StudioApp.tsx:429-433`), so a capture started without discarding
  would come up behind a stuck playback stage with no record control.
- The exported signature is `() => void` and is passed straight to `onClick`
  (`apps/web/src/features/projects/ProjectSourceSection.tsx:185`, via `StudioWorkspace.tsx:333`).
- **Its reachability is much narrower than the defect, and may be empty.** `ProjectSourceSection`
  swaps Record out for `Use finalized recording` when a ready candidate exists **and** the source is
  not yet accepted (`:172`, the primary at `:179`; the else-branch Record is `:182-188`). The
  candidate is exactly an owned artifact with lifecycle `recorded`
  (`useStudioProjectBridge.ts:94`, null-guarded at `:95`), it is always `ready: true` when it exists
  (`:101`), and every presented take has lifecycle `recorded`, because `commitPresentedTake` sets it
  for restored, validated and remote-presented artifacts alike (`useRecording.ts:551`). So when the
  Record button renders at all, either the source is accepted, which puts it in `controlsDisabled`
  (`:109`) and disables it (`:183`), or `recording.original` holds no owned bytes, which the bridge's
  own comment says means the presentation is already the accepted source
  (`useStudioProjectBridge.ts:91-92`). It also shows `busy` while capture is live (`:184`), which
  `Button` couples to disabled (`apps/web/src/ui/primitives/Button.tsx:121`). This audit could not
  construct a reachable press that drops a presented take. The missing confirmation and the missing
  check are plain code facts and prompt 23 asks for both; they are fixed as code truth and defence
  in depth against a future caller, not sold as a user-visible bug.
- The other three capture entry points leave a presented take standing. `startLocalRecording`
  (`:219-225`) and `startExistingVideoRecording` (`:227-233`) never discard, and the AI-settings
  composer's Start camera is disabled while a take is presented
  (`apps/web/src/studio/StudioToolOverlays.tsx:237`) with the copy at
  `apps/web/src/studio/studioPolicies.ts:5`.

### 1.7 What the canon asks, and where it is already wrong

- Prompt 23 is the whole specification: one action that discards with the existing confirmation when
  unsaved and restarts capture (`IMPLEMENTATION_PROMPTS.md:268-269`), camera-release-after-review
  remaining the default (`:270`), `recording.discard()` returning a boolean with call sites
  asserting on it (`:271`), a confirmation before `startProjectRecording` drops a presented take
  (`:272`), and two test surfaces: take-review flow tests and recording-launch tests (`:273`).
- The roadmap says the same in two lines (`PRODUCT_ROADMAP.md:100-101`), and Phase 2's acceptance
  criteria (`:114-119`) and required tests (`:120-122`) mention nothing about the retake loop, so
  2.6 has no roadmap-level acceptance sentence of its own.
- The standing rules bind this slice to the UI checklist (terminology per the domain model,
  `ConfirmationDialog` and never `window.confirm`, `IMPLEMENTATION_PROMPTS.md:47`; no dead ends,
  every state carrying a control, `:49`), the Media checklist (object-URL, temp-file, worker and
  MediaStream cleanup, `:38`; bounded memory, `:41`), and doc updates whenever observable behaviour
  changes (`:26`). Vitest and Playwright must never run concurrently (`:54`,
  `docs/TESTING.md:86`).
- **The sentence this slice changes** is
  `docs/user-flows/feature-behavior/07-take-review-and-cleanup.md:66`:
  "No new camera or provider activity starts while review owns the take." It is written as an
  invariant, not a default, and nothing in the canon separates the privacy half (no camera without
  an explicit act) from the operational half (review owns the take).
- **The canon tension.** The sibling post-save action, Create another, deliberately does not
  auto-start the camera, and the written rationale is that "auto-starting the camera would demand a
  permission prompt nobody asked for and would push a history entry back onto the just-saved state"
  (`docs/user-flows/studio-creation-workflows.md:182-183`). In code it is
  `discardTemporaryWork(); focusStudio();` (`StudioApp.tsx:892-895`) and never calls `startLocal`.
- **Stale canon inside the surface this slice edits.**
  `docs/user-flows/feature-behavior/07-take-review-and-cleanup.md:51` says "Close stays unavailable
  until the current artifact is saved to the gallery", which the code contradicts twice over: the
  entry is absent rather than disabled (`TakeReviewActions.tsx:147`) and `unsaved` folds in
  `hasUnsavedChanges` (`:88`), which is false for an unchanged video loaded from Assets.
  `docs/user-flows/feature-behavior/02-local-camera-capture.md:28` still lists a `Release` control in
  the review slot, which `docs/product/DOMAIN_MODEL.md:209` deprecates as a take action.
- **One stale-canon item this slice does not take on, named so the surface is not left
  half-corrected.** `DOMAIN_MODEL.md:66` says "'Asset' alone never names a surface; surfaces name
  the concrete kind (Videos, Characters…)", while the surface this slice edits says
  `'Saved to Assets'` and `'Save to Assets'` (`TakeReviewActions.tsx:174`) and "Anything you already
  saved stays in Assets" (`:113`). The word is app-wide, there is a real `/assets/videos` route, and
  `:211` deprecates only "Deliverables" in favour of **Videos**. Renaming it is either a repository
  drift or a stale canon line, and either answer is a separate decision from this slice; the two
  lines §1.7 does correct are ones this surface alone owns.
- **Terms this slice must use** (`DOMAIN_MODEL.md`): **Take** (`:194`), **Recording session**
  (`:200`), and Save / Close / Discard as the take actions (`:209`). The phrase "Record another take"
  is already in the canon as prose, in the roadmap (`PRODUCT_ROADMAP.md:100`) and as a named gap in
  `docs/product/TARGET_USER_FLOWS.md:49`; it is not an approved string, and `DOMAIN_MODEL.md` has no
  glossary row for a retake. The slice introduces a user-visible label, a compact label and an
  internal id for it, so the glossary row is required under every answer to Q4, and the
  **Recording session** row at `:200` is the one this slice changes, because the retake adds a loop
  back from "take review" to "explicit start".
- **The governing rule for the confirmation copy** is `TARGET_USER_FLOWS.md:149`: the UI "says
  exactly what is at risk before any destructive step".
- **studio-8 and studio-9 are undefined outside prompt 23.** The current-state audit defines studio-2
  as "Recording is one-shot" (`CURRENT_STATE_AUDIT.md:151-152`), and its scope explicitly includes
  pause/resume and multi-take comparison, which prompt 23 does not take on. A grep of `docs/` finds
  studio-8 and studio-9 only at `IMPLEMENTATION_PROMPTS.md:270` and `:272`.

## 2. Affected components, hooks, surfaces and tests

| Layer                   | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording contract      | `apps/web/src/features/recording/types.ts:233` (`discard: () => boolean;`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Recording runtime       | `apps/web/src/orchestration/recording/useRecording.ts:511-520` (return `false` at `:512`, `true` after `:519`, and the post-condition comment). No change to `recordingArtifactState.ts`, `useRecordingArtifacts.ts`, `recordingAttempt.ts` or `useRecordingSource.ts`                                                                                                                                                                                                                                                                                                                               |
| Domain                  | None. `packages/domain/src/recording/rules.ts:162` already permits a take from `recorded`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Take review             | `apps/web/src/features/take-review/TakeReviewActions.tsx` (the new optional `onRecordAnotherTake`, the `retake` entry in `secondaryActions`, the shared clear-take helper, the refusal `StatusNotice`, `menuTriggerRef` and `returnFocusRef`); a new leaf module `apps/web/src/features/take-review/takeDiscardQuestion.ts` holding the one discard question both surfaces ask; `TakeDock.tsx:13-34` and `:310-320` (prop pass-through)                                                                                                                                                              |
| Studio composition      | `apps/web/src/studio/StudioApp.tsx` (the one gate; `restartCapture` from the launch hook; `confirmation` into that hook at `:263-277`; the `clearSource` bridge option at `:215`); `StudioWorkspace.tsx:91-101` and `:141-151` (the actions bag) and `:229-247` (the control-bar spread); `StudioToolOverlays.tsx:299-320`; `StudioTakeOverlays.tsx:66-82`; `StudioSessionControlBar.tsx:326-336`                                                                                                                                                                                                    |
| Capture launch          | `apps/web/src/studio/useStudioRecordingLaunch.ts` (options gain `confirmation`; the guard predicate extracted and mirrored into a ref, alongside a mounted ref; `startProjectRecording` rewritten; a new `restartCapture` beside `discardPendingAdoption` at `:314`; `captureSupported` and `restartCapture` added to the return block at `:320-331`)                                                                                                                                                                                                                                                |
| Other discard callers   | `apps/web/src/features/recording/RecordingAction.tsx:138` and its `:131` copy fix; `apps/web/src/studio/useStudioProjectBridge.ts:63-72` (option type, and the clear moved ahead of the ref null); `apps/web/src/features/existing-video/useExistingVideoWorkflow.ts:178-193` (`resetWorkflowState` and `reset` return boolean) and its two `reset(true)` callers, `apps/web/src/features/existing-video/ExistingVideoPanel.tsx:250` and `StudioApp.tsx:576`; `apps/web/src/studio/useStudioSessionLifecycle.ts:77-113`                                                                              |
| Unchanged, deliberately | `apps/web/src/orchestration/session/*` (the privacy posture); the `?intent=record` effect (`useStudioRecordingLaunch.ts:295-305`); `apps/web/src/ui/primitives/*`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Tests to change         | `apps/web/src/features/take-review/TakeDock.test.tsx`; `apps/web/src/studio/StudioSessionControlBar.test.tsx`; `apps/web/src/studio/StudioApp.test.tsx`; `apps/web/src/orchestration/recording/useRecording.test.tsx`; `apps/web/src/studio/useTakeReviewFlow.hook.test.tsx`; `apps/web/src/features/existing-video/useExistingVideoWorkflow.test.tsx`; `apps/web/src/studio/useStudioProjectBridge.test.tsx`; `apps/web/src/features/voice-effects/VoiceEffectsPanel.test.tsx`; `apps/web/src/orchestration/voice-processing/useVoiceProcessing.test.tsx`; `e2e/successful-studio-journeys.spec.ts` |
| Tests to add            | `apps/web/src/studio/useStudioRecordingLaunch.test.tsx` (no test file exists for this hook today). Two files this slice edits have no test file at all and gain none: `apps/web/src/features/recording/RecordingAction.tsx` (the directory holds only `RecordingControls.test.tsx`, `CaptureSettingsPanel.test.tsx` and `recordingHelpers.test.ts`, and no test anywhere renders its `'Start another take?'` dialog) and `apps/web/src/studio/useStudioSessionLifecycle.ts`. §3 says what covers each instead                                                                                        |
| Stories and baselines   | `stories/features/take-review/TakeReview.stories.tsx:84` renders the control-bar presentation directly; `docs/screenshot-test-coverage.md:44` protects `04-take-review/playback-review-settled.png`                                                                                                                                                                                                                                                                                                                                                                                                  |
| Docs                    | This plan and a row for it beside `docs/README.md:20-22`; `07-take-review-and-cleanup.md` (`:17`, `:30-32`, `:45-47`, `:51`, `:66`, `:70-73`); `02-local-camera-capture.md:28`; `docs/user-flows/studio-creation-workflows.md:179-183`; `docs/user-flows/projects.md:243`; `PRODUCT_ROADMAP.md:100-101`; `DOMAIN_MODEL.md` unconditionally, a glossary row for the retake beside **Take** (`:194`) and the **Recording session** row at `:200`                                                                                                                                                       |

## 3. Step-by-step implementation plan with the order of changes

### The model: what the slice adds and what it deliberately leaves alone

These are the decisions the rest of §3 rests on. Each is a routine call made the way the nearest
existing code makes it; the ones that could go the other way are in §5.

1. **The retake re-acquires the camera; it does not press Record.** "Restarts capture" is read as
   "the camera comes back and the stage is record-ready". Auto-arming the recorder would need new
   arm-on-source-arrival state with its own cancellation story, and it would have to invent a mode:
   after the review release `transformedVideoUsable` is false, so `resolveRecordingMode`
   (`useTakeReviewFlow.ts:31-34`) resolves to `'local'` and an AI take would be silently re-recorded
   as a local one. Q1.
2. **Discard before camera, always, in one owner.** The ordering is what keeps
   `07-take-review-and-cleanup.md:66` true in substance, and it is the ordering
   `startProjectRecording` already has (`useStudioRecordingLaunch.ts:246`, `:249`) without the
   assert that makes it safe. So the whole act, discard then clear the handoff then acquire, lives
   in one new `restartCapture` inside `useStudioRecordingLaunch`, the hook that already owns both
   `discardPendingAdoption` (`:314`) and `startLocalRecording` (`:219`). It answers `boolean` so the
   surface can show the refusal. Splitting it, with the discard in the component and the handoff
   reset in a `StudioApp` callback, would put two halves of one lifecycle act in a presentational
   component and a composition root with no way for either to know the other ran.
3. **The action lives in the one `secondaryActions` list** (`TakeReviewActions.tsx:122`), so the
   panel and the compact bar cannot disagree about whether it exists or when it is available, which
   is the reason the list exists (`:117-120`).
4. **`discard` returns a boolean, not a reason union and not a throw.** The two refusal conditions
   read identically to an operator, they coincide exactly with `recordingActive`
   (`useTakeReviewFlow.ts:133`), the in-repository precedent is a boolean
   (`useProjectSession.ts:21`), and a throw would break the cleanup coordinator
   (`SessionCleanupCoordinator.ts:33`). Q6.
5. **`discard`'s refusal conditions do not change.** No `processingState === 'processing'` guard is
   added, even though `start()` has one (`useRecording.ts:366`), because that would change behaviour
   at existing callers.
6. **The privacy posture is untouched.** No file under `apps/web/src/orchestration/session` changes,
   and no "hold the stream through review" flag is introduced. `releaseForRecordedReview` stays a
   one-line alias of `stopCamera` (`useStudioSession.ts:390-392`).
7. **The AI recipe is not restarted.** `startLocal` clears `applied` (`useStudioSession.ts:325`), so
   a retake after an AI take returns to local capture. Auto-restarting a provider session would make
   a paid step automatic, which the standing rules forbid (`IMPLEMENTATION_PROMPTS.md:22-23`).
8. **Framing state is not restored.** `release()` resets mic-enabled, camera-enabled and zoom
   (`useOwnedLocalMedia.ts:206-212`) and nothing in the canon promises they survive. Restoring them
   is real work in `useOwnedLocalMedia` and is out of scope. Q7.
9. **The retake is not offered inside a Project.** In a Project the stage renders `RecordingAction`
   in its own group (`StudioWorkspace.tsx:196`) rather than the take-review control bar, while the
   panel is still mounted (`StudioToolOverlays.tsx:299`); offering it in only one of the two would
   make the presentations disagree, and offering it in both would bypass `startProjectRecording`'s
   guards and navigation. Q3.
10. **The retake needs owned bytes.** A URL-backed `remote-presentation` is a Project source
    streamed over HTTP, not a take the runtime holds (`apps/web/src/features/recording/types.ts:56-59`),
    and the Project bridge deliberately keeps a presented source alive after its route is left
    (`useStudioProjectBridge.ts:31-32`), so `projectContextActive` alone does not exclude it. The
    same narrowing governs the studio-9 question, so neither dialog ever calls a streamed Project
    source a take (`DOMAIN_MODEL.md:194`).
11. **studio-8 lands before the feature.** The boolean and the call-site sweep are a separate,
    independently reviewable change, because the new action's safety rests on them.
12. **Docs are corrected in the same slice** (§2, Docs row), including the two stale canon lines in
    §1.7 that this slice's surface owns.

### The "Record another take" action

**The entry**, inserted immediately before the `close` entry (`TakeReviewActions.tsx:147`), so the
order reads replace, edit, voice, retake, close:

| Field          | Value                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `'retake'`                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `label`        | `'Record another take'`                                                                                                                                                      | The canon's own phrase (`PRODUCT_ROADMAP.md:100`; `TARGET_USER_FLOWS.md:49`), and **Take** is the domain term (`DOMAIN_MODEL.md:194`)                                                                                                                                                                                                                                                                                            |
| `compactLabel` | `'Record again'`                                                                                                                                                             | Follows `'Voice'` (`:141`) and `'Close'` (`:153`)                                                                                                                                                                                                                                                                                                                                                                                |
| `description`  | enabled: `'Discards this take and starts the camera again.'`; while `locked`: `'Available once processing finishes.'`; while `saving`: `'Available once the save finishes.'` | State-switched the way `closeDescription` already switches (`:112-114`), because this slot is the only place a disabled reason can be announced (`ActionMenu.tsx:22-23`). In the panel it is the item's second line and its `aria-describedby`, with the accessible name staying the label (`ActionMenu.tsx:94-96`, `:105-109`); in the compact bar the same string is the button's native `title` (`TakeReviewActions.tsx:188`) |
| `danger`       | absent                                                                                                                                                                       | A second red row beside the inline red Discard (`:177-181`) reads as a second Discard; `ActionMenu.tsx:92` is where danger would be marked. The confirmation carries the danger treatment                                                                                                                                                                                                                                        |
| `disabled`     | `locked \|\| saving`                                                                                                                                                         | The same gate as the inline Discard (`:178`). In the menu that is `aria-disabled`, so the item stays focusable and its reason announceable (`ActionMenu.tsx:32-34`)                                                                                                                                                                                                                                                              |

**What tells a compact-bar operator the press is destructive**, given no `danger` mark and a
`compactLabel` of `'Record again'`: the `title` tooltip carries the same sentence the menu shows,
and the confirmation fires on every press while `unsaved` (`:88`). When `unsaved` is false nothing
recoverable is destroyed, which is the same bargain `Close without saving` already strikes (`:90-93`).

**The handler, refusals before effects.**

1. Record the menu trigger into a ref. `ActionMenu` hands it to `onSelect` (`ActionMenu.tsx:101`)
   and its contract requires the dialog to return focus there (`:15`).
2. Clear the refusal notice.
3. If `unsaved` (`TakeReviewActions.tsx:88`), `await confirmation.ask(takeDiscardQuestion('retake'))`
   and return on decline. The request is the surface's own (`:79`), which is what
   `confirmationRequest.tsx:30-32` prescribes, and the copy comes from the shared module so the
   Project launch cannot drift from it.
4. `if (!onRecordAnotherTake()) { setRefusal(TAKE_STILL_FINALIZING_NOTICE); return; }`. The
   handler's whole side effect is that one call, which discards, clears the handoff and acquires,
   in that order and in one owner (model point 2). Nothing else runs, and no camera is asked for.
5. `onDiscardTake?.()`, the same existing-video selection reset the confirmed Discard calls
   (`:108`).

**Hook placement.** The `useState` for the notice and the `useRef` for the trigger go beside
`useTheme` (`:78`) and `useConfirmationRequest` (`:79`), **above** the early return at `:86`. Placed
with the code they serve, at `:90` or below, they would break the rules of hooks on exactly the
render where the take clears, which is every discard this slice adds.

**Which instance shows the notice.** Both presentations are mounted together (§1.4), so the notice
is local to the instance whose control was pressed. Only one of the two is pressable at a time,
because the panel's modal backdrop covers the control bar (`OverlayPanel.styles.ts:19-20`), so the
notice always appears where the operator is looking.

It never calls `onCloseTake`. `onCloseTake` would be a third closer with its own refocus
(`closeTakeReview` is `closeOverlay(); focusStudio();`, `StudioApp.tsx:178-181`). Two already fire
for one press and both are correct: the discard nulls `recording.presented`, which fires
`useTakeReviewFlow.ts:180-183` and reaches `closeOverlayIf(['take-review', 'voice-treatments'])`
(`StudioApp.tsx:192`), and `startLocalRecording` closes the overlay unconditionally
(`useStudioRecordingLaunch.ts:222`). Both are idempotent closes of the same overlay. **Exactly one
of them owns focus**, `focusMain()` at `:223`, which is `focusStudio` and puts focus on the Studio
main region on the next animation frame (`StudioApp.tsx:175-177`). Adding `onCloseTake` would add a
second `focusStudio` on a different schedule, and that is how focus fights start.

**The confirmation, only when `unsaved`**, is the existing take-review question with one added
sentence and one changed label. It has **one owner**, a new leaf module
`apps/web/src/features/take-review/takeDiscardQuestion.ts` exporting a builder that returns
`ConfirmationRequestOptions` (`confirmationRequest.tsx:5-11`) for the two acts that ask it. A leaf
string module rather than a shared component, following `captureLabels.ts:1-9`, whose docblock gives
the reason: two consumers in different layers should not drag a component graph across a boundary
for a string map. `apps/web/src/studio` already imports from this directory
(`StudioSessionControlBar.tsx:13`).

```
title:        'Discard this take?'                          // verbatim, TakeReviewActions.tsx:98
description:  'It only exists in this browser tab, so it cannot be recovered once you discard it.
               The camera starts again so you can record.'  // first sentence verbatim, :100
confirmLabel: 'Discard and record'                          // names both halves
danger:       true                                          // :102
```

Cancel stays the primitive default `'Stay'` (`ConfirmationDialog.tsx:45`), which also takes initial
focus (`:57`). This is the literal reading of "the existing confirmation": same question, same
danger, same loss sentence, plus one sentence naming the restart, because
`TARGET_USER_FLOWS.md:149` requires the UI to say exactly what is at risk. Only the confirm label
changes, because `'Discard take'` (`:101`) names half of what the operator pressed. Q2. The Project
launch takes the same object with its own second sentence, and nothing else differs.

When `unsaved` is false the action proceeds with no dialog, matching `Close without saving`, which
also discards unconfirmed (`:90-93`). Q5.

**A focus fix that also repairs today's Discard.** Pass `returnFocusRef={menuTriggerRef}` on the
dialog at `TakeReviewActions.tsx:200`.

- **Declined, from the panel menu:** the trigger is still mounted, `OverlayPanel.tsx:244` selects it
  over the captured opener, `:245` finds it connected and focusable (`overlayStack.ts:206`), and
  focus lands where `ActionMenu.tsx:15` says it must. That is today's bug, fixed.
- **Declined, from the compact bar:** the ref stays null, so `:244` falls through to the opener
  captured at `:166-168`, which is the compact button the operator pressed, still mounted.
- **Confirmed:** the whole take-review control set unmounts, both the menu trigger and the compact
  button with it (`TakeReviewActions.tsx:86`, `StudioSessionControlBar.tsx:325`), so `:245` fails
  and `:246` calls `focusTopmostDialog()`, which returns immediately because no dialog is left
  (`overlayStack.ts:208-209`). The restore is therefore a no-op and `focusMain()` keeps focus on the
  Studio main region, which is the single owner named above.

**What the restart is**, two existing calls and no new orchestration, added beside
`discardPendingAdoption` in `useStudioRecordingLaunch` and returned from the hook (model point 2):

```ts
const restartCapture = useCallback(() => {
  if (!captureSupported) return false; // useStudioRecordingLaunch.ts:103-105
  if (!recording.discard()) return false; // the studio-8 assert
  discardPendingAdoption(); // :314
  startLocalRecording(); // :219
  return true;
}, [captureSupported, discardPendingAdoption, recording, startLocalRecording]);
```

`StudioApp` passes it straight through as `onRecordAnotherTake`; it defines no callback of its own,
so there is nothing for a later reader to reorder.

`startLocalRecording` alone is not enough. It clears only the editor intent
(`useStudioRecordingLaunch.ts:221`), while an armed Create launch lives in `pendingCreateLaunchRef`
and `createLaunch` (`:264-267`) and would outlive the take it pointed at. `discardPendingAdoption`
clears both (`:315-317`). This is the same pairing the teardown already uses
(`useStudioSessionLifecycle.ts:78`, `:80`). `processing.cancel()` is not needed, because the action
is disabled while `locked`.

**Where it is offered, gated in exactly one place.** `StudioApp` supplies `onRecordAnotherTake` only
when `captureSupported && !projectContextActive && ownedRecordingArtifact(recording.presented) !== null`,
using the conditional-spread pattern already at `StudioWorkspace.tsx:237-239` and
`StudioToolOverlays.tsx:312`. `captureSupported` is computed at `useStudioRecordingLaunch.ts:103-105`
and has to be added to the return block (`:320-331`); `projectContextActive` is already destructured
in `StudioApp` (`:135`); `ownedRecordingArtifact` is not currently imported there, so that is a
one-line import from `../features/recording/types`. **No intermediate component re-derives any part
of it.** `StudioToolOverlays` does not reuse `presentedOwned` (`:147`) for this prop and
`StudioSessionControlBar` computes nothing of its own; each link passes the handler through with a
conditional spread, so the panel and the compact bar answer "is this offered" from one place, which
is the same reason the single `secondaryActions` list exists (model point 3).

- Without `captureSupported`, an action that discarded first would destroy the take and then hit
  `startLocalRecording`'s own return at `:220`. Two guards now prevent that: the gate withholds the
  action, and `restartCapture` refuses before the discard. The state still carries controls: capture is unsupported only where `browser.mediaRecorder`, `browser.mediaDevices` or
  `browser.secureContext` is missing (`:103-105`), so a take on such a browser can only have arrived
  by upload, and review still offers Save, Discard and Close, with `Upload Video` on the idle row
  (`StudioSessionControlBar.tsx:433-442`).
- `!projectContextActive` is model point 9.
- Owned bytes is model point 10.

The `retake` entry is itself built inside a conditional spread on `onRecordAnotherTake`, the shape
`secondaryActions` already uses for every optional entry (`TakeReviewActions.tsx:123`, `:133`,
`:136`), so the handler is narrowed to non-optional inside the closure and needs no `?.`.

**Threading**, all conditional spreads. Panel: `StudioApp` into `StudioToolOverlays.tsx:299-320` into
`StudioTakeOverlays.tsx:66-82` into `TakeDock.tsx:13-34` and `:310-320` into `TakeReviewActions`.
Control bar: the `StudioApp` actions bag (`:853-863`) into `StudioWorkspace.tsx:91-101` and
`:141-151` into `StudioSessionControlBar` and the spread at `:326-336`.

**States, per the UI checklist** (`IMPLEMENTATION_PROMPTS.md:44-49`). Empty: the surface returns null
without an artifact (`TakeReviewActions.tsx:86`). Processing: disabled via `locked` (`:81`), with the
reason in the description slot. Loading: the surface unmounts on discard, and the gap is narrated by
the control bar's existing `'Starting camera…'` (`StudioSessionControlBar.tsx:246`) over the idle
stage. Error: a failed acquisition sets the session error and the idle row returns with
`Start camera` (`:420-432`), whose handler delegates to the same `startLocalRecording` this action
uses when the workspace supplies it (`:426`, wired at `StudioWorkspace.tsx:142`), so retry and
retake share one owner. Refused: the notice below. Success: the stage goes live. First-time
clarity: the label says both halves and the description says what is destroyed.

**Reduced motion.** Nothing new animates. `Button` renders `busy` as `disabled` plus `aria-busy`
with no spinner (`apps/web/src/ui/primitives/Button.tsx:121-122`), and the notice is static. The one
animated thing the action touches is the confirmation overlay, which already skips its exit
transition under the preference (`OverlayPanel.tsx:139-141`, query at `:76-78`), under the global
rule that flattens every animation and transition
(`apps/web/src/ui/StudioDesignProvider.tsx:75-81`). No new keyframes, no new transition.

**Responsive, at both existing breakpoints.** Panel: the fifth menu row simply extends the
`ActionMenu` popover, and below tablet or 36rem the surface is already a single-column grid
(`TakeReviewActions.tsx:40`, `:47-53`) inside the bottom sheet (`07-take-review-and-cleanup.md:32-33`),
so the added row scrolls with the sheet rather than changing the layout. Compact bar: the fifth
control is the change, and §4 carries the grid arithmetic.

**No dead end.** A module constant,
`TAKE_STILL_FINALIZING_NOTICE = 'This take is still finishing, so nothing was discarded. Try again in a moment.'`,
one `useState<string | null>`, rendered through the existing primitive as
`<StatusNotice role="alert" tone="warning">` beside the save-error span
(`TakeReviewActions.tsx:197-199`). `StatusNotice` spreads unknown props onto its root
(`apps/web/src/ui/primitives/StatusNotice.tsx:37-46`), so `role` passes through, and the same
primitive already carries a refusal where a Project source removal fails
(`ProjectSourceSection.tsx:147-156`). The bare span at `:198` is the exception in this file, not the
pattern to copy. The notice is shared by all three discard handlers in the file and cleared at the
start of each. Review stays open and every control stays live.

**Media checklist.** Originals are preserved in the only sense this surface can promise them. The
retake destroys nothing durable: while `unsaved` it asks first and says the take cannot be
recovered, and when `unsaved` is false the take is either saved to the gallery this session or is an
unchanged video loaded from Assets, which is what makes `presentedHasUnsavedChanges` false
(`useStudioSavedVideoController.ts:119-126`), so the durable copy outlives the press either way.
Beyond that there is nothing new to clean up: the discard resets the artifact reducer
(`recordingArtifactState.ts:78`), the pending-revocation effect revokes the owned object URLs
(`useRecordingArtifacts.ts:76`), and the beforeunload guard disarms with the original slot
(`:262`). The second take is a new `MediaRecorder` over a new `MediaStream`
(`recordingAttempt.ts:190`). No worker, no provider, no paid call, and the 300 MB cap is untouched.

### What a discard answers

`discard: () => boolean` at `apps/web/src/features/recording/types.ts:233`, implemented at
`useRecording.ts:511-520`: `return false` at the existing guard (`:512`) and `return true` after the
reset (`:519`).

**The post-condition, documented as state and not as work:** _true means the runtime now holds no
take, including when it held none; false means one thing only, that a recorder attempt or its
on-device transcode still owns the bytes, so the take is still finalizing._ That single sentence is
what lets every call site read the answer with one check. Add a comment at `:512` recording that a
presented take implies both refs are null (`:149`, `:206-208`, `:237`), so the refusal is
effectively unreachable from the take-review buttons and the boolean earns its keep on the
programmatic paths.

**Call sites: the seven that exist today, plus the new one.** Five act on the answer by stopping;
two read it and deliberately continue, each with the reason written at the site. No site ignores it.

1. `TakeReviewActions.tsx:91` (Close without saving): route through the shared helper; on `false`
   show the notice and do not call `onCloseTake`.
2. `TakeReviewActions.tsx:107` (confirmed Discard): the same. Today this is the worst of the seven,
   because the operator answered "Discard take" and everything downstream proceeded.
3. The new retake, inside `restartCapture`: the same, and no camera is started.
4. `useStudioRecordingLaunch.ts:246`: see the next section.
5. `RecordingAction.tsx:138` becomes `if (recording.original && !recording.discard()) return;`
   before `recording.start` (`:139-140`).
6. `StudioApp.tsx:215` (`clearSource`): change the bridge option type to `() => boolean` and invert
   `useStudioProjectBridge.ts:70-71`, calling the clear first and nulling `presentedProjectIdRef`
   only on success. The outward `ProjectStageSourceRuntime['clear']` port keeps returning `void`
   (`:63`), so nothing downstream changes. **The inversion cannot strand more than the current order
   already does.** `presentedProjectIdRef` is read in exactly one place, this guard's second arm
   (`:66`), and is overwritten by the next `presentSource` (`:54`). Today a refusal nulls the ref
   while the take stays, which is precisely the phantom take the comment at `:57-62` exists to
   prevent; after the inversion a refusal leaves the ref naming the departed Project, which keeps a
   later clear for that same id matching instead of returning early. A clear for a different id
   returns early under both orders. What neither order can do is retry on the operator's behalf: the
   clear arrives from an unmounting source controller's passive cleanup, so on a refusal the take
   simply stays on the stage with its own review controls, and the refusal is transient because
   finalization is bounded (`recordingAttempt.ts:7`) and the transcode clears in a `finally`
   (`useRecording.ts:206-208`).
7. `useExistingVideoWorkflow.ts:181`: keep `clearOperation()` unconditional at `:180`, because it
   aborts the in-flight controller (`:170`), and gate only the dispatch at `:182`:
   `if (discardTake && !recording.discard()) return false;`. `resetWorkflowState` (`:178`) and
   `reset` (`:187`) return `boolean`; `reset` releases the retained job first (`:189`) and then
   delegates (`:190`), so that ordering is unchanged. **Two callers pass `true`, not one**:
   `ExistingVideoPanel.tsx:250` and `StudioApp.tsx:576` inside `resetDirectSavedVideoWork`, which is
   handed to the direct saved-video route at `:583`. `cleanup` (`:195`) passes `false` (`:197`) and
   is unchanged.
8. `useStudioSessionLifecycle.ts:80`: `discardLocalTemporaryWork` and `discardTemporaryWork` (`:95`)
   return the boolean upward without branching or throwing. `cleanupTemporaryState` (`:109-113`)
   is **the first of the two sites that read the answer and continue**, with a comment naming why:
   the runtime is unmounting, the artifact URLs are revoked anyway, and the cleanup coordinator must
   still reach `release-media` (`SessionCleanupCoordinator.ts:33`). The two consumers that stay in
   Studio (`StudioApp.tsx:882`, `:892-895`) are unreachable inside the refusal window (§1.3).

**The second site that continues, named rather than hidden:** the bridge stops at `clearSource`, so
a refusal does not propagate into `useProjectSourceController.clearStage()`
(`apps/web/src/features/projects/useProjectSourceController.ts:400`), which still declares the
Project sourceless. That is out of scope and it is not a dead end for the operator: the Project's
source panel returns to its Record control, the take is still presented on the stage with Save,
Discard and Close beneath it, and the runtime's own state is the truthful one. Propagating it would
mean giving the source controller a failure phase for a condition that clears itself within the
finalization bound (`recordingAttempt.ts:7`), which is a larger change than prompt 23 asks for.

**The hazard that will otherwise derail this.** Six hand-written `RecordingController` doubles type
`discard: vi.fn()`, which returns `undefined` and is therefore falsy, so under the new guards every
test discard reads as a refusal:

| File and line                                                                | Assertion that breaks                                                                     |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web/src/features/take-review/TakeDock.test.tsx:57`                     | `TakeDock.test.tsx:162` (`expect(onCloseTake).toHaveBeenCalledOnce();`)                   |
| `apps/web/src/studio/StudioSessionControlBar.test.tsx:81`                    | `StudioSessionControlBar.test.tsx:509-510`                                                |
| `apps/web/src/studio/StudioApp.test.tsx:203`                                 | composition cases                                                                         |
| `apps/web/src/features/existing-video/useExistingVideoWorkflow.test.tsx:110` | `:1245-1247` still passes under the gate-only-the-dispatch shape, but the double is wrong |
| `apps/web/src/features/voice-effects/VoiceEffectsPanel.test.tsx:76`          | none today                                                                                |
| `apps/web/src/orchestration/voice-processing/useVoiceProcessing.test.tsx:92` | none today                                                                                |

**The same trap, one file over.** Inverting the bridge (`:70-71`) makes its `clearSource` option
`() => boolean` too, and four doubles in `apps/web/src/studio/useStudioProjectBridge.test.tsx` are
bare `vi.fn()`: `:57`, `:111`, `:155` and `:200`. Under the inverted order an `undefined` answer
means `presentedProjectIdRef` is never nulled, so `:106`
(`expect(clearSource).toHaveBeenCalledTimes(2);`) and `:126`
(`expect(clearSource).not.toHaveBeenCalled();`) stop exercising the guard whose comment at `:57-62`
is the reason the file exists. They must move to `vi.fn(() => true)` in the same commit.

All ten must become `vi.fn(() => true)` **in the same commit as the signature change**, or the
failures point at the wrong code. **Typecheck does not find them.** This repository pins vitest 4.1.11
(`package.json:130`), whose `fn` is declared
`declare function fn<T extends Procedure | Constructable = Procedure>(originalImplementation?: T): Mock<T>;`
with `type Procedure = (...args: any[]) => any;`
(`node_modules/.bun/@vitest+spy@4.1.11/node_modules/@vitest/spy/dist/index.d.ts:398` and `:151`), so
a bare `vi.fn()` is a mock whose return type is `any` and assigns cleanly to `() => boolean`.

The four other `discard: vi.fn()` hits are for a different port this slice does not touch, and
should be left alone: `apps/web/src/studio/useStudioProjectBridge.test.tsx:47`,
`apps/web/src/studio/useStudioLogoutController.test.tsx:63` and `:95`, and
`apps/web/src/studio/useStudioSessionExpiryController.test.tsx:62`. Note what they are and are not.
They are `ProjectSessionPort` object literals closed by `as unknown as ProjectSessionPort`
(`useStudioLogoutController.test.tsx:64`), so the bare mock returns `undefined` and the cast hides
it; the port itself is the one that already answers boolean
(`apps/web/src/features/projects/useProjectSession.ts:21`). They are safe here only because their
consumer discards the answer today: `useStudioLogoutController.ts:42` is `projectSession?.discard();`
with the result unused. Fixing those casts is real, and separate from this slice.

### Confirming before a launch drops a take

The exported signature of `startProjectRecording` stays `() => void`, so
`ProjectSourceSection.tsx:185` and `StudioWorkspace.tsx:333` are untouched, with the asynchronous
work in an immediately-invoked function.

1. **Guard, now including `recordingActive`**, which is already an option of this hook
   (`useStudioRecordingLaunch.ts:25`) and is the exact proxy for "the discard will refuse"
   (`useTakeReviewFlow.ts:133`). It removes no reachable behaviour, because the button is already
   `busy={recordingActive}` (`ProjectSourceSection.tsx:184`) and `Button` couples busy to disabled
   (`Button.tsx:121`). Extract the predicate as a pure helper in the file so the guard and the
   re-check read one rule.
2. **Ask, before any side effect,** when `ownedRecordingArtifact(recording.presented) !== null`
   (`types.ts:56-59`), the same narrowing the retake uses (model point 10). Declining leaves the
   overlay, the route and the take exactly as they were; today `closeOverlay()` runs first (`:245`)
   and would tear down a surface for a launch the operator then declines. A URL-backed presentation
   is discarded without a question, because nothing unrecoverable is lost: the Project's source is
   durable on the server and the discard only clears the stage.
3. **Re-check the guard after the answer, and re-check that the runtime is still mounted.** The
   dialog is the shell's and survives a route change, so `activeProjectId` and
   `projectSourceActivity` can move under it. Mirror the guard inputs into a layout-effect-updated
   ref, the pattern already in the file this slice edits (`useStudioProjectBridge.ts:40-42`).
   **The mounted check is the one the mirrored guard cannot cover.** `useAwaitableQuestion`'s
   unmount safety (`:40`, `:52`) belongs to the instance that owns the request, and this one is the
   shell's (`AuthenticatedShell.tsx:42`), which does not unmount when the Studio runtime does; the
   runtime "is torn down on the way out of" the routes that own live media (`StudioApp.tsx:95`). If the runtime tears down while the dialog is open, `useOwnedLocalMedia`'s
   unmount cleanup has already stopped the owned stream (`useOwnedLocalMedia.ts:217-225`) and
   nothing else would stop a stream acquired afterwards, so an accepted answer would leave a live
   camera with no owner and no UI. So: a `mountedRef` in this hook, set `false` in an effect
   cleanup, checked immediately after the await, before the discard.
4. `if (!recording.discard()) return;`, with no navigation and no camera.
5. Then today's sequence: `setRecordingForExistingVideo(false)` (`:244`), `closeOverlay()` (`:245`),
   `navigate(...)` (`:247`), `focusMain()` (`:248`), `session.startLocal()` (`:249`).

**Copy**, from the same `takeDiscardQuestion` module as the retake, with the second sentence this
act needs. It says "take" only where a take is what is there, because the question is now gated on
owned bytes:

```
title:        'Discard this take?'
description:  'Recording for this Project replaces the take on the stage. It only exists in this
               browser tab, so it cannot be recovered.'
confirmLabel: 'Discard and record'
danger:       true
```

**What the shell's dialog costs on the decline path:** it is rendered with
`returnFocusRef={mainRef}` (`ShellLifecycleDialogs.tsx:46`), so declining returns focus to the
Studio main region rather than to the Record button. That is the shell's standing behaviour for
every question it asks, and this slice does not change it.

**Which confirmation object: the shell's.** Add `readonly confirmation: ConfirmationRequest` to
`UseStudioRecordingLaunchOptions` (`useStudioRecordingLaunch.ts:21-36`) and pass `confirmation` at
the call site (`StudioApp.tsx:263-277`), which already destructures it (`:111`) and hands it to three
other controllers (for example `:482`). It must be the shell's because this launcher navigates, and
`apps/web/src/app/shell/ShellLifecycleDialogs.tsx:28-29` states the reason: the shell "outlives every
surface that asks one, so a confirmation cannot be torn down by the navigation it is asking about".
The shell renders that dialog itself (`:46`), so the hook needs no dialog of its own.

**On a runtime refusal after a confirmed yes**, the launch aborts silently and the take stays on the
stage with its own review controls, which own the notice slot. Comment it as a defensive assert, so
a later reader does not turn it into a toast: with `recordingActive` in the guard and a modal
holding focus, it is not reachable. The same applies to the whole of studio-9 per §1.6: this is a
guard written because the code should be able to state its own rule, not because a press was found.

**Not changed:** the `?intent=record` effect (`useStudioRecordingLaunch.ts:295-305`), which starts
capture from a navigation with no click and no discard. Same defect class, but there is no click to
hang a confirmation on. Out of scope and named here so it is not lost. Q8.

### The camera posture

Release-on-review is untouched (model point 6). Exactly one fresh `getUserMedia`
(`browserMedia.ts:89`) is performed, through `session.startLocal()` from `startLocalRecording`
(`useStudioRecordingLaunch.ts:224`), and strictly after `recording.discard()` returned `true`.

`07-take-review-and-cleanup.md:66` stays true in substance, because review no longer owns the take
at the moment the camera is asked for. The sentence gains a clause rather than losing the guarantee:

> No camera or provider activity starts on its own while review owns the take. **Record another
> take** is the one way back to a live camera: it discards the take first, confirmed when unsaved,
> and only then re-acquires; a refused discard starts nothing.

Today that guarantee is only UI-shaped, since the control bar simply swaps the live controls out
(`StudioSessionControlBar.tsx:325`), which is precisely why `startProjectRecording` could bypass it.

**The Create another decision is distinguished, not overturned.**
`studio-creation-workflows.md:182-183` forbids auto-starting the camera for a post-save panel that
appears after any save, including one that began as an upload, and that leaves the operator on
`/studio/create` (`StudioApp.tsx:892-895`). Record another take is a press, named for recording,
that confirms before acting. A permission prompt the operator's own press asked for is not the
prompt that decision forbids. The docs update says both sentences explicitly.

**What the operator pays, stated honestly:** the mic-mute, camera-off and zoom state
(`useOwnedLocalMedia.ts:206-212`), the applied AI recipe (`useStudioSession.ts:325`), and a visible
gap while acquisition runs. Device, profile and aspect choices survive, because they are persisted
outside the media hook and the Studio session is not remounted between takes. Whether a second
`getUserMedia` re-prompts is browser behaviour that `docs/BROWSER_SUPPORT.md:208` assigns to
physical validation, and this audit contacted no browser.

### Order of changes for prompt 23

0. **Confirm before editing:** the discard guard (`useRecording.ts:512`), the seven call sites in
   §1.3, and that `useStudioRecordingLaunch` still has no test file. No code changes.
1. **Make the discard answerable.** `discard: () => boolean` (`types.ts:233`); `return false` at
   `useRecording.ts:512` and `true` after `:519`; the post-condition and reachability comments. No
   other behaviour in that function changes: no elapsed-seconds reset (the stage shows the timer only
   while `recording` is true, `StudioWorkspace.tsx:187` into `MediaStage.tsx:125` and `:139`), and no
   transcode abort.
2. **Sweep the ten falsy doubles to `vi.fn(() => true)`**, in this same commit: the six
   `RecordingController` ones and the four `clearSource` ones. Typecheck will not find them.
3. **Make the four non-review call sites read the answer:** `RecordingAction.tsx:138`;
   `useStudioProjectBridge.ts:70-71`; `useExistingVideoWorkflow.ts:180-182` with its two `reset(true)`
   callers; `useStudioSessionLifecycle.ts:77-113`. While `RecordingAction.tsx` is open, correct
   `:131` to name a **Take** rather than an "in-memory clip" (§1.5); it is one string in a file this
   step already edits, and leaving it is the terminology drift `IMPLEMENTATION_PROMPTS.md:47-48`
   forbids.
4. **Make take review honest, before any new action exists.** In `TakeReviewActions.tsx`: the
   refusal constant, one `useState` and one `useRef` placed above the early return at `:86`, a
   shared `clearTake()` helper, the existing Close (`:91`) and confirmed Discard (`:107`) routed
   through it, the `StatusNotice` beside `:197-199`, and `menuTriggerRef` plus `returnFocusRef` on
   the dialog at `:200`. At this commit the take-review surface no longer lies about a refused
   discard and no behaviour has been added; studio-8's last silent site, the launch hook at
   `useStudioRecordingLaunch.ts:246`, closes in step 5.
5. **studio-9, which also closes studio-8.** Add `confirmation` to the launch hook's options and
   pass it from `StudioApp`; extract the guard predicate and mirror its inputs, plus a mounted flag,
   into layout-effect refs; rewrite `startProjectRecording` as guard, then ask, then re-check, then
   assert the discard, then the existing sequence with `closeOverlay()` moved after the answer;
   return `captureSupported` from the hook (`:320-331`).
6. **Add the action.** The shared `takeDiscardQuestion` module; `restartCapture` in the launch hook
   and in its return block; the optional `onRecordAnotherTake` on `TakeReviewActions`; the `retake`
   entry before `close`; the handler.
7. **Thread the prop; the gate stays in one place.** `TakeDock`, `StudioTakeOverlays` (take view
   only), `StudioToolOverlays`, `StudioSessionControlBar`, `StudioWorkspace`'s actions bag, each a
   conditional spread that re-derives nothing; then the single three-part gate in `StudioApp`, which
   is the only place `ownedRecordingArtifact` is consulted for this action.
8. **Tests, then canon** (both lists below).

**Tests.**

- `useRecording.test.tsx`, all new, because nothing pins the refusal today: `discard()` answers
  `true` from a settled take and with nothing to discard; `false` while `lifecycle === 'recording'`;
  `false` during the transcode window, deferring the harness's mockable transcode
  (`useRecording.test.tsx:239`); `true` again once it resolves. The file's only two `discard()` calls
  today are `:566` and `:971`, both from a settled state where the guard never fires (`:547` is the
  `it(` line of the case that contains the first).
- `TakeDock.test.tsx` (panel): the retake is a menu item; `'Stay'` calls neither `discard` nor
  `onRecordAnotherTake`; `'Discard and record'` calls `discard` then `onRecordAnotherTake`, asserted
  in that order through `invocationCallOrder`, which is the guard that keeps `07:66` true, and never
  `onCloseTake`; a `restartCapture` answering `false` leaves review open with the notice and calls
  nothing further; with `hasUnsavedChanges={false}` there is no dialog; cancelling returns focus to
  the "More actions for this take" trigger (`:181`). The same refusal case for the plain Discard
  button is the studio-8 regression guard.
- `StudioSessionControlBar.test.tsx`, which is where the compact presentation is proved because it
  is the only suite that renders it: `'Record again'` renders inside the `'Recorded take controls'`
  group (`:397`) when the handler is supplied and not when it is withheld, which proves both gates
  at the component boundary; a confirmed retake runs discard then restart; **a refused one shows the
  notice in this presentation too**, which is the case that would otherwise only ever be exercised
  in the panel; and cancelling returns focus to the pressed compact button, which is the branch
  where `returnFocusRef` is null and `OverlayPanel.tsx:244` falls through to the captured opener,
  because the compact path hands `onSelect` a `null` trigger (`TakeReviewActions.tsx:189`). The
  presence checks at `:397-404` are individual queries rather than an exhaustive set, so a fifth
  control does not fail them; strengthening them is a deliberate choice, not a fix.
- `useTakeReviewFlow.hook.test.tsx`: clearing the presented take fires `onReviewCleared`
  (`useTakeReviewFlow.ts:180-183` has no test today), which is what stops the restarted camera coming
  up behind an overlay. The `events` array pattern at `:80` and `:123` extends to prove ordering.
- **New** `apps/web/src/studio/useStudioRecordingLaunch.test.tsx`, the prompt's "recording-launch
  tests" (`IMPLEMENTATION_PROMPTS.md:273`). Mock `useNavigate`; spy `recording`, `session` and
  `confirmation`. Cases: no presented take means no question and today's behaviour; declined means no
  discard, no navigate, no `startLocal` and an untouched overlay; accepted means discard before
  navigate before `startLocal`; a `discard` of `false` means no navigate and no `startLocal`;
  `recordingActive` returns without asking; the Project changing while the dialog is open aborts;
  **unmounting the hook while the dialog is open aborts, with no `startLocal`**, which is the one
  case the mirrored guard ref cannot catch because the request belongs to the shell; unsupported
  capture, `accepted` and `busy` each return before asking; a URL-backed presentation is discarded
  with no question. Also `restartCapture`: it answers `false` and starts nothing when the discard
  refuses, and otherwise discards before `discardPendingAdoption` before `startLocal`.
- `StudioApp.test.tsx`: one composition case that the prop is supplied outside a Project and withheld
  inside one, asserted through the stubbed `TakeDock` props (`:418-419`), since `RecordingAction` is
  a bare button there (`:390`). Plus one case for the second `reset(true)` caller: the direct
  saved-video route's `resetDirectSavedVideoWork` (`StudioApp.tsx:574-578`, handed to the route at
  `:583`), which no test exercises today and which `useDirectSavedVideoRoute.ts` has no test file
  of its own to cover.
- **Two changed files get no direct test, stated rather than glossed over.**
  `RecordingAction.tsx:138` and `useStudioSessionLifecycle.ts:80` have no test file in the
  repository, and this slice adds none, because each change is a one-line guard on a call whose
  behaviour is pinned one layer out: the lifecycle path is covered by
  `useStudioSessionCleanup.test.tsx`, and the Record-button path only by the falsy-double sweep in
  step 2. The consequence is that `RecordingAction`'s confirmation copy, including the `:131` string
  this slice corrects, remains untested; that gap predates the slice and is named in the completion
  report rather than silently inherited.
- `e2e/successful-studio-journeys.spec.ts`: one new journey. `createLocalTake`
  (`e2e/support/studioHarness.actions.ts:112-125`) leaves the panel open (`:124`), and `OverlayPanel`
  renders a `position: fixed; inset: 0` backdrop
  (`apps/web/src/ui/primitives/OverlayPanel.styles.ts:19-20`) around an `aria-modal="true"` dialog
  (`OverlayPanel.tsx:288`), so drive the action through `chooseTakeAction`
  (`studioHarness.actions.ts:140-148`) rather than a control-bar click. Snapshot `readBrowserState`
  (`e2e/support/studioHarness.browser.ts:265`) before, with `cameraCalls === 1`
  (`:210`) and `lifecycleEvents` containing `'local-video-stopped'` (`:90`), and poll to `2` after,
  the technique at `e2e/successful-studio-journeys.spec.ts:911`. Two snapshots either side prove
  release-then-reacquire without touching the shared harness; the index-comparison alternative is at
  `:358-369`. Do **not** extend `createLocalTake` or `discardTake` (`studioHarness.actions.ts:150-156`),
  because `studio.visual.spec.ts` and `capture-screenshots.screenshots.ts` share them and the
  existing `expect(browser.cameraCalls).toBe(1);` after a plain discard (`:269`) must keep passing.
- Suites that must stay green because their files change: `useStudioProjectBridge.test.tsx`, the
  existing-video workflow and panel tests, `useStudioSessionCleanup.test.tsx`,
  `useStudioLogoutController.test.tsx`, `useStudioSessionExpiryController.test.tsx`,
  `StudioExitGuard.test.tsx`, `VoiceEffectsPanel.test.tsx`, `useVoiceProcessing.test.tsx`.

**Docs.** `07-take-review-and-cleanup.md`: the compact control list at `:17` and the panel menu list
at `:30-32` gain the action; step 10 (`:45-47`) gains a third deliberate exit; the guard at `:66` is
rewritten as above; the Evidence status paragraph (`:70-73`) gains the retake journey; and the stale
line at `:51` is corrected (§1.7). `02-local-camera-capture.md:28` gains the action and drops the
retired `Release` (`DOMAIN_MODEL.md:209`). `studio-creation-workflows.md:179-183` distinguishes
Create another from this press. `projects.md:243` says Record now confirms first.
`PRODUCT_ROADMAP.md:100-101` is annotated `— **implemented <date>**`. That is not an established
pattern: `:92` is the file's only such annotation, and the three Phase 2 slices that landed before
it carry none on their slice lines (2.1 at `:85`, 2.3 at `:88`, 2.4 at `:90`), their landing being
recorded in the current-state audit instead (`CURRENT_STATE_AUDIT.md:204`, `:129`, `:147`). Every
Phase 1 slice line is likewise unannotated. So this is a deliberate choice to follow slice 2.5's
sole precedent rather than an existing convention, and it comes with the obligation the other three
met: mark studio-2 closed at `CURRENT_STATE_AUDIT.md:151-152` in the same edit, and give studio-8
and studio-9 the evidence record §1.7 says they lack.

`DOMAIN_MODEL.md` gains a glossary row for the retake beside **Take** (`:194`), under every answer
to Q4, because the slice ships a user-visible label, a compact label and an internal id for a
concept the glossary does not name; and the **Recording session** row at `:200` gains the loop back
from take review to an explicit start. A row for this plan goes beside `docs/README.md:20-22`.
Regenerate the `04-take-review/playback-review-settled.png` baseline
(`docs/screenshot-test-coverage.md:44`).

**Validation (per `CLAUDE.md`), strictly sequential, never Vitest and Playwright together
(`docs/TESTING.md:86`):**
`vitest run apps/web/src/features/take-review apps/web/src/features/recording apps/web/src/features/existing-video apps/web/src/orchestration/recording apps/web/src/studio`;
`bun run typecheck`; lint on the touched files; then, separately,
`bunx playwright test e2e/successful-studio-journeys.spec.ts`; then the `04-take-review` baseline;
then `bun run format:check`, `bun run check:docs` and `bun run check:retired-program`.

**The bundle budget is checked, not waived.** The UI checklist requires budgets green
(`IMPLEMENTATION_PROMPTS.md:49`), and the oracle is `check:build-manifest` (`package.json:65`),
whose ceilings are `BUILD_CLOSURE_BUDGETS` at `scripts/check-build-manifest.mjs:5`. This slice adds
code to the Studio closure, whose ceiling is `'src/studio/StudioApp.tsx': 1_088_000` (`:109`), so
run `bun run build` (`package.json:36`) followed by `bun run check:build-manifest`. The shell
closure (`:83`) is untouched, because the new leaf module is imported only from Studio-side files.

Deliberately not run: the whole Vitest suite, all Playwright specs, and `bun run quality`
(`package.json:82`), because nothing here touches auth, persistence, dependencies or the API, and
the two checks inside `quality` that this change could actually move, the build and the build
manifest, are run on their own above. No provider is contacted at any step.

## 4. Risks and dependencies

- **A failed re-acquisition leaves the operator with nothing.** The take is discarded before
  `session.startLocal()`, so a denied permission, a camera held by another application, an
  exact-aspect rejection (`browserMedia.ts:75`) or a missing live audio track (`:94`) ends with no
  take and an error lifecycle. The ordering cannot be inverted, because acquiring first would start a
  camera while review still owns the take. Mitigated by the confirmation copy, by the idle row's
  `Start camera` (`StudioSessionControlBar.tsx:420-432`, whose handler is the same
  `startLocalRecording` the retake uses, `:426`), and by `02-local-camera-capture.md:40-41`, which
  keeps retry an explicit Start. Q9.
- **The falsy test doubles.** If step 2 does not land with step 1, seven suites fail in places
  unrelated to the change and typecheck does not point at them. A hurried "make the stub return true"
  without reading each one would hide a real assertion, and the four `clearSource` doubles are the
  easiest to miss because they sit in a different file from the signature that changed.
- **Framing state is lost across the loop.** Mic mute, camera off and zoom all reset
  (`useOwnedLocalMedia.ts:206-212`), and a retake is exactly where an operator expects framing to
  persist. Restoring it is real work in `useOwnedLocalMedia` and is not in this slice. Q7.
- **A retake after an AI take returns to local capture,** with the experience label still selected
  but not applied (`useStudioSession.ts:325`). Correct cost posture, but a real behaviour change from
  the operator's point of view; it belongs in the completion report.
- **Two dialogs remain, for two different acts.** `RecordingAction.tsx:129-134` keeps
  `'Start another take?'`, `'Start new take'` and `'Keep current take'` for pressing Record on a live
  stage that already holds an original, while take review and the Project launch ask
  `'Discard this take?'` with `'Discard and record'`. They guard different acts, one arms the
  recorder and one acquires a camera, and they are never seen together (§1.1), so two questions is
  correct. What was not correct was naming the object two ways: step 3 fixes `:131` so both call it a
  **Take** (`DOMAIN_MODEL.md:194`). The two take-discard questions that _are_ one act share one
  owner, `takeDiscardQuestion.ts`, so they cannot drift. Aligning the live-stage labels as well is a
  copy decision for a later slice, not a duplicate pathway.
- **Layout.** The compact bar goes from four controls to five (§1.4), and five children fill exactly
  six cells of the three-column grid below 22.49rem (`TakeReviewActions.tsx:55-60`), which is two
  rows and unchanged in height; four children already occupied two rows. The one thing that pushes a
  third row is a visible notice, which is itself a grid child (`:197-199`). Check both in the
  regenerated baseline, and note the panel is unaffected because it is a single-column grid at its
  own breakpoint (`:40`, `:47-53`).
- **The Assets naming is left as it is.** `DOMAIN_MODEL.md:66` says "Asset" never names a surface,
  while this surface says `'Save to Assets'` (`TakeReviewActions.tsx:174`) and "stays in Assets"
  (`:113`). §1.7 explains why that is a separate decision; the risk is that a reader takes this
  slice's two canon corrections as a full pass over the surface's terminology, which they are not.
- **`startProjectRecording` becomes asynchronous after a click.** The re-check ref covers the guard
  inputs, but the navigation now happens after an await; a reviewer should confirm the ref is updated
  in a layout effect and not during render.
- **`startProjectRecording`'s question may guard nothing today.** §1.6 could not construct a
  reachable press, so the confirmation, the `recordingActive` guard, the mounted check and the assert
  are all code truth and defence in depth. They should be reported that way, not as a fixed bug.
- **Five call sites change behaviour on a refusal that is effectively unreachable from the UI**
  (`useRecording.ts:149`, `:206-208`, both before `:237`). The code becomes more truthful, but the
  new branches are covered at the hook level rather than through the interface. studio-8 should not
  be sold as a user-visible improvement.
- **`isRecordedTakeMetadata` is a trap if anyone reaches for it.**
  `apps/web/src/features/recording/types.ts:101` declares `kind?: 'recorded';` as **optional**, while
  `:114` declares `kind: 'uploaded';` as required. A predicate written as `kind === 'recorded'` would
  withhold the action from ordinary recorded takes. This design narrows through
  `ownedRecordingArtifact` (`:56-59`) and adds no such predicate.
- **No test pins the order of `secondaryActions`.** `TakeDock.test.tsx:181-183` and the e2e helpers
  select menu items by name, so an insertion at any index passes, and the ordering the file's comment
  defends stays unenforced after this change too.
- **Dependencies.** None outside `apps/web`. No domain, contract, API, schema or storage change; no
  new package; no route change, so `apps/web/src/app/route-inventory.test.ts` and `paths.test.ts`
  are untouched.

## 5. Questions whose answers change the implementation

Ten questions change what prompt 23 builds. Each carries a recommendation and what the other answer
costs. **Q1 is the only one that changes the shape of the work**; the rest change copy, placement or
one predicate.

**Q1: does "restarts capture" mean the camera, or the recorder?** Recommended: the camera only, as
in model point 1. This design re-acquires and hands back a record-ready live stage; the operator
presses Record. Auto-arming needs new arm-on-source-arrival state with its own cancellation story
(navigation away, a denied permission, a source that never arrives), and it must source a mode and a
`characterAttribution` that `RecordingAction.tsx:139-140` receives from the control bar; after the
review release `transformedVideoUsable` is false, so `resolveRecordingMode`
(`useTakeReviewFlow.ts:34`) would silently record an AI take as a local one.

**Q2: which confirm label, `'Discard and record'` or `'Discard take'` verbatim?** Recommended:
`'Discard and record'`, keeping the title and the loss sentence verbatim
(`TakeReviewActions.tsx:98`, `:100`). Verbatim is the most literal reading of "the existing
confirmation" and leaves every string the e2e `discardTake` helper hard-codes
(`e2e/support/studioHarness.actions.ts:153-154`) untouched, but the button then names half of what
the operator pressed. This decides copy in two dialogs and in one new e2e journey.

**Q3: is the retake correctly scoped out of a Project?** Recommended: yes, keep it out, per model
point 9. A Project stage renders `RecordingAction` (`StudioWorkspace.tsx:196`) rather than the review
control bar, while the panel is still mounted (`StudioToolOverlays.tsx:299`), so offering it would
make the two presentations disagree. Saying yes is not a flag flip: the panel action would have to
route through `startProjectRecording` with its `accepted` and `busy` guards
(`useStudioRecordingLaunch.ts:237-241`) and its navigation (`:247`), and the two confirmations would
then collapse into one.

**Q4: is the retake offered over an uploaded video, or a URL-backed Project source?** Recommended:
offered over an uploaded video and withheld from a URL-backed presentation, which is what the owned
bytes gate does (model point 10). "Record instead of this upload" is a real intent. Restricting it
further needs a provenance predicate the surface cannot express safely today (the `kind` trap in §4)
and a relabel to `'Record a take'`, because there was no first take. Either answer still needs the
`DOMAIN_MODEL.md` glossary row, which this plan makes unconditional (§2, Docs row).

**Q5: does the retake still confirm when the take is already saved?** Recommended: no, matching
`Close without saving`, which also discards unconfirmed (`TakeReviewActions.tsx:90-93`). Note the
asymmetry this creates: `startProjectRecording` confirms whenever a take is presented, because the
launch hook cannot see saved-ness. If that is unacceptable, `savedVideo.presentedHasUnsavedChanges`
is already at the workspace boundary (`StudioWorkspace.tsx:241`), so threading it into
`useStudioRecordingLaunch` is plumbing rather than new state, but it is plumbing for a rarely-hit
branch.

**Q6: boolean, or a reason union?** Recommended: boolean, as the prompt states
(`IMPLEMENTATION_PROMPTS.md:271`) and as the in-repository precedent does
(`useProjectSession.ts:21`). The two refusal conditions read identically to an operator and the
single notice covers both. A reason union would only pay for itself if some call site wanted
different copy per condition, and none does. Note the tension the UI checklist raises
(`IMPLEMENTATION_PROMPTS.md:49`): a call site that learns only `false` cannot say _which_ thing is
still running, which is why the notice says "still finishing" rather than naming a transcode.

**Q7: should the retake restore the operator's zoom and mic or camera toggles across the release?**
Recommended: no for this slice, per model point 8. Nothing in the canon promises they survive, and
`release()` resets all three (`useOwnedLocalMedia.ts:206`, `:207`, `:212`). A retake loop is
nevertheless exactly where an operator would expect framing to persist, so this is the most likely
follow-up the slice generates.

**Q8: is the `?intent=record` effect in scope?** Recommended: no.
`useStudioRecordingLaunch.ts:295-305` starts capture from a navigation with no click and no discard,
so a take presented at that moment leaves the operator with a live camera behind a locked playback
stage and no record control. It is the same defect class as studio-9, but there is no click to defer
and the fix would have to pose a confirmation after a navigation that already happened. Naming it as
a follow-up is honest; folding it in widens the slice.

**Q9: should the discard be deferred until acquisition succeeds?** Recommended: no. Deferring would
mean asking for a camera while `recording.presented` is still set, which is exactly what
`07-take-review-and-cleanup.md:66` forbids and what this plan's ordering exists to prevent. The cost
of the recommendation is §4's first risk, and the mitigation is the copy plus the explicit
`Start camera` retry the canon already requires (`02-local-camera-capture.md:40-41`).

**Q10: does "camera-release-after-review remains the default" mean an operator-visible
alternative?** Recommended: no, read it as "unchanged". Prompt 23's word is "default"
(`IMPLEMENTATION_PROMPTS.md:270`), but the canon states the behaviour as an invariant rather than a
preference (`07-take-review-and-cleanup.md:66`), nothing in the product exposes a
hold-the-stream-through-review setting, and adding one would mean new state in
`apps/web/src/orchestration/session` plus a privacy sentence the canon does not have, which is model
point 6's scope line. If the answer is instead that an operator-visible alternative is expected,
this slice changes shape: a persisted preference, a Settings control, and a review surface that must
say which posture is active. Worth asking once before step 1 rather than discovering it at review.

Everything else in §3 (the entry's id, the compact label, the description text, the notice wording,
the position before `close`, the shape of the shared helper) is a routine call made the way the
nearest existing code makes it, and prompt 23 proceeds on those defaults.

## 6. Verification evidence (prompt 23), 2026-09-07

Prompt 23 implemented this plan; this section was written by prompt 24 while walking Phase 2's
acceptance criteria, because prompt 23 is a **(B)** prompt with no paired **(C)** verification
prompt and the slice would otherwise be the only Phase 2 slice with code and no evidence record.
Slice 2.6 carries no roadmap acceptance criterion of its own, so the three things prompt 23 asked
for are taken as the three claims below. No camera, microphone or provider was opened at any step:
every capture path in the evidence runs against a substitute, named where it is used. Each
subsection gives the case that establishes the claim, what kind of case it is, and a file and line
for every claim made about the code.

### 6.1 One action discards the take and returns a record-ready camera (studio-2)

**The case.** `e2e/successful-studio-journeys.spec.ts:658`, "Record another take clears the reviewed
take and reacquires the camera for a second recording". This is a browser journey against in-page
simulators, which is the strongest kind of evidence any Phase 2 slice produced for a user-visible
loop. It first pins the state the retake has to reverse: one camera acquisition spent and the local
tracks already stopped before review rendered (`:672-673`). It then chooses the action from the
panel's own overflow (`:677`), confirms through the shared dialog (`:679-681`), and asserts the
review panel hidden, the playback element gone, the live preview visible and the stage back to
`data-stage-presentation="live"` (`:683-689`). The release-then-reacquire proof is the camera count
reaching exactly two (`:692`), not one held stream. The loop is then closed for real: it records
again, stops, and reaches an enabled **Save** (`:695-703`), with recorder starts doubled and every
recorder stopped (`:712-713`).

**What that journey substitutes, stated rather than implied.** `navigator.mediaDevices.getUserMedia`
is replaced at `e2e/support/studioHarness.browser.ts:206-214`, and it is that substitute which
increments the `cameraCalls` the journey asserts on. `MediaRecorder` is replaced at `:202-205`. So
the journey proves the application's acquisition and release ordering, and proves nothing about a
physical camera's behaviour on a second acquisition. That is the manual gate
`docs/BROWSER_SUPPORT.md` describes, and it was not run.

**The one place the action is offered or withheld.** `apps/web/src/studio/StudioApp.tsx:832`, whose
three conditions are a browser that can capture, a stage not in Project context, and an owned
recording artifact. Its comment at `:824-831` gives a reason per condition. The gate is a component
test, not a journey: `apps/web/src/studio/StudioApp.test.tsx:1004`, "withholds the retake from the
take panel inside a Project and offers it outside one", asserts the prop absent at `:1034` and
present after navigating out of the Project at `:1042-1044`, with the same take and the same open
panel. The third condition, a URL-backed presentation, is asserted one layer down at
`apps/web/src/studio/useStudioRecordingLaunch.test.tsx:469`.

**The surface.** One entry in the `secondaryActions` array take review already renders two ways, at
`apps/web/src/features/take-review/TakeReviewActions.tsx:277`, deliberately carrying no `danger`
mark for the reason written at `:280-281`. Six component tests against that surface cover it:
the row and its spoken description (`apps/web/src/features/take-review/TakeDock.test.tsx:186`), a
declined discard leaving the take standing with focus returned (`:209`), a confirmed retake
discarding before the surface does anything else, asserted by invocation order (`:277`), a refused
restart leaving review open with a notice (`:316`), an already-saved take skipping the question
(`:357`), and a refused plain Discard behaving the same way (`:382`).

**The shared question.** `apps/web/src/features/take-review/takeDiscardQuestion.ts:33`, one leaf
string module with a description per act at `:13-18`, so the two askers cannot drift on what the
operator is told is at risk.

### 6.2 A discard answers whether it ran (studio-8)

**The case.** The signature changed at
`apps/web/src/orchestration/recording/useRecording.ts:516`, where `discard` is now
`useCallback((): boolean =>`. The answer is established by four unit tests in the describe at
`apps/web/src/orchestration/recording/useRecording.test.tsx:1390`: true from a settled take, leaving
the runtime holding none (`:1391`); true with nothing to discard, because the answer is the state
that follows rather than the work done (`:1414`); false while a recorder attempt still owns the
bytes, with the attempt kept (`:1430`); and false across the on-device transcode, then true once it
resolves (`:1458`).

**What kind of evidence this is.** Unit tests against a recorder harness. They establish the
post-condition the signature promises. They do not establish that any of the five call sites the
plan changed can be made to see a `false` from the interface, and §4 records that the refusal is
effectively unreachable from the UI.

### 6.3 A Project recording asks before it drops a presented take (studio-9)

**The case.** `apps/web/src/studio/useStudioRecordingLaunch.ts:350`, where `startProjectRecording`
answers a refusal or nothing. Ten unit tests in the describe at
`apps/web/src/studio/useStudioRecordingLaunch.test.tsx:265` cover it: no question when the stage
holds no take (`:266`), a declined question leaving the take, the overlay and the route alone
(`:281`), the order discard-then-navigate-then-camera (`:302`), a launch stopped when the runtime
refuses to give up a still-finalizing take (`:324`), two in-flight answers (`:341`, `:359`), the
Project moving under the open question (`:399`), the runtime unmounting under it (`:417`), a
question that throws read as a decline with the rejection kept off the window (`:437`), and a
URL-backed Project source dropped without a question (`:469`). Three further cases cover
`restartCapture` itself at `:484`, `:507` and `:535`.

**What kind of evidence this is.** Unit tests against a hook with mocked collaborators. The
confirmation, the guard, the mounted re-check and the assert are all exercised, and none of them is
exercised through the interface, because §1.6 could not construct a reachable press.

### What is established

- One press on take review discards the take and returns a record-ready camera, proven in Chromium
  through the real application code, with the second acquisition counted rather than inferred.
- The camera posture did not change: the stream is still released before review renders, and the
  retake pays one fresh acquisition.
- The action is offered from exactly one condition, and that condition withholds it inside a Project
  and over a Project source streamed from the server.
- A discard answers whether it ran, with the answer defined as the state that follows rather than
  the work performed, and it answers false while a recorder attempt or an on-device transcode still
  owns the bytes.
- A Project recording launch asks before it drops an owned presented take, does not ask for a
  server-streamed one, and abandons the launch when the Project or the runtime moves under the open
  question.
- The two take-discard questions that are one act share one owner, so their copy cannot drift.

### What is not established, or is assumed

- **Framing state is lost across the loop.** Mic mute, camera off and zoom all reset
  (`useOwnedLocalMedia.ts:206-212`), and a retake is exactly where an operator expects framing to
  persist. §4 records it; nothing in this slice restores it. Q7.
- **The `startProjectRecording` question may guard nothing reachable.** §1.6 could not construct a
  press that reaches it from the interface. The confirmation, the guard, the mounted check and the
  assert are code truth and defence in depth, and should be reported that way rather than as a fixed
  user-visible bug.
- **studio-8's call sites change behaviour on a refusal that is effectively unreachable from the
  UI.** Six non-test sites now read the answer: `useStudioSessionLifecycle.ts:84`,
  `useStudioRecordingLaunch.ts:331` and `:493`, `RecordingAction.tsx:155`,
  `useExistingVideoWorkflow.ts:187` and `TakeReviewActions.tsx:161`. Their new branches are covered
  at the hook and component level, not through the interface, so studio-8 is a truthfulness
  improvement rather than a user-visible one.
- **No test pins the order of `secondaryActions`.** `TakeDock.test.tsx` and the e2e helpers select
  menu items by name, so an insertion at any index passes, and the ordering §3 defends stays
  unenforced.
- **A retake after an AI take returns to local capture** with the experience label still selected
  but not applied (`useStudioSession.ts:325`). This is the correct cost posture and a real behaviour
  change from the operator's point of view.
- **No physical camera was opened.** Every acquisition in the evidence is the in-page substitute at
  `e2e/support/studioHarness.browser.ts:206`. A real device's behaviour on a second
  `getUserMedia` after a full release, including a permission prompt reappearing or a camera held by
  another application, is the manual gate in `docs/BROWSER_SUPPORT.md` and was not run.
- **The compact bar's fifth control was not separately re-captured.** §4 predicted two rows and
  unchanged height below 22.49rem. The visual suite passed at 50 of 50 on Darwin and 31 of 31 on
  Linux for this candidate, and no take-review baseline was among the three found stale
  ([Phase 2 verification](../audits/PHASE_2_VERIFICATION.md)), but a change under the 0.5 percent
  tolerance would not have shown, so this is a green suite rather than an inspection.
