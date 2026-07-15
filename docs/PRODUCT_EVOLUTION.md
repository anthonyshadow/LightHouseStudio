# Product evolution and changed flows

The guide was treated as a capability contract, not a clone checklist. The resulting experience is a focused one-page studio named Lightframe Studio, with improvements chosen to reduce consent ambiguity, accidental provider work, and clip loss.

## Intentional changes

### Lucy 2.5 replaces Lucy 2.1

The user explicitly approved `lucy-2.5` during implementation. Character mode, API allowlists, saved-asset mode scoping, filenames, and tests use that exact identifier. `lucy-vton-3` remains a separate try-on capability. This update adopts the supported newer character model without merging the two workflows or weakening explicit provider consent.

### Stage, Recipe dock, and Take dock share one adaptive workspace

Instead of a screen-per-step wizard, the live stage and current recipe remain visible together, while the prompt workshop, Recipe Shelf, and latest take open as contextual tools. This shortens iteration and keeps media state legible. Responsive grids collapse to a single sensible order at narrow widths, and the design avoids hover-only actions.

Covered by: responsive/manual checks, semantic landmarks and labels, keyboard interaction, and component accessibility rules.

### Preparation is separated from provider execution

Prompt editing, structured generation, image validation, and recipe management work before camera access. A model draft is rejected before any media or token request when empty. An optional camera/mic preflight lets the operator resolve permission/device problems without starting AI.

Once preflight media is live, mode switching is locked until the operator explicitly releases the camera and microphone. This prevents a working stream from silently crossing mode boundaries and makes device ownership visible.

Why it fits: creators can prepare safely, understand consent, and avoid spending provider time while drafting.

Covered by: session input validation, operation ordering, repository/component tests, and the local no-provider QA check.

### Pending versus applied recipes are visible and recoverable

Live edits never silently alter Decart state. Apply sends one atomic prompt/image/enhancement snapshot; clearing a reference sends explicit `null`. Revert restores the last successful snapshot, while Reset invalidates late starts and clears both draft and provider image state.

Why it fits: experimentation stays deliberate and an Apply failure cannot obscure which recipe is actually live.

Covered by: realtime snapshot tests for normalization, image-only behavior, pending detection, and explicit clearing; orchestration tests for cancel/reset and safe failure.

### Character direction includes an explicit gender choice

The structured Character transform offers optional Woman, Man, and Non-binary choices alongside the adult-age direction. No gender is preselected or inferred, presets do not silently set it, and persisted drafts restore only allowlisted values. When selected without an age, generation adds an adult-safe descriptor automatically.

Why it fits: creators can state an important visible character direction without hiding it in free-form text, while preserving the workshop's adult-only and no-hidden-default guarantees.

Covered by: domain generation/sanitation tests and the Character workshop component journey.

### Local fallback remains on stage until transformed video is truly usable

Provider output is gated on a live video track. Audio-only, missing, or ended remote output falls back to the still-owned local preview with an actionable state. This turns intermittent provider startup into a recoverable transition rather than a blank stage.

Decart can announce audio and video in separate callbacks while reusing accumulated track objects. Remote replacement therefore compares track identity: adding provider audio never stops the already-live transformed video, while genuinely replaced tracks are released. Both subscription orders and true replacement are deterministic under test.

Covered by: track-selection/source-composition tests and manual disconnect/track-ending QA.

### Recipe Shelf adds resilient, scoped creative memory

Saved recipes, successful recents, and restorable structured character prompts share a searchable model-scoped shelf. Recents are recorded only after successful Start/Apply. Corrupt storage is sanitized; failed storage falls back to a session-only repository with a visible notice. Reference-image status makes it explicit that no portrait is saved.

Why it fits: repeated creative work becomes faster without accounts, sync, media persistence, or cloud storage.

Covered by: domain and repository tests for CRUD, sanitation, search, deduplication, caps, use counts, recovery, and storage fallback.

### Creative drafts survive navigation and blocked actions explain themselves

Closing and reopening the Character Workshop restores its current structured draft. Dirty inline Recipe Shelf forms require confirmation before another shelf action or panel replacement can discard them. While live local media locks a model change, the Character Workshop trigger and cross-model recipe insertion controls are disabled with an explanation; browsing and editing the shelf remain available. Recording no longer auto-unmounts an open creative form.

Changing recipe models now confirms and actually remounts a dirty form instead of silently retargeting its text. Search is paused while an inline edit is dirty so filtering cannot unmount unsaved work. Dynamic Clear, Save, and session-action controls hand focus to an intentional successor when the focused element disappears.

Why it fits: preparation is intentionally free and local, so losing work or presenting an enabled no-op action would undermine the product's safest workflow.

Covered by: Recipe Shelf dirty-state/focus component tests and Playwright checks for workshop restoration and live-local insertion blocking.

### Model take finalization is a first-class handoff

Stopping a model recording waits for the recording and sidecar to finalize before releasing Decart, then returns to the existing healthy local preview. The latest take stays available independently of session stop. A before-unload warning and explicit discard confirmation reduce accidental loss.

The video recorder is authoritative and the audio sidecar is optional: if sidecar construction, start, error handling, or finalization fails, a valid main video still becomes the latest take with an audio-specific recovery notice. This closes a subtle clip-loss path without hiding that voice treatment is unavailable.

Automatic source-ended, spontaneous-stop, recorder-error, and finalization-timeout paths also notify session orchestration exactly once, so a paid model session is released even when the operator did not click Finish. Browser-default recordings take their MIME type and extension from emitted chunks before recorder fallbacks, preserving native MP4 output where applicable. Recording lifecycle changes are announced and focus moves to the replacement action/status instead of disappearing.

The selected recording tracks are pinned for the lifetime of a take. If either selected video or audio ends, or provider subscription changes which audio/video would be selected, the current take finalizes before the UI accepts the replacement source. This prevents a label or preview from claiming one source while `MediaRecorder` is still capturing another.

Covered by: recorder-construction, chunk-MIME, hung-sidecar, automatic-stop, StrictMode, focus/status, source-recomposition, mocked Local journey, and a model-recording browser assertion that finalization precedes provider release.

### Voice treatments always preserve the immutable original

Every local or ElevenLabs treatment starts from the original take and original sidecar. Processing locks playback/download only while replacement is incomplete, exposes Cancel, and publishes a processed take only after remux success. Original restores immediately without network traffic.

Starting a replacement take is also locked during processing, and superseded processing jobs cannot publish, fail, or unlock a newer job. A missing or unsupported sidecar remains a recoverable voice-only limitation and never invalidates the video take.

Why it fits: creators can compare treatments without generational degradation or losing a valid clip.

Covered by: voice rules and processing tests plus local/network-isolation and failed-conversion QA.

### Optional providers degrade independently

A capability strip reports local, AI, and cloud-voice availability. Missing Decart disables only realtime video; missing ElevenLabs disables only its library/conversion. Local capture, assets, recording, and local effects remain usable. Errors are actionable and sanitized.

Covered by: capability/API tests, optional `503` cases, and no-key manual QA.

### Voice discovery is an explicit provider boundary

The public/workspace voice browser is mounted only after the operator opens a disclosure labelled as contacting the provider. Merely completing a take does not fetch voice metadata. Preview, public import, and conversion remain separate explicit actions; only conversion receives the original audio sidecar.

Browser capability notices distinguish missing MediaRecorder, Web Audio replacement, offline rendering, and runtime encoder/remux compatibility. Unsupported post-processing never makes the original take unavailable.

Why it fits: provider contact and browser limitations are visible at the moment they matter, while the local capture loop remains intact.

Covered by: voice-panel loading/cancel tests, strict HTTP/WebSocket guards, capability UI, and safe remux failure behavior.

## Scope guardrails

The build deliberately excludes accounts, remote projects, permanent media storage, collaboration, live distribution, analytics, payments, social publishing, and speculative AI features. Those would change the privacy/security category or add provider cost without improving the focused local creator loop.
