# Executive summary

Written for someone who will not read the rest of the audit.

## 1. What is the product currently?

Lightframe Studio is a **single-operator, loopback-only browser studio for AI-assisted marketing
video**. One authenticated person records or uploads a video, optionally swaps the character on
screen or tries an outfit on them, optionally replaces the voice, trims and colour-corrects it in
the browser, saves it as a versioned Video, and downloads the file.

Three organizing layers sit around that: **Campaigns** (optional grouping), **Projects** (one
resumable video workflow with immutable revisions and a three-step Original → Create → Save model),
and **Assets** (Videos, Characters, Outfits, Voices).

Three constraints still define it more than any feature does, and all three are deliberate:

- **It cannot be reached from another machine.** Every non-loopback `Host` is rejected with `421`
  (`apps/api/src/http/security.ts`). Verified live: a `curl` from outside the page's origin is
  refused with `403 forbidden_origin`.
- **There is exactly one user.** A seeded demo account. No signup, no roles, no sharing.
- **There is no publishing.** Download is the only way work leaves the product.

So the question this audit measures is not "is this ready for customers". It is **"can its operator
quickly and confidently produce the marketing video they actually needed?"**

## 2. What does it do well?

The first-pass audit's roadmap and the UX programme both genuinely landed, and it shows.

- **The product no longer speaks in schema.** Placements are "Phone, full screen" and "Tall feed
  post", not aspect ratios. Empty states carry worked examples. Costs are stated before submission.
- **Retrieval works.** Projects, Campaigns, Videos and Voices all have server-side search, real
  totals, and posters on every row. Verified in the running product.
- **Engineering rigour that is genuinely rare.** Optimistic concurrency and idempotency receipts on
  every Project and Campaign mutation, two route-inventory oracles that fail when routes drift,
  capability-gated UI driven by `/api/capabilities`, no automatic paid retry, streamed and
  byte-bounded media reads, and a clean separation between a persistent shell and a Studio capture
  runtime that is never mounted on a route that owns no live media.
- **Repository hygiene is real, not claimed.** Zero `TODO`/`FIXME` in application source. `knip`
  reports no dead code. 244 test files. The accessibility suite runs `axe` across five viewports
  _and_ at 200 % text zoom.
- **The data-loss path the first pass called its worst risk is closed.** The creative library now
  has export and import, and says so when account sync is unavailable.

I could not find a broken journey. Every flow the product claims can be completed end to end.

## 3. The five biggest weaknesses

1. **The saved video is not in the placement the operator chose.** The Project asks "where is this
   going?", records the answer, tells the operator _"This frame and the selected placement are what
   the saved video will use"_ — and then stores the video in its original shape. Re-framing happens
   in the browser, later, only if the operator clicks a particular download button. The Assets
   library states the truth (_"Re-framing happens in this browser; the saved version is not
   changed"_); the Project save panel states the opposite.
2. **The placement is then lost.** The Assets export panel starts from no placement at all, so a
   video saved for "Phone, full screen" downloads in its source shape unless the operator remembers
   and re-picks. The single most important decision in the product does not travel with the thing
   it was made for.
3. **The step called "Create" cannot create.** The Create tab holds a setup checkpoint, current-cut
   management and a _status_ panel. Character Swap and Virtual Try-On are started from a button
   labelled "Edit Video · Open the video editor", which opens an overlay titled "Use existing
   video" containing a second, competing three-step wizard.
4. **A Campaign is a name and a brief, and nothing else.** It gives its Projects no shared
   direction, no target placements, no view of what it has produced. It organizes; it does not
   help. For a product about campaigns, this is the emptiest thing in it.
5. **The product still shows its own bookkeeping.** Truncated UUIDs above every asset name, internal
   capture filenames, "Project change 37", provider brand names as a user-facing choice
   ("Decart API" / "Pruna API"), and status copy such as _"Looking for a durable current or accepted
   earlier-revision operation."_

## 4. The five biggest opportunities

1. **Make the placement real** — render at save time and store the re-framed file. This turns the
   product's central promise from a label into an artifact, and it is the prerequisite for
   everything downstream, including any future sharing.
2. **Make a Campaign do work** — a set of target placements the Campaign hands to each Project, and
   one view of every video it has produced. Most of the machinery already exists.
3. **Put creation in the create step**, and retire one of the two wizards.
4. **Show what the AI work has cost.** Every submission spends money; nothing anywhere totals it.
5. **Give destinations real links.** The whole authenticated application contains exactly one
   `<a href>`, and it is the skip link.

## 5. What creates the most user friction today?

Not comprehension any more — that was the last audit's answer and it has largely been fixed. Today
it is, in order: **a deliverable that is not what it says it is** (1 and 2 above), **the distance
between deciding to create and being able to** (3), and **repetition that the Campaign layer exists
to remove and does not** (4).

## 6. What creates the most technical risk?

1. **Two Project repositories — 6,385 lines — with no shared conformance suite.** `FileProjectRepository`
   and `DrizzleProjectRepository` implement the same ~50-method interface and are tested by two
   completely different suites: one against real temp-directory file I/O, the other against a
   scripted database. Nothing structurally prevents them from diverging, and both are live —
   `DATABASE_MODE=local` is the documented default.
2. **The deliverable depends on the browser.** Re-framing needs `VideoEncoder`/`VideoDecoder`. The
   fallback is handled honestly, but it means the product's headline output cannot be produced at
   all on a browser without WebCodecs, and the server has no way to produce it.
3. **Provider work is logged in two different channels.** Reference-image lifecycle goes through
   `pino` with request and trace correlation; video-job failures go through bare `console.warn` with
   no request id. Diagnosing a failed paid job is harder than it should be.

## 7. What should be worked on immediately?

1. **Repair the documentation link gate.** `bun run check:docs` is currently red — thirteen broken
   links from an in-progress move of three UX documents into `docs/archived/`. It is five minutes,
   and until it is fixed every later change validates against an already-failing gate.
2. **Stop claiming media never leaves the browser when it does.** The idle stage says _"Nothing
   leaves this browser in Local mode"_ unconditionally, including in the Postgres-and-R2
   configuration where it plainly does.
3. **Then make the placement real**, and carry it with the video.

## 8. What should be postponed?

Deliberately, and with evidence: multi-user accounts, sharing and collaboration, direct publishing
to channels, billing and credits, a multi-clip timeline editor, brand kits and template systems, and
any restructuring of the dual Project repositories beyond giving them one shared conformance suite.
See [09-future-opportunities.md](09-future-opportunities.md).

## 9. What would most improve the end-user experience?

**Storing the video the operator asked for.** Everything else in this audit is smaller than the gap
between "you chose Phone, full screen" and what is actually in the library afterwards.

If only one _small_ thing could ship: carry the Project's placement into the Assets export panel so
the decision is not silently discarded.

## 10. How close is this to a coherent MVP experience?

**Closer than the last audit found, and blocked on one thing rather than many.** Comprehension,
retrieval and visual language are no longer the problem; a first-time operator can now record,
transform, save and download without being taught. What they cannot yet do is trust that the file
they get is the file they specified.

Roughly **85 % of the way to a coherent MVP**, with almost all of the remaining 15 % concentrated in
the last mile — the export artifact and the Campaign layer that is supposed to make the second
video cheaper than the first.
