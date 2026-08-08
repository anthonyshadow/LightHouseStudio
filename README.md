# Lightframe Studio

Lightframe Studio is a local-first browser studio for short-form video creation and reusable
characters. Its primary loop is:

**Log in → Record or Upload → Review → optional Virtual Try On, Character Swap, and/or Voice → Save and/or Download**

Live AI camera transformation and Workshop remain advanced tools. The app is single-operator and
binds to loopback. Phase 1 provides one seeded local demo account, authenticated ownership, and
durable local saved-media records; it does not provide signup, billing, cloud projects, or public
multi-user deployment. It is not approved for LAN, tunnel, proxy, or public exposure.

## Status

The core workflow is implemented and automated tests cover local, Character, VTO, recording,
review, and voice paths. Physical-device and live-provider results remain useful validation
inputs, but their absence does not disable configured application features.

## Product flow

1. Open `/`, choose **Log in**, and submit the locally configured demo credentials. The backend
   verifies the Argon2id password hash and issues a session JWT in a host-only, HTTP-only cookie.
   The development login form currently prefills both values by product decision.
2. Studio opens in neutral **Local Camera** mode. Camera and microphone remain off until the
   creator explicitly starts them from the control bar or **Record a local video** in the upload
   panel. No AI model, provider session, or remote processing starts on entry or refresh.
3. Choose a landscape 16:9 or portrait 9:16 local format in Capture Settings, then record on the
   persistent stage, or select a compatible device-local file at any aspect ratio. For the best
   visual-processing experience, use 16:9 or 9:16 or crop to one of those ratios with **Adjust
   video** after upload. A healthy local recording is normalized on device and becomes the editor
   source after finalization.
4. Review the source and optionally use **Adjust video** to trim, crop, rotate, flip, relight, or
   filter it entirely in the browser. A validated export becomes the new immutable source only
   after explicit replacement confirmation.
5. Optionally choose exactly one visual transformation—**Character Swap** or **Virtual Try On**—
   and/or **Voice**. Combined work completes and validates the visual result before voice
   conversion. Any non-16:9/9:16 upload or local square, 4:5, or incompatible Freeform edit keeps
   Download and Voice but disables Character Swap/VTO before provider contact.
6. Preview **Original** and **Result**, revise the plan or edit base, then **Save Video** and/or
   download the latest healthy result. Save is idempotent and independent of Download. An edit
   saves as a new, source-linked video by default; explicit replacement confirms before appending
   an immutable version.
7. Prepare advanced live work without starting media: desktop places **Select Character** and
   **Select Outfit** immediately before **Workshop** in the creative-tool rail. Phones and tablets
   use **Dock** for direct Character/VTO recipes and **Shelf** for saved characters, outfits, and
   their builders. A prepared selection can then be started explicitly from **Start AI** or the
   Dock and recorded through the existing live flow.

`/` is a minimal provider-free entry and lazily loads no Studio/media runtime. `/studio`,
`/studio/videos`, `/studio/characters`, and `/studio/outfits` share one persistent `StudioApp` and
one stage; their full-screen library surfaces never create another media session. The gallery
loads metadata and lazy thumbnails first, then fetches video bytes only for an explicit Preview,
Studio, Edit, or Download action. Saved Videos can be filtered by attributed character and
Landscape, Portrait, or Square format, then ordered by Latest, Oldest, Shortest, or Longest. A
thumbnail Preview opens a centered, focus-managed player over
the darkened gallery; that scoped player owns no tracks, object URL, recorder, or provider session
and detaches its authenticated content URL on close. Any saved video can be deleted independently;
a retained derived video remains usable when its source record is deleted. **Use existing video**
retains its separate approved source/result player. Every other path returns to `/`. Older Guided
compatibility videos were not imported during the Phase 1 cutover; their retired repository and UI
wiring are now removed.

Leaving Studio is blocked during recording/finalization and active local video rendering. A
temporary take, active Voice work, dirty video edit, or dirty Recipe Shelf/Outfit Builder/Wardrobe
edit requires confirmed discard; saved origin-scoped browser data is unaffected.

## Capabilities and provider boundaries

- Local camera, microphone, existing-video validation/preview, recording, non-destructive trim,
  crop, rotation, flips, lighting and filters, on-device MP4 transcoding, playback, local voice
  effects, and download require no provider credentials or external media traffic.
- Character Builder saves browser-local character metadata and immutable reference assets under
  `LIGHTFRAME_DATA_DIR`. Prompt-only save and upload do not generate images. Every newly generated,
  regenerated, edited, or composed character reference is staged as one character on a uniform
  neutral-gray background with no environment or unrelated props; existing uploaded and immutable
  assets are not rewritten.
- Saved Characters expose a normalized Wardrobe containing the labelled original plus saved
  variants, an optional saved-voice default, and image-backed saved outfits as garment choices.
  Browsing, duplication into a new Character Builder draft, exact version selection, and default
  voice persistence stay local. Opening default-voice configuration explicitly loads the saved
  ElevenLabs library; selecting the character in Existing Video preselects that voice without
  processing, and the edit can override it. **Add Outfit** contacts Pruna only
  from explicit Generate/Regenerate; **Change Features** uses the startup-selected OpenAI/BFL/Wiro
  image provider with optimization disabled. Original-source edits include the parent prompt;
  variant-source edits treat the selected image as authoritative and send no parent prompt. An
  optional, default-off major-departure control also treats the selected image as image-only input
  and allows requested identity and defining-trait changes. Saving never selects a variant
  implicitly. Deleting a variant removes its browser-local metadata and links while retaining
  immutable image bytes.
- Outfit Builder creates reusable prompt or reference-image VTO recipes from Studio or the Saved
  Outfits library. Prompt enhancement is
  remembered with prompt outfits. A selected image remains tab-temporary until final Save, when
  the existing idempotent local upload endpoint makes it durable; Save never starts media or
  contacts Decart or an image provider.
- `lucy-latest` and pinned `lucy-vton-latest` start only after explicit user action. Decart receives
  live media and the applied prompt/reference snapshot.
- Existing-video Character Swap uses one startup-selected server provider: Decart
  `lucy-latest` by default or Pruna `p-video-replace`. Virtual Try-On remains on Decart
  `lucy-vton-latest`, independently of that Character Swap choice. Decart output remains fixed
  720p; when Pruna is active, the editor lets the creator choose its documented approximate 1 MP
  (`720p`) or 2 MP (`1080p`) resolution class for each submission while retaining source
  orientation. A non-canonical Pruna result size produces a content-free informational server
  record and continues with the inspected dimensions; Decart remains exact-canonical. Selecting
  such a result for another visual edit prepares a temporary canonical contain-fit copy locally at
  the next explicit Start; the displayed/downloadable result is unchanged.
  Both paths use explicit submit/status/content stages, inspected size/duration/orientation, and
  no automatic retry of a billable submission. The browser sees only operation capabilities and
  provider-neutral copy. Pruna non-2xx responses log only the numeric upstream status server-side.
  Its status endpoint can also return HTTP 200 with a terminal `failed` prediction; Lightframe logs
  that safe terminal category separately and tells the browser that no result was produced.
  Provider bodies remain private.
- Pruna Character Swap requires one identity reference and H.264 MP4 input. H.264 MOV and VP8
  WebM are converted locally at explicit Start into an ephemeral submission Blob; the immutable
  source is unchanged. MP4 input passes through. Every prediction explicitly pins seed `0`, turbo
  off, original frame rate, source-audio conditioning/output, and the enabled safety checker.
  Prompt entry and enhancement are unavailable in this configuration. The browser always submits
  an empty recipe prompt, the broker rejects tampered non-empty prompt text, and the adapter always
  uses a server-owned Pruna instruction that makes reference image 1 authoritative for facial
  identity, defining appearance, clothing, footwear, and worn accessories. Source-person clothing
  is replaced rather than transferred onto the saved character, while source performance, hand
  placement, held-item visibility/interactions, framing, lighting, background, scene, other
  objects, and audio are preserved.
- Reference generation uses one startup-selected provider: OpenAI `gpt-image-2`, BFL
  `flux-2-pro`, or Wiro `seedream-v5-lite-uncensored`. There is no automatic billable retry or
  provider fallback.
- ElevenLabs provides lazy **Saved Voices** and **Browse Voices** views. Saved state is an
  owner-scoped Lightframe relationship; removing it never calls the ElevenLabs delete API.
  Browse exposes only
  authenticated catalog voices whose provider metadata reports the standard included rate
  (`rate === 1`) and free-user allowance, and lets the creator add them to Saved Voices. Eligible
  catalog voices can be added or removed from the current user's Lightframe library. Preview does
  not upload the take; Apply sends only the immutable original audio sidecar.
- Explicit Character Builder, Character Swap, VTO, and Outfit Builder image-URL import uses the
  loopback broker, accepts public HTTPS JPEG/PNG/WebP only, pins public DNS across bounded
  redirects, validates decoded contents, and never retains the URL.
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
functional Playwright paths. The checked development defaults prefill
`demo@lightframe.local` / `lightframe-demo`; change the plaintext prefill and its independently
generated hash together when rotating the demo credential. Leave provider keys empty to exercise
the fully local path.

For the production-mode loopback smoke:

```bash
pnpm build
NODE_ENV=production pnpm start
```

Open <http://127.0.0.1:4100>. Production startup fails when `apps/web/dist` is absent.
It also rejects the checked demo JWT secret and demo password hash; set environment-specific
values before a production-mode loopback smoke.

## Configuration

All credentials are read by `apps/api`; never place secrets in `VITE_*` variables. `.env.example`
is the maintained list of defaults and tunables.

| Variable                                                                                  | Purpose                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEMO_AUTH_ENABLED`, `DEMO_AUTH_PREFILL`                                                  | Enables the seeded local login and the non-production development prefill                                                                                 |
| `DEMO_USER_ID`, `DEMO_USER_LOGIN`                                                         | Stable immutable owner UUID and normalized seeded login                                                                                                   |
| `DEMO_USER_PASSWORD`, `DEMO_USER_PASSWORD_HASH`                                           | Development prefill and independently generated Argon2id verification hash; plaintext is never used for backend comparison                                |
| `AUTH_JWT_SECRET`, `AUTH_SESSION_TTL_SECONDS`                                             | Session-specific JWT signing secret and expiry; default TTL is 24 hours                                                                                   |
| `AUTH_COOKIE_NAME`, `AUTH_COOKIE_SECURE`                                                  | Host-only HTTP-only SameSite cookie settings; Secure remains false only for loopback HTTP development                                                     |
| `DATABASE_MODE`, `DATABASE_URL`                                                           | `local` (default), Neon-backed `shadow`, or authoritative `neon`; URL is server-only                                                                      |
| `ASSET_STORE_PROVIDER`                                                                    | `local` (default) or private Cloudflare `r2`; R2 requires a Neon-backed database mode                                                                     |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_KEY_PREFIX` | Private R2 S3 endpoint credentials, bucket, and opaque object prefix; never browser-exposed                                                               |
| `VIDEO_JOB_MAX_ACTIVE`, `VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER`                               | Server admission limits for accepted batch work; defaults to `8` globally and `4` per provider                                                            |
| `DECART_API_KEY`                                                                          | Realtime scoped credentials, Decart Character Swap, and Decart-only Virtual Try-On                                                                        |
| `EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER`                                                  | Startup Character Swap choice: `decart` (default) or `pruna`; never exposed in the UI                                                                     |
| `PRUNA_VIDEO_REPLACE_ENABLED`, `PRUNA_API_KEY`                                            | Required enablement and shared server credential when Pruna Character Swap is selected                                                                    |
| `PRUNA_VIDEO_REPLACE_MODEL`                                                               | Exact pinned `p-video-replace` literal; required when Pruna is selected                                                                                   |
| `PRUNA_IMAGE_TRY_ON_ENABLED`                                                              | Enables Wardrobe Add Outfit; defaults to `false` and does not hide saved versions                                                                         |
| `PRUNA_IMAGE_TRY_ON_MODEL`                                                                | Exact pinned `p-image-try-on` literal; required with try-on enablement                                                                                    |
| `OPENAI_API_KEY`                                                                          | Character prompt optimization and OpenAI image work                                                                                                       |
| `REFERENCE_IMAGE_PROVIDER`                                                                | Startup choice: `openai` (default), `bfl`, or `wiro`                                                                                                      |
| `BFL_API_KEY`                                                                             | BFL image work when BFL is selected                                                                                                                       |
| `WIRO_API_KEY`, `WIRO_API_SECRET`                                                         | Wiro image work when Wiro is selected                                                                                                                     |
| `ELEVENLABS_API_KEY`                                                                      | Saved-voice listing, preview, and Voice Changer                                                                                                           |
| `ELEVENLABS_ENABLE_LOGGING`                                                               | Provider retention choice; defaults to `false`                                                                                                            |
| `LIGHTFRAME_DATA_DIR`                                                                     | Owner-scoped local media bytes and atomic metadata; defaults to repository-root `./.lightframe-data`; an existing API-relative default remains compatible |
| `PORT`                                                                                    | Loopback API port; defaults to `4100`                                                                                                                     |
| `NODE_ENV`                                                                                | `development`, `test`, or `production`                                                                                                                    |

`GET /api/capabilities` reports configuration presence, not provider reachability, entitlement, or
quota. Missing optional configuration disables only the corresponding feature.

## Commands

| Command                                                                                  | Purpose                                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                                                                               | Build shared packages and run API/web watchers                         |
| `pnpm auth:hash-password`                                                                | Interactively generate an Argon2id demo password hash                  |
| `pnpm build`                                                                             | Build all workspaces                                                   |
| `pnpm quality`                                                                           | Type, Storybook, lint, format, dead-code, module, unit, and build gate |
| `pnpm --dir apps/api db:check`                                                           | Validate Drizzle migration history                                     |
| `pnpm --dir apps/api db:migrate`                                                         | Apply reviewed migrations to `DATABASE_URL`                            |
| `pnpm --dir apps/api db:backfill-local`                                                  | Dry-run local video/voice/reference inventory                          |
| `pnpm --dir apps/api db:backfill-local -- --apply`                                       | Idempotently backfill configured Neon/R2, retaining local rollback     |
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
| `pnpm check:dead-code:production`                                                        | Production files and dependency reachability                           |
| `pnpm storybook`                                                                         | Local component catalog on port 6006                                   |
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
```

Review the visual baseline inventory for every changed Darwin/Linux image. The exact-candidate
commands are canonicalized in the [testing strategy](docs/TESTING.md).

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
                    │              │
          auth + ownership    local asset store
                    │              │
       Decart / Pruna / OpenAI / BFL / Wiro / ElevenLabs
```

The creator of a stream, recorder, timer, listener, object URL, audio context, transcoder, or
provider client owns idempotent cleanup. Recording borrows source tracks and never stops them.
If a retained playback Blob outlives a stale browser object URL, the artifact owner may rebuild
that URL once; repeated decode failures are not retried in a loop.
Finalization settles the video and optional sidecar, transcodes the main recording on-device to
H.264/AAC MP4, and publishes that downloadable artifact before live resources release. Raw
recorder output never receives a download URL.

The default backend has one configured local user and local persistence. Configuration-gated
Drizzle/Neon repositories, private Cloudflare R2 bytes, durable sessions, creative-library sync,
and accepted-job restart recovery are also implemented; they do not add signup, public tenancy,
billing, or remote deployment. Read [the cloud persistence runbook](docs/CLOUD_PERSISTENCE.md) and
[architecture and ownership](docs/ARCHITECTURE.md) for the full dependency, lifecycle,
persistence, and HTTP boundaries.

## Documentation

Start with the [documentation map](docs/README.md). Key references:

- [Implemented journeys](docs/userStories/README.md)
- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Privacy and temporary data](docs/PRIVACY_AND_TEMPORARY_DATA.md)
- [Maintainability audit](docs/MAINTAINABILITY_AUDIT.md)
- [Browser support](docs/BROWSER_SUPPORT.md)
- [Manual QA](docs/MANUAL_QA.md)
- [Testing strategy](docs/TESTING.md)
- [Repository working guide](AGENTS.md)

Before changing behavior, read the working guide, trace the owning presentation, orchestration,
domain/contract, provider boundary, and tests, then update the affected canonical document and
user story.
