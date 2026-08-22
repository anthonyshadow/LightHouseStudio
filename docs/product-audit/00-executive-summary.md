# Executive summary

> **Status (2026-08-21).** This audit is a point-in-time assessment; the fifteen-step roadmap it
> produced has since been implemented in full — see
> [`10-implementation-roadmap.md`](10-implementation-roadmap.md) for the step-to-commit table. The
> findings below describe the product **as audited**, not as it now stands. Where the two disagree,
> the code wins.

## 1. What is the product currently?

Lightframe Studio is a **single-operator, loopback-only browser video studio for AI-assisted
marketing video**. One authenticated person records or uploads a video, optionally applies an AI
character swap or virtual try-on, optionally replaces the voice, trims and colour-corrects it
locally, saves it as a versioned Video, and downloads the file.

Around that core sit three organizing layers: **Campaigns** (optional grouping),
**Projects** (one resumable video workflow with immutable revisions), and **Assets** (Videos,
Characters, Outfits, Voices).

Three constraints define the product more than any feature does:

- **It cannot be reached from another machine.** `installLocalSecurityBoundary` rejects every
  non-loopback `Host` header with `421`, unconditionally, in every configuration
  (`apps/api/src/http/security.ts`). This is deliberate and documented in
  [`deferred-account-and-infrastructure-roadmap.md`](../deferred-account-and-infrastructure-roadmap.md).
- **There is exactly one user.** A seeded demo account, no signup, no roles, no sharing.
- **There is no publishing.** `Download` is the only way work leaves the product. Searching
  `apps/web/src` for share/publish surfaces returns nothing.

So the correct question is not "is this ready for customers" — it is not intended to be yet. It is
**"is this a tool its operator can use quickly and confidently to make marketing videos?"** That is
what this audit measures.

## 2. What does it do well?

- **Engineering rigour that is genuinely rare.** Optimistic concurrency on every Project and
  Campaign mutation, idempotency receipts that survive a reload mid-save, fail-closed provider
  cost warnings, an exit guard that refuses to lose in-memory work, streamed and byte-bounded media
  reads, and a route inventory oracle that fails when routes drift.
- **Honest cost and capability handling.** No automatic paid retry, no silent resubmission, explicit
  reconciliation when acceptance is unknown, and capability-gated UI driven by `/api/capabilities`
  rather than optimism.
- **A real, working AI pipeline.** Character swap and virtual try-on run end to end through Decart,
  Pruna, BFL, Wiro, OpenAI and ElevenLabs, with normalized errors and bounded job concurrency.
- **A genuinely local video editor.** Trim, crop, rotate, lighting and filters render in a
  `WebCodecs` worker to MP4 without a server round-trip.
- **Test and documentation discipline.** 244 test files against 524 source files, 83.8 % line
  coverage, a documentation link checker, a dead-code gate (currently clean), and a visual matrix
  across five viewports.

## 3. The five biggest weaknesses

1. **The interface is the domain model.** "Revision 5", "immutable Video Version", "working media",
   "presented media", "Project provenance", and a library banner that opens with _"These legacy or
   independently saved videos have no trustworthy producing Project"_ are all shown verbatim to the
   operator. The product asks its user to learn its internals before making anything.
2. **A video product with almost no video in it.** The Projects list, the Campaigns list, the
   Dashboard's recent work and the Assets hub are all text rows. Thumbnails exist only inside the
   Videos overlay and the Project Assets strip — and there, two of seven saved videos currently show
   _"Preview unavailable"_ because thumbnail generation failed silently and never retries.
3. **Nothing can be found.** There is no text search for Videos, Projects or Campaigns anywhere in
   the product — the contracts do not even carry a search parameter. Lists say "1 loaded", never a
   total. Past roughly one page, the only retrieval strategy is scrolling.
4. **The deliverable is unfinished.** Output is one MP4 in the source aspect ratio. There are no
   channel presets, no 1:1 or 4:5, no per-placement variants. `ProjectExportSpecification` — with
   `aspect: 'source' | '16:9' | '9:16' | '1:1' | '4:5'`, resolution and `includeAudio` — is fully
   modelled in `packages/domain/src/projects/types.ts` and **written by nothing but tests**.
   For a product whose stated purpose is marketing assets, the last mile does not exist.
5. **The reusable creative library is the least durable thing in the product.** In the default
   `DATABASE_MODE=local`, Characters, Outfits and prompts live only in this browser's IndexedDB.
   The creative-library routes are not even registered in that mode. There is no export, no backup,
   and no warning. Clearing site data destroys work that cost real provider money to generate.

## 4. The five biggest opportunities

1. **Channel-aware export.** Implement the export specification that already exists in the domain.
   One source, four ready placements. This is the single largest jump in delivered value.
2. **Variants without repetition.** Duplicating a Project, or re-running one with a different
   character/outfit/voice, is the core loop of marketing production and currently requires redoing
   every step by hand.
3. **A visual product.** Thumbnails on every card, every list, every empty state. Low effort,
   transforms perceived quality.
4. **Search and retrieval.** Cheap to add — one query parameter and one input per surface — and it
   converts the libraries from write-only into usable.
5. **A create surface that starts creating.** Today `/studio/create` spends roughly a third of the
   desktop width on camera-device configuration copy before the operator has any media.

## 5. What creates the most user friction today?

In order: **conceptual load** (the domain vocabulary), **retrieval** (no search, no thumbnails,
no totals), and **repetition** (no variants, no presets, no templates). None of these are
correctness problems. All three are the product asking the user to do work the product should do.

## 6. What creates the most technical risk?

1. **Browser-only creative library with no export** — the only unbounded data-loss path.
2. **`disable_safety_checker: true`** in `apps/api/src/providers/pruna/video-replace-provider.ts:239`,
   carrying the repository's own `//TODO Before making project public, change to false`. Combined
   with a configured `seedream-v5-lite-uncensored` reference-image model, this is a release gate
   that is one environment variable away from being closed.
3. **Full-video buffering.** Opening a Project with a source downloads the entire video — up to
   300 MB — into a browser `Blob` before the workspace is usable
   (`useProjectSourceController.ts:176`).
4. **Two parallel Project repositories.** `file-project-repository.ts` (2 423 lines) and
   `infrastructure/database/project-repository.ts` (3 819 lines) must stay behaviourally identical
   forever. This is the largest maintenance liability in the codebase.

## 7. What should be worked on immediately?

1. Make the provider safety switch configurable and default-safe. Twenty minutes; closes a gate the
   code itself flags.
2. Give the creative library an export, and tell the operator the truth about where it lives.
3. Make every saved video show a picture — fix the silent thumbnail failure and backfill.

## 8. What should be postponed?

Deliberately, and with evidence: multi-user accounts, sharing, collaboration, publishing to
channels, billing and credits, a multi-clip timeline editor, template/brand-kit systems, and any
architectural work on the dual Project repositories. The account and infrastructure work is already
correctly deferred by the repository's own roadmap; the rest is feature creep against a product that
has not yet finished its single-user creative loop. See [09-future-opportunities.md](09-future-opportunities.md).

## 9. What would most improve the end-user experience?

**Finishing the deliverable.** Channel export presets plus one-click variants would turn Lightframe
from "a tool that makes a video" into "a tool that makes a campaign's worth of video". Everything
before it in the roadmap exists to make that step safe and legible.

If only one small thing could ship: **thumbnails everywhere**. It is the cheapest change with the
largest change in how the product feels.

## 10. How close is this to a coherent MVP?

**Close on capability, not on comprehension.** Every flow the product claims can be completed end to
end; the audit found no broken journey. What is missing is not function but _fit_: the vocabulary,
the retrieval, the visual language and the final export step that turn a correct pipeline into a
tool someone reaches for.

A blunt way to put it: a first-time user could probably produce a video without being taught —
Record and Upload are unmissable — but could not confidently produce **the right video for a
specific placement**, find it again next week, or make a second version of it. Roughly
**70 % of the way to a coherent MVP**, with the remaining 30 % concentrated in export, retrieval
and language rather than in new machinery.
