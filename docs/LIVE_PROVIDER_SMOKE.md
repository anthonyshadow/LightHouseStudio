# Gated live provider smoke test

Live smoke testing is manual, opt-in, cost-aware, and excluded from default test and quality
commands. Character, VTO, ElevenLabs, OpenAI, BFL, and Wiro are all included in the intended pilot,
so each path needs its own qualified pass. Run a pass only with authorized test credentials, a
supported camera/microphone, an account whose quota and retention settings are understood, and
permission to incur provider usage.

The approved local-phase owners are the generic **Credential Custodian**, **Billing Authorizer**,
**Evidence Recorder**, **Pilot Product Owner**, and **Support & Escalation Owner** roles. One
operator may hold several roles, but every pass records the authorizing/witnessing roles.
Personal assignments must be revisited before leaving local-only operation.

The external-participant settings, limits, and content/refusal policy are frozen in the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md). Wiro's uncensored model
is technical/operator qualification only and cannot reach an external participant under this
contract.

## Provider assumptions verified for this build

- `@decartai/sdk` is pinned to `0.1.15`. Its registry recognizes `lucy-2.5` and the user-approved exact `lucy-vton-3` id. [Current Decart Virtual Try-On documentation](https://docs.platform.decart.ai/models/realtime/virtual-try-on) may instead show the moving `lucy-vton-latest` alias; this product intentionally does not follow that alias silently.
- Decart browser access uses a [backend-minted client token](https://docs.platform.decart.ai/getting-started/client-tokens), scoped to one model, the exact loopback origin, a five-minute issuance window, and a five-minute realtime-session limit.
- OpenAI uses the Responses API for prompt optimization and remains the default image provider with `gpt-image-2` at `high` quality. `REFERENCE_IMAGE_PROVIDER=bfl` instead selects the pinned US2 `https://api.us2.bfl.ai/v1/flux-2-pro` task API. `REFERENCE_IMAGE_PROVIDER=wiro` selects the pinned `https://api.wiro.ai/v1/Run/ByteDance/seedream-v5-lite-uncensored` task API with signature authentication. There is no image-provider fallback. An optimizer failure may continue with the validated raw prompt through that same selected provider and must be recorded as an unoptimized result. Character Builder upload by itself is local storage work and does not contact an image provider.
- ElevenLabs uses `/v2/voices` with `voice_type=saved`, `/v1/models`, and `/v1/speech-to-speech/:voice`. Preview and conversion revalidate voice membership through the saved filter. The project has no shared-library discovery or voice-add mutation. Provider plans can change voice eligibility and conversion access.
- `ELEVENLABS_ENABLE_LOGGING=false` requests [Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode), which ElevenLabs currently limits to eligible enterprise accounts. A non-eligible account may be used only for operator-only technical diagnosis after an informed retention decision; participant conversion remains unavailable.

Do not run live provider checks in CI, screenshots, stories, ordinary component tests, or shared environments. Never print or capture `.env`, request authorization headers, permanent keys, temporary credentials, raw provider bodies, personal media, or full network archives.

## Before starting

1. Run `npm run quality` and `npm run test:e2e` with deterministic fakes first.
2. Record the Credential Custodian, Billing Authorizer, Evidence Recorder, and Support &
   Escalation Owner for the pass. Confirm authorization and review current Decart, OpenAI, BFL,
   Wiro, and ElevenLabs pricing, quota, model availability, voice eligibility, content policy, and
   data-retention terms in the provider accounts. Stop if any value differs from the approved
   contract.
3. Use dedicated least-privilege development keys. Put them only in local `.env`:

   ```dotenv
   DECART_API_KEY=your-local-secret
   OPENAI_API_KEY=your-local-secret
   REFERENCE_IMAGE_PROVIDER=openai
   # For a separate BFL pass, select bfl and configure:
   # BFL_API_KEY=your-local-secret
   # BFL_REFERENCE_IMAGE_MODEL=flux-2-pro
   # BFL_SAFETY_TOLERANCE=2
   # BFL_DISABLE_PROMPT_UPSAMPLING=true
   # For a separate Wiro pass, select wiro and configure:
   # WIRO_API_KEY=your-local-project-key
   # WIRO_API_SECRET=your-local-project-secret
   # WIRO_REFERENCE_IMAGE_MODEL=seedream-v5-lite-uncensored
   # Restricted server key with voice-read and speech-to-speech access:
   ELEVENLABS_API_KEY=your-local-secret
   ELEVENLABS_STS_MODEL_ID=eleven_multilingual_sts_v2
   ELEVENLABS_ENABLE_LOGGING=false
   ```

4. Restart the API; verify `GET /api/capabilities` reports configured availability for each integration. This endpoint checks configuration presence, not live reachability, quota, or entitlement.
5. Use non-sensitive test visuals and speech. Close other camera apps. Keep each realtime
   connection and sample take as short as practical; never exceed the 300-second application and
   provider-session constraints.

## Decart Lucy 2.5

1. Select Character and enter one concise, harmless prompt. Do not attach an image on the first pass.
2. Start and grant media. Verify local media becomes ready before `POST /api/realtime-token` and that the returned credential is scoped to `lucy-2.5`, the exact loopback origin, and a 300-second maximum session.
3. Confirm transformed output is not displayed/recordable until a live remote video track exists.
4. Record 5–10 seconds, select **Stop recording**, and verify the clip finalizes before Decart and owned local media disconnect. Confirm recorded playback replaces live media on the same stage and no camera/provider session is reacquired.
5. Start a second short session with a non-sensitive reference portrait. Change the prompt, Apply, clear the image, Apply again, and confirm stale image influence clears without reconnecting.
6. Stop AI and confirm provider/WebRTC activity and generation timing stop while local preview remains.

Pass requires correct model scope, explicit action ordering, usable output gating, atomic updates, image clearing, finalization-before-release, local fallback, sanitized errors, and complete cleanup.

## Decart VTON 3

1. Select Try-On and use a non-sensitive garment prompt or garment image.
2. Verify the token/model scope is exactly `lucy-vton-3`, independently of the character session.
3. Test image-only input and confirm no invented prompt is added.
4. Wait for usable remote video, make one atomic live Apply, record a short take, and select **Stop recording**.
5. Confirm the take remains playable/downloadable, provider usage ends, recorded playback remains on the stage, and no local preview is reacquired.

## Decart maximum-duration qualification

Run this paid five-minute boundary pass only after the short Lucy/VTON checks above pass and the
Billing Authorizer approves the additional duration. Run once for each Decart model/account
configuration claimed for the pilot; use non-sensitive synthetic or disposable media and record
only the final 10–15 seconds.

1. Start the model and verify the stage timer appears only after the healthy connection commits.
   Record the displayed **5:00 maximum** without capturing the temporary credential or media.
2. Allow one SDK-managed reconnect if it occurs naturally; confirm elapsed/remaining time does not
   reset. Provider ticks may move the display forward but must not move it backward.
3. At 30 seconds remaining, verify the static **AI session ending soon** status is announced once
   and does not displace **Record** or **Stop recording**.
4. Start a 10–15 second take before the boundary and do not manually stop it. At expected
   completion, verify both recorder outputs finalize before provider/local track release, recorded
   playback remains usable, and no crash/error notice or automatic reconnect appears.
5. Repeat without recording. Verify expected completion returns to local preview, retains the
   current recipe, labels the session completed, and permits a later deliberate Start with a fresh
   full budget.
6. Record only content-free evidence: date/time, model, SDK/app commit, browser/device, account
   configuration identifier, warning observed, expected-end classification, ordering result, and
   owner initials. Do not record raw SDK reasons, provider bodies, URLs, credentials, or media.

Any early end, timer reset, missing warning, raw provider leakage, take loss, cleanup inversion, or
automatic reconnect after the maximum fails the pass and follows the escalation procedure.

## Selected-provider character references

Release any prior take first. Use non-sensitive, disposable character directions
and images. Watch only the app-owned `/api/reference-images` requests; do not
capture provider authorization or raw image payloads.

1. Open the header character selector, choose **Create new character**, enter a harmless direction, and select **Generate Preview**. Confirm the app performs optimization before generation and creates one immutable local result only after the explicit action.
2. In fresh drafts, upload a JPEG, PNG, or WebP source. Confirm `POST /api/reference-images/uploads` stores it locally and no external provider request occurs. Exercise direct prompt+image save and **Save & Use Image Only** in separate drafts because either successful Save closes and resets the builder; confirm neither path generates or edits an image.
3. Start another fresh uploaded draft with a character direction, then select **Generate Combined Preview**. Confirm the direction is optimized and the owner-scoped uploaded bytes are sent to the composition operation only after that action.
4. Regenerate once with blank instructions and confirm the uploaded source is composed again. Regenerate once with written instructions and confirm an owner-scoped edit creates a new immutable child rather than mutating the source.
5. Make the form stale and force one controlled provider failure. Confirm the previous preview stays visible but cannot be saved as a matching generated result until regeneration succeeds; prompt-only or direct-upload save remains available where valid.

Pass requires local-only upload, explicit billable actions, optimize-before-image
ordering, owner-scoped source resolution, immutable results, correct direct/image-only
save behavior, sanitized errors, and no fallback to the raw prompt after an
optimization failure.

Run this section in three separate server configurations: OpenAI, BFL, and Wiro. All three are
included in pilot qualification; Wiro remains operator-only. The app still selects exactly one at
startup and never falls back. For BFL,
confirm capabilities report `providerId: "bfl"` and `modelId: "flux-2-pro"`, one initial task is
created per explicit request, polling stays within the configured deadline, source-guided actions
succeed without a public upload, and browser responses/log captures contain neither signed URLs
nor source base64. For Wiro, confirm capabilities report `providerId: "wiro"` and
`modelId: "seedream-v5-lite-uncensored"`, one Run request is created per explicit action, all three
output orientations are normalized to the advertised exact dimensions, source-guided actions use
no public upload, and `InputOutputDelete` removes remote input/output files after local persistence.
Logs may contain only the task ID, lifecycle stage, status, and delivery origin—never the task
token, signature, nonce, prompt, or CDN path.

## ElevenLabs

1. Record a short local take with clearly audible non-sensitive speech.
2. In ElevenLabs account controls, record the IDs of one saved and one unsaved disposable voice without copying credentials into the test log.
3. Open the Studio voice library. Search/page saved results and play a preview. Confirm the saved ID can appear, the unsaved ID cannot appear, no add/import control exists, and no recording audio is uploaded.
4. Select a saved voice, including a saved community Professional Voice Clone when available. Confirm selection alone does not call model discovery or the conversion route.
5. Apply once. Confirm the server revalidates saved membership and only the audio sidecar is sent to `/api/elevenlabs/voice-changer/recording`; processing locks incomplete playback/download and the final remux preserves video.
6. Remove the disposable voice from the saved library in ElevenLabs, refresh Studio, and confirm it disappears. If a stale direct conversion request is exercised, confirm it returns the safe library-not-found response before conversion.
7. Restore Original and confirm no provider request. Run one controlled failure if the test account permits and confirm the original/last valid take survives with sanitized guidance.

Pass requires saved-only listing and revalidation, absent public/import surfaces, proxied previews, conversion-time model validation, explicit conversion, audio-only upload, immutable-original processing, safe replacement, and no leaked key/upstream URL/body.

## Evidence and cleanup

Record only:

- date, commit, browser/OS, anonymous device class;
- authorizing Credential Custodian/Billing Authorizer and witnessing Evidence Recorder/Support &
  Escalation Owner role labels;
- capability and model ids;
- action timestamps, safe HTTP status/code, output MIME type, and pass/fail notes;
- approximate connection and clip duration for cost review.

Then Stop AI, stop the camera, discard/download test takes as appropriate, close the tab, verify camera/mic indicators and WebRTC sessions are gone, remove keys from `.env` when no longer needed, and restart to confirm optional integrations disable cleanly. Restore any temporary ElevenLabs library membership only through provider account controls.

Uploaded and generated test references remain immutable under
`LIGHTFRAME_DATA_DIR`; the app has no asset-delete action. For a disposable
smoke, configure a dedicated data directory before starting and retire it only
under the [controlled-pilot data retirement checklist](PILOT_DATA_RETIREMENT_CHECKLIST.md). Never
remove a shared asset directory as routine test cleanup. Run
`npm run pilot:data-retirement:drill` before the first retained-data pass.

Wiro is unavailable with the default `PILOT_ACCESS_MODE=participant` even when credentials are
present. Its separate technical smoke requires `PILOT_ACCESS_MODE=operator-qualification`, no
participant present, and successful remote `InputOutputDelete` evidence. Do not use that mode to
broaden participant access.

Failures caused by missing credentials, device permission, account entitlement, incompatible voices/models, quota/billing, provider policy, firewall/NAT, or provider outage are concrete external limitations. Capture the safe error code and stop; do not weaken security boundaries or embed credentials to bypass them.
