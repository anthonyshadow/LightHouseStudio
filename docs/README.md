# Documentation map

Use the narrowest authoritative document; one topic has one owner. `bun run check:docs` validates
every relative link and anchor in `README.md`, `AGENTS.md`, and everything under `docs/`.

## Canonical sources (the canon)

| Topic                                                             | Canonical document                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Product vision, principles, MVP boundary, non-goals               | [`product/PRODUCT_VISION.md`](product/PRODUCT_VISION.md)                           |
| Product terminology, domain model, lifecycles, deprecated names   | [`product/DOMAIN_MODEL.md`](product/DOMAIN_MODEL.md)                               |
| Target user flows and information architecture                    | [`product/TARGET_USER_FLOWS.md`](product/TARGET_USER_FLOWS.md)                     |
| Target architecture and current→target migration strategy         | [`architecture/TARGET_ARCHITECTURE.md`](architecture/TARGET_ARCHITECTURE.md)       |
| Audit findings (current state, evidence, priorities)              | [`audits/CURRENT_STATE_AUDIT.md`](audits/CURRENT_STATE_AUDIT.md)                   |
| Roadmap (phases, slices, acceptance criteria)                     | [`roadmap/PRODUCT_ROADMAP.md`](roadmap/PRODUCT_ROADMAP.md)                         |
| Implementation prompts (numbered, copy-paste)                     | [`roadmap/IMPLEMENTATION_PROMPTS.md`](roadmap/IMPLEMENTATION_PROMPTS.md)           |
| Open product/architecture decisions                               | [`DECISIONS_REQUIRED.md`](DECISIONS_REQUIRED.md)                                   |
| Documentation dispositions and the deletion manifest              | [`audits/DOCUMENTATION_PRUNING_REPORT.md`](audits/DOCUMENTATION_PRUNING_REPORT.md) |
| Phase 1 acceptance record (criteria, gates, evidence, follow-ups) | [`audits/PHASE_1_VERIFICATION.md`](audits/PHASE_1_VERIFICATION.md)                 |
| Slice 2.1 subtitles audit and approved plan (prompt 13 → 14)      | [`roadmap/SLICE_2.1_SUBTITLES_PLAN.md`](roadmap/SLICE_2.1_SUBTITLES_PLAN.md)       |
| Engineering instructions for agents                               | [`../CLAUDE.md`](../CLAUDE.md) (routing) → [`../AGENTS.md`](../AGENTS.md) (policy) |

Product direction (vision, roadmap) never overrides implementation authority: the code, the
current-system docs below, and the user-flow docs describe what exists today.

## Current system

| Document                                                    | Source of truth for                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Architecture](ARCHITECTURE.md)                             | Dependency, ownership, lifecycle, persistence, API, deployment boundaries as built |
| [Project README](../README.md)                              | Product overview, setup, configuration, commands, release posture                  |
| [Cloud persistence](CLOUD_PERSISTENCE.md)                   | Persistence modes, setup, backfill, rollback, migration ledger                     |
| [Privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md) | Data location, provider contact, retention, deletion, cost boundaries              |
| [Reference image generation](Image_Generation.md)           | Optimizer, upload, provider selection, immutable asset, retry, cleanup             |
| [Browser support](BROWSER_SUPPORT.md)                       | Claimed browser/device support and remaining manual checks                         |
| [Recording memory policy](RECORDING_MEMORY_POLICY.md)       | Measured recording memory limits and support boundaries                            |
| [Security policy](../SECURITY.md)                           | Private vulnerability reporting                                                    |

## Current user flows (as implemented)

| Document                                                           | Source of truth for                                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| [User flows](user-flows/README.md)                                 | Route-level journeys, entry points, system behavior today                                                                  |
| [Navigation map](user-flows/navigation-map.md)                     | Routes, redirects, route-driven side effects, reachability                                                                 |
| [Feature behaviour](user-flows/feature-behavior/README.md)         | Per-capability observable behavior and manual validation limits                                                            |
| [Gaps and usability audit](user-flows/gaps-and-usability-audit.md) | Historical finding-closure ledger; open items are consolidated in the [current-state audit](audits/CURRENT_STATE_AUDIT.md) |

## Development guidance

| Document                                           | Source of truth for                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Agent quick guide](../CLAUDE.md)                  | Task routing, hard rules, scoped validation                                    |
| [Repository working guide](../AGENTS.md)           | Long-form repository policy, boundaries, stop conditions                       |
| [Testing strategy](TESTING.md)                     | Test layers, commands, CI scope, visual policy, release validation             |
| [Manual QA](MANUAL_QA.md)                          | Physical device, touch, accessibility, media, cleanup checks                   |
| [Live provider smoke](LIVE_PROVIDER_SMOKE.md)      | Authorized, opt-in, cost-bearing provider validation                           |
| [Screenshot coverage](screenshot-test-coverage.md) | Curated visual matrix, platform baselines, readiness rules                     |
| [MVP acceptance runbook](MVP_ACCEPTANCE.md)        | Acceptance evidence records (candidate-specific)                               |
| [Maintainability audit](MAINTAINABILITY_AUDIT.md)  | Placement rules; its open findings are consolidated in the current-state audit |
| [Architecture decisions](decisions/README.md)      | Accepted, proposed, pending, rejected, superseded decisions                    |
| [Engineering lessons](../LESSONS.md)               | Reusable constraints learned from implementation                               |
| [Storybook catalog](../stories/README.md)          | Story organization and expectations                                            |

## Deferred plans (not implemented; never current authority)

| Document                                                                                      | Use                                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [Deferred account and infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md) | Service-readiness path gated behind decision D9   |
| [Remote backend handoff](REMOTE_BACKEND_HANDOFF.md)                                           | Boundary for a separately approved remote product |

## Superseded and deleted (2026-08-31)

Per the approved [pruning manifest](audits/DOCUMENTATION_PRUNING_REPORT.md), the former
`PRODUCT_VISION.md`, `PRODUCT_ROADMAP.md`, `MVP_DEFINITION.md`, `PROJECT_DELIVERABLE_MODEL.md`,
`product-audit/2026-08-26/`, and `archived/` were permanently removed. Their still-valid content
lives in the canon above; the removed text remains in git history.

## Maintaining this map

- One topic, one owner. If two documents claim a topic, consolidate before adding a third.
- Update a document only when behavior, contracts, commands, environment, privacy, persistence,
  provider, or support boundaries change. Link instead of duplicating.
- Run `bun run check:docs` after any documentation move.
