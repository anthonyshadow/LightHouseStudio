# Prioritized findings

> **Status (2026-08-21).** This audit is a point-in-time assessment; the fifteen-step roadmap it
> produced has since been implemented in full — see
> [`10-implementation-roadmap.md`](10-implementation-roadmap.md) for the step-to-commit table. The
> findings below describe the product **as audited**, not as it now stands. Where the two disagree,
> the code wins.

The combined register. Effort is XS (< 2 h) · S (½–1 day) · M (2–4 days) · L (1–2 weeks) ·
XL (> 2 weeks). Risk is the chance of regressing existing behaviour.

## What the roadmap closed

The roadmap took every P0 and P1 finding plus five P2s and two P3s:

| Finding                | Closed by                                     |
| ---------------------- | --------------------------------------------- |
| P0-1, P0-2             | steps 1–2                                     |
| P1-1, P1-2, P1-3, P1-4 | steps 3, 8, 7, 4                              |
| P1-5, P1-6, P1-7       | steps 11, 12, 9                               |
| P2-1, P2-2, P2-3       | steps 10, 5, 5                                |
| P2-4, P2-5, P2-10      | steps 14, 15, 15                              |
| P2-7                   | step 2 (durability) and the Assets-hub counts |
| P3-1, P3-2             | steps 13, 6                                   |

**P2-6**, **P3-9** and the M10 half of the error-boundary work were closed separately by the Tier
work recorded in
[`../user-flows/gaps-and-usability-audit.md`](../user-flows/gaps-and-usability-audit.md) (N6, M4,
M11, B8/M10). Everything else in this register — **P2-8**, **P2-9**, **P2-11**, **P2-12**, **P3-3** through
**P3-8**, **P3-10**, **P3-11** and all of **P4** — remains open, and P3-3 remains a deliberate
do-not-act.

---

## Priority definitions

| Level  | Meaning                                                                    |
| ------ | -------------------------------------------------------------------------- |
| **P0** | Dangerous, data-loss, security, or release-gating. Address immediately.    |
| **P1** | Prevents users achieving the product's primary purpose.                    |
| **P2** | Substantially reduces friction or improves usability.                      |
| **P3** | Strengthens quality, scalability or maintainability; does not block value. |
| **P4** | Useful, intentionally deferred.                                            |

---

## P0 — Critical

### P0-1 · Provider content filtering disabled with an open release TODO

- **Area** Providers / release readiness
- **Evidence** `apps/api/src/providers/pruna/video-replace-provider.ts:239` —
  `disable_safety_checker: true` with `//TODO Before making project public, change to false and make
configured for local development by environment variable`
- **User impact** None today (loopback, single operator, explicit choice)
- **Technical impact** Unclosed gate for any distribution; the flag is hard-coded rather than
  configured
- **Effort** XS · **Risk** Very low · **Depends on** nothing
- **Action** Add an environment variable defaulting to filtering **on**; keep the current behaviour
  available for local development; document it in `.env.example` and the privacy guide
- **Why P0** The repository's own comment says this must change before distribution. It costs an
  hour and it is the only finding that is a hard gate.

### P0-2 · Creative library can be destroyed with no backup

- **Area** Assets / persistence
- **Evidence** `apps/api/src/app.ts` registers creative-library routes only when a repository
  exists; `createConfiguredPersistence` supplies one only for `postgres`/`neon`; `DATABASE_MODE`
  defaults to `local` (finding **X2**)
- **User impact** Total, silent loss of Characters, Outfits, Wardrobe variants and prompts on
  clearing site data — including reference images that cost real provider spend
- **Technical impact** No export path; cloud mode's `purgeExpiredUnreferenced` reclaims the orphaned
  images
- **Effort** S · **Risk** Low (additive) · **Depends on** nothing
- **Action** Export/import the creative store as a file; state durability honestly on the Assets hub
- **Why P0** The only unbounded data-loss path in the product, on the default configuration.

---

## P1 — Core product value

### P1-1 · Saved videos have no reliable poster frame

- **Area** Saved Videos · **Evidence** **X1**; observed live (2 of 7 records)
- **User impact** High — the primary way work is recognised
- **Effort** S · **Risk** Low · **Depends on** nothing
- **Action** Retry on failure, expose regenerate, backfill existing records, render at source aspect
- **Why P1** Cheapest change with the largest change in how the product feels.

### P1-2 · Nothing can be found by name

- **Area** Videos, Projects, Campaigns · **Evidence** **F12**, **X6**; no search parameter exists in
  `packages/contracts`
- **User impact** High and compounding with library size
- **Effort** M · **Risk** Low–medium (touches three list contracts and three repositories)
- **Depends on** nothing
- **Action** Add a bounded `search` parameter to the three list contracts and repositories; one
  search input per surface; replace "N loaded" with a real total
- **Why P1** Retrieval is a precondition for reuse, and reuse is the product's thesis.

### P1-3 · The product describes work instead of showing it

- **Area** Dashboard, Projects, Campaigns, Assets hub · **Evidence** **GA2**, observed live
- **User impact** High — a video tool that cannot be scanned visually
- **Effort** M · **Risk** Low (presentation only) · **Depends on** P1-1
- **Action** Poster-backed cards on the Projects list, Dashboard recent work and the Assets hub;
  counts on all four hub cards
- **Why P1** Transforms perceived quality for presentation-only work.

### P1-4 · The interface speaks the domain model

- **Area** Global copy · **Evidence** **GA1**, §"Cognitive load" in
  [03-ui-ux-audit.md](03-ui-ux-audit.md)
- **User impact** High — the largest single source of confusion
- **Effort** M · **Risk** Low for copy, medium for test selectors that assert on text
- **Depends on** nothing
- **Action** A vocabulary pass across user-facing strings; delete the "Unassigned Content" banner;
  remove `Revision N` from headers; rename working/presented media in the UI only
- **Why P1** No architectural change, and it removes the barrier every other improvement sits behind.

### P1-5 · Export produces one file in the source aspect

- **Area** Export · **Evidence** **F13**, **GB1**; `ProjectExportSpecification` exists and is never
  written
- **User impact** High — the output does not match any real placement
- **Effort** L · **Risk** Medium (new render path, new save path)
- **Depends on** P1-4 (vocabulary), and reuses the existing `WebCodecs` render worker
- **Action** Channel presets (16:9 / 9:16 / 1:1 / 4:5 + resolution) written into
  `exportSpecification` and applied at export
- **Why P1** The single largest jump in delivered value, and the domain was already designed for it.

### P1-6 · No way to make a variant

- **Area** Projects · **Evidence** **F14**, **GB2**
- **User impact** High for the product's core repeated task
- **Effort** M · **Risk** Medium (new endpoint, revision-copy semantics)
- **Depends on** P1-4
- **Action** Duplicate a Project as a new Project seeded from the current revision, with the source
  reused rather than copied
- **Why P1** Turns one asset into a set; `ProjectRevision` already carries everything needed.

### P1-7 · The create surface does not start creating

- **Area** Studio · **Evidence** **F3**
- **User impact** High — a third of desktop width spent on device configuration before any media
- **Effort** M · **Risk** Medium (touches the most complex layout in the product)
- **Depends on** nothing
- **Action** Collapse capture settings behind a control by default; shorten its copy; disable or
  hide creative tools until media exists
- **Why P1** It is the first surface a creating user sees.

---

## P2 — Major UX and product improvement

| ID    | Finding                                                                    | Evidence         | Effort | Risk     | Action                                                                         |
| ----- | -------------------------------------------------------------------------- | ---------------- | ------ | -------- | ------------------------------------------------------------------------------ |
| P2-1  | Dashboard leads with an empty Processing Queue and an organization lecture | **F2**           | S      | Low      | Recent work first as visual cards; queue collapses to a status chip when empty |
| P2-2  | Project Save has no Download                                               | **X7**           | XS     | Very low | Mount `SavedVideoSuccessActions` on the Save tab                               |
| P2-3  | Saved Videos default to a duplicate-prone title                            | **X8**           | XS     | Low      | Seed from project + date/ordinal; make the field prominent at save             |
| P2-4  | No account, preferences, usage or spend surface                            | **F15**, **GB7** | S      | Low      | Account panel showing identity, `entitlements`, provider status, jobs run      |
| P2-5  | Onboarding is one dismissible card, unrecoverable                          | **G8**, **M7**   | S      | Low      | A persistent "How Lightframe works" panel reachable from the rail              |
| P2-6  | No navigation item active in Studio                                        | **X4**           | XS     | Very low | Add a Studio destination or mark the originating section                       |
| P2-7  | Assets hub treats four unequal libraries as equal                          | **IA2**          | S      | Low      | Counts on all four; a durability note on Characters/Outfits                    |
| P2-8  | Capture offers only 16:9 and 9:16                                          | **GB5**          | S      | Medium   | Add 1:1 and 4:5 to `LocalCaptureAspectRatio` and the stage                     |
| P2-9  | Four unexplained paths to create a video                                   | **R2**           | XS     | Low      | Make Quick Create the single labelled entry; keep the others as shortcuts      |
| P2-10 | Empty states are text-only                                                 | §Empty states    | S      | Very low | Add a visual and a worked example to each                                      |
| P2-11 | "History" is presented as workflow step 4                                  | **IA4**          | XS     | Low      | Three steps plus a History tab outside the sequence                            |
| P2-12 | No breadcrumbs outside Project/Campaign detail; overlays unsignposted      | **M5**, **M12**  | S      | Low      | Breadcrumb in the Assets overlays; a visible close affordance                  |

---

## P3 — Quality, scalability, maintainability

| ID    | Finding                                                       | Class                                 | Effort | Risk     | Action                                                                    |
| ----- | ------------------------------------------------------------- | ------------------------------------- | ------ | -------- | ------------------------------------------------------------------------- |
| P3-1  | Full-video buffering on Project open                          | Affects users now, worsens with scale | M      | Medium   | Stream via the existing ranged content route; render before full download |
| P3-2  | `ProjectRouteSurface.tsx` at 1 350 lines holds three surfaces | Maintainability                       | M      | Medium   | Split into list / overview / workspace modules                            |
| P3-3  | Two complete Project repositories (6 200 lines)               | Maintainability                       | XL     | High     | **Do not act.** Record; revisit only if a mode is retired                 |
| P3-4  | `StudioApp.tsx` at 782 lines is the Studio convergence point  | Maintainability                       | M      | High     | Extract cohesive controllers only when a feature forces it                |
| P3-5  | `VideoGallery.tsx` at 886 lines                               | Maintainability                       | S      | Low      | Split preview overlay and version inspector out                           |
| P3-6  | Seven legacy creative-store schema versions                   | Maintainability                       | S      | Medium   | Collapse behind one migration entry point                                 |
| P3-7  | Client observability is a local buffer and `console.error`    | Maintainability                       | S      | Low      | Structured local log with a copyable report; keep it local                |
| P3-8  | `/studio/{videoId}` outside the exit guard, unreachable       | Correctness                           | XS     | Low      | Bring it inside the guard, or remove the route                            |
| P3-9  | Assets hub counts have no loading or error state              | Quality                               | XS     | Very low | Skeleton and retry (**M4**, **M11**)                                      |
| P3-10 | Video editor keyboard reachability unverified                 | Accessibility                         | S      | Low      | Verify crop by keyboard; add handles if missing                           |
| P3-11 | Mobile Safari unverified                                      | Quality                               | M      | n/a      | Manual pass on a real device; record results                              |

---

## P4 — Deliberately deferred

Multi-user and accounts · sharing and collaboration · publishing to channels · billing and credits ·
multi-clip timeline editor · templates and brand kits · deeper Campaign features · server-side
rendering · analytics. Rationale in [09-future-opportunities.md](09-future-opportunities.md).

---

## Quick wins

Low effort, disproportionate value. All are XS or S and none depends on another.

| #   | Win                                              | Effort | Why it pays                                            |
| --- | ------------------------------------------------ | ------ | ------------------------------------------------------ |
| 1   | Make the safety checker configurable, default on | XS     | Closes the only hard release gate                      |
| 2   | Download on the Project Save tab                 | XS     | Removes a pointless detour at the moment of completion |
| 3   | Better default Saved Video title                 | XS     | Stops the library filling with duplicates              |
| 4   | Mark a navigation item active in Studio          | XS     | Restores orientation on the busiest surface            |
| 5   | Delete the "Unassigned Content" banner           | XS     | Removes the most jargon-dense text in the product      |
| 6   | Remove `Revision N` from page headers            | XS     | Removes the most conspicuous internal concept          |
| 7   | Thumbnail retry + regenerate action              | S      | Fixes visibly broken cards                             |
| 8   | Real totals instead of "N loaded"                | S      | Makes list counts mean something                       |
| 9   | Counts on all four Assets hub cards              | XS     | Makes the hub informative rather than decorative       |
| 10  | Collapse capture settings by default             | S      | Gives the create surface back to creating              |

Items 1–6 and 9 together are roughly one focused day and would materially change first impressions.

---

## Value versus effort

```text
 HIGH  │  P1-1 thumbnails          │  P1-5 export presets
value  │  P1-3 visual browsing     │  P1-2 search
       │  P1-4 vocabulary          │  P1-6 variants
       │  quick wins 1–10          │  P1-7 create surface
       ├───────────────────────────┼──────────────────────────
       │  P2-1 dashboard           │  P3-1 streamed source
 LOW   │  P2-4 account surface     │  P3-2 split surfaces
value  │  P2-5 onboarding          │  P3-3 dual repositories ← do not act
       │  P2-10 empty states       │  P3-4 split StudioApp
       └───────────────────────────┴──────────────────────────
            LOW effort                   HIGH effort
```

The top-left quadrant is unusually full. That is the finding: most of the remaining value in this
product is cheap, and almost none of it requires new architecture.
