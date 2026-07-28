# Documentation map

Use this index to find the canonical source instead of copying rules between documents. “Audit
action” records the 2026-07-28 documentation review; it is not a lifecycle status.

## Project and engineering

| Document                                                         | Purpose / intended reader                                                 | Authority and update trigger                                                                                           | Audit action   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------- |
| [`../README.md`](../README.md)                                   | Product overview, setup, configuration, commands; all readers             | Authoritative for entry-level project/setup facts. Update with capabilities, commands, environment, or release status. | Update         |
| [`../AGENTS.md`](../AGENTS.md)                                   | Compact repository rules; coding agents/contributors                      | Authoritative working guide. Update when boundaries, gates, or required reading changes.                               | Update         |
| [`README.md`](README.md)                                         | Documentation inventory and authority map; all readers                    | Canonical document map. Update whenever a retained document is created, moved, removed, or changes authority.          | Create         |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                             | Current ownership, lifecycles, boundaries; engineers                      | Canonical current architecture. Update with routes, ownership, provider, persistence, test, or deployment changes.     | Update         |
| [`PRIVACY_AND_TEMPORARY_DATA.md`](PRIVACY_AND_TEMPORARY_DATA.md) | Data location, retention, provider contact/cost; product, QA, engineering | Canonical data/privacy boundary. Update with storage, deletion, provider, or deployment changes.                       | Keep unchanged |
| [`BROWSER_SUPPORT.md`](BROWSER_SUPPORT.md)                       | Supported browser behavior and responsive constraints; QA/engineering     | Canonical compatibility policy. Update with browser, codec, viewport, touch, or visual-matrix changes.                 | Update         |
| [`RECORDING_MEMORY_POLICY.md`](RECORDING_MEMORY_POLICY.md)       | Measurement protocol for in-memory recording; QA/engineering              | Authoritative release-evidence policy. Update with recorder/processing or support-limit changes.                       | Keep unchanged |
| [`MANUAL_QA.md`](MANUAL_QA.md)                                   | Physical device and manual release checks; QA                             | Canonical manual checklist. Update when user-visible flows or support claims change.                                   | Keep unchanged |
| [`LIVE_PROVIDER_SMOKE.md`](LIVE_PROVIDER_SMOKE.md)               | Opt-in paid/live provider checks; authorized release testers              | Canonical live-provider procedure. Update with provider/model/SDK/account requirements.                                | Update         |
| [`Image_Generation.md`](Image_Generation.md)                     | Reference optimizer/generation API flow; integration engineers            | Canonical image-provider flow. Update with contracts, providers, models, or retention.                                 | Keep unchanged |
| [`PRODUCT_EVOLUTION.md`](PRODUCT_EVOLUTION.md)                   | Historical product rationale; product/engineering                         | Historical, not current implementation truth. Append when a major direction changes; do not rewrite history.           | Keep unchanged |
| [`../LESSONS.md`](../LESSONS.md)                                 | Durable engineering lessons; contributors                                 | Historical rationale. Add only reusable lessons; do not turn into a task plan.                                         | Keep unchanged |
| [`../stories/README.md`](../stories/README.md)                   | Storybook catalog guide; UI contributors                                  | Canonical Storybook usage. Update with catalog/test workflow changes.                                                  | Keep unchanged |
| [`../stories/Overview.mdx`](../stories/Overview.mdx)             | In-Storybook overview; UI reviewers                                       | Current component-catalog landing content. Update with catalog organization.                                           | Keep unchanged |

## Current product journeys

[`userStories/README.md`](userStories/README.md) is the index and shared behavioral contract.
Stories describe observable current behavior, not aspirations.

| Document                                                                                                                         | Journey                                  | Update trigger                                    | Audit action                           |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| [`userStories/README.md`](userStories/README.md)                                                                                 | Journey index and shared invariants      | Any journey addition, removal, or shared contract | Update                                 |
| [`userStories/01-configure-capture-settings.md`](userStories/01-configure-capture-settings.md)                                   | Session-only camera/mic/quality setup    | Capture preference behavior                       | Keep unchanged                         |
| [`userStories/02-local-camera-capture.md`](userStories/02-local-camera-capture.md)                                               | Provider-free preview, recording, review | Media, recording, or recovery behavior            | Update                                 |
| [`userStories/03-character-ai-session.md`](userStories/03-character-ai-session.md)                                               | Lucy 2.5 start/apply/stop                | Decart/session behavior                           | Keep unchanged                         |
| [`userStories/04-virtual-try-on-session.md`](userStories/04-virtual-try-on-session.md)                                           | VTON 3 preparation and live session      | VTO behavior/model contract                       | Keep unchanged                         |
| [`userStories/05-character-workshop-and-reference-generation.md`](userStories/05-character-workshop-and-reference-generation.md) | Structured object prompt work            | Workshop/reference behavior                       | Keep unchanged                         |
| [`userStories/06-recipe-shelf.md`](userStories/06-recipe-shelf.md)                                                               | Saved/recent/character library           | Repository, category, or reuse behavior           | Keep unchanged                         |
| [`userStories/07-take-review-and-cleanup.md`](userStories/07-take-review-and-cleanup.md)                                         | Playback/download/close/discard          | Recording artifact policy                         | Keep unchanged                         |
| [`userStories/08-local-voice-treatments.md`](userStories/08-local-voice-treatments.md)                                           | Browser-local voice processing           | Local processing/remux                            | Keep unchanged                         |
| [`userStories/09-elevenlabs-voice-workflow.md`](userStories/09-elevenlabs-voice-workflow.md)                                     | Saved voice browse/preview/apply         | ElevenLabs boundary                               | Keep unchanged                         |
| [`userStories/10-capability-and-recovery-boundaries.md`](userStories/10-capability-and-recovery-boundaries.md)                   | Independent degradation and recovery     | Capability/error behavior                         | Update                                 |
| [`userStories/11-studio-character-builder.md`](userStories/11-studio-character-builder.md)                                       | Reusable Character Builder               | Builder/draft/reference/save behavior             | Replace/move from obsolete nested path |

## Audit and planning

These are dated audit outputs. The findings register is the cross-specialist recommendation source;
the active plan contains only incomplete phases.

| Document                                                                       | Purpose / intended reader                                                    | Authority and update trigger                                                             | Audit action |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------ |
| [`architecture-audit.md`](architecture-audit.md)                               | Detailed systems/provider/security assessment; engineering                   | Audit evidence snapshot; update only for a deliberate re-audit or finding status note.   | Create       |
| [`product-state.md`](product-state.md)                                         | Product/MVP/roadmap assessment; product and stakeholders                     | Audit snapshot, not implemented-feature truth. Revisit after pilot evidence.             | Create       |
| [`ui-ux-current-state.md`](ui-ux-current-state.md)                             | Surface/journey/responsive/accessibility assessment; design/engineering      | Audit snapshot with evidence. Update status after intentional UX phases.                 | Create       |
| [`project-audit-findings.md`](project-audit-findings.md)                       | Unified prioritized findings and specialist resolutions; all decision makers | Canonical audit findings register. Update status/cross-links when phases complete.       | Create       |
| [`project-audit-implementation-plan.md`](project-audit-implementation-plan.md) | Incomplete phased work with implementation prompts; product/engineering      | Canonical active sequence. Remove a phase only after its criteria pass.                  | Create       |
| [`imediate-implementation-plan.md`](imediate-implementation-plan.md)           | Dependency-safe local-to-remote execution order; product/engineering/QA      | Derived pre-remote sequencing and exit gate. Update when canonical phase status changes. | Create       |
| [`project-audit-completed-work.md`](project-audit-completed-work.md)           | Concise history removed from the active plan; all readers                    | Append-only completion record, corrected only for factual errors.                        | Create       |
| [`screenshot-test-coverage.md`](screenshot-test-coverage.md)                   | Curated state/viewport/fixture manifest; UI/QA                               | Canonical visual-regression manifest. Update with matrix or fixture changes.             | Create       |

## Removed material

The audit deleted 14 unreferenced PNGs under the former
`userStories/11-new-user-character-ai-voice-download/images/` directory. They depicted the retired
Guided runtime or older Workshop/Shelf states, were not linked from retained documentation, and
could misrepresent the current single-route Studio. Git history remains the recovery path.
Historical product rationale remains in `PRODUCT_EVOLUTION.md` and `LESSONS.md`.

No document was merged or archived. No historical rationale document was deleted.
