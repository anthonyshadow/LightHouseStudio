# Manual release QA

Manual QA complements deterministic tests. It is required for physical camera/microphone behavior,
final browser codecs/downloads, real touch/reflow, interruption/cleanup indicators, memory, and
live provider accounts.

**Current state:** physical device/browser validation remains open. Emulation and synthetic media
do not replace it.

## Before physical or paid work

Run the exact release candidate:

```bash
bun run quality
bun run test:coverage
bun run test:e2e
bun run test:production
bun run test:visual
bun run audit:all
bun run audit:prod
```

Use the five canonical viewports below and the currently supported browser/device targets. Record
only the result, environment, candidate revision, non-sensitive notes, and remediation link. Never
attach credentials, tokens, personal media, raw provider responses, URLs, headers, device IDs, or
network archives.

Provider checks use the separate [gated live procedure](LIVE_PROVIDER_SMOKE.md). Pruna 720p,
Pruna 1080p, Pruna Wardrobe try-on, OpenAI, BFL, and Wiro require separately recorded passes;
Pruna resolution and the configured Decart/Pruna Character Swap provider are chosen in the editor.
Wardrobe try-on is separately enabled and is never inferred from Character Swap.

## Account and saved-library checks

Run these before physical/provider work so later evidence uses the intended owner and clean local
state:

| Check                    | Pass condition                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry-login`            | `/` requests no media/capability/provider work; Login traps focus; development prefills both configured credentials; incorrect credentials use one generic error and clear no unrelated data                                                                            |
| `session-restore`        | Correct login opens Studio; closing/reopening the browser restores direct `/studio` and library routes within 24 hours without exposing a token to URL or browser storage                                                                                               |
| `session-expiry-logout`  | Expired/revoked session returns to entry; logout blocks non-discardable work, confirms discardable work, releases indicators/resources, clears the cookie, and returns to Login                                                                                         |
| `studio-library-routing` | `/studio/videos`, `/studio/characters`, and `/studio/outfits` keep the same stage/runtime; browser Back/Forward, Escape, account-menu arrow/Home/End keys, and return focus behave correctly                                                                            |
| `save-video`             | Save is idempotent and is the only review durability action; optional thumbnail failure is non-fatal; replace confirms and appends a version; download/rename/delete operate on the selected owner gallery record; R2 deletion removes its unshared versions/thumbnails |
| `video-gallery-states`   | Empty/loading/error/missing/placeholder/populated/load-more states avoid eager video requests; thumbnail Preview darkens the gallery, traps/returns focus, detaches on close, and remains usable at all five viewports and 200% text                                    |
| `saved-character-outfit` | Both libraries show the user-scoped records; Use follows existing handoff; delete removes relationships without provider work or unintended immutable-byte deletion                                                                                                     |

Local-only Saved Video deletion conservatively retains detached bytes. With R2 selected, manual
deletion must remove each unshared version/thumbnail object; force one failed delete in a disposable
environment and confirm the repeated request completes cleanup without restoring the gallery row.

## Per-target physical protocol

Use non-sensitive disposable media. Start from a fresh browser profile and stopped media. Run the
primary flows in [user stories](userStories/README.md) and complete every applicable check.

### Common checks

| Check                          | Pass condition                                                                                                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permission-allow-deny-revoke` | Allow, deny, and revoke camera/mic; errors are actionable; no token/provider work precedes healthy local media                                                                                                                                                             |
| `local-capture`                | Entry/direct load/refresh show neutral Local Camera with zero media/AI starts; control-bar or panel Record explicitly starts mirrored contained video/audio and capability-gated controls                                                                                  |
| `character-capture`            | Exact Lucy 2.5 Start/Apply, local fallback until usable remote video, short playable take                                                                                                                                                                                  |
| `vto-capture`                  | Exact pinned VTO Start/Apply, image-only does not invent text, short playable take                                                                                                                                                                                         |
| `upload-select-replace-remove` | Native picker and drop publish compatible media without camera/provider work; replace/remove revokes only owned URLs                                                                                                                                                       |
| `upload-local-save`            | A zero-step H.264 MP4/MOV or VP8 WebM source previews and saves with no external request; download is available afterward from Saved Videos                                                                                                                                |
| `upload-single-visual-step`    | Character Swap/VTO selector switches both ways; only the active operation submits once, returns the selected exact or bounded resolution-class result, and restores source audio                                                                                           |
| `upload-voice`                 | Local and ElevenLabs Voice use immutable uploaded source audio and apply to the latest visual result                                                                                                                                                                       |
| `upload-record-to-source`      | Control-bar and panel Record intents use the persistent stage, warn/stop at 270/300 seconds, finalize, and adopt the normalized local artifact into the editor without provider traffic; no inline player participates in capture                                          |
| `upload-compare-edit`          | Inline player and shared stage follow Original/Result; Result is conditional; Edit snapshots the selected base; superseded URLs release only after healthy commit                                                                                                          |
| `upload-vto-inputs`            | Saved/recent, reference, and prompt are exclusive; URL stays hidden until requested; safe HTTPS import never forwards or echoes the source URL                                                                                                                             |
| `character-wardrobe`           | Original is first; exact variants search/use correctly; Change Features omits the parent prompt when a variant source is selected; Create variant returns to Existing Video when launched there; Add Outfit/Change Features degrade independently; Save never auto-selects |
| `upload-ordered-plan`          | Voice-only performs one conversion; visual-only one submission; combined plan finishes visual restore/transcode before voice; truthful stage copy matches work                                                                                                             |
| `record-300-seconds`           | At 270 seconds warning is visible/announced; at 300 seconds Stop coalesces once                                                                                                                                                                                            |
| `record-finalize`              | Main recorder and optional sidecar settle, then device-local H.264/AAC MP4 transcode completes before source/provider release; no raw download fallback                                                                                                                    |
| `local-voice`                  | Warm/Clear/Robot always start from immutable original; success/cancel/failure preserves a valid take                                                                                                                                                                       |
| `elevenlabs-voice`             | Saved browse/preview sends no take; Apply sends only original sidecar; remux/original recovery works                                                                                                                                                                       |
| `gallery-download-playback`    | Save leaves review intact and enables Release; Saved Videos download produces an MP4 with H.264 and AAC when audio exists                                                                                                                                                  |
| `project-output-save`          | Ready Project media saves as a new Saved Video or, after separate target selection and confirmation, one immutable added Version; refresh after response loss reconciles without duplication                                                                               |
| `background-foreground`        | Background/foreground, screen lock/call/device interruption recovers safely or finalizes without take loss                                                                                                                                                                 |
| `memory-checkpoints`           | Complete [300-second memory protocol](RECORDING_MEMORY_POLICY.md) through processing and Release/Discard                                                                                                                                                                   |
| `cleanup`                      | Camera/mic indicators, WebRTC/provider clients, recorders, timers, listeners, audio contexts, tracks, and superseded URLs terminate once                                                                                                                                   |

Repeat the common recording boundary for Local, Character, and VTO. If recording/source/provider
completion coincide, only one finalization may publish. The stage must hold the last frame while
finalizing and become paused playback without reacquiring media.

### Desktop additions

| Check                       | Pass condition                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pointer-keyboard-recovery` | Timed-out live/playback controls return on pointer/focus/keyboard activity; recording Stop never hides |
| `five-canonical-viewports`  | Complete layout checks at all five sizes below                                                         |
| `two-hundred-percent-text`  | Critical controls/focus stay visible; document does not scroll                                         |
| `device-replacement`        | New stream commits before old tracks stop; failed candidate leaves the current preview intact          |

### Touch additions

| Check                        | Pass condition                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `touch-recovery`             | Touch/focus restores timed-out controls; Stop remains reachable and approximately 44×44 CSS px           |
| `portrait-landscape`         | Primary journey and every major overlay work in both orientations                                        |
| `safe-areas`                 | Header, Close, stage actions, sticky primary actions, and focus rings avoid cutouts/home indicator       |
| `browser-chrome`             | Expanding/collapsing browser UI does not hide the sole high-consequence action                           |
| `software-keyboard`          | Focused fields/actions remain reachable; only named overlay bodies scroll                                |
| `two-hundred-percent-text`   | Reflow works without document overflow or clipped actions                                                |
| `camera-switch-when-exposed` | Opposite `user`/`environment` mode switches atomically; control is absent when capability is not exposed |

Touch/mobile creation includes primary local recording or native existing-video selection,
post-recording Character Swap/VTO/Voice setup, preview, Save, and gallery Download. It also includes the
advanced Character Builder → Character AI → record → optional Voice → Save → gallery Download path—not just
responsive shell inspection.

## Viewport and overlay invariants

Test exactly:

- `1440×960`
- `1280×720`
- `834×1112`
- `390×844`
- `320×568`

At idle, local live, recording, finalizing, playback, Character prepared/live, VTO prepared/live,
error, and each major overlay:

- `documentElement` and `body` width/height stay within the viewport plus one CSS pixel;
- page/background wheel or touch does not scroll the document;
- the same stage/video node, geometry, media binding, and playback time survive overlay open/close;
- video uses `contain`; only Local is mirrored;
- Record/Stop, device settings, Close, and sticky primary actions remain reachable; and
- each `data-scroll-region` reaches its last control without horizontal overflow.

On small touch targets, repeat with browser chrome open/closed, keyboard open, landscape, safe
areas, large text, and 200% zoom. Character Builder uses one internal scroller and one
preview/generation region; **Review & Generate** moves focus to it without duplicating state.
Wardrobe uses one wide right overlay with an internally scrolling version grid and becomes
fullscreen at narrow widths. Verify original/variant cards, Search, Use, Create variant, source
selection, preview, title, and Close remain keyboard/touch reachable with correct selected state,
focus return, reduced motion, and overlay stacking at every canonical viewport and 200% text.

## Capture/device checks

- Opening Capture Settings before Start may enumerate devices but must not call `getUserMedia` or
  prompt. Applied preferences are tab-only and disappear on reload.
- Apply 16:9 and 9:16 at every physical target. Verify the same persistent stage changes shape,
  Active capture reports the matching negotiated dimensions, recorded metadata/playback retains
  the orientation, and an unsupported format fails without replacing the healthy preview.
- After permission, verify the rescan can reveal newly labeled/front/rear/phone cameras and Active
  capture reports negotiated settings rather than targets.
- Exact device replacement is atomic. Acquisition failure preserves the current stream.
- Disconnect/reconnect the selected device. `devicechange` may refresh late, but Studio must not
  invent or auto-select a source.
- Continuity Camera/other phone webcams are ordinary OS-exposed inputs; no network/proximity scan
  or Apple claim appears for unsupported platforms.
- Revoke permission/unplug during preview and recording; finalization and cleanup remain safe and
  unrelated borrowed tracks are not stopped.

## Take, Voice, and cleanup checks

- Exercise accepted H.264 MP4, H.264 MOV, and VP8 WebM plus rejected HEVC/ProRes/VP9/alias cases.
  Confirm the full accessible filename is available without being sent to the server/provider.
- Verify source duration/aspect/byte boundaries, no-audio visual use, Voice-disabled explanation,
  VTO's lower input cap, server-approved 720p/1080p result class and orientation, and the 500 ms
  synchronization tolerance. With a fake or controlled nonconforming result, confirm the safe
  failure identifies actual and expected result dimensions instead of blaming the valid source
  aspect ratio; the browser must show result-specific guidance with no provider details.
  Confirm exact-size operations still reject non-canonical dimensions, while the megapixel-budget
  policy warns and continues with inspected dimensions when the source orientation agrees.
  Source-file selection must continue rejecting non-9:16/16:9 input. Confirm a Pruna terminal
  failure issues no DELETE until explicit user discard/replacement, while Decart retains automatic
  terminal-failure release.
- In **Choose your edits**, verify Character Swap and Virtual Try On behave as one-of-two visual
  choices while Voice remains independently selectable. Empty visual setups switch immediately;
  configured setups require a topmost confirmation whose cancel path preserves every value and
  whose confirm path clears only the previous visual settings, never Voice. Select a saved Voice,
  visit both visual editors, and return to Voice; confirm the saved Voice and browser state remain
  selected until **Clear Voice setup** is used. Run a combined Character/VTO plus Voice plan and
  confirm the visual commits first, the result remains locked until Voice finishes, and a Voice
  retry uses that visual without another visual-processing submission.
- Open **Adjust video** from Original and again from a visual/voiced Result. Confirm the persistent
  stage keeps one video node and playback time while capture controls are replaced. Exercise trim
  looping and Set In/Out; all six crop modes; 90° rotations; both flips; every lighting range and
  filter; Before; per-tool/all reset; and grouped undo/redo. Use pointer capture and keyboard crop
  handles (1%, Shift+5%) at all five viewports, safe areas, reduced motion, and 200% text.
- Cancel a real render, close/reopen after a dirty-discard cancellation, and attempt route exit
  during render. Verify the worker must be explicitly cancelled, stale completion does not publish,
  and the draft/pinned artifact survive render or validation failure. Exercise all replacement
  actions: Cancel, Replace Without Saving, and Replace and Save; verify Save publishes the artifact
  pinned at editor entry even when it was already a visual/voice Result, and failed Save prevents replacement.
- Inspect edited files locally and in an external player. Require non-empty H.264 MP4, AAC plus a
  matching sidecar when source audio exists, silent output for silent input, requested even
  dimensions/orientation, duration within 500 ms, and the 300,000,000-byte maximum. Confirm 16:9
  and 9:16 enable Character/VTO; 1:1, 4:5, and incompatible Freeform disable both before any HTTP
  while Save and Voice use the edited source/sidecar.
- In Character Swap, choose a saved image character and confirm only its reference is attached;
  Prompt stays empty but accepts a different manual direction. Choose a prompt-only character and
  confirm its prompt fills the field. In the reference-required configuration, confirm prompt-only
  recipes cannot Start until a reference is attached and Enhance Prompt is disabled with generic
  guidance. Confirm compatible MOV/WebM converts locally at Start, MP4 passes through, the source
  remains immutable, and no provider name/selector appears. Import both Character and VTO references through the hidden
  public-HTTPS URL control and confirm the resulting local preview can be replaced or removed.
- Open Wardrobe from a saved card and the active-character control. Use original and an exact
  variant, reload, and confirm only the successfully hydrated version persisted. With no Pruna
  configuration, confirm Add Outfit is visibly unavailable while browsing/use and Change Features
  remain usable. For a prompt-only character, confirm original Use works and both creation paths
  explain how to add/generate a reference. Exercise outfit upload and public-HTTPS import,
  regeneration, input changes during generation, cancellation, empty title, Save without
  auto-selection, and a later explicit Use. Delete the parent and confirm its variants/Recent links
  disappear while immutable bytes remain retained.
- Interrupt upload before provider acceptance, background/foreground during polling, restart the
  broker, expire a result, retry status/content/local finalization, and race source replacement.
  No path may create an automatic paid resubmission or discard the last valid artifact.
- Confirm provider-active processing blocks source/visual-choice mutation and Studio exit; refresh warns
  but does not promise tab/process recovery. Repeated cleanup is idempotent and never claims
  provider cancellation or deletion.
- Recording pins source identity. Model recording is unavailable before live transformed video.
- Final main video remains valid if the sidecar fails or reaches its grace timeout, but review and
  Save remains unavailable until MediaBunny finishes the required H.264/AAC MP4.
- A conversion failure or dropped primary video/audio track exposes no raw recorder URL or
  saveable fallback.
- Playback stays on the persistent stage; Latest Take opens only through **Take** and contains no
  duplicate player. **Use existing video** is the sole exception and borrows the same artifact URL
  or local stream in its inline player without owning/stopping tracks.
- While review owns a take, new capture/mode/device changes are blocked. Exit is
  Save-then-Release or confirmed Discard.
- Refresh/close warns about take loss; intentionally leaving proves the take is not durable.
- Local and cloud Voice lock playback/saving during processing, create a healthy replacement
  before revoking the prior processed URL, and never mutate the immutable original.
- ElevenLabs preview is bounded to 2 MiB and conversion to 8 MiB; oversize/malformed/cancelled
  output preserves the valid take.
- Open the lazy Voice library and exercise Saved/Browse tab switching, independent search/filter
  state, 20-item paging, manual refresh, and Back/Next cache reuse. Type one/two/three characters
  and confirm the minimum-character hint, 300 ms debounce, result announcement, and stale-result
  protection. Repeat at 200% text and all five canonical viewports; the named region scrolls and
  Preview/Add/Remove/Select remain approximately 44 px and reachable at short heights.
- In Browse, confirm only standard-rate plan-visible voices appear, add a disposable eligible
  voice, and verify **Already saved** prevents a duplicate. In Saved, confirm owned/default/cloned/
  workspace/legacy voices have no Remove action; confirm an eligible community copy warns before
  removal, removal is blocked while selected, and successful add/remove updates both tabs. These
  provider mutations require explicit owner authorization and are not ordinary local QA.
- Repeated Start/Stop/Reset/processing cycles leave no owned track/client/listener/timer/context or
  stale object URL.

## Project processing integration boundary

Project Character Swap and Virtual Try On now expose recoverable Project Start/status controls. In
ordinary no-provider manual QA:

- open a source-bearing Project, configure a visual treatment, save the setup, and confirm that
  configuration/checkpointing alone creates no processing submit, provider SDK load, external
  request, Saved Video, or output Version;
- confirm Project provider Voice and advanced live starts remain disabled with reconnect-specific
  explanatory copy, while standalone and local-Voice paths retain their existing behavior;
- with visual provider capability unavailable, confirm the Project visual Start is disabled before
  provider intent or HTTP; and
- confirm local Render preview and explicit working-media adoption retain their separate lifecycle
  and do not create a Project processing attempt.

Queued reconnect, exact same-key response-loss replay, ambiguity, explicit duplicate-cost retry,
archive blocking, stale-result retention, and current `job-result` presentation remain deterministic
fake-provider/controller/database evidence in ordinary validation. Do not turn them into paid manual
work. A specifically authorized live visual pass uses [Live provider smoke](LIVE_PROVIDER_SMOKE.md);
each Start or retry requires separate approval.

## Project output save boundary

Using synthetic compatible media and no live provider:

- open a ready source-bearing Project and confirm the review surface distinguishes current media
  from the immutable original, and that **All changes saved**, **Render preview**, **Save as New
  Video**, and **Add Version** describe separate states/actions;
- save as a new titled video, then separately select an active Saved Video for **Add Version** and
  verify the confirmation names its title, current version ordinal, and current-media dimensions;
- simulate an unavailable response or refresh immediately after submission and confirm the pending
  operation reconciles to the exact one Saved Video/Version/Project result rather than offering a
  blind duplicate submission; and
- delete the Saved Video from the global gallery, confirm the copy explains that Project history is
  preserved, and verify the Project-scoped current output still plays while the gallery record stays
  hidden.

## Project history and exact-Version boundary

Using synthetic compatible media and no live provider:

- save two Versions, reopen the Project, and confirm **Project changes**, **Processing attempts and
  results**, and **Saved video Versions** are separate bounded groups rather than one event feed;
- verify an output names its producing revision separately from the later revision that made it
  current, then select the older Version for preview and **Download** and confirm neither Saved
  Video nor Project current pointer changes;
- choose **Use in Project** for an old Version and for a valid stale processing result in separate
  runs; confirm adoption is explicit, updates only working media, preserves the immutable original,
  and never preselects an Add Version target;
- remove the Saved Video globally and confirm only its exact retaining Project can still preview,
  use, and download it with truthful retention copy; and
- open a legacy/independently saved video without a Project output relation and confirm it is usable
  and labeled **Unassigned Content**, not an error or an invented producing Project.

At compact/mobile widths and 200% text, verify all three groups, load-more actions, old-Version
selection, preview focus return/Escape, status announcements, and Download remain reachable. These
checks exercise local authenticated routes only and must not be converted into paid-provider work.

## Accessibility

Using keyboard and a screen reader:

- traverse skip link, Start/AI choices, fields/files, Apply, settings, Record/Stop, Shelf, Take,
  Voice, Save, Release/Discard;
- verify names, roles, states, validation, live/status announcements, logical focus, visible focus,
  reduced motion, and approximately 44 px touch actions;
- ensure topmost overlays alone are active, Tab wraps inside, Escape closes one layer, background
  is inert, and focus returns to the exact launcher; and
- confirm the 270-second recording and AI warnings announce once without moving the stage or
  hiding Stop.
- At desktop, compact, tablet, mobile, and small-mobile sizes, open Campaigns, create/edit a
  Campaign, open detail, create a Project, move it to another active Campaign, detach it to the
  virtual No Campaign group, and archive/restore the Campaign. Confirm deep links and Back work,
  lists remain bounded and scrollable, and no media/provider work starts.
- At those same viewports, open an empty Project and exercise **Upload**, a synthetic finalized
  **Record**, and **Use Saved Video** on separate Projects. Confirm the one existing stage remains
  visible, progress reads Preparing/Saving/Saved truthfully, accepted media returns after refresh
  and API restart, a second original is rejected, exact Version reuse creates no duplicate bytes or
  save target, content seek/range works, and no provider request occurs. During upload or recording,
  attempt a Project switch and verify stay/abort/discard copy, focus restoration, and that late work
  from the old Project never replaces the new stage.
- At 200% text, keyboard through Campaign create/edit, move/detach, archive/restore, and guarded
  delete overlays. Confirm initial/returned focus, inert background, visible safe errors, and that
  deleting a nonempty Campaign offers no cascade action or claim of content-byte erasure.

## Result

A passing JSON record must contain every required check for the exact row and commit. A blocked or
failed record is valid evidence but does not satisfy release. Re-run the validator after recording
results; release remains open until it reports `12/12` provider/local and `45/45` physical rows with
no invalid records.
