# Browser support

Browser media behavior depends on browser version, operating system, hardware, permissions, selected codecs, and provider WebRTC support. The application feature-detects critical APIs and uses browser-selected formats, but a production target still needs real-device validation.

## Recommended baseline

Use the current stable desktop Chrome or Edge on macOS or Windows for the broadest expected combination of camera capture, WebRTC, WebM/Opus recording, Web Audio, and local remuxing. Current Firefox and Safari are targets, not assumed equivalents. iOS/iPadOS should be treated as constrained targets until tested on the intended OS/device matrix.

The studio must run in a secure context. Loopback HTTP (`127.0.0.1`/`localhost`) is appropriate for local development; any non-loopback deployment needs HTTPS and a separate server security design.

## Viewport and input layout

The application is a viewport-bound studio, not a scrolling document. `html`, `body`, and `#root` are full-size, overflow-hidden roots; the shell uses `100dvh` when available and `100vh` as fallback. Safe-area insets are included in shell and overlay padding. The stage, dock, and workbench are shrinking grid children, and only named internal regions scroll.

Responsive behavior is range-based:

- Above `63.99rem` (1023.84 CSS px), the Recipe Dock is a persistent right column. Recording collapses it to a narrow recording rail.
- Above `80rem` width and `48rem` height, Character Workshop widens the right workspace and Recipe Shelf replaces the bounded lower workbench while the stage remains visible.
- At `80rem` width or `48rem` height and below, Latest Take and Voice Treatment share a single-tool tab tray rather than simultaneous panels; Workshop and Shelf use the common modal overlay system.
- At `63.99rem` and below, Dock and Take launchers appear in the bottom tool rail and the Recipe Dock becomes a modal right drawer. Capture Settings remains an overlay at every size.
- At `39.99rem` width and below, overlays occupy the full viewport, capture metadata is removed from the strip, capability text becomes labelled status dots, and the inline workbench is hidden. The primary Record/Finish action and bottom tool rail remain in the shell.
- At `36rem` height and below, vertical gaps and secondary labels compact further; disabled and failure reasons remain reachable, and large tools continue to scroll inside their overlays.

The required visual regression sizes are `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`. At every size, document and body scroll width/height must stay within the viewport (allowing one pixel of browser rounding). Stage video uses `object-fit: contain` to preserve the whole frame, mirrors local preview only, and does not crop transformed output.

## Capability matrix

| Capability                       | Required browser API or condition                                       | Degradation                                                  |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Prompt workshop and Recipe Shelf | React, `localStorage` for durability                                    | Falls back to in-memory session-only assets if storage fails |
| Capture source selection         | `enumerateDevices`; labels may require prior permission                 | Default camera/microphone remain selectable                  |
| Camera preview                   | Secure context, `navigator.mediaDevices.getUserMedia`                   | Blocked with actionable notice                               |
| Recording                        | `MediaRecorder`, a live video track, a supported/default MIME type      | Recording disabled/error; preview remains                    |
| Model output                     | Local capture, WebRTC, official Decart SDK/provider reachability        | Local fallback remains; AI unavailable                       |
| Local voice effects              | `AudioContext`, `OfflineAudioContext`, decode support                   | Original take remains downloadable                           |
| Processed remux                  | Mediabunny input parsing plus browser AAC or Opus encoding              | Processing fails safely; original/last valid take remains    |
| ElevenLabs conversion            | Audio sidecar, same-origin broker, provider account/model/voice support | Local effects and original remain available                  |
| Download                         | Blob URLs and browser download handling                                 | Mobile browsers may open/share instead of saving directly    |

## Recording formats

At runtime the app tries, in order, WebM VP9/Opus, WebM VP8/Opus, generic WebM, H.264/AAC MP4, generic MP4, then the browser default. Audio sidecars similarly prefer WebM/Opus and fall back to MP4 or the browser default.

Codec claims from `MediaRecorder.isTypeSupported` are necessary but not sufficient; some browser/OS combinations fail at start or produce files with limited playback compatibility. Local voice remux requires Opus for WebM or AAC for MP4. Always record, process, download, and play a real sample on each release target.

## Known platform risks

- Safari and iOS have historically differed in `MediaRecorder` MIME output, background-tab behavior, camera interruption, Blob download UX, and Web Audio codec support.
- Older mobile engines may implement `vh` differently from the dynamic visible viewport. The `dvh` path and safe-area padding must still be checked with browser chrome shown/hidden and the on-screen keyboard open.
- Mobile browsers may stop camera tracks when the tab backgrounds, the screen locks, a call arrives, or another app claims the camera.
- Multiple cameras/microphones, Bluetooth handoff, privacy switches, and virtual devices can end tracks unexpectedly.
- Enterprise policies, browser extensions, VPN/firewall rules, NAT, and provider outages can block WebRTC while local capture still works.
- Long recordings and audio remuxing are memory-intensive because artifacts are held in the tab. Model credentials cap realtime sessions at five minutes; ElevenLabs UI limits conversion to takes no longer than five minutes.
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
