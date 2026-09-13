# Slice 3.2 — Multi-source storage: audit and plan

**Document type:** the audit-and-plan output of implementation prompt 28 (Phase 3, slice 3.2 of the
[roadmap](PRODUCT_ROADMAP.md)), written 2026-09-13 against commit `0f819c9e`. Prompt 29 implements
the expand and backfill; prompt 30 verifies, switches read authority and migrates the contracts.
Findings db-1 and STOR-7 are in the [current-state audit](../audits/CURRENT_STATE_AUDIT.md); D1 is
in [Decisions required](../DECISIONS_REQUIRED.md), decided 2026-09-12. **No code was changed for
this prompt.** The decisions in §5 are what needs review before prompt 29 runs.

**In one paragraph.** `project_sources` has `project_id` as its primary key, so a Project holds
exactly one source — but the refusal a client actually receives never comes from that key. It comes
from four layers above it, and the key has never fired. Making the table a keyed collection is
therefore not the hard part; three other things are. First, **byte retention does not read
`project_sources` at all** — the only thing keeping a source's bytes alive is a `project_assets`
row with `role='source'` derived from the snapshot's single `sourceAssetId`, so a second source
would be accepted, stored, and then collectable (§1.5). Second, the escape hatch that would have
fixed that for free — "let every source also be a composition clip" — **does not exist**: no route,
service or client can write a non-null composition, because the checkpoint proposal contract is
strict and has no `composition` key (§1.6). Third, **file mode cannot ride this change at its
current stored version**: both the aggregate and the library schema are `.strict()`, so the first
write after the upgrade poisons the primary file _and_ its backup for the previous build (§1.4).
The plan that follows re-keys `project_sources` in place to `(project_id, source_id)` with a unique
`(project_id, asset_id)` — the shape [slice 3.1 already recorded](SLICE_3.1_COMPOSITION_MODEL_PLAN.md)
— backfills `source_id` from the row's own `operation_key` so the backfill is convergent rather than
merely once-only, gives `project_sources` its own arm in the retention union in both persistence
modes **before** any writer exists, keeps `snapshot.sourceAssetId` as the primary-source pointer
under one new invariant (`the scalar is non-null exactly when the collection is non-empty`), and
adds five endpoints beside the legacy five rather than changing them. The expand stage is **not**
observably inert in the way the prompt assumes, and §3.1 says exactly where it is not.

## 1. Current behaviour, with evidence

### 1.1 The single-source rule is enforced five times, and the primary key is the least of them

| #   | Where                                                                                                | What it does                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`schema.ts:891`](../../apps/api/src/infrastructure/database/schema.ts)                              | `projectId: uuid('project_id').primaryKey()`. Created inline and unnamed in [`0016`](../../apps/api/drizzle/0016_purple_layla_miller.sql), so Postgres named it `project_sources_pkey`.                               |
| 2   | [`project-repository.ts:1765`](../../apps/api/src/infrastructure/database/project-repository.ts)     | `acceptSource` selects any row for the Project `FOR UPDATE` and returns `immutable-source`. Runs **before** the CAS checks, so "already has a source" beats "your version is stale".                                  |
| 3   | [`file-project-repository.ts:1724`](../../apps/api/src/features/projects/file-project-repository.ts) | The same refusal, plus a second disjunct on the current revision's `sourceAssetId`. The comment at :1717 records that only the _current_ revision may decide, so the two adapters answer identically after a removal. |
| 4   | [`project-source-service.ts:270`](../../apps/api/src/features/projects/project-source-service.ts)    | `#accept` replays (on `operationKey` + `requestFingerprint`) or refuses, before either repository is called. **This is the gate a client actually hits.**                                                             |
| 5   | [`rules.ts:1401`](../../packages/domain/src/projects/rules.ts)                                       | `acceptProjectSource` refuses when `currentRevision.snapshot.sourceAssetId !== null`. The doc comment calls it "the one immutable MVP original".                                                                      |

Consequence for sequencing: widening the key changes nothing observable on its own, because layers
2–5 still refuse. That is what makes prompt 29 separable from prompt 30.

### 1.2 The repository already runs the target shape

[`project_working_media_adoptions`](../../apps/api/src/infrastructure/database/schema.ts) at
`schema.ts:1017` is column-for-column the same table as `project_sources` — the same media facts,
the same `(owner_user_id, operation_key)` unique receipt, the same four-column revision foreign key
— but its primary key is `primaryKey({ columns: [projectId, adoptedRevisionId] })`. It is already a
per-project keyed collection. Its read sites show the idiom the source reads must adopt:
`project-repository.ts:2333` uses `.findLast(...)` over every row matching a media reference rather
than `.limit(1)`.

`project_sources` itself has exactly **5** foreign keys (all `ON DELETE restrict`) and **7** CHECK
constraints, `schema.ts:919-966`. Nothing anywhere has an inbound foreign key to it — the
identifier appears once in `schema.ts` and in no `foreignColumns` clause — so the key can be widened
without cascading schema work. `project_sources_owner_operation_unique` is per **owner**, not per
project: it already tolerates many rows per Project and is what makes accept idempotent.
`project_sources_asset_idx` is non-unique and, at head, has no query consumer.

### 1.3 Four reads return an arbitrary row, and one write destroys siblings

| Site                                                         | Problem                                                                                                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project-repository.ts:882` `getCurrentWithSource`           | `LEFT JOIN` on (project, owner) with a statement-wide `.limit(1)` and no `ORDER BY`.                                                                                                |
| `project-repository.ts:913` `getSource`                      | `.limit(1)`, no `ORDER BY`, and no join to the current revision.                                                                                                                    |
| `project-repository.ts:2335` processing-input resolution     | `.limit(1)`, feeding `exactInputAssetId`. A miss returns `not-found`, surfacing as an unexplained 409 on admission.                                                                 |
| `project-repository.ts:1153` `ensureAssetMembershipBackfill` | Collapses per project with `[0] ?? null` at :1156.                                                                                                                                  |
| `project-repository.ts:1993` `removeSource`                  | **`DELETE` keyed by `(projectId, ownerUserId)` only.** Under a collection this removes every source, not the named one. Its prior-source `FOR UPDATE` at :1915 is likewise unkeyed. |

Lock order is load-bearing and documented at `project-repository.ts:1913`: `removeSource` takes
`project_sources` before `projects` because `acceptSource`'s replay path does the same, and leading
with `projects` would open an ABBA window. Any new statement must keep that order. Note that
`acceptSource`'s _fresh_ path locks `projects` first (:1750) and `project_sources` second (:1765) —
the comment defends only against the replay path, and a collection makes both `FOR UPDATE`s lock N
rows instead of 0-or-1. Whether a genuine accept-vs-remove cycle exists was **not** established:
nothing in the repository exercises concurrent accept and remove. Treat it as a hypothesis (§4).

### 1.4 File mode stores one nullable source, and its schemas are strict in both directions

[`file-project-persistence-schema.ts:291`](../../apps/api/src/features/projects/file-project-persistence-schema.ts)
holds `source: storedProjectSourceSchema.nullable().default(null)` inside an object closed by
`.strict()` at :295; `librarySchema` is `.strict()` at :442 with `schemaVersion: z.literal(7)`. Four
consequences, all verified:

1. `#write` persists `librarySchema.parse(next)` output, so a new key is written into every owner's
   file on the first write after the upgrade — including Projects with no sources.
2. An old build then reading that file fails `librarySchema.safeParse` on `unrecognized_keys`, fails
   each older envelope, and reaches a **throwing** `legacyLibraryEnvelopeSchema.parse` at :628.
   `#readFromDisk` falls back to the backup — which `#write` poisons identically at
   `file-project-repository.ts:553`. There is no empty-library fallback; the user gets a 500 on
   every Project surface and `#ownerIdsOnDisk`'s bare `catch {}` at :520 hides the owner from sweeps.
3. The journal `superRefine` is a **write** gate, not a recovery check: `#write` runs
   `journalSchema.parse(journal)` at :545 before touching disk. Its `project-source-accept` case at
   `file-project-persistence-schema.ts:736` asserts the **singular** `aggregate.source` carries the
   operation's key, so an accept that appends only to a new collection throws at write time.
4. A `.default([])` carries no invariant. The aggregate `superRefine`'s `owned` chain (:296-313) and
   the library identity scans (:443-537) list every collection explicitly. Precedent cuts both ways:
   `97f8c52b` added `renditions` with a default **and** added it to the `owned` chain in the same
   diff; `eb73e3b1` added `workingMediaAdoptions` with a default **and** bumped the schema version.

The library duplicate-identity block at :462 covers eight id sets but **not** source operation keys
— the file store has no structural analogue of `project_sources_owner_operation_unique`. Today that
absence is masked because one source per Project makes the procedural scan equivalent.

### 1.5 Byte retention never reads `project_sources` — this is finding STOR-7's real content

[`project-retention-policy.ts:27`](../../apps/api/src/infrastructure/database/project-retention-policy.ts)
unions five arms over `project_assets`, `project_version_references` (asset and thumbnail) and
`project_outputs`. It never mentions `project_sources`. The file-mode twin at
`file-project-repository.ts:2498` reads `assetLinks` and `versionReferenceLinks` the same way.

The sole producer of a `role='source'` asset link is
[`project-snapshot-relations.ts:60`](../../apps/api/src/features/projects/project-snapshot-relations.ts),
derived from `revision.snapshot.sourceAssetId` — a scalar. `ProjectVersionReferenceRole` is
`'working' | 'presented' | 'clip'` ([`types.ts:245`](../../packages/domain/src/projects/types.ts));
there is no `'source'` member, so a reused Saved Video Version source is retained today only because
accepting it also sets `workingMedia` and `presentedMedia`.

Callers of `retainsAsset`: `project-working-media-service.ts:140`,
`project-source-service.ts:146`, `project-rendition-service.ts:127`,
`saved-videos/saved-video-service.ts:329`, and `asset-lifecycle-registry.ts:140` inside the deletion
transaction. The reachable trigger today is **deleting a Saved Video whose asset is also a Project
source**; slice 5.2's orphan sweep widens it to every unanchored asset.

**So a second source that leaves no snapshot trace has no retention anchor.** Correcting two things
often said about this while checking it:

- `assertRevisionAssetLinks` (`project-repository.ts:288`) is a **one-way subset test** —
  `projectAssetLinksForRevision(revision).every(validLink)`. Extra submitted links are permitted.
- The retention union's version arms carry **no role filter**, so a `role='clip'` reference does
  anchor both a Version's asset and its thumbnail. The clip derivation is symmetric and complete for
  both media kinds. It is simply never exercised — see §1.6.

### 1.6 Nothing can write a composition, so "make each source a clip" is unavailable

The only route carrying a client-authored snapshot is `POST /api/projects/:projectId/revisions`
([`routes.ts:285`](../../apps/api/src/features/projects/routes.ts)), whose body parses through
`projectSessionProposalSchema` ([`projects.ts:1095`](../../packages/contracts/src/projects.ts)) — a
`.strict()` object over exactly `workflowPhase`, `liveMode`, `transform`, `localEdit` and
`exportSpecification`. There is no `composition` key, so a client that sends one gets a 400. Every
other production reference sets it to `null`: `createEmptyProjectSnapshot` (`rules.ts:583`), the
v2→v3 read map (`projects.ts:599`), the source-removal reset (`rules.ts:1527`). The only non-null
`Composition` in the repository is a fixture in `project-snapshot-relations.test.ts:112`.

This kills the cheapest retention answer. It also means the clip retention machinery shipped in 3.1
is correct-but-unexercised: the Postgres `project_version_references` → `video_versions` join for a
clip, the `role='clip'` enum values from `0027`, and `assertReadyVersionReferences` on clip media
have never run outside a unit test.

### 1.7 The scalar is authority, not a label

`snapshot.sourceAssetId` is documented at `types.ts:173` as "The primary, first-accepted source.
Source membership is relational, never snapshot state." The second half is **not true at head**, and
the places that make it untrue are the ones 3.2 must price:

- `sourceStatus` is produced **from the scalar** at `project-service.ts:209` and `:312`, and
  `rules.ts:744` / `:1327` throw `invalid-snapshot` when the scalar and the fact disagree.
- `assertReadyProjectSource` (`project-repository.ts:416`) requires
  `source.assetId === revision.snapshot.sourceAssetId` on every accept; the file twin is the
  aggregate `superRefine` at `file-project-persistence-schema.ts:319` and the `validSource` guard at
  `file-project-repository.ts:1752`, which **throws** rather than refusing.
- `ProjectSourceService.get`, `remove` and `content` cross-check against it
  (`project-source-service.ts:369`, `:372`, `:417`); `content` alone resolves by row with no
  cross-check at `:426`.
- The contract `superRefine` (`projects.ts:1458`) refuses any source response whose scalar is null.
  It is a **presence** test, not an identity test — a response naming an unrelated asset still
  parses.
- The web's only "has a source" signal is the scalar, across 12 read sites; `accepted` derives from
  it at `useProjectSourceController.ts:214`.
- `removeProjectSource` (`rules.ts:1512`) nulls the scalar **and** `workingMedia`, `presentedMedia`,
  `lastSuccessfulOutput`, `composition` and `localEdit`. Its own comment at :1519 records that with
  several sources this "narrows to pruning the clips that named the removed one".

### 1.8 What the legacy endpoints actually promise

Pinned by [`routes.test.ts`](../../apps/api/src/features/projects/routes.test.ts): a replayed upload
returns 200 with a body `toEqual` the original 201 (:632); after remove, `status: 'draft'` (:711),
`workflowPhase: 'source'` (:715), the body has **no** `source` property (:722), and `GET /source`
then 404s (:726). A replayed removal with the same stale CAS pair converges to 200 (:733); the same
pair after a replacement 409s with `project-version` (:747). The observable contract is written in
[feature-behavior 17, clause 11](../user-flows/feature-behavior/17-empty-project-lifecycle.md) and
in the [`project-source-entry` and `project-source-vs-assets` scenarios](../MANUAL_QA.md).

### 1.9 Migration mechanics

`drizzle-kit generate` **will not emit the PK drop.** A single-column `.primaryKey()` →
`primaryKey({columns:[...]})` change produces the `ADD CONSTRAINT` plus a _commented-out_
`-- ALTER TABLE ... DROP CONSTRAINT`. Run as generated it reaches `ADD CONSTRAINT` with the old key
still present and Postgres raises `42P16`. The `.sql` must be hand-edited to fill in the real name —
exactly what [`0004`](../../apps/api/drizzle/0004_shiny_lockheed.sql) did for `creative_assets`:

```sql
ALTER TABLE "creative_assets" DROP CONSTRAINT "creative_assets_pkey";--> statement-breakpoint
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_owner_user_id_kind_id_pk" PRIMARY KEY("owner_user_id","kind","id");
```

`drizzle-kit check` reads only `meta/*_snapshot.json`; it never opens a `.sql` file, so it cannot
catch the missing drop. In CI `db:migrate:development` runs before `db:check`, so the failure
surfaces as a migrate error. The verified-data-migration precedent is
[`0010`](../../apps/api/drizzle/0010_quiet_wind_dancer.sql): `LOCK TABLE … IN SHARE ROW EXCLUSIVE
MODE`, `pg_temp` validation functions, `RAISE EXCEPTION USING` preflights, `DROP FUNCTION` before
the schema change. There is **no** data-migration framework — `project-migration.ts` does not exist;
`project-migration.test.ts` is a SQL-text oracle that hard-codes each filename and, for most
migrations, bans `DROP|TRUNCATE|DELETE|UPDATE|INSERT`. Its `0010` block is the one case shape that
permits `DROP` and `INSERT`; its `0016` block — the one a copy-paste author reaches for — does not.

The receipt ledger that does exist is `owner_migrations` (`schema.ts:370`), used by
`ensureAssetMembershipBackfill` (`project-repository.ts:1088`), which checks the receipt, does the
work and writes the receipt in **one** transaction. Receipts are permanent per `(owner, migrationId)`
— a corrected backfill needs a new id, never an edited body.

## 2. Affected code, contracts, storage and tests

| Layer                 | Files                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage schema        | `apps/api/src/infrastructure/database/schema.ts`; new `apps/api/drizzle/0028_*.sql` + generated meta snapshot                                                                                                                                                                   |
| Relational repository | `apps/api/src/infrastructure/database/project-repository.ts` (`acceptSource`, `removeSource`, `getCurrentWithSource`, `getSource`, the processing-input read, the membership backfill), `project-repository-mappers.ts`, `project-retention-policy.ts`                          |
| File repository       | `apps/api/src/features/projects/file-project-repository.ts`, `file-project-persistence-schema.ts` (schema **v8**)                                                                                                                                                               |
| Port                  | `apps/api/src/features/projects/project-repository.ts` (`ProjectSourceRecord`, `ProjectCurrentSourceRead`, accept/remove inputs, new list/by-id members)                                                                                                                        |
| Service + routes      | `project-source-service.ts`, `routes.ts`, `route-inventory.test.ts`                                                                                                                                                                                                             |
| Domain                | `packages/domain/src/projects/rules.ts` (new `addProjectSource`, relaxed removal), `types.ts` (`PROJECT_SOURCE_LIMIT`, new conflict kind)                                                                                                                                       |
| Contracts             | `packages/contracts/src/projects.ts` (list/accept-additional/remove-specific schemas, new conflict member), `shared-contract-parity.test.ts`                                                                                                                                    |
| Retention             | both policies, plus `asset-lifecycle-registry.ts` only if the union shape changes                                                                                                                                                                                               |
| Tests                 | `project-repository.test.ts`, `project-repository.postgres.integration.test.ts`, `file-project-repository.test.ts`, `project-source-service.test.ts`, `routes.test.ts`, `schema.test.ts`, `project-migration.test.ts`, `projects.test.ts`, `project-snapshot-relations.test.ts` |
| Docs                  | `docs/user-flows/feature-behavior/17-empty-project-lifecycle.md`, `docs/product/DOMAIN_MODEL.md:60`, `docs/architecture/TARGET_ARCHITECTURE.md:90`, `docs/MANUAL_QA.md`, `docs/roadmap/PRODUCT_ROADMAP.md:200`                                                                  |
| **Not touched**       | Every file under `apps/web`. See §3.6.                                                                                                                                                                                                                                          |

## 3. Design and implementation plan

### 3.1 Where the expand stage is _not_ inert, and what to do about it

The prompt assumes the expand is observably inert. Four things make that false, and each has a
cheap answer that belongs in prompt 29 rather than being discovered during it:

1. **`ProjectSourceRecord` gaining `sourceId` breaks file mode on read.** `storedProjectSourceSchema`
   is `.strict()`, and every stored source on disk lacks the key. Answer: the field lands with a
   `.default()` in the stored schema **and** the v7→v8 migration fills it from `operationKey`, so no
   file 500s and the default is never the value that persists.
2. **`projectSourceValues` is `typeof projectSources.$inferInsert` field-by-field.** A `NOT NULL`
   `source_id` with no default is a **typecheck** failure, not a silent pass. Answer: that is the
   desired signal — the mapper is updated in the same commit.
3. **The scripted repository test is a positional queue.** Every awaited call shifts one scripted
   result, and 12 cases assert `remaining()` is 0, plus exact insert sequences at
   `project-repository.test.ts:446` and `:688`. Answer: add no statement to a scripted path. Every
   read predicate in §3.4 is an extra `JOIN` or `WHERE` inside an existing statement, not a new one.
4. **`schema.test.ts:147` pins `foreignKeys).toHaveLength(5)`.** Answer: add no foreign key. The new
   key needs none; the index assertion at :148 is `arrayContaining`, so a new unique index passes.

Genuinely inert: the HTTP projection. `toProjectSource` (`project-repository-mappers.ts:133`) and
`sourceResponse` (`project-source-service.ts:73`) both enumerate fields explicitly, so a new column
cannot leak into a response body. And `project-migration.test.ts` reads named files, so `0028` is
invisible to it until a block is written.

### 3.2 The storage shape — re-key in place

```ts
// schema.ts — project_sources
sourceId: uuid('source_id').notNull(),          // new, third position
// projectId loses .primaryKey()
primaryKey({ columns: [table.projectId, table.sourceId] }),
uniqueIndex('project_sources_project_asset_unique').on(table.projectId, table.assetId),
```

Migration `0028`, hand-edited after generation, in this order:

```sql
LOCK TABLE "project_sources" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
-- preflight: every source row has a role='source' asset link for the same (owner, asset).
-- RAISE EXCEPTION if not; this is what makes the retention arm in 3.3 provably inert.
-- preflight: no (project_id, operation_key) collision, so the backfilled key is unique.
ALTER TABLE "project_sources" ADD COLUMN "source_id" uuid;--> statement-breakpoint
UPDATE "project_sources" SET "source_id" = "operation_key" WHERE "source_id" IS NULL;--> statement-breakpoint
ALTER TABLE "project_sources" ALTER COLUMN "source_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project_sources" ALTER COLUMN "source_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "project_sources" DROP CONSTRAINT "project_sources_pkey";--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_id_source_id_pk" PRIMARY KEY("project_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_sources_project_asset_unique" ON "project_sources" ("project_id","asset_id");
```

Three column statements rather than a defaulted `ADD COLUMN` so the table is not rewritten by a
volatile default. The `SET DEFAULT` **after** `SET NOT NULL` is deliberate and is the whole rollback
window — see §3.8. The migration needs its own `describe` block in `project-migration.test.ts`
modelled on the `0010` case (which permits `DROP` and `INSERT`), **not** the `0016` case.

### 3.3 The retention anchor — `project_sources` joins the union

In the expand stage, before any writer exists, add two arms to
`DrizzleProjectRetentionPolicy.retainedAssetIdsWith`: the direct `project_sources.asset_id`, and a
join to `video_versions` on `(saved_video_id, owner_user_id, video_version_id)` picking up
`asset_id` and `thumbnail_asset_id`, mirroring the existing version arms. The file-mode twin at
`file-project-repository.ts:2498` gains the same two.

This is **provably inert at head**: `acceptSource`'s transaction already guarantees every
`project_sources` row has a `project_assets` `role='source'` row for the same `(owner, asset)`, via
`assertReadyProjectSource` plus `assertRevisionAssetLinks`. The `0028` preflight asserts that in SQL
and the integration test re-asserts it, so "the new arms change no answer for existing data" is
proved rather than claimed.

Why not the alternatives: making each source a clip is unavailable (§1.6); widening
`projectAssetLinksForRevision` to read the collection breaks its purity as a snapshot function for
no gain; writing a `role='source'` link directly for a non-primary source is mechanically possible
(the subset test permits it) but records a falsehood in the history table that the membership
listing at `project-repository.ts:1455` reads back.

The rule this states is the honest one: **a Project's source bytes are retained while the Project
holds that source.** Release follows removal, while anything a revision actually _used_ stays
anchored by the append-only `project_assets` / `project_version_references` history — which
`removeSource`'s comment at :1988 confirms is never deleted.

### 3.4 The primary, and the one new invariant

The primary is **the row whose `asset_id` equals the current revision's `snapshot.sourceAssetId`**.
No `is_primary` column: that would be a second statement of a fact the snapshot already makes, and
the two could disagree. `assertReadyProjectSource` has enforced the equality on every accept since
`0016`, so the predicate is definitionally true for all existing data.

The invariant 3.2 adopts, enforced in both accept and remove transactions in both modes:

> `snapshot.sourceAssetId` is non-null **exactly when** the collection is non-empty.

That single rule is what keeps `sourceStatus` derivation, the revision invariant at `rules.ts:1327`,
the contract `superRefine`, `saveProjectOutput`, `adoptProjectWorkingMedia`, the processing-input
resolution and the web hydration gate correct **with no change to any of them**. It is the reason
the scalar stays and snapshot v4 is not opened.

Read predicates, all added during expand while exactly one row provably exists, so the switch is a
no-op rather than a behaviour change:

- `getCurrentWithSource` already joins the current revision; its `LEFT JOIN` gains
  `and project_sources.asset_id::text = snapshot ->> 'sourceAssetId'`, compared as **text** following
  the deliberate precedent in `currentWorkingMediaMatch` (`project-repository.ts:257`), so malformed
  historical JSON is rejected by snapshot parsing rather than by Postgres.
- `getSource` gains the `currentRevisionMatch` join it currently lacks, plus the same predicate.
- The processing-input read selects the source whose media reference matches `snapshot.workingMedia`
  rather than an arbitrary row.
- `ensureAssetMembershipBackfill`'s `[0] ?? null` becomes the same predicate. Note its receipt is
  permanent, so an owner already backfilled will never re-derive; widening the derivation to all
  sources needs a **new** migration id, and that is a separate decision (§5, Q4).

### 3.5 Domain, service and contract changes

**Domain.** `acceptProjectSource` is not parameterisable — it also overwrites `workingMedia` and
`presentedMedia`, clears `lastSuccessfulOutput` and forces `workflowPhase: 'creative'`
(`rules.ts:1423`), all wrong for a second source. A **new** rule `addProjectSource` appends a
revision that changes only `updatedAt`, leaving all four alone. It must append one: every
`project_sources` row carries a four-column `RESTRICT` foreign key to a revision. Its revision
`source` is `'user-edit'`.

`removeProjectSource` keeps today's wholesale blanking and becomes the **primary/legacy** removal.
A new `removeProjectSourceById` removes a non-primary source and, per the comment already in the
code, prunes the clips that named it — refusing rather than emptying when the composition would be
left with zero clips (`composition/rules.ts:41`). It **refuses to remove the primary while other
sources remain**, with a new conflict kind. That preserves the §3.4 invariant with no re-pointing
rule and leaves "promote another source to primary" to slice 3.4, where a UI can ask.

`assertReadyProjectSource` relaxes to: the **primary** row names the scalar; a non-primary row names
only its own accepting revision. The file-mode twins at `file-project-persistence-schema.ts:319` and
`file-project-repository.ts:1752` relax identically, in the same commit.

**Service.** The replay branch at `project-source-service.ts:270` must widen from "the Project's one
source" to "any source of this Project carrying this operation key" — otherwise an accept-additional
replay returns `immutable-source` instead of the original 200. The legacy refusal keeps its exact
current behaviour on the legacy endpoint. Note this leaves two owners of the replay decision (the
service gate and the repository receipt at `project-repository.ts:1700`); consolidating on the
repository receipt is the right end state and is listed as a follow-up rather than done here.

**Contracts, additive beside the legacy schemas — never by widening them.** Both
`projectSourceResponseSchema` and its nested source object are `.strict()`, the source object has no
identifier, and `contentUrl` is regex-pinned to the singular path. So:

| New                                         | Shape                                                                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectSourceListResponseSchema`           | `{ project, revision, sources: [...] }`, each item the existing byte-fact block plus `id: z.uuid()` and a two-uuid `contentUrl` regex, `.max(PROJECT_SOURCE_LIMIT)`                                                           |
| `addProjectSourceRequestSchema`             | the upload metadata, plus the two CAS tokens                                                                                                                                                                                  |
| `reuseAdditionalProjectSourceRequestSchema` | as the legacy reuse request                                                                                                                                                                                                   |
| `removeProjectSourceByIdRequestSchema`      | `sourceId` plus the two CAS tokens                                                                                                                                                                                            |
| conflict member                             | a new kind for "that source is the primary" / "source limit reached" — `immutable-source` must **not** be repurposed; changing what an existing literal means is the class of break the discriminated union exists to prevent |

Derive the item shape from `projectSourceResponseSchema.shape.source.extend({ id })` so the fifteen
byte-fact fields keep one owner. Name the collection member **`sources`**, not `source`: the embedded
`projectRevisionSchema` already carries a key named `source` meaning revision provenance
(`projects.ts:773`), and a body with two differently-typed `source` keys at two nesting levels is a
trap.

**Routes** — five new, inside the same `if (sourceService !== undefined)` block at `routes.ts:308`:

```text
GET    /api/projects/:projectId/sources                        (+ HEAD sibling)
POST   /api/projects/:projectId/sources
POST   /api/projects/:projectId/sources/reuse
POST   /api/projects/:projectId/sources/:sourceId/remove
GET    /api/projects/:projectId/sources/:sourceId/content      (+ HEAD sibling)
```

`route-inventory.test.ts:102` is an exact sorted set and synthesises HEAD siblings on the _expected_
side only, so a missing HEAD registration fails it. The legacy `/source/content` stays a first-class
route resolving the primary — not a redirect, which would break Range requests for some clients.

### 3.6 The browser is not touched

Every web enforcement of "one source" is a disabled control, a boolean derived from the scalar, or a
guard in the capture bridge — and prompt 31 (slice 3.4) owns all of them. Because the §3.4 invariant
keeps the scalar meaning exactly what the web already reads, `apps/web` needs nothing from 3.2. Do
**not** land the client functions early: `knip` is in the quality gate and would fail an unused
export.

One thing to record for 3.4: `AddVideoToProjectDialog.tsx:45-58` fabricates the refusal **in the
browser** with no server call. After the collection is live it will keep refusing what the API
allows. It is the single web enforcement that will actively contradict the new capability.

### 3.7 Order of changes

**Prompt 29 — expand and backfill** (one deployment)

1. `schema.ts` + `0028` + generated meta snapshot; `project-migration.test.ts` block on the `0010`
   case shape. Preflights RAISE.
2. `project-repository-mappers.ts` (`projectSourceValues`, `toProjectSource`), port
   `ProjectSourceRecord` gains `sourceId`.
3. File mode: `storedProjectSourceSchema` gains `sourceId` with a default; **schema v8** with a v7
   envelope in the migration cascade that fills it from `operationKey`; the `owned` chain, the
   library identity scans (including the missing source-operation-key uniqueness) and the journal
   `project-source-accept` case all extended. Seven `schemaVersion: 7` assertions updated, one
   v7→v8 migration test added.
4. Retention: the two new arms in both policies (§3.3), with the inertness proof as a test.
5. Read predicates (§3.4) — every one an extra `JOIN`/`WHERE` inside an existing statement.
6. `removeSource`'s `DELETE` and prior-source `FOR UPDATE` take the source key, keeping
   `project_sources` as the first lock.
7. Dual-read verification tooling (§3.9).

_Nothing observable changes. Every legacy test passes unchanged. No new endpoint, no new domain rule,
no writer._

**Prompt 30 — verify, switch, contracts** (a second deployment)

8. Run the dual-read verification across all existing data; record counts, owners, byte facts.
9. Domain: `addProjectSource`, `removeProjectSourceById`, `PROJECT_SOURCE_LIMIT`, the new conflict
   kind, relaxed `assertReadyProjectSource` and its two file twins.
10. Service: widened replay lookup; the new accept/remove/list/content paths.
11. Contracts + routes + both oracles + `shared-contract-parity.test.ts`.
12. Docs: feature-behavior 17, `DOMAIN_MODEL.md:60`, `TARGET_ARCHITECTURE.md:90`, `MANUAL_QA.md`,
    and the `PRODUCT_ROADMAP.md:200` correction (§5, Q1).

### 3.8 The rollback boundary, measured rather than asserted

The two persistence modes have **different** boundaries, and the plan must say so.

**Relational.** After `0028` the pre-`0028` binary still runs — but only because `source_id` carries
`DEFAULT gen_random_uuid()`. `projectSourceValues` in the old build emits no `source_id`, so
dropping the default would make every old-build accept fail with a `NOT NULL` violation. Keeping the
default **is** the rollback window. It closes the moment a second row exists for any Project,
because the old `getCurrentWithSource`'s `.limit(1)` then returns an arbitrary row. Since prompt 29
ships no writer, the window is open for the whole of prompt 29 and closes on the first
accept-additional after prompt 30.

**File mode.** The boundary closes at the **first write after the upgrade**, not at the first second
source, because v8 poisons the primary file and its backup for the old parser (§1.4). Rolling back a
`local`-mode deployment after any write requires restoring the file, not redeploying the binary.

Neither mode gets a down-migration, matching every migration from `0016` to `0027`. Production is
never migrated automatically.

### 3.9 Dual-read verification

Two pieces, because one cannot do the job:

1. A case in `project-repository.postgres.integration.test.ts` — the file
   `.github/workflows/quality.yml:156` already names, so a new file would be invisible to CI —
   asserting the collection read and the legacy read agree on count, owner, asset id and every byte
   fact, and that the retention arms return the same set before and after the expand.
2. A dry-run script under `apps/api/scripts/`, modelled on `backfill-local-data.ts`, that an
   operator runs against real data and that prints counts and mismatches without writing. Prompt 30
   requires verification "across all existing data", and a test only ever sees synthetic fixtures.
   `check:script-references` will want it referenced from documentation.

## 4. Risks and dependencies

| Risk                                                | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The unkeyed `DELETE` becomes remove-all             | Keyed in step 6 of prompt 29, before any second row can exist. A test asserting a sibling survives.                                                                                                                                                                                                                                                                                                                          |
| A non-primary source's bytes are collected          | §3.3, landed in expand, before any writer.                                                                                                                                                                                                                                                                                                                                                                                   |
| File-mode rollback is one-way after the first write | Stated in §3.8; operators told to snapshot the data directory before a `local`-mode upgrade.                                                                                                                                                                                                                                                                                                                                 |
| `drizzle-kit` silently omits the PK drop            | §1.9; `db:migrate:development` in the database job catches it as `42P16`.                                                                                                                                                                                                                                                                                                                                                    |
| The accept-vs-remove lock cycle widens with N rows  | **Unverified** — nothing exercises concurrent accept and remove. Prompt 29 should add that test before deciding whether to close it, and not cite it as a known defect until it does.                                                                                                                                                                                                                                        |
| File and relational adapters diverge                | There is **no** behavioural parity oracle today; `shared-contract-parity.test.ts` compares constants only, and the relational suite skips without `DATABASE_URL`. Three divergences already sit on or beside these paths (the `#hasBlockingProcessingAttempt` status refusal at `file-project-repository.ts:1819`, the extra snapshot disjunct in the file refusal, and the absent file-mode readiness verification). §5 Q5. |
| Unbounded per-project bytes                         | There is no per-project accounting and no quota anywhere. Three sources triple stored bytes with nothing to observe it. §5 Q3.                                                                                                                                                                                                                                                                                               |

**Dependencies.** D1 decided 2026-09-12. Slice 3.1 landed. No dependency on 3.3 or 3.4 — this slice
deliberately ships no writer the browser can reach.

## 5. Questions whose answers change the implementation

**Q1 — Which document governs the endpoint work?** `PRODUCT_ROADMAP.md:197` ends slice 3.2 at
"contract migration"; `:200` gives slice 3.3 "sources collection endpoints" — the same work. Slice
3.3's other item, the v2→v3 snapshot read migration, already landed in 3.1. Decisive evidence:
**there is no prompt for slice 3.3 anywhere in [IMPLEMENTATION_PROMPTS.md](IMPLEMENTATION_PROMPTS.md)**
— the sequence runs 28, 29, 30, then 31 for slice 3.4 — and prompt 31 assumes the collection
endpoints exist. _Recommendation: follow the prompts; the endpoints land in prompt 30, and
`PRODUCT_ROADMAP.md:200-202` is corrected to say so._

**Q2 — What is `PROJECT_SOURCE_LIMIT`?** Contracts bounds everything else it lists
(`SUBTITLE_CUE_LIMIT` 200, `COMPOSITION_CLIP_LIMIT` 100). Today the primary key was the bound.
_Recommendation: 100, matching the clip limit, since a clip can only name media the Project holds._
This is the one product number that needs a nod rather than a default.

**Q3 — Does multi-source ship without per-project byte accounting?** There is none today and adding
one is new product surface. _Recommendation: yes, ship without it, and record it as a named
follow-up against slice 5.2's maintenance sweep_ — but say so deliberately rather than by omission.

**Q4 — Does `project-asset-memberships-v1` get a v2?** Line `project-repository.ts:1156` will
under-derive memberships for every source after the first, and the existing receipt means no
already-backfilled owner re-runs. _Recommendation: defer, with a recorded reason_ — membership is
organizational and carries no byte-retention authority — _rather than leaving it an oversight._

**Q5 — Does 3.2 add the behavioural parity suite?** The 2026-08-26 audit asked for it and the
roadmap absorbed it into this slice's risk mitigation ("the conformance suite the 2026-08-26 audit
asked for, its step-13, absorbed here"). This slice is exactly the change that produces silent
divergence. _Recommendation: yes, a minimal one covering the source paths only_ — the full
conformance suite is its own slice, but shipping this change with zero behavioural parity coverage
is the largest untested risk in the plan.

## 6. Follow-ups discovered, out of scope

- **Canon is stale about source removal.**
  [feature-behavior 17, clause 11](../user-flows/feature-behavior/17-empty-project-lifecycle.md) says
  removal leaves "local edit — intact, and clearing only the derived working and presented media".
  At head `removeProjectSource` also clears `lastSuccessfulOutput`, `composition` and `localEdit`
  (`rules.ts:1512`), pinned by `projects.test.ts:219`. The behaviour changed 2026-09-04 in `9cf7df53`
  (slice 2.1) and the clause was not corrected — it survived the 3.1 doc edit on 2026-09-12. The doc
  is wrong, not the code. Prompt 30's doc update is the natural place to fix it.
- **Two owners of the replay decision** — the service gate (`project-source-service.ts:270`) and the
  repository receipt (`project-repository.ts:1700`). The service gate only works because there is at
  most one source to read.
- **Clip retention is correct but unexercised** (§1.6). The first code to hit the
  `project_version_references` → `video_versions` join for a clip will be slice 3.3's writer, and a
  defect there surfaces as silent byte loss, not a red test.
- **`project_sources_asset_idx` has no query consumer** at head; §3.3 gives it its first.
- **The schema oracle lists 26 of 32 tables** (db-12, scheduled for prompt 44).
  `project_working_media_adoptions`, `project_renditions`, `project_asset_memberships`,
  `project_operation_receipts` and `ai_usage_ledger` are unoracled.
- **Three file-vs-relational divergences** sit on or beside the source paths (§4). None is 3.2's to
  fix; all three should be documented where they live.

## 7. Expand and backfill (prompt 29), 2026-09-13

Three decisions changed between §3 and the code — two found by re-auditing the key choice before
touching anything, one by the review pass afterwards. All three made the stage smaller.

### 7.1 The key is the media, not a new column

§3.2 proposed a `source_id uuid` column backfilled from `operation_key`. It shipped as
`PRIMARY KEY (project_id, asset_id)` with **no new column**, which states the rule §3 wanted — the
unique `(project_id, asset_id)` that slice 3.1 recorded, so a `ProjectMediaReference` resolves to at
most one source row — once instead of twice.

The argument that decided it: a `source_id` whose value is always `operation_key` is a duplicated
column, and the column is what created every remaining risk in §3. It needed a `DEFAULT` so the
pre-`0028` binary could still insert (`projectSourceValues` emits only named columns), which made the
rollback window depend on a default nobody must ever drop; it needed a three-statement add to avoid a
table rewrite; and it changed `ProjectSourceRecord`, so it changed the file-mode stored shape too. A
key made of columns every row already carries needs none of that: there is no value to backfill, the
old binary writes both columns already, and the relational rollback window is **unconditional** for
the whole of prompt 29 rather than conditional on a default.

It also turned out that the removal input already named a source this way —
`RemoveProjectSourcePersistenceInput.removedAssetId` has always carried the asset — so the read that
resolves it needed no port change.

### 7.2 The file-mode collection, and its retention arm, move to prompt 30

§3.7 put a `sources` array and file schema **v8** in this stage. Both are deferred, with a reason
rather than by omission.

During expand, file mode's `sources` would hold exactly `source === null ? [] : [source]` — a derived
field with no independent content, stored on disk, policed by an agreement invariant, and deleted in
prompt 30. The expand→switch split exists because a relational store cannot change a constraint and
its readers atomically; file mode has no such window, since `parseLibrary` migrates on read and
`#write` rewrites the whole document, so the format change and the writer change are already one
atomic step there. Splitting them buys nothing and costs the file-mode rollback window (§3.8) for the
whole of prompt 29 as well as prompt 30.

The retention arm follows it, for the same reason and against my first instinct. A first pass added
one to `FileProjectRepository`, on the parity argument that both stores must state the same rule. The
review showed it was unreachable: the stored aggregate has one `source`, tied by
`storedAggregateSchema` to the revision that accepted it, so `assetLinks` already covers it — and it
reads `aggregate.source`, so it would have to be rewritten for `aggregate.sources` anyway. The two
stores do not state different rules; file mode has nothing extra to retain until it has a collection.

### 7.3 Detaching the source empties the collection

§3.7 said to key `removeSource`'s `DELETE` by the removed asset, and the first pass did. That was
wrong, and it made a wedge: with the primary gone the snapshot pointer is null, every read resolves a
source through that pointer, so a surviving sibling became unreachable **and** unremovable — the
service's convergence branch answers 200 for it. Before the change that state surfaced as a 404.

The `DELETE` stays keyed by Project, because that is what the command means: the legacy removal is
"this Project goes back to having no source" (§5's D-G), and the revision it commits says
`sourceAssetId: null`. Emptying is not a hazard there, it is the operation. Removing one source of
several is a different command with its own key and its own rule, and it arrives with the writer.
The `FOR UPDATE` read above it **is** keyed, so a stale caller is told the source it was looking at is
gone rather than locking whichever sibling the plan reached first.

### 7.4 What shipped

| Change                                                                                       | Where                                                                                                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `project_sources` re-keyed to `(project_id, asset_id)`                                       | `schema.ts`, `drizzle/0028_strange_mister_fear.sql`                                                       |
| One preflight, guarding the read change, that `RAISE`s rather than letting a Project go dark | `0028`                                                                                                    |
| `project_sources_version_idx`, the index its two peer link tables already have               | `schema.ts`, `0028`                                                                                       |
| `project_sources` joins the byte-retention union (asset + borrowed-Version thumbnail)        | `project-retention-policy.ts`                                                                             |
| `removeSource` locks the source the caller named, and detaches every one                     | `project-repository.ts`                                                                                   |
| `getSource` and `getCurrentWithSource` name the source the current revision points at        | `project-repository.ts`                                                                                   |
| The processing input resolves by media reference, which is the question that site asks       | `project-repository.ts`                                                                                   |
| `projectSourceMediaReference` given one owner on the port, replacing three copies            | `project-repository.ts` (port) and its three callers                                                      |
| Dual-read verification, as a script and as an integration case                               | `apps/api/scripts/verify-project-source-collection.ts`, `project-repository.postgres.integration.test.ts` |

`0028` carries no data statement. The key is made of columns every row already has, so the existing
row **is** the collection's first member — the backfill is a no-op by construction rather than a step
that has to be run and verified. The migration reports nothing: a first pass used `RAISE NOTICE` for
the roadmap's "backfill counts reported", but `drizzle-kit` attaches no notice listener to the `pg`
driver, so it printed to nobody. `db:verify-sources` reports the counts, and exit-codes on divergence.

Nothing observable changed: the service, both repositories and the domain still refuse a second
acceptance, so the collection has exactly one member everywhere.

### 7.5 Evidence

- `0028` applied to the development database, then the whole chain `0000`–`0028` applied to an empty
  one. `project_sources_project_id_asset_id_pk` and `project_sources_version_idx` confirmed in
  `information_schema` / `pg_indexes`.
- The preflight passed over all 51 stored source rows. That is the load-bearing result: it is the
  first check anywhere that every stored source is the one its Project's current revision names,
  which is exactly the precondition the new reads depend on.
- `bun run --filter @studio/api db:verify-sources`:
  `{ projects: 3, projectsHoldingSources: 2, sourcesHeldByTombstonedProjects: 49, collectionsLargerThanOne: 0, divergences: 0 }`.
  The live population is small; 49 of the 51 rows belong to tombstoned Projects, which still retain
  their bytes. A first pass reported 55/51 by counting tombstones as live — the reads exclude them,
  so those figures compared a population against a different one.
- `db:check` clean. `drizzle-kit` generated only the `ADD CONSTRAINT` and left the `DROP` commented
  out with a placeholder, exactly as §1.9 predicted — hand-filled with `project_sources_pkey`, read
  from the live database, following `0004`.
- `vitest run apps/api packages`: 116 files, 1,102 passed, 16 skipped. Postgres integration on a
  throwaway database: 8 passed, including the new case that seeds a second source row directly and
  proves the named read, the retention of a held source no revision names, and that detaching leaves
  nothing behind.
- `typecheck`, `lint`, `format:check`, `check:docs`, `check:script-references`,
  `check:retired-program` clean.

### 7.6 What this stage did not establish

- **No second source exists anywhere yet.** Every multi-source behaviour is proved by a test that
  seeds the row directly, because the writer is prompt 30's. The migration is proved on real data;
  the collection semantics are not.
- **The accept-vs-remove lock cycle is still unmeasured** (§4). `removeSource` now takes a keyed
  `FOR UPDATE` instead of an unkeyed one, which narrows what it locks, but nothing exercises
  concurrent accept and remove and this stage did not add that test.
- **`getSource` reads the revision snapshot on a per-range-request path.** It gained a join to
  `project_revisions` to evaluate the primary predicate, and `/source/content` calls it once per
  range request. The snapshot is small today (no composition is ever written), so no row TOASTs; it
  is worth revisiting when 4.1 makes compositions large, either by routing `content()` through
  `getCurrentWithSource` — which pays nothing for the same predicate — or by resolving content
  through the per-source endpoint prompt 30 adds.
- **`ensureAssetMembershipBackfill` still derives from one source, and deliberately does not ask
  which.** A first pass narrowed it to the primary; that is the wrong rule for the site — membership
  says a Project is associated with a Saved Video, which primacy has nothing to do with, and
  `acceptSource` writes one for every accepted source. §5 Q4 stands: covering every source is a
  change to `deriveProjectAssetMemberships` under a new migration id, since this one's receipt is
  permanent.

## 8. Verify and switch (prompt 30), 2026-09-13

### 8.1 The gate

`db:verify-sources`, extended to the owners and byte facts §3.9 asked for, over the development
database:

```json
{
  "projects": 3,
  "projectsHoldingSources": 2,
  "sourcesHeldByTombstonedProjects": 49,
  "storedSources": 51,
  "foreignOwnerSources": 0,
  "sourcesWithNoAsset": 0,
  "sourcesWhoseByteFactsDrifted": 0,
  "collectionsLargerThanOne": 0,
  "divergences": 0
}
```

Byte facts are the half that could actually have drifted: `project_sources` copies the asset's mime
type, size and checksum at acceptance so a later read need not reopen it, and nothing had re-checked
those copies since. A collection read hands them to a client per source, so a stale copy would stop
being a curiosity. Same-owner is a composite foreign key, so that count says out loud what the schema
already guarantees. The script now exits non-zero on any of the four.

### 8.2 What switched

**File mode is where the read authority actually moved.** The stored aggregate's single `source` is
gone, replaced by `sources`, at library schema **v8**; `parseLibrary` lifts a v7 document on read and
`.strict()` makes the old field's removal part of the lift rather than a leftover. The single-source
reads now resolve the same way the relational store does — the row the current revision's pointer
names — so `getCurrentWithSource` and `getSource` are derived views over the collection in both
stores rather than two different rules. The file store also gained the library-level
source-operation-key uniqueness it never had, the analogue of
`project_sources_owner_operation_unique`; one source per Project had made a linear scan equivalent to
it.

**One invariant, in both stores and on the wire:** a Project that holds material names one piece of
it as the original. Material behind a pointer that names none of it would be unreachable and
unremovable. The converse is allowed and happens — a duplicated Project carries the snapshot pointer
without the rows, and its reads 404 until it is given material of its own. A first pass forbade that
too and the duplicate-parity test caught it.

**New domain rules rather than flags.** `addProjectSource` appends a revision carrying nothing but
the new timestamp: taking on material is an inventory act, and what the Project is showing, what it
last produced and which phase it is in do not move. `removeProjectSourceById` has three cases and
only the middle one is new — the last source defers to `removeProjectSource`, the original with
others held is refused, and anything else prunes the clips that named it. Two conflict kinds carry
those refusals (`source-limit`, `primary-source`) rather than repurposing `immutable-source`, which
still means exactly what it meant.

**Five endpoints beside the legacy five**, which keep their exact contract:
`GET|POST /api/projects/:projectId/sources`, `POST /sources/reuse`,
`POST /sources/:sourceAssetId/remove`, `GET /sources/:sourceAssetId/content`. A source is addressed
by the media it holds, which is its key, already public through the snapshot's `sourceAssetId`, and
the shape working media already uses for per-item content.

**The replay lookup widened** from the source the snapshot names to every source the Project holds.
Left alone, a retried second acceptance would have been told `immutable-source` instead of the 200
its first attempt already earned.

`PROJECT_SOURCE_LIMIT` is 100, matching `COMPOSITION_CLIP_LIMIT` because a clip can only name media
the Project holds. The domain refuses on the count its caller read and the repository refuses on the
count under the lock that writes the row — the cheap-first-refusal pattern `removeProjectSource`
already uses for unresolved provider work, not two owners of one rule.

### 8.3 Evidence

- `vitest run apps/api packages`: 1,103 passed, 16 skipped. Postgres integration on a throwaway
  database: 7 passed, including a case that adds a second source through the writer, lists both,
  detaches and checks what each still retains.
- The service test walks the whole shape in file mode: add, replay, list, legacy `GET /source`
  unchanged, legacy `POST /source` still refusing, per-source content, the primary refusal, removal
  of a held source, convergence on one already gone, and the last source detaching wholesale.
- The route test does the same over HTTP in one Project, and asserts the list leaks neither
  `checksum` nor `operationKey`.
- `typecheck`, `lint`, `format:check`, `check:docs`, `check:script-references`,
  `check:retired-program` clean.

### 8.4 What this stage did not establish

- **No surface adds a second source.** Every multi-source path is proved by tests; `apps/web` is
  untouched, by design — slice 3.4 owns the Media area, the capture bridge and
  `AddVideoToProjectDialog`'s browser-side refusal, which will otherwise keep refusing what the API
  now allows.
- **The original cannot be changed.** Removing it while other material is held is refused rather
  than promoting a sibling, because choosing which one becomes the original is a question for a
  surface that can ask. Until 3.4 exists, a Project that holds several can only shed them from the
  bottom.
- **The file-mode rollback boundary is now closed.** v8 is written on the first write after this
  deploys, and a v7 build cannot read it (§3.8). Relational rollback stays open until something
  writes a second source.
- **Composition pruning is written but unreachable.** `removeProjectSourceById` prunes the clips that
  named the departing media, and no code path can produce a clip yet (§1.6), so that branch has unit
  coverage only.

### 8.5 What the review changed

Four reviews over the diff; five of their findings were defects rather than preferences.

**File mode was not retaining an additional source's bytes.** The expand stage removed the file-mode
retention arm as unreachable (§7.2) and said the matching arm "arrives with the stored collection in
slice 3.2's switch stage". This is that stage, the collection arrived, and the arm did not — leaving
a comment that claimed otherwise. Reachable without any UI: borrow a Library Version as extra
material through `POST /sources/reuse`, delete that Video, and its bytes go, because nothing links a
held source to a revision. Restored, with the assertion that would have caught it — the held source
is retained while nothing links it.

**`mode` was a flag carrying what the data already said.** It threaded routes → service → both
repositories, and hid two defects. Borrowing the same Version twice under different keys reached the
primary key as a `23505` and surfaced as a 500; and `POST /sources` could never take a Project's
first source, because the flag said "additional" before anything looked. Both dissolve once the
repositories read the revision — a revision that points the Project's original at what is being
accepted is taking a first source — and the service picks its rule from what the Project holds. What
is genuinely endpoint-specific, the legacy contract's refusal of an occupied Project, stayed at the
legacy entry point as `refuseWhenOccupied`. The duplicate now has its own refusal,
`source-already-held`, instead of a unique violation.

**The byte path was reading the whole collection.** `contentById` called `listSources` — every held
source plus the revision snapshot — on an endpoint a player hits once per seek. At the two limits
that is megabytes per range request. It is a point lookup now, `getSourceById`, and the byte open
runs beside it rather than after it, since the asset id is the route's own parameter.

**Two endpoints disagreed about the same removal.** `POST /sources/:id/remove` refused to let go of
the original while other material was held; `POST /source/remove` did it silently and took the rest
with it — contradicting the clause this slice wrote into feature-behavior 17. The legacy removal now
goes through the same rule, so the refusal is the Project's and not the endpoint's.

**A test asserted nothing.** `expect(collection.sources).not.toContain('checksum')` compares array
elements to a string and can never fail; it reads as proof that the collection response does not leak
the stored checksum and was proving nothing. It asserts on the body, as its neighbour does.

Also applied: the saved-video lineage rule moved onto the source object so the collection item
inherits it rather than restating it; the v7 lift moved off `storedAggregateSchema` so `.strict()`
still refuses a stray `source` on a write; `assertReadyAssets` kept its link parameter and took the
extra asset explicitly; CAS moved above the semantic guards in `removeProjectSourceById` so one stale
request gets one answer; the service's primary cross-checks went, now that both stores resolve the
primary by that equality; and the file-mode replay scan stopped allocating a wrapper per held source.

Recorded and not done: `listSources` repeats the project and revision rows once per source, which
only the list genuinely needs; `GET /sources` parses its response twice, as the legacy pair already
does; and adding a source re-links every clip in the arrangement, because a revision carries the
whole snapshot. All three are bounded by the same limits and none is a defect.
