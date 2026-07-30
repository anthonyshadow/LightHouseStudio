# Browser support

## Current support state

Browser media behavior depends on the exact browser/OS patch, hardware, permissions, codec, and
provider WebRTC path. The app feature-detects critical APIs, but the approved physical matrix is
not yet qualified. The repository currently has no passing physical evidence records (`0/45`).

Use a secure context. Loopback HTTP (`127.0.0.1` or `localhost`) is valid for the local product;
non-loopback use requires HTTPS and a separately approved public security design.

The approved target set is current stable Chrome, Firefox, and Safari where available, across the
devices frozen in the [controlled-pilot contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md). The exact
rows and version strings live in
[`qualification/required-matrix.json`](qualification/required-matrix.json). Record the latest
generally available stable patch and exact installed version; support never carries automatically
to a later browser/OS release.

## Layout contract

Studio is a viewport-bound workspace: the document does not scroll, the persistent stage does not
remount, and named overlay bodies own scrolling. Stage video uses `object-fit: contain`; only local
preview is mirrored.

Automated layout/visual checks cover:

- `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`;
- one persistent live/playback video;
- stable stage geometry across mode, warning, recording, finalizing, playback, and overlay states;
- reachable Record/Stop, device settings, close, and primary overlay actions;
- document/body containment within one CSS pixel; and
- deterministic Chromium states with animation disabled.

Those checks protect implementation but do not qualify Safari, Firefox, touch hardware, safe
areas, the software keyboard, browser chrome changes, or physical 200% text/reflow. See
[Manual QA](MANUAL_QA.md) and the
[visual coverage manifest](screenshot-test-coverage.md).

## Capability and degradation

| Capability        | Requirement                                              | Safe degradation                                                 |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Local preparation | React; browser storage for durable Shelf/Builder data    | Session-only work with warning where storage fails               |
| Camera preview    | `navigator.mediaDevices.getUserMedia` and permission     | Actionable blocked state; no provider contact                    |
| Device selection  | `enumerateDevices`; labels may need prior permission     | Browser default remains available                                |
| Front/rear switch | Active `facingMode` plus exposed opposite capability     | Control omitted; current camera remains                          |
| Camera zoom       | Numeric track zoom capability and `applyConstraints`     | Control omitted; no CSS crop substitute                          |
| Recording         | Live video, `MediaRecorder`, supported/default format    | Record unavailable or fails safely; session remains controllable |
| Decart output     | Local capture, WebRTC, provider reachability/entitlement | Local preview remains the fallback                               |
| Local Voice       | Web Audio, offline render, compatible remux encoder      | Original take remains usable                                     |
| ElevenLabs Voice  | Sidecar, broker, saved voice/model/account support       | Original/local effects remain usable                             |
| Download          | Blob URL plus browser download handling                  | Mobile may open/share rather than save directly                  |

`GET /api/capabilities` reports configuration presence only. It does not prove browser codec
support, provider reachability, quota, entitlement, or output quality.

## Cameras and phone webcams

Lightframe lists only `videoinput` devices exposed by the browser/OS. It does not scan Bluetooth,
Wi-Fi, proximity, or the local network, invent a phone-camera option, or switch sources
automatically.

Before permission, labels and device lists may be generic or incomplete. Opening/refreshing Capture
Settings enumerates devices without calling `getUserMedia`; a successful explicit Start triggers a
post-permission rescan.

**Switch camera** appears only when the active track and post-permission capabilities expose both
`user` and `environment`. It requests the exact opposite facing mode and never cycles desktop
webcams or Continuity Camera. Zoom controls appear only for numeric track zoom capability.

Apple Continuity Camera is an OS feature. If macOS exposes an iPhone as a camera, Studio treats it
as a normal input. Discovery depends on Apple account/device settings, proximity, Bluetooth/Wi-Fi
or USB, permissions, and whether another app owns the camera. If it disappears, refresh device
settings and retry an explicit Start; Studio does not silently replace an active recording/AI
source.

## Recording formats

The app asks `MediaRecorder` for the first supported candidate:

1. WebM VP9/Opus
2. WebM VP8/Opus
3. WebM AV1/Opus
4. generic WebM
5. H.264/AAC MP4
6. generic MP4
7. browser default

Audio sidecars prefer WebM/Opus, then MP4, then the browser default. A positive
`isTypeSupported()` result does not guarantee successful recording, local remux, download, or
cross-player playback. Local Voice remux needs Opus for WebM or AAC for MP4.

## Known physical risks

- Safari/iOS can differ in `MediaRecorder` output, Web Audio decode/encode, Blob download,
  backgrounding, lock/call interruption, and permission recovery.
- Mobile browser chrome, safe areas, keyboards, and legacy viewport-unit behavior can obscure
  controls even when responsive emulation passes.
- Backgrounding, screen lock, privacy switches, Bluetooth handoff, unplugging, or another app can
  end tracks.
- Browser policy, extensions, VPN/firewall/NAT, and provider outages may block WebRTC while Local
  remains usable.
- Five-minute recording plus local/cloud voice processing can exceed practical memory or codec
  budgets on reduced-power devices. See the
  [recording memory policy](RECORDING_MEMORY_POLICY.md).

## Qualification rule

Every required row must physically pass permission allow/deny/revoke; Local/Character/VTO capture;
the 270/300-second warning and finalization; local and ElevenLabs Voice; download/playback;
background/foreground recovery; memory checkpoints; and cleanup. Touch rows also require
portrait/landscape, safe areas, browser chrome, software keyboard, 200% text, touch-control
recovery, and camera switching when exposed. Desktop rows require the five canonical viewports,
pointer/keyboard recovery, 200% text, and device replacement.

Record results through
[controlled-pilot qualification evidence](PILOT_QUALIFICATION_EVIDENCE.md). Emulation, a different
device/browser, or deterministic fakes cannot satisfy a physical row.
