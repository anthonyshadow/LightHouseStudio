# Video fixtures

Each `.base64` file is one video, base64-encoded, with no header. Committing the text rather than
the bytes keeps the media reviewable in a diff and readable from both Playwright specs and Vitest
suites. Strip all whitespace before decoding — line wrapping is a property of the file, not of the
video, and it is not the same in every file here. The loaders in
[`../support/existingVideoHarness.ts`](../support/existingVideoHarness.ts) do that, and
`apps/web/src/features/existing-video/videoValidation.test.ts` and
`videoIntakeConversion.test.ts` do the same read from a unit test.

| File                                 | Container          | Tracks                              | Shape     | Bytes |
| ------------------------------------ | ------------------ | ----------------------------------- | --------- | ----- |
| `decodable-h264-video.base64`        | MP4 (`isom`)       | H.264 Constrained Baseline          | 1280x720  | 4,306 |
| `deterministic-recording-mp4.base64` | MP4 (`isom`)       | H.264 Constrained Baseline + AAC LC | 320x180   | 3,264 |
| `portrait-h264-video.base64`         | MP4 (`isom`)       | H.264 High                          | 1080x1920 | 2,318 |
| `phone-hevc-video.base64`            | QuickTime (`qt  `) | HEVC Main (`hvc1`)                  | 1080x1920 | 2,253 |

The first two predate this note and their generating commands were never recorded; do not infer one
from the rows above. The last two were produced by the commands below.

## Regenerating `portrait-h264-video.base64` and `phone-hevc-video.base64`

Both are one second of a single flat colour at 6 fps — six frames, one keyframe, no B-frames, no
audio track, `moov` ahead of `mdat`. Every decoded pixel of every frame is exactly `rgb(51, 94, 109)`,
which is dark enough that a test looking for burned-in white caption text can assert on brightness
without knowing anything about glyph shapes.

```sh
ffmpeg -f lavfi -i "color=c=0x345F6E:s=1080x1920:r=6:d=1" \
  -an -c:v libx264 -pix_fmt yuv420p -g 6 -bf 0 -movflags +faststart \
  portrait-h264-video.mp4

ffmpeg -f lavfi -i "color=c=0x345F6E:s=1080x1920:r=6:d=1" \
  -an -c:v libx265 -tag:v hvc1 -pix_fmt yuv420p \
  -x265-params "keyint=6:bframes=0:info=0:log-level=none" \
  -movflags +faststart -f mov phone-hevc-video.mov

# The committed form, for either file:
base64 < portrait-h264-video.mp4 | tr -d '\n' | fold -w 100 > portrait-h264-video.base64
printf '\n' >> portrait-h264-video.base64
```

`0x345F6E` is the requested colour; `rgb(51, 94, 109)` is what survives the RGB-to-YUV round trip,
so assert against the decoded value, not the requested one.

Two choices worth keeping if these are regenerated. The H.264 clip is High profile rather than the
Constrained Baseline of its older sibling because CAVLC costs roughly 6.8 KB of macroblock
signalling for a 1080x1920 keyframe however high the quantizer goes, against 1 KB with CABAC — and
High is what a phone actually records. The HEVC clip uses `libx265` rather than
`hevc_videotoolbox` so it can be regenerated on a machine without Apple's encoder.

## What the HEVC fixture does not stand in for

It is an `ffmpeg` file wearing an `hvc1` tag, not footage off a phone. It carries no
display-rotation matrix, no camera metadata, no HDR variant and no Apple `hvcC`. It is therefore
evidence about the codec branch — that HEVC bytes reach the intake's refusal, and that a browser
able to decode them reaches the conversion — and it is not evidence about phone intake. Physical
devices sit outside the automated boundary on purpose; see `docs/BROWSER_SUPPORT.md`.
