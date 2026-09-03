# Phase 1 verification — coherence and trust

**Document type:** acceptance record for [roadmap](../roadmap/PRODUCT_ROADMAP.md) Phase 1,
executed 2026-09-02 as implementation prompt 12. It records what was verified, how, and what was
seen — against the running development product (PostgreSQL + R2, `mediaPersistence: account`) and
the automated gates. Finding IDs refer to the [current-state audit](CURRENT_STATE_AUDIT.md).

**Verdict: Phase 1 accepted.** All seven acceptance criteria (audit §4 items 1–4 and 8–10) are
demonstrably closed. Six deprecated-name stragglers were fixed in this pass; two observations are
filed as follow-ups. No copy contradicts deployment behaviour in either storage mode.

## The seven criteria

| #   | Audit item                                       | Closed by | Evidence                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The manual editor is an annex of an AI wizard    | 1.1       | Live: the Project workspace rail and the Create card both read **Edit video**; zero "Adjust video" and zero "Use existing video" strings on the Create task; the Studio entry names it once. Launching from the rail opens the editor directly on the current cut (`app-routing.spec.ts` "adopts a local render" journey, passing).                                                                               |
| 2   | A fresh standalone take cannot reach the editor  | 1.1       | `existing-video.spec.ts` "a fresh take reaches Edit video without a save-and-reload detour" — passing; `useStudioRecordingLaunch` and `StudioApp` tests assert adoption.                                                                                                                                                                                                                                          |
| 3   | The finished deliverable is invisible            | 1.2       | Live: the overview of a Project with a saved output shows **Saved output** — title, Version 1, **Widescreen** placement chip, 1920×1080, date, the superseded note, **Download** (the Project's output route) and **View in Assets**. The gallery export panel opens on the recorded placement (`VideoGallery.test.tsx`).                                                                                         |
| 4   | Voice is a configurable dead end inside Projects | 1.4       | Live: on the Create task the voice control is disabled with its reason stated — "Voice is not available inside a Project yet. Choosing one would stop Character Swap and Virtual Try-On from starting." (`title` and accessible description).                                                                                                                                                                     |
| 8   | Small silent dead ends                           | 1.3, 1.4  | Live: `/definitely/not/a/route` renders **That page doesn't exist** at the typed address with a Dashboard link. `/studio/<uuid>` is inside the exit guard (`StudioExitGuard` tests) and Back cannot silently drop a take (`app-routing.spec.ts`). The unload guard for an unsaved server-approved result has its workflow test. "Release" appears on no take control; "Remove original video" says what it does.  |
| 9   | Trust bugs in copy and labels                    | 1.3       | Live, R2 mode: the remove dialog reads "Removes this video from Assets and deletes its stored file… unless another saved video or a Project's history still uses it" — matching `removalDeletesStoredMedia: true`; local mode's branch says the file stays. Gallery cards label **Virtual Try-On** results as such. Server posters are aspect-preserving (sharp-path unit test). No UUID captions on asset cards. |
| 10  | First-touch identity mismatch                    | 1.5       | Live: eyebrow "Local-first video studio"; tagline "Turn your footage into finished, platform-ready video."; four capabilities in the order bring in → edit on-device → save per placement → optionally AI; `<meta name="description">` says the same. The compact bar carries Dashboard · Studio · Projects · **Assets**; the rail keeps all five.                                                                |

Slices 1.6 (documentation canon) and 1.7 (engineering hygiene) are not acceptance criteria but are
complete: the [pruning manifest](DOCUMENTATION_PRUNING_REPORT.md) is executed and verified, and the
hygiene bundle landed with its adversarial review settled.

## Gates run

| Check                                                                                                                | Result                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run quality` (types, lint, format, dead code, modules, docs, retired words, Vitest, builds, budgets, Storybook) | green — 2134 tests passed / 9 skipped; shell closure 726,611 / 728,000 bytes                                                                                                                                           |
| Curated visual regression (`bun run test:visual`)                                                                    | 50 passed                                                                                                                                                                                                              |
| Targeted journeys: `app-routing`, `existing-video`, `accessibility-responsive`, `local-first-preparation`            | 51 passed against the running stack                                                                                                                                                                                    |
| Full functional suite against a postgres + local-storage stack (the CI shape)                                        | 85 passed plus the real-stack journey (`real-stack-project-deliverable.spec.ts`)                                                                                                                                       |
| Deprecated-name sweep (`docs/product/DOMAIN_MODEL.md` list) over user-facing strings                                 | six stragglers, all in the creative-library surfaces, fixed here; "Recipe", "Deliverable", "Release", provider-as-choice: none                                                                                         |
| Copy versus mode (`local` / `postgres`+R2)                                                                           | remove dialog, stage privacy line and account-sync summaries are capability-driven; reference-image copy ("your local data directory") is true in every mode because `LocalReferenceImageAssetStore` is the only store |

Vitest and Playwright were run sequentially throughout, per [TESTING.md](../TESTING.md).

## Fixed in this pass (trivial copy misses only)

- "Library data" → **Library backup** (management menu title and close label);
  "…replace the current account library…" → "…replace it from a Lightframe file".
- "Replace your account creative library?" → **Replace your Library?**; "Keep account library" →
  **Keep current Library**.
- Sync-recovery confirmations: "Save this session's Library to your account?" and "Reload the
  account copy of your Library?".
- "Checking your account library…" → **Checking your Library…**.
- One flow-doc sentence still said "account library sync".

## Observations filed, then closed (2026-09-02)

Both were followed up immediately after this record was first written, and both turned out to be
mis-stated here. What they actually were:

1. **A Project's deliverable never had a poster at all — and the card lied about why.** Filed as
   "posters absent on older saved Videos… an honest fallback", implying a legacy backfill. Neither
   half held. `ProjectOutputSaveSection` never generated a poster, while the Studio save path
   (`useSaveVideo.ts`) always had, so _every_ Video a Project produced was missing one, then and
   in future — not a backfill, an ongoing gap. And the fallback was not honest: the deliverable
   card asked for a poster unconditionally and read the resulting 404 as a failed load, so it said
   "Preview didn't load" about a Version that never had one. Fixed at both altitudes: the output
   save now generates the poster from the stored Version over byte ranges — after the save is
   reported, never blocking it, failure leaving the existing repair path intact — and
   `projectOutputHistoryItemSchema` carries `thumbnailAvailable` so the card can say "No preview
   yet" when that is the truth. Videos saved before this still need one **Generate preview** press.
2. **D13 was already marked decided**, in commit `59ca11dd` (slice 1.5), before this record claimed
   otherwise. No change was needed; the claim was simply wrong.
