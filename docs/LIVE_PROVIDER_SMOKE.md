# Gated live provider smoke test

Live smoke testing is manual, opt-in, cost-aware, and excluded from default test and quality commands. Run it only with authorized test credentials, a supported camera/microphone, an account whose quota and retention settings are understood, and permission to incur provider usage.

## Provider assumptions verified for this build

- `@decartai/sdk` is pinned to `0.1.15`. Its registry recognizes `lucy-2.5` and the user-approved exact `lucy-vton-3` id. [Current Decart VTON examples](https://docs.platform.decart.ai/examples/use-cases) may instead show the moving `lucy-vton-latest` alias; this product intentionally does not follow that alias silently.
- Decart browser access uses a [backend-minted client token](https://docs.platform.decart.ai/api-reference/create-client-token), scoped to one model, the exact loopback origin, a five-minute issuance window, and a five-minute realtime-session limit.
- OpenAI uses the Responses API for prompt optimization and remains the default image provider with `gpt-image-2` at `high` quality. `REFERENCE_IMAGE_PROVIDER=bfl` instead selects the pinned US2 `https://api.us2.bfl.ai/v1/flux-2-pro` task API. `REFERENCE_IMAGE_PROVIDER=wiro` selects the pinned `https://api.wiro.ai/v1/Run/ByteDance/seedream-v5-lite-uncensored` task API with signature authentication. There is no provider fallback. Character Builder upload by itself is local storage work and does not contact an image provider.
- ElevenLabs uses `/v2/voices`, `/v1/shared-voices`, `/v1/voices/add/:owner/:voice`, `/v1/models`, and `/v1/speech-to-speech/:voice`. Provider plans can change voice eligibility and conversion access.
- `ELEVENLABS_ENABLE_LOGGING=false` requests [Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode), which ElevenLabs currently limits to eligible enterprise accounts. Set it to `true` only after an informed retention decision when testing a non-eligible account.

Do not run live provider checks in CI, screenshots, stories, ordinary component tests, or shared environments. Never print or capture `.env`, request authorization headers, permanent keys, temporary credentials, raw provider bodies, personal media, or full network archives.

## Before starting

1. Run `npm run quality` and `npm run test:e2e` with deterministic fakes first.
2. Review current Decart, OpenAI, BFL, Wiro, and ElevenLabs pricing, quota, model availability, voice eligibility, content policy, and data-retention terms in the provider accounts.
3. Use dedicated least-privilege development keys. Put them only in local `.env`:

   ```dotenv
   DECART_API_KEY=your-local-secret
   OPENAI_API_KEY=your-local-secret
   REFERENCE_IMAGE_PROVIDER=openai
   # For a separate BFL pass, select bfl and configure:
   # BFL_API_KEY=your-local-secret
   # BFL_REFERENCE_IMAGE_MODEL=flux-2-pro
   # For a separate Wiro pass, select wiro and configure:
   # WIRO_API_KEY=your-local-project-key
   # WIRO_API_SECRET=your-local-project-secret
   # WIRO_REFERENCE_IMAGE_MODEL=seedream-v5-lite-uncensored
   ELEVENLABS_API_KEY=your-local-secret
   ELEVENLABS_STS_MODEL_ID=eleven_multilingual_sts_v2
   ELEVENLABS_ENABLE_LOGGING=false
   ```

4. Restart the API; verify `GET /api/capabilities` reports configured availability for each integration. This endpoint checks configuration presence, not live reachability, quota, or entitlement.
5. Use non-sensitive test visuals and speech. Close other camera apps. Keep each realtime connection and sample take as short as practical; never exceed the five-minute session constraint.

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

Run this section once with the default OpenAI image provider and once for each task provider that is release-enabled. For BFL, confirm capabilities report `providerId: "bfl"` and `modelId: "flux-2-pro"`, one initial task is created per explicit request, polling stays within the configured deadline, source-guided actions succeed without a public upload, and browser responses/log captures contain neither signed URLs nor source base64. For Wiro, confirm capabilities report `providerId: "wiro"` and `modelId: "seedream-v5-lite-uncensored"`, one Run request is created per explicit action, all three output orientations are normalized to the advertised exact dimensions, source-guided actions use no public upload, and `InputOutputDelete` removes remote input/output files after local persistence. Logs may contain only the task ID, lifecycle stage, status, and delivery origin—never the task token, signature, nonce, prompt, or CDN path.

## ElevenLabs

1. Record a short local take with clearly audible non-sensitive speech.
2. Open the voice library. Search/page workspace and public results and play a preview. Confirm no recording audio is uploaded.
3. If workspace mutation is authorized, explicitly import one eligible test voice and record its resulting workspace id in the private test log. Otherwise skip import.
4. Select a compatible workspace voice. Confirm selection alone does not call the conversion route.
5. Apply once. Confirm only the audio sidecar is sent to `/api/elevenlabs/voice-changer/recording`, processing locks incomplete playback/download, and the final remux preserves video.
6. Restore Original and confirm no provider request. Run one controlled failure if the test account permits and confirm the original/last valid take survives with sanitized guidance.

Pass requires proxied previews, eligibility/model filtering, explicit import, explicit conversion, audio-only upload, immutable-original processing, safe replacement, and no leaked key/upstream URL/body.

## Evidence and cleanup

Record only:

- date, commit, browser/OS, anonymous device class;
- capability and model ids;
- action timestamps, safe HTTP status/code, output MIME type, and pass/fail notes;
- approximate connection and clip duration for cost review.

Then Stop AI, stop the camera, discard/download test takes as appropriate, close the tab, verify camera/mic indicators and WebRTC sessions are gone, remove keys from `.env` when no longer needed, restart to confirm optional integrations disable cleanly, and delete any imported test voice from ElevenLabs using provider account controls if required.

Uploaded and generated test references remain immutable under
`LIGHTFRAME_DATA_DIR`; the app has no asset-delete action. For a disposable
smoke, configure a dedicated data directory before starting and retire it only
under the local operator’s explicit storage policy. Never remove a shared asset
directory as routine test cleanup.

Failures caused by missing credentials, device permission, account entitlement, incompatible voices/models, quota/billing, provider policy, firewall/NAT, or provider outage are concrete external limitations. Capture the safe error code and stop; do not weaken security boundaries or embed credentials to bypass them.
