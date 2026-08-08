# Documentation map

Use the narrowest authoritative document. Do not copy detailed rules into several files.

## Start here

| Document                                                    | Status  | Owner               | Source of truth for                                                           | Last reviewed |
| ----------------------------------------------------------- | ------- | ------------------- | ----------------------------------------------------------------------------- | ------------- |
| [Project README](../README.md)                              | Current | Product/engineering | Product overview, setup, configuration, commands, and release posture         | 2026-08-07    |
| [Repository working guide](../AGENTS.md)                    | Current | Engineering         | Repository-wide work, validation, and stop conditions                         | 2026-08-08    |
| [Security policy](../SECURITY.md)                           | Current | Repository owner    | Private vulnerability reporting scope and expectations                        | 2026-08-08    |
| [Architecture](ARCHITECTURE.md)                             | Current | Engineering         | Dependency, ownership, lifecycle, persistence, API, and deployment boundaries | 2026-08-07    |
| [User stories](userStories/README.md)                       | Current | Product/QA          | Observable journeys and manual validation limits                              | 2026-08-07    |
| [Privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md) | Current | Product/engineering | Data location, provider contact, retention, deletion, and cost boundaries     | 2026-08-07    |
| [Testing strategy](TESTING.md)                              | Current | Engineering/QA      | Test layers, commands, CI scope, visual policy, and release validation        | 2026-08-07    |
| [Manual QA](MANUAL_QA.md)                                   | Current | QA                  | Physical device, touch, accessibility, media, and cleanup checks              | 2026-08-05    |
| [Live provider smoke](LIVE_PROVIDER_SMOKE.md)               | Current | Engineering/QA      | Authorized, opt-in, cost-bearing provider validation                          | 2026-08-05    |
| [Recording memory policy](RECORDING_MEMORY_POLICY.md)       | Current | Engineering/QA      | Real 300-second memory measurement and support limits                         | 2026-08-05    |
| [Browser support](BROWSER_SUPPORT.md)                       | Current | Engineering/QA      | Claimed browser/device support and remaining manual checks                    | 2026-08-05    |
| [Screenshot coverage](screenshot-test-coverage.md)          | Current | Engineering/QA      | Curated visual matrix, platform baselines, and readiness rules                | 2026-08-05    |

## Account foundation and deferred infrastructure

Phase 1 remains the default local runtime. The database/R2 implementation is configuration-gated
and does not authorize public deployment or relax the loopback boundary.

| Document                                                                                      | Status  | Owner               | Use                                                                                     |
| --------------------------------------------------------------------------------------------- | ------- | ------------------- | --------------------------------------------------------------------------------------- |
| [User Accounts Phase 1 audit and plan](user-accounts-phase-1-audit-and-plan.md)               | Current | Product/engineering | Implemented seeded-user/auth/ownership/saved-library decisions and validation checklist |
| [Neon, Drizzle, and Cloudflare R2](CLOUD_PERSISTENCE.md)                                      | Current | Engineering         | Implemented persistence modes, setup, backfill, rollback, and remaining launch gates    |
| [Deferred account and infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md) | Partial | Product/engineering | Remaining real-account, billing, operations, retention, and public-readiness path       |

## Focused technical references

| Document                                            | Use                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Architecture decisions](decisions/README.md)       | Accepted, proposed, pending, rejected, and superseded expensive-to-reverse decisions                     |
| [Maintainability audit](MAINTAINABILITY_AUDIT.md)   | Current repository-wide cleanup record, placement rules, deferred findings, and validation record        |
| [Reference image generation](Image_Generation.md)   | Optimizer, upload, provider selection, immutable asset, retry, and cleanup flow                          |
| [Remote backend handoff](REMOTE_BACKEND_HANDOFF.md) | Deferred design boundary for a separately approved remote product; not current behavior or authorization |

## Rationale and UI catalog

| Document                                      | Use                                              |
| --------------------------------------------- | ------------------------------------------------ |
| [Product evolution](PRODUCT_EVOLUTION.md)     | Durable rationale for major product changes      |
| [Engineering lessons](../LESSONS.md)          | Reusable constraints learned from implementation |
| [Storybook catalog](../stories/README.md)     | Story organization and test expectations         |
| [Storybook overview](../stories/Overview.mdx) | In-catalog orientation for reviewers             |

The duplicate product-state document and historical project-audit snapshots were removed after
their current requirements were consolidated into the project README, architecture, user stories,
testing strategy, manual QA, and focused current plans. Git history remains the archive.

Current documents and accepted ADRs describe implemented authority. Proposed or
decision-pending ADRs are not current behavior. Dated audit outcomes and
validation records are historical; maintained placement rules and explicitly
open audit findings remain current. Product evolution records historical
rationale, while the infrastructure roadmap owns explicitly deferred
public-production work.
