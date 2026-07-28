# Browser support

Browser media behavior depends on browser version, operating system, hardware, permissions, selected codecs, and provider WebRTC support. The application feature-detects critical APIs and uses browser-selected formats, but a production target still needs real-device validation.

## Recommended baseline

The approved pilot targets current stable Chrome, Firefox, and Safari on their applicable
platforms. Safari is unavailable on Android. On iOS/iPadOS, Chrome and Firefox share the system
WebKit engine but still require separate application-level permission, viewport, download,
background/foreground, and recovery checks.

The 2026-07-28 qualification baseline is macOS/iOS/iPadOS 26.6, Safari 26.6, Android 17,
Chrome 150.x/151.x stable as generally available for the platform, and Firefox 153.x stable.
Before recording release evidence, update to the latest generally available stable patch and
record the exact installed version. Do not inherit support across a later OS/browser release.

Touch/mobile creation is required, but none of the named targets is a current support claim. Each
remains blocked until it passes the complete physical protocol in this document and
[Manual QA](MANUAL_QA.md).

The studio must run in a secure context. Loopback HTTP (`127.0.0.1`/`localhost`) is appropriate for local development; any non-loopback deployment needs HTTPS and a separate server security design.

## Viewport and input layout

Studio is a viewport-bound workspace rather than a scrolling document. `html`, `body`, and `#root` are full-size, overflow-hidden roots; the shell prefers `100dvh` with `100svh`/`100vh` fallbacks. Safe-area insets are included in shell and overlay padding. The fixed Studio shell contains the header, stable stage, capture strip, and tool launcher; only named overlay bodies scroll.

The fullscreen character builder owns one internal vertical scroller because its independently collapsible choice drawers can contain many visual options. It never creates document overflow and keeps its header, 4:5 preview, controls, focus rings, footer actions, and safe-area padding within the available width and height. The Studio stage remains mounted and inert beneath the panel.

The in-stage session control bar owns **Start Camera + Mic**, **Start AI**, mic/camera toggles,
**Record**/**Stop recording**, AI Change/Stop, and compact take actions. In live and playback states
it hides after three seconds of inactivity and returns on mouse movement or keyboard activity.
Explicit touch/pointer recovery is a release blocker for the required touch/mobile pilot, so no
touch target may be declared supported until `UX-001` in the
[audit findings](project-audit-findings.md) is resolved and physically verified. The AI experience
chooser is a fullscreen responsive overlay.

Responsive behavior is range-based:

- Above `80rem` width and `48rem` height, Dock/Settings use standard right drawers, Workshop may use a wider overlay, and Shelf/Review/Voice use bounded bottom workspaces.
- At `80rem` width or `48rem` height and below, shell rows compact without changing stage geometry; secondary copy collapses before actions or touch targets do.
- From `40rem` through `63.99rem`, Dock/Settings use right slide-overs while Workshop/Shelf/Review/Voice use tall bottom workspaces.
- From `20.01rem` through `39.99rem`, all tools use near-full-height bottom sheets with a small top gap, one body scroller, and sticky primary actions.
- At `20rem` width or `36rem` height and below, tools become full-screen dialogs with visible Close and primary actions; operation must not depend on backdrop dismissal.
- All breakpoints retain reachable **Record**/**Stop recording** and **Device settings** actions. Mode, notice, recording, finalizing, playback, and overlay state must not resize the stage.

The required visual regression sizes are `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`. The current curated Chromium matrix uses its 29-case review budget for closed initial Studio, local live, and recording at all five sizes; AI choice, selected-character live, Character Builder combined-ready, saved-character selection, and settled Take Review at desktop and small mobile; desktop VTO preparation and Voice Browser; and small-mobile finalizing and permission error. Semantic readiness and required state/viewport pairs are the correctness rules; the count is a cost budget. Animations are disabled and `maxDiffPixelRatio` is `0.005`. At every size, document and body scroll width/height must stay within the viewport (allowing one pixel of browser rounding). Stage video uses `object-fit: contain` to preserve the whole frame, mirrors local preview only, and does not crop transformed output or recorded playback.

The executable visual matrix and pruning inventory share the same case paths. Darwin and Linux baselines are host-specific because font rasterization differs. See the [screenshot coverage manifest](screenshot-test-coverage.md).

## Capability matrix

| Capability                       | Required browser API or condition                                       | Degradation                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Prompt Workshop and Recipe Shelf | React, `localStorage` for durability                                    | Falls back to in-memory session-only assets if storage fails                                    |
| Character drafts                 | IndexedDB                                                               | Keeps the current draft in memory, warns before unsafe close, and exposes retry or discard      |
| Character Builder references     | Same-origin broker and writable `LIGHTFRAME_DATA_DIR`                   | Prompt-only drafting/save remains; upload/generation reports the storage failure                |
| Legacy Guided projects           | IndexedDB with structured-clone `Blob` support                          | Keeps retained records available for manager download/delete when durable storage can be opened |
| Capture source selection         | `enumerateDevices`; labels may require prior permission                 | Default camera/microphone remain selectable                                                     |
| Camera preview                   | Secure context, `navigator.mediaDevices.getUserMedia`                   | Blocked with actionable notice                                                                  |
| Recording                        | `MediaRecorder`, a live video track, a supported/default MIME type      | Record is disabled/errors safely; the live session remains available for explicit Close/Stop AI |
| Model output                     | Local capture, WebRTC, official Decart SDK/provider reachability        | Local fallback remains; AI unavailable                                                          |
| Local voice effects              | `AudioContext`, `OfflineAudioContext`, decode support                   | Original take remains downloadable                                                              |
| Processed remux                  | Mediabunny input parsing plus browser AAC or Opus encoding              | Processing fails safely; original/last valid take remains                                       |
| ElevenLabs conversion            | Audio sidecar, same-origin broker, provider account/model/voice support | Local effects and original remain available                                                     |
| ElevenLabs preview               | Explicit voice-browser action, fetch/Blob URL/audio playback            | Preview exposes retry; selection and the valid take remain available                            |
| Download                         | Blob URLs and browser download handling                                 | Mobile browsers may open/share instead of saving directly                                       |

## Recording formats

At runtime the app tries, in order, WebM VP9/Opus, WebM VP8/Opus, WebM AV1/Opus, generic WebM, H.264/AAC MP4, generic MP4, then the browser default. Audio sidecars similarly prefer WebM/Opus and fall back to MP4 or the browser default.

Codec claims from `MediaRecorder.isTypeSupported` are necessary but not sufficient; some browser/OS combinations fail at start or produce files with limited playback compatibility. Local voice remux requires Opus for WebM or AAC for MP4. Always record, process, download, and play a real sample on each release target.

## Known platform risks

- Safari and iOS have historically differed in `MediaRecorder` MIME output, background-tab behavior, camera interruption, Blob download UX, and Web Audio codec support.
- Control-bar activity recovery is implemented for mouse movement and keyboard input. Explicit touch/pointer/focus recovery after auto-hide is not currently covered, so verify it on each touch target.
- Older mobile engines may implement `vh` differently from the dynamic visible viewport. The `dvh` path and safe-area padding must still be checked with browser chrome shown/hidden and the on-screen keyboard open.
- Mobile browsers may stop camera tracks when the tab backgrounds, the screen locks, a call arrives, or another app claims the camera.
- Multiple cameras/microphones, Bluetooth handoff, privacy switches, and virtual devices can end tracks unexpectedly.
- Enterprise policies, browser extensions, VPN/firewall rules, NAT, and provider outages can block WebRTC while local capture still works.
- Long recordings and audio remuxing are memory-intensive because current Studio artifacts are
  held in the tab. The [recording memory policy](RECORDING_MEMORY_POLICY.md) defines the required
  target-device measurements. The approved take maximum is 300 seconds, but ordinary recording
  does not yet warn or safely auto-finalize at that boundary. Connection-start credentials, the
  broker's default AI active-session scope, and ElevenLabs conversion also use five-minute
  boundaries, but those provider contracts do not replace the app-owned recording cap.
- Reduced-power/mobile devices may not render offline audio or remux quickly enough for a comfortable workflow.

## Approved qualification matrix

The product owner selected the following physical targets. The phone selection follows the latest
available high-volume model data and adds Google reference devices for the current Android
platform. The tablet selection covers high-volume Apple/Samsung families and an Android 17
large-screen sentinel. Rebaseline popularity before a release candidate; do not silently
substitute a device.

| Class                      | Physical targets                                                                            | OS/browser requirement                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop                    | MacBook Pro 14-inch (2021, M1 Pro; `MacBookPro18,3`)                                        | macOS 26.6; Safari 26.6; Chrome 150.0.7871.187 or newer stable patch in major 150; Firefox 153.x stable                                    |
| Apple phones               | iPhone 17; iPhone 17 Pro; iPhone 17 Pro Max; iPhone 16; iPhone 16 Pro Max                   | iOS 26.6; Safari 26.6; Chrome for iOS 151.x stable; Firefox for iOS 153.x stable                                                           |
| Android phones             | Galaxy A07 4G; Galaxy A16 5G; Galaxy A56 5G; Galaxy A36 5G; Redmi A5                        | Latest vendor-stable OS; Chrome and Firefox latest stable. Android 17 support remains blocked on a row until the OEM release is available. |
| Android 17 phone sentinel  | Google Pixel 10                                                                             | Android 17 current stable patch; Chrome and Firefox latest stable                                                                          |
| Popularity-led tablets     | iPad (A16); iPad Air 11-inch (M3); iPad Pro 11-inch (M5); Galaxy Tab A9+; Galaxy Tab S10 FE | Apple rows: iPadOS/Safari 26.6 plus Chrome/Firefox latest stable. Android rows: latest vendor-stable OS; Chrome/Firefox latest stable.     |
| Android 17 tablet sentinel | Google Pixel Tablet                                                                         | Android 17 current stable patch; Chrome and Firefox latest stable                                                                          |

The complete selection basis, rolling-version rule, and qualification statuses live in the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md).

For each desktop browser, cover the five required CSS viewports where the browser permits. On each
physical phone/tablet target, cover portrait and landscape, safe areas, browser chrome
expansion/collapse, and the software keyboard. Test camera/mic allow and deny, source replacement,
Local/Character/VTO recording through the 300-second cap, downloaded playback, local and
ElevenLabs processing, permission revocation, background/foreground transitions, 200% zoom/large
text, keyboard/touch operation, overlay focus, and cleanup indicators. Provider modes also require
live credentials, exact account entitlement, and the approved content/retention policy.
