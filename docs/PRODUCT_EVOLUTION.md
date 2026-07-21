# Product evolution and changed flows

The guide was treated as a capability contract, not a clone checklist. Lightframe Studio now opens into a focused five-stage Guided journey for every user while preserving the original Advanced workspace. The changes reduce consent ambiguity, accidental provider work, and clip loss without removing the direct-control tools.

## Intentional changes

### Lucy 2.5 replaces Lucy 2.1

The user explicitly approved `lucy-2.5` during implementation. Character mode, API allowlists, saved-asset mode scoping, filenames, and tests use that exact identifier. `lucy-vton-3` remains a separate try-on capability. This update adopts the supported newer character model without merging the two workflows or weakening explicit provider consent.

### Guided is the all-user default; Advanced remains explicit

The normal `/` entry creates or resumes Guided's Create → Live → Record → Voice → Download flow. `/projects` opens browser-local Guided projects, `/advanced` always opens the original workspace, and `?new=1` starts a fresh Guided project. The non-secret `VITE_CHARACTER_FLOW_ROLLOUT` supports `off`, `opt-in`, and `all`; absent or invalid values default to `all`. Opt-in requires `/guided` or `?characterFlow=guided` for the Guided journey while leaving `/projects` available; off routes every non-Advanced entry back to Advanced.

Why it fits: one clear primary journey is available to all creators, while experienced users retain every Advanced Character, Add, Replace, Restyle, and Virtual Try-On option.

Covered by: route-resolution, rollout-default, explicit Advanced, project-route, resume, and new-project tests.

### One stable stage anchors the Advanced overlay workspace

Advanced retains one permanently mounted media stage as its visual anchor. Recipe Dock, Capture Settings, Take Review, Voice Treatments, Character Workshop, and Recipe Shelf open as modal overlays that never participate in shell sizing or own media. Responsive rules change overlay placement, not the stage rectangle, video identity, source, or playback time. Guided instead presents one responsive stage at a time beneath a persistent progress header while reusing the same media controllers.

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

### Character direction is visual, gender-aware, and still open-ended

The structured Character transform now gives Skin Tone, Body Shape, and Hair Color their own canonical fields alongside Gender, Adult Age, Appearance, Hair, Outfit, Accessories, Expression, and Mood. Advanced exposes every field without removing its existing controls or presets.

Guided adds nine illustrated starters and presentation-aware visual catalogs for Woman, Man, Non-binary, and Not specified. Applicable categories show six tailored suggestions, while fixed enums retain their true cardinality. Hair color remains independent of hairstyle, shared skin tones are never gender-filtered, Show All exposes cross-profile options, and Describe My Own preserves text outside the catalog. Changing gender recomputes recommendations but pins an existing out-of-suggestion choice instead of deleting it.

Why it fits: creators can make fast visual decisions without turning gender into a restriction or losing the precision of free-form direction.

Covered by: schema migration, prompt generation, catalog cardinality, shared-choice, custom-value, gender-change preservation, and Character Workshop component tests.

### Reference generation is an optional save-time decision

Save Character validates and compiles the design before showing an unselected choice. Continue with Prompt Only activates Character AI without an image-generation request. Generate Reference & Continue exposes the existing reference settings and generates only after the final explicit action. Keep Existing Reference appears only for a compatible non-stale saved asset. Generation failure keeps every choice and offers retry or deliberate prompt-only continuation.

Why it fits: saving a reusable character no longer implies a potentially billable image request, while generated references remain available when visual consistency matters.

Covered by: prompt-only no-request, one-shot generation, existing-reference reuse, stale-reference, and recovery tests.

### Local fallback remains on stage until transformed video is truly usable

Provider output is gated on a live video track. Audio-only, missing, or ended remote output falls back to the still-owned local preview with an actionable state. This turns intermittent provider startup into a recoverable transition rather than a blank stage.

Decart can announce audio and video in separate callbacks while reusing accumulated track objects. Remote replacement therefore compares track identity: adding provider audio never stops the already-live transformed video, while genuinely replaced tracks are released. Both subscription orders and true replacement are deterministic under test.

Covered by: track-selection/source-composition tests and manual disconnect/track-ending QA.

### Recipe Shelf adds resilient, scoped creative memory

Saved recipes, successful recents, and restorable structured character prompts share a searchable model-scoped shelf. Recents are recorded only after successful Start/Apply. Corrupt storage is sanitized; failed storage falls back to a session-only repository with a visible notice. Reference-image status makes it explicit that no portrait is saved.

Recipe Shelf v3 adds the complete canonical character draft and optional versioned guided provenance. It migrates v2/v1 records with empty new fields and null provenance rather than guessing body shape, skin tone, or hair color from legacy text.

Why it fits: repeated creative work becomes faster without accounts, sync, or cloud storage; Recipe Shelf itself still stores no image or recording bytes.

Covered by: domain and repository tests for CRUD, sanitation, search, deduplication, caps, use counts, recovery, and storage fallback.

### Guided projects checkpoint media in this browser

Guided saves stable character, take, voice, delivery, and completion checkpoints to a versioned IndexedDB repository. Original video/audio Blobs are immutable, processed variants point back to the original, and revision-checked writes keep metadata and artifacts atomic. Streams, devices, credentials, provider state, and object URLs remain runtime-only. Reopening creates fresh URLs; deleting a project removes its metadata and media without deleting the reusable character.

Storage permission and quota remain browser-controlled. The app requests persistent storage only after an explicit media save and reports best-effort or tab-only fallback truthfully. An unsuccessful write keeps the active Blob available for retry or original download.

Why it fits: refresh/resume and Download Again work locally without introducing accounts, cloud media, or a server-side project database.

Covered by: revision-conflict, byte-integrity, sanitation, immutable-original, processed-replacement, deletion, URL cleanup, session-only fallback, retention, stable-restore, and route tests.

### Creative drafts survive navigation and blocked actions explain themselves

Closing and reopening the Character Workshop or Recipe Shelf restores its current draft. Ordinary overlay closure and opening another tool do not discard feature state; only explicit Reset, Clear, Delete, or Discard actions are destructive. While live local media locks a model change, the Character Workshop trigger and cross-model recipe insertion controls are disabled with an explanation; browsing and editing the shelf remain available. Recording closes nonessential overlays without erasing their drafts.

Changing recipe models now confirms and actually remounts a dirty form instead of silently retargeting its text. Search is paused while an inline edit is dirty so filtering cannot unmount unsaved work. Dynamic Clear, Save, and session-action controls hand focus to an intentional successor when the focused element disappears.

Why it fits: preparation is intentionally free and local, so losing work or presenting an enabled no-op action would undermine the product's safest workflow.

Covered by: Recipe Shelf dirty-state/focus component tests and Playwright checks for workshop restoration and live-local insertion blocking.

### Take finalization is a first-class handoff

Finishing any recording waits for the main recorder and sidecar to settle and publishes the immutable artifact before releasing Decart, remote/cloned tracks, owned camera/microphone tracks, listeners, analysers, and timers. The artifact then replaces live media in the same persistent stage. The studio does not return to or reacquire local preview, and new media work remains locked until the operator closes or discards the take.

The video recorder is authoritative and the audio sidecar is optional: if sidecar construction, start, error handling, or finalization fails, a valid main video still becomes the latest take with an audio-specific recovery notice. This closes a subtle clip-loss path without hiding that voice treatment is unavailable.

Automatic source-ended, spontaneous-stop, recorder-error, and finalization-timeout paths also notify session orchestration exactly once, so live resources are released even when the operator did not click Finish. Browser-default recordings take their MIME type and extension from emitted chunks before recorder fallbacks, preserving native MP4 output where applicable. Recording lifecycle changes are announced and focus moves to the replacement action/status instead of disappearing.

Download dispatch leaves main-stage playback available and enables Close; the app truthfully does not claim browser download completion. Close revokes take URLs and returns to private idle. Confirmed Discard performs the same cleanup without download. A before-unload warning and explicit discard confirmation reduce accidental loss.

Guided adds a 3–2–1 countdown, warns at 4:30, and automatically stops at the five-minute maximum. Its Decart session profile permits seven minutes of active time, distinct from the five-minute credential start TTL, so the full take window remains available. Advanced keeps its five-minute active-session profile. Guided checkpoints finalized media before resource release and preserves the previous valid take until a re-record replacement is safely finalized.

The selected recording tracks are pinned for the lifetime of a take. If either selected video or audio ends, or provider subscription changes which audio/video would be selected, the current take finalizes before the UI accepts the replacement source. This prevents a label or preview from claiming one source while `MediaRecorder` is still capturing another.

Covered by: recorder-construction, chunk-MIME, hung-sidecar, automatic-stop, StrictMode, focus/status, source-recomposition, mocked Local journey, and a model-recording browser assertion that finalization precedes provider release.

### Voice treatments always preserve the immutable original

Every local or ElevenLabs treatment starts from the original take and original sidecar. Processing locks playback/download only while replacement is incomplete, exposes Cancel, and publishes a processed take only after remux success. Original restores immediately without network traffic.

All new capture is locked for the entire review, and superseded processing jobs cannot publish, fail, or unlock a newer job. A missing or unsupported sidecar remains a recoverable voice-only limitation and never invalidates the video take.

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

The build deliberately excludes accounts, remote/cloud projects, server-side take history, collaboration, live distribution, network analytics, payments, social publishing, and speculative AI features. Guided browser-local projects are intentionally scoped to one origin/profile and remain subject to explicit deletion, site-data clearing, private-session lifetime, and browser eviction. Broader persistence would change the privacy/security category and require a new design.
