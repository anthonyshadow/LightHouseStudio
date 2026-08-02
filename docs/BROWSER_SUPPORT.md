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

| Capability        | Requirement                                                            | Safe degradation                                                                       |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Local preparation | React; browser storage for durable Shelf/Builder data                  | Session-only work with warning where storage fails                                     |
| Camera preview    | `navigator.mediaDevices.getUserMedia` and permission                   | Actionable blocked state; no provider contact                                          |
| Device selection  | `enumerateDevices`; labels may need prior permission                   | Browser default remains available                                                      |
| Front/rear switch | Active `facingMode` plus exposed opposite capability                   | Control omitted; current camera remains                                                |
| Camera zoom       | Numeric track zoom capability and `applyConstraints`                   | Control omitted; no CSS crop substitute                                                |
| Recording         | Live video, `MediaRecorder`, decodable capture, H.264 WebCodecs encode | No raw download fallback; conversion fails safely and the session remains controllable |
| Existing video    | File input/drop, Blob playback, supported H.264/VP8 file               | Local validation explains export needs; camera stays optional                          |
| Decart output     | Local capture, WebRTC, provider reachability/entitlement               | Local preview remains the fallback                                                     |
| Batch visual      | Supported source, broker, exact model availability                     | Local preview/download remains available without a key                                 |
| Local Voice       | Web Audio, offline render, AAC encoder, MP4 remux                      | Original take remains usable                                                           |
| ElevenLabs Voice  | Sidecar, broker, saved voice/model/account support                     | Original/local effects remain usable                                                   |
| Download          | Blob URL plus browser download handling                                | Mobile may open/share rather than save directly                                        |

`GET /api/capabilities` reports configuration presence only. It does not prove browser codec
support, provider reachability, quota, entitlement, or output quality.

## Cameras and phone webcams

Lightframe lists only `videoinput` devices exposed by the browser/OS. It does not scan Bluetooth,
Wi-Fi, proximity, or the local network, invent a phone-camera option, or switch sources
automatically.

Before permission, labels and device lists may be generic or incomplete. Opening/refreshing Capture
Settings enumerates devices without calling `getUserMedia`; a successful explicit Start triggers a
post-permission rescan.

Local Capture Settings offers 16:9 landscape and 9:16 portrait. The selected format changes the
persistent preview frame and is sent as an exact camera aspect constraint with the selected
quality target; recording borrows the resulting track. A camera/browser that cannot satisfy the
format may reject Start or Apply, and **Active capture** remains the source of truth for negotiated
dimensions. Physical portrait support is not qualified until the device matrix passes.

**Switch camera** appears only when the active track and post-permission capabilities expose both
`user` and `environment`. It requests the exact opposite facing mode and never cycles desktop
webcams or Continuity Camera. Zoom controls appear only for numeric track zoom capability.

Apple Continuity Camera is an OS feature. If macOS exposes an iPhone as a camera, Studio treats it
as a normal input. Discovery depends on Apple account/device settings, proximity, Bluetooth/Wi-Fi
or USB, permissions, and whether another app owns the camera. If it disappears, refresh device
settings and retry an explicit Start; Studio does not silently replace an active recording/AI
source.

## Recording formats

The app asks `MediaRecorder` for the first supported intermediate capture candidate:

1. WebM VP9/Opus
2. WebM VP8/Opus
3. WebM AV1/Opus
4. generic WebM
5. H.264/AAC MP4
6. generic MP4
7. browser default

After the main recorder and optional sidecar settle, MediaBunny decodes that intermediate and
forces the primary video to AVC/H.264 and its primary audio, when present, to AAC in one MP4. The
browser's H.264 WebCodecs encoder is required. Studio lazily registers MediaBunny's official
on-device AAC encoder extension when native AAC encoding is unavailable. The raw recorder
container receives no object URL and cannot be downloaded.

Audio sidecars still prefer WebM/Opus, then MP4, then the browser default so Voice can always start
from immutable captured audio. A positive `isTypeSupported()` result does not guarantee successful
recording, decode, H.264 encode, download, or cross-player playback. If conversion cannot preserve
the primary video and audio tracks, Studio publishes no download artifact.

## Existing-video formats

The accepted provider-processing subset is intentionally narrow:

- MP4 or QuickTime/MOV with an H.264 video track;
- WebM with a VP8 video track;
- duration greater than zero and no more than 300 seconds; and
- displayed aspect within 1% of 16:9 or 9:16.

The browser performs an early metadata and decode check, but the server's streamed byte inspection
is authoritative before provider contact. HEVC, ProRes, VP9, AV1, container aliases, and
undocumented codecs are rejected with H.264 export guidance; Studio does not silently transcode
them. Visual processing remains available without source audio, but Voice is disabled if a usable
immutable audio sidecar cannot be extracted. Provider results must be 1280×720 or 720×1280, retain
the source orientation, and differ from the input duration by no more than 500 ms.

## Known physical risks

- Safari/iOS can differ in `MediaRecorder` output, Web Audio decode/encode, Blob download,
  backgrounding, lock/call interruption, and permission recovery.
- Mobile browser chrome, safe areas, keyboards, and legacy viewport-unit behavior can obscure
  controls even when responsive emulation passes.
- Backgrounding, screen lock, privacy switches, Bluetooth handoff, unplugging, or another app can
  end tracks.
- Browser policy, extensions, VPN/firewall/NAT, and provider outages may block WebRTC while Local
  remains usable.
- Five-minute recording, the required device-local H.264/AAC conversion, and local/cloud voice
  processing can exceed practical memory or codec budgets on reduced-power devices. See the
  [recording memory policy](RECORDING_MEMORY_POLICY.md).
- File-picker MIME reporting, H.264 MOV playback, WebM VP8 support, audio extraction, and download
  behavior differ across iOS, Android, Safari, Firefox, and Chrome. A browser-local preview is not
  evidence that server/provider qualification passed.

## Qualification rule

Every required row must physically pass permission allow/deny/revoke; Local/Character/VTO capture;
uploaded-video pick, replace, local download, mutually exclusive batch Lucy and batch VTO; the
270/300-second warning and finalization; local and ElevenLabs Voice;
download/playback; background/foreground recovery; memory checkpoints; and cleanup. Touch rows
also require native file pickers, portrait/landscape, safe areas, browser chrome, software
keyboard, 200% text, touch-control recovery, and camera switching when exposed. Desktop rows
require the five canonical viewports, pointer/keyboard recovery, 200% text, and device replacement.

Record results through
[controlled-pilot qualification evidence](PILOT_QUALIFICATION_EVIDENCE.md). Emulation, a different
device/browser, or deterministic fakes cannot satisfy a physical row.
