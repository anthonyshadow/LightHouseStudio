# Project Cleanup Implementation Plan

## Current status

| Item                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Findings document       | `docs/projectCleanupFindings.md`                                                                                                                                                                                                                                                                                                                                                                                                        |
| Date generated          | 2026-07-27                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Audited branch / commit | `Refactor` / `5c7f3e62c9a14b9f044ae7919747bf4cafda3e52`                                                                                                                                                                                                                                                                                                                                                                                 |
| Open findings           | 1 unresolved (1 open); TEST-001, TEST-002, TOOL-001, DEAD-001, DEAD-002, DEAD-003, ARCH-001, ARCH-002, DUP-001, DUP-002, DUP-003, COMP-001, and STATE-001 resolved                                                                                                                                                                                                                                                                      |
| Remaining phases        | 1                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Important prerequisites | Use Node 24/npm 11; preserve local-first/provider-cost boundaries and persisted legacy data; keep the passing functional, focused-hook, pruning, and cross-platform visual safety gates green during structural work.                                                                                                                                                                                                                   |
| Known baseline failures | None in the completed safety-net scope: functional E2E passes 128 with 10 intentional skips, and Darwin plus Linux/amd64 visual runs each pass all 29 cases.                                                                                                                                                                                                                                                                            |
| Other limitations       | `npm run audit:prod` was not authorized because it sends dependency metadata externally. Disposable Linux installs pass with repository-compatible npm 11.6.2; the Playwright image's npm 11.13 requests broader optional-lock normalization and was not adopted.                                                                                                                                                                       |
| Graphify status         | PHASE-008 moved the graph from 3,673 nodes / 8,333 edges to a 3,716 / 8,458 code checkpoint and 3,708 / 8,449 after findings/roadmap self-removal. `useReferenceRecipeHandoff` symbol degree fell 15→12 and module degree 47→33; its Studio caller/export path remains unchanged, focused identity/hydration/Workshop/attribution clusters have direct tests, and the module graph reports 370 files / 1,008 local edges / zero cycles. |

## Execution rules

- Implement only one phase at a time unless phases are explicitly marked safe to combine. None are currently marked safe to combine.
- Begin every implementation by reading current repository instructions, `docs/projectCleanupFindings.md`, this live plan, and affected canonical/user-journey documentation.
- Inspect the branch, commit, and working tree. Never reset, clean, overwrite, or discard user changes.
- Use the installed Graphify integration before and after every phase. Confirm graph conclusions against source, exports, entry points, dynamic imports, configuration, tests, routes, registrations, and framework conventions.
- Preserve behavior, public contracts, persisted data, integrations, accessibility, responsive layout, performance characteristics, and explicit provider-cost boundaries unless a finding explicitly identifies a required behavioral correction.
- Record baseline failures separately from phase-introduced failures.
- Remove a completed phase section and its overview row only after every acceptance criterion and validation check passes. Update the remaining-phase count and prerequisites, but never renumber phase IDs.
- Partially completed phases remain in this document and must accurately list unfinished work. Unresolved work must not be deleted.
- Preserve historical findings in `docs/projectCleanupFindings.md`. Mark resolved findings `Resolved` and append implementation/validation/Graphify evidence; do not delete or renumber findings.
- Newly discovered work receives a new stable finding ID and, if necessary, a new phase. Do not silently expand a phase to absorb unrelated cleanup.
- When no phases remain, replace the overview/phase queue with `All documented cleanup phases have been completed.`, record final commands/results and final Graphify architecture evidence, and ensure every finding is `Resolved`, `Accepted as intentional`, or explicitly `Blocked`.

## Remaining phases overview

| Phase ID  | Title                         | Finding IDs | Risk | Dependencies | Expected outcome                                                                    |
| --------- | ----------------------------- | ----------- | ---- | ------------ | ----------------------------------------------------------------------------------- |
| PHASE-009 | Reconcile final documentation | DOC-001     | Low  | None         | Correct canonical filename/links and documentation aligned with implemented cleanup |

## Phase sections

### PHASE-009: Reconcile final documentation

#### Objective

Correct the canonical image-generation filename/link and perform a final evidence-based documentation and architecture validation after all cleanup phases.

#### Findings resolved

- `DOC-001`

#### Scope

Rename `docs/Image_Generartion.md` to `docs/Image_Generation.md`; update all internal links; reconcile docs affected by completed findings; final Graphify/module/validation record.

#### Out of scope

New production cleanup, rewriting historical rationale, claiming the project is defect-free, or dependency/product changes.

#### Dependencies

None. PHASE-004 through PHASE-008 are complete.

#### Risk assessment

- **Regression risk:** Low.
- **Architectural risk:** Low.
- **Data/compatibility risk:** None.
- **User-facing risk:** Low; possible external bookmarks.
- **Rollback difficulty:** Low.

#### Implementation sequence

1. Search all links and external-publication assumptions for the misspelled path.
2. Rename the file and update repository references; do not duplicate canonical content.
3. Re-read documentation map and completed finding notes for contradictions.
4. Run final Graphify architecture/cycle/reachability checks and complete project validation.
5. Ensure all findings have final allowed status and finalize the live plan as instructed.

#### Graphify requirements

Before/after query the image-generation/reference flow and docs references where supported; update the graph; confirm no code/module edge changed, no broken document path, zero cycles, and final architecture matches findings. Use link search/check because Graphify markdown coverage may be incomplete.

#### Acceptance criteria

Correct filename exists; misspelled path has no internal references; documentation map links resolve; current docs do not contradict implemented ownership/visual/compatibility state; every finding has an allowed final status; final validations and Graphify result are recorded.

#### Required validation

Repository link search/check; `npm run quality`; `npm run test:coverage`; `npm run test:e2e`; `npm run test:visual`; `npm run test:production`; `npm run audit:prod` when explicitly authorized; `graphify update .`; final Graphify query and module check.

#### Rollback strategy

Revert rename/link edits. If external link compatibility is required, document a supported redirect mechanism rather than keeping two divergent copies.

#### Documentation updates

Resolve DOC-001. Ensure findings history remains; when this is the final completed phase, replace the phase queue with the required completion statement and final evidence.

#### Standalone implementation prompt

```text
Implement only PHASE-009 (“Reconcile final documentation”), resolving DOC-001 and finalizing the documented cleanup queue. Read all instructions, docs/projectCleanupFindings.md, docs/projectCleanupImplementationPlan.md, README documentation map, Architecture, image-generation/privacy/live-smoke/user-journey docs. Confirm PHASE-003 through PHASE-008 are complete and the safety-net gates remain passing; inspect branch/commit/status and preserve user changes.

Do not implement new cleanup, rewrite historical rationale, change behavior/contracts/data, update dependencies or claim the project is defect-free. Preserve external bookmarks where the actual documentation host has a supported redirect mechanism; do not keep duplicate divergent canonical documents.

Run baselines. Read Graphify instructions and query the current image-generation/reference architecture, doc/source references, entry paths, cycles and final finding impact. Confirm markdown links with repository search because Graphify may not model all links.

Rename docs/Image_Generartion.md to docs/Image_Generation.md, update every internal reference and verify links. Re-read canonical docs against the completed finding records and correct only factual contradictions caused by implemented phases, preserving PRODUCT_EVOLUTION.md/LESSONS.md history.

Run graphify update . and final architecture queries; verify zero unintended code-edge changes/cycles/orphans and correct docs path. Run link checks/search, npm run quality, npm run test:coverage, npm run test:e2e, npm run test:visual, npm run test:production and npm run audit:prod only with explicit authorization. Record environmental/pre-existing limitations accurately.

After all criteria pass, mark DOC-001 Resolved with rename/links/validation/Graphify/limitations/PHASE-009. Confirm every finding is Resolved, Accepted as intentional, or explicitly Blocked. Preserve all historical findings. Remove PHASE-009 and its overview row, update remaining count to zero, and replace the remaining-phases section with “All documented cleanup phases have been completed.” Record final commands/results and final Graphify check. Do not claim all defects are eliminated.

Report DOC-001, files/links/docs changed, final validation/Graphify, remaining limitations/statuses, new findings if any, and confirmation the plan has no remaining phases.
```
