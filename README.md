# Lightframe Studio

Lightframe Studio is a local-first browser camera studio for creating short webcam performances
with reusable characters. A creator can work entirely with local camera, microphone, recording, and
voice effects, or explicitly start provider-backed character transformation, virtual try-on,
reference-image generation, and saved-voice conversion.

The product is designed for technically comfortable solo creators, creative technologists, and
design partners working on one machine. It is not currently an account-based cloud editor or a
supported public multi-user service.

## Current status

The architecture and core workflow are coherent and well tested. The July 2026 project audit
recommends a **moderated, touch/mobile-inclusive, loopback-only design-partner pilot after the
documented trust, control-recovery, 300-second recording, physical-device, provider-qualification,
and retained-data gates are closed**. It is not ready for the pilot yet or for remote/public
hosting. See the [unified findings](docs/project-audit-findings.md) and
[active implementation plan](docs/project-audit-implementation-plan.md). The approved
[controlled-pilot release contract](docs/CONTROLLED_PILOT_RELEASE_CONTRACT.md) freezes the local
cohort, qualification matrix, data/provider policy, operating limits, and generic owner roles; it
does not claim that the remaining implementation or physical/live evidence has passed.

Provider contact is deliberate and cost-sensitive:

- **Local Camera** requires no provider credentials, token, SDK load, or external media traffic.
- **Character AI** sends live camera media and the applied prompt/reference to Decart only after
  explicit Start.
- **Reference generation** contacts the configured optimizer/image provider only after a labeled
  Generate, Combined, Regenerate, or Edit action; upload and prompt-only save stay local.
- **ElevenLabs** browsing begins from a labeled provider-contact action, and Apply sends only the
  immutable original audio sidecar.

## How the product works

1. Select **Start Camera + Mic** for a provider-free local preview.
2. Optionally create or choose a reusable character.
3. Select **Start AI** for Character Transformation or secondary Virtual Try-On.
4. Select **Record**, perform a short take, then **Stop recording**. While recording, Stop is the
   sole stage action and does not auto-hide.
5. Review playback on the same persistent stage.
6. Optionally apply a local or saved ElevenLabs voice, then **Download**.
7. Close/release or explicitly discard the temporary take.

The idle stage includes a small, dismissible first-take cue with that sequence. It is tab/session
state only: dismissal is not persisted, measured, or sent anywhere.

`/` is the only application route. Character Builder and the other creative tools open over the
same mounted Studio; they do not create parallel media players or sessions.

## Main capabilities

- Local webcam/microphone preview, capture settings, recording, finalization, playback, download,
  close, and confirmed discard
- Fullscreen Character Builder with resumable IndexedDB draft, prompt-only/image-only/combined
  paths, optional generation, a single-DOM narrow-screen **Review & Generate** shortcut, and
  durable browser-local character metadata
- `lucy-2.5` realtime Character Transformation with complete atomic Apply/Revert/Reset snapshots
- Pinned `lucy-vton-3` Virtual Try-On using prompt, ephemeral garment image, or both
- Structured Add/Replace/Restyle Prompt Workshop and Recipe Shelf v4 for saved/recent/character
  reuse
- JPEG/PNG/WebP Builder references up to 10 MiB and 40 megapixels, stored as immutable local assets
- Optional OpenAI `gpt-image-2`, BFL `flux-2-pro`, or Wiro
  `seedream-v5-lite-uncensored` reference work, selected once at server startup with no fallback
- Local warm/clear/robot voice treatments and optional saved-library ElevenLabs Voice Changer
- Loopback-only Fastify integration broker with runtime schemas, server-only keys, and sanitized
  errors

## Integrations

- [Decart Lucy 2.5](https://docs.platform.decart.ai/models/realtime/lucy-2.5) provides realtime
  text/reference-guided character transformation.
- [Decart Virtual Try-On](https://docs.platform.decart.ai/models/realtime/virtual-try-on) provides
  realtime garment transformation. The product deliberately pins `lucy-vton-3`; changing to the
  moving `lucy-vton-latest` alias requires explicit compatibility evidence.
- [ElevenLabs Voice Changer](https://elevenlabs.io/docs/overview/capabilities/voice-changer)
  converts the completed audio sidecar using a voice already saved in the configured account.
- OpenAI, Black Forest Labs, or Wiro can optimize/generate/edit character references through
  isolated server adapters.

The [screenshot coverage manifest](docs/screenshot-test-coverage.md) shows the current protected
desktop, tablet, mobile, and product states without depending on live provider output.

## Requirements

- Node.js 24 (`>=24 <25`); `.nvmrc` pins the repository default to `24.18.0`
- npm 11 or newer
- A current browser with a secure context, `getUserMedia`, and `MediaRecorder`
- A camera and microphone for live capture
- Optional, independent provider credentials for AI video, OpenAI reference work, and cloud voice conversion

For the fullest media and remuxing support, begin with a current desktop Chromium browser. See [browser support](docs/BROWSER_SUPPORT.md) before relying on Safari, iOS, or a particular recording codec.

## Run locally

```bash
nvm use
npm install
cp .env.example .env
npm run dev
```

Open <http://127.0.0.1:4173> for Studio. Retired `/advanced`, `/guided`, and `/projects` entries history-replace to `/`; project-oriented entries open the legacy-project manager. The web dev server proxies `/api` to the Fastify server on `127.0.0.1:4100`. Keep `PORT=4100` for the normal `npm run dev` and functional Playwright paths because the Vite proxy is currently fixed to that port.

No keys are needed for local preview, local recording, the prompt workshop, the Recipe Shelf, or local voice treatments. Keep the key fields empty to exercise the no-provider path.

For a production-style local build:

```bash
npm run build
NODE_ENV=production npm start
```

Open <http://127.0.0.1:4100>. `npm start` starts the API, which serves the built client from the same loopback origin. Production startup fails if `apps/web/dist` is absent. This is a same-machine production-mode smoke, not a supported remote deployment.

## Configuration

All provider credentials are read only by `apps/api`. Never place provider secrets in `VITE_*` variables.

| Variable                             | Required                               | Purpose                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DECART_API_KEY`                     | Only for AI video                      | Server credential used to mint short-lived, origin-bound, single-model browser credentials. Credential start TTL is distinct from the active-session duration.                                                                                                                                                                           |
| `OPENAI_API_KEY`                     | Only for optimization or OpenAI images | Server-only credential used for prompt optimization and, when `REFERENCE_IMAGE_PROVIDER=openai`, reference-image generation, composition, and editing.                                                                                                                                                                                   |
| `OPENAI_PROMPT_OPTIMIZER_MODEL`      | No                                     | Responses API text model used by the optimizer; defaults to `gpt-5.6`.                                                                                                                                                                                                                                                                   |
| `OPENAI_PROMPT_OPTIMIZER_REASONING`  | No                                     | Optimizer reasoning effort; defaults to `medium`.                                                                                                                                                                                                                                                                                        |
| `OPENAI_PROMPT_OPTIMIZER_VERSION`    | No                                     | Version marker included in stale-result checks and saved asset metadata; defaults to `lucy-character-reference-v1`.                                                                                                                                                                                                                      |
| `OPENAI_PROMPT_OPTIMIZER_TIMEOUT_MS` | No                                     | Optimizer request timeout in milliseconds, from `10000` through `180000`; defaults to `120000`.                                                                                                                                                                                                                                          |
| `OPENAI_REFERENCE_IMAGE_MODEL`       | No                                     | Image-generation model; defaults to `gpt-image-2`.                                                                                                                                                                                                                                                                                       |
| `OPENAI_REFERENCE_IMAGE_QUALITY`     | No                                     | Final reference quality, `high` or `medium`; defaults to `high`.                                                                                                                                                                                                                                                                         |
| `REFERENCE_IMAGE_PROVIDER`           | No                                     | Server-only image-provider selector, `openai`, `bfl`, or `wiro`; defaults to `openai`. Selection occurs once at startup and never silently falls back.                                                                                                                                                                                   |
| `BFL_API_KEY`                        | Only for BFL images                    | Server-only Black Forest Labs credential used when `REFERENCE_IMAGE_PROVIDER=bfl`.                                                                                                                                                                                                                                                       |
| `BFL_REFERENCE_IMAGE_MODEL`          | No                                     | Pinned BFL model; only `flux-2-pro` is accepted.                                                                                                                                                                                                                                                                                         |
| `BFL_SAFETY_TOLERANCE`               | No                                     | FLUX.2 safety tolerance from `0` through `5`; defaults to the controlled-pilot setting `2`.                                                                                                                                                                                                                                              |
| `BFL_DISABLE_PROMPT_UPSAMPLING`      | No                                     | Strict `true`/`false`; defaults to `true` and maps to BFL `disable_pup`.                                                                                                                                                                                                                                                                 |
| `BFL_REFERENCE_IMAGE_TIMEOUT_MS`     | No                                     | One BFL submit/poll/download deadline from `10000` through `180000` milliseconds; defaults to `150000`.                                                                                                                                                                                                                                  |
| `WIRO_API_KEY`                       | Only for Wiro images                   | Server-only Wiro project API key used for signature authentication when `REFERENCE_IMAGE_PROVIDER=wiro`.                                                                                                                                                                                                                                 |
| `WIRO_API_SECRET`                    | Only for Wiro images                   | Server-only Wiro project secret used to sign each Wiro request. Both Wiro credentials are required; neither is sent to the browser.                                                                                                                                                                                                      |
| `WIRO_REFERENCE_IMAGE_MODEL`         | No                                     | Pinned Wiro model; only `seedream-v5-lite-uncensored` is accepted. The controlled-pilot contract permits operator-only technical qualification, not external-participant use.                                                                                                                                                            |
| `WIRO_REFERENCE_IMAGE_TIMEOUT_MS`    | No                                     | One Wiro submit/poll/download/normalize deadline from `10000` through `180000` milliseconds; defaults to `180000`.                                                                                                                                                                                                                       |
| `PILOT_ACCESS_MODE`                  | No                                     | `participant` (default) or `operator-qualification`. Participant mode server-disables Wiro image work even when credentials are present; the explicit operator mode is required for the separate Wiro technical pass.                                                                                                                    |
| `LIGHTFRAME_DATA_DIR`                | No                                     | Owner-only local storage for immutable uploaded, generated, edited, and composed Character Builder references and metadata; defaults to repository-root `./.lightframe-data`. Absolute paths remain absolute. A known legacy API-relative directory is reused only when the canonical path is absent; data is never moved automatically. |
| `ELEVENLABS_API_KEY`                 | Only for cloud voices                  | Server credential for saved-library discovery, proxied previews, saved-membership revalidation, and speech-to-speech conversion.                                                                                                                                                                                                         |
| `ELEVENLABS_STS_MODEL_ID`            | No                                     | Speech-to-speech model; defaults to `eleven_multilingual_sts_v2`.                                                                                                                                                                                                                                                                        |
| `ELEVENLABS_ENABLE_LOGGING`          | No                                     | Strict `true`/`false` sent to ElevenLabs conversion as `enable_logging`; omission defaults to privacy-first `false`. A non-eligible account can deliberately use `true` after reviewing terms, but the controlled pilot keeps participant conversion unavailable unless zero-retention eligibility is confirmed.                         |
| `PORT`                               | No                                     | Loopback API port; defaults to `4100`.                                                                                                                                                                                                                                                                                                   |
| `NODE_ENV`                           | No                                     | One of `development`, `test`, or `production`.                                                                                                                                                                                                                                                                                           |

Provider availability is reported by `GET /api/capabilities`; it reports configuration presence and does not probe provider reachability, quota, or entitlement. Missing optional configuration degrades only that capability. Environment values are validated at startup. `.env` is ignored by Git.

### ElevenLabs setup

The project talks to ElevenLabs through its server-side HTTPS adapter; no ElevenLabs npm package is required. Create a dedicated [restricted API key](https://elevenlabs.io/docs/api-reference/authentication), allow the voice-list/read and speech-to-speech (Voice Changer) features, give it an intentional credit limit, and store it only as `ELEVENLABS_API_KEY` in the repository-root `.env`.

The browser queries `GET /v2/voices` with `voice_type=saved`, so the selector contains only voices currently in the configured account's saved collection. Add, remove, or organize voices in ElevenLabs, then select **Refresh voices** in Studio. The project exposes no shared-library discovery or add/import endpoint.

`ELEVENLABS_STS_MODEL_ID` must identify a model returned by `GET /v1/models` with `can_do_voice_conversion: true`; the documented default is `eleven_multilingual_sts_v2`. Browsing and previewing do not require model discovery. Preview and conversion revalidate the selected ID against the saved library, while the Voice Changer endpoint remains authoritative about any provider-side policy on a particular saved voice. Studio does not hide community Professional Voice Clones based only on their `category`.

`ELEVENLABS_ENABLE_LOGGING=false` requests zero-retention mode. ElevenLabs currently limits that
mode to eligible enterprise accounts. The software permits an informed operator to set `true` for
technical work, but the approved controlled pilot keeps participant conversion unavailable unless
zero-retention eligibility is confirmed.

Provider preview audio is capped at 2 MiB. Voice Changer is pinned to `mp3_44100_128`; its
five-minute output is capped at 8 MiB based on the 128 kbps payload plus container/metadata
headroom. The API and browser both enforce declared and cumulative bytes. Overflow, malformed
audio, or cancellation preserves the immutable original and the last valid take.

## Commands

```bash
npm run dev           # build shared packages; run API and web watchers
npm run build         # production web, API, and shared package builds
npm run typecheck     # strict TypeScript checks in every workspace and E2E suite
npm run lint          # ESLint, React hooks, and accessibility rules
npm run format:check  # verify Prettier formatting
npm test              # deterministic domain, API, and component tests
npm run test:watch    # interactive Vitest watch mode
npm run test:coverage # local coverage report
npm run test:e2e      # Playwright projects; install its browsers first
npm run test:production # built Fastify static-serving browser smoke (run build first)
npm run test:visual   # curated state-driven Chromium visual suite (29-case review budget)
npm run storybook     # local component catalog on port 6006
npm run storybook:typecheck # type-check stories and Storybook configuration
npm run storybook:test # Chromium-backed Storybook interaction/a11y tests
npm run storybook:build # static Storybook build
npm run check:dead-code # Knip entrypoint/export/dependency validation
npm run check:modules # local import resolution, cycle, and boundary checks
npm run recording:memory:estimate -- --duration-seconds 300 --main-mib-per-minute 12 # planning estimate from a measured take
npm run pilot:qualification:check -- --commit <full-sha> --verbose # content-free Wave 8 evidence gate
npm run audit:prod    # high-severity production dependency audit
npm run quality       # types, Storybook, lint, format, static checks, tests, and builds
```

Install Playwright browsers once with `npx playwright install`. Coverage, functional end-to-end, production smoke, curated visual, and production audit checks are independent of the local `quality` script; run all five before release. CI runs the core checks, Storybook type/interaction/build checks, the production static-serving smoke, and the separate coverage/browser/visual jobs.

The executable visual matrix and pruning inventory share the same semantic case paths. Required
core state/viewport pairs and readiness assertions define correctness; 29 is the current review
budget. Darwin and Linux baselines remain separate because host font rasterization differs.

Default automated tests use fakes and deny unexpected external HTTP and WebSockets; they do not require devices, provider credentials, paid requests, or external media services. Mocked browser journeys exercise successful Local, Lucy 2.5, and VTON 3 flows across Chromium, WebKit, and mobile. Live provider checks are deliberately manual and gated; see [live provider smoke testing](docs/LIVE_PROVIDER_SMOKE.md).
Wave 8 records use the strict, content-free
[pilot qualification evidence contract](docs/PILOT_QUALIFICATION_EVIDENCE.md); the validator is a
release command and is intentionally excluded from ordinary quality/CI.

## Architecture at a glance

```text
apps/web presentation
        │
        ├── orchestration hooks ── browser media / recording / processing adapters
        │
        └── same-origin API client
                         │
packages/domain     packages/contracts
pure rules          runtime HTTP schemas
                         │
                  apps/api Fastify routes
                         │
       Decart / OpenAI / BFL / Wiro / ElevenLabs adapters
```

The creator of a stream, recorder, timer, object URL, audio context, or provider client owns its cleanup. Domain rules and HTTP schemas are independent of React and provider payloads. The root test setup declares the deny-external policy while feature-local suites provide focused fakes. The backend has no product database, account system, background jobs, or session history; its one durable responsibility is the owner-only local reference-asset store.

Production browser builds omit source maps and fail if the development-only realtime test seam survives executable tree-shaking. Browser session and recording adapters use the tested domain mode, lifecycle, source-selection, and artifact contracts rather than maintaining independent rule sets.

Read [architecture](docs/ARCHITECTURE.md), [privacy and temporary data](docs/PRIVACY_AND_TEMPORARY_DATA.md), and [product evolution](docs/PRODUCT_EVOLUTION.md) for the decisions behind the build.

## Important operating boundaries

- Recordings, sidecars, processed media, object URLs, tokens, voice selections, streams, device identifiers, and Recipe Dock portrait/garment files are temporary and disappear on discard, replacement, unmount, or tab closure as applicable. Media in legacy Guided projects remains checkpointed in this browser profile's IndexedDB until explicit deletion, browser eviction, or site-data clearing.
- Character Builder uploads and generated, edited, or composed references are immutable local assets under `LIGHTFRAME_DATA_DIR`. Recipe Shelf v4 stores only allowlisted metadata, reference/guided provenance, and opaque asset IDs in this browser profile.
- For each participant, use a fresh browser profile and one reviewed `LIGHTFRAME_DATA_DIR` leaf.
  Follow the [pilot data retirement checklist](docs/PILOT_DATA_RETIREMENT_CHECKLIST.md), and run
  `npm run pilot:data-retirement:drill` before admitting participant data.
- Saving a character never generates an image implicitly. Prompt-only Save makes no optimizer or image request. `Generate Preview` attempts to optimize the current direction before generating; if optimization fails, generation continues with the raw direction and shows a warning with an optimized-regeneration retry. A stale preview remains visible but is detached from Save until regenerated.
- Uploading a Builder reference stores it locally without contacting an image provider. It can be saved directly with a prompt or through **Save & Use Image Only**. **Generate Combined Preview** attempts to optimize the direction and sends the uploaded source plus the optimized-or-raw direction to the startup-selected provider for composition. Without an uploaded source, blank regeneration creates a fresh asset without the prior generated image; with an uploaded source, it composes from that source again. Written feedback uses the current owner-scoped source as an image-edit input. Removing or superseding a reference detaches it but does not delete the immutable asset.
- Character Builder exclusively owns character creation, edit, reference upload, optimization, generation, save, and Studio preload. Prompt Workshop owns only Add, Replace, and Restyle object recipes.
- Reference generation defaults to the complete full-body silhouette whenever the character's anatomy permits it, with safe margin for hands, feet, clothing, and defining features. Head-and-shoulders and waist-up remain deliberate crop choices. Orientation controls are automatic, portrait, landscape, and square; the image provider maps those choices to `1024x1536`, `1536x1024`, and `1024x1024`, and automatic follows the app's landscape target stream. Rendering can be photorealistic or faithful to source style, with neutral or subtly friendly expression and a neutral gray, off-white, or custom plain background.
- Generate Preview, Generate Combined Preview, and Regenerate may incur provider usage. A successful optimization is retained for a generation retry while its source prompt, settings, model, and optimizer version remain current. An optimizer failure alone falls back to the raw prompt through the same startup-selected image provider, marks the resulting preview with a yellow warning, and offers **Retry optimization and regenerate**. Image-provider failures do not trigger fallback, automatic resubmission, or a different provider.
- Starting an AI session sends live camera media and the applied prompt/reference state to Decart and may incur provider usage. Finishing a model take finalizes the clip before releasing the model.
- Studio omits the compatibility profile identifier, so the broker applies its default five-minute
  AI active-session scope. The retired Guided credential profile remains a compatibility detail
  and is not an application route. After a healthy AI connection commits, Studio shows the
  authoritative maximum plus app-owned elapsed/remaining time, announces the final 30-second
  warning, and treats the expected limit as completion rather than a crash. SDK generation ticks
  can move the display forward but never reset or replace the monotonic budget. If the limit lands
  during recording, the take finalizes before provider/local resources release; otherwise local
  preview and the working recipe remain available. Recording separately owns its approved
  300-second maximum: at 270 seconds Studio announces the final 30 seconds, then routes the cap
  through the coalesced Stop/finalize path and explains the completed boundary without relying on
  provider expiry. Physical 300-second memory, codec, processing, interruption, and cleanup
  qualification remains a pilot blocker for every named target.
- ElevenLabs saved-library browsing and click-to-play previews contact the provider only after the labeled disclosure/action and carry the Studio provider-intent header. Preview bytes use a short-lived, app-owned Blob URL that is aborted/revoked on replacement or unmount. Browsing, previewing, or selecting does not upload the take. Applying a saved voice sends only the completed audio sidecar and may use credits. Library membership is managed only in ElevenLabs.
- The server accepts loopback hosts only. It is not designed for LAN, tunnel, or public hosting. Remote deployment requires authentication, authorization, CSRF analysis, abuse/rate controls, tenant isolation, secret management, and a new security review.

## Documentation

Start with the [documentation map](docs/README.md), which identifies the authoritative source and
update trigger for every retained document. The most frequently needed references are:

- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Privacy, retention, and provider cost](docs/PRIVACY_AND_TEMPORARY_DATA.md)
- [Implemented user journeys](docs/userStories/README.md)
- [Browser support](docs/BROWSER_SUPPORT.md)
- [Pilot qualification evidence](docs/PILOT_QUALIFICATION_EVIDENCE.md)
- [Manual QA](docs/MANUAL_QA.md) and [gated live provider smoke](docs/LIVE_PROVIDER_SMOKE.md)
- [Project audit findings](docs/project-audit-findings.md)
- [Coding-agent working guide](AGENTS.md)

## Contributing

Read [AGENTS.md](AGENTS.md) before changing behavior. Trace the owning feature, controller,
domain/contract rule, provider boundary, and observable journey; preserve the dependency direction
and persistent-stage ownership. Use focused changes, update the canonical document and affected
user story, and run `npm run quality` plus the release-specific gates relevant to the change.

Never put provider secrets in browser code, `VITE_*` variables, screenshots, traces, logs, or
committed environment files. Do not run live paid provider checks from CI or ordinary automated
tests.

## Known external limitations

Automated checks cannot prove real camera/microphone behavior, device-driver stability, browser codec availability, provider account entitlements, available models/voices, provider billing status, realtime output quality, or live WebRTC reachability. Those require a supported physical device, browser permission, network access, and optional provider credentials. The product preserves local preparation and capture when any optional integration is unavailable.

Decart SDK `0.1.15` does not expose an abort signal for client-token creation. The broker returns promptly on browser cancellation or its timeout and ignores any late result, but the SDK's already-started upstream request may still finish and mint an unused short-lived token. Realtime browser connection cancellation is likewise best-effort until the SDK promise resolves; cloned provider input is stopped immediately and a late connection is disconnected as soon as it becomes available.

The build intentionally pins the user-approved `lucy-vton-3` identifier even though current Decart examples may show the moving `lucy-vton-latest` alias. The installed SDK recognizes the pinned id; the configured account must still be entitled to it.

## Future direction

Near-term work is a focused reliability/trust pass, followed by a moderated pilot. Backend
identity, tenant ownership, cloud libraries, usage enforcement, credits/subscriptions, and
collaboration are deliberately deferred until value and provider cost per usable download are
measured. The [active plan](docs/project-audit-implementation-plan.md) keeps those stages separate
so future infrastructure does not become an accidental current-MVP requirement.
