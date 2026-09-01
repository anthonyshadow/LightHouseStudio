# Documentation and rule pruning report

**Document type:** the record of every documentation and repository-rule file reviewed by the
2026-08-30 audit, its disposition, and the deletion manifest — **approved and executed
2026-08-31**. This report records dispositions; it does not archive deleted content (git history
remains the permanent record of removed text).

## 1. Deletion manifest — **approved and executed 2026-08-31**

Entries M1–M6 were deleted and every reference repaired on 2026-08-31 (approval given
2026-08-31). M7 executed in two steps: `.superdesign/tmp/*.html` removed 2026-08-31; the
`.claude/worktrees/exciting-goldstine-c5dfcd` worktree was initially left in place because
inspection found uncommitted modifications inside it (`ShellLifecycleDialogs.test.tsx`,
`StudioApp.test.tsx`, `vitest.setup.ts`), then removed later the same day once the owner reviewed
that work and its commit (`ac214d99`) was merged. The manifest is fully executed; a 2026-09-01
verification re-ran the deleted-path greps and the three checks (`check:docs`, `format:check`,
`check:retired-program`) against the executed state — all green.

Every entry lists: path · reason · still-valid unique content and where it now lives · replacement
· references that must be updated on deletion.

### M1 — `docs/PRODUCT_VISION.md`

- **Reason:** superseded; two Product Visions cannot coexist under the map's one-owner rule. The
  old document also entrenches the superseded "one focused video workflow per Project" scope.
- **Preserved:** its product-model table and term meanings → [DOMAIN_MODEL](../product/DOMAIN_MODEL.md);
  its principles (non-destructive, provider independence, reuse, campaign-without-ceremony) →
  [PRODUCT_VISION](../product/PRODUCT_VISION.md); its "current non-claims" → vision Non-goals.
- **Replacement:** `docs/product/PRODUCT_VISION.md`.
- **References to update:** `AGENTS.md`, root `README.md`, `docs/README.md`,
  `docs/ARCHITECTURE.md`, `docs/user-flows/feature-behavior/README.md` (plus files deleted in the
  same pass: old roadmap, product-audit, archived).

### M2 — `docs/PRODUCT_ROADMAP.md`

- **Reason:** superseded by the new dependency-ordered roadmap; its phase statuses had already
  drifted (Phase 3 text predates the second audit's landed steps).
- **Preserved:** future-architecture notes and decision gates →
  [TARGET_ARCHITECTURE](../architecture/TARGET_ARCHITECTURE.md) and
  [DECISIONS_REQUIRED](../DECISIONS_REQUIRED.md); phase-gating philosophy → new roadmap's
  "Why this order" and decision gates.
- **Replacement:** `docs/roadmap/PRODUCT_ROADMAP.md`.
- **References to update:** `AGENTS.md`, root `README.md`, `docs/README.md`,
  `docs/ARCHITECTURE.md`, `docs/deferred-account-and-infrastructure-roadmap.md`,
  `docs/user-flows/README.md`.

### M3 — `docs/MVP_DEFINITION.md`

- **Reason:** the bounded Campaign/Project MVP it defines is complete and accepted; as standing
  guidance it now contradicts the target vision (single focused workflow, "do not implement the
  deferred Deliverable child", captions/audio excluded as non-goals).
- **Preserved:** the accepted Campaign cardinality/lifecycle decisions and the
  Revision-vs-Version distinction → [DOMAIN_MODEL](../product/DOMAIN_MODEL.md); the MVP boundary
  concept → vision "MVP boundary".
- **Replacement:** `docs/product/DOMAIN_MODEL.md` (decisions) + `docs/product/PRODUCT_VISION.md`
  (boundary). `docs/MVP_ACCEPTANCE.md` is **kept** as the acceptance-evidence record and gets a
  pointer note that its definition document was superseded by the canon.
- **References to update:** `docs/MVP_ACCEPTANCE.md`, `docs/README.md`,
  `docs/decisions/0002-durable-project-aggregate.md`.

### M4 — `docs/PROJECT_DELIVERABLE_MODEL.md`

- **Reason:** a deferred design note whose central rule ("not a multitrack timeline… or nonlinear
  editor") contradicts the adopted direction; keeping it invites future agents to build the wrong
  multi-video model.
- **Preserved:** its staged expand/backfill/verify/switch migration discipline →
  TARGET_ARCHITECTURE "Database model direction"; its sibling-cuts alternative → D1 option (c) in
  DECISIONS_REQUIRED; its recorded naming decision (user-facing "Videos", internal "Deliverable"
  deprecated) → DOMAIN_MODEL deprecated-names table.
- **Replacement:** `docs/architecture/TARGET_ARCHITECTURE.md` + `docs/DECISIONS_REQUIRED.md` (D1).
- **References to update:** `docs/README.md`, `docs/decisions/0002-durable-project-aggregate.md`.

### M5 — `docs/product-audit/2026-08-26/` (entire directory: README, 00–10, prompts/ — 27 files)

- **Reason:** superseded as "the current assessment" by
  [CURRENT_STATE_AUDIT](CURRENT_STATE_AUDIT.md); its status headers falsely deny that steps 1–6
  landed (DOCS-1), and executed prompts invite re-runs.
- **Preserved:** all still-open findings and roadmap steps are absorbed with attribution —
  step-07 (internal identifiers) → prompt 05(f); step-08 (engine by capability) → prompt 05(g);
  step-09 (library search) → Phase 5.1 / prompt 40; step-10 (real links) → prompt 07(c);
  step-11 (campaign placements) → Phase 5.4 evaluation; step-12 (AI usage ledger) → Phase 2.5 /
  prompts 20–22; step-13 (conformance suite, dual-repository risk) → Phase 3 risk mitigation /
  prompts 28–30. Its verified strengths and closed findings are reflected in the new audit's
  narrative; its step 1–6 completion records live in git history (commits cited in the new audit).
- **Replacement:** `docs/audits/CURRENT_STATE_AUDIT.md` + `docs/roadmap/*`.
- **References to update:** root `README.md`, `docs/README.md` (plus M2's file, deleted together).

### M6 — `docs/archived/` (entire directory: README ledger + 16 documents, ~10,600 lines)

- **Reason:** three completed, superseded historical programs (first-pass audit + its fully
  implemented roadmap, the UX audit/implementation/design-brief trilogy, the MVP alignment and
  implementation sequence, the accounts phase-1 plan, the product-evolution note). All are
  banner-marked non-authoritative; their continued presence costs link-gate and search budget and
  can mislead agents despite the banners. The prior "archive, never delete" preference is
  superseded by this audit's mandate (D16).
- **Preserved:** the migration-ordering rationale from `LIGHTFRAME_MVP_IMPLEMENTATION_SEQUENCE.md`
  already exists in `docs/CLOUD_PERSISTENCE.md`'s per-migration ledger (verified by the docs
  auditor); step→commit completion tables remain permanently recoverable in git history; no other
  unique still-valid guidance was identified in review.
- **Replacement:** none needed (history), `docs/audits/CURRENT_STATE_AUDIT.md` for current truth.
- **References to update:** `CLAUDE.md` (historical-material line), `AGENTS.md` ("Read
  selectively" line), root `README.md`, `docs/README.md`, `docs/MVP_ACCEPTANCE.md` (two links),
  `docs/user-flows/navigation-map.md`, `docs/user-flows/gaps-and-usability-audit.md`,
  `docs/deferred-account-and-infrastructure-roadmap.md`. Prompt 08 must grep every deleted
  filename repo-wide (tracked text files) and fix or remove each reference.

### M7 — non-documentation removals bundled for the same approval

- `.claude/worktrees/exciting-goldstine-c5dfcd/` — leftover git worktree (2026-08-18) whose
  commit is contained in merged branches; remove with `git worktree remove` **after confirming no
  uncommitted work inside it**. (Not a doc; listed because it duplicates every rule file in
  searches.)
- `.superdesign/tmp/*.html` (8 untracked draft files) — local cleanup, not a git change.

**Not deleted despite age (deliberate):** `SECURITY.md`, `LICENSE`-class files (none present to
prune), `docs/MVP_ACCEPTANCE.md` (acceptance evidence record), `docs/decisions/` ADRs (decision
history), `docs/CLOUD_PERSISTENCE.md` migration ledger, `LESSONS.md`, and all current-state
user-flow documentation.

## 2. Kept files — dispositions and required corrections

| File                                                                                                                         | Disposition                              | Action taken now / scheduled                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                                                                                  | Keep (routing layer)                     | Pointers updated to the new canon (this audit); rows for deleted docs removed at prompt 08                                                         |
| `AGENTS.md`                                                                                                                  | Keep (long-form policy)                  | "Read selectively" updated to the canon; "implement current behavior, not a target state" qualified by the approved-roadmap exception (this audit) |
| `apps/web/AGENTS.md`, `apps/api/AGENTS.md`, `packages/domain/AGENTS.md`, `packages/contracts/AGENTS.md`                      | Keep                                     | No changes needed                                                                                                                                  |
| `LESSONS.md`                                                                                                                 | Keep                                     | None                                                                                                                                               |
| `SECURITY.md`                                                                                                                | Keep                                     | None                                                                                                                                               |
| Root `README.md`                                                                                                             | Keep, slim later (DOCS-5)                | Documentation pointers updated now; full slim-down scheduled as a refactor when next touched                                                       |
| `docs/README.md`                                                                                                             | **Rewritten** (this audit)               | Now the index of the canon; lists superseded docs pending deletion                                                                                 |
| `docs/ARCHITECTURE.md`                                                                                                       | Keep; split later (DOCS-6)               | Vision/roadmap links updated at prompt 08                                                                                                          |
| `docs/CLOUD_PERSISTENCE.md`                                                                                                  | Keep                                     | None                                                                                                                                               |
| `docs/PRIVACY_AND_TEMPORARY_DATA.md`                                                                                         | Keep                                     | None                                                                                                                                               |
| `docs/TESTING.md`                                                                                                            | Keep                                     | Prompt 11 adds the vitest/Playwright sequencing rule                                                                                               |
| `docs/MANUAL_QA.md`                                                                                                          | Keep (only record physical QA never ran) | None                                                                                                                                               |
| `docs/LIVE_PROVIDER_SMOKE.md`                                                                                                | Keep                                     | Prompt 08 fixes the env-profile paragraph (DOCS-11)                                                                                                |
| `docs/BROWSER_SUPPORT.md`, `docs/RECORDING_MEMORY_POLICY.md`, `docs/Image_Generation.md`, `docs/screenshot-test-coverage.md` | Keep                                     | None (optional casing rename for Image_Generation deferred)                                                                                        |
| `docs/MVP_ACCEPTANCE.md`                                                                                                     | Keep (evidence record)                   | Prompt 08 repoints its links; prompt 24 records the Phase-2 re-acceptance                                                                          |
| `docs/MAINTAINABILITY_AUDIT.md`                                                                                              | Keep                                     | Prompt 08 adds a pointer that open findings are consolidated in the new audit register                                                             |
| `docs/REMOTE_BACKEND_HANDOFF.md`, `docs/deferred-account-and-infrastructure-roadmap.md`                                      | Keep (deferred plans behind D9)          | Prompt 08 repoints links                                                                                                                           |
| `docs/decisions/` (README + 3 ADRs)                                                                                          | Keep                                     | Prompt 08 repoints two links in `0002-durable-project-aggregate.md`                                                                                |
| `docs/user-flows/` (all)                                                                                                     | Keep (current-state authority)           | Prompt 08 applies DOCS-2/3/13 + feature-behavior 15/17/18 corrections; gaps doc gains a header pointing open items at the new audit register       |
| `.superdesign/` (tracked files)                                                                                              | Keep (tool state)                        | None                                                                                                                                               |
| `.github/pull_request_template.md`, `stories/README.md`                                                                      | Keep                                     | None                                                                                                                                               |
| **New canon** (`docs/product/*`, `docs/audits/*`, `docs/architecture/*`, `docs/roadmap/*`, `docs/DECISIONS_REQUIRED.md`)     | Created by this audit                    | —                                                                                                                                                  |

## 3. Rule-file consolidation

Repository agent guidance remains exactly two root files (`CLAUDE.md` routing → `AGENTS.md`
policy) plus the four one-page workspace guides — already the smallest sensible number. No Cursor/
Copilot/Windsurf/Cline rule files exist. The updates made now: both root files direct agents to
read the canonical vision and domain model, keep AI optional, preserve Campaign/Project
semantics, and inspect code before assuming — without duplicating the vision's content.

## 4. Execution and validation

Prompt 08 executes this manifest after approval: delete M1–M6, apply §2's scheduled corrections,
grep every deleted path repo-wide and repair references, then run `bun run check:docs`,
`bun run format:check`, and `bun run check:retired-program` — all must be green. This report then
gains a "Executed on <date>" note per manifest entry (the only post-execution edit it needs).
