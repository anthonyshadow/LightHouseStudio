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
