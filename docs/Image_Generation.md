# Character reference API

## Current boundary

The browser never calls an image provider or receives provider credentials. It uses the loopback,
same-origin Fastify broker. `REFERENCE_IMAGE_PROVIDER` selects exactly one image provider at
startup (`openai`, `bfl`, or `wiro`); there is no browser selector or provider fallback.
Pruna Wardrobe try-on is a separate optional binding used only by **Add Outfit**; it does not
change the startup-selected reference-image provider or **Change Features**.

OpenAI prompt optimization is a separate, optional operation. Uploading or directly saving an
image is local storage work and does not contact the optimizer or an image provider.

## Routes

| Route                                                      | Purpose and provider contact                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/capabilities`                                    | Reports configured provider/model/optimizer availability; never probes a provider |
| `POST /api/reference-images/optimize`                      | Sends the validated character direction/options to OpenAI Responses               |
| `POST /api/reference-images`                               | Generates one new reference with the selected image provider                      |
| `POST /api/reference-images/uploads`                       | Stores validated raw image bytes locally; no provider contact                     |
| `POST /api/reference-images/:sourceAssetId/compositions`   | Applies the direction to an owner-scoped source                                   |
| `POST /api/reference-images/:sourceAssetId/edits`          | Applies written changes to an owner-scoped source                                 |
| `POST /api/reference-images/:sourceAssetId/outfit-try-ons` | Applies one owner-scoped garment through explicit Pruna Wardrobe generation       |
| `GET /api/reference-images/:assetId`                       | Returns owner-scoped metadata                                                     |
| `GET /api/reference-images/:assetId/content`               | Returns validated stored bytes with the stored MIME type                          |

The strict request/response schemas in
[`packages/contracts/src/reference-images.ts`](../packages/contracts/src/reference-images.ts) are
the payload authority. Important invariants:

- mutating routes require an exact loopback Origin/Host match;
- generation/edit/composition use a browser UUID plus a complete-request fingerprint for
  retry-safe idempotency;
- upload uses a UUID `Idempotency-Key`, raw JPEG/PNG/WebP bytes, a 10 MiB body limit, and a
  40-megapixel decoded-image limit;
- source IDs are opaque UUIDs; the server resolves bytes only for the current local owner; and
- generated output must decode to one advertised exact size: `1024x1024`, `1024x1536`, or
  `1536x1024`; Pruna-derived outfit results instead preserve validated flexible dimensions and
  record exact source/garment lineage.

The try-on route additionally requires `X-Lightframe-Provider-Intent: wardrobe`, a browser UUID,
and one garment asset ID. Identical in-flight request IDs coalesce; conflicting request reuse is
rejected. The adapter performs exactly one initial `p-image-try-on` prediction with
`person_image`, one `garment_images` entry, `turbo: false`, JPEG quality 95, and input-size
preservation. It never retries that billable submission or falls back.

## Browser flow

1. Read capabilities. This proves configuration presence only, not reachability, entitlement,
   policy, quota, or billing.
2. For a provider-backed preview, attempt optimization when configured.
3. If optimization succeeds, submit the broker-produced result and hash unchanged. An unchanged
   image retry reuses that in-memory result.
4. If optimization is unavailable or the ordinary attempt fails, submit the explicit
   `{ "enabled": false }` branch. The same startup-selected image provider receives the validated
   raw direction; the stored result is marked unoptimized and the UI offers
   **Retry optimization and regenerate**.
5. That explicit optimizer retry does not fall back again: another optimizer failure preserves the
   valid raw preview without making a new image request.
6. The broker validates the result, stores one immutable owner-scoped asset under
   `LIGHTFRAME_DATA_DIR`, and returns metadata. The browser separately fetches and validates bytes
   before attaching them to a character/session.

With an uploaded source, blank regeneration composes from that source again. Written feedback uses
the edit route and creates a new immutable child. Neither path mutates or deletes the source.

Wardrobe **Change Features** sends the requested change as the highest-priority edit instruction.
The provider is told to apply every requested change and make an unspecified-strength change
strong, obvious, and realistic. The request overrides conflicting source or parent-prompt traits,
while non-conflicting identity, pose, outfit, framing, lighting, background, and style remain
stable. Original-source edits include the parent character direction as lower-priority context;
variant-source edits use only the selected image and requested change.

## Provider configurations

| Operation    | Current configuration                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Optimizer    | OpenAI Responses, default `gpt-5.6`, `medium`, `store: false`, 120-second timeout                                                          |
| OpenAI image | `gpt-image-2`, default `high`, one result, 150-second timeout, zero SDK retries                                                            |
| BFL image    | Pinned `flux-2-pro` US2 submission; default safety tolerance `2`, prompt upsampling disabled, one 150-second submit/poll/download deadline |
| Wiro image   | Pinned `seedream-v5-lite-uncensored`, one 2k result, watermark off, one 180-second deadline; operator qualification only                   |

BFL sends an owner-scoped source as base64 in `input_image`. Wiro uses one multipart
`inputImage`, normalizes the result to the exact app dimensions, and attempts
`InputOutputDelete` after local persistence settles (or after a failed accepted task). Cleanup
failure is a safe operational warning; it does not discard a valid local asset.

OpenAI has no SDK retry. BFL and Wiro submit the initial billable task once; bounded polling or
download retries continue only for that task. A failed provider never triggers another provider.

## Privacy, retention, and failure

- Upload/direct save, capabilities, metadata, and content reads make no external image request.
- Optimization sends the raw direction and selected reference options to OpenAI.
- Generation sends the optimized prompt, or raw prompt after the explicit fallback, to the
  startup-selected image provider. Composition/editing also sends the resolved source bytes.
- Stored metadata includes prompts needed for review/use, safe provenance, settings, hashes,
  lineage, and idempotency data. Raw edit instructions are stored only as a hash.
- Credentials, internal paths/keys, task tokens, signed/polling URLs, source base64, raw provider
  payloads, and unsafe provider errors are not returned to the browser.
- Missing configuration or any provider/storage/validation failure preserves the previous valid
  preview and local upload/text-only alternatives.
- Pruna person/garment uploads and delivery are provider-temporary. Local abort stops polling only;
  no provider cancellation or deletion operation is claimed.

See [privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md) for lifetime and deletion rules and
[live provider smoke](LIVE_PROVIDER_SMOKE.md) for cost-bearing qualification.

## Implementation map

- Contracts: `packages/contracts/src/reference-images.ts`
- Browser orchestration: `apps/web/src/features/character-builder/useReferencePreviewGeneration.ts`
- Routes/service/store: `apps/api/src/features/reference-images/`
- Provider selection: `apps/api/src/providers/reference-images/provider-factory.ts`
- Adapters: `apps/api/src/providers/openai/`, `apps/api/src/providers/bfl/`,
  `apps/api/src/providers/wiro/`, `apps/api/src/providers/pruna/`
