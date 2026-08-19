# Studio and Creation Workflows

Studio is the local-first creation surface at `/studio/create` (plus the deep-link-only
`/studio/{savedVideoId}`). Everything here is in-memory until an explicit **Save to Assets**.

## Entry points

| From                                               | Result                                                         |
| -------------------------------------------------- | -------------------------------------------------------------- |
| Dashboard **Create video**                         | `/studio/create`                                               |
| Quick Create ▸ **New video**                       | `/studio/create`                                               |
| Quick Create ▸ **Create Asset** ▸ Video ▸ Record   | `/studio/create?intent=record` — capture starts automatically  |
| Quick Create ▸ **Create Asset** ▸ Video ▸ Upload   | `/studio/create?intent=upload` — upload overlay opens          |
| Assets hub **Upload video**                        | `/studio/create` + router state `{ creationIntent: 'upload' }` |
| Videos library **Open in Studio** / **Edit video** | `/studio/create` (**replace**) with the video already loaded   |
| Characters/Outfits library actions                 | `/studio/create` + the matching builder overlay                |
| Project overview ▸ Assets ▸ add video              | `/studio/create?projectId={id}[&intent=…]`                     |
| Quick Create ▸ **Live AI · Beta**                  | `/studio/create/live`                                          |
| Direct URL `/studio/{uuid}`                        | Loads that Saved Video's current Version into review           |

## The Studio stage

`MediaStage` (`features/live-stage/MediaStage.tsx`) is mounted for the whole Studio visit — it
belongs to the runtime, which leaves when the operator does — and shows one of four presentations derived by `deriveTakeStagePresentation`
(`studio/useTakeReviewFlow.ts:32-68`):

| Presentation | When                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `idle`       | No stream, no take. Shows the first-take guide when enabled                                                  |
| `live`       | A display stream exists (local camera, or provider output when a model session is transforming usable video) |
| `finalizing` | Recording is stopping, or a finalization window is open                                                      |
| `playback`   | A presented take exists and review is ready                                                                  |

Overlaid controls come from `StudioSessionControlBar` (`studio/StudioSessionControlBar.tsx`):
Switch camera, zoom out/in, **Record New Video**, **Upload Video**, **Start AI** / **Change
experience**, mute microphone, camera on/off, stop model, stop recording, plus review-mode actions
(discard, voice treatments, **Save**, **Replace saved version**).

To the side, `CreativeWorkspace` (`studio/CreativeWorkspace.tsx`) renders a tool rail:
**Edit Video** · **Character** · **Outfit**. It also owns the "Reference image could not be
restored" notice, with **Retry** and **Continue without reference**.

## Flow: Record a local video

1. Enter `/studio/create`.
2. Press **Record New Video** → `startLocalRecording` (`StudioApp.tsx`): clears the
   existing-video intent, closes overlays, focuses the stage, and calls `session.startLocal()`.
   Camera and microphone are requested only here — the app never opens media on route entry.
3. Capture preferences (source device, format, capture target) come from `CaptureSettingsPanel`,
   shown as a desktop sidebar or a right-side overlay depending on `useDesktopStudioLayout`.
4. `useRecording` (`orchestration/recording/useRecording.ts`) drives `MediaRecorder`, tracks
   elapsed seconds, and enforces a maximum duration; hitting it triggers `onAutomaticStop`, which
   opens a finalization window and then review (`useTakeReviewFlow.ts:113-125`).
5. **Stop** → `finishTake()`: sets a finalizing presentation, stops the recorder, releases live
   media (`releaseForRecordedReview`), then publishes the artifact and sets `reviewReady`
   (`useTakeReviewFlow.ts:170-199`). If the recorder produced nothing, review is not entered.
6. Safety finalizations also fire when the model output becomes unusable
   (`studioPolicies.shouldFinalizeForUnusableModelOutput`), when the recorded track set changes
   mid-recording, and when a realtime session reaches its time limit
   (`useTakeReviewFlow.ts:201-238`).
7. The stage switches to `playback`. `reviewLocked` is now true, which locks capture settings and
   mode switching.

**Exit** — Save, discard, voice treatments, Edit Video, or the existing-video overlay.

## Flow: Upload / import an existing video

1. Press **Upload Video**, or arrive with `intent=upload`, or open a video from the Videos library.
2. `StudioExistingVideoOverlay` renders `ExistingVideoPanel`
   (`features/existing-video/ExistingVideoPanel.tsx`).
3. With no file selected, `ExistingVideoUploadChooser` offers file choose/drop and (when supported)
   **Record** instead. Accepted types: `video/mp4`, `video/quicktime`, `video/webm`.
4. `workflow.selectFile(file)` validates and inspects the file (`videoValidation.ts`), producing a
   `ValidatedExistingVideo` with container, codecs, duration, dimensions, size and audio presence.
   The reducer moves to `source-ready` (`existingVideoWorkflowState.ts:65-75`).
5. The panel becomes a two-column workspace: a source card on the left, and on the right a phase
   indicator, "Choose your edits" tool cards, and the active configuration.
6. Replacing an already-selected file requires an explicit confirmation dialog
   (`ExistingVideoPanel.tsx:150-156, 219-229`).

## Flow: Character Swap (`lucy-latest`)

1. In the existing-video panel choose the **Character** tool card. `workflow.addStep('lucy-latest')`
   creates the single visual step. Only **one** visual edit is allowed; switching from a configured
   Virtual Try-On requires a confirmation (`ExistingVideoPanel.tsx:185-207`).
2. `ExistingVideoVisualEditor` renders the configuration for the step, shaped by the capability
   descriptor for the selected provider (`capabilityForExistingVideoStep`,
   `existingVideoWorkflowPolicy.ts:24-33`):
   - `promptInput`: `editable` or `server-default`
   - `referencePolicy`: `optional` or `required`
   - `promptEnhancement`, `outputResolutions`, `providers[]`
3. A saved Character can be applied via `onApplySavedRecipe`, which hydrates its stored prompt and
   reference image. Missing references produce a recovery notice with **Retry image**, **Continue
   without reference**, and **Remove outfit** (`ExistingVideoPanel.tsx:305-339`).
4. **Start** submits through `useExistingVideoJobLifecycle`:
   `PUT /api/video-jobs/{jobId}` (upload + submit) → poll `GET /api/video-jobs/{jobId}` → download
   `GET /api/video-jobs/{jobId}/content` → validate → present as the new result.
5. Phases: `uploading → processing → retrieving → finalizing → complete`, surfaced by
   `ExistingVideoPhaseIndicator` and a live elapsed timer.
6. Terminal provider failures are translated into explicit copy that warns a new submission may
   incur additional provider usage (`existingVideoWorkflowPolicy.ts:76-88`). Submissions whose
   acceptance is unknown are tracked as `acceptance-unknown` so the UI can resume rather than
   resubmit.

## Flow: Virtual Try-On (`lucy-vton-latest`)

Same machinery as Character Swap, with `operationForModel` mapping the model to the
`virtual-try-on` operation (`existingVideoWorkflowPolicy.ts:18-19`). Input can be a prompt, a saved
outfit, or a reference image (`setVtonInputKind`). Recently used outfits are surfaced by
`useRecentExistingVideoOutfits`.

## Flow: Voice

Voice is independent of the visual edit and can be applied alone
(`ExistingVideoPanel.tsx:355-361`).

- **Local effects** — `warm-studio`, `clear-presenter`, `robot`, applied in-browser through
  `adapters/media-processing/audioEffects.ts` and remuxed with `replaceAudioTrack.ts`.
- **Cloud voice changer** — requires `elevenLabs` capability. `POST /api/elevenlabs/voice-changer/recording`
  returns transformed audio which is remuxed into the video.
- Every treatment starts from the immutable original audio sidecar, and "Restore Original" is
  always available (`StudioTakeOverlays.tsx`, voice-treatments overlay).
- The voice catalog (`VoiceLibrary`) supports browse, preview, save-to-account and remove, in the
  Voice treatments overlay and in Assets ▸ Voices alike. A voice chosen from Assets ▸ Voices is
  carried into the next video workflow — see
  [Assets and Libraries](assets-and-libraries.md#flow-voices-library-assetsvoices).

## Flow: Local video adjust

1. **Edit Video** in the tool rail, or **Edit video** from the Videos library.
2. `useVideoEditSession` (`features/video-editor/useVideoEditSession.ts`) opens
   `VideoEditWorkspace` in place of the creative workspace (`StudioWorkspace.tsx`).
3. Rendering happens entirely in the browser: `videoEditRender.worker.ts` + `videoEditShader.ts` +
   `videoEditChunkAccumulator.ts`. No provider call is made.
4. On completion the phase becomes `awaiting-replacement`. Committing (`commitVideoEdit`,
   `useStudioSavedVideoController.ts:326-396`) can optionally save the pre-edit video first, then
   atomically replaces the in-memory source with an `edited` artifact.
5. Discarding a dirty edit requires confirmation (`requestVideoEditDiscard`, `:317-324`).

## Flow: Save to Assets

1. **Save** appears on the control bar and in the take-review dock whenever a presented artifact
   exists.
2. `SaveVideoDialog` asks for an optional name (default derived from the artifact).
3. `useSaveVideo.save` (`features/saved-videos/useSaveVideo.ts:78-121`):
   - mints and **retains** an idempotency key per artifact id
   - chooses `saveVideo` or `saveVideoDirect` based on `directSavedVideoUploadAvailable`
     (multipart direct-to-R2 when configured)
   - derives `origin` from the artifact kind: `uploaded | editor | character-swap | voice-treatment | recorded`
   - posts the blob, then generates and uploads a thumbnail (`PUT /api/videos/{id}/versions/{versionId}/thumbnail`),
     tolerating thumbnail failure
   - invalidates the saved-video lists
4. When the video was loaded from an existing Saved Video, **Replace Saved Version** is offered
   alongside the plain save; it calls `POST /api/videos/{videoId}/versions` after a
   `window.confirm` (`useStudioSavedVideoController.ts`).
5. If the Studio was entered with `?projectId=`, the newly saved video is auto-attached to the
   project and the app redirects to `/projects/{id}` (`StudioApp.tsx`), with retry handling
   on the attach step.

**A successful standalone save ends with a completion surface.** `SaveVideoSuccessPanel`
(`features/saved-videos/SaveVideoSuccessPanel.tsx`) opens from `StudioLifecycleDialogs`, naming the
Saved Video and its Version, and offers **Download** · **View in Assets** · **Create another** ·
**Stay in Studio**. The same three actions are also rendered inline by `SavedVideoSuccessActions`
in the take-review dock and in the existing-video result bar, so they survive dismissing the panel.

- **Download** is an anchor to `/api/videos/{id}/versions/{versionId}/content?download=true` with
  the retained `filename` — the same affordance the Videos gallery and Project history use.
- **View in Assets** navigates to `/assets/videos`, which opens the Videos overlay.
- **Create another** reuses `discardTemporaryWork`: it releases the take, resets the save state and
  closes overlays, leaving the operator on `/studio/create`. It deliberately does not route through
  `?intent=record` — the panel opens after any explicit save, including one that began as an upload,
  so auto-starting the camera would demand a permission prompt nobody asked for and would push a
  history entry back onto the just-saved state.
- The panel is **suppressed while a Project video context owns the save** (`?projectId=` verified).
  That path keeps its existing behaviour: attach the new Video to the Project, then replace the URL
  with `/projects/{id}`.
- Saving the pre-edit video as part of **Replace and Save** in the video editor does not open the
  panel; only an explicitly requested save or an explicit **Replace Saved Version** does
  (`useStudioSavedVideoController.saveOutcome`).

## Flow: Live AI (realtime) — gated

- Enabled only when `REALTIME_VIDEO_BETA_ENABLED` is on **and** a Decart token provider is
  configured **and** `capabilities.decart` is true (`StudioApp.tsx`).
- When enabled, `/studio/create/live` immediately opens the AI-experience chooser and rewrites the
  URL to `/studio/create`.
- When not enabled, `LiveBetaRouteSurface` explains precisely why (beta off vs provider not
  configured vs unable to confirm) and offers **Create without Live AI** and **Back to Dashboard**.
- `POST /api/realtime-token` mints the short-lived provider token; `DecartRealtimeGateway` manages
  the WebSocket session, and `realtimeSessionClock.ts` enforces the session time limit with
  automatic take finalization.
- Live starts are unconditionally blocked inside a Project workspace
  (`StudioApp.tsx`).

## Flow: Character builder and wardrobe

- Opened from the Characters library, the AI-experience chooser, Quick Create, or the
  existing-video editor's "Create a Character" affordance.
- `useCharacterBuilderController` + `machine.ts` drive a multi-step form; drafts are persisted to
  IndexedDB (`draftRepository.ts`) and survive reload — asserted by e2e ("drafts survive close and
  reload, while Reset Draft starts fresh").
- Reference images can be generated (`POST /api/reference-images`), uploaded
  (`POST /api/reference-images/uploads`), imported by URL (`POST /api/reference-images/import`),
  edited (`…/edits`), or composed (`…/compositions`). Prompts can be optimized
  (`POST /api/reference-images/optimize`).
- Wardrobe variants (`features/character-wardrobe/`) add outfit variants to a saved character,
  optionally via the Pruna image try-on route
  (`POST /api/reference-images/{sourceAssetId}/outfit-try-ons`).
- Editing a different character while an unfinished draft exists requires explicit discard.

## Exit guards

`StudioExitGuard` (`studio/StudioExitGuard.tsx`) blocks `popstate` and `beforeunload` when any of
these hold (`StudioApp.tsx`): recording or finalizing, a provider job active, a video
render or project working-media operation busy, a temporary take present, voice processing running,
or dirty outfit/wardrobe/editor state. Covered by e2e ("recording and temporary-take work cannot be
lost silently through Back").

## What is deliberately _not_ done automatically

The codebase is consistent and explicit about never starting billable or privacy-sensitive work
implicitly:

- Camera and microphone open only from an explicit Start/Record action.
- Provider submissions require a trusted origin **and** an explicit intent header
  (`requireVideoProviderIntent`).
- Project source selection, hydration, recording acceptance and resume never start a provider
  (stated in the UI at `ProjectSourceSection.tsx:213`).
- A lost submission response is reconciled, never blindly retried.

## Unverified

- The exact maximum recording duration and memory ceiling. `scripts/estimate-recording-memory.mjs`
  and `orchestration/recording/recordingMetadata.ts` compute limits from configuration; the
  effective value was not measured at runtime.
- Behaviour of the Live AI path against a real Decart endpoint — no key was available during the
  audit, so only the gated/unavailable path was traced.
