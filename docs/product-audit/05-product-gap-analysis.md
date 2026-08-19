# Product gap analysis

## What the product is already good at

**Trustworthy media handling.** Non-destructive versioning, immutable sources, exact-Version
download, bounded reads, atomic saves with idempotency receipts, and an exit guard that refuses to
lose work. Most products at this stage do not have any of this; this one has all of it.

**Honest, bounded provider integration.** No automatic paid retry. No silent resubmission. Explicit
reconciliation when acceptance is unknown. Concurrency caps per provider. Cost consequences stated
before the click. This is a genuine differentiator, and it is the kind of thing that is very
expensive to retrofit.

**A working AI creative pipeline.** Character swap and virtual try-on across four provider
back-ends, reference-image generation with an optional prompt optimizer, ElevenLabs voice
conversion, and a browser-local video editor — all behind capability gates that degrade honestly.

**Reusable creative identity.** Characters with Wardrobe variants and outfits are the right
abstraction for repeated brand production, and the reference-image lineage behind them is careful.

**A codebase that can absorb change.** Clear inward-pointing dependencies, a domain package free of
React and I/O, route inventory oracles, 83.8 % line coverage, and a clean dead-code gate.

## What prevents the product delivering its value

### Blocking

Nothing. No flow is broken. This is worth stating plainly.

### Major friction — the real blockers to daily use

| #   | Gap                                         | Why it blocks value                                                                               |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GA1 | **Domain vocabulary is the UI vocabulary**  | Every surface asks the user to learn the model before acting                                      |
| GA2 | **No visual browsing**                      | A video tool that shows text rows cannot be scanned; the operator cannot recognise their own work |
| GA3 | **No search anywhere**                      | Past one page, retrieval is scrolling. The contracts have no search parameter to build on         |
| GA4 | **Export is one file in the source aspect** | The output does not match any real placement                                                      |
| GA5 | **No variants**                             | The central repeated task of marketing production is unsupported                                  |

### Missing core functionality

| #   | Missing                                      | Evidence                                               |
| --- | -------------------------------------------- | ------------------------------------------------------ |
| GB1 | Channel/aspect export presets                | `ProjectExportSpecification` exists, nothing writes it |
| GB2 | Duplicate or branch a Project                | No endpoint, no surface                                |
| GB3 | Text, captions and overlays in the editor    | `VideoEditTool` = trim/crop/rotate/lighting/filters    |
| GB4 | Audio track, music, mixing, speed            | Voice replacement only                                 |
| GB5 | Square (1:1) and portrait-feed (4:5) capture | `LocalCaptureAspectRatio` is 16:9 / 9:16               |
| GB6 | Creative-library export or backup            | Browser-only in the default mode                       |
| GB7 | Account, preferences, usage and spend        | `entitlements` returned, never rendered                |
| GB8 | Concept help after onboarding is dismissed   | One boolean, one card                                  |

### Quality issues

Thumbnail generation fails silently and never recovers. Saved Videos inherit a default title that
produces duplicate "Untitled Project" records. Lists report "N loaded" rather than totals. No
navigation item is active in Studio. Project Save has no Download.

### Polish

Onboarding is a single dismissible card. Empty states are text-only. The Outfits create button sits
outside its empty state. No breadcrumbs outside Project and Campaign detail. Overlay routes are not
signposted as overlays.

## Features that exist but are underused because the workflow around them is poor

| Feature                              | Why it underperforms                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Characters and Wardrobe variants** | Genuinely good, and the least durable data in the product. Discoverable only through a hub card with a count read from IndexedDB.    |
| **Project History and revisions**    | Rows of text and timestamps. All the lineage is captured and none of it is visualised. No compare, no "what changed", no restore-to. |
| **Campaigns**                        | A name and a brief. Nothing about it helps produce or find creative work.                                                            |
| **Voice library**                    | Well built, with the only search box in the product — reachable through a hub card whose label is "Voices".                          |
| **Compare against original**         | Excellent, and available only transiently inside the existing-video result flow.                                                     |

## Features that are technically impressive and deliver limited practical value today

State plainly, without disparaging the engineering:

- **Shadow database mode** — real dual-write verification machinery for a migration that a
  single-operator product will perform once.
- **Direct multipart R2 upload** — significant infrastructure serving one user uploading their own
  files.
- **Live AI realtime (Decart)** — disabled by default, has never shown a stage, and is the most
  complex provider integration in the codebase.
- **Two complete Project repositories** — file and Drizzle, 6 200 lines that must stay behaviourally
  identical, so that one person can choose between JSON files and Postgres.

None of these should be removed. They are correctly built and cheaply carried. They should simply
not receive further investment ahead of the export and retrieval gaps.

## High-value functionality that is missing

Ranked by value per unit of effort:

1. **Export presets per placement** — the largest jump in delivered value; the domain type exists.
2. **Duplicate / variant a Project** — turns one asset into a set; `ProjectRevision` already carries
   everything needed.
3. **Thumbnails everywhere + reliable generation** — small, and it changes how the product feels.
4. **Search across Videos, Projects, Campaigns** — one query parameter per contract, one input per
   surface.
5. **A vocabulary pass** — copy-only, zero architectural risk, removes the single largest source of
   confusion.
6. **Captions and text overlays** — the most-requested capability in social video, and the largest
   genuinely new build.
7. **Usage and spend visibility** — a count and a list; makes paid AI feel safe rather than risky.

## What should NOT be built yet

This section matters as much as the one above.

| Do not build                                                | Why not                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-user, signup, roles, sharing**                      | Deliberately deferred by the repository's own roadmap, which explicitly warns against adding a tunnel, LAN binding, proxy or public hostname because the storage ports exist. It requires an approved security and privacy design first. |
| **Publishing to social channels**                           | Depends on accounts, OAuth, scheduling and a moderation posture. Download solves 90 % of the need today.                                                                                                                                 |
| **Billing, credits, subscriptions**                         | No customers. A simple usage counter delivers the useful half for a fraction of the cost.                                                                                                                                                |
| **Multi-clip timeline editor**                              | An order of magnitude more work than the current editor, and single-clip transformation is the product's actual thesis.                                                                                                                  |
| **Templates and brand kits**                                | The right idea at the wrong time. Variants must exist before templates mean anything.                                                                                                                                                    |
| **Refactoring the dual Project repositories**               | Large, risky, touches the most heavily invariant-checked code, and delivers no user value. Revisit only if one mode is retired.                                                                                                          |
| **Deeper Campaign features** (dates, goals, KPIs, calendar) | Campaigns are underused because Projects are hard to find, not because Campaigns lack fields.                                                                                                                                            |
| **Server-side rendering / a render farm**                   | The local `WebCodecs` editor works. Solve export _shape_ before export _scale_.                                                                                                                                                          |

## Strategic read

The product has built the hard 70 % — media correctness, provider safety, versioning, concurrency —
and stopped just before the easy 30 % that users actually touch. The next phase of work should be
almost entirely **presentation, retrieval and the final export step**, with exactly one substantial
new capability (channel export) that the domain has already been designed for.
