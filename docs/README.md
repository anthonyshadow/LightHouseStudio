# Documentation map

Use the narrowest authoritative document. Do not copy detailed rules into several files.

## Start here

| Document                                                          | Status     | Owner               | Source of truth for                                                           | Last reviewed |
| ----------------------------------------------------------------- | ---------- | ------------------- | ----------------------------------------------------------------------------- | ------------- |
| [Project README](../README.md)                                    | Current    | Product/engineering | Product overview, setup, configuration, commands, and release posture         | 2026-08-05    |
| [Repository working guide](../AGENTS.md)                          | Current    | Engineering         | Required architecture, validation, and stop conditions                        | 2026-08-05    |
| [Product state](product-state.md)                                 | Current    | Product             | Current capabilities, limitations, and decisions                              | 2026-08-05    |
| [Architecture](ARCHITECTURE.md)                                   | Current    | Engineering         | Dependency, ownership, lifecycle, persistence, API, and deployment boundaries | 2026-08-05    |
| [User stories](userStories/README.md)                             | Current    | Product/QA          | Observable journeys and manual validation limits                              | 2026-08-05    |
| [Privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md)       | Current    | Product/engineering | Data location, provider contact, retention, deletion, and cost boundaries     | 2026-08-05    |
| [Testing strategy](TESTING.md)                                    | Current    | Engineering/QA      | Test layers, commands, CI scope, visual policy, and release validation        | 2026-08-05    |
| [Manual QA](MANUAL_QA.md)                                         | Current    | QA                  | Physical device, touch, accessibility, media, and cleanup checks              | 2026-08-05    |
| [Live provider smoke](LIVE_PROVIDER_SMOKE.md)                     | Current    | Engineering/QA      | Authorized, opt-in, cost-bearing provider validation                          | 2026-08-05    |
| [Recording memory policy](RECORDING_MEMORY_POLICY.md)             | Current    | Engineering/QA      | Real 300-second memory measurement and support limits                         | 2026-08-05    |
| [Browser support](BROWSER_SUPPORT.md)                             | Current    | Engineering/QA      | Claimed browser/device support and remaining manual checks                    | 2026-08-05    |
| [Screenshot coverage](screenshot-test-coverage.md)                | Current    | Engineering/QA      | Curated visual matrix, platform baselines, and readiness rules                | 2026-08-05    |
| [Remaining validation plan](project-audit-implementation-plan.md) | Current    | Engineering         | Environment-dependent manual/live validation still to perform                 | 2026-08-05    |
| [Audit findings](project-audit-findings.md)                       | Current    | Engineering         | Verified technical concerns and their implemented outcomes                    | 2026-08-05    |
| [Completed work](project-audit-completed-work.md)                 | Historical | Engineering         | Durable summary of completed technical audit outcomes                         | 2026-08-05    |

## Focused technical references

| Document                                            | Use                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
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

Historical audit snapshots and the duplicate immediate plan were removed after their current
findings were consolidated into the product state, findings register, active plan, and completed
work. Git history remains the archive.
