# Live provider smoke

Live checks are manual, opt-in, cost-bearing, and excluded from normal test/quality commands.

Use only authorized, least-privilege test credentials, non-sensitive disposable media, understood
account retention/quota, and an approved spend. Never run this procedure in CI, Storybook,
screenshots, ordinary tests, or shared environments.

## Preflight

1. Run deterministic release gates, including `bun run quality` and `bun run test:e2e`.
2. Confirm the person running the check is authorized to use the credentials and approve spend.
3. Review current account model availability, pricing, quota, content policy, and retention. Stop
   if they differ from the approved configuration.
4. Configure only the provider under test in the active environment profile file
   (`.env.development` or `.env.production`, per the README's environment model); restart the API.
5. Verify `GET /api/capabilities` reports the expected operation availability/input/reference/
   enhancement capabilities without a provider or batch model name. This is not a reachability,
   entitlement, policy, quota, or billing check.
6. Close competing camera apps and keep short samples short. Run a full five-minute pass only where
   this procedure requires it and the Billing Authorizer approves it.

Never print or capture `.env`, authorization headers, permanent/temporary credentials, raw
provider bodies, signed/polling URLs, personal media, or full network archives.

## Required configurations

| Requirement       | Exact configuration                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Local             | No provider credentials                                                                                |
| Decart Character  | SDK `0.1.17`, exact `lucy-latest`, 300-second session                                                  |
| Decart VTO        | SDK `0.1.17`, exact `lucy-vton-latest`, 300-second session                                             |
| Decart batch Lucy | Queue HTTP, exact `lucy-latest`, fixed `720p`, 300-second input                                        |
| Decart batch VTO  | Queue HTTP, exact `lucy-vton-latest`, fixed `720p`, 300-second input                                   |
| Pruna Character   | `p-video-replace`, `720p`, one reference, MP4 driver, `save_audio=true`                                |
| Pruna Character   | `p-video-replace`, `1080p`, one reference, MP4 driver, `save_audio=true`                               |
| Pruna Wardrobe    | `p-image-try-on`, one person, one garment, input size preserved, JPEG quality 95                       |
| ElevenLabs        | Saved/Browse voices, disposable community copy, `eleven_multilingual_sts_v2`, reviewed logging setting |
| OpenAI image      | Optimizer `gpt-5.6`/`medium`; image `gpt-image-2`/`high`                                               |
| BFL image         | `flux-2-pro`, safety `2`, prompt upsampling off                                                        |
| Wiro image        | `seedream-v5-lite-uncensored`, 2k, watermark off                                                       |

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
   optional `reference_image.0`, `resolution=720p`, and `enhance_prompt` fields; uses synthetic
   filenames and the selected exact model (`lucy-latest` or `lucy-vton-latest`); and makes no
   provider request before authoritative server inspection.
4. Observe validating, submitting, queued, processing, retrieving, and ready as applicable. The UI
   may show elapsed time but never a fabricated percentage or provider ID/URL/body.
5. Download the completed result. Verify 1280×720 or 720×1280 orientation, duration within 500 ms,
   bounded size, restored source audio, and playback on the Studio stage.
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

Each batch submission must remain explicit and operator-approved; the runtime imposes no separate
program-level submission-count cap. Broker restart, the immutable accepted-at-plus-60-minute
deadline, ambiguous responses, unavailable
credentials, and background/foreground recovery must fail safely without automatic resubmission.
Deterministic lifecycle coverage does not qualify the live row: record the exact candidate's
deadline, pre-deadline delivery, blocked post-deadline admission, earlier cleanup paths, and
temporary-root result. Local expiry still does not prove provider cancellation or deletion.

Decart documents submit/poll/content retrieval but no qualified cancellation operation for this
flow. Do not label browser abort, local cleanup, or DELETE as provider cancellation.

## Project processing UI and authority

This optional pass is separate from the standalone batch rows and must not run during ordinary QA.
Obtain explicit approval for every possible paid visual operation and use a disposable
source-bearing Project. Project Character Swap/VTO now use the visible Project command; provider
Voice and live Project starts remain gated.

1. Configure and save one exact visual treatment, then use the Project **Start** action once.
   Confirm the visible phase begins at submitting/accepted and the exact Project revision/job link
   exists before the first provider request. No raw provider identity, URL, body, prompt,
   credential, or internal path may appear in browser/public evidence.
2. After a durable provider identity is recorded, close the editor, refresh or restart the broker,
   reopen the Project, and observe the same operation. Status/retrieval may continue, but provider
   submission count must remain one and the original fixed deadline must not move.
3. Do not deliberately create an unknown-acceptance condition unless its possible duplicate cost
   is separately approved. If one occurs naturally before a provider identity is durable, confirm
   `needs-attention`/`submission_ambiguous`, no automatic submission, and an explicit new operation
   plus duplicate-cost acknowledgement before retry.
4. For a normal current success, verify the inspected result is durable Project working media on a
   `job-result` revision before temporary output cleanup, and that no Saved Video/Version or
   producer output relation was created. For a separately approved stale-result pass, checkpoint a
   newer Project revision while the admitted operation runs; its valid result must remain playable
   as historical `job-output` media without changing current working/presented media.
5. Confirm current adapters expose no Cancel control, Project-switch copy says accepted work may
   continue/reconnect, and archive is blocked while persisted policy requires it. Voice must remain
   unavailable because the current synchronous adapter has no durable reconnect identity.

Record content-free operation counts and safe phases only. Never capture the private provider job
identity. This pass does not authorize automatic retry/fallback, a background worker, or a Saved
Video output.

## Pruna Character Swap

Start with `EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER=pruna` to make Pruna the initial UI choice,
`PRUNA_VIDEO_REPLACE_ENABLED=true`, the exact `PRUNA_VIDEO_REPLACE_MODEL=p-video-replace`, and
the required server credential. Keep Decart independently configured only if the VTO capability is
under test. In the editor, run one explicitly approved `720p` submission and one separately
approved `1080p` submission. Review the current
[P-Video-Replace documentation](https://docs.pruna.ai/en/stable/docs_pruna_endpoints/performance_models/p-video-replace.html)
and [async/file/delivery API](https://docs.api.pruna.ai/apis/models-api-0/versions/a80cf098-b7a8-4f6e-b1e0-43b06bfa4038/operations/getPredictionStatus)
before spending.

For each resolution row:

1. Obtain Billing Authorizer approval for the published $0.03/s 720p or $0.06/s 1080p price and
   confirm account entitlement. Treat the documented 3.58 seconds generation per source second as
   a 720p benchmark only; do not claim a quantified 1080p processing time.
2. Confirm Character Swap requires one JPEG/PNG/WebP identity reference, prompt-only characters are
   absent, and neither Prompt nor Enhance Prompt is rendered. Confirm the provider-neutral notice
   says the selected identity and source performance/scene are used automatically, with no
   model selector. When Decart is also configured, confirm the editor offers a Character Swap
   method toggle naming each option by its capability rather than its provider — the Pruna binding
   reads `Reference image · up to 1080p` — and leaves that option selected for this procedure. Confirm the editor offers `720p` and
   `1080p`, defaults a new Character Swap setup to `720p`, and locks the choice after submission.
   Confirm VTO never contacts Pruna.
3. Submit H.264 MP4 as pass-through. Separately Start from H.264 MOV and VP8 WebM, confirm local
   H.264 MP4 preparation/revalidation occurs before upload, and confirm the immutable source and
   original audio remain unchanged. Keep the app-owned 300-second, 300 MB, 16:9/9:16, consent,
   duration-sync, and content-policy limits; Pruna publishes no exact source-size or platform
   duration maximum.
4. Confirm exactly two `/v1/files` uploads and exactly one `/v1/predictions` request with synthetic
   names, `Model: p-video-replace`, one `images` entry, the editor-selected `resolution`, `seed=0`,
   `turbo=false`, `target_fps=original`, `save_audio=true`, `ignore_audio=false`,
   `disable_safety_checker=true`. Verify the browser recipe contains an empty prompt and
   `instruction_prompt` is always the app-owned Pruna default that requires
   the output character to match reference image 1's facial identity, body, hair, wardrobe,
   clothing, footwear, and worn accessories. Confirm source-person clothing is replaced rather than
   copied onto the saved character. Confirm source expression/lip sync/gaze/pose/hand placement/
   gestures/movement/timing/blocking transfers, every non-worn item the source person holds or
   interacts with retains its appearance, visibility, position, motion, contact, occlusion, and
   timing, and source framing, lighting, background, scene structure, other objects, and audio stay
   unchanged. There must be no webhook, initial retry,
   fallback, raw identifier/URL/body leakage, or second prediction during Voice retry.
   Separately submit a directly crafted non-empty recipe prompt and confirm the broker rejects it
   before either upload or prediction creation.
5. Observe starting/processing/succeeded and a controlled failed/canceled mapping. Interrupt status
   and result retrieval, then resume the accepted job without another prediction. Confirm Voice
   runs only after the visual result and its retry does not resubmit visual processing. For a
   failed prediction, confirm the private provider `error` is reduced to an allowlisted safe class,
   never reaches the response/UI/log, and never triggers an automatic prediction retry.
6. Download only through the authenticated allowlisted Pruna delivery origin/path. Treat `720p`
   and `1080p` as the documented approximate 1 MP and 2 MP resolution classes, not promises of
   exact canonical dimensions. Record the inspected dimensions; if they differ from the canonical
   target, confirm a content-free informational server record appears and the job continues without
   a browser DELETE. Select **Edit result**, submit another authorized edit, and confirm the browser
   prepares a canonical contain-fit temporary copy without changing the retained result. Also verify
   duration tolerance, source orientation, source-audio restoration, and browser metadata agreement
   with the server-approved result.
7. Confirm uploaded inputs expire after approximately 30 minutes and generated delivery content is
   typically available for 24 hours under the tested account. No documented cancellation/deletion
   endpoint is relied upon. A Pruna terminal failure must remain visible until explicit user
   discard/replacement or the 60-minute broker deadline; only that explicit user action may issue
   the local 204 DELETE. For a non-2xx Pruna response, confirm the API console records only its
   numeric upstream status. For an HTTP 200 status response whose prediction status is `failed`,
   confirm the console instead records the safe `generation-failed` category and the browser says
   no result was produced. Lightframe local cleanup must not be described as provider deletion.

## Pruna Wardrobe Add Outfit

This is a separate credentialed and billable pass. Set `PRUNA_IMAGE_TRY_ON_ENABLED=true`, the
shared server-only `PRUNA_API_KEY`, and exact `PRUNA_IMAGE_TRY_ON_MODEL=p-image-try-on`; it does not
select Pruna Character Swap. Review the current
[try-on schema](https://docs.api.pruna.ai/apis/models-api-0/versions/d086a242-3813-4148-a087-e724d4b333f8/schemas/p-image-try-on)
and [asynchronous workflow](https://docs.api.pruna.ai/guides/quickstart) before spending.

1. Obtain separate Billing Authorizer approval and confirm model entitlement, account retention,
   content policy, and delivery behavior. Use a disposable consenting adult character/person image
   and one garment image. Record this row as blocked until this live pass is performed.
2. Confirm capabilities report only `wardrobe.addOutfitAvailable: true`; no provider/model name is
   rendered. Disable try-on and confirm saved Wardrobe browsing/use and Change Features remain
   available. A missing shared key or non-exact model literal must fail enabled configuration.
3. Select an exact original or saved variant as the person source, attach/import one garment, and
   confirm no Pruna request occurs before explicit **Generate outfit**. Change any source/input
   during work and confirm the stale result cannot become saveable.
4. Confirm exactly two `/v1/files` uploads and one `/v1/predictions` submission with
   `Model: p-image-try-on`, `person_image`, one `garment_images` entry, `turbo: false`,
   `output_format: "jpg"`, `output_quality: 95`, and `preserve_input_size: true`. There is no
   automatic initial retry, fallback, raw identifier/URL/body leakage, or model/provider UI copy.
5. Observe bounded `starting`/`processing` polling and authenticated download only from the
   allowlisted Pruna delivery path. Interrupt local polling and verify no provider cancellation or
   deletion claim. Exercise malformed status, unsafe delivery URL, oversized body, invalid MIME,
   invalid dimensions, and provider failure; all must preserve the prior valid preview and expose
   only app-owned safe errors.
6. Confirm the decoded result is stored locally before the browser receives it, with derived
   `outfit-try-on` lineage naming the exact person and garment asset IDs. Save requires a name and
   creates variant metadata without selecting it. Only later explicit **Use**, after successful
   hydration/application, persists selection and exact parent/variant usage.
7. Retry one ambiguous identical browser request ID and confirm it coalesces/replays without a
   second prediction. Reuse that ID with a different person or garment and confirm conflict before
   provider contact. Verify another loopback owner cannot reference either input.

Automated fake-transport coverage is not live validation. No live Pruna try-on call is part of
ordinary tests, screenshots, E2E, or this implementation change.

## Reference image providers

Use a dedicated `LIGHTFRAME_DATA_DIR` and one startup-selected provider at a time.

Common checks:

1. Generate a harmless prompt-only preview. Confirm explicit action, optimize-before-image
   ordering when optimization is available, and one immutable stored result.
2. Upload JPEG/PNG/WebP and confirm local persistence without external provider contact. Verify
   direct prompt+upload save and the naming dialog's **Uploaded image only** choice are
   provider-free.
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
2. Open Saved Voices, then Browse Voices. Search/filter/sort and page both views; confirm no page
   exceeds 20 voices, one/two characters do not start provider search, three characters wait about
   300 ms, and every provider request carries the voice-intent header.
3. Confirm catalog eligibility from the actual shared API metadata: Lightframe sends
   `include_custom_rates=false` and displays only entries with exact `rate === 1` and
   `free_users_allowed === true`. Missing fields fail closed. Do not infer eligibility from a UI
   badge or `available_for_tiers`. A plan/permission rejection must produce only the safe current-
   plan unavailable state.
4. Preview one Saved and one Browse voice. Confirm both requests proxy bounded sample audio, expose
   no provider URL, and send no take.
5. With explicit authorization, add one disposable eligible community voice. Confirm the broker
   re-fetches the exact public owner/voice metadata immediately before add, uses the fresh provider
   name with `bookmarked: true`, shows **Already saved**, and concurrent/repeated clicks create no
   duplicate.
6. Select the saved copy. Confirm Remove is unavailable while selected; choose Original or another
   voice, confirm the unrecoverable-withdrawal warning, then remove it. Confirm owned, cloned,
   workspace, default, legacy, non-bookmarked, and missing-owner voices cannot be removed and that
   the broker revalidates metadata immediately before DELETE.
7. Select a saved voice. Selection alone must not discover models or convert. Apply once and
   confirm saved membership/model are revalidated and only the immutable original sidecar is
   uploaded; playback/download remain locked until remux completes.
8. Restore Original with no provider call and exercise one controlled failure. The original/last
   valid take must survive with sanitized guidance.
9. Confirm preview stays within 2 MiB and the five-minute `mp3_44100_128` result within the
   inclusive 8 MiB ceiling. Oversize/malformed/cancelled output must not replace the take.

Confirm the configured `ELEVENLABS_ENABLE_LOGGING` choice matches the reviewed account retention
setting. A zero-retention request may require an eligible provider account.

## Results and cleanup

Record only content-free outcomes in the release review notes.

After each pass, Stop AI/camera, close or discard test takes, close Studio, verify media/WebRTC
indicators are gone, remove credentials when no longer needed, and restart to confirm optional
integrations disable cleanly.

References remain immutable in `LIGHTFRAME_DATA_DIR`. Never remove a shared directory as routine
cleanup. Use a dedicated disposable directory when testing cleanup.

Missing credentials, entitlement, approved account settings, device access, quota, firewall/NAT,
or provider availability is `blocked`. Capture only the safe app-owned code and stop; never weaken
security, retention, model pins, intent, or no-fallback rules.
