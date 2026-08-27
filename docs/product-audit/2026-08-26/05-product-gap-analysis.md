# Product gap analysis

From a customer-value perspective: what the product is already good at, what stops it delivering,
what exists but is wasted, and what should not be built yet.

## 1. What is the product already good at?

**Genuine differentiators**

- **A complete local editor in the browser.** Trim, crop, rotate, relight and filter render to MP4
  in a WebCodecs worker with no server round-trip. Most comparable tools either upload first or
  offer far less.
- **Nothing is lost, and the product can prove it.** Immutable revisions, a separate untouched
  original, reconciled saves that survive a reload, and an exit guard. Creative tools routinely fail
  at this; this one does not.
- **Honest cost behaviour.** Submission counts stated up front, explicit consent, no automatic paid
  retry, no silent resubmission, and reconciliation when acceptance is unknown.
- **Capability-driven UI.** What is offered is derived from `/api/capabilities`, so a
  half-configured environment degrades into an explanation rather than a broken button.
- **A working multi-provider AI pipeline** — Decart, Pruna, BFL, Wiro, OpenAI, ElevenLabs — behind
  normalized errors that never surface raw provider bodies.

**Strong foundations**

- A domain package that holds real policy and is free of React, HTTP and I/O.
- Contracts shared by both apps, with two route-inventory oracles that fail when routes drift.
- A shell/runtime split that keeps the capture graph off every route that does not need it.
- Test and documentation discipline that is enforced, not aspirational.

## 2. What is preventing the product from delivering its core value?

### Blocking

| Gap                                                 | Why it blocks                                                                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The stored video is not in the chosen placement** | The product's purpose is a marketing asset for a destination. It stores a source-shaped file and a label. See [04](04-creative-workflow-audit.md#1-the-export-is-not-an-artifact). |

### Major friction

| Gap                                                   | Why it matters                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The placement is discarded between Project and Assets | The decision has to be made twice, and silently defaults to "source" the second time |
| Creation is not in the Create step                    | Two hops and a mislabelled button between intent and action                          |
| A Campaign carries nothing                            | The layer meant to make repeat work cheap does not                                   |
| No account-level record of AI spend                   | Every submission costs money; nothing totals it                                      |

### Missing core functionality

| Gap                                                        | Assessment                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Multiple placements from one cut**                       | The natural unit of marketing output. Nothing supports it, and the export model is one step away |
| **Server-side render**                                     | Without it the deliverable depends on the operator's browser                                     |
| Search in Characters and Outfits                           | The only libraries left without it                                                               |
| Adding an existing Project to a Campaign from the Campaign | The endpoint exists; the surface does not offer it                                               |
| Filtering Projects by a specific Campaign                  | Only "All Active" and "No Campaign"                                                              |

### Quality

Three confirmed small-screen defects on the Project workspace, and residual internal vocabulary.
See [03](03-ui-ux-audit.md) and [07](07-bugs-and-risks.md).

### Polish

Stage aspect on wide desktop; button-label truncation; overlay density.

## 3. What exists but is underused because the workflow around it is poor?

| Capability                                   | Why it is wasted                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ProjectExportSpecification`**             | Fully modelled in the domain, chosen in a well-designed UI, recorded on every revision, shown in History — and it never changes a stored byte |
| **The WebCodecs renderer**                   | Capable of producing every placement, invoked only from two download buttons the operator may never press                                     |
| **`POST /api/projects/:projectId/campaign`** | Can attach a Project to a Campaign; no surface offers it                                                                                      |
| **Provider capability differences**          | Pruna's 1080p output, reference requirement and explicit-release semantics are all modelled and all hidden behind the label "Pruna API"       |
| **Per-Project AI history**                   | Complete and well presented, but there is no account-level view, so cost stays invisible                                                      |
| **Campaign brief**                           | A 1,000-character field that nothing reads                                                                                                    |

## 4. What is technically impressive but of limited practical value right now?

- **The dual Project repository.** Two full implementations of a ~50-method interface so the product
  can run with or without a database. Real engineering; the practical benefit to the single operator
  is small, and the maintenance cost is the largest in the codebase.
- **Live AI Beta.** A route, a surface and a provider integration behind a flag that is off by
  default. It is correctly gated, and correctly not finished.
- **Idempotency receipts and CAS on Campaign mutations.** Correct, and appropriate for Projects; for
  a single-operator Campaign that is a name and a brief, it is machinery well ahead of the feature.

None of these should be removed. They are noted so that "impressive" is not mistaken for "delivering".

## 5. What high-value functionality is missing?

Ranked by value to the operator, not by effort.

1. **The placement as a stored artifact.** Everything else in this list depends on it.
2. **A set of placements per cut** — save once, get phone, square and wide.
3. **Campaign-level creative direction** — target placements the Campaign hands down, and one view
   of everything it produced.
4. **An AI spend ledger.**
5. **Search across Characters and Outfits.**
6. **Real links**, so work can be bookmarked, opened in a tab, and shared as a URL between the
   operator's own windows.

## 6. What should NOT be built yet?

Explicitly deferred, with reasons, in [09-future-opportunities.md](09-future-opportunities.md).
In short: **multi-user accounts, sharing and collaboration, direct publishing to channels, billing
and credits, a multi-clip timeline editor, brand kits and template systems, and any restructuring of
the dual Project repositories beyond a shared conformance suite.**

The reason is the same in every case: the product has not finished delivering a single correct video
to a single operator. Publishing an asset that is the wrong shape, or letting a second person
collaborate on it, adds surface to a loop that is not closed.

## 7. Recommended MVP priorities

An MVP here means: _one operator can produce the marketing video they actually needed, find it
again, and trust the file._

| Priority | What                                                 | Why                                           |
| -------- | ---------------------------------------------------- | --------------------------------------------- |
| 1        | Save the video in the chosen placement               | Closes the gap between promise and artifact   |
| 2        | Carry the placement into Assets                      | Stops the decision being discarded            |
| 3        | Put creation in the Create step                      | Removes the last major navigational confusion |
| 4        | Remove residual internal vocabulary                  | Finishes the language work already 90 % done  |
| 5        | Give a Campaign target placements and an output view | Makes the second video cheaper than the first |

With 1–4 done the product is a coherent MVP. Item 5 is what makes it a _campaign_ tool rather than a
video tool.
