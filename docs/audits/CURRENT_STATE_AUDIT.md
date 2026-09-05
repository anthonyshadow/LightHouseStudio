# Lightframe Studio — Current-state audit (2026-08-30)

**Document type:** evidence-backed assessment of the product and repository as they exist at commit
`ddf4ec9d` (2026-08-30). This is the third audit generation; it supersedes the 2026-08-26 audit and
the archived first-pass audit. Direction lives in the [product vision](../product/PRODUCT_VISION.md);
the path forward in the [roadmap](../roadmap/PRODUCT_ROADMAP.md); open calls in
[Decisions required](../DECISIONS_REQUIRED.md).

> **Findings here are as of 2026-08-30 and roughly twenty are now closed.** Phase 1 landed on
> 2026-09-02 and closed §4 items 1–4 and 8–10 along with register rows 5, 7, 8 and 9, plus api-7,
> assets-3, assets-5, DOCS-1/2/3/8/11/12/13, PCD-8, PCD-11, prod-5, prod-9, shell-1, shell-4,
> shell-5, STOR-3, studio-1, studio-4, tci-1, tci-2 and tci-3. Read this document for evidence and
> for what remains; read [Phase 1 verification](PHASE_1_VERIFICATION.md) for what is already done,
> before treating any finding below as outstanding work.

## 1. Scope and method

Fifteen parallel read-only auditors each examined one subsystem (shell/routing, dashboard/
campaigns/projects, studio/recording, editor/existing-video, assets/libraries, frontend quality,
API routes/services, database/domain model, storage/media pipeline, providers/jobs,
domain/contracts packages, security, testing/CI/observability, documentation/rules, product
strategy), every claim carrying file:line evidence. The lead independently verified the five most
load-bearing findings against source and walked the **running product** (dev servers at
`127.0.0.1:4173/4100`, demo login, desktop plus a partial mobile pass): entry → dashboard →
studio → projects list → project overview → project workspace (Original/Create/Save/History) →
local editor → campaigns → asset libraries → account menu, plus network capture of the dashboard's
API traffic.

**Verified directly:** all route inventories, the full database schema and migrations, every
`routes.ts`, the domain and contracts packages in full, the editor/render pipeline, storage
implementations, provider adapters, CI workflows, all documentation.

**Could not be verified (environment limits):** live camera capture (no camera in the audit
browser); file-picker upload end-to-end (no OS picker access); any paid AI run (providers
unconfigured in dev — also policy); mobile interaction beyond layout (emulation input was flaky);
runtime behavior of test suites (not executed during the audit). Where a capability is marked
"working" this means the code path is complete and, where possible, was observed live; runtime
claims that rest on code reading alone are labeled as such in the underlying reports.

**Commands run by the lead:** `git status`/`log`, `bun run check:docs` (green on the committed
tree before this audit's new documents), `bun run format:check` (green likewise), read-only
`curl` probes of the running servers, and browser navigation. No tests, builds, migrations, or
provider calls were executed.

## 2. Executive assessment

**What this product is today:** a coherent, unusually well-engineered, local-first **single-clip
AI-restyle studio**. One operator records or uploads one video, optionally swaps the character,
tries on an outfit, or (standalone only) treats the voice, adjusts the clip on-device
(trim/crop/rotate/color), saves it as a versioned Video with a chosen placement, and downloads the
file. Optional Projects wrap one video's workflow with autosave, history, and provenance; optional
Campaigns group Projects. Its own help panel states the model: "Everything starts with a video."

**What the vision requires:** a deliverable-centric media production studio — Projects holding
several sources, manual composition (stitch, subtitles, audio), optional AI inside the same
workflow, and export variants.

**The gap is structural and consistent at every layer** — schema (`project_sources`' primary key
is the project id: one source, ever), domain (no composition/clip/subtitle/audio-level concept
exists anywhere), editor (one clip in, one spec), capture (the record affordance disappears once a
Project has a source), and copy (the entry page sells "restyle it"). This is not decay; it is a
deliberately scoped v1 that the prior MVP definition and roadmap explicitly fenced ("not a
multitrack timeline… or nonlinear editor").

**The good news is equally structural.** The foundations the target product needs are already
built and rare in quality: compare-and-set versions and idempotency receipts on every mutation,
append-only revisions with full provenance, retention-gated byte deletion (no orphanable
originals), a 12-state job model with an explicit `ambiguous` state and no automatic paid retries,
a persistent-shell/media-runtime split enforced by bundle-budget tooling, two route-inventory test
oracles, ownership derived solely from the verified session subject (zero violations found across
~80 handlers), and a hermetic test harness that denies all external network. **No rewrite is
justified anywhere.** The path is a staged model extension on top of machinery that already works.

Distance to the vision: roughly **all of Stage A minus subtitles/audio/variant-sets, and none of
Stage B** (see the vision's MVP boundary). The 2026-08-26 audit judged the _previous_ scope "85% of
a coherent MVP"; its top blockers (placement-real save, truthful copy) have since shipped. Against
the _new_ target scope, the honest figure is: single-clip pipeline ~90% done and excellent;
composition studio 0% — but with an unusually solid runway.

## 3. Current product map

- **Entry** `/` → prefilled demo login → **Dashboard** `/dashboard` (continue work, recent
  Videos/Projects/Campaigns, processing queue, quick create).
- **Studio** `/studio/create` — the capture stage (camera off by default; record or upload;
  optional live-AI beta behind a default-off flag); `/studio/<uuid>` deep-links a saved video into
  review.
- **Projects** `/projects`, `/projects/:id` (overview: status, workflow strip, "Used in this
  Project" memberships), `/projects/:id/workspace` (the Studio-runtime workspace: Original /
  Create / Save / History tabs; local editor; AI launchers; placement save).
- **Campaigns** `/campaigns`, `/campaigns/:id` — name + brief, project grouping, archive/tombstone.
- **Assets** `/assets/{videos,characters,outfits,voices}` — account libraries as overlays; Videos
  carries versions, search, filters, download, placement re-export.
- **API** — ~90 loopback-only endpoints across auth, system/capabilities, campaigns, projects
  (source/working-media/outputs/renditions/history/processing), video-jobs, saved-videos (+ five
  direct-upload routes in R2 mode), reference-images, voices, creative-library, realtime token.
- **Persistence** — `DATABASE_MODE local|shadow|postgres|neon`; 28 owner-scoped tables or a
  journaled per-owner file store; bytes on local disk or private R2; browser IndexedDB for
  characters/outfits/prompts with an optional whole-store cloud mirror.

## 4. Current user flows — what works and where it breaks

The product has **no broken critical journey**: every flow it claims can be completed, every
persistent state carries a control, and the recent dead-end-repair work shows (post-save "carry
on" notices, adoptable retained results, campaign create → "Create Project in Campaign"). The
material flow problems are of shape, not breakage:

1. **The manual editor is an annex of an AI wizard** (arch-1, ev-6). "Open the video editor" lands
   on an overlay titled "Use existing video" whose organizing principle is "choose your edits" —
   two AI cards and a local "Adjust video" card. The editor has four different names across
   surfaces.
2. **A fresh standalone take cannot reach the editor** (studio-1) — pressing "Edit Video" after
   recording opens the chooser _empty_; a unit test asserts the non-adoption. The path is
   save-to-Assets → reopen with edit intent.
3. **The finished deliverable is invisible where a returning user lands** (PCD-8): the Project
   overview shows workflow progress but never the last saved output, though the snapshot carries
   it; export lives only inside the workspace and Assets.
4. **Voice is a configurable dead end inside Projects** (ev-1, PCD-4): selectable and attachable,
   but Start is disabled and a local voice result has neither save nor adopt.
5. **Standalone AI results are session-only** (ev-3, prov-6): a paid result lives in browser
   memory, single-shot-downloaded server-side, with no unload guard; walk away and it is gone —
   and **paid jobs progress only while a client polls** (prov-2): close the browser after
   submitting and the provider bills, the result expires unretrieved after an hour.
6. **One placement per save** (PCD-3, DC-14): _closed by slice 2.3 (2026-09-05)._ One save now
   makes up to four placements, rendered one after another in the browser and stored as sibling
   Versions of one Saved Video. The gallery re-export chooser opens on the Version's recorded
   placement (prod-9 closed earlier); a Studio-saved re-framed Version still records none, which
   is the remaining prod-9 residue.
7. **Organize doesn't feed edit** (PCD-5): "Used in this Project" renders only on the overview;
   workspace pickers list the whole library and ignore memberships.
8. **Small silent dead ends:** unknown URLs silently redirect to the dashboard (shell-4); the
   `/studio/<uuid>` route sits outside the exit guard so in-app navigation can silently drop dirty
   local edits (shell-1); "Replace the original video" is actually a remove (PCD-11); notices
   reference a "Release" button that no longer exists (studio-4).
9. **Trust bugs in copy and labels:** "Remove from Assets… its file is not erased" is false in R2
   mode where bytes are deleted (assets-3); every Studio-saved visual result is labeled
   "character-swap," including Virtual Try-On (assets-5); the server re-encodes portrait posters
   into a 16:9 center-crop that the client code explicitly avoids (STOR-3).
10. **First-touch identity mismatch** (prod-5): entry page and `index.html` sell AI restyling and
    "realtime creative video"; the README sells a marketing-asset workspace; the in-app explainer
    says a third thing (the best one).
11. **HEVC/iPhone footage fails at upload** (ev-2) with a corrective message but no in-app remedy;
    uploads do not survive a page reload despite full server-side replay support (STOR-2).
12. **Recording is one-shot** (studio-2): the camera is released after every take; there is no
    retake loop, pause/resume, or multi-take comparison.

## 5. Capability inventory (condensed)

| Capability                                                                               | State                                                                                         |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Record a take (≤5 min, H.264 transcode, sidecar audio)                                   | Working; one-shot loop; no pause/retake                                                       |
| Upload a video (MP4/MOV H.264, WebM VP8, ≤300 MB, ≤5 min)                                | Working; HEVC/ProRes rejected                                                                 |
| Manual edit: trim, crop/aspect presets, rotate/flip, lighting, filters                   | Working, single clip, WYSIWYG worker render                                                   |
| Manual edit: split into segments, reorder, stitch, audio levels, subtitles               | **Missing everywhere**                                                                        |
| Character Swap / Virtual Try-On on existing video                                        | Working (code-path; providers unconfigured in dev); durable in Projects, ephemeral standalone |
| Voice treatment (local FX + ElevenLabs)                                                  | Working standalone; **dead end in Projects**                                                  |
| Live realtime AI on camera                                                               | Built, triple-gated, default off (beta)                                                       |
| Projects: create/rename/duplicate/move/archive/restore/tombstone, autosave, CAS, history | Working, strong                                                                               |
| Project media: exactly one immutable source + one current cut                            | Working as designed; **contradicts vision**                                                   |
| Save output with placement, rendered to real bytes, recorded on Version                  | Working (shipped 2026-08-28)                                                                  |
| Multi-placement variant set in one save                                                  | Missing (contract already allows an array, capped at 1)                                       |
| Saved Videos: versions, search, filters, preview, rename, download, placement re-export  | Working                                                                                       |
| Campaigns: name+brief, grouping, guarded delete                                          | Working; cards show no counts/previews                                                        |
| Asset libraries: Characters/Outfits/Voices                                               | Working; browser-local system of record with destructive sync recovery                        |
| Export = download                                                                        | Working; no publishing (deliberate non-claim)                                                 |
| Archive/restore both aggregates                                                          | Working                                                                                       |
| Accounts: one seeded demo user; plans/entitlements decorative                            | As designed for local-first; contradicts "teams" until decided (D9)                           |

## 6. Strengths (protect these)

- **Concurrency and cost discipline** — CAS + idempotency receipts on every mutation, reload-safe
  output-save receipts, explicit double-cost acknowledgments, `ambiguous` reconciliation, no
  automatic paid retry (PCD-15, prov-verified).
- **Provenance and retention** — append-only revisions with parent-chain checks; outputs keyed so
  a Version has exactly one producing revision; byte deletion vetoed while any retained history
  needs the asset; journaled crash-safe file mode.
- **Ownership hygiene** — session-subject-only ownership across all ~80 handlers; composite FKs
  re-prove ownership in the schema; no client-supplied owner anywhere.
- **The shell/runtime split** — capture code cannot leak onto non-media routes; enforced by
  bundle budgets with forbidden-dependency regexes, plus two route oracles.
- **Local-first privacy engineering** — loopback triple-lock, sanitized errors/telemetry, no
  VITE-exposed secrets, SSRF-hardened import (verified down to IPv4-mapped IPv6 spellings),
  content-sniffed uploads, provider keys that never follow redirects.
- **Editor bones** — WYSIWYG shader parity between preview and render, worker-based WebCodecs,
  output revalidation, undo/redo, object-URL and MediaStream cleanup verified at every site.
- **Repository hygiene** — zero TODO/FIXME in app source, knip in the gate, hermetic tests,
  honest degraded states, and a documentation system with declared per-topic authority.

## 7. Findings by area (consolidated; full detail in the per-area reports)

### 7.1 The structural gap (P1 — one decision, many symptoms)

**GAP-1 Single-source Projects** (db-1 = STOR-7 = PCD-1 = studio-3 = DC-2): schema PK, domain
snapshot, contracts, capture bridge, and UI all enforce one video per Project.
**GAP-2 No composition primitives** (db-2 = edit-1 = web-7 = DC-1 = prod-1): no clip, timeline,
stitch, or audio-level concept in any layer. Subtitles now exist on the single-clip edit as
burn-in (slice 2.1, 2026-09-03: `VideoEditSpec.subtitles`, editor tool and lane, shared-shader
compositing), which closes the single-clip half of edit-2; the player carries no caption track by
decision (D4), and composition-level subtitle tracks remain Phase 3 work.
**GAP-3 AI-round workspace model** (db-3 = DC-3-adjacent = prod-4): revision snapshots put AI
selections first-class; the post-source phase is literally named "creative"; an output commit
_requires_ project status `completed`; an AI run scrims the whole workspace.
**GAP-4 Two parallel pipelines** (prov-1 = prod-3 = DC-9 = api-3-adjacent): standalone
video-jobs (ephemeral, voice-capable) beside Project processing (durable, voice-less); two status
taxonomies; standalone outputs orphanable.
**GAP-5 Editor subordination** (arch-1 = studio-1 = shell-10): manual editing is reachable only
through the AI-framed wizard; "Studio" names the capture surface; no navigation concept for
deliverables.

### 7.2 Product/UX (beyond the structural gap)

P2: deliverable invisible on overview (PCD-8); one placement per save (PCD-3); memberships
disconnected from workspace (PCD-5); campaign cards empty (PCD-7); no campaign filter on Projects
page (PCD-6); compact nav ranks Campaigns over Assets (shell-5); no not-found surface (shell-4);
identity copy drift (prod-5); terminology sprawl — five names for the creative library, four
meanings of "version", four names for the editor (assets-7, DC-8, ev-6); one-visual-tool policy
invisible until it bites (ev-4); AI-gate 16:9/9:16 detour (ev-5). P3: "Release" phantom copy
(studio-4); generic saved-video tab title (shell-8); "Replace original" is remove (PCD-11);
campaign CAS-retry parity (PCD-14); truncated UUIDs still visible on project asset cards
(live-confirmed; 2026-08-26 step-07 outstanding).

### 7.3 Frontend quality

P2: `StudioApp` orchestration hub — 938 lines, ~25 hooks, 44-prop overlay child (web-3 =
studio-5); `VideoGallery` 1,058 lines (assets-9). P3: ad-hoc query keys bypassing factories and a
voices count that nothing invalidates (web-1/web-2/assets-8); `apiClient` compatibility barrel
with 36 importers (web-6); label spellings in four places (web-4); a UI primitive importing an API
adapter (web-5); `MediaStage` dual ownership of media element props (studio-11); dead
`creationIntent` channel across four files (shell-2); dead `isStudioPath`, `lastApplied`,
TakeDock `view='all'` (shell-3, edit-4, studio-7). Otherwise exceptional hygiene (web-10).

### 7.4 API and backend

No N+1 found anywhere; all lists paginated with sealed cursors and bounded totals. P2: route
oracle omits the five direct-upload routes and asserts a cloud config no deployment serves
(api-1); "production" naming implies hostability the transport forbids (api-2 = SEC-9, D9);
image/voice AI runs synchronously in-request with cost-loss on disconnect (api-3, prov-4);
unclaimed rendition bytes orphan forever (api-4 = STOR-1); direct-upload complete re-downloads
300 MB with no abort wiring (api-5, STOR-9); file-mode gallery is a full-library scan (api-6).
P3: saved-video rename lacks CAS (api-7); blanket `no-store` on immutable media + no ETags
(api-8 = STOR-8); thumbnail version parameter dead (api-9 = prod-9-adjacent); no login throttling
or quota enforcement (api-10 = SEC-7/8); `SpooledAudioUpload` misnomer and Fastify shims (api-12).

### 7.5 Database and domain model

P2 beyond the structural gap: one-active-AI-job-per-owner unique index (db-4, D8); file-mode caps
(100-version cliff) absent in Postgres (db-6); codec allowlist frozen in CHECK constraints (db-7);
no purge of terminal jobs/receipts/revision snapshots (db-8, D14); multi-user schema with no
creation path and decorative plan enum (db-9 = SEC-4, D9); file-mode single-process lock
assumption (db-10); saved-video wire status enum diverges from domain and persistence (DC-4);
creative-library endpoints bypass the contracts package (DC-5); hand-mirrored constant sets with
partial parity coverage (DC-6). P3: dead `outbox`/`resource_references` tables (db-5); no variant
grouping (db-11, _closed by slice 2.3: `video_versions.variant_set_id`_); stale schema-test
oracle (db-12); write-only-null `deleted_at` column (db-13);
`markReady` not owner-scoped (db-14 = STOR-6); speculative enum members with no writers (DC-7);
result-state blind spot on presenting saves (DC-13).

### 7.6 Media pipeline and storage

P2: no orphan sweep for byte assets (STOR-1); uploads not resumable across reload — idempotency
keys live in a ref (STOR-2); poster center-crop contradiction (STOR-3); full-object copy on every
re-verification (STOR-4); local-mode delete never frees bytes (STOR-5 = SEC-1, D14). P3: `.webm`
extension for PNGs (STOR-12); video-jobs content route bypasses the shared ranged-byte owner
(STOR-10); reference-image purge fires only on creative-library route hits (STOR-11 =
assets-2-adjacent). Absent by design (acceptable today, stated in architecture): server
transcode/thumbnails/renditions, resumable multipart for Projects, dedupe, quotas.

### 7.7 AI integrations

P1: standalone outputs bypass Projects (prov-1); paid jobs progress only under client polling —
walk away and paid output expires unretrieved (prov-2). P2: no cost visibility or budget caps —
only Wiro/BFL even report cost, persisted but never surfaced (prov-3 = prod-7); client disconnect
aborts accepted image generations (prov-4); provider-inconsistent, env-toggleable content-safety
posture, including an "uncensored" default reference-image model (prov-5, D15). P3: single-shot
delete-after-download results (prov-6); single-process job assumptions (prov-7); hardcoded 30 s
ElevenLabs timeout spanning conversions (prov-8); internal jargon in user-facing provider errors
(prov-10); demo-owner default parameter in VoiceService (prov-11 = SEC-2); legacy fingerprint
shims (prov-12). Strengths: optionality, gating, normalization, and cost discipline are genuinely
excellent; the realtime beta is correctly quarantined.

### 7.8 Security, privacy, reliability

No confirmed exploitable vulnerability under the current loopback single-operator posture.
P2: local-mode "Delete" keeps bytes indefinitely (SEC-1); no consent/likeness/voice-rights capture
for face/voice transformation — a launch blocker for brand positioning, not a code bug (SEC-5);
no CSP (defense-in-depth; no XSS sinks found) (SEC-3); the loopback triple-lock makes the product
architecturally unhostable — correct, but undocumented as such (SEC-9 = api-2). P3: VoiceService
demo-owner default (SEC-2); no login throttling (SEC-7); unenforced entitlements (SEC-8);
in-memory local-mode sessions (SEC-10); ElevenLabs workspace voices accumulate at the provider
with an implemented-but-uncalled deletion method (SEC-6); the untracked root `.env` is mode 0644
on the operator's machine — local hygiene, not a repo leak (SEC-11). Positive confirmations: no
committed secrets in history; SSRF downloader verified robust; CSRF/clickjacking covered; upload
pipeline sniffs real bytes; R2 verification is thorough.

### 7.9 Testing, CI, observability

P1: CI provisions a real API + Postgres for e2e and the specs then bypass them — a 1,200-line
in-page simulator re-implements the server contract, asserted by nothing but itself (tci-2).
P2: coverage thresholds gate nothing on PRs (tci-1); visual regression is dispatch-only and
self-blinding between runs (tci-4); no metrics, no AI cost/failure accounting, no default trace
backend — deliberate local-first privacy, but incompatible with the paid-AI product needs (tci-5 =
prov-3); production smoke never touches save/export (tci-6); the vitest-vs-Playwright CPU
contention hazard is documented only in a personal memory file (tci-3). P3: one WebKit journey
(tci-8); five `.styles.test.ts` suites pin CSS objects (tci-9); serial 13-step quality gate with a
storybook build nothing publishes (tci-10); dead vitest include (tci-11); unexplained audit waiver
GHSA-67mh-4wv8-2f99 (tci-12); retired-word police with required fixture strings (tci-7).

### 7.10 Documentation and rules

P1: the "current" 2026-08-26 assessment denies its own implementation — steps 1–6 of its roadmap
landed while three documents still say "nothing has been implemented" (DOCS-1). P2: root README is
a drifted second architecture doc (DOCS-5); ARCHITECTURE.md accretes change-log prose (DOCS-6);
open findings are split across three registers (DOCS-9); the gaps audit is 85% closure narrative
(DOCS-7); MVP GO quotable without its candidate caveat (DOCS-8); stale flow-doc claims —
`window.confirm`, "Quick project", `/studio/:videoId` navigation, "Account settings absent"
(DOCS-2, DOCS-3). P3: LIVE_PROVIDER_SMOKE contradicts the env-profile model (DOCS-11); a leftover
git worktree under `.claude/worktrees/` (DOCS-12); ~10,600 archived lines under a no-delete
preference now superseded by this audit's mandate (DOCS-10, D16). Full per-file dispositions:
[pruning report](DOCUMENTATION_PRUNING_REPORT.md).

## 8. Keep / improve / redesign / refactor / remove / defer

**Keep (protect):** CAS+idempotency+receipt discipline; retention-gated deletion; provenance
chain; shell/runtime split + oracles + bundle budgets; hermetic test harness; export-placement
surface; loopback privacy engineering; the job model's `ambiguous` reconciliation; LESSONS.md;
CLAUDE.md/AGENTS.md structure; legacy redirects.

**Improve (small, high-trust):** truthful delete copy (assets-3); origin labels (assets-5); poster
crop (STOR-3); deliverable on overview (PCD-8); placement preselection on re-export (prod-9);
entry/meta identity copy (prod-5); not-found surface (shell-4); exit guard on `/studio/<uuid>`
(shell-1); voice-affordance honesty in Projects (D6 first half); UUIDs off asset cards; query-key
factories (web-1/2); count invalidation (assets-8); saved-video rename CAS (api-7); wire-status
alignment (DC-4); creative-library contract (DC-5); parity-test completion (DC-6); route-oracle
cloud case (api-1); coverage gating (tci-1); doc corrections (DOCS-1/2/3/8/11/13).

**Redesign (the roadmap's core):** the Project model to multi-source + composition (GAP-1/2/3,
D1–D3); the editor to a first-class Project surface (GAP-5); pipeline convergence (GAP-4, D5);
subtitles + audio (edit-2, prod-2); multi-placement variant sets (D10); compact nav slot (D13).

**Refactor (when touched):** StudioApp decomposition by grouped aggregates (web-3); VideoGallery
split (assets-9); `SpooledAudioUpload` rename (api-12); apiClient barrel retirement (web-6);
ARCHITECTURE.md split (DOCS-6); README slimming (DOCS-5); display formatters out of domain
(DC-12).

**Remove (verified candidates):** `outbox` + `resource_references` tables (db-5); `creationIntent`
channel (shell-2); `isStudioPath` (shell-3); `lastApplied` (edit-4); TakeDock `view='all'`
(studio-7); `decorateRequest` no-op; dead vitest include (tci-11); `.styles.test.ts` suites
(tci-9, verify); executed 2026-08-26 prompts 01–06; superseded docs per the
[pruning manifest](DOCUMENTATION_PRUNING_REPORT.md) — **deletions gated on manifest approval**;
stale `.claude` worktree (DOCS-12, after checking for uncommitted work); demo-owner default
(SEC-2/prov-11); ElevenLabs `deleteWorkspaceVoice` (wire or delete, SEC-6).

**Defer (explicitly):** hosted/multi-user service, collaboration, publishing, billing (D9);
server-side rendering; additional providers/models (prod-6 freeze recommendation); live-AI-beta
disposition (D12); per-record library sync until Phase 5 (D7); file-mode `listPage` (api-6);
re-render profiling (web-3 note); light theme.

## 9. Prioritized findings register

P0: none found. The product has no data-loss, corruption, security-breach, or broken-critical-path
finding under its current deployment posture.

| #   | Finding                                                                  | IDs                                         | Priority | Phase                          |
| --- | ------------------------------------------------------------------------ | ------------------------------------------- | -------- | ------------------------------ |
| 1   | Single-source Projects foreclose the vision's core flow                  | db-1/STOR-7/PCD-1/studio-3/DC-2             | P1       | 3                              |
| 2   | No composition/subtitle/audio primitives anywhere                        | db-2/edit-1/edit-2/web-7/DC-1/prod-1/prod-2 | P1       | 2–4                            |
| 3   | Paid jobs progress only while a client polls; results expire unretrieved | prov-2                                      | P1       | 2                              |
| 4   | Standalone AI outputs bypass Projects and are one-shot/ephemeral         | prov-1/prov-6/ev-3                          | P1       | 4                              |
| 5   | Fresh take cannot reach the manual editor                                | studio-1                                    | P1       | 1                              |
| 6   | Voice inside Projects is a configurable dead end                         | ev-1/PCD-4/studio-6                         | P1       | 1 (honesty) / 4 (build)        |
| 7   | `/studio/<uuid>` outside the exit guard — silent loss of dirty edits     | shell-1                                     | P1       | 1                              |
| 8   | e2e bypasses the real stack CI already provisions                        | tci-2                                       | P1       | 1                              |
| 9   | "Current" audit documents deny their own implementation                  | DOCS-1                                      | P1       | resolved by this audit's canon |
| 10  | AI-round model: save forces `completed`; AI selections structural        | db-3/prod-4                                 | P2       | 3                              |
| 11  | Delete copy false in R2 mode; local delete keeps bytes                   | assets-3/SEC-1/STOR-5                       | P2       | 1 (copy) / 5 (GC)              |
| 12  | No consent/likeness/rights capture for face/voice transforms             | SEC-5                                       | P2       | 1 (decision D15)               |
| 13  | Content-safety posture env-toggleable, "uncensored" default model        | prov-5                                      | P2       | 1 (decision D15)               |
| 14  | No AI cost visibility or ledger                                          | prov-3/prod-7/tci-5                         | P2       | 2                              |
| 15  | One placement per save; re-export forgets placement (closed, slice 2.3)  | PCD-3/prod-9/DC-14                          | P2       | 2                              |
| 16  | Upload not resumable across reload; HEVC rejected                        | STOR-2/ev-2                                 | P2       | 2                              |
| 17  | Orphaned rendition/failed bytes never swept                              | STOR-1/api-4                                | P2       | 5                              |
| 18  | Creative library browser-local with destructive sync recovery            | assets-1/assets-2/assets-11                 | P2       | 5 (D7)                         |
| 19  | Terminology sprawl (library names, "version", editor names)              | DC-8/assets-7/ev-6                          | P2       | 1–2                            |
| 20  | Editor reachable only through AI wizard; IA restyle-first                | arch-1/shell-10/prod-5                      | P2       | 1                              |

(Full P2/P3 inventory: sections 7.2–7.10 above; every ID resolves to a finding with evidence,
impact, recommendation, effort, and confidence in the per-area audit reports retained by the lead.)

## 10. Evidence references

Primary evidence is inline throughout as finding IDs; the fifteen per-area reports (with
file:line citations for every claim) were produced 2026-08-30 against commit `ddf4ec9d`. The five
most load-bearing claims were re-verified by the lead directly in source:
`project_sources.projectId` as primary key (`apps/api/src/infrastructure/database/schema.ts:842`),
output commit requiring `status === 'completed'`
(`apps/api/src/infrastructure/database/project-repository.ts:3497`), the asserted non-adoption of
a fresh take into the editor (`apps/web/src/studio/StudioApp.test.tsx:1213`), the "file is not
erased" dialog vs R2-only byte deletion (`apps/web/src/features/video-gallery/VideoGallery.tsx:861`,
`apps/api/src/app.ts:370`), and the unconditional `visual → character-swap` origin mapping
(`apps/web/src/features/saved-videos/useSaveVideo.ts:42`).
