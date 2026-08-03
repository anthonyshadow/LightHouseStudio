# Gated live provider smoke

Live checks are manual, opt-in, cost-bearing, and excluded from normal test/quality commands.
Current repository evidence is `0/11`; no provider/local row is qualified.

Use only authorized, least-privilege test credentials, non-sensitive disposable media, understood
account retention/quota, and an approved spend. Never run this procedure in CI, Storybook,
screenshots, ordinary tests, shared environments, or with a participant where the
[release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md) prohibits it.

## Preflight

1. Run deterministic release gates, including `pnpm quality` and `pnpm test:e2e`.
2. Record the generic Credential Custodian, Billing Authorizer, Evidence Recorder, and Support &
   Escalation Owner roles for this pass.
3. Review current account model availability, pricing, quota, content policy, and retention. Stop
   if they differ from the approved configuration.
4. Configure only the provider under test using repository-root `.env` and `.env.example`; restart
   the API.
5. Verify `GET /api/capabilities` reports the expected operation availability/input/reference/
   enhancement capabilities without a provider or batch model name. This is not a reachability,
   entitlement, policy, quota, or billing check.
6. Close competing camera apps and keep short samples short. Run a full five-minute pass only where
   this procedure requires it and the Billing Authorizer approves it.

Never print or capture `.env`, authorization headers, permanent/temporary credentials, raw
provider bodies, signed/polling URLs, personal media, or full network archives.

## Required configurations

| Requirement       | Exact configuration                                                           |
| ----------------- | ----------------------------------------------------------------------------- |
| Local             | No provider credentials                                                       |
| Decart Character  | SDK `0.1.17`, exact `lucy-latest`, 300-second session                         |
| Decart VTO        | SDK `0.1.17`, exact `lucy-vton-latest`, 300-second session                    |
| Decart batch Lucy | Queue HTTP, exact `lucy-latest`, fixed `720p`, 300-second input               |
| Decart batch VTO  | Queue HTTP, exact `lucy-vton-latest`, fixed `720p`, 300-second input          |
| Pruna Character   | `p-video-replace`, `720p`, one reference, MP4 driver, `save_audio=true`       |
| Pruna Character   | `p-video-replace`, `1080p`, one reference, MP4 driver, `save_audio=true`      |
| ElevenLabs        | Saved voices, `eleven_multilingual_sts_v2`, `ELEVENLABS_ENABLE_LOGGING=false` |
| OpenAI image      | Optimizer `gpt-5.6`/`medium`; image `gpt-image-2`/`high`                      |
| BFL image         | `flux-2-pro`, safety `2`, prompt upsampling off                               |
| Wiro image        | `seedream-v5-lite-uncensored`, 2k, watermark off, operator qualification      |

Reference image providers require three separate server startups; there is no fallback.

## Local no-key

With all provider credentials empty:

- confirm preparation, upload/direct save, Local capture/recording, local Voice, Download, and
  cleanup work;
- confirm capabilities are unavailable for optional providers; and
- confirm no external HTTP/WebSocket, provider SDK, provider token, or external media transfer.

## Decart Character and VTO

For each exact model:

1. Prepare valid prompt-only, image-only, and combined input. Invalid/empty input must block before
   camera/token work.
2. Start local media, then the model. Confirm the token is exact-model/exact-origin scoped and
   advertises a 300-second maximum.
3. Keep local preview until a live remote video track exists; audio-only/partial output is not
   recordable.
4. Apply one complete state atomically. Character must clear stale image influence after explicit
   clear/Apply; VTO image-only input must not invent a prompt.
5. Record 5–10 seconds and Stop. Confirm recorder/sidecar finalization precedes provider/local
   release and playback replaces live media on the same stage without reacquisition.
6. Stop AI. Confirm provider/client/listeners/cloned tracks/timers end while the valid local
   fallback or recorded take remains.
7. Exercise an authorized failure class and confirm only app-owned safe guidance appears; cancel
   remains cancellation and cleanup remains idempotent.

### Maximum-duration pass

After short checks pass, run once for each Decart model/account configuration:

1. Verify the app clock starts only after the healthy connection commits and displays the
   authoritative 5:00 maximum.
2. If a reconnect occurs naturally, confirm elapsed time does not reset or move backward.
3. At 30 seconds remaining, confirm the persistent accessible ending-soon warning does not displace
   Record/Stop.
4. Start a 10–15 second take before expiry. At expected completion, confirm recorder outputs settle
   before provider/local release, playback remains valid, and no error or automatic reconnect
   appears.
5. Repeat without recording; expected completion must preserve the recipe, return to local
   preview, and require a fresh explicit Start.

Early end, reset timer, missing warning, take loss, cleanup inversion, raw provider leakage, or
automatic reconnect fails the row.

## Decart batch video

Use disposable H.264 MP4, H.264 MOV, and VP8 WebM samples in both 16:9 and 9:16 where the physical
target supports them. Confirm current exact-model account limits against
[Decart video editing](https://docs.platform.decart.ai/models/video/video-editing),
[Lucy 2.5 API](https://docs.platform.decart.ai/api-reference/lucy-25), and
[Lucy VTON 3 API](https://docs.platform.decart.ai/api-reference/lucy-vton-latest) before spending. The
app-owned subset remains narrower than generic provider claims.

For each exact batch model:

1. With `DECART_API_KEY` absent, preview and local Download must work while batch capability is
   unavailable and no provider network/SDK is used.
2. Configure prompt-only, reference-only where applicable, and combined input. Exercise local-file
   and explicit public-HTTPS reference import for both Character and VTO, confirming only validated
   bytes—not the URL—reach the later submission. Confirm VTO rights, retention, input limitations,
   and submission disclosure are visible before action.
3. Submit once. Confirm the broker's multipart input maps to Decart's documented `data`, `prompt`,
   optional `reference_image`, `resolution=720p`, and `enhance_prompt` fields; uses synthetic
   filenames and the selected exact model (`lucy-latest` or `lucy-vton-latest`); and makes no
   provider request before authoritative server inspection.
4. Observe validating, submitting, queued, processing, retrieving, and ready as applicable. The UI
   may show elapsed time but never a fabricated percentage or provider ID/URL/body.
5. Download the completed result. Verify 1280×720 or 720×1280 orientation, duration within 500 ms,
   bounded size, restored source audio, and playback on the persistent stage.
6. Exercise a retryable status/content interruption. It must reuse the accepted job. Recipe fields
   remain editable with a warning that edits do not mutate the accepted job. A terminal failure
   removes the stale resume action; an explicit submission retry must use a new job ID and be
   described as another potentially billable submission.
7. Release terminal state and inspect the dedicated temporary root. Local cleanup must complete
   without claiming provider cancellation or provider-side deletion.
8. Record the broker's first accepted status and confirm `expiresAt` is exactly 60 minutes after
   acceptance. It must remain unchanged through polling, retrieval, and ready. Start one content
   stream just before the deadline and allow it to finish after the deadline; it must complete and
   then clean its local output. At and after the deadline, a new status/content attempt must expose
   safe expiry behavior, must not start another content stream, and must not create another provider
   submission. Also verify that successful delivery, explicit release, and broker shutdown can
   remove local state before the deadline.

Confirm that Character Swap and VTO remain available as a mutually exclusive selector before submission.
Switch in both directions with an empty visual setup and confirm the change is immediate. Repeat
with configured fields and confirm the topmost warning preserves everything on cancel, clears only
the previous visual fields on confirmation, and leaves configured Voice untouched. Verify there is
still only one active visual recipe and one submitted operation.

Each batch submission must remain explicit and operator-approved; there is no participant-total or
per-operation submission-count cap. Broker restart, the immutable accepted-at-plus-60-minute
deadline, ambiguous responses, unavailable
credentials, and background/foreground recovery must fail safely without automatic resubmission.
Deterministic lifecycle coverage does not qualify the live row: record the exact candidate's
deadline, pre-deadline delivery, blocked post-deadline admission, earlier cleanup paths, and
temporary-root result. Local expiry still does not prove provider cancellation or deletion.

Decart documents submit/poll/content retrieval but no qualified cancellation operation for this
flow. Do not label browser abort, local cleanup, or DELETE as provider cancellation.

## Pruna Character Swap

Run two separate startups with `EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER=pruna`,
`PRUNA_VIDEO_REPLACE_ENABLED=true`, the exact `PRUNA_VIDEO_REPLACE_MODEL=p-video-replace`, and
`PRUNA_VIDEO_REPLACE_RESOLUTION=720p` then `1080p`. Keep Decart independently configured only if
the VTO capability is under test. Review the current
[P-Video-Replace documentation](https://docs.pruna.ai/en/stable/docs_pruna_endpoints/performance_models/p-video-replace.html)
and [async/file/delivery API](https://docs.api.pruna.ai/apis/models-api-0/versions/a80cf098-b7a8-4f6e-b1e0-43b06bfa4038/operations/getPredictionStatus)
before spending.

For each resolution row:

1. Obtain Billing Authorizer approval for the published $0.03/s 720p or $0.06/s 1080p price and
   confirm account entitlement. Treat the documented 3.58 seconds generation per source second as
   a 720p benchmark only; do not claim a quantified 1080p processing time.
2. Confirm Character Swap requires one JPEG/PNG/WebP identity reference, prompt-only recipes stay
   selectable but cannot Start without it, Enhance Prompt is disabled with generic guidance, and
   no provider/model selector or provider name appears. Confirm VTO never contacts Pruna.
3. Submit H.264 MP4 as pass-through. Separately Start from H.264 MOV and VP8 WebM, confirm local
   H.264 MP4 preparation/revalidation occurs before upload, and confirm the immutable source and
   original audio remain unchanged. Keep the app-owned 300-second, 300 MB, 16:9/9:16, consent,
   duration-sync, and content-policy limits; Pruna publishes no exact source-size or platform
   duration maximum.
4. Confirm exactly two `/v1/files` uploads and exactly one `/v1/predictions` request with synthetic
   names, `Model: p-video-replace`, one `images` entry, configured `resolution`, `save_audio=true`,
   and raw prompt or the app-owned default when blank. There must be no webhook, initial retry,
   fallback, raw identifier/URL/body leakage, or second prediction during Voice retry.
5. Observe starting/processing/succeeded and a controlled failed/canceled mapping. Interrupt status
   and result retrieval, then resume the accepted job without another prediction. Confirm Voice
   runs only after the visual result and its retry does not resubmit visual processing. For a
   failed prediction, confirm the private provider `error` is reduced to an allowlisted safe class,
   never reaches the response/UI/log, and never triggers an automatic prediction retry.
6. Download only through the authenticated allowlisted Pruna delivery origin/path. Treat `720p`
   and `1080p` as the documented approximate 1 MP and 2 MP resolution classes, not promises of
   exact canonical dimensions. Record the inspected dimensions; if they differ from the canonical
   target, confirm a content-free server warning appears and the job continues without a browser
   DELETE. Also verify duration tolerance, source orientation, source-audio restoration, and browser
   metadata agreement with the server-approved result.
7. Confirm uploaded inputs expire after approximately 30 minutes and generated delivery content is
   typically available for 24 hours under the tested account. No documented cancellation/deletion
   endpoint is relied upon. A Pruna terminal failure must remain visible until explicit user
   discard/replacement or the 60-minute broker deadline; only that explicit user action may issue
   the local 204 DELETE. For a non-2xx Pruna response, confirm the API console records only its
   numeric upstream status. For an HTTP 200 status response whose prediction status is `failed`,
   confirm the console instead records the safe `generation-failed` category and the browser says
   no result was produced. Lightframe local cleanup must not be described as provider deletion.

## Reference image providers

Use a dedicated `LIGHTFRAME_DATA_DIR` and one startup-selected provider at a time.

Common checks:

1. Generate a harmless prompt-only preview. Confirm explicit action, optimize-before-image
   ordering when optimization is available, and one immutable stored result.
2. Upload JPEG/PNG/WebP and confirm local persistence without external provider contact. Verify
   direct prompt+upload save and **Save & Use Image Only** are provider-free.
3. Generate a combined preview from the upload; the server must resolve the owner-scoped source.
4. Regenerate blank (compose from original upload) and with written feedback (new immutable edit
   child); never mutate the source.
5. Force optimizer failure. Ordinary generation must use the validated raw prompt through the
   same selected provider, mark the result unoptimized, and keep it saveable. The explicit
   optimizer-retry branch must preserve that result if optimization fails again without making a
   new image request.
6. Force image-provider failure and stale form state. Preserve the previous valid preview and
   local/direct-save alternatives; do not switch providers.
7. Confirm a retry of an ambiguous identical browser request reuses its request UUID/idempotency
   result rather than creating a second billable submission.

Provider-specific checks:

- **OpenAI:** capabilities report `openai`/`gpt-image-2`; one result, configured quality, no SDK
  retry.
- **BFL:** report `bfl`/`flux-2-pro`; one initial task per action, trusted polling/download within
  one deadline, source-guided work without public upload, no signed URL/source base64 leakage.
- **Wiro:** select Wiro at startup with both required credentials. Confirm one Run per action, all
  orientations normalize to exact dimensions, source work uses no public upload, and
  `InputOutputDelete` succeeds after local persistence. Logs may contain only safe lifecycle
  fields.

Wiro cleanup failure fails the check.

## ElevenLabs

1. Record a short, non-sensitive take with a usable original sidecar.
2. Browse/search/page saved voices and preview one. Confirm unsaved voices/add-import controls are
   absent, every provider request carries the voice-intent header, and preview sends no take.
3. Select a saved voice. Selection alone must not discover models or convert.
4. Apply once. Confirm saved membership/model are revalidated and only the immutable original
   sidecar is uploaded; playback/download remain locked until remux completes.
5. Remove a disposable saved voice in provider controls; refresh and confirm it disappears. A
   stale direct request must fail before conversion.
6. Restore Original with no provider call and exercise one controlled failure. The original/last
   valid take must survive with sanitized guidance.
7. Confirm preview stays within 2 MiB and the five-minute `mp3_44100_128` result within the
   inclusive 8 MiB ceiling. Oversize/malformed/cancelled output must not replace the take.

Confirm the configured `ELEVENLABS_ENABLE_LOGGING` choice matches the reviewed account retention
setting. A zero-retention request may require an eligible provider account.

## Evidence and cleanup

Record only content-free outcomes. The former pilot evidence validator has been removed and is not
a current release gate.

After each pass, Stop AI/camera, release or discard test takes, close Studio, verify media/WebRTC
indicators are gone, remove credentials when no longer needed, and restart to confirm optional
integrations disable cleanly.

References remain immutable in `LIGHTFRAME_DATA_DIR`. Never remove a shared directory as routine
cleanup. Use a dedicated disposable directory when testing cleanup.

Missing credentials, entitlement, approved account settings, device access, quota, firewall/NAT,
or provider availability is `blocked`. Capture only the safe app-owned code and stop; never weaken
security, retention, model pins, intent, or no-fallback rules.
