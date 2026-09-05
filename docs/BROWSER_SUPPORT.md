# Browser support

## Current support state

Browser media behavior depends on the exact browser/OS patch, hardware, permissions, codec, and
provider WebRTC path. The app feature-detects critical APIs, while physical support claims still
require validation on the exact target.

The [MVP acceptance runbook](MVP_ACCEPTANCE.md) records deterministic browser evidence. It does not
replace the physical target rule below.

Use a secure context. Loopback HTTP (`127.0.0.1` or `localhost`) is valid for the local product;
non-loopback use requires HTTPS and a separately approved public security design.

The target set is current stable Chrome, Firefox, and Safari where available. Record the latest
generally available stable patch and exact installed version during manual validation; support
never carries automatically to a later browser/OS release.

## Layout contract

Studio is a viewport-bound workspace: the document does not scroll, the stage does not
remount, and named overlay bodies own scrolling. Stage video uses `object-fit: contain`; only local
preview is mirrored.

Automated layout/visual checks cover:

- `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`;
- one live/playback video;
- stable stage geometry across mode, warning, recording, finalizing, playback, and overlay states;
- reachable Record/Stop, device settings, close, and primary overlay actions;
- Campaign/Project workspace, small-mobile Project output review, and selected 200%-text
  organization/history cases;
- document/body containment within one CSS pixel; and
- deterministic Chromium states with animation disabled.

Those checks protect implementation but do not validate Safari, Firefox, touch hardware, safe
areas, the software keyboard, browser chrome changes, or physical 200% text/reflow. See
[Manual QA](MANUAL_QA.md) and the
[visual coverage manifest](screenshot-test-coverage.md).

## Capability and degradation

| Capability        | Requirement                                                                            | Safe degradation                                                                              |
| ----------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Local preparation | React; browser storage for durable Shelf/Builder data                                  | Session-only work with warning where storage fails                                            |
| Camera preview    | `navigator.mediaDevices.getUserMedia` and permission                                   | Actionable blocked state; no provider contact                                                 |
| Device selection  | `enumerateDevices`; labels may need prior permission                                   | Browser default remains available                                                             |
| Front/rear switch | Active `facingMode` plus exposed opposite capability                                   | Control omitted; current camera remains                                                       |
| Camera zoom       | Numeric track zoom capability and `applyConstraints`                                   | Control omitted; no CSS crop substitute                                                       |
| Recording         | Live video, `MediaRecorder`, decodable capture, H.264 WebCodecs encode                 | No raw download fallback; conversion fails safely and the session remains controllable        |
| Existing video    | File input/drop, Blob playback, supported H.264/VP8 file                               | Local validation explains export needs; camera stays optional                                 |
| Durable Project   | Authenticated API plus supported video decode and local storage/relational authority   | Safe loading/error state; no false resumability, provider start, or stale media reuse         |
| Local video edit  | WebGL, dedicated workers, OffscreenCanvas, H.264 WebCodecs encode, AAC when needed     | Playback, Download, Voice, and existing workflows remain usable; no main-thread export        |
| Export placement  | The same local-editor path: WebGL preview plus worker WebCodecs/OffscreenCanvas export | The chooser states the editor is unavailable and stays on "Keep as it is"; saving still works |
| Decart output     | Local capture, WebRTC, provider reachability/entitlement                               | Local preview remains the fallback                                                            |
| Batch visual      | Supported source, broker, operation capability; WebCodecs for required MP4 preparation | Local preview/download remains available without a configured operation                       |
| Local Voice       | Web Audio, offline render, AAC encoder, MP4 remux                                      | Original take remains usable                                                                  |
| ElevenLabs Voice  | Sidecar, broker, saved voice/model/account support                                     | Original/local effects remain usable                                                          |
| Download          | Blob URL plus browser download handling                                                | Mobile may open/share rather than save directly                                               |

A retained recording gets one owner-controlled object-URL repair attempt after a playback error.
This covers a stale Blob URL without turning a genuinely undecodable file into a retry loop.

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
dimensions. Physical portrait support must be checked on each claimed target.

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

The accepted local upload subset is intentionally narrow by container, codec, and duration:

- MP4 or QuickTime/MOV with an H.264 video track;
- WebM with a VP8 video track;
- duration greater than zero and no more than 300 seconds.

Uploads may use any playable aspect ratio. Studio recommends 16:9 or 9:16 for the best experience
and offers **Edit video** after upload to crop to either ratio. Only sources within 1% of 16:9 or
9:16 are eligible for Character Swap/VTO; other ratios retain local adjustment, Voice, and
Download without provider contact.

The browser performs an early metadata and decode check, but the server's streamed byte inspection
is authoritative before provider contact. A source whose codec this product cannot publish —
HEVC and ProRes above all, which is what an iPhone records by default — is converted to H.264 MP4
in the browser when `VideoDecoder.isConfigSupported` says this browser can decode it, announced
while it happens rather than done silently, and inspected again afterwards. Where the browser
cannot decode it, and for container aliases and undocumented codecs, the file is refused with
H.264 export guidance that says the browser cannot convert it either. Visual processing remains available without source audio, but Voice is disabled if a usable
immutable audio sidecar cannot be extracted. Provider results must be 1280×720 or 720×1280, retain
the source orientation, and differ from the input duration by no more than 500 ms when Decart owns
the operation. Pruna Character Swap uses its documented approximate 1 MP/2 MP class and accepts
the inspected result dimensions after emitting a content-free server warning when they differ from
the canonical target; the browser must match the server-approved result metadata exactly. The Pruna
resolution class is selected in the Character Swap editor for each submission.

Saved Video thumbnail capture is an optional browser-local enhancement. It uses MediaBunny's
canvas-frame path and WebCodecs rather than another `<video>` element, then the loopback broker
validates and bounds the image as WebP. A browser decode/canvas failure leaves the video saved and
the gallery displays its accessible placeholder. Gallery metadata, rename, versioning,
authenticated content loading, Download, and Delete do not depend on thumbnail support.

## Local video editor

The editor checks WebGL preview and dedicated-worker WebCodecs/OffscreenCanvas export support only
when **Edit video** opens, and the export half of that check encodes one 1280×720 H.264 frame
rather than looking for the classes. The classes existing is not the codec working: an engine can
expose `VideoEncoder` and still refuse every configuration, or accept one and produce nothing, and
asking it to encode is the only question whose answer matches what the render will do. It asks for
the profile MediaBunny asks for, so the control and the worker behind it cannot disagree, and the
answer is reused for the life of the page. Choosing an export placement at save time re-uses
exactly that check (`exportPlacementRenderSupported`), so a browser that cannot run the editor
cannot re-frame a video either; the save dialog says so and keeps the video's original shape. Until
the probe answers, the placement chooser is inert rather than declared unavailable, and the
editor's Save stays disabled without showing the unavailable notice. It does not use the limited-availability 2D canvas `filter` property.
Preview and export share a WebGL shader for flips, curated filters, and manual lighting controls;
MediaBunny performs trim, baked 90° rotation, crop, H.264 encode, and AAC audio preservation in the
worker; the edit's audio level is applied there as a per-sample multiply, and the preview applies
the same number to the stage element's volume, so an engine that plays the element at all hears
what the file will carry. There is no synchronous main-thread processing fallback. Subtitles are rasterized on a 2D
canvas — an `OffscreenCanvas` in the worker, so the worker also needs 2D text (`fillText`,
`measureText`, `roundRect`) — in the interface's sans-serif stack, and composited by the same
shader. The same device therefore draws identical text in the preview and in the file; a different
device draws the same layout in whatever its font stack resolves to, because no face is bundled.

A source with audio must export AAC plus a newly extracted matching sidecar; a silent source stays
silent. Output dimensions are even, exact, and decoded locally before publication. The worker's
offset-aware stream accumulator rejects output beyond 300,000,000 bytes and releases its chunks on
cancel/error. Square, 4:5, other uploaded ratios, and incompatible Freeform outputs are valid local
sources, but only 16:9 and 9:16 within 1% are eligible for Character Swap/VTO.

Automated Chromium export or a working preview does not validate the codec path on another browser.
Manual checks must exercise real export and cancellation in current Safari, Firefox, and Chrome,
including touch, five-minute input, maximum-size memory, browser download, and external playback.

The `@cross-browser` upload-and-edit journey therefore stops at the export on other engines, and is
proof of the editor rather than of the codec path. What it does assert everywhere is that the offer
matches the capability: **Save edited video** is enabled only where the probe encoded a frame, and
where it did not the "Local editor unavailable" notice is showing instead. Verifying the export on
macOS WebKit says nothing about a Linux runner, and was how that journey came to be tagged.

## Known physical risks

- Safari/iOS can differ in `MediaRecorder` output, worker WebCodecs/OffscreenCanvas/WebGL behavior,
  Web Audio decode/encode, Blob download, backgrounding, lock/call interruption, and permission
  recovery.
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
  evidence that server/provider validation passed.

## Physical validation rule

Every claimed target must physically pass permission allow/deny/revoke; Local/Character/VTO capture;
uploaded-video pick, replace, local download, mutually exclusive Character Swap and batch VTO,
including capability-required local MOV/WebM preparation; the
local video editor's preview/render/cancel/replace choices; the 270/300-second warning and
finalization; local and ElevenLabs Voice;
download/playback; Campaign/Project/library navigation; visible current Campaign/Project identity;
durable-source refresh; exact Project-history Version preview/Download; background/foreground
recovery; memory checkpoints; and cleanup. Touch rows
also require native file pickers, portrait/landscape, safe areas, browser chrome, software
keyboard, 200% text, touch-control recovery, and camera switching when exposed. Desktop rows
require the five canonical viewports, pointer/keyboard recovery, 200% text, and device replacement.

Record content-free results in the release review notes. Emulation, a different device/browser, or
deterministic fakes cannot validate a physical target.
