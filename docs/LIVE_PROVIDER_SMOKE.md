# Gated live provider smoke test

Live smoke testing is manual, opt-in, cost-aware, and excluded from default test and quality commands. Run it only with authorized test credentials, a supported camera/microphone, an account whose quota and retention settings are understood, and permission to incur provider usage.

## Provider assumptions verified for this build

- `@decartai/sdk` is pinned to `0.1.15`. Its registry recognizes `lucy-2.5` and the user-approved exact `lucy-vton-3` id. Current Decart VTON examples may instead show the moving `lucy-vton-latest` alias; this product intentionally does not follow that alias silently.
- Decart browser access uses a backend-minted client token, scoped to one model, the exact loopback origin, a five-minute issuance window, and a five-minute realtime-session limit.
- ElevenLabs uses `/v2/voices`, `/v1/shared-voices`, `/v1/voices/add/:owner/:voice`, `/v1/models`, and `/v1/speech-to-speech/:voice`. Provider plans can change voice eligibility and conversion access.
- `ELEVENLABS_ENABLE_LOGGING=false` requests zero-retention conversion, which ElevenLabs currently limits to eligible enterprise accounts. Set it to `true` only after an informed retention decision when testing a non-eligible account.

Do not run live provider checks in CI, screenshots, stories, ordinary component tests, or shared environments. Never print or capture `.env`, request authorization headers, permanent keys, temporary credentials, raw provider bodies, personal media, or full network archives.

## Before starting

1. Run `npm run quality` and `npm run test:e2e` with deterministic fakes first.
2. Review current Decart and ElevenLabs pricing, quota, model availability, voice eligibility, content policy, and data-retention terms in the provider accounts.
3. Use dedicated least-privilege development keys. Put them only in local `.env`:

   ```dotenv
   DECART_API_KEY=your-local-secret
   ELEVENLABS_API_KEY=your-local-secret
   ELEVENLABS_STS_MODEL_ID=eleven_multilingual_sts_v2
   ELEVENLABS_ENABLE_LOGGING=false
   ```

4. Restart the API; verify `GET /api/capabilities` reports only the configured integrations.
5. Use non-sensitive test visuals and speech. Close other camera apps. Keep each realtime connection and sample take as short as practical; never exceed the five-minute session constraint.

## Decart Lucy 2.5

1. Select Character and enter one concise, harmless prompt. Do not attach an image on the first pass.
2. Start and grant media. Verify local media becomes ready before `POST /api/realtime-token` and that the returned credential is scoped to `lucy-2.5`, the exact loopback origin, and a 300-second maximum session.
3. Confirm transformed output is not displayed/recordable until a live remote video track exists.
4. Record 5–10 seconds, stop, and verify the clip finalizes before Decart disconnects and local preview resumes.
5. Start a second short session with a non-sensitive reference portrait. Change the prompt, Apply, clear the image, Apply again, and confirm stale image influence clears without reconnecting.
6. Stop AI and confirm provider/WebRTC activity and generation timing stop while local preview remains.

Pass requires correct model scope, explicit action ordering, usable output gating, atomic updates, image clearing, finalization-before-release, local fallback, sanitized errors, and complete cleanup.

## Decart VTON 3

1. Select Try-On and use a non-sensitive garment prompt or garment image.
2. Verify the token/model scope is exactly `lucy-vton-3`, independently of the character session.
3. Test image-only input and confirm no invented prompt is added.
4. Wait for usable remote video, make one atomic live Apply, record a short take, and stop.
5. Confirm the take remains playable/downloadable, provider usage ends, and local preview returns.

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

Failures caused by missing credentials, device permission, account entitlement, incompatible voices/models, quota/billing, provider policy, firewall/NAT, or provider outage are concrete external limitations. Capture the safe error code and stop; do not weaken security boundaries or embed credentials to bypass them.
