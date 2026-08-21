# Feature behaviour (user stories)

> Relocated from `docs/userStories/` on 2026-08-16 so that all user-flow documentation lives under
> [`docs/user-flows/`](../README.md). Content is unchanged apart from link depth.
>
> **Scope split:** [`../README.md`](../README.md) and its sibling documents own _route-level
> journeys, navigation and the UX audit_. The files in this directory own _per-capability
> observable behaviour_ — the finer-grained contract for one feature. When the two disagree, the
> code is authoritative and both should be corrected.

These stories describe observable behavior in the current local-first Studio. They are journey
references, not release-readiness claims or future requirements. They use **video** and current
feature names deliberately where the implemented contract is video-specific; the broader
Campaign, Project, and Asset vocabulary in [Product Vision](../../PRODUCT_VISION.md) does not make
future features current.

## Journeys

| Flow                                                     | Story                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Record or upload, then edit and save                     | [Existing video processing](12-existing-video-processing.md)                   |
| Trim, crop, relight, filter, and replace a source        | [Local non-destructive video editing](13-local-video-editing.md)               |
| Choose camera, microphone, local format, and quality     | [Configure capture settings](01-configure-capture-settings.md)                 |
| Preview and record without provider work                 | [Local camera capture](02-local-camera-capture.md)                             |
| Run and record a live character transformation           | [Live character transformation](03-character-ai-session.md)                    |
| Run and record live virtual try-on                       | [Virtual try-on session](04-virtual-try-on-session.md)                         |
| Understand retained creative-storage compatibility       | [Retired Recipe UI boundary](06-recipe-shelf.md)                               |
| Review, save, and release a take                         | [Take review and cleanup](07-take-review-and-cleanup.md)                       |
| Apply browser-local voice effects                        | [Local voice treatments](08-local-voice-treatments.md)                         |
| Browse, save, manage, and apply provider-backed voices   | [ElevenLabs voice workflow](09-elevenlabs-voice-workflow.md)                   |
| Recover from missing capabilities                        | [Capability and recovery boundaries](10-capability-and-recovery-boundaries.md) |
| Build and preload a reusable character                   | [Studio character builder](11-studio-character-builder.md)                     |
| Log in, restore, and log out safely                      | [Login and local session](14-login-and-session.md)                             |
| Orient, create, browse Assets, and navigate responsively | [Dashboard, Assets, and navigation](19-dashboard-and-navigation.md)            |
| Save, browse, version, and reload local videos           | [Videos in Assets](15-saved-video-gallery.md)                                  |
| Reuse saved characters, outfits, voices, and videos      | [Creative Assets](16-saved-creative-libraries.md)                              |
| Create, resume, process, and save one Project video      | [Project lifecycle and immutable source](17-empty-project-lifecycle.md)        |
| Organize Projects with optional Campaigns                | [Campaign organization](18-campaign-organization.md)                           |

## Shared runtime rules

- `/` is the provider-free entry and Login surface. Dashboard (`/dashboard`), Create
  (`/studio/create`), Project overview/workspace, Campaign, and `/assets/*` routes are
  authenticated views of one active Studio runtime; every other path returns to `/`.
- Dashboard and other organization routes hide the persistent media stage and start no media or
  provider work. Create and Project workspaces begin in neutral Local Camera mode with camera and
  microphone off. Only an explicit control-bar or upload-panel action acquires media; only
  an explicit AI Start contacts a provider.
- Retired Guided repositories and presentation code are removed. Their records are not imported
  into Saved Videos and cannot revive the retired Guided experience.
- Browser navigation cannot abandon recording/finalization or an active video render. Leaving with
  a temporary take, active Voice process, dirty local video edit, or dirty configuration requires
  confirmed discard.
- Camera access, provider contact, and billable work require an explicit action. Local Camera does
  not request provider credentials, load the Decart SDK, or send media externally.
- The primary flow records or uploads a source, reviews it, and optionally applies Character Swap,
  Virtual Try-On, and/or Voice, then saves the result before exact Download from Videos in Assets.
  Live Character/VTO transformation is an advanced flow.
- Campaign and Project lifecycle/source management is user-facing, including optional membership,
  move/detach, the virtual No Campaign group, durable source resume, and guarded bounded session
  autosave. Creative/edit checkpoints, recoverable visual processing, and exact output save are
  implemented. Bounded Project changes, processing attempts/results, and output-Version history
  support exact preview, explicit reuse, and Download. Provider Voice and advanced live Project
  starts remain gated when they cannot meet durable reconnect/result-retention requirements.
- Character Builder owns true character creation and editing. Prompt authoring outside it is a
  plain direction field in AI Settings; the structured Prompt Workshop is retired, and Recipe was
  never exposed as an Asset type.
- Saved Character Wardrobe owns normalized original/variant browsing and variant creation while
  reusing the same compatibility metadata, immutable reference store, and overlay/media ownership.
- Studio keeps one mounted media stage and one temporary take pipeline. Organization pages mount
  neither: no stage, no player, no capture graph. Its immutable source may be recorded, uploaded, or
  a validated local edit; presentation selects the voiced, visual, or source layer.
- An uploaded workflow may run either exact batch model once, never both. The creator may switch
  the single active model before submission; only the active choice is used.
- The recording and Decart session limits are independent: each warns at 270 seconds and ends
  through its own safe path at 300 seconds.
- Compatibility prompt metadata is user-namespaced browser data and may revision-sync to Neon when configured.
  Builder reference and saved-video bytes are authenticated assets in the selected local/R2 store.
  In authoritative Neon/R2, creative-library relationships retain saved references while explicit
  discard and 24-hour inactive-orphan cleanup remove unreferenced staged assets. AI Settings
  portrait and garment uploads are tab-ephemeral.

## Evidence boundary

Deterministic tests cover the implemented journeys, including synthetic provider and 300-second
cases. The [testing strategy](../../TESTING.md) maps those critical journeys to the smallest useful
domain, controller, API, browser, or visual layer. It does not qualify physical devices,
accessibility tools, codecs, memory behavior, live provider entitlement/output, or cleanup.
The [MVP acceptance runbook](../../MVP_ACCEPTANCE.md) is the only current go/no-go record for the
complete local Campaign/Project journey; the presence of these stories is not release evidence.
Use [Manual QA](../../MANUAL_QA.md) and the authorized
[live-provider procedure](../../LIVE_PROVIDER_SMOKE.md) for those environment-dependent checks.
