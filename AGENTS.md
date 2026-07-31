# Repository working guide

Lightframe Studio is a local-first, single-operator browser camera studio. The current product goal
is a trustworthy short-form loop: Local preview → reusable Character → Lucy 2.5 → Record →
optional Voice → Download. VTO is secondary/beta and Workshop is advanced. The server is
loopback-only; do not turn future accounts, cloud storage, billing, or public deployment into
current MVP requirements.

Product-owner scope recorded 2026-07-28: touch/mobile creation is required; the supported take
maximum is 300 seconds; and Character, VTO, local Voice, ElevenLabs, OpenAI, BFL, and Wiro are all
included in pilot qualification. This is target scope, not a claim that the current runtime is
ready. OpenAI/BFL/Wiro still require separate startup-selected passes with no fallback. The
[controlled-pilot release contract](docs/CONTROLLED_PILOT_RELEASE_CONTRACT.md) freezes the
moderated cohort, physical qualification targets, independent 270/300-second warning behavior,
participant cleanup promise, provider/content rules, generic local owner roles, limits, metrics,
and escalation path. Those outcomes remain implementation/evidence gates, not open product
decisions. Monetization and future cloud ownership/portability remain deferred.

## Read before changing behavior

1. [`README.md`](README.md) for product/setup/commands.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for ownership and dependency direction.
3. The affected observable journey in [`docs/userStories/`](docs/userStories/README.md).
4. Provider/data work: [`docs/PRIVACY_AND_TEMPORARY_DATA.md`](docs/PRIVACY_AND_TEMPORARY_DATA.md)
   and [`docs/LIVE_PROVIDER_SMOKE.md`](docs/LIVE_PROVIDER_SMOKE.md).
5. Audit work: [`docs/project-audit-findings.md`](docs/project-audit-findings.md) and the relevant
   incomplete phase in [`docs/project-audit-implementation-plan.md`](docs/project-audit-implementation-plan.md).

Inspect the owning presentation, controller/orchestration, pure domain rule, HTTP contract/provider
adapter, and tests that exercise the complete journey. Do not infer behavior from a component name,
old story, or intended design.

## Runtime and install

- Node `>=24 <25`; `.nvmrc` pins the repository default. pnpm `>=11.18 <12`.
- `pnpm install` for ordinary local work; `pnpm install --frozen-lockfile` when reproducing CI.
- `/` is the provider-free entry and `/studio` is the only active Studio runtime. Every other path
  returns to `/`. Do not add aliases for retired pages.

## Architecture and state

- `packages/domain` and `packages/contracts` stay independent of React and provider payloads.
- `AppRouter.tsx` owns browser routing, route metadata, and the lazy Studio boundary.
  `StudioApp.tsx` remains the runtime composition boundary. Keep one persistent `MediaStage`,
  shared `OverlayPanel`, app-owned contracts, repositories, and existing adapters.
- The entry route must not mount Studio, load provider/media modules, request capabilities, acquire
  media, or contact a provider.
- Keep product policy in domain/orchestration, not presentation components or provider adapters.
- Split at ownership/lifecycle boundaries, not an arbitrary line count.
- Do not add a second media node/session, modal system, saved-character store, provider client, or
  generic repository spanning stores with different transaction models.
- The Upload Existing Video panel is the sole approved second-video exception: its inline player
  may borrow the current stream or artifact URL for capture/review, but it never owns tracks,
  creates a media/provider session, or replaces the persistent `MediaStage`.
- Browser storage is untrusted: schema-validate/sanitize, version persisted data, preserve opaque
  IDs/provenance/timestamps, and add migration tests.
- Temporary state may be session-only only when the current product contract says so. Never treat
  loopback Host hashes, device IDs, storage paths, or provider IDs as future user identity.

## Providers and security

- Provider contact is explicit, cost-sensitive, cancellable where supported, and server-mediated
  for permanent credentials. Never place secrets in `VITE_*`, browser bundles, logs, fixtures,
  screenshots, traces, or committed `.env` files.
- Local Camera must remain independent of provider credentials, token minting, SDK loading, and all
  external media/network traffic.
- Decart: use exact app-owned model IDs (`lucy-2.5`, pinned `lucy-vton-3`), scoped short-lived
  client tokens, lazy SDK loading, atomic full-state updates, explicit Start/Apply, safe normalized
  errors, and complete listener/client/track cleanup. Do not silently follow aliases or add
  provider fallback.
- ElevenLabs: browser through the same-origin API only; saved-library listing/revalidation only;
  explicit provider-intent header; preview does not upload the take; Apply sends the immutable
  original audio sidecar; preserve the original on every failure.
- OpenAI/BFL/Wiro: select one provider at startup; no automatic retry of initial billable
  submission and no fallback. Upload alone stays local. Keep provider request/poll/download formats
  inside their adapters.
- The current Host/Origin checks are a local broker boundary, not public authentication. Do not
  expose the app through LAN, tunnel, proxy, or public hostname without a separately approved
  auth/authorization/tenancy/rate/retention/security design.
- Do not forward raw provider bodies, messages, URLs, prompts, credentials, causes, or arbitrary
  error codes. Use allowlisted app-owned safe codes.

## Media, recording, and cleanup

- The creator of a stream, cloned track, recorder, timer, event listener, object URL, audio context,
  or provider client owns idempotent cleanup.
- Validate model input before camera/token/provider work. Guard late async results with generation
  or abort checks. Commit a healthy replacement before releasing an owned current resource.
- Recording borrows source tracks and never owns/stops them. Pin source identity at Start.
- Duplicate Stop must coalesce. Final recorder data and the optional sidecar settle before live or
  provider resources release. Main video remains authoritative if the sidecar fails.
- Enforce the app-owned 300-second maximum with an accessible warning and safe automatic
  Stop/finalize. Provider TTL/session callbacks do not replace that recording rule.
- Playback replaces live media on the same stage. Voice processing always starts from immutable
  originals; replacement occurs before old URL revocation; failure/cancel preserves the last valid
  artifact.
- Route exit cannot abandon recording/finalization. A temporary take, active Voice work, or dirty
  Shelf edit requires confirmed discard before leaving `/studio`; future `/studio/*` transitions
  must preserve the shared runtime.
- Do not solve memory pressure by silently evicting chunks/originals. Follow
  [`docs/RECORDING_MEMORY_POLICY.md`](docs/RECORDING_MEMORY_POLICY.md).

## UI, responsive behavior, and accessibility

- The primary video must not be squashed, cropped unpredictably, or remounted by tools.
- Drawers, docks, shelves, builders, and review surfaces overlay the workspace and use the shared
  focus/inert/Escape/return-focus behavior. Named internal regions scroll; the document does not.
- Stage warnings/errors overlay rather than reflow the player. Camera, mic, AI, Record/Stop,
  session Close/Stop, and take actions remain quickly reachable.
- Preserve all five canonical viewports: `1440×960`, `1280×720`, `834×1112`, `390×844`,
  `320×568`; safe areas, short heights, 200% text/reflow, and touch require deliberate checks.
- Use semantic HTML, accessible names/states/status regions, visible focus, reduced motion, and
  approximately 44px touch targets. Never hide the sole high-consequence action.
- Do not duplicate stateful controls to fix mobile layout. Prefer entry intent, anchored
  affordances, or progressive disclosure inside the current ownership model.

## Testing and screenshots

Normal implementation gate:

```bash
pnpm quality
```

Before release also run:

```bash
pnpm test:coverage
pnpm test:e2e
pnpm test:production # after build
pnpm test:visual
pnpm audit:prod
```

- Tests deny unexpected external HTTP and WebSockets. Never add paid/live provider traffic to CI,
  screenshots, stories, or ordinary automated tests.
- Use pure tests for rules, component/controller tests for state/races, E2E for observable
  journeys, Storybook for component states, and the curated suite only for high-value visual
  regressions.
- Visual tests use fixed time, deterministic synthetic media/provider fixtures, disabled animation,
  semantic readiness assertions, viewport containment, and platform-specific baselines. The
  29-case count is a review budget; required state/viewport pairs and unique paths are the
  invariant.
- Update screenshots only for intentional visual work. Inspect every changed baseline. Do not run
  `screenshots:prune` until every expected platform baseline exists; never update snapshots as
  unrelated cleanup.
- Use [`docs/MANUAL_QA.md`](docs/MANUAL_QA.md) and gated live smoke for physical device/provider
  evidence. Do not claim a command passed when it was skipped or blocked.

## Documentation and completion

- Update the canonical document named in [`docs/README.md`](docs/README.md) and every affected
  observable user story when behavior, route, storage, command, environment, provider, privacy, or
  support boundaries change.
- Keep current behavior separate from recommendations. Preserve historical rationale in
  `docs/PRODUCT_EVOLUTION.md` and `LESSONS.md`.
- An audit-plan phase moves to `docs/project-audit-completed-work.md` only after all acceptance
  criteria and required validation pass. The active plan contains incomplete phases only.
- Report files changed, validation results, live/manual limitations, and unresolved decisions.

## Graphify

When `graphify-out/graph.json` exists, start codebase questions with:

```bash
graphify query "<question>"
```

Use `graphify path "<A>" "<B>"` for impact/relationships and
`graphify explain "<concept>"` for focused concepts. Use `graphify-out/wiki/index.md` for broad
navigation when that optional export exists; otherwise read `graphify-out/GRAPH_REPORT.md` only
when scoped commands are insufficient. Dirty graph output is expected and not a reason to skip it.
After code changes run:

```bash
graphify update .
```

## Prohibited shortcuts and stop conditions

Do not add retired route aliases, add client secrets, bypass app-owned schemas, weaken explicit
provider intent, add surprise fallback/cost, leak provider data, replace persistent stage/overlay
ownership, delete retained media without a relationship-safe policy, weaken tests to pass, or
blindly accept snapshots.

Stop and ask when:

- a change would expose the app beyond loopback or add accounts, billing, cloud persistence, public
  sharing, moderation enforcement, or a new paid provider;
- model/provider choice, retention/deletion, supported devices/duration, pricing/credits, or
  participant data ownership is materially ambiguous;
- an existing user change overlaps the required files and cannot be preserved;
- completing the task requires destructive data migration, secret access, paid live calls, or a
  broad behavior change outside the authorized phase.
