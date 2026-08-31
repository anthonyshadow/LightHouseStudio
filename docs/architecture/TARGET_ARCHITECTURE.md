# Lightframe Studio — Target architecture

**Document type:** canonical architecture direction. The "Current" sections describe the system as
verified by the 2026-08-30 audit ([evidence](../audits/CURRENT_STATE_AUDIT.md)); the "Direction"
sections state where each layer is going and why. Open structural choices live in
[Decisions required](../DECISIONS_REQUIRED.md) (referenced as D1…D14). Nothing here authorizes a
technology replacement for fashion's sake — the current stack is sound and stays.

## Current architecture (verified)

- **Monorepo:** Bun 1.3.14 workspace. `apps/web` (React 19 + Vite + Emotion + TanStack Query +
  react-router), `apps/api` (Bun + Elysia wrapped in an `ApplicationRuntime` that serves through a
  `node:http` listener), `packages/domain` (pure TS product policy), `packages/contracts` (Zod HTTP
  schemas shared by both apps). Imports point inward; the web app never imports API implementation.
- **Routing/shell:** a persistent `AuthenticatedShell` owns the QueryClient, confirmations,
  creative repository, and session lifecycle; the Studio capture runtime lazy-mounts only on the
  three routes that own live media. Route inventories are enforced by test oracles on both apps.
- **Persistence:** `DATABASE_MODE = local | shadow | postgres | neon`. Local mode is a file-backed
  repository set (journaled, crash-safe, single-process); relational modes use Drizzle over
  Postgres/Neon with 28 owner-scoped tables. Byte storage is local disk or private R2, always
  retention-gated. Every Project/Campaign mutation carries compare-and-set versions and
  idempotency receipts; output saves are one cross-aggregate transaction.
- **Media processing:** the **browser** is the transcoder, thumbnailer, and re-framer
  (WebCodecs + mediabunny in workers, WYSIWYG WebGL shader shared by preview and render). The
  server performs deep media inspection (mediabunny) on every ingest, and streams ranged bytes.
  There is no server-side ffmpeg, transcoding, or rendering.
- **AI providers:** Decart (realtime + character swap), Pruna (optional swap/try-on), OpenAI / BFL /
  Wiro (reference images), ElevenLabs (voice). Video transforms run as durable 202+poll jobs with
  explicit cost consent, bounded concurrency, an `ambiguous` reconciliation state, and no automatic
  paid retry. Image and voice AI run synchronously inside the HTTP request.
- **Security posture:** loopback-only transport (listen guard + Host 421 + Origin checks on
  mutations), single seeded demo account, ownership derived exclusively from the verified session
  subject, sanitized error contract, server credentials never in the browser.

## Target architecture by layer

### Domain boundaries (`packages/domain`)

**Current:** policy for recording, video editing (single-clip `VideoEditSpec`), video processing,
projects (aspects/resolutions/crop), saved videos, prompts, voice. Pure TS, no I/O.
**Direction:** the domain grows the concepts the vision requires and the codebase lacks — a
**composition** model (ordered clips referencing sources, per-clip trim, per-clip audio gain),
**subtitle tracks/cues** with timed placement, and multi-source project rules. AI-selection state
becomes an optional sub-object of creative state rather than its spine. Domain stays free of
React, HTTP, persistence, and provider payloads. No new package; extend `projects`,
`video-editing`, and add `composition` under the existing conventions.

### Frontend boundaries (`apps/web`)

**Current:** feature-sliced; the Studio runtime is the app's gravitational center — the manual
editor is reachable only through the "Use existing video" overlay, and Project surfaces launch
editing through Studio plumbing (`StudioApp.tsx`, 938 lines, ~25 hooks; a 44-prop overlay hub).
**Direction:**

1. The **Project workspace becomes the flagship editing surface**: the manual editor (and later the
   multi-clip timeline) mounts as a first-class Project surface operating on working media
   directly, instead of through the AI-oriented wizard. The shell/runtime split, route oracles,
   bundle budgets, and forbidden-closure-dependency checks are preserved exactly — they are the
   mechanism that keeps capture code off non-media routes.
2. `StudioApp` decomposes along the grouped-aggregate style `StudioWorkspace` already uses
   (controllers/refs/actions), gradually, only as capabilities land there — no big-bang split.
3. Query-key factories become complete (add `detail`/`history` members; retire ad-hoc literals);
   the `apiClient` compatibility barrel is retired by codemod.
4. Editing state that must survive devices (composition, edit specs) lives in the Project revision
   on the server; browser storage remains for conveniences and drafts only.

### API boundaries (`apps/api`)

**Current:** feature routes over services over repositories; consistent error contract; pagination
with sealed cursors everywhere; no N+1 found; conditional registration by persistence mode with
`503 feature_unavailable`.
**Direction:** the Project spine gains the contracts the target model needs — multiple sources per
Project, composition read/write on revisions, multi-placement output saves (the request contract
already accepts a renditions array), and a durable voice operation. The two parallel AI execution
models converge: the ephemeral `/api/video-jobs` path remains only as the quick standalone tool,
and long-running **image** AI moves onto the durable job/admission pattern (or is explicitly
accepted as bounded-cost synchronous — D-level call). The route-inventory oracle grows a real
cloud configuration so the direct-upload routes are covered.

### Database model direction

**Current:** rigorous single-video Project aggregate — `project_sources` PK is the project id (one
source), full-jsonb revision snapshots (v1/v2) whose first-class fields are AI selections, an
output commit that forces status `completed`, and a schema-level one-active-AI-job-per-owner
unique index. Dead tables `outbox` and `resource_references`.
**Direction (staged, additive — never destructive):**

1. **Multi-source:** `project_sources` becomes a child collection (PK project + source id),
   reusing the existing acceptance/idempotency/retention machinery, which is already per-asset.
2. **Composition:** stored in the revision snapshot as **schema version 3** — ordered clip list,
   subtitle cues, audio settings — reusing the existing revision/CAS/replay machinery rather than
   inventing parallel tables (D3). Snapshot v3 also demotes AI selections to an optional
   `transform` sub-object and removes the save-completes-the-project invariant (D2).
3. **Variants:** placement renditions of one deliverable become recognizable siblings (shared
   deliverable key) rather than an undifferentiated version chain (D10).
4. **Hygiene:** drop `outbox`/`resource_references` via migration; align file-mode caps (the
   100-version cliff) with contract-level limits; add retention sweeps for terminal jobs and
   receipts; scope `markReady`/`markFailed` by owner; extend the schema test oracle to all tables.
5. Every step ships as an expand → backfill (idempotent, receipted) → verify → switch-authority →
   contract migration with rollback evidence, following the pattern the repo already documented
   for the deliverable child model. Production is never migrated automatically.

### Media storage direction

**Current:** four byte-store implementations (local, managed-local, R2, transitional shadow),
retention-gated deletion, deterministic idempotent naming, presigned multipart direct upload for
saved videos only, no orphan sweep, no HTTP caching, no cross-reload upload resume.
**Direction:** add a periodic maintenance sweep (age-bound) for unreferenced/failed byte assets,
folding in the reference-image purge and local-mode delete reconciliation; persist upload
idempotency keys/upload ids browser-side so a reload resumes instead of orphaning; serve
version-addressed immutable content with `private, immutable` caching and ETags; trust recorded
checksums instead of full re-download on re-verification; fix the poster re-encode to preserve
aspect. Retire `ShadowAssetByteStore` and the backfill tooling once the cutover criterion is
recorded and met. Direct-to-R2 upload extends to Project sources when multi-source lands.

### Media processing direction

**Current:** browser-only rendering (WebCodecs in workers). Honest degradation when unsupported.
**Direction:** stay browser-first — it matches local-first privacy and costs nothing per render.
Two additions: local transcode-on-upload for HEVC/phone footage where the browser can decode
(intake gap), and stitched-sequence rendering in the existing worker (mediabunny concatenation)
for compositions. A server/queued rendering fallback is explicitly deferred until a real user
population that lacks WebCodecs is demonstrated; if it comes, it arrives as a job type on the
existing job model, not a new subsystem.

### Background jobs

**Current:** one strong durable pattern (admission, lease, poll, reconcile, retained results) used
by Project video AI; in-memory job service with optional durable trace; one active AI job per
owner enforced in the schema.
**Direction:** one job model for anything long-running (video AI, future image AI, future voice
op, future server renders). Concurrency policy moves from a hard schema index to configurable
bounds if parallel Project work is wanted (D8). Every job remains explicitly started, cost-labeled,
reconcilable, and abandonable with cost acknowledgment.

### AI integration boundaries

**Current:** app-owned contracts, server-side credentials, normalized errors, capability discovery
(`/api/capabilities`), feature flags per provider, no fallback.
**Direction:** unchanged in principle — providers stay behind capability names; the browser never
learns provider identities as choices. Add the missing pieces of optionality hygiene: outputs of
**every** AI path (standalone included) must land durably rather than session-only; voice either
gets a durable Project operation or its Project-side affordances are removed (D6); a per-account
AI usage ledger (submissions, provider, outcome) gives cost visibility.

### Security boundaries

**Current:** loopback-only transport; demo auth with production guards; ownership from session
subject only; open-redirect-hardened deep links; sanitized errors; SSRF-guarded imports.
**Direction:** the deployment model must be stated once and designed for (D9). While local-first:
keep everything above, add the small hardenings the audit found (owner-scope `markReady`, refuse
cross-owner asset-id collisions, CAS on saved-video rename), and keep the demo-credential endpoint
production-refused. If hosting is ever chosen: login throttling, entitlement enforcement, quotas,
and a trusted-proxy origin policy become prerequisites, not afterthoughts.

### Observability

**Current:** optional OTLP tracing with a strict exclusion boundary (no prompts/credentials/keys);
reference-image lifecycle logs through structured logging while video-job failures use bare
console warnings; no user-facing cost accounting.
**Direction:** one structured logging channel with request correlation for all provider work; job
metrics (submitted/succeeded/failed/ambiguous, duration) and the AI usage ledger as the product's
cost surface. Client-side error monitoring stays local-first (diagnostics buffer) unless the
deployment model changes.

### Scalability

The current design is deliberately single-operator: file-mode full-library scans, bounded totals,
one active AI job, pool max 4. That is correct for today. The scaling path is: relational mode as
the default for any serious library size; paginated file-mode reads only if local mode must scale;
concurrency bounds by configuration. No distributed-systems machinery (the dead `outbox` table
goes) until a hosted decision (D9) makes it real.

## Current → target migration strategy

Vertical slices, each independently shippable and each leaving the area cleaner
(sequenced in the [roadmap](../roadmap/PRODUCT_ROADMAP.md)):

1. **Coherence first (no schema change):** promote the editor, connect the dead ends (standalone
   take → editor, deliverable on overview, voice affordance honesty), finish terminology, fix the
   trust bugs (delete copy, origin labels, poster crop).
2. **Single-clip completion (small schema additions):** subtitles + audio in the edit spec,
   multi-placement saves, upload resume, HEVC intake.
3. **Model extension (snapshot v3 + multi-source):** the D1–D3 decisions implemented behind the
   existing CAS/receipt machinery, expand-then-switch, with file/relational parity maintained.
4. **Composition UI:** the multi-clip timeline over the now-capable model.
5. **Convergence and hygiene:** one job model, storage sweeps, dead-table drops, shadow-store
   retirement.

A full rewrite of any subsystem is explicitly rejected: the audited foundations (CAS/idempotency,
retention, job reconciliation, shell/runtime split, route oracles) are rare assets, and every gap
found has an incremental path.

## Open decisions

D1 (multi-clip model), D2 (save vs completed), D3 (composition storage), D4 (subtitle delivery),
D5 (standalone Videos surface), D6 (voice in Projects), D7 (creative-library system of record),
D8 (AI concurrency), D9 (deployment model), D10 (variant sets), D11 (HEVC intake), D12 (live AI
beta), D13 (compact nav), D14 (retention policy) — all specified with recommendations in
[Decisions required](../DECISIONS_REQUIRED.md).
