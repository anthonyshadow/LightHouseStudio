# PostgreSQL, Neon, Drizzle, and Cloudflare R2

**Status:** implemented, configuration-gated infrastructure; local remains the default  
**Reviewed:** 2026-08-15

This is the canonical setup, migration, rollback, and limitation guide for cloud persistence. It
does not authorize public exposure: Elysia on Bun still binds only to `127.0.0.1`, and the seeded demo
account is not production identity or tenancy.

The [MVP acceptance runbook](MVP_ACCEPTANCE.md) owns exact-candidate migration evidence. A migration
or repository test being present is not a passing release result until its isolated PostgreSQL run is
recorded there.

## What is implemented

- Drizzle migrations for users/credentials, durable sessions, Campaigns, Projects/revisions/
  relationships, nullable same-owner Campaign membership, non-owning Project asset memberships,
  and owner-scoped operation receipts, saved voices, saved videos and versions, private media assets, reference images,
  creative-library records, processing jobs, leases, resource references, idempotency receipts,
  and an outbox.
- Transactional PostgreSQL repositories behind the existing application ports. Development uses
  Docker-hosted PostgreSQL through `node-postgres`; production uses Neon through the same Drizzle
  boundary. Password credentials are separate from public user rows. Saved-video version append
  and creative-library replacement use database transactions and optimistic concurrency.
  `@neondatabase/serverless` remains an intentional production-integration dependency even though
  the current repository connection is the shared Drizzle/`node-postgres` adapter.
- An authoritative `postgres`/`neon` Project repository with a Project-version CAS, monotonic
  immutable revision history, validated snapshot V2 with an explicit V1 read migration, same-owner composite foreign keys, and
  normalized revision-scoped asset/used-Version links plus one initiating revision per job and one
  producing revision per output Version. Exact replay is idempotent; changed replay conflicts.
  Snapshot Versions require an active same-owner Saved Video and exact Version at link time, output
  pointers require an existing exact Project output, and normal current/history reads are bounded.
  Authenticated Campaign/Project lifecycle routes write these tables in authoritative modes.
  Existing videos/jobs are not backfilled.
- Project source acceptance uses additive migration `0016`: one immutable source row is tied by
  restrictive same-owner keys to its Project, accepting revision, ready media asset, and optional
  exact active Saved Video Version. The same transaction appends source/working/presented lineage
  and advances the current pointer. Upload/record bytes use the configured `AssetByteStore`; exact
  Version reuse keeps the existing object and adds no duplicate byte object or output save target.
  Owner-checked metadata plus range/HEAD content remain application routes, never direct storage
  identity.
- Project semantic checkpoints use the existing revision transaction in every authority mode.
  The browser sends one bounded proposal containing workflow phase, live metadata, exact applied
  creative resource IDs/labels/revisions/settings, one visual treatment, optional Voice, intent,
  validated local edit, and both CAS tokens. Server authority preserves immutable source/current
  media references and supplies timestamps. Exact semantic replay converges without another
  revision, while a different stale write conflicts. No Project IndexedDB store is activated.
- Project working-media adoption uses additive migration `0018`, which admits snapshot v2 and adds
  one owner-scoped operation receipt/adoption row tied to the exact Project revision and retained
  media asset or Saved Video Version. Local renders are durably stored, checksummed, inspected, and
  attached in the revision transaction. Exact retained media is reused without copying bytes.
  Exact replay returns the original revision; changed media/edit/base tokens conflict. The source
  row and source asset remain unchanged, and no output or Add Version relation is created.
- Project output save uses additive migration `0020` and one owner-scoped command. The application
  verifies the exact already-durable current bytes before metadata commit. One PostgreSQL
  transaction then creates or CAS-appends the immutable Video Version, records its pre-save
  producing revision, appends the completed `output-save` revision and hydration record, advances
  Project/Saved Video pointers, and stores the original replay result. It creates no new byte
  object, and exact replay returns that stored result after response loss; changed replay conflicts.
- Project asset membership uses additive migration `0021`: a same-owner Project relation accepts
  only Video, Character, Outfit, or Voice IDs and has a unique owner/Project/kind/resource key.
  Membership is organizational and has no byte-retention authority. Owner-scoped application
  migration `project-asset-memberships-v1` deterministically derives distinct supported relations
  from historical sources, working media, outputs, and resolvable snapshot IDs on first access.
  It never creates Recipe membership or fabricates a resource ID from a label.
- A schema-version-7 local Campaign/Project repository is authoritative in `local` and `shadow`.
  It uses one owner namespace/shared lock, atomic primary/backup replacement, strict
  v1/v2/v3/v4/v5/v6→v7 startup migration, durable operation receipts, and prepared source-acceptance,
  working-media, Project-job, result-retention, and composite Project-output envelopes that
  reconcile metadata after interruption. The output envelope carries complete next Project and
  Saved Video libraries and commits them in a recoverable order. `shadow` does not make Drizzle
  Campaign/Project tables authoritative or claim their replication.
- A private R2 `AssetByteStore` with opaque keys, streaming/multipart upload, app-owned SHA-256,
  byte-range reads, owner checks, database lifecycle states, multipart abort/cleanup, and deletion
  tombstones. R2 ETags are retained only as transport metadata, never as the integrity checksum.
- Authoritative Neon/R2 Saved Video uploads use an owner-scoped staged row and headless Uppy. The
  browser receives only the staged UUID and five-minute exact-part presigned URLs; bucket, key, and
  provider multipart scope appear only inside those bearer URLs, while credentials stay
  server-side. Completion verifies R2 HEAD metadata,
  downloads through a protected bounded temporary file, computes SHA-256, runs MediaBunny
  inspection, registers the asset, and transactionally attaches it before the row becomes ready.
  Stages expire after one hour; abandoned parts and untrusted completed objects are aborted or
  removed. A completed idempotency receipt wins over expiry cleanup after a restart. Expiry cleanup
  transactionally claims a bounded oldest-retry page with `FOR UPDATE SKIP LOCKED` and advances the
  claim timestamp before object cleanup, so one persistent failure cannot starve later stages.
- Saved Video gallery pages select only the parent/current Version projection and one grouped
  Version count for the bounded page; they do not load every historical Version to form summaries.
  An explicit detail read returns that one video's bounded immutable Version metadata for exact
  selection. The gallery derives its **No Project** chip from the absence of any Project output
  relation; no row, backfill, or synthetic producer is created.
- Project history reuses existing owner-constrained revision, processing-attempt, and output-link
  indexes. Each category has an independent opaque cursor and metadata-only page. Exact output
  metadata/content requires the same-owner Project/Version relation and may use retained tombstone
  lineage without making the Saved Video globally visible. The history/delivery surface added no
  schema migration, backfill, byte copy, or production migration action.
- Additive migration `0017` adds only `processing_jobs(status, expires_at)` and
  `reference_images(updated_at)` indexes for expiry/activity scans. It rewrites no application
  records and is not applied automatically to production.
- Additive migration `0018` changes the Project snapshot-version check from V1-only to V1/V2 and
  creates the working-media adoption authority. It does not rewrite existing Project snapshots or
  copy media bytes and is not applied automatically to production.
- Additive migration `0019` adds processing-job result-asset/retry identity and Project-job
  result-revision fields, restrictive result relations, and recovery/history indexes. It does not
  assign legacy jobs to Projects, rewrite existing content, or apply automatically to production.
- Additive migration `0020` adds the `output-save` Project revision enum value and
  `project_output_operation_receipts`. It does not backfill output ownership, rewrite existing
  content, copy bytes, or apply automatically to production.
- Additive migration `0021` adds `project_asset_memberships`, its four-value kind enum,
  same-owner Project foreign key, idempotency constraint, and bounded newest-first list index. It
  does not rewrite Project source/output/history, copy bytes, delete compatibility records, or
  apply automatically to production.
- The isolated PostgreSQL compatibility fixture starts from valid pre-`0010` Project rows, includes
  an independent legacy Saved Video, Saved Voice, and creative prompt, applies the remaining chain
  through `0021`, and verifies that the legacy resources remain readable and unassigned without
  fabricated Project/source/output lineage. Local Project fixtures exercise v1/v4/v5/v6→v7 reopen and
  prepared-journal recovery; Saved Video fixtures exercise legacy v1/v3→v4 unassigned reopen. These
  are test capabilities, not a claim that the exact candidate or production data was migrated; the
  recorded isolated-database result belongs in [MVP acceptance](MVP_ACCEPTANCE.md).
- Project processing admission commits the exact Project/revision link and app-owned operation
  before provider submission in every persistence mode. Restart recovery reconnects status or
  retrieval only for jobs with a durable provider identity and never repeats an initial billable
  submission. Interrupted `submitting` operations without that identity become ambiguous;
  pre-submission work becomes failed and requires another explicit request. Current successful
  results are retained as Media Assets and `job-result` revisions; obsolete paid successes remain
  owner-bound historical `job-output` assets. Neither path creates a Saved Video/Version.
- Global and per-provider admission limits in addition to the existing one-active-job-per-owner
  rule. Durable rows enforce one active job per owner across server instances. Limits are set by
  `VIDEO_JOB_MAX_ACTIVE` and `VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER`.
- A browser creative-library sync seam. The browser remains an immediate local cache; Neon uses a
  revision compare-and-swap. Conflicts pause sync and preserve the local copy instead of applying a
  last-writer-wins overwrite.
- Relationship-safe reference-image retention in authoritative `neon`: uploads and generated
  results may be staged in the selected byte store, canonical creative-library rows define the
  saved set, trusted-origin discard and removed saved relationships delete only after an
  owner-scoped recheck, and unreferenced rows inactive for 24 hours are purged opportunistically
  during later library reads/writes.
- Relationship-safe manual Saved Video deletion whenever private R2 is selected: the record is
  tombstoned first, all immutable versions and thumbnails are collected, active owner relationships
  are rechecked, and only unshared R2 objects are deleted. Project-retained Versions remain hidden
  from the global library but stream through an exact same-owner Project output route. `deleting`
  lifecycle rows remain claimable so an interrupted R2 request can be retried without restoring the
  gallery record.
- One owner-scoped Project retention query protects direct assets and exact Version/output assets
  across Saved Video, reference-image, and generic lifecycle deletion. Archive and tombstone retain
  these relations; no Project physical-purge policy is implemented.
- An idempotent local backfill for saved videos/thumbnails, saved voices, and reference images.
  Saved-video metadata is normalized first to canonical UTC ISO timestamps and integer
  milliseconds, including legacy local records. Creative metadata migrates through the
  authenticated sync API. Local copies are never deleted.

## Runtime modes

| `DATABASE_MODE` | Metadata authority                                             | Sessions/jobs                                                                                 | Bytes                                                                                      |
| --------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `local`         | Local files, including Campaign/Project authority              | Process-local sessions plus durable Project-job admission/recovery and safe standalone traces | Existing private local store                                                               |
| `shadow`        | Local files remain authoritative, including Campaigns/Projects | Local-authority Project jobs; Neon trace writes are best-effort side effects                  | `local`, or new saved-video writes to both R2 and local with R2-first/local-fallback reads |
| `postgres`      | Local PostgreSQL Drizzle repositories                          | Durable local sessions and resumable accepted jobs                                            | Registered local objects or the isolated development R2 bucket                             |
| `neon`          | Neon Drizzle repositories                                      | Durable Neon sessions and resumable accepted jobs                                             | Registered local objects or private R2, selected at startup                                |

`ASSET_STORE_PROVIDER=r2` requires `DATABASE_MODE=shadow`, `postgres`, or `neon`. Reference-image
and creative metadata stay local in `shadow`; their database adapters become authoritative in
`postgres` and `neon`. Direct browser upload is therefore advertised for authoritative `postgres`
or `neon` with `ASSET_STORE_PROVIDER=r2`. `local` preserves the existing filesystem upload;
`shadow` preserves the existing API-mediated upload because its rollback contract requires the API
to create both R2 and local copies. The R2 adapter streams uploads and reads; it never buffers an
entire large video solely to cross the storage boundary. Once an asset has been registered, its storage provider, R2 account, bucket,
and key-prefix namespace are immutable configuration. Changing any of them requires a separately
reviewed byte migration plus database and bucket inventory verification; changing environment
values alone is not a migration. The Neon gallery path applies filtering, ordering, pagination,
counts, and facets in SQL rather than materializing the owner library in application memory.
`DATABASE_MODE=neon` also requires `DATABASE_URL` to state encrypted transport explicitly with
`sslmode=require`, `sslmode=verify-ca`, or `sslmode=verify-full`; application startup and migration
configuration fail closed before opening a pool otherwise.

## Initial setup

1. Run `bun run env:prepare`; preserve `.env.production` as the existing Neon/R2 profile and fill
   `.env.development` with only the bucket-scoped development R2 credentials.
2. Start Docker-hosted PostgreSQL with `bun run db:development:up`. It binds only to
   `127.0.0.1:5433` and persists in a named volume. Resetting that volume is a separate explicit
   destructive command.
3. Create the private `lightframe-studio-development` bucket with no public domain, and give its S3
   key Object Read & Write permission only for that bucket. Never reuse production keys.
4. Set the server-only variables documented in the environment-specific examples. Never use a
   `VITE_*` variable for database or R2 credentials.
5. Configure the private bucket CORS policy for only the exact browser origins in use. The normal
   checked development and built loopback origins are shown below; remove either when it is not
   used, and replace them with the exact origin of any separately approved deployment. Do not use
   `*` for origins or headers.

   The checked Wrangler policy is
   [`apps/api/config/r2-cors.development.json`](../apps/api/config/r2-cors.development.json). Apply
   it with an authenticated Cloudflare identity that can edit the development bucket, then verify
   the stored policy:

   ```bash
   bun run r2:cors:development:set
   bun run r2:cors:development:check
   ```

   The equivalent dashboard JSON is:

   ```json
   [
     {
       "AllowedOrigins": ["http://127.0.0.1:4173", "http://127.0.0.1:4100"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Multipart create, list, sign, abort, and complete calls remain same-origin API operations. Only
   part `PUT` requests cross directly to R2. Treat each presigned URL as a short-lived bearer
   capability: never persist, log, trace, or send it elsewhere.

6. Generate/check migrations after schema edits, then apply them to local development PostgreSQL:

   ```bash
   bun run --filter @studio/api db:check
   bun run db:migrate:development
   bun run db:smoke:development
   ```

7. Production migrations remain a manual release action. Only after reviewing the target and
   migration history run `bun run db:migrate:production`; CI never runs this command.

8. Inventory existing local data without writing to Neon or R2:

   ```bash
   bun run --filter @studio/api db:backfill-local
   ```

9. After reviewing the JSON counts/bytes/missing-assets result, run the explicit idempotent apply:

   ```bash
   bun run --filter @studio/api db:backfill-local -- --apply
   ```

   Reading the inventory atomically upgrades legacy local saved-video metadata before any remote
   write. Apply stops on missing bytes, checksum conflicts, inconsistent version lineage, or
   transaction conflicts. It prints a second verification record after writes complete.

10. Run in `shadow`, exercise save/range/playback/reference/voice flows, and reconcile counts and
    checksums. Switch to `neon` only after that evidence is clean.

If the application later becomes geographically distributed, test R2 Local Uploads as a separate
bucket-setting experiment. It requires no application package and does not change the authorization,
verification, lifecycle, or cleanup contracts above.

## Rollback and deletion

- Switching `DATABASE_MODE` or `ASSET_STORE_PROVIDER` requires restart; there is no runtime
  fallback or provider selection. Do not switch the configured asset provider, R2 account, bucket,
  or key prefix after writes without first completing the reviewed data migration above.
- Backfill retains pre-existing local bytes. Shadow writes keep an R2 copy and rollback copy, but an
  explicit Saved Video deletion removes both copies through the shadow byte-store adapter. Rollback
  means restoring local configuration while the approved window remains open; it never means
  deleting Neon/R2 first.
- Explicit Saved Video deletion physically removes unshared version/thumbnail objects from R2 and
  remains retryable after a partial failure. The deletion claim returns the persisted provider and
  object key, and finalization is conditional on that same identity, so configuration drift cannot
  silently tombstone a recomputed object key. Local-only Saved Video deletion remains conservative.
  Automatic video orphan collection, legal-hold, backup-expiry, and account deletion remain absent.
  Reference images use the narrower saved-relationship and inactive-orphan policy above; R2 delete
  support is never blanket GC.
- Database migrations must be applied through reviewed forward migrations. Restore/PITR and R2
  inventory drills require real staging resources and are not claimed by automated local tests.
- Project migration `0009` is additive and does not assign, rewrite, or delete existing videos,
  jobs, or assets. Corrective migration `0010` is forward and data-preserving but not purely
  additive: it preflights strict snapshots/provable relations, replaces the Project asset primary
  key with a revision-granular key, makes job/output producer uniqueness global, renames their
  revision columns to initiating/producing, and reconstructs only snapshot-declared direct and
  used-Version references. Any irreconcilable row aborts with IDs and a safe repair hint before
  constraint changes. Rolling application code back across `0010` is not compatible with the new
  column/key contract; restore the pre-migration database or deploy compatible code. Never drop the
  retained tables or relations as an automatic rollback step. Follow-up migration `0011` changes
  indexes only: Project relation indexes follow revision cursors, and Saved Video Version indexes
  support owner-scoped asset-retention batches without rewriting application data. Additive
  migration `0012` creates the owner/operation-key Project create receipt, request fingerprint, and
  result Project ID. It does not rewrite Projects or content. Application code that predates
  Project lifecycle receipt reads leaves this extra table unused; dropping it would discard create
  replay history and is not an automatic rollback step.
- Additive migration `0014` creates Campaign lifecycle/receipt tables and nullable
  `projects.campaign_id`, with a restrictive composite owner foreign key and no legacy assignment.
  Additive migration `0015` adds only active/archived Campaign-membership Project list indexes.
  Older compatible code ignores the new tables/column, but dropping Campaign receipts loses
  replay history and dropping membership requires every Project to be detached first. Do not
  remove these objects as an automatic rollback. Additive migration `0016` owns immutable Project
  source rows; `0018` owns snapshot-v2 admission and working-media adoption receipts. Additive
  `0019` owns Project-processing retry/result identity and exact retained-result relations. Migration
  `0020` owns Project-output replay authority and the `output-save` enum value. Migration `0021`
  owns non-owning Project asset membership and its owner migration marker. Dropping any of these
  would discard replay/lineage or organizational authority and is not an automatic rollback. Local schema v7 is
  not readable by older parsers; downgrade requires restoring a verified pre-upgrade metadata
  backup or deploying compatible reader code, never ad hoc field stripping.

## Operational checks before any non-loopback deployment

The code does not provide signup/recovery, multi-tenant authorization, remote CSRF topology,
distributed rate limiting, malware scanning, moderation, quotas/billing, regional-retention
policy, backup objectives, or public incident controls. Those remain separate launch gates in the
[infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md).
