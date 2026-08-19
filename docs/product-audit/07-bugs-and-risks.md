# Bugs and reliability risks

Split into **confirmed** (reproduced in the running product or read directly in the code) and
**suspected** (reasoned from the code, not reproduced). Identifiers prefixed `X` are new in this
audit; identifiers in brackets restate an open finding from
[`user-flows/gaps-and-usability-audit.md`](../user-flows/gaps-and-usability-audit.md).

---

## Confirmed bugs

### X1 — Thumbnail generation fails silently and can never recover (High)

**Code:** `apps/web/src/features/saved-videos/useSaveVideo.ts:48-60`

```
createSavedVideoThumbnail(media, signal)
  .then((thumbnail) => saveSavedVideoThumbnail(...))
  .catch((error: unknown) => {
    if (signal.aborted) throw error;
    return video;          // swallowed
  });
```

**Observed:** in the running application, two of seven saved videos render _"Preview unavailable"_
in the Videos library. Both are AI character-swap outputs at 1024×1920. Network shows thumbnail
requests only for the four records that have one.

**Impact:** the poster frame is the primary way a user recognises their own video. A single
transient decode failure at save time permanently removes it. There is no log, no notice, no retry
control, and no backfill path — the only route to a thumbnail is `PUT
/api/videos/:videoId/versions/:versionId/thumbnail`, which nothing calls after the initial save.

**Also:** thumbnails are rendered at 480×270 with `fit: 'cover'`, so a 9:16 source is centre-cropped
into a landscape tile (`thumbnailClient.ts:28`).

**Fix direction:** retry on failure; expose a "regenerate preview" action; add a backfill for
existing records; render at the source aspect. _(Supersedes and confirms **B7**.)_

---

### X2 — The creative library can be destroyed with no backup (High)

**Code:** `apps/api/src/app.ts` → `registerCreativeLibraryRoutes(app, dependencies.persistence?.creativeLibraries, …)`
returns immediately when the repository is undefined; `createConfiguredPersistence` supplies one
only for `postgres` and `neon`.

**Impact:** in `DATABASE_MODE=local` — which is the **default** in the Zod schema and in
`.env.example` — Characters, Outfits, Wardrobe variants and saved prompts exist only in this
browser's IndexedDB. Clearing site data, switching browsers or using a private window loses all of
them. There is no export, no import, no backup and no warning anywhere in the UI. The reference
images those records point at cost real provider money to generate, and in cloud mode
`purgeExpiredUnreferenced` reclaims images the library no longer references.

**Fix direction:** export/import of the creative store as a file; a durability statement on the
Assets hub; consider making the local-mode store the thing that is backed up rather than the thing
that is assumed.

---

### X3 — Provider content filtering is disabled, with the repository's own release TODO open (High, release gate)

**Code:** `apps/api/src/providers/pruna/video-replace-provider.ts:239`

```
//TODO Before making project public, change to false and make configured for local development by environment variable
disable_safety_checker: true,
```

`REFERENCE_IMAGE_PROVIDER=wiro` with `WIRO_REFERENCE_IMAGE_MODEL=seedream-v5-lite-uncensored` is the
configured default in the development environment.

**Impact:** none on a loopback single-operator tool where this is an explicit choice. It is an
unclosed gate for any distribution, and the change is small — one environment variable, one default.

---

### X4 — No navigation item is active while in Studio (Low)

**Code:** `ShellChrome.tsx` computes `activeDestination` and falls through to `'studio'`;
`StudioHeader.tsx:333` applies `aria-current="page"` only when it matches one of `dashboard`,
`projects`, `campaigns`, `assets`.

**Impact:** on the product's most-used surface the rail shows nothing selected. Minor
disorientation, and an accessibility gap for screen-reader users navigating by landmark.
_(Restates **N6**.)_

---

### X5 — `/studio/{videoId}` is outside the exit guard and unreachable from the UI (Low)

**Code:** `StudioExitGuard.tsx:41-45` — `studioWorkspaceKeyFromPath` returns `null` for
`/studio/{videoId}`, so navigation away is never blocked. `studioVideoPath()` is exported and
unit-tested but has no application caller.

**Impact:** a bookmarked or hand-typed URL loads a Saved Video into review with no protection for
in-memory edits. Low reachability, real consequence. _(Restates **B4** / **R6**.)_

---

### X6 — Lists report "N loaded", never a total (Low)

**Code:** `ProjectRouteSurface.tsx` renders `{projects.length} loaded`; the list contracts
(`packages/contracts/src/projects.ts:495`, `633`, `695`) carry `cursor` and `pageSize` and no total.

**Impact:** "1 loaded" is not a fact the user can act on. There is no way to know how many Projects
exist. _(Restates **N11**.)_

---

### X7 — Project Save has no Download (Medium)

**Code:** `ProjectOutputSaveSection.tsx` — no download link; `ProjectHistorySection.tsx:291` has one.

**Impact:** the operator saves a Project output and must navigate to History or Assets to get the
file, immediately after the moment they most want it. Studio's standalone save path has
`SavedVideoSuccessActions` with Download; the Project path does not. _(Restates **M2**.)_

---

### X8 — Saved Videos inherit a default title that produces duplicates (Low)

**Observed:** two of four Dashboard recent items are titled "Untitled Project"; the Videos library
shows the same. `ProjectOutputSaveSection` seeds the title from `current.project.title`.

**Impact:** the library fills with identically-named records that cannot be told apart without
opening them — and, given X1, sometimes without a thumbnail either.

---

## Suspected risks — reasoned, not reproduced

### Y1 — Full-video buffering will feel like a hang on large sources (High)

`useProjectSourceController.ts:176` reads the whole source through `readBoundedBlob` before the
workspace becomes usable. Bounded at 300 MB. The content route already supports HTTP ranges
(`sendRangedAsset`), so the capability to stream exists and is unused. Needs measurement with a
large file over R2 to confirm the felt cost.

### Y2 — Dashboard "Continue Work" assumes list ordering (Low)

`continueProject = projects[0]` relies on the list being ordered by recency. The API's ordering
guarantee was not verified. _(Restates **B9**.)_

### Y3 — Creative-library sync resolution is destructive by design (Medium)

`useCreativeLibraryCloudSync` exposes only whole-store `keep-local` / `keep-cloud`. The reasoning is
sound — the contract is a full-store `PUT` with no per-record identity, so a merge would be invented
semantics — but the outcome is that a divergence between two browsers always destroys one side's
work. Confirmed behaviour; the risk is how often it happens in practice, which is unmeasured.

### Y4 — Mobile Safari is the least-verified surface (Medium)

[`BROWSER_SUPPORT.md`](../BROWSER_SUPPORT.md) states plainly that the automated matrix is
Chromium-only and does not validate Safari, touch hardware, safe areas or the software keyboard.
For a product whose camera input is most naturally a phone, this is the largest untested area.

### Y5 — Video editor keyboard reachability (Low)

Crop handles are drag-driven (`onCropStart` / `onCropChange` / `onCropCommit`). Whether crop is
completable by keyboard alone was not verified.

### Y6 — Detached `AbortController` listener on aborted saved-video loads (Observation)

_(Restates **B10**.)_ Bounded and unlikely to matter.

---

## Things that are correct and worth not breaking

Recorded so future work does not "simplify" them away:

- `expectedVersion`, `expectedRevisionNumber` and `Idempotency-Key` on Project and Campaign
  mutations.
- The pending-output receipt written to storage _before_ the request in
  `projectOutputOperationStorage.ts`.
- `location.key` in effect guard keys — the persistent shell makes arrival a new history entry, not
  a remount.
- The `?task=` query parameter rather than a path segment, which keeps `StudioExitGuard` from
  reading a tab change as leaving.
- Media ownership transfer that commits a replacement before revoking the superseded object URL.
- The absence of automatic paid retry.
