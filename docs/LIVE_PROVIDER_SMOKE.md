# Gated live provider smoke

Live checks are manual, opt-in, cost-bearing, and excluded from normal test/quality commands.
Current repository evidence is `0/10`; no provider/local row is qualified.

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
5. Verify `GET /api/capabilities` reports the expected configured provider/model. This is not a
   reachability, entitlement, policy, quota, or billing check.
6. Close competing camera apps and keep short samples short. Run a full five-minute pass only where
   this procedure requires it and the Billing Authorizer approves it.

Never print or capture `.env`, authorization headers, permanent/temporary credentials, raw
provider bodies, signed/polling URLs, personal media, or full network archives.

## Required configurations

| Requirement        | Exact configuration                                                           |
| ------------------ | ----------------------------------------------------------------------------- |
| Local              | No provider credentials                                                       |
| Decart Character   | SDK `0.1.17`, exact `lucy-2.5`, 300-second session                            |
| Decart VTO         | SDK `0.1.17`, exact `lucy-vton-3`, 300-second session                         |
| Decart batch Lucy  | Queue HTTP, exact `lucy-2.5`, fixed `720p`, 300-second input                  |
| Decart batch VTO   | Queue HTTP, exact `lucy-vton-3`, fixed `720p`, 300-second input               |
| Decart batch chain | Lucy → VTO and VTO → Lucy with intermediate approval                          |
| ElevenLabs         | Saved voices, `eleven_multilingual_sts_v2`, `ELEVENLABS_ENABLE_LOGGING=false` |
| OpenAI image       | Optimizer `gpt-5.6`/`medium`; image `gpt-image-2`/`high`                      |
| BFL image          | `flux-2-pro`, safety `2`, prompt upsampling off                               |
| Wiro image         | `seedream-v5-lite-uncensored`, 2k, watermark off, operator qualification      |

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
[Lucy Edit](https://platform.decart.ai/models/lucy-edit),
[Lucy VTON](https://platform.decart.ai/models/lucy-vton), and the
[Decart video requirements](https://docs.platform.decart.ai/getting-started/models) before
spending. The app-owned subset remains narrower than generic provider claims.

For each exact batch model:

1. With `DECART_API_KEY` absent, preview and local Download must work while batch capability is
   unavailable and no provider network/SDK is used.
2. Configure prompt-only, reference-only where applicable, and combined input. Confirm VTO's beta,
   rights, retention, and submission disclosure is visible before action.
3. Submit once. Confirm multipart recipe/video/reference order, synthetic filenames, fixed `720p`,
   and no provider request before authoritative server inspection.
4. Observe validating, submitting, queued, processing, retrieving, and ready as applicable. The UI
   may show elapsed time but never a fabricated percentage or provider ID/URL/body.
5. Download the completed result. Verify 1280×720 or 720×1280 orientation, duration within 500 ms,
   bounded size, restored source audio, and playback on the persistent stage.
6. Exercise a retryable status/content interruption. It must reuse the accepted job. An explicit
   submission retry must use a new job ID and be described as another potentially billable
   submission.
7. Release terminal state and inspect the dedicated temporary root. Local cleanup must complete
   without claiming provider cancellation or provider-side deletion.

For the ordered-chain row, run Lucy → VTO and VTO → Lucy. After step one, verify the intermediate
Original/Result comparison and use **Finish here** once. In a separate pass, choose **Continue** and
confirm only that explicit action starts the second submission. Force a second-stage failure and
verify the first visual result, source audio, recipes, and local Voice/Download remain usable.

Do not exceed four participant batch submissions or two submissions for either model. A two-step
chain consumes two. Broker restart, 60-minute expiry, ambiguous responses, unavailable
credentials, and background/foreground recovery must fail safely without automatic resubmission.

Decart documents submit/poll/content retrieval but no qualified cancellation operation for this
flow. Do not label browser abort, local cleanup, or DELETE as provider cancellation.

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
- **Wiro:** start with `PILOT_ACCESS_MODE=operator-qualification` and no participant. Confirm
  participant mode disables generation, one Run per action, all orientations normalize to exact
  dimensions, source work uses no public upload, and `InputOutputDelete` succeeds after local
  persistence. Logs may contain only safe lifecycle fields.

Wiro cleanup failure or participant availability fails the row.

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

Participant conversion requires confirmed zero-retention eligibility. A non-eligible account may
be used only for separately authorized operator diagnosis after an informed retention decision.

## Evidence and cleanup

Write one strict content-free record per requirement as described in
[qualification evidence](PILOT_QUALIFICATION_EVIDENCE.md), then run:

```bash
pnpm pilot:qualification:check --commit "$(git rev-parse HEAD)" --verbose
```

After each pass, Stop AI/camera, release or discard test takes, close Studio, verify media/WebRTC
indicators are gone, remove credentials when no longer needed, and restart to confirm optional
integrations disable cleanly.

References remain immutable in `LIGHTFRAME_DATA_DIR`. Never remove a shared directory as routine
cleanup. Use a dedicated disposable directory and the
[pilot data retirement checklist](PILOT_DATA_RETIREMENT_CHECKLIST.md); run
`pnpm pilot:data-retirement:drill` before the first retained-data pass.

Missing credentials, entitlement, approved account settings, device access, quota, firewall/NAT,
or provider availability is `blocked`. Capture only the safe app-owned code and stop; never weaken
security, retention, model pins, intent, or no-fallback rules.
