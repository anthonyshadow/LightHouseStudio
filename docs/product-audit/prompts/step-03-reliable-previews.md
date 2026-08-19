## Implementation Prompt — Step 3: Give every saved video a reliable preview

### Objective

Make the poster frame on a Saved Video reliable: retry generation on failure, let the operator repair
a record that has none, backfill nothing silently, and stop centre-cropping portrait video into
landscape tiles.

### Context

Lightframe Studio is a local-first, single-operator browser video studio (React 19 + Vite front end,
Bun + Elysia API). Saved Videos are server-side records with immutable Versions.

Thumbnails are generated **once, client-side, at save time**:

- `apps/web/src/features/saved-videos/thumbnailClient.ts` decodes a frame with `mediabunny` into a
  480×270 canvas with `fit: 'cover'` and encodes WebP.
- `apps/web/src/features/saved-videos/useSaveVideo.ts` calls it from `saveThumbnailWhenAvailable`,
  whose failure path is `.catch(() => video)` — swallowed, unlogged, never retried.
- The server accepts a thumbnail at `PUT /api/videos/:videoId/versions/:versionId/thumbnail` and
  serves it at `GET /api/videos/:videoId/thumbnail`. Nothing calls the `PUT` after the initial save.

In the running application this produces visible failures: saved videos render _"Preview
unavailable"_ permanently, with no way to fix them. Portrait (9:16) videos that do get a thumbnail
are centre-cropped into a landscape tile.

### User Problem

The poster frame is how an operator recognises their own work. One transient decode failure removes
it forever, and there is no action that restores it.

### Required Behavior

- A transient failure during save-time generation is retried at least once before giving up.
- Saving still succeeds when a thumbnail genuinely cannot be produced — a preview is never a
  precondition for saving.
- A Saved Video without a thumbnail offers an explicit action that generates and uploads one.
- Thumbnails preserve the source aspect ratio.
- A record without a preview looks deliberate, not broken.

### Existing Areas to Inspect

- `apps/web/src/features/saved-videos/thumbnailClient.ts` — `createSavedVideoThumbnail`, `CanvasSink`
  sizing and `fit`
- `apps/web/src/features/saved-videos/useSaveVideo.ts` — `saveThumbnailWhenAvailable` and both call
  sites
- `apps/web/src/adapters/api-client/savedVideosApi.ts` — `saveSavedVideoThumbnail`,
  `savedVideoThumbnailUrl`, `savedVideoContentUrl`
- `apps/web/src/adapters/api-client/readBoundedBlob.ts` — the bounded streaming reader used for all
  media reads
- `apps/web/src/features/video-gallery/VideoGallery.tsx` — where `thumbnailAvailable` is rendered and
  where the "Preview unavailable" state appears
- `apps/web/src/features/projects/ProjectAssetThumbnail.tsx` — the existing poster tile with icon
  fallback and broken-image recovery
- `apps/api/src/features/saved-videos/routes.ts` — the thumbnail `PUT` and `GET`, and
  `THUMBNAIL_UPLOAD_MAX_BYTES`
- `packages/contracts/src/saved-videos.ts` — `thumbnailAvailable` on the summary and detail schemas

### Scope

- Bounded retry inside `saveThumbnailWhenAvailable`.
- Aspect-preserving thumbnail dimensions in `thumbnailClient.ts`.
- A "Generate preview" action on Saved Video records that have none, in the Videos library, which
  fetches the version content through the bounded reader, generates a thumbnail and `PUT`s it.
- A deliberate no-preview card state shared with the repair action.

### Out of Scope

- Server-side thumbnail generation.
- Animated previews or scrubbing.
- Changing the stored image format or the upload endpoint.
- A bulk/automatic backfill that runs without the operator asking.
- Any change to the save contract, versioning or idempotency.

### UX Requirements

- A card without a preview must read as "no preview yet", not as a broken image, and must offer the
  repair action inline.
- Show progress while generating; the action must be disabled while in flight.
- Announce success and failure through a polite live region; failures use `StatusNotice` with
  `role="alert"` and a real message and a retry.
- Preserve the existing card layout, keyboard order and the 200 %-text reflow behaviour that
  `e2e/accessibility-responsive.spec.ts` guards.

### Technical Requirements

- Generation stays client-side. At save time the source blob is already in memory; do not re-fetch it.
- The repair action must read version content through `readBoundedBlob` with the existing caps
  (`VIDEO_RESULT_MAX_BYTES`), not a raw `fetch`.
- Retry must be bounded and must not retry on an aborted signal.
- Respect `THUMBNAIL_UPLOAD_MAX_BYTES` (5 MB) — an aspect-preserving thumbnail must still encode
  within it.
- Invalidate the saved-video queries after a successful upload so `thumbnailAvailable` refreshes;
  reuse `savedVideoQueryKeys`.
- No new endpoint. No new polling. No per-row request when the library lists.

### Acceptance Criteria

1. A transient generation failure at save time is retried; a persistent failure still lets the save
   succeed.
2. A Saved Video with no thumbnail shows a deliberate no-preview state and a working
   "Generate preview" action.
3. After a successful repair, the poster appears without a manual page reload.
4. A 9:16 source produces a portrait thumbnail rather than a centre-cropped landscape tile.
5. A failed repair shows an actionable error and leaves the record unchanged.
6. Listing the library issues no additional per-row request.

### Regression Protection

- `apps/web/src/features/saved-videos/useSaveVideo.test.ts` asserts thumbnail call counts — update it
  deliberately for the retry, and confirm the "save succeeds without a thumbnail" case still holds.
- Do not change `thumbnailAvailable` semantics in the contracts.
- Do not alter the direct-multipart-upload save path's behaviour beyond the shared thumbnail helper.
- Verify visual baselines that include gallery cards.

### Validation

```bash
npx vitest run apps/web/src/features/saved-videos apps/web/src/features/video-gallery apps/api/src/features/saved-videos
```

Then, if gallery visuals changed:

```bash
npx playwright test --config playwright.visual.config.ts
```

### Completion Report

Report the retry policy, the new thumbnail sizing rule and why it stays within the upload cap, where
the repair action lives, the query invalidation used, tests added or updated, and confirmation that
saving still succeeds when no thumbnail can be produced.

### Working rules

Audit the affected area before changing it. Understand current behaviour from the code, not from
comments or documents. Reuse `readBoundedBlob`, `savedVideoQueryKeys` and the existing UI primitives.
Make no unrelated changes and remove no existing functionality. Do not guess. Maintain responsive
behaviour, accessibility and performance — no new per-row requests. Update affected documentation and
run `bun run check:docs` if you touched any. Run only the checks above. Report exactly what changed.
