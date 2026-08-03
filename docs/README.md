# Documentation map

Use the narrowest authoritative document. Do not copy detailed rules into several files.

## Start here

| Document                                                    | Authority                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Project README](../README.md)                              | Product overview, setup, configuration, commands, and release posture                 |
| [Repository working guide](../AGENTS.md)                    | Required engineering boundaries, validation, and stop conditions                      |
| [Product state](product-state.md)                           | Current product, limitations, decisions, and success hypotheses                       |
| [Architecture](ARCHITECTURE.md)                             | Current dependency, ownership, lifecycle, persistence, API, and deployment boundaries |
| [User stories](userStories/README.md)                       | Observable current journeys and their evidence limits                                 |
| [Privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md) | Data location, provider contact, retention, deletion, and cost boundaries             |

## Historical controlled-pilot material

The former controlled-pilot scope and its validator/drill commands were retired on 2026-08-03.
These documents preserve rationale and possible future qualification inputs; they are not current
runtime or release gates.

| Document                                                           | Use                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [Release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md)           | Historical cohort, device/provider matrix, data promise, roles, metrics, and escalation |
| [Active implementation plan](project-audit-implementation-plan.md) | Incomplete implementation and validation work; former pilot phases are paused           |
| [Open findings](project-audit-findings.md)                         | Unresolved release findings and deferred public-product blockers                        |
| [Completed work](project-audit-completed-work.md)                  | Durable summary of implemented audit outcomes; not release evidence                     |
| [Qualification evidence](PILOT_QUALIFICATION_EVIDENCE.md)          | Content-free evidence schema and validator contract                                     |
| [Manual QA](MANUAL_QA.md)                                          | Physical device, touch, accessibility, media, and cleanup protocol                      |
| [Live provider smoke](LIVE_PROVIDER_SMOKE.md)                      | Authorized, opt-in, cost-bearing provider qualification                                 |
| [Data retirement checklist](PILOT_DATA_RETIREMENT_CHECKLIST.md)    | Per-participant isolation and whole-environment cleanup                                 |
| [Recording memory policy](RECORDING_MEMORY_POLICY.md)              | Real 300-second measurement and support gate                                            |
| [Browser support](BROWSER_SUPPORT.md)                              | Claimed browser/device support and current qualification status                         |
| [Testing strategy](TESTING.md)                                     | Layer ownership, commands, CI scope, visual policy, and new-test guidance               |
| [Screenshot coverage](screenshot-test-coverage.md)                 | Curated visual matrix, baselines, and readiness rules                                   |

Physical and live-provider results remain useful evidence but do not gate configured runtime
features under the current scope.

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
