# Browser support

Browser media behavior depends on browser version, operating system, hardware, permissions, selected codecs, and provider WebRTC support. The application feature-detects critical APIs and uses browser-selected formats, but a production target still needs real-device validation.

## Recommended baseline

Use the current stable desktop Chrome or Edge on macOS or Windows for the broadest expected combination of camera capture, WebRTC, WebM/Opus recording, Web Audio, and local remuxing. Current Firefox and Safari are targets, not assumed equivalents. iOS/iPadOS should be treated as constrained targets until tested on the intended OS/device matrix.

The studio must run in a secure context. Loopback HTTP (`127.0.0.1`/`localhost`) is appropriate for local development; any non-loopback deployment needs HTTPS and a separate server security design.

## Capability matrix

| Capability                       | Required browser API or condition                                       | Degradation                                                  |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Prompt workshop and Recipe Shelf | React, `localStorage` for durability                                    | Falls back to in-memory session-only assets if storage fails |
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

Test camera/mic allow and deny, local and model recording, downloaded playback, local processing, permission revocation, background/foreground transitions, narrow/landscape layouts, 200% zoom, keyboard operation, and cleanup indicators. Provider modes also require live credentials and account entitlement.
