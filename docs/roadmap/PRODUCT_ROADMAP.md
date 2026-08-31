# Lightframe Studio — Product and technical roadmap

**Document type:** canonical, dependency-ordered roadmap from the audited current state to the
[product vision](../product/PRODUCT_VISION.md). Phases are ordered by dependency and user value,
not dates. Every phase is a set of vertical slices that each leave a demonstrably better product.
Evidence for every problem cited: [current-state audit](../audits/CURRENT_STATE_AUDIT.md) (finding
IDs in parentheses). Open calls: [Decisions required](../DECISIONS_REQUIRED.md) (D-numbers).
Copy-paste prompts for every slice: [implementation prompts](IMPLEMENTATION_PROMPTS.md).

**Why this order.** Phase 1 needs no schema change and no open decision — it makes the existing
single-clip product honest, connected, and Project-centric, and removes every "the product lies to
me" defect; shipping it first restores identity while the composition decisions (D1–D3) are made.
Phase 2 completes the single-clip deliverable (Stage A of the vision's MVP): subtitles and audio
prove the edit-spec extension pattern on one clip _before_ the multi-clip bet, and the job/cost
fixes stop paid work evaporating. Phase 3 extends the data model (multi-source + composition
snapshot v3) behind the existing CAS/receipt machinery — model before UI, expand before switch.
Phase 4 builds the composition editor on the now-capable model and converges the two pipelines
into one. Phase 5 pays down storage/library/operational debt that none of the earlier outcomes
depend on. A big-bang rewrite is rejected outright: the audit found the foundations sound and
every gap incrementally reachable.

---

## Phase 1 — Coherence and trust (no schema changes)

**User outcome:** the product tells the truth everywhere, the manual editor is a first-class,
consistently named surface, every dead end is closed, and a returning user sees their deliverable.
**Problem:** the audit's trust bugs and dead ends (§4, §7.2): false delete copy, wrong origin
labels, cropped posters, invisible deliverable, phantom "Release" copy, AI-wizard-framed editor,
unreachable editor from a fresh take, voice dead end, silent 404s, unguarded `/studio/<uuid>`,
UUIDs in UI, restyle-first identity copy.
**Scope (slices):**
1.1 Editor promotion: one name ("Edit video"), direct entry from take review and from the Project
workspace without the "Use existing video" wizard detour; fresh-take adoption (studio-1, arch-1,
ev-6).
1.2 The deliverable made visible: last saved output (poster, placement, Download, View in Assets)
on the Project overview; placement preselected in the gallery re-export chooser (PCD-8, prod-9).
1.3 Truth fixes: mode-aware delete copy (assets-3); correct VTO origin labeling (assets-5);
aspect-preserving server posters (STOR-3); internal IDs off asset cards; "Release" copy retired
(studio-4); "Replace the original video" made honest (PCD-11).
1.4 Dead ends: exit guard for `/studio/<uuid>` (shell-1); a not-found surface (shell-4); Project
voice affordances disabled with the stated reason until voice works there (ev-1 honesty half,
D6); unload guard for unsaved paid standalone results (ev-3 mitigation).
1.5 Identity and IA: entry-page/index.html copy leads with make/edit/deliver (prod-5); compact
nav swaps Campaigns→Assets (D13, shell-5).
1.6 Documentation canon: this audit's documents become authoritative; superseded docs deleted per
the approved [pruning manifest](../audits/DOCUMENTATION_PRUNING_REPORT.md); stale claims in kept
docs corrected (DOCS-1/2/3/8/11/13).
1.7 Engineering hygiene bundle (small, verified): query-key factories completed and counts
invalidated (web-1/2, assets-8); saved-video rename CAS (api-7); wire-status alignment (DC-4);
creative-library contract module (DC-5); parity-test completion (DC-6); route-oracle real cloud
case (api-1); one real-stack e2e Project journey (tci-2); coverage gating decision enacted
(tci-1); dead-code removals — `creationIntent` channel, `isStudioPath`, `lastApplied`,
TakeDock `view='all'`, `decorateRequest`, dead vitest include (shell-2/3, edit-4, studio-7,
tci-11); `SpooledAudioUpload` rename (api-12).
**Non-goals:** any schema change; composition; new AI capability; visual redesign beyond the named
copy/IA fixes.
**Dependencies:** D13, D15 recorded; pruning manifest approved (for 1.6).
**Security/privacy work:** record the D15 content-safety policy; `chmod 600` the legacy root
`.env` (operator action, SEC-11); make VoiceService owner required (SEC-2).
**Cleanup included:** all removals in 1.7; stale worktree removal after inspection (DOCS-12).
**Performance checks:** none expected to change; bundle budgets must stay green.
**Migration/rollback:** none (no schema).
**Acceptance criteria:** every §4 flow-problem item 1–4, 8–10 in the audit demonstrably closed;
`bun run quality` green; no copy anywhere contradicts actual behavior in any DATABASE_MODE.
**Required tests:** component/controller tests for each changed surface; the new real-stack e2e
journey; route-oracle updates; existing suites green.
**Observability:** none new.
**Exit criteria:** a first-time user lands, understands the product as an editing studio, edits a
fresh take without a save-reload detour, and finds their deliverable on return.
**Risks:** editor-entry rework touches the Studio runtime's highest-coupling file (web-3) —
mitigate by the grouped-aggregate pattern already in `StudioWorkspace`, no broad refactor.
**Decisions before starting:** D13, D15; manifest approval for 1.6.

## Phase 2 — The complete single-clip deliverable (vision Stage A)

**User outcome:** one clip in, a genuinely finished marketing deliverable out: timed subtitles,
audio level, several platform variants from one save, uploads that survive a reload, phone footage
that just works, and paid AI work that cannot evaporate.
**Problem:** table-stakes deliverable features are missing (edit-2, prod-2); saves produce one
placement per round (PCD-3, DC-14); uploads restart from zero (STOR-2); HEVC rejected (ev-2);
paid jobs progress only under client polling and results are single-shot (prov-2, prov-6); no
cost ledger (prov-3, tci-5).
**Scope (slices):**
2.1 Subtitles on the single clip: domain cue model, editor tool on the existing timeline, burn-in
through the WebGL/canvas render path (D4). Cues persist in the revision's `localEdit` extension.
2.2 Audio level: per-clip gain in the edit spec + editor control; keep-or-drop becomes a slider.
2.3 Variant sets: one save → several placements (raise `renditions.max(1)`; serial browser
renders with per-placement progress; sibling-variant identity on Versions) (D10, db-11).
2.4 Resilient intake: persist upload idempotency keys/upload ids for cross-reload resume
(STOR-2); HEVC local transcode-on-upload where decodable, honest fallback otherwise (D11).
2.5 Durable AI outcomes: server-side progression tick for accepted jobs; retain results past
first download until TTL; per-account AI usage ledger (submissions, provider, outcome, duration)
surfaced in Account (prov-2/3/6, prod-7).
2.6 Capture iteration: "Record another take" loop; keep release-on-review as the default privacy
posture (studio-2).
**Non-goals:** multi-clip anything; sidecar caption files (burn-in first per D4); server-side
rendering; new providers.
**Dependencies:** D4, D10, D11 decided; Phase 1's editor promotion (2.1 builds on the promoted
surface).
**Database/API work:** additive columns/fields only (cue list + gain inside the existing snapshot
jsonb and `localEdit` contract; ledger table; variant-set key on versions). Safe expand-only
migrations, each with its own verification prompt.
**Media-pipeline work:** subtitle rasterization in the worker; multi-render loop; transcode-intake
path; all off the UI thread; object-URL and memory checks per slice.
**Security/privacy:** ledger contains counts and outcomes, never prompts or media.
**Performance checks:** render-time budget stated per slice; 300 MB cap unchanged; no added
full-object copies (respect STOR-4 — reuse recorded checksums where possible).
**Acceptance criteria:** muted-autoplay-ready captioned vertical ad produced from a phone-shot
HEVC clip, in three placements, from one save; a reload mid-upload resumes; a submitted swap
completes and is retrievable after closing the browser; Account answers "what did AI run this
month".
**Required tests:** domain rules for cues/gain; worker render tests; contract tests for extended
schemas; API tests for ledger + retention; e2e: caption-and-export journey; migration
verification prompts run.
**Observability:** job progression tick metrics in logs; ledger is itself the cost surface.
**Exit criteria:** vision Stage A satisfied end to end; MVP acceptance re-run recorded (DOCS-8).
**Risks:** subtitle rendering fidelity across devices — bound by the existing WYSIWYG shader
parity approach; ledger scope creep — counts only, no pricing claims.
**Decisions before starting:** D4, D10, D11.

## Phase 3 — The composition model (schema v3 + multi-source)

**User outcome:** invisible this phase alone — the model beneath the studio changes so Phase 4
can exist: a Project can hold several sources and a composition, saving no longer "completes" it,
and AI state is an optional attachment rather than the spine.
**Problem:** GAP-1/GAP-3 (db-1/2/3, DC-1/2, D1–D3): single-source PK, AI-round snapshot,
save-forces-completed.
**Scope (slices):**
3.1 Domain `composition` module: Clip (source ref + trim), ordered clip list, subtitle tracks
(from 2.1), per-clip gain; snapshot **schema v3** with AI selections demoted to an optional
`transform` object; `completed` becomes derived-milestone semantics (D2).
3.2 Multi-source storage: `project_sources` becomes a per-project collection (expand → idempotent
receipted backfill of the existing single row → verify counts/owners → switch reads → contract
migration), reusing the per-asset acceptance/idempotency/retention machinery unchanged.
3.3 Contracts + API: sources collection endpoints, composition read/write on revisions,
v2→v3 snapshot read migration mirroring the existing v1→v2 pattern; file/relational parity
maintained and tested in both modes.
3.4 Workspace media area: add/remove/preview several sources; capture bridge targets the
collection, restoring the record affordance after the first source (studio-3).
**Non-goals:** the timeline UI (Phase 4); removing the current single-clip flows (they keep
working on v3 unchanged); any destructive migration.
**Dependencies:** D1, D2, D3 decided; Phase 2's cue/gain models (they move into the composition).
**Migration/rollback:** every step expand-first with dual-read verification and a rollback point
before authority switch; old revisions remain readable forever (v1/v2/v3 union). Production is
never migrated automatically.
**Acceptance criteria:** a Project holds three sources; existing single-source Projects behave
identically; every pre-existing test green in both persistence modes; output save no longer flips
status to a terminal state.
**Required tests:** schema/migration verification; repository tests both modes; snapshot
migration property tests; API contract tests; the real-stack e2e extended to two sources.
**Observability:** migration receipts logged; backfill counts reported.
**Exit criteria:** model supports the vision's §11 flow with zero UI regression.
**Risks:** the file/relational parity surface is the widest in the repo — mitigated by the shared
domain rules both repositories already consume and by adding the conformance suite the 2026-08-26
audit asked for (its step-13, absorbed here).
**Decisions before starting:** D1, D2, D3.

## Phase 4 — The composition editor and one pipeline

**User outcome:** the vision's centerpiece: split, reorder, and stitch clips on a multi-clip
timeline; subtitles and audio across the composition; preview, save, and export the composition;
and one AI pipeline whose outputs always land durably in the Project.
**Problem:** GAP-2 UI half (edit-1, web-7), GAP-4 (prov-1, prod-3, DC-9), prod-4 (workspace
frozen during runs), D5, D6-build.
**Scope (slices):**
4.1 Timeline UI: multi-clip timeline over the composition model; split-at-playhead; drag reorder;
per-clip trim; the existing single-clip tools become per-clip tools.
4.2 Stitched rendering: worker renders clip sequences (mediabunny concatenation) with
normalization policy for mixed resolutions/framerates; accurate stitched preview.
4.3 Composition save/export: the composition is what Save operates on; variant sets from 2.3
apply to it.
4.4 Pipeline convergence: standalone Studio becomes a thin entry to the durable engine ("make
this a Project" at the end; durable results everywhere; `/api/video-jobs` becomes internal or
explicitly the quick-tool API per D5); Project voice as a durable job (D6); AI runs stop scrimming
the workspace — results land as adoptable Project assets while editing continues (prod-4).
4.5 Enabling refactor, scoped: StudioApp decomposition along grouped aggregates as the editor
moves into the Project surface (web-3, studio-5) — no big-bang.
**Non-goals:** transitions/effects beyond cuts; server rendering; collaboration.
**Dependencies:** Phase 3 complete; D5, D6.
**Performance:** timeline virtualization if clip counts demand; render memory bounded (perf-1);
stitched render budget stated and measured.
**Acceptance criteria:** the vision's "definition of a successful target experience" items 3, 6–11
demonstrable end to end without AI; with AI, outputs appear in the Project while the user keeps
editing.
**Required tests:** timeline component tests; worker concat tests incl. mixed-source
normalization; e2e: two-clip stitch → caption → variant export journey (real stack); convergence
regression suite for existing-video flows.
**Observability:** render duration/failure logging; job ledger covers converged pipeline.
**Exit criteria:** "minutes to a composed deliverable" is a real, demonstrable number.
**Risks:** the largest phase; codec normalization is genuinely hard — de-risked by 2.4's
transcode-intake work and the existing per-clip render path.
**Decisions before starting:** D5, D6; D8 revisit (parallel jobs) if convergence makes it bite.

## Phase 5 — Libraries, storage, and operational hygiene

**User outcome:** a brand's characters follow the account; deletion means what it says; storage
doesn't grow without bound; campaigns show what they contain.
**Problem:** D7 (assets-1/2/11), D14 (STOR-1/5/11, db-8, SEC-1), campaign thinness (PCD-6/7),
remaining DB hygiene (db-5/6/7/12/13/14, DC-7).
**Scope (slices):**
5.1 Creative-library server system-of-record in cloud modes (per-record sync; IndexedDB as
cache); reference-image purge keyed to real activity (assets-2); search parity for the Characters
and Outfits libraries (Videos and Voices already search).
5.2 Storage maintenance: unified age-bound sweep (orphaned/failed assets, terminal jobs,
receipts, reference images); local-mode delete honors retention-checked byte deletion or an
explicit reclamation control; immutable-content caching headers (api-8/STOR-8); checksum-trusting
verification (STOR-4); shadow-store retirement once its cutover criterion is recorded and met.
5.3 DB hygiene: drop `outbox`/`resource_references`; align file-mode caps with contracts; extend
the schema oracle; owner-scope `markReady`; retire write-only columns and phantom enum members
(after stored-data verification).
5.4 Campaigns that help: project counts/previews on cards (PCD-7); campaign filter on the
Projects page (PCD-6); evaluate campaign-level target placements (the 2026-08-26 step-11 idea)
against real usage before building.
**Non-goals:** collaboration, sharing, hosted anything.
**Dependencies:** D7, D14; Phase 4 (so convergence has settled what must be retained).
**Acceptance criteria:** cross-device character continuity in cloud mode; a deleted video's bytes
actually leave in every mode (or the reclamation control exists); storage growth curve bounded;
campaign list answers "which umbrella holds what".
**Required tests:** sync-protocol tests incl. conflict cases; sweep idempotency tests; migration
verifications; repository tests both modes.
**Observability:** sweep results logged; storage-usage surfacing considered with D14.
**Exit criteria:** the audit's storage/library P2 register is empty or explicitly accepted.

---

## Later expansion (sequenced ideas, not commitments)

Richer campaign context (briefs → target placements → due dates), caption styling presets, audio
normalization, brand kits, templates, batch export queues, review/approval, shared libraries and
real accounts (behind D9), publishing integrations, product analytics, additional media formats.
Each enters only through its own decision gate with validated need.

## Explicitly deferred or rejected

- **Hosted multi-tenant service, collaboration, billing** — deferred behind D9; the loopback
  triple-lock stays until then (SEC-9).
- **Server-side render farm** — rejected until a real WebCodecs-less population is demonstrated.
- **New AI providers or models** — frozen (prod-6) until Phase 4 ships; AI breadth already
  outruns editing depth.
- **Live AI beta promotion** — mothballed (D12); flag stays off, no removal effort either.
- **Full rewrite of any subsystem** — rejected on evidence; the audit found no subsystem whose
  incremental path is more dangerous than replacement.
- **Repo-wide cleanup phase** — rejected; cleanup is embedded in every slice above.
