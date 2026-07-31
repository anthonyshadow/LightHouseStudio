# Manual release QA

Manual QA complements deterministic tests. It is required for physical camera/microphone behavior,
final browser codecs/downloads, real touch/reflow, interruption/cleanup indicators, memory, and
live provider accounts.

**Current state:** all `45` physical device/browser rows remain open. Emulation and synthetic media
do not qualify them.

## Before physical or paid work

Run the exact release candidate:

```bash
pnpm quality
pnpm test:coverage
pnpm test:e2e
pnpm test:production
pnpm test:visual
pnpm audit:all
pnpm audit:prod
```

Then obtain the exact required rows/check IDs:

```bash
pnpm pilot:qualification:check --commit "$(git rev-parse HEAD)" --verbose
```

Use the devices and browser versions in
[`qualification/required-matrix.json`](qualification/required-matrix.json). Record only the fields
allowed by [qualification evidence](PILOT_QUALIFICATION_EVIDENCE.md). Never attach credentials,
tokens, participant codes, personal media, raw provider responses, URLs, headers, device IDs, or
network archives.

Provider checks use the separate [gated live procedure](LIVE_PROVIDER_SMOKE.md). OpenAI, BFL, and
Wiro require separate startups; Wiro is operator-only. Participant ElevenLabs Apply requires
confirmed zero-retention eligibility.

## Per-row physical protocol

Use non-sensitive disposable media. Start from a fresh browser profile and stopped media. Run the
primary flows in [user stories](userStories/README.md) and record every applicable matrix check.

### Common checks

| Check                          | Pass condition                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permission-allow-deny-revoke` | Allow, deny, and revoke camera/mic; errors are actionable; no token/provider work precedes healthy local media                                                      |
| `local-capture`                | Start Local, verify mirrored contained video/audio, capability-gated camera/zoom controls, recordable source                                                        |
| `character-capture`            | Exact Lucy 2.5 Start/Apply, local fallback until usable remote video, short playable take                                                                           |
| `vto-capture`                  | Exact pinned VTO Start/Apply, image-only does not invent text, short playable take                                                                                  |
| `upload-select-replace-remove` | Native picker and drop publish compatible media without camera/provider work; replace/remove revokes only owned URLs                                                |
| `upload-local-download`        | A zero-step H.264 MP4/MOV or VP8 WebM source previews and downloads with no external request                                                                        |
| `upload-single-visual-step`    | Lucy/VTO selector switches both ways; only the active model submits once, returns inspected 720p output, and restores source audio                                  |
| `upload-voice`                 | Local and ElevenLabs Voice use immutable uploaded source audio and apply to the latest visual result                                                                |
| `record-300-seconds`           | At 270 seconds warning is visible/announced; at 300 seconds Stop coalesces once                                                                                     |
| `record-finalize`              | Main recorder and optional sidecar settle, then device-local H.264/AAC MP4 transcode completes before source/provider release; no raw download fallback             |
| `local-voice`                  | Warm/Clear/Robot always start from immutable original; success/cancel/failure preserves a valid take                                                                |
| `elevenlabs-voice`             | Saved browse/preview sends no take; Apply sends only original sidecar; remux/original recovery works                                                                |
| `download-playback`            | Download dispatch leaves review intact; an inspector/player confirms recorded output is MP4 with H.264 and AAC when audio exists; Release works only after dispatch |
| `background-foreground`        | Background/foreground, screen lock/call/device interruption recovers safely or finalizes without take loss                                                          |
| `memory-checkpoints`           | Complete [300-second memory protocol](RECORDING_MEMORY_POLICY.md) through processing and Release/Discard                                                            |
| `cleanup`                      | Camera/mic indicators, WebRTC/provider clients, recorders, timers, listeners, audio contexts, tracks, and superseded URLs terminate once                            |

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

Touch/mobile creation includes opening Character Builder, creating/saving a reusable character,
starting Character AI, recording, optional Voice, and Download. It also includes native
existing-video selection, replacement, mutually exclusive Lucy/VTO setup, Voice, and Download—not
just responsive shell inspection.

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

## Capture/device checks

- Opening Capture Settings before Start may enumerate devices but must not call `getUserMedia` or
  prompt. Applied preferences are tab-only and disappear on reload.
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
  VTO's lower input cap, exact 720p result orientation, and the 500 ms synchronization tolerance.
- Interrupt upload before provider acceptance, background/foreground during polling, restart the
  broker, expire a result, retry status/content/local finalization, and race source replacement.
  No path may create an automatic paid resubmission or discard the last valid artifact.
- Confirm provider-active processing blocks source/visual-choice mutation and Studio exit; refresh warns
  but does not promise tab/process recovery. Repeated cleanup is idempotent and never claims
  provider cancellation.
- Recording pins source identity. Model recording is unavailable before live transformed video.
- Final main video remains valid if the sidecar fails or reaches its grace timeout, but review and
  Download remain unavailable until MediaBunny finishes the required H.264/AAC MP4.
- A conversion failure or dropped primary video/audio track exposes no raw recorder URL or
  downloadable fallback.
- Playback stays on the persistent stage; Latest Take opens only through **Take** and contains no
  duplicate player.
- While review owns a take, new capture/mode/device changes are blocked. Exit is
  Download-then-Release or confirmed Discard.
- Refresh/close warns about take loss; intentionally leaving proves the take is not durable.
- Local and cloud Voice lock playback/download during processing, create a healthy replacement
  before revoking the prior processed URL, and never mutate the immutable original.
- ElevenLabs preview is bounded to 2 MiB and conversion to 8 MiB; oversize/malformed/cancelled
  output preserves the valid take.
- Repeated Start/Stop/Reset/processing cycles leave no owned track/client/listener/timer/context or
  stale object URL.

## Accessibility

Using keyboard and a screen reader:

- traverse skip link, Start/AI choices, fields/files, Apply, settings, Record/Stop, Shelf, Take,
  Voice, Download, Release/Discard;
- verify names, roles, states, validation, live/status announcements, logical focus, visible focus,
  reduced motion, and approximately 44 px touch actions;
- ensure topmost overlays alone are active, Tab wraps inside, Escape closes one layer, background
  is inert, and focus returns to the exact launcher; and
- confirm the 270-second recording and AI warnings announce once without moving the stage or
  hiding Stop.

## Result

A passing JSON record must contain every required check for the exact row and commit. A blocked or
failed record is valid evidence but does not satisfy release. Re-run the validator after recording
results; release remains open until it reports `9/9` provider/local and `45/45` physical rows with
no invalid records.
