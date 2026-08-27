# Archived documentation

Documents here **do not describe current behaviour**. They are retained because they carry
historical context, architectural reasoning, or a decision record that a future reader may need.

Rules for this directory:

- Nothing here is implementation authority. For current behaviour use
  [`../ARCHITECTURE.md`](../ARCHITECTURE.md), [`../user-flows/`](../user-flows/README.md) and the
  [project README](../../README.md).
- Do not add a document here just to tidy the repository. Archive only when the content may
  reasonably have future value and there is doubt about deleting it.
- Every entry must appear in the ledger below.

## Ledger

### MVP alignment audit

- **Document:** `MVP_ALIGNMENT_AUDIT.md`
- **Previous location:** `docs/MVP_ALIGNMENT_AUDIT.md`
- **Reason archived:** Dated planning audit of the 2026-08-11 repository. The document already
  carried a self-declared "Historical planning record (fully superseded…)" banner and was listed as
  Historical in the documentation map, but sat alongside current documents.
- **What replaced it:** [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for structure,
  [`../user-flows/`](../user-flows/README.md) for behaviour, and
  [`../MVP_ACCEPTANCE.md`](../MVP_ACCEPTANCE.md) for evidence.
- **Date archived:** 2026-08-16

### User Accounts Phase 1 audit and plan

- **Document:** `user-accounts-phase-1-audit-and-plan.md`
- **Previous location:** `docs/user-accounts-phase-1-audit-and-plan.md`
- **Reason archived:** Completed decision and cutover record for the Phase 1 account foundation.
  Useful historical reasoning for why authentication, ownership derivation and session handling are
  shaped the way they are; not current positioning. It also references proposed file names that
  were never created under those exact names.
- **What replaced it:** the Authentication and ownership section of
  [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and
  [`../user-flows/authentication-and-entry.md`](../user-flows/authentication-and-entry.md).
- **Date archived:** 2026-08-16

### Product evolution

- **Document:** `PRODUCT_EVOLUTION.md`
- **Previous location:** `docs/PRODUCT_EVOLUTION.md`
- **Reason archived:** Explicitly historical rationale for past product changes. Valuable for
  understanding why the product moved from a session-centric to a Project-centric model; not a
  description of anything the product does today.
- **What replaced it:** [`../PRODUCT_VISION.md`](../PRODUCT_VISION.md) for positioning and
  [`../PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md) for direction.
- **Date archived:** 2026-08-16

### Lightframe MVP implementation sequence

- **Document:** `LIGHTFRAME_MVP_IMPLEMENTATION_SEQUENCE.md`
- **Previous location:** `docs/implementation/LIGHTFRAME_MVP_IMPLEMENTATION_SEQUENCE.md`
- **Reason archived:** A completed delivery programme record (Prompts 02–13). Migration completed;
  the plan is finished. Retained because it documents the order in which the Project aggregate,
  campaign membership and output model were introduced, which explains several migration files.
  Its parent `docs/implementation/` directory contained only this file and was removed.
- **What replaced it:** [`../MVP_DEFINITION.md`](../MVP_DEFINITION.md) for the boundary and
  [`../MVP_ACCEPTANCE.md`](../MVP_ACCEPTANCE.md) for evidence.
- **Date archived:** 2026-08-16

### UI/UX audit, UX implementation plan and Superdesign prompts

- **Documents:** `LightFrameUXAudit.md`, `LightFrameUXImplementationPlan.md`,
  `LightFrameSuperdesignPrompts.md`
- **Previous location:** `docs/`
- **Reason archived:** The five-tier UX programme these three documents describe ran to completion.
  The audit records the interface as implemented on 2026-08-22, the plan records the order the work
  was done in and what each item became, and the prompts record the four areas judged to need a new
  layout rather than a fix — all four shipped. They describe an interface that has since changed.
- **What replaced it:** [`../user-flows/`](../user-flows/README.md) for current behaviour and
  [`../product-audit/2026-08-26/README.md`](../product-audit/2026-08-26/README.md) for the current
  assessment.
- **Date archived:** 2026-08-26

### Product audit — first pass (21 August 2026)

- **Documents:** `00-executive-summary.md` through `10-implementation-roadmap.md`
- **Previous location:** `docs/product-audit/`
- **Reason archived:** A [second-pass audit of the current product](../product-audit/2026-08-26/README.md)
  was carried out on 26 August 2026, after this audit's fifteen-step roadmap and the five-tier UX
  programme had both landed. That audit is the current assessment. This one is the earlier record:
  its findings describe a product that no longer exists, and its roadmap is complete.
- **What replaced it:**
  [`../product-audit/2026-08-26/README.md`](../product-audit/2026-08-26/README.md).
- **Date archived:** 2026-08-26

**Method.** The repository was read directly, the application was run locally
(`bun run dev`, Postgres + R2 + all providers configured) and driven through its real surfaces.
Existing documentation was read for intent only; where a document and the code disagreed, the code
won. Findings are separated into **confirmed** (reproduced or read in the code) and
**suspected** (reasoned, not reproduced).

**This was an assessment, not a decision.** Documents 00–09 record what was found, not what was
agreed to. The roadmap in [10](10-implementation-roadmap.md) is the exception: all fifteen of its
steps were implemented on `develop`.

> **Superseded for UI and UX.** [`03-ui-ux-audit.md`](03-ui-ux-audit.md) and the interface findings
> in [`02`](02-user-flow-audit.md), [`04`](04-creative-workflow-audit.md) and
> [`08`](08-prioritized-findings.md) describe the product before the
> [UI/UX audit](LightFrameUXAudit.md) and its
> [implementation plan](LightFrameUXImplementationPlan.md), which have since run to completion
> across all five tiers. Where they disagree with those two documents, or with the code, they are
> the older record. They are kept because they are the reasoning that led there — not because they
> still describe the interface. The architecture, bug and opportunity documents are unaffected.

The eleven documents, in the order they were meant to be read:

| #                                        | Document                | Answers                                                          |
| ---------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| [00](00-executive-summary.md)            | Executive summary       | What is this product, what is wrong, what to do first            |
| [01](01-current-product-map.md)          | Current product map     | What actually exists — routes, data model, capabilities          |
| [02](02-user-flow-audit.md)              | User-flow audit         | Every journey traced end to end, with friction and severity      |
| [03](03-ui-ux-audit.md)                  | UI/UX audit             | Information architecture, hierarchy, states, accessibility       |
| [04](04-creative-workflow-audit.md)      | Creative workflow audit | Idea → source → create → review → save → organize → export       |
| [05](05-product-gap-analysis.md)         | Product gap analysis    | Strengths, missing capability, what not to build                 |
| [06](06-technical-architecture-audit.md) | Architecture audit      | Boundaries, performance, scalability, security, maintainability  |
| [07](07-bugs-and-risks.md)               | Bugs and risks          | Confirmed defects and unverified risks                           |
| [08](08-prioritized-findings.md)         | Prioritized findings    | The full register: P0–P4, effort, risk, dependencies, quick wins |
| [09](09-future-opportunities.md)         | Future opportunities    | Deliberately deferred ideas and why                              |
| [10](10-implementation-roadmap.md)       | Implementation roadmap  | Ordered incremental steps, each independently reviewable         |

It did **not** replace [`../user-flows/gaps-and-usability-audit.md`](../user-flows/gaps-and-usability-audit.md),
which tracks an earlier finding-by-finding remediation programme through Tier 4. That work is real
and most of it has shipped. The audit re-verified its open items against the code as it then stood
and took a wider view: product strategy, creative workflow, architecture at scale, and what to
build next. Where a finding there restates an open item from that document, the original identifier
is cited.

## Not archived, and why

Four documents were reviewed as archive candidates and deliberately kept in `docs/`:

| Document                                            | Decision             | Reason                                                                                                                                   |
| --------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `../MAINTAINABILITY_AUDIT.md`                       | Kept, header updated | Its dated cleanup records are historical, but it still owns open deferred findings and placement rules. Burying it would hide live work. |
| `../REMOTE_BACKEND_HANDOFF.md`                      | Kept                 | A deferred _future_ design boundary, not a historical record. Future plans belong in `docs/`, clearly labelled.                          |
| `../PROJECT_DELIVERABLE_MODEL.md`                   | Kept                 | Same: an explicitly unimplemented future aggregate.                                                                                      |
| `../deferred-account-and-infrastructure-roadmap.md` | Kept                 | Same: forward-looking service-readiness path.                                                                                            |

Nothing was deleted during the 2026-08-16 documentation restructure. Where currency was uncertain,
the document was archived rather than removed, per the repository's retention preference.
