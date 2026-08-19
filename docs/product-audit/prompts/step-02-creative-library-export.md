## Implementation Prompt — Step 2: Give the creative library an export, and state its durability honestly

### Objective

Let the operator export their Characters, Outfits, Wardrobe variants and saved prompts to a file and
import them back, and tell them plainly where that library is actually stored.

### Context

Lightframe Studio is a local-first, single-operator browser video studio (Bun workspace, React 19 +
Vite + Emotion front end, Bun + Elysia API).

The reusable creative library — saved character prompts, character variants, saved prompts/outfits
and recent prompts — lives in the **browser**, in IndexedDB, behind
`apps/web/src/features/creative-assets/repository.ts` and `indexedDbPersistence.ts`.

It is mirrored to the server **only** when `DATABASE_MODE` is `postgres` or `neon`:
`registerCreativeLibraryRoutes` in `apps/api/src/app.ts` returns immediately when no
`CreativeLibraryRepository` is supplied, and `createConfiguredPersistence` supplies one only for
those two modes. **`DATABASE_MODE` defaults to `local`.**

So on the default configuration there is no server copy, no export, no backup and no warning.
Clearing site data destroys every Character and Outfit — including the reference images they point
at, which cost real provider money to generate.

### User Problem

Work that took real effort and real spend can vanish silently, and the operator has no way to save
it or move it to another browser.

### Required Behavior

- The operator can export the entire creative store to a single file.
- The operator can import such a file, replacing the current store, after an explicit confirmation
  that states what will be lost.
- A malformed or lossy file is refused with a clear, non-technical message.
- The Characters and Outfits surfaces state where the library is stored in the current
  configuration.

### Existing Areas to Inspect

- `apps/web/src/features/creative-assets/repository.ts` — `CreativeAssetRepository`, its state
  shape, and `replaceFromRemote`
- `apps/web/src/features/creative-assets/indexedDbPersistence.ts` and `creativeAssetPersistence.ts`
- `apps/web/src/features/creative-assets/useCreativeLibraryCloudSync.ts` — how a whole-store replace
  is already performed and confirmed
- `apps/web/src/features/creative-assets/CreativeLibrarySyncNotice.tsx` — the existing destructive
  confirmation copy and pattern
- `packages/domain/src/assets/sanitize.ts` — `sanitizeCreativeAssetStore` and
  `parseCreativeAssetStore`
- `apps/api/src/features/creative-libraries/routes.ts` — how the server validates an incoming store
  (reject when `recovered` or `droppedRecords > 0`)
- `apps/web/src/features/account-library/SavedCreativeLibrary.tsx` — the Characters/Outfits library UI
- `apps/web/src/features/assets/AssetsRouteSurface.tsx` — the hub cards
- `apps/web/src/ui/primitives` — `Button`, `OverlayPanel`, `ConfirmationDialog`, `StatusNotice`
- `docs/PRIVACY_AND_TEMPORARY_DATA.md` and `docs/user-flows/assets-and-libraries.md`

### Scope

- Export: serialize the current creative store to a downloadable file, including a schema version
  and the reference-image asset ids the records depend on.
- Import: read the file, validate it through the same sanitization the server uses, confirm
  destructively, then replace the store through the existing repository.
- Place both actions where the libraries are managed (the Characters and Outfits library surface, or
  the Assets hub — pick one and be consistent).
- Add a short, accurate durability line to the Characters and Outfits presentation.
- Update the assets/libraries user-flow document and the privacy document.

### Out of Scope

- Exporting reference-image **bytes** — export the ids and say plainly that images are not included.
- Changing the cloud sync model, its conflict resolution, or the `PUT /api/creative-library`
  contract.
- Merge semantics of any kind. Import replaces.
- Automatic or scheduled backup.
- Any change to Videos or Voices.

### UX Requirements

- Export is non-destructive and should complete without a dialog.
- Import is destructive and must go through `ConfirmationDialog`, with copy as direct as the
  existing `KEEP_LOCAL` / `KEEP_CLOUD` messages in `CreativeLibrarySyncNotice.tsx`.
- State explicitly what the file contains and what it does not (no image bytes).
- Announce success and failure through a polite live region; render failures as `StatusNotice` with
  `role="alert"` and a real message.
- Never use `window.confirm`.
- The durability line must be accurate for the current mode — do not claim a cloud copy exists when
  the routes are not registered.

### Technical Requirements

- Reuse `sanitizeCreativeAssetStore` for both export and import. Do not write a second serialization
  or validation path.
- Refuse an import whose sanitization reports `recovered` or `droppedRecords > 0`, matching the
  server's rule exactly.
- Replace through the existing repository API so subscribers and the cloud sync observe the change
  normally.
- Include a schema version in the file, and refuse an unknown one with a clear message rather than
  attempting a migration.
- Bound the accepted file size before parsing.
- Do not add a new API endpoint. This is a browser-local capability.
- After an import, the cloud sync (when active) must behave normally — verify it does not fail
  closed unexpectedly.

### Acceptance Criteria

1. Export produces a file containing every saved character, character variant, saved prompt/outfit
   and recent prompt currently in the store.
2. Importing that file into an empty store restores all of them.
3. Importing a malformed, oversized or unknown-version file is refused with a clear message and
   leaves the existing store untouched.
4. Import is confirmed before it replaces anything, and the confirmation says what will be lost.
5. The Characters and Outfits surfaces state where the library is stored in the current
   configuration, and that exported files do not contain image bytes.
6. With cloud sync active, an import does not leave sync permanently paused.

### Regression Protection

- Existing creative-asset repository, persistence and cloud-sync tests must still pass.
- Do not change record shapes, ids, or the `updatedAt` semantics that revision tracking depends on.
- Do not change the reference-image lifecycle — importing must not orphan or resurrect image assets
  beyond what the existing repository already does.

### Validation

```bash
npx vitest run apps/web/src/features/creative-assets apps/web/src/features/account-library apps/web/src/features/assets packages/domain/src/assets && bun run check:docs
```

### Completion Report

Report the file format and schema version, where the actions were placed, the validation rules
applied on import, the durability copy added and where, the documents updated, and the tests added.
State explicitly what the export does not contain.

### Working rules

Audit the affected area before changing it. Understand current behaviour from the code, not from
comments or documents. Confirm the dependencies above exist. Reuse the existing repository,
sanitization and dialog primitives rather than creating new ones. Make no unrelated changes and
remove no existing functionality. Do not guess — if something cannot be determined, say so and stop.
Maintain responsive behaviour and accessibility. Update the documentation this change affects and run
`bun run check:docs`. Run only the checks above. Report exactly what changed when finished.
