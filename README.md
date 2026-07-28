# Lightframe Studio

Lightframe Studio is a local-first browser camera studio for recording ordinary webcam takes, realtime AI character transformations, and virtual garment try-ons. `/` is the sole Studio entry. Character creation opens as a fullscreen Studio-owned panel; the stable stage, streams, recording/session state, and creative repositories/controllers remain owned by Studio while individual tool surfaces may unmount.

Provider contact is always explicit. Local Camera works without provider credentials and does not request a realtime token, open a provider connection, or send camera media to Decart. Character preview generation and ElevenLabs voice work begin only after their labeled user actions.

The primary stage flow is **Start Camera + Mic**, then **Start AI** and a
fullscreen experience choice when AI is wanted. The Recipe Dock remains the
direct-control path for editing and starting a specific model recipe. Recording
uses **Record** and **Stop recording**. A finalized take replaces live media on
the same stage; the detailed Latest Take panel opens only when the creator
selects **Take**.

> Product-contract update: the rebuild guide names Lucy 2.1. The user explicitly approved **Lucy 2.5**, so the implemented character model is `lucy-2.5`. Virtual try-on remains `lucy-vton-3`. This is an intentional source-of-truth update, not an accidental compatibility drift.

## What is included

- Local webcam and microphone preview and recording
- A fullscreen character builder with resumable IndexedDB autosave and explicit Reset Draft
- Separate `lucy-2.5` character and `lucy-vton-3` try-on sessions
- Draft-versus-applied realtime recipes with atomic Apply, Revert, and Reset
- JPEG, PNG, and WebP reference images up to and including 10 MiB; Character Builder uploads also enforce a 40-megapixel decoded-image limit
- A three-intent structured Prompt Workshop for focused Add, Replace, and Restyle object recipes; Character Builder exclusively owns character creation and editing
- Gender-aware visual suggestions, Show All catalogs, and custom text for directions outside the catalog; nine starter definitions remain available internally while the demo picker is hidden
- Optional, automatically optimized OpenAI `gpt-image-2`, BFL `flux-2-pro`, or Wiro ByteDance `seedream-v5-lite-uncensored` previews, durable local uploads, source-image composition, and instructed editing
- A versioned Recipe Shelf v4 for saved, recent, and restorable character prompts with reference provenance and optional guided-design provenance
- Browser recording with transformed-video gating and provider-audio/microphone fallback
- Temporary take review plus a Studio legacy manager for downloading or deleting retired Guided projects
- Browser-local warm, clear, and robot voice treatments from immutable source audio
- Optional ElevenLabs saved-library discovery, preview, and explicit post-recording conversion
- A loopback-only TypeScript integration broker with runtime schemas and sanitized errors

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
| `BFL_SAFETY_TOLERANCE`               | No                                     | FLUX.2 safety tolerance from `0` through `5`; defaults to `4`.                                                                                                                                                                                                                                                                           |
| `BFL_DISABLE_PROMPT_UPSAMPLING`      | No                                     | Strict `true`/`false`; defaults to `true` and maps to BFL `disable_pup`.                                                                                                                                                                                                                                                                 |
| `BFL_REFERENCE_IMAGE_TIMEOUT_MS`     | No                                     | One BFL submit/poll/download deadline from `10000` through `180000` milliseconds; defaults to `150000`.                                                                                                                                                                                                                                  |
| `WIRO_API_KEY`                       | Only for Wiro images                   | Server-only Wiro project API key used for signature authentication when `REFERENCE_IMAGE_PROVIDER=wiro`.                                                                                                                                                                                                                                 |
| `WIRO_API_SECRET`                    | Only for Wiro images                   | Server-only Wiro project secret used to sign each Wiro request. Both Wiro credentials are required; neither is sent to the browser.                                                                                                                                                                                                      |
| `WIRO_REFERENCE_IMAGE_MODEL`         | No                                     | Pinned Wiro model; only `seedream-v5-lite-uncensored` is accepted.                                                                                                                                                                                                                                                                       |
| `WIRO_REFERENCE_IMAGE_TIMEOUT_MS`    | No                                     | One Wiro submit/poll/download/normalize deadline from `10000` through `180000` milliseconds; defaults to `180000`.                                                                                                                                                                                                                       |
| `LIGHTFRAME_DATA_DIR`                | No                                     | Owner-only local storage for immutable uploaded, generated, edited, and composed Character Builder references and metadata; defaults to repository-root `./.lightframe-data`. Absolute paths remain absolute. A known legacy API-relative directory is reused only when the canonical path is absent; data is never moved automatically. |
| `ELEVENLABS_API_KEY`                 | Only for cloud voices                  | Server credential for saved-library discovery, proxied previews, saved-membership revalidation, and speech-to-speech conversion.                                                                                                                                                                                                         |
| `ELEVENLABS_STS_MODEL_ID`            | No                                     | Speech-to-speech model; defaults to `eleven_multilingual_sts_v2`.                                                                                                                                                                                                                                                                        |
| `ELEVENLABS_ENABLE_LOGGING`          | No                                     | Strict `true`/`false` sent to ElevenLabs conversion as `enable_logging`; omission defaults to privacy-first `false`. ElevenLabs currently restricts zero-retention mode to eligible enterprise accounts, so other accounts must deliberately set `true` after reviewing provider retention terms.                                        |
| `PORT`                               | No                                     | Loopback API port; defaults to `4100`.                                                                                                                                                                                                                                                                                                   |
| `NODE_ENV`                           | No                                     | One of `development`, `test`, or `production`.                                                                                                                                                                                                                                                                                           |

Provider availability is reported by `GET /api/capabilities`; it reports configuration presence and does not probe provider reachability, quota, or entitlement. Missing optional configuration degrades only that capability. Environment values are validated at startup. `.env` is ignored by Git.

### ElevenLabs setup

The project talks to ElevenLabs through its server-side HTTPS adapter; no ElevenLabs npm package is required. Create a dedicated [restricted API key](https://elevenlabs.io/docs/api-reference/authentication), allow the voice-list/read and speech-to-speech (Voice Changer) features, give it an intentional credit limit, and store it only as `ELEVENLABS_API_KEY` in the repository-root `.env`.

The browser queries `GET /v2/voices` with `voice_type=saved`, so the selector contains only voices currently in the configured account's saved collection. Add, remove, or organize voices in ElevenLabs, then select **Refresh voices** in Studio. The project exposes no shared-library discovery or add/import endpoint.

`ELEVENLABS_STS_MODEL_ID` must identify a model returned by `GET /v1/models` with `can_do_voice_conversion: true`; the documented default is `eleven_multilingual_sts_v2`. Browsing and previewing do not require model discovery. Preview and conversion revalidate the selected ID against the saved library, while the Voice Changer endpoint remains authoritative about any provider-side policy on a particular saved voice. Studio does not hide community Professional Voice Clones based only on their `category`.

`ELEVENLABS_ENABLE_LOGGING=false` requests zero-retention mode. ElevenLabs currently limits that mode to eligible enterprise accounts. If the account is not eligible, review the provider's retention terms and deliberately set the value to `true`; otherwise conversion will be rejected even when the key, voice, and model are valid.

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
npm run test:visual   # the curated 29-case Chromium visual suite
npm run storybook     # local component catalog on port 6006
npm run storybook:typecheck # type-check stories and Storybook configuration
npm run storybook:test # Chromium-backed Storybook interaction/a11y tests
npm run storybook:build # static Storybook build
npm run check:dead-code # Knip entrypoint/export/dependency validation
npm run check:modules # local import resolution, cycle, and boundary checks
npm run recording:memory:estimate -- --duration-seconds 300 --main-mib-per-minute 12 # planning estimate from a measured take
npm run audit:prod    # high-severity production dependency audit
npm run quality       # types, Storybook, lint, format, static checks, tests, and builds
```

Install Playwright browsers once with `npx playwright install`. Coverage, functional end-to-end, production smoke, curated visual, and production audit checks are independent of the local `quality` script; run all five before release. CI runs the core checks, Storybook type/interaction/build checks, the production static-serving smoke, and the separate coverage/browser/visual jobs.

The executable visual matrix and pruning inventory share exactly 29 cases. Darwin and Linux each contain all 29 reviewed assets. The complete suite passes on Darwin and in the Linux/amd64 Playwright runtime used to match CI architecture.

Default automated tests use fakes and deny unexpected external HTTP and WebSockets; they do not require devices, provider credentials, paid requests, or external media services. Mocked browser journeys exercise successful Local, Lucy 2.5, and VTON 3 flows across Chromium, WebKit, and mobile. Live provider checks are deliberately manual and gated; see [live provider smoke testing](docs/LIVE_PROVIDER_SMOKE.md).

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
- Saving a character never generates an image implicitly. Prompt-only Save makes no optimizer or image request. `Generate Preview` always optimizes the current direction before generating; a stale preview remains visible but is detached from Save until regenerated.
- Uploading a Builder reference stores it locally without contacting an image provider. It can be saved directly with a prompt or through **Save & Use Image Only**. **Generate Combined Preview** optimizes the direction and sends the uploaded source to the startup-selected provider for composition. Without an uploaded source, blank regeneration creates a fresh asset without the prior generated image; with an uploaded source, it composes from that source again. Written feedback uses the current owner-scoped source as an image-edit input. Removing or superseding a reference detaches it but does not delete the immutable asset.
- Character Builder exclusively owns character creation, edit, reference upload, optimization, generation, save, and Studio preload. Prompt Workshop owns only Add, Replace, and Restyle object recipes.
- Reference generation defaults to the complete full-body silhouette whenever the character's anatomy permits it, with safe margin for hands, feet, clothing, and defining features. Head-and-shoulders and waist-up remain deliberate crop choices. Orientation controls are automatic, portrait, landscape, and square; the image provider maps those choices to `1024x1536`, `1536x1024`, and `1024x1024`, and automatic follows the app's landscape target stream. Rendering can be photorealistic or faithful to source style, with neutral or subtly friendly expression and a neutral gray, off-white, or custom plain background.
- Generate Preview, Generate Combined Preview, and Regenerate may incur provider usage. A successful optimization is retained for a generation retry while its source prompt, settings, model, and optimizer version remain current; provider failures never silently fall back to the raw prompt.
- Starting an AI session sends live camera media and the applied prompt/reference state to Decart and may incur provider usage. Finishing a model take finalizes the clip before releasing the model.
- Studio omits the compatibility profile identifier, so the broker applies its default five-minute AI active-session scope. The retired Guided credential profile remains a compatibility detail and is not an application route; ordinary recording has no corresponding five-minute warning or forced-stop timer.
- ElevenLabs saved-library browsing and click-to-play previews contact the provider only after the labeled disclosure/action and carry the Studio provider-intent header. Preview bytes use a short-lived, app-owned Blob URL that is aborted/revoked on replacement or unmount. Browsing, previewing, or selecting does not upload the take. Applying a saved voice sends only the completed audio sidecar and may use credits. Library membership is managed only in ElevenLabs.
- The server accepts loopback hosts only. It is not designed for LAN, tunnel, or public hosting. Remote deployment requires authentication, authorization, CSRF analysis, abuse/rate controls, tenant isolation, secret management, and a new security review.

## Documentation

- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Privacy, retention, and provider cost](docs/PRIVACY_AND_TEMPORARY_DATA.md)
- [Image generation API flow](docs/Image_Generation.md)
- [Product evolution and changed flows](docs/PRODUCT_EVOLUTION.md)
- [Browser support](docs/BROWSER_SUPPORT.md)
- [Recording memory policy](docs/RECORDING_MEMORY_POLICY.md)
- [Manual QA checklist](docs/MANUAL_QA.md)
- [Live provider smoke test](docs/LIVE_PROVIDER_SMOKE.md)
- [Implemented user journeys](docs/userStories/README.md)
- [Storybook catalog](stories/README.md)
- [Engineering lessons](LESSONS.md)
- [Coding-agent working guide](AGENTS.md)

## Known external limitations

Automated checks cannot prove real camera/microphone behavior, device-driver stability, browser codec availability, provider account entitlements, available models/voices, provider billing status, realtime output quality, or live WebRTC reachability. Those require a supported physical device, browser permission, network access, and optional provider credentials. The product preserves local preparation and capture when any optional integration is unavailable.

Decart SDK `0.1.15` does not expose an abort signal for client-token creation. The broker returns promptly on browser cancellation or its timeout and ignores any late result, but the SDK's already-started upstream request may still finish and mint an unused short-lived token. Realtime browser connection cancellation is likewise best-effort until the SDK promise resolves; cloned provider input is stopped immediately and a late connection is disconnected as soon as it becomes available.

The build intentionally pins the user-approved `lucy-vton-3` identifier even though current Decart examples may show the moving `lucy-vton-latest` alias. The installed SDK recognizes the pinned id; the configured account must still be entitled to it.
