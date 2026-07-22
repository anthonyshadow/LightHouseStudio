# Browser support

Browser media behavior depends on browser version, operating system, hardware, permissions, selected codecs, and provider WebRTC support. The application feature-detects critical APIs and uses browser-selected formats, but a production target still needs real-device validation.

## Recommended baseline

Use the current stable desktop Chrome or Edge on macOS or Windows for the broadest expected combination of camera capture, WebRTC, WebM/Opus recording, Web Audio, and local remuxing. Current Firefox and Safari are targets, not assumed equivalents. iOS/iPadOS should be treated as constrained targets until tested on the intended OS/device matrix.

The studio must run in a secure context. Loopback HTTP (`127.0.0.1`/`localhost`) is appropriate for local development; any non-loopback deployment needs HTTPS and a separate server security design.

## Viewport and input layout

Studio is a viewport-bound workspace rather than a scrolling document. `html`, `body`, and `#root` are full-size, overflow-hidden roots; the shell prefers `100dvh` with `100svh`/`100vh` fallbacks. Safe-area insets are included in shell and overlay padding. The fixed Studio shell contains the header, stable stage, capture strip, and tool launcher; only named overlay bodies scroll.

The fullscreen character builder owns one internal vertical scroller because its independently collapsible choice drawers can contain many visual options. It never creates document overflow and keeps its header, 4:5 preview, controls, focus rings, footer actions, and safe-area padding within the available width and height. The Studio stage remains mounted and inert beneath the panel.

Responsive behavior is range-based:

- Above `80rem` width and `48rem` height, Dock/Settings use standard right drawers, Workshop may use a wider overlay, and Shelf/Review/Voice use bounded bottom workspaces.
- At `80rem` width or `48rem` height and below, shell rows compact without changing stage geometry; secondary copy collapses before actions or touch targets do.
- From `40rem` through `63.99rem`, Dock/Settings use right slide-overs while Workshop/Shelf/Review/Voice use tall bottom workspaces.
- From `20.01rem` through `39.99rem`, all tools use near-full-height bottom sheets with a small top gap, one body scroller, and sticky primary actions.
- At `20rem` width or `36rem` height and below, tools become full-screen dialogs with visible Close and primary actions; operation must not depend on backdrop dismissal.
- All breakpoints retain the fixed Record/Finish and Capture Settings actions. Mode, notice, recording, finalizing, playback, and overlay state must not resize the stage.

The required visual regression sizes are `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`. The curated Linux Chromium gate stores exactly 27 baselines: idle, recording, and character-live at all five sizes, plus finalizing, error, VTON, workshop, capture, and review at desktop and small mobile. Animations are disabled and `maxDiffPixelRatio` is `0.005`. At every size, document and body scroll width/height must stay within the viewport (allowing one pixel of browser rounding). Stage video uses `object-fit: contain` to preserve the whole frame, mirrors local preview only, and does not crop transformed output or recorded playback.

## Capability matrix

| Capability                       | Required browser API or condition                                       | Degradation                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Prompt workshop and Recipe Shelf | React, `localStorage` for durability                                    | Falls back to in-memory session-only assets if storage fails                                    |
| Character drafts                 | IndexedDB                                                               | Keeps the current draft in memory, warns before unsafe close, and exposes retry or discard      |
| Legacy Guided projects           | IndexedDB with structured-clone `Blob` support                          | Keeps retained records available for manager download/delete when durable storage can be opened |
| Capture source selection         | `enumerateDevices`; labels may require prior permission                 | Default camera/microphone remain selectable                                                     |
| Camera preview                   | Secure context, `navigator.mediaDevices.getUserMedia`                   | Blocked with actionable notice                                                                  |
| Recording                        | `MediaRecorder`, a live video track, a supported/default MIME type      | Start is disabled/errors safely; the current live session remains until Finish or explicit Stop |
| Model output                     | Local capture, WebRTC, official Decart SDK/provider reachability        | Local fallback remains; AI unavailable                                                          |
| Local voice effects              | `AudioContext`, `OfflineAudioContext`, decode support                   | Original take remains downloadable                                                              |
| Processed remux                  | Mediabunny input parsing plus browser AAC or Opus encoding              | Processing fails safely; original/last valid take remains                                       |
| ElevenLabs conversion            | Audio sidecar, same-origin broker, provider account/model/voice support | Local effects and original remain available                                                     |
| ElevenLabs preview               | Explicit voice-browser action, fetch/Blob URL/audio playback            | Preview exposes retry; selection and the valid take remain available                            |
| Download                         | Blob URLs and browser download handling                                 | Mobile browsers may open/share instead of saving directly                                       |

## Recording formats

At runtime the app tries, in order, WebM VP9/Opus, WebM VP8/Opus, generic WebM, H.264/AAC MP4, generic MP4, then the browser default. Audio sidecars similarly prefer WebM/Opus and fall back to MP4 or the browser default.

Codec claims from `MediaRecorder.isTypeSupported` are necessary but not sufficient; some browser/OS combinations fail at start or produce files with limited playback compatibility. Local voice remux requires Opus for WebM or AAC for MP4. Always record, process, download, and play a real sample on each release target.

## Known platform risks

- Safari and iOS have historically differed in `MediaRecorder` MIME output, background-tab behavior, camera interruption, Blob download UX, and Web Audio codec support.
- Older mobile engines may implement `vh` differently from the dynamic visible viewport. The `dvh` path and safe-area padding must still be checked with browser chrome shown/hidden and the on-screen keyboard open.
- Mobile browsers may stop camera tracks when the tab backgrounds, the screen locks, a call arrives, or another app claims the camera.
- Multiple cameras/microphones, Bluetooth handoff, privacy switches, and virtual devices can end tracks unexpectedly.
- Enterprise policies, browser extensions, VPN/firewall rules, NAT, and provider outages can block WebRTC while local capture still works.
- Long recordings and audio remuxing are memory-intensive because current Studio artifacts are held in the tab. Connection-start credentials expire after five minutes, Studio active sessions are capped at five minutes, and every recording still warns at 4:30 and stops at 5:00. ElevenLabs UI limits conversion to takes no longer than five minutes.
- Reduced-power/mobile devices may not render offline audio or remux quickly enough for a comfortable workflow.

## Release browser matrix

Before declaring support, run [manual QA](MANUAL_QA.md) on at least:

- current Chrome and Edge desktop;
- current Firefox desktop;
- current Safari on macOS;
- current iOS Safari on a physical phone;
- one Android Chromium device;
- at least one external/USB or Bluetooth input configuration if relevant.

For each desktop engine, cover the five required CSS viewports where the browser permits. On physical phone/tablet targets, cover the closest portrait sizes plus landscape, safe areas, browser chrome expansion/collapse, and the software keyboard. Test camera/mic allow and deny, source replacement, local and model recording, downloaded playback, local processing, permission revocation, background/foreground transitions, 200% zoom/large text, keyboard operation, overlay focus, and cleanup indicators. Provider modes also require live credentials and account entitlement.
