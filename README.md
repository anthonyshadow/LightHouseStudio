# Lightframe Studio

Lightframe Studio is a local-first browser camera studio for recording ordinary webcam takes, realtime AI character transformations, and virtual garment try-ons. It keeps creation focused around one adaptive workspace: a live stage, a recipe dock, optional prompt tools, and a temporary latest-take dock.

Local capture is the safe default. It works without provider credentials and does not import the Decart SDK, request a realtime token, open a provider connection, or send camera media to Decart. AI video and ElevenLabs voice conversion are optional, explicit actions.

> Product-contract update: the rebuild guide names Lucy 2.1. The user explicitly approved **Lucy 2.5**, so the implemented character model is `lucy-2.5`. Virtual try-on remains `lucy-vton-3`. This is an intentional source-of-truth update, not an accidental compatibility drift.

## What is included

- Local webcam and microphone preview and recording
- Separate `lucy-2.5` character and `lucy-vton-3` try-on sessions
- Draft-versus-applied realtime recipes with atomic Apply, Revert, and Reset
- JPEG, PNG, and WebP reference images up to and including 10 MiB
- A four-intent structured character prompt workshop with optional adult age and gender choices
- Default-on GPT prompt optimization, editable reference prompts, and explicit `gpt-image-2` generation of durable Lucy 2.5 character references
- A versioned browser-local Recipe Shelf for saved, recent, and restorable character prompts
- Browser recording with transformed-video gating and provider-audio/microphone fallback
- Temporary take review, download, confirmed discard, focus recovery, and unload protection
- Browser-local warm, clear, and robot voice treatments from immutable source audio
- Optional ElevenLabs workspace/public voice discovery, preview, import, and explicit post-recording conversion
- A loopback-only TypeScript integration broker with runtime schemas and sanitized errors

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A current browser with a secure context, `getUserMedia`, and `MediaRecorder`
- A camera and microphone for live capture
- Optional provider credentials for AI video and cloud voice conversion

For the fullest media and remuxing support, begin with a current desktop Chromium browser. See [browser support](docs/BROWSER_SUPPORT.md) before relying on Safari, iOS, or a particular recording codec.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open <http://127.0.0.1:4173>. The web dev server proxies `/api` to the Fastify server on `127.0.0.1:4100`.

No keys are needed for local preview, local recording, the prompt workshop, the Recipe Shelf, or local voice treatments. Keep the key fields empty to exercise the no-provider path.

For a production-style local build:

```bash
npm run build
npm start
```

Open <http://127.0.0.1:4100>. The API serves the built client from the same loopback origin.

## Configuration

All credentials are read only by `apps/api`. Do not create `VITE_*` key variables.

| Variable                            | Required              | Purpose                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DECART_API_KEY`                    | Only for AI video     | Server credential used to mint five-minute, origin-bound, single-model browser credentials.                                                                                                                                                                                                       |
| `OPENAI_API_KEY`                    | Only for references   | Server-only credential used for prompt optimization and reference-image generation.                                                                                                                                                                                                               |
| `OPENAI_PROMPT_OPTIMIZER_MODEL`     | No                    | Responses API text model used by the optimizer; defaults to `gpt-5.6`.                                                                                                                                                                                                                            |
| `OPENAI_PROMPT_OPTIMIZER_REASONING` | No                    | Optimizer reasoning effort; defaults to `medium`.                                                                                                                                                                                                                                                 |
| `OPENAI_PROMPT_OPTIMIZER_VERSION`   | No                    | Version marker included in stale-result checks and saved asset metadata; defaults to `lucy-character-reference-v1`.                                                                                                                                                                               |
| `OPENAI_REFERENCE_IMAGE_MODEL`      | No                    | Image-generation model; defaults to `gpt-image-2`.                                                                                                                                                                                                                                                |
| `OPENAI_REFERENCE_IMAGE_QUALITY`    | No                    | Final reference quality, `high` or `medium`; defaults to `high`.                                                                                                                                                                                                                                  |
| `LIGHTFRAME_DATA_DIR`               | No                    | Owner-only local storage for immutable generated reference images and metadata; defaults to `./.lightframe-data`.                                                                                                                                                                                 |
| `ELEVENLABS_API_KEY`                | Only for cloud voices | Server credential for voice discovery, proxied previews, public voice import, and speech-to-speech conversion.                                                                                                                                                                                    |
| `ELEVENLABS_STS_MODEL_ID`           | No                    | Speech-to-speech model; defaults to `eleven_multilingual_sts_v2`.                                                                                                                                                                                                                                 |
| `ELEVENLABS_ENABLE_LOGGING`         | No                    | Strict `true`/`false` sent to ElevenLabs conversion as `enable_logging`; omission defaults to privacy-first `false`. ElevenLabs currently restricts zero-retention mode to eligible enterprise accounts, so other accounts must deliberately set `true` after reviewing provider retention terms. |
| `PORT`                              | No                    | Loopback API port; defaults to `4100`.                                                                                                                                                                                                                                                            |
| `NODE_ENV`                          | No                    | One of `development`, `test`, or `production`.                                                                                                                                                                                                                                                    |

Provider availability is reported by `GET /api/capabilities`; missing optional configuration degrades only that capability. Environment values are validated at startup. `.env` is ignored by Git.

## Commands

```bash
npm run dev           # build shared packages; run API and web watchers
npm run build         # production web, API, and shared package builds
npm run typecheck     # strict TypeScript checks in every workspace and E2E suite
npm run lint          # ESLint, React hooks, and accessibility rules
npm run format:check  # verify Prettier formatting
npm test              # deterministic domain, API, and component tests
npm run test:coverage # local coverage report
npm run test:e2e      # Playwright projects; install its browsers first
npm run quality       # typecheck, lint, format check, tests, and build
```

Install Playwright browsers once with `npx playwright install`. End-to-end checks are separate from `npm run quality`, so run both before release.

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
              Decart / ElevenLabs adapters
```

The creator of a stream, recorder, timer, object URL, audio context, or provider client owns its cleanup. Domain rules and HTTP schemas are independent of React and provider payloads. A shared testing package declares the deny-external policy while feature-local suites provide focused fakes. The backend has no product database, account system, background jobs, or session history; its one durable responsibility is the owner-only local generated-reference asset store.

Production browser builds omit source maps and fail if the development-only realtime test seam survives executable tree-shaking. Browser session and recording adapters use the tested domain mode, lifecycle, source-selection, and artifact contracts rather than maintaining independent rule sets.

Read [architecture](docs/ARCHITECTURE.md), [privacy and temporary data](docs/PRIVACY_AND_TEMPORARY_DATA.md), and [product evolution](docs/PRODUCT_EVOLUTION.md) for the decisions behind the build.

## Important operating boundaries

- Manually uploaded images, recordings, sidecars, processed media, object URLs, tokens, voice selections, streams, and device identifiers are temporary and disappear on discard, replacement, unmount, or tab closure as applicable.
- Generated character references are immutable local assets under `LIGHTFRAME_DATA_DIR`; the Recipe Shelf stores only allowlisted metadata and opaque asset IDs in this browser profile.
- Prompt optimization is enabled by default. The raw workshop recipe and selected reference settings are sent to the server-side OpenAI Responses API, which returns a separate editable `optimizedImagePrompt` and compact `lucy25CharacterPrompt`. Generate sends only the validated optimized image prompt while optimization is enabled. Turning optimization off is an explicit per-browser preference and deliberately restores direct generation from the original recipe.
- Reference generation defaults to the complete full-body silhouette whenever the character's anatomy permits it, with safe margin for hands, feet, clothing, and defining features. Head-and-shoulders and waist-up remain deliberate crop choices. Orientation choices are automatic, portrait 9:16, landscape 16:9, and square; automatic follows the app's known landscape 16:9 target stream. Rendering can be photorealistic or faithful to source style, with neutral or subtly friendly expression and a neutral gray, off-white, or custom plain background.
- Optimize, Re-optimize, Generate, and Regenerate may incur provider usage. A successful optimization is retained for a generation retry while its source prompt, settings, model, and optimizer version remain current; provider failures never silently fall back to the raw prompt.
- Starting an AI session sends live camera media and the applied prompt/reference state to Decart and may incur provider usage. Finishing a model take finalizes the clip before releasing the model.
- Applying an ElevenLabs voice sends only the completed audio sidecar through the same-origin backend and may use credits. Browsing or selecting a voice does not upload the take. Importing a public voice changes the configured ElevenLabs workspace.
- The server accepts loopback hosts only. It is not designed for LAN, tunnel, or public hosting. Remote deployment requires authentication, authorization, CSRF analysis, abuse/rate controls, tenant isolation, secret management, and a new security review.

## Documentation

- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Privacy, retention, and provider cost](docs/PRIVACY_AND_TEMPORARY_DATA.md)
- [Product evolution and changed flows](docs/PRODUCT_EVOLUTION.md)
- [Browser support](docs/BROWSER_SUPPORT.md)
- [Manual QA checklist](docs/MANUAL_QA.md)
- [Live provider smoke test](docs/LIVE_PROVIDER_SMOKE.md)

## Known external limitations

Automated checks cannot prove real camera/microphone behavior, device-driver stability, browser codec availability, provider account entitlements, available ElevenLabs models/voices, provider billing status, realtime output quality, or live WebRTC reachability. Those require a supported physical device, browser permission, network access, and optional provider credentials. The product preserves local preparation and capture when either integration is unavailable.

Decart SDK `0.1.14` does not expose an abort signal for client-token creation. The broker returns promptly on browser cancellation or its timeout and ignores any late result, but the SDK's already-started upstream request may still finish and mint an unused short-lived token. Realtime browser connection cancellation is likewise best-effort until the SDK promise resolves; cloned provider input is stopped immediately and a late connection is disconnected as soon as it becomes available.

The build intentionally pins the user-approved `lucy-vton-3` identifier even though current Decart examples may show the moving `lucy-vton-latest` alias. The installed SDK recognizes the pinned id; the configured account must still be entitled to it.
