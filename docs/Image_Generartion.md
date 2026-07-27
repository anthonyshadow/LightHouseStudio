# Image generation API flow

This document describes every API involved in creating, composing, editing, storing, and reading a Character reference image. It is intentionally limited to the reference-image feature: camera media, Decart video transformation, and ElevenLabs are not image-generation APIs.

## The short version

The browser never calls OpenAI, Black Forest Labs, or Wiro and never receives provider credentials. It calls the same-origin local Fastify broker under `/api/reference-images`. The broker validates the request, resolves any source asset from the private local store, and calls exactly one server-selected image provider. `REFERENCE_IMAGE_PROVIDER=openai` is the default; `bfl` selects the pinned FLUX.2 Pro adapter and `wiro` selects the pinned ByteDance Seedream adapter. There is no browser selector or fallback.

Prompt optimization remains an independent OpenAI Responses operation. Image generation uses the existing OpenAI SDK adapter, the BFL REST adapter, or the Wiro REST adapter:

| Provider operation                                               | Used for                                                            | Produces                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| OpenAI `responses.parse(...)`                                    | Prompt optimization                                                 | A schema-validated image prompt, Lucy 2.5 prompt, and recommended output settings |
| OpenAI `images.generate(...)`                                    | A new OpenAI reference with no source image                         | One base64-encoded image                                                          |
| OpenAI `images.edit(...)`                                        | An OpenAI edit or composition from an existing local image          | One base64-encoded image                                                          |
| BFL `POST /v1/flux-2-pro` + polling                              | BFL generation, edit, or composition; source is optional base64     | One task followed by a short-lived signed image result                            |
| Wiro `POST /Run/ByteDance/seedream-v5-lite-uncensored` + polling | Wiro generation, edit, or composition; source is optional multipart | One task followed by a CDN image result normalized to the app contract            |

The source-guided provider operation has two product uses: **edit** changes an existing reference according to written feedback; **composition** combines an uploaded source with the optimized character direction. An upload by itself is local file storage and makes no external image request.

## Preconditions and configuration

- The API server accepts only loopback hosts. Mutating reference-image routes also require an `Origin` whose exact host and port match the request host. This prevents another site from spending the local operator's provider account.
- `OPENAI_API_KEY` enables prompt optimization and is also required for images when `REFERENCE_IMAGE_PROVIDER=openai`.
- `BFL_API_KEY` is required only when `REFERENCE_IMAGE_PROVIDER=bfl`. Selecting BFL without it makes image generation unavailable and does not fall back to OpenAI.
- `WIRO_API_KEY` and `WIRO_API_SECRET` are both required when `REFERENCE_IMAGE_PROVIDER=wiro`. Every Wiro request uses the configured signature-authentication scheme; selecting Wiro with either credential missing makes image generation unavailable and does not fall back.
- Defaults are `gpt-5.6` for optimization (`medium` reasoning) and `gpt-image-2` at `high` quality for images. `OPENAI_PROMPT_OPTIMIZER_MODEL`, `OPENAI_PROMPT_OPTIMIZER_REASONING`, `OPENAI_PROMPT_OPTIMIZER_VERSION`, `OPENAI_PROMPT_OPTIMIZER_TIMEOUT_MS`, `OPENAI_REFERENCE_IMAGE_MODEL`, and `OPENAI_REFERENCE_IMAGE_QUALITY` can change those settings.
- The API advertises configured capability through `GET /api/capabilities`; it reads local configuration only and does **not** contact any provider, test quota, or test model access.
- OpenAI generated images retain the existing 150-second timeout and zero SDK retries. BFL has one `BFL_REFERENCE_IMAGE_TIMEOUT_MS` deadline, default 150 seconds, across its single non-retried task submission, polling, and signed-result download. Wiro has the equivalent `WIRO_REFERENCE_IMAGE_TIMEOUT_MS` deadline, default 180 seconds, across submission, Task Detail polling, download, and normalization. Optimization defaults to a separate 120-second timeout and has no automatic retry.

## Browser-to-broker API contract

Every JSON `POST` sends `Content-Type: application/json`, `Accept: application/json`, `cache: no-store`, and the JSON body shown below. JSON `GET` requests send `Accept: application/json` and no body. `requestId` is a UUID supplied by the browser. The server uses it with a hash of the complete request to deduplicate an identical retry; reusing it with different input returns a conflict instead of creating a second asset.

### Shared JSON fields

Every `options` object is strict: it must contain every field below and cannot include unknown fields.

| Field                      | Required value                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rawPrompt`                | Trimmed string from 1 through 4,000 characters.                                                                                                                                          |
| `options.framing`          | `head_and_shoulders`, `waist_up`, or `full_body`.                                                                                                                                        |
| `options.orientation`      | `auto`, `portrait_9_16`, `landscape_16_9`, or `square`.                                                                                                                                  |
| `options.renderingMode`    | `photorealistic` or `faithful_source_style`.                                                                                                                                             |
| `options.expression`       | `neutral` or `subtle_friendly`.                                                                                                                                                          |
| `options.background`       | `neutral_gray`, `off_white`, or `plain_custom`.                                                                                                                                          |
| `options.customBackground` | Required trimmed 1–200-character string only when `background` is `plain_custom`; prohibited for every other background.                                                                 |
| `options.targetUse`        | Exactly `lucy_2_5_character_reference`.                                                                                                                                                  |
| `generator`                | Optional strict object with optional 1–128-character `provider` and `model` strings. It records the requested generator identity in the audit; it does not select an arbitrary provider. |

An optimized request's `optimization.result` must be the complete optimizer result: non-empty `optimizedImagePrompt` (up to 32,000 characters), `lucy25CharacterPrompt` (up to 5,000), `normalizedCharacterDescription` (up to 10,000), `preservedCharacterFacts` (up to 64 strings), `technicalDefaultsAdded` (up to 32 strings), `warnings` (up to 32 strings), and `recommendedSettings`. `recommendedSettings` must have the selected framing, configured quality, a `png`/`webp`/`jpeg` format, plus one exact orientation/size pair: `portrait`/`1024x1536`, `landscape`/`1536x1024`, or `square`/`1024x1024`.

### 1. Check availability — `GET /api/capabilities`

**Why it exists:** The UI must know whether it can offer generation, editing/composition, and optimization before exposing a provider action.

**Input:** No body. The server returns configured `referenceImages.available`, `editAvailable`, selected `providerId`, actual image `modelId`, supported sizes, compatibility quality, and optimizer availability/model/version.

**What it does not do:** It does not generate an image, upload an image, or make an OpenAI request.

### 2. Optimize the character direction — `POST /api/reference-images/optimize`

**Why it exists:** A raw character description is useful to the user but is not yet the precise, structured instruction needed for a consistent reference image. Optimization creates two deliberately separate prompts: the image prompt sent to the selected image provider and the compact Lucy 2.5 prompt later used for video transformation. When optimization is enabled, generation is blocked if this step fails; the app never silently falls back to the raw text.

**Required JSON input:**

```json
{
  "rawPrompt": "A complete character description, 1–4,000 trimmed characters.",
  "options": {
    "framing": "full_body",
    "orientation": "auto",
    "renderingMode": "photorealistic",
    "expression": "neutral",
    "background": "neutral_gray",
    "targetUse": "lucy_2_5_character_reference"
  },
  "generator": { "provider": "openai", "model": "gpt-image-2" }
}
```

`generator` is optional metadata. `customBackground` is required (1–200 characters) only when `background` is `plain_custom`, and prohibited otherwise. Valid framing values are `head_and_shoulders`, `waist_up`, and `full_body`; orientation values are `auto`, `portrait_9_16`, `landscape_16_9`, and `square`.

**External call made by the broker:** `OpenAI.responses.parse` with:

- `model`: `OPENAI_PROMPT_OPTIMIZER_MODEL` or `gpt-5.6`.
- `store: false`: the provider request is explicitly not stored by this API call.
- A versioned developer instruction containing the fidelity, framing, background, and output rules.
- A user message containing `JSON.stringify` of the validated input above. Raw text is therefore supplied as JSON text, not as a separately trusted instruction.
- `reasoning.effort`: configured reasoning level, default `medium`.
- `text.format`: a Zod-derived strict schema named `character_prompt_optimization`.

**Required result:** `optimizedImagePrompt`, `lucy25CharacterPrompt`, `normalizedCharacterDescription`, fact/default/warning lists, and a `recommendedSettings` object. The broker treats framing, orientation, size, and configured quality as app-owned policy: it canonicalizes those fields from the validated request even if a smaller optimizer model selects contradictory values, while preserving the model-selected supported output format. `auto` and `landscape_16_9` map to `1536x1024`; `portrait_9_16` maps to `1024x1536`; `square` maps to `1024x1024`.

**Broker response:** The result plus the optimizer `model`, configured `version`, and an `inputHash`. The hash covers the raw prompt, options, optional generator, and optimizer version. The browser must submit these values unchanged in an optimized generation request, except it may change the editable `optimizedImagePrompt` and set `manuallyEdited: true`.

### 3. Generate a new reference — `POST /api/reference-images`

**Why it exists:** This is the normal path for a new generated preview when there is no source image to preserve. The broker calls `images.generate`, validates the returned bytes, and stores a new immutable local asset.

**Required JSON input:**

```json
{
  "requestId": "UUID",
  "rawPrompt": "1–4,000 trimmed characters",
  "options": { "...": "the complete options object from optimization" },
  "optimization": {
    "enabled": true,
    "result": { "...": "the complete optimization result" },
    "model": "gpt-5.6",
    "version": "lucy-character-reference-v1",
    "inputHash": "64 lowercase hexadecimal SHA-256 characters",
    "manuallyEdited": false
  }
}
```

`generator` remains optional. Optimization may instead be `{ "enabled": false }` for the Workshop's explicit non-optimized path. In that case the broker deterministically wraps the raw prompt, selects the size from `options.orientation`, and uses JPEG. Character Builder previews always use the optimized path.

**Broker checks before OpenAI:** The optimizer model/version/hash must still be current, and the broker-produced canonical framing, orientation, size, and quality must match the request and configured quality. A stale or browser-altered contradictory result is rejected before any image call.

**OpenAI image call:** When OpenAI is selected, the broker calls `OpenAI.images.generate` with exactly:

- `model`: `OPENAI_REFERENCE_IMAGE_MODEL` or `gpt-image-2`.
- `prompt`: the optimized image prompt (or deterministic wrapper when optimization is explicitly disabled).
- `n: 1`: exactly one output.
- `size`: `1024x1024`, `1024x1536`, or `1536x1024` from the validated optimization/settings.
- `quality`: configured `high` or `medium`.
- `output_format`: the validated `png`, `webp`, or `jpeg` recommendation; JPEG is used without optimization.
- `output_compression: 90` only for JPEG or WebP.
- `background: "opaque"` and `moderation: "low"`.

The client deliberately omits `response_format` because GPT Image returns base64, and it omits `user` because the product has no account identifier to send.

**BFL image call:** When BFL is selected, the broker makes exactly one `POST https://api.us2.bfl.ai/v1/flux-2-pro` with `prompt`, exact `width`/`height`, validated `output_format`, configured `safety_tolerance`, and configured `disable_pup`. The model and reachable US2 submission cluster are pinned; arbitrary production base URLs, preview aliases, EU fallback, and automatic resubmission are rejected. This same FLUX.2 endpoint supports both text-to-image and image-guided generation: prompt-only requests omit `input_image`, while source-guided requests include the owner-scoped source as raw base64 in `input_image`. BFL may return a global, regional, legacy, or newly added cluster-specific polling host. The broker requires HTTPS on the standard port, constrains the host to BFL-owned `api[.*].bfl.ai`, rejects credentials and fragments, logs only safe polling/delivery origins for diagnostics, and then polls the exact returned URL through `Pending`, `Reasoning`, or `Generating`, as required by BFL's API contract. Nullable usage fields and a nullable non-ready `result` are accepted as published by BFL. Moderated/error/failed/unknown states become safe failures. `Ready` must contain a signed HTTPS result URL. Connection diagnostics identify whether submission, polling, or signed-result download failed without logging credentials or signed URL paths.

**Wiro image call:** When Wiro is selected, the broker signs each fixed-origin request with `HMAC-SHA256(key=WIRO_API_KEY, message=WIRO_API_SECRET + nonce)`. It submits exactly one billable Run request with `resolution: "2k"`, `maxImages: 1`, `watermark: "false"`, and aspect ratio `1:1`, `2:3`, or `3:2`. Prompt-only generation uses JSON. Source-guided editing and composition use multipart form data with one owner-scoped `inputImage`; no public temporary upload is created. The broker polls only `POST /Task/Detail`, treats interim `task_error` as a log state rather than failure, waits for `task_postprocess_end`, requires `pexit: "0"` and exactly one supported image output, and never automatically retries the Run request.

**Result handling:** OpenAI requires and strictly decodes `data[0].b64_json`. BFL and Wiro download their result with HTTPS-only, redirect, DNS/private-network, media-type, and byte limits without forwarding provider credentials. Wiro additionally verifies the documented aspect ratio and uses Sharp to normalize 2k output to exactly `1024x1024`, `1024x1536`, or `1536x1024` in the requested JPEG/PNG/WebP encoding. All paths then use the same exact-dimension and immutable-storage validation. After the Wiro local persistence attempt settles, the adapter calls the idempotent `POST /Task/InputOutputDelete` endpoint with the private task token; cleanup failure is safely logged and does not discard an already-stored local asset. Provider/model provenance is authoritative; task/request IDs and allowlisted settings/usage remain private metadata.

### 4. Upload a source image — `POST /api/reference-images/uploads`

**Why it exists:** This lets a user use their own image directly or later use it as the source for composition/editing. It is not generation and makes no external provider call.

**Required request:**

- Header `Idempotency-Key`: UUID.
- Header `Content-Type`: exactly `image/jpeg`, `image/png`, or `image/webp` (parameters are ignored).
- Body: raw `File` bytes, not JSON and not `multipart/form-data`.
- Maximum request/body size: 10 MiB; decoded image must be at most 40 megapixels.

**Result:** The broker verifies that the bytes truly match the declared supported format, writes an immutable owner-scoped local asset, and returns its metadata. Direct prompt+upload save and **Save & Use Image Only** end here; neither calls optimization nor an image provider.

### 5. Edit an existing source — `POST /api/reference-images/:sourceAssetId/edits`

**Why it exists:** Written regeneration feedback should alter an existing reference while retaining the character identity and other unchanged visual properties. The client sends only the opaque UUID path parameter; the browser does not upload the source bytes again.

**Required JSON input:** the same optimized generation fields as step 3, plus `changeInstructions` (trimmed, 1–2,000 characters). Optimization is required for edits. `sourceAssetId` must be a UUID for an asset owned by the requesting local origin.

**External call made by the broker:** OpenAI uses `OpenAI.images.edit` with the same model, one-result, size, quality, output format/compression, opaque background, and low moderation fields as generation, plus:

- `image`: server-resolved source bytes converted to an SDK file named `reference.jpg`, `.png`, or `.webp` with its stored MIME type.
- `prompt`: a provider-only instruction that tells OpenAI to preserve identity, face, anatomy, medium, framing, lighting, and background unless the change requires otherwise; it appends the optimized character prompt and the requested change.

BFL uses the same provider-only edit prompt and sends the owner-scoped source bytes as raw base64 in `input_image` on the pinned FLUX.2 Pro request. Wiro sends the source as the multipart `inputImage` field. Neither path creates a data URL or temporary public upload.

Only a SHA-256 hash of the written change is persisted. The combined provider prompt, which contains the raw change text, is deliberately not persisted.

### 6. Compose from an uploaded source — `POST /api/reference-images/:sourceAssetId/compositions`

**Why it exists:** **Generate Combined Preview** applies the current character direction to an uploaded source while preserving recognizable identity and useful source details. Blank regeneration with an uploaded source uses this route again; it does not edit from a previous generated output.

**Required JSON input:** the same optimized generation fields as step 3. `sourceAssetId` is a UUID for an owned stored upload or other owned reference. There is no `changeInstructions` field; if the user supplies written feedback, the client uses the edit route instead.

**External call made by the broker:** OpenAI uses `images.edit`, not `images.generate`; BFL uses the same FLUX.2 Pro task endpoint with `input_image`; Wiro uses the same Seedream Run endpoint with multipart `inputImage`. In every case the source is resolved server-side and the provider-only prompt asks for a polished Lucy 2.5 character reference, preservation of recognizable identity/face/body/source details, and application of the optimized direction to role, outfit, styling, expression, framing, lighting, and background. Explicit identity changes in the direction take precedence.

The validation, one-result behavior, opaque background, low moderation, response decoding, and immutable storage are identical to steps 3 and 5.

### 7. Read a stored result — `GET /api/reference-images/:assetId` and `GET /api/reference-images/:assetId/content`

**Why they exist:** Generation responses return trusted metadata, while bytes are fetched separately when the browser needs to display or attach the reference. Keeping them separate avoids placing image data in JSON and lets the browser verify the asset before changing session state.

- Metadata returns the owner-scoped asset record, including `contentUrl`.
- Content returns raw stored bytes with the stored `Content-Type`, `Content-Length`, and `X-Content-Type-Options: nosniff`.
- The browser validates the returned MIME type, byte count, dimensions, and image decodability before it attaches the reference.

## Complete flows by user action

```text
Check capabilities (local configuration only)
          |
          +-- Prompt-only save / image-only save ------------------> no image API call
          |
          +-- Upload source --> POST /uploads --> immutable local asset; no provider call
          |                         |
          |                         +-- Direct save -------------> no provider call
          |                         +-- Combined preview --------> optimize --> selected provider(source)
          |
          +-- New preview ----------> optimize --> selected provider
          |
          +-- Regenerate with source and no feedback -------------> optimize --> selected provider(source)
          |
          +-- Regenerate with written feedback -------------------> optimize --> selected provider(source, change)
                                      |
                                      v
                  strict output validation --> immutable local asset --> metadata/content read
```

1. The UI first reads capabilities. If the selected image provider is not configured, local drafting, upload, and direct save stay available while image actions are disabled. OpenAI optimization is advertised independently.
2. Any provider-backed preview obtains a current optimization result first. If image generation then fails, retrying with the same normalized raw prompt and reference options reuses that successful optimization instead of paying for another optimizer call. Changing the raw prompt or any optimization-relevant option requires a new result. Source-image identity is part of the generation request, but not the optimization cache key because source bytes are never sent to the optimizer.
3. The client assigns one UUID request ID. If the network fails after submission, retrying the exact action reuses that ID, allowing the broker to return the already-created asset rather than spend again.
4. The broker derives a local owner ID from the exact loopback host, so it can only retrieve source bytes and return assets for that owner.
5. The broker calls the selected provider operation, validates the returned bytes through the shared image gate, and stores the output immutably under `LIGHTFRAME_DATA_DIR` with provenance: actual provider/model, original/derived prompts, optimization audit, provider-aware request fingerprint, output settings, optional provider task/request ID, allowlisted provider settings/usage, and edit/composition source lineage. Wiro remote input/output files are then deleted best-effort.
6. The browser fetches the metadata and bytes from the broker, validates them again, then may attach the image and its stored Lucy 2.5 prompt to the Studio draft. No provider operation starts an AI video session or automatically changes a live session.

## Failure, privacy, and cost boundaries

- Missing selected-provider configuration returns an unavailable image capability; it does not disable local uploads, prompt-only work, or independently configured optimization.
- Authentication, moderation, rate limit, timeout, connection, malformed response, refusal, invalid image, storage, ownership, stale optimization, and request-ID conflict failures are converted to safe application errors. Previous valid previews remain intact.
- Each successful generation, composition, or edit asks the selected provider for one image and can incur provider usage. OpenAI has no SDK retry; BFL and Wiro each submit one task exactly once and retry only status polling for that same task.
- The raw recipe and selected options go to OpenAI only for explicit optimization. The selected image provider receives the optimized prompt; composition/editing additionally send server-resolved source bytes only after the explicit action.
- Upload, direct-upload save, image-only save, metadata reads, content reads, and `/api/capabilities` do not contact an image provider.
- The local broker does not return provider credentials, task/request IDs, provider-specific settings, polling/signed URLs, internal storage paths, raw provider payloads, source base64, or persisted raw edit instructions to the browser.

## Implementation sources

- Browser API client: `apps/web/src/adapters/api-client/apiClient.ts`
- Preview orchestration: `apps/web/src/features/prompt-authoring/useReferencePreviewGeneration.ts`
- HTTP validation and routes: `apps/api/src/features/reference-images/routes.ts`
- Service, idempotency, source resolution, validation, and storage: `apps/api/src/features/reference-images/reference-image-service.ts`
- Request schemas: `packages/contracts/src/reference-images.ts`
- OpenAI Responses adapter: `apps/api/src/providers/openai/character-prompt-optimizer.ts`
- OpenAI Images adapter: `apps/api/src/providers/openai/reference-image-provider.ts`
- Provider factory/interface: `apps/api/src/providers/reference-images/`
- BFL FLUX.2 Pro adapter and safe downloader: `apps/api/src/providers/bfl/`
- Wiro Seedream adapter, output normalization, safe downloader, and error mapping: `apps/api/src/providers/wiro/`
