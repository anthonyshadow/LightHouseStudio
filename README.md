# Lightframe Studio

Lightframe Studio is a local-first browser camera studio for short webcam performances with
reusable characters. Its primary loop is:

**Camera or Upload → optional Lucy/VTO visual processing → optional Voice → Download**

Virtual Try-On and Workshop are secondary tools. The app is single-operator, binds to loopback,
and stores no accounts or cloud projects. It is not approved for LAN, tunnel, public, or
multi-user deployment.

## Status

The core workflow is implemented and automated tests cover local, Character, VTO, recording,
review, and voice paths. A controlled pilot is still blocked on the incomplete gates in the
[active plan](docs/project-audit-implementation-plan.md), including physical-device,
300-second recording, live-provider, data-retirement, and operational evidence.

The [controlled-pilot contract](docs/CONTROLLED_PILOT_RELEASE_CONTRACT.md) fixes the cohort,
limits, provider rules, evidence matrix, and owner roles. It describes the release target, not a
claim that qualification has passed.

## Product flow

1. Open `/` and select **Start with camera** or **Upload existing video** to move to `/studio`.
2. Camera provides the existing provider-free live flow. Upload validates a compatible
   device-local file and exposes a playable inline preview synchronized with the shared stage.
   Creators without a file can explicitly hand off to the main stage, then preview, record,
   finalize, and review there before the locally normalized take becomes the editable source.
3. For camera, optionally choose Character/VTO, start AI, and Record. Studio warns at 270 seconds,
   automatically stops at 300 seconds, then transcodes the settled recording on the device to an
   H.264/AAC MP4 before review or Download becomes available.
4. For upload, optionally choose exactly one active visual transformation: Lucy or VTO, and/or a
   saved ElevenLabs voice. VTO accepts exactly one saved/recent outfit, reference image, or prompt
   mode. Combined work always completes and normalizes the visual result before voice conversion.
5. Review playback on the same persistent stage. A completed upload can switch between the
   immutable Original and generated Result, download that result directly, or Start over while
   retaining the original upload.
6. Optionally apply a local effect or saved ElevenLabs voice.
7. Initiate Download, verify the browser saved the file, then Release. Or confirm Discard without
   downloading.

`/` is a minimal provider-free entry and lazily loads no Studio/media runtime. `/studio` owns the
one persistent stage; creative tools open as overlays without remounting it or creating another
media session. Upload Existing Video alone also renders a secondary inline source/result player
that borrows existing artifact URLs without owning tracks or sessions. Live preview, recording,
finalization, and initial take review always stay on the main stage. Those are the only registered
application routes; every other path returns to `/`.
Existing compatibility projects can still be downloaded or deleted from Recipe Shelf when Studio
detects them, but they have no URL entry.

Leaving Studio is blocked during recording/finalization. A temporary take, active Voice work, or
dirty Recipe Shelf edit requires confirmed discard; saved origin-scoped browser data is unaffected.

## Capabilities and provider boundaries

- Local camera, microphone, existing-video validation/preview, recording, on-device MP4
  transcoding, playback, local voice effects, and download require no provider credentials or
  external media traffic.
- Character Builder saves browser-local character metadata and immutable reference assets under
  `LIGHTFRAME_DATA_DIR`. Prompt-only save and upload do not generate images.
- `Lucy-latest` and pinned `lucy-vton-latest` start only after explicit user action. Decart receives live
  media and the applied prompt/reference snapshot.
- Batch Lucy/VTO uses server-mediated exact-model jobs with fixed 720p output, explicit
  submit/status/content stages, inspected size/duration/orientation, and no automatic retry of a
  billable submission. The UI shows request count, not invented credits or percentages.
- Reference generation uses one startup-selected provider: OpenAI `gpt-image-2`, BFL
  `flux-2-pro`, or Wiro `seedream-v5-lite-uncensored`. There is no automatic billable retry or
  provider fallback.
- ElevenLabs lists voices already saved in the configured account. Preview does not upload the
  take; Apply sends only the immutable original audio sidecar.
- Explicit VTO image-URL import uses the loopback broker, accepts public HTTPS JPEG/PNG/WebP only,
  pins public DNS across bounded redirects, validates decoded contents, and never retains the URL.
- Provider credentials remain server-side. API contracts and errors are app-owned and sanitized.

See [privacy and temporary data](docs/PRIVACY_AND_TEMPORARY_DATA.md) for the complete storage,
retention, and provider-contact contract.

## Requirements

- Node `>=24 <25` (`.nvmrc` pins the repository default)
- pnpm `>=11.18 <12`
- A current secure-context browser with `getUserMedia`, `MediaRecorder`, and WebCodecs H.264
  decode/encode support
- A camera and microphone for physical capture
- Optional, independent credentials for provider-backed features

Desktop Chromium is the baseline for the fullest codec and remux support. Consult
[browser support](docs/BROWSER_SUPPORT.md) before relying on Safari, iOS, or a particular codec.

## Run locally

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

Open <http://127.0.0.1:4173> for the entry or <http://127.0.0.1:4173/studio> for a direct Studio
load. Vite proxies `/api` to `127.0.0.1:4100`; keep `PORT=4100` for the normal development and
functional Playwright paths. Leave provider keys empty to exercise the fully local path.

For the production-mode loopback smoke:

```bash
pnpm build
NODE_ENV=production pnpm start
```

Open <http://127.0.0.1:4100>. Production startup fails when `apps/web/dist` is absent.

## Configuration

All credentials are read by `apps/api`; never place secrets in `VITE_*` variables. `.env.example`
is the maintained list of defaults and tunables.

| Variable                          | Purpose                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `DECART_API_KEY`                  | Realtime scoped credentials and server-mediated exact-model batch video jobs              |
| `OPENAI_API_KEY`                  | Character prompt optimization and OpenAI image work                                       |
| `REFERENCE_IMAGE_PROVIDER`        | Startup choice: `openai` (default), `bfl`, or `wiro`                                      |
| `BFL_API_KEY`                     | BFL image work when BFL is selected                                                       |
| `WIRO_API_KEY`, `WIRO_API_SECRET` | Wiro image work when Wiro is selected                                                     |
| `PILOT_ACCESS_MODE`               | `participant` by default; `operator-qualification` is required for the separate Wiro pass |
| `ELEVENLABS_API_KEY`              | Saved-voice listing, preview, and Voice Changer                                           |
| `ELEVENLABS_ENABLE_LOGGING`       | Defaults to `false`; participant conversion requires confirmed zero-retention eligibility |
| `LIGHTFRAME_DATA_DIR`             | Immutable local reference assets; defaults to `./.lightframe-data`                        |
| `PORT`                            | Loopback API port; defaults to `4100`                                                     |
| `NODE_ENV`                        | `development`, `test`, or `production`                                                    |

`GET /api/capabilities` reports configuration presence, not provider reachability, entitlement, or
quota. Missing optional configuration disables only the corresponding feature.

## Commands

| Command                                                                                  | Purpose                                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                                                                               | Build shared packages and run API/web watchers                         |
| `pnpm build`                                                                             | Build all workspaces                                                   |
| `pnpm quality`                                                                           | Type, Storybook, lint, format, dead-code, module, unit, and build gate |
| `pnpm test`                                                                              | Essential non-visual unit and API integration suite                    |
| `pnpm test:unit`                                                                         | Focused domain, contract, web, component, and controller tests         |
| `pnpm test:integration`                                                                  | Focused API/provider, Vite, and repository utility tests               |
| `pnpm test:coverage`                                                                     | Coverage gate                                                          |
| `pnpm test:e2e`                                                                          | Functional Playwright journeys                                         |
| `pnpm test:production`                                                                   | Built Fastify static-serving smoke; run build first                    |
| `pnpm test:visual`                                                                       | Explicit curated visual regression suite                               |
| `pnpm test:all`                                                                          | All automated test categories, including visual regression             |
| `pnpm audit:all`                                                                         | Complete dependency audit                                              |
| `pnpm audit:prod`                                                                        | Production dependency audit                                            |
| `pnpm storybook`                                                                         | Local component catalog on port 6006                                   |
| `pnpm pilot:qualification:check --commit <full-sha> --verbose`                           | Validate content-free pilot evidence                                   |
| `pnpm pilot:data-retirement:drill`                                                       | Verify participant-data retirement                                     |
| `pnpm recording:memory:estimate --duration-seconds 300 --main-mib-per-minute <measured>` | Estimate recording memory from measured output                         |

Install Playwright browsers once with `pnpm exec playwright install`. Default tests use synthetic
media and deny unexpected external HTTP and WebSockets; they never make paid/live provider calls.
Curated visual regression and broad screenshot capture are not part of the default test or
ordinary push/pull-request CI workflows. See the [testing strategy](docs/TESTING.md) for layer
ownership, focused commands, CI behavior, and safe baseline updates.

Normal implementation gate:

```bash
pnpm quality
```

Exact-candidate release gate:

```bash
pnpm quality
pnpm test:coverage
pnpm test:e2e
pnpm test:production
pnpm test:visual
pnpm audit:prod
pnpm audit:all
pnpm pilot:data-retirement:drill
```

Review the visual baseline inventory for every changed Darwin/Linux image. The exact-candidate
commands are canonicalized in the [active plan](docs/project-audit-implementation-plan.md).

Physical devices and live providers remain separately gated by [manual QA](docs/MANUAL_QA.md) and
[live provider smoke](docs/LIVE_PROVIDER_SMOKE.md).

`@emnapi/runtime` is an intentional direct development dependency for optional WASM fallback
chains used by the pinned image/build tooling. Knip cannot observe that conditional loading, so
the dependency is explicitly ignored there. Remove it only after clean-install build, Storybook,
and test evidence on the maintained Darwin and Linux environments, including native and WASM
fallback paths.

## Architecture

```text
apps/web presentation
        │
        ├── orchestration ── browser media / recording / processing adapters
        └── same-origin API client
                         │
packages/domain     packages/contracts
pure policy         runtime HTTP schemas
                         │
                  apps/api Fastify broker
                         │
       Decart / OpenAI / BFL / Wiro / ElevenLabs
```

The creator of a stream, recorder, timer, listener, object URL, audio context, transcoder, or
provider client owns idempotent cleanup. Recording borrows source tracks and never stops them.
Finalization settles the video and optional sidecar, transcodes the main recording on-device to
H.264/AAC MP4, and publishes that downloadable artifact before live resources release. Raw
recorder output never receives a download URL.

The backend has process-local temporary video jobs but no account database, durable job database or
queue, or session history. Its only durable runtime data is the owner-scoped immutable
reference-asset store. Read [architecture and ownership](docs/ARCHITECTURE.md) for the full
dependency, lifecycle, persistence, and HTTP boundaries.

## Documentation

Start with the [documentation map](docs/README.md). Key references:

- [Implemented journeys](docs/userStories/README.md)
- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Privacy and temporary data](docs/PRIVACY_AND_TEMPORARY_DATA.md)
- [Controlled-pilot release contract](docs/CONTROLLED_PILOT_RELEASE_CONTRACT.md)
- [Active implementation plan](docs/project-audit-implementation-plan.md)
- [Browser support](docs/BROWSER_SUPPORT.md)
- [Manual QA](docs/MANUAL_QA.md)
- [Testing strategy](docs/TESTING.md)
- [Repository working guide](AGENTS.md)

Before changing behavior, read the working guide, trace the owning presentation, orchestration,
domain/contract, provider boundary, and tests, then update the affected canonical document and
user story.
