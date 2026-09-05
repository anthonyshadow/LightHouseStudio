# Decisions required

**Document type:** the open product and architecture decisions that shape the
[roadmap](roadmap/PRODUCT_ROADMAP.md). Each entry states the question, why it matters, the options,
a recommendation, and when it blocks work. Evidence for every claim is in the
[current-state audit](audits/CURRENT_STATE_AUDIT.md).

Legend: **Blocks** names the earliest roadmap phase that cannot start (or cannot finish design)
until the decision is made.

---

## D1 — Does a Project become a multi-clip composition workspace?

**Question:** Is the target Project a workspace holding several source videos combined into one
composition (the stated vision), or does the single-source, one-cut pipeline remain and the vision
get narrowed?
**Why it matters:** The single-source model is enforced at every layer — `project_sources`' primary
key is the project id, the snapshot has one `sourceAssetId`, the editor takes one clip, and prior
docs explicitly excluded a timeline. Every major roadmap phase after Stage A hangs on this.
**Options:** (a) multi-clip composition Projects; (b) keep single-clip and drop
composition/stitching from the vision; (c) multi-clip via the previously designed
"Project Deliverable" child aggregate (siblings, not a timeline).
**Recommendation: (a).** The product cannot be a "media creation studio" while it cannot combine
two clips; option (c) solves parallel cuts, not composition. The audit found the CAS/receipt/
retention machinery generalizes cleanly.
**Consequences:** (a) = the roadmap as written; (b) = Phase 3+ removed, vision doc rewritten
narrower; (c) = different Phase 3 with the deliverable-child migration plan.
**Blocks:** Phase 3 design (Phases 1–2 proceed regardless). **Decide by:** end of Phase 2.

## D2 — Does saving an output complete a Project?

**Question:** The database requires a Project's status to become `completed` on every output save
(output commit validation), and saving clears the creative setup. Is "completed" a terminal state
or a milestone?
**Why it matters:** The vision requires "save and continue editing"; a save that ends the round
contradicts it and confuses returning users.
**Options:** (a) milestone — Projects stay editable after save, `completed` derived from "has a
deliverable"; (b) keep round semantics.
**Recommendation: (a).** The UI already says "Version saved — carry on"; the storage layer should
agree with the copy.
**Blocks:** Phase 3 schema work (snapshot v3). **Decide by:** Phase 3 design.

## D3 — Where does the composition live?

**Question:** Store the composition (ordered clips, subtitle cues, audio settings) in the revision
snapshot as schema v3, or in new normalized tables?
**Options:** (a) snapshot v3 — reuses the append-only revision/CAS/replay machinery, file/relational
parity for free; (b) normalized `composition/clip/cue` tables.
**Recommendation: (a).** The database auditor's assessment: the revision system is the strongest
machinery in the codebase; normalized tables add joins and parity work with no querying need at
single-operator scale. Revisit (b) only if per-cue querying or collaboration arrives.
**Blocks:** Phase 3. **Decide by:** Phase 3 design.

## D4 — Subtitles: burn-in, sidecar, or both? — **decided**

**Question:** Are subtitles rendered into exported pixels (burn-in via the existing WebGL/canvas
render path), carried as a separate track/file (WebVTT sidecar on saved videos + player support),
or both?
**Decision (2026-09-02):** burn-in first — cues are part of the single-clip edit specification and
are rendered into the pixels wherever that specification is rendered, through the shader the
preview and the worker already share; no new asset kind, no player work. A sidecar remains a later
option if accessibility or localization demand it. Design and consequences in the
[slice 2.1 plan](roadmap/SLICE_2.1_SUBTITLES_PLAN.md); implemented in slice 2.1.

## D5 — Does the standalone Videos path survive?

**Question:** Standalone Studio work (record/upload → transform → Save to Assets) is a second,
parallel pipeline whose AI results are ephemeral (1-hour TTL, manual save) and whose outputs carry
"No Project". Keep it, or fold everything into Projects?
**Options:** (a) keep as a deliberate "quick clip, no ceremony" path but converge its machinery
(durable results, same capabilities) and offer "make this a Project"; (b) Projects-only.
**Recommendation: (a).** Quick standalone capture-to-download is the product's best
time-to-first-result and worth keeping — but as a thin entry to the same engine, not a second
engine.
**Blocks:** Phase 4 convergence scope. **Decide by:** Phase 4 design.

## D6 — Voice in Projects: build or remove the affordance?

**Question:** Voice is selectable and attachable inside Projects but cannot run there (server gates
it for lack of a durable reconnect identity; local voice results have no save/adopt path). Build a
durable Project voice operation, or remove the dead affordances until it exists?
**Recommendation:** both, in order — remove/disable the dead affordances now (small, honest), and
schedule the durable voice operation in Phase 4 (it rides the existing job model).
**Blocks:** nothing (Phase 1 includes the honesty fix). **Decide by:** Phase 4 for the build.

## D7 — System of record for Characters/Outfits?

**Question:** Characters, Outfits, prompts, and wardrobe variants live in browser IndexedDB with an
optional whole-store cloud mirror whose conflict recovery is destructive pick-a-side. Server
records (Project memberships, attributions) reference them by id. Should the server become the
system of record in cloud deployments (per-record sync, IndexedDB as cache)?
**Recommendation: yes, when cloud persistence is configured** — a brand's characters must follow
the account. Keep browser-local as the local-mode authority. This is sizable (XL) and correctly
sits late in the roadmap; the Phase 1 mitigation is surfacing membership-vs-library divergence and
fixing the reference-image purge hazard.
**Blocks:** Phase 5. **Decide by:** Phase 5 design.

## D8 — One active AI job per owner: policy or placeholder?

**Question:** A schema-level unique index serializes all AI work per account. Deliberate cost
control, or a v1 simplification?
**Recommendation:** keep for now (it is honest cost control for one operator); relax to per-project
scoping only when composition work makes parallel transforms genuinely useful, and then by
configuration, not by dropping the guard.
**Blocks:** nothing near-term. **Decide by:** Phase 4.

## D9 — Deployment model: local-first forever, or hosted ambition?

**Question:** `LIGHTFRAME_ENV=production` demands Neon+R2, yet the transport layer refuses
non-loopback hosts, there is one seeded account, no login throttling, and entitlements are
unenforced. Is "production" permanently "local app with cloud persistence", or is a hosted
multi-tenant service intended?
**Why it matters:** Several P3s become P1s if hosted (throttling, quotas, tenancy, trusted-proxy
origins); the schema is already multi-user-shaped but has no user-creation path.
**Recommendation:** state "local-first, single-operator; hosted service deliberately deferred" as
the standing decision (matching the existing deferred-infrastructure gates), and rename/comment the
config so "production" cannot be misread.
**Blocks:** nothing in Phases 1–5; blocks any team/collaboration ambition. **Decide by:** whenever
a second user matters — explicitly, not by drift.

## D10 — Multi-placement variant sets in one save? — **decided**

**Question:** The save contract already accepts a renditions array but caps it at one; producing
16:9 + 9:16 + 1:1 of one deliverable takes three save rounds that each clear the setup.
**Decision (2026-09-05):** yes — one save accepts up to the four placement aspects, rendered
serially in the browser with per-placement progress and cancel-remaining. The set travels on the
save request while the revision keeps its one chosen placement as intent; the server derives which
member is primary and writes it last, so every existing pointer keeps its meaning. Sibling Versions
are recognizable by a nullable `variantSetId` carried on each Version, added by one expand-first
migration. A failed member leaves the produced ones saved and is named with a retry that joins the
same set. Design and consequences in the
[slice 2.3 plan](roadmap/SLICE_2.3_VARIANT_SETS_PLAN.md); implemented in slice 2.3.

## D11 — HEVC intake?

**Question:** iPhone-default HEVC/ProRes uploads are rejected outright. Offer local
transcode-on-upload where the browser can decode?
**Recommendation: yes** (capability-probed, with honest fallback copy) — this is a first-session
funnel killer for the target audience.
**Blocks:** Phase 2 slice. **Decide by:** before that slice.

## D12 — Live AI Beta: promote, mothball, or excise?

**Question:** The realtime live-transform stack is fully built, triple-gated, default-off, and the
single largest complexity contributor in the capture graph — with no Project integration.
**Recommendation:** mothball — keep the flag off, exclude it from MVP surfaces and marketing, and
revisit after composition ships. Do not spend removal effort now; do not extend it either.
**Blocks:** nothing. **Decide by:** post-Phase 4 review.

## D13 — Compact navigation: Campaigns or Assets in the fourth slot? — **decided**

**Question:** The phone bottom bar keeps Campaigns (declared optional everywhere) and drops Assets
(where finished work lives).
**Decision (2026-09-01):** swapped — Dashboard / Studio / Projects / **Assets**; Campaigns stays on
the rail and is reached from the Dashboard and the Projects list. Implemented in slice 1.5.

## D14 — Retention and cleanup policy

**Question:** Terminal jobs, receipts, and full revision snapshots are never purged; local-mode
saved-video deletion never frees bytes; orphaned rendition/failed byte assets are never swept;
the "Remove from Assets — its file is not erased" copy is false in R2 mode.
**Recommendation:** adopt one maintenance policy: age-bound sweep of unreferenced/failed byte
assets (folding in the reference-image purge), terminal-job/receipt retention horizon, truthful
delete copy per deployment mode, and a stated local-mode reclamation story.
**Blocks:** Phase 5 hygiene slice (the copy fix is Phase 1). **Decide by:** Phase 5.

## D15 — Content-safety posture for generation providers

**Question:** Safety behavior differs by provider and is env-toggleable: a configurable
safety-checker disable flag for video replace, tolerance levels for one image provider, and a
default reference-image model whose name advertises removed content filtering — with no recorded
product decision.
**Why it matters:** A brand/marketing product carrying likeness-transformation features needs one
stated safety policy; today the policy is whatever the env file says.
**Recommendation:** record a policy: production configurations pin safety-enabled models/settings;
the disable flags exist for explicitly authorized research only. Revisit the default model choice.
**Blocks:** nothing technically; reputationally urgent. **Decide by:** Phase 1.

## D16 — Documentation retention for superseded audit corpora

**Question:** The repo carries three audit generations (~10,600 lines archived + the 2026-08-26
audit). The prior convention was "archive, never delete"; this audit's mandate is to delete
superseded material outright (with unique content preserved in canon).
**Recommendation:** delete per the [pruning manifest](audits/DOCUMENTATION_PRUNING_REPORT.md) —
keeping only the documents that live canon still cites, with their unique content absorbed first.
**Blocks:** the pruning step itself — **deletion executes only on your approval of the manifest.**
**Decide by:** now (it is the approval this audit is waiting on).
