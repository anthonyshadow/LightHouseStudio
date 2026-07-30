# Existing video and ordered processing

## Goal

Use a compatible browser-local video as the immutable take source, optionally apply Lucy 2.5,
VTO 3, or both in an explicit order, then use the existing Voice, review, Download, Release, and
Discard flow.

## Journey

1. From `/`, the creator chooses **Upload existing video**. Direct `/studio` visits keep the
   camera-first default. Studio lazy-loads before the browser file picker opens.
2. The creator may also choose **Upload video** from the idle Studio control bar. Neither path
   needs camera permission, provider credentials, a Decart SDK, or external traffic.
3. Studio accepts a file picker or drop, validates browser metadata and decode, and publishes a
   playable temporary source on the one persistent stage. The upload panel shows a locally
   extracted first-frame image when available, otherwise a stable placeholder, alongside the
   local-only filename, size, duration, resolution, orientation, codec, and audio availability.
4. The creator may replace or remove the file, then choose zero, one, or two ordered visual steps.
   **Swap Character** (Lucy 2.5) and **Virtual Try On** may each appear at most once. Every step owns
   its prompt, prompt-enhancement switch, and optional validated reference. Saved characters and
   outfits open in a keyboard-operable custom chooser with an optional local thumbnail, recipe
   name, and a two-line prompt summary. An attached reference renders a local preview with replace
   and remove actions.
5. Review shows the exact order and planned Decart submission count. Zero steps finishes locally.
   A visual submission requires compatible server inspection, exact model availability, provider
   disclosure, and explicit action.
6. Studio uploads one job, displays truthful app-owned stages and elapsed time, retrieves a
   size-bounded inspected 720p result, and restores the immutable source audio.
7. A two-step workflow stops at an intermediate Original/Result comparison. **Finish here** keeps
   the first result; **Continue** is the only action that creates the second billable submission.
8. The creator may apply Voice from Latest Take. Voice always uses immutable source audio and
   applies it to the latest visual layer. **Restore Original voice** removes only the voice layer.
9. Download uses the existing review handoff. Release or confirmed Discard revokes every owned
   object URL and asks the server to release terminal temporary job state.

## Validation and failure behavior

- Accepted input is H.264 MP4/MOV or VP8 WebM, more than zero and at most 300 seconds, within 1% of
  16:9 or 9:16. Lucy/local input is capped at 300,000,000 bytes; any VTO plan is capped at
  200,000,000 bytes.
- A playable visual-only source remains useful. Voice explains when no usable source-audio
  sidecar exists.
- HEVC, ProRes, aliases, and undocumented codecs are blocked with export guidance. Studio never
  silently transcodes or invents an input-resolution ceiling.
- A result must be 1280×720 or 720×1280, preserve orientation, stay under 300,000,000 bytes, and
  remain within 500 ms of source duration before it can become authoritative.
- Failure before the first visual result preserves the source and drafts. Failure during the
  second step preserves the first result. Voice failure preserves the last visual/source layer.
- Retrying status, content retrieval, inspection, or audio composition reuses the accepted job.
  Retrying a provider submission is a new explicit potentially billable action.
- If an accepted job's status or content request is interrupted, prompt, reference, enhancement,
  and saved-recipe fields remain editable. The UI states that **Resume accepted job** still checks
  the immutable accepted recipe and creates no submission; draft edits apply only after that job
  reaches a terminal failure and the creator explicitly starts a new submission.
- Same-origin browser status/content reads remain protected even when the browser omits `Origin`:
  the API verifies the exact loopback referrer or same-origin Fetch Metadata plus explicit video
  intent. Mixing `localhost` and `127.0.0.1` is rejected with actionable local-origin guidance.

## Temporary and cost boundaries

The workflow is tab/process-temporary. Refresh, crash, or API restart does not recover it. The
server stores generated paths and safe job state only while validating, submitting, polling, or
retrieving; it never persists prompts or original filenames. Cleanup is local and does not claim
provider cancellation or provider-side deletion.

The UI reports one or two submissions, not credits or currency. The controlled pilot allows four
batch submissions per participant, at most two for either exact model; a two-step chain consumes
two.

## Evidence boundary

Automated tests use deterministic local media and fake provider responses. They prove contract,
single-submission, ordering, checkpoint, failure preservation, and cleanup behavior, but not live
model entitlement/output, real mobile pickers, H.264 MOV interoperability, five-minute memory, or
physical downloads. Those remain gates in
[Manual QA](../MANUAL_QA.md) and [Live provider smoke](../LIVE_PROVIDER_SMOKE.md).
