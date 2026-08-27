# Documentation map

Use the narrowest authoritative document. Do not copy detailed rules into several files.

Documentation is separated into five kinds. Never mix them in one document without labelling:

| Kind                     | Where                                                                                                                                                                                                                                                                    | Authority                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Current system**       | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CLOUD_PERSISTENCE.md`](CLOUD_PERSISTENCE.md), [`PRIVACY_AND_TEMPORARY_DATA.md`](PRIVACY_AND_TEMPORARY_DATA.md)                                                                                                                   | How the product is built today             |
| **Product / user flows** | [`user-flows/`](user-flows/README.md)                                                                                                                                                                                                                                    | How a user moves through the product today |
| **Development guidance** | [`../CLAUDE.md`](../CLAUDE.md), [`../AGENTS.md`](../AGENTS.md), [`TESTING.md`](TESTING.md)                                                                                                                                                                               | How to change the product safely           |
| **Future plans**         | [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md), [`PROJECT_DELIVERABLE_MODEL.md`](PROJECT_DELIVERABLE_MODEL.md), [`REMOTE_BACKEND_HANDOFF.md`](REMOTE_BACKEND_HANDOFF.md), [`deferred-account-and-infrastructure-roadmap.md`](deferred-account-and-infrastructure-roadmap.md) | Not implemented; never current authority   |
| **Archived**             | [`archived/`](archived/README.md)                                                                                                                                                                                                                                        | Historical context only                    |

Product direction does not override implementation authority. Product Vision and Product Roadmap
describe intent; the README, Architecture, user flows, privacy guide and accepted ADRs describe
implemented behaviour and constraints.

## Where to find things

| I need…                                                                     | Read                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| What the product does, and how a user moves through it                      | [`user-flows/README.md`](user-flows/README.md)                                             |
| The complete route table and redirects                                      | [`user-flows/navigation-map.md`](user-flows/navigation-map.md)                             |
| Known usability problems, gaps and likely bugs                              | [`user-flows/gaps-and-usability-audit.md`](user-flows/gaps-and-usability-audit.md)         |
| The first-pass product assessment and its closed findings — **archived**    | [`archived/00-executive-summary.md`](archived/00-executive-summary.md)                     |
| The current cross-functional product assessment and its roadmap             | [`product-audit/2026-08-26/README.md`](product-audit/2026-08-26/README.md)                 |
| A UI/UX assessment of the interface as it was in August 2026 — **archived** | [`archived/LightFrameUXAudit.md`](archived/LightFrameUXAudit.md)                           |
| The order that completed UX work was done in — **archived**                 | [`archived/LightFrameUXImplementationPlan.md`](archived/LightFrameUXImplementationPlan.md) |
| The design briefs behind four shipped layouts — **archived**                | [`archived/LightFrameSuperdesignPrompts.md`](archived/LightFrameSuperdesignPrompts.md)     |
| The observable contract for one capability                                  | [`user-flows/feature-behavior/README.md`](user-flows/feature-behavior/README.md)           |
| Module boundaries, ownership, lifecycle, API and deployment                 | [`ARCHITECTURE.md`](ARCHITECTURE.md)                                                       |
| Setup, scripts, configuration and release posture                           | [`../README.md`](../README.md)                                                             |
| How to work in this repository as an agent                                  | [`../CLAUDE.md`](../CLAUDE.md), then [`../AGENTS.md`](../AGENTS.md)                        |
| Which tests to run for a change                                             | [`TESTING.md`](TESTING.md)                                                                 |
| Data location, provider contact, retention, cost boundaries                 | [`PRIVACY_AND_TEMPORARY_DATA.md`](PRIVACY_AND_TEMPORARY_DATA.md)                           |
| Database and object-storage modes, migrations, rollback                     | [`CLOUD_PERSISTENCE.md`](CLOUD_PERSISTENCE.md)                                             |
| Reference-image generation and provider selection                           | [`Image_Generation.md`](Image_Generation.md)                                               |
| An expensive-to-reverse decision and its rationale                          | [`decisions/README.md`](decisions/README.md)                                               |
| Why something is the way it is, historically                                | [`archived/README.md`](archived/README.md)                                                 |

## Current system

| Document                                                    | Owner               | Source of truth for                                                           |
| ----------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| [Architecture](ARCHITECTURE.md)                             | Engineering         | Dependency, ownership, lifecycle, persistence, API, and deployment boundaries |
| [Project README](../README.md)                              | Product/engineering | Product overview, setup, configuration, commands, release posture             |
| [Neon, Drizzle, and Cloudflare R2](CLOUD_PERSISTENCE.md)    | Engineering         | Persistence modes, setup, backfill, rollback, remaining launch gates          |
| [Privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md) | Product/engineering | Data location, provider contact, retention, deletion, cost boundaries         |
| [Reference image generation](Image_Generation.md)           | Engineering         | Optimizer, upload, provider selection, immutable asset, retry, cleanup        |
| [Browser support](BROWSER_SUPPORT.md)                       | Engineering/QA      | Claimed browser/device support and remaining manual checks                    |
| [Recording memory policy](RECORDING_MEMORY_POLICY.md)       | Engineering/QA      | Measured 300-second memory limits and support boundaries                      |
| [Security policy](../SECURITY.md)                           | Repository owner    | Private vulnerability reporting scope                                         |

## Product and user flows

| Document                                                                        | Owner               | Source of truth for                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [User flows](user-flows/README.md)                                              | Product/engineering | Current route-level journeys, entry points, system behaviour, exit points                                                                                                                                                         |
| [Navigation map](user-flows/navigation-map.md)                                  | Engineering         | Routes, redirects, route-driven side effects, reachability                                                                                                                                                                        |
| [Gaps and usability audit](user-flows/gaps-and-usability-audit.md)              | Product/engineering | Known flow gaps, missing/redundant UI, likely bugs, prioritised remediation                                                                                                                                                       |
| [Product audit — second pass (26 Aug 2026)](product-audit/2026-08-26/README.md) | Product/engineering | The current assessment: what the product does, what is wrong with it, and a thirteen-step roadmap with a prompt per step. **Not implemented** — an assessment and a proposal                                                      |
| [Product audit — first pass (21 Aug 2026)](archived/README.md)                  | Product/engineering | **Archived.** Cross-functional assessment and prioritised findings. Its fifteen-step roadmap is fully implemented; the findings describe the product as audited, not as it stands                                                 |
| [Feature behaviour](user-flows/feature-behavior/README.md)                      | Product/QA          | Per-capability observable behaviour and manual validation limits                                                                                                                                                                  |
| [UI/UX audit](archived/LightFrameUXAudit.md)                                    | Product/design      | **Archived.** The interface as implemented on 2026-08-22: classified findings, cross-page consistency, first-run experience. An assessment, not implementation authority. Its plan is complete; fixed findings are struck through |
| [UX implementation plan](archived/LightFrameUXImplementationPlan.md)            | Product/engineering | **Archived.** Execution order for the UI/UX audit, with one ready-to-run prompt and its scoped validation per item. **All five tiers complete**; each item records what it became                                                 |
| [Superdesign prompts](archived/LightFrameSuperdesignPrompts.md)                 | Product/design      | **Archived.** The four areas the UI/UX audit judged to need a new layout rather than a fix, and the brief for each. All four have shipped                                                                                         |
| [Product Vision](PRODUCT_VISION.md)                                             | Product             | Positioning, audiences, hierarchy, principles, terminology                                                                                                                                                                        |
| [Campaign and Project MVP definition](MVP_DEFINITION.md)                        | Product/engineering | Bounded Campaign/Project/video MVP model and completion criteria                                                                                                                                                                  |

## Development guidance

| Document                                           | Owner          | Source of truth for                                                                      |
| -------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| [Agent quick guide](../CLAUDE.md)                  | Engineering    | Task routing, hard rules, scoped validation                                              |
| [Repository working guide](../AGENTS.md)           | Engineering    | Long-form repository work, boundaries, and stop conditions                               |
| [Testing strategy](TESTING.md)                     | Engineering/QA | Test layers, commands, CI scope, visual policy, release validation                       |
| [Manual QA](MANUAL_QA.md)                          | QA             | Physical device, touch, accessibility, media, and cleanup checks                         |
| [Live provider smoke](LIVE_PROVIDER_SMOKE.md)      | Engineering/QA | Authorized, opt-in, cost-bearing provider validation                                     |
| [Screenshot coverage](screenshot-test-coverage.md) | Engineering/QA | Curated visual matrix, platform baselines, readiness rules                               |
| [MVP acceptance runbook](MVP_ACCEPTANCE.md)        | Engineering/QA | Criterion evidence, release commands, manual limits, local go/no-go                      |
| [Maintainability audit](MAINTAINABILITY_AUDIT.md)  | Engineering    | Placement rules and **open** deferred findings; its dated cleanup records are historical |
| [Architecture decisions](decisions/README.md)      | Engineering    | Accepted, proposed, pending, rejected, superseded decisions                              |
| [Engineering lessons](../LESSONS.md)               | Engineering    | Reusable constraints learned from implementation                                         |
| [Storybook catalog](../stories/README.md)          | Engineering    | Story organization and test expectations                                                 |

## Future plans — not implemented

| Document                                                                                      | Use                                                                                |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Product Roadmap](PRODUCT_ROADMAP.md)                                                         | Directional phases and future architecture considerations                          |
| [Deferred Project Deliverable model](PROJECT_DELIVERABLE_MODEL.md)                            | Future child aggregate for independently resumable video work inside one Project   |
| [Deferred account and infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md) | Service-readiness path for real accounts, operations, retention, public deployment |
| [Remote backend handoff](REMOTE_BACKEND_HANDOFF.md)                                           | Deferred design boundary for a separately approved remote product                  |

Configuration-gated cloud infrastructure does not authorize public deployment or relax the loopback
boundary. Phase 1 remains the default local runtime.

## Archived

See [`archived/README.md`](archived/README.md) for the ledger and the reason each document was
archived. Nothing in `archived/` is implementation authority.

## Maintaining this map

- One topic, one owner. If two documents both claim a topic, consolidate before adding a third.
- Update a document only when behaviour, contracts, commands, environment, privacy, persistence,
  provider or support boundaries change. Link instead of duplicating.
- `bun run check:docs` validates every relative link and anchor in `README.md`, `AGENTS.md` and
  everything under `docs/`. Run it after any documentation move.
