# PostgreSQL, Neon, Drizzle, and Cloudflare R2

**Status:** implemented, configuration-gated infrastructure; local remains the default  
**Reviewed:** 2026-08-11

This is the canonical setup, migration, rollback, and limitation guide for cloud persistence. It
does not authorize public exposure: Elysia on Bun still binds only to `127.0.0.1`, and the seeded demo
account is not production identity or tenancy.

## What is implemented

- Drizzle migrations for users/credentials, durable sessions, Projects/revisions/relationships,
  saved voices, saved videos and versions, private media assets, reference images,
  creative-library records, processing jobs, leases, resource references, idempotency receipts,
  and an outbox.
- Transactional PostgreSQL repositories behind the existing application ports. Development uses
  Docker-hosted PostgreSQL through `node-postgres`; production uses Neon through the same Drizzle
  boundary. Password credentials are separate from public user rows. Saved-video version append
  and creative-library replacement use database transactions and optimistic concurrency.
- An authoritative `postgres`/`neon` Project repository with a Project-version CAS, monotonic
  immutable revision history, validated snapshot V1, same-owner composite foreign keys, and
  normalized revision-scoped asset/used-Version links plus one initiating revision per job and one
  producing revision per output Version. Exact replay is idempotent; changed replay conflicts.
  Snapshot Versions require an active same-owner Saved Video and exact Version at link time, output
  pointers require an existing exact Project output, and normal current/history reads are bounded.
  Existing videos/jobs are not backfilled, and no Project route or UI writes these tables yet.
  `shadow` does not make Projects authoritative.
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
  removed. A completed idempotency receipt wins over expiry cleanup after a restart.
- Restart recovery for provider jobs that already have a durable provider job ID. A restart never
  repeats an initial billable submission. Interrupted submissions without a durable provider ID
  become ambiguous; pre-submission work becomes failed and requires another explicit request.
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
  are rechecked, and only unshared R2 objects are deleted. `deleting` lifecycle rows remain
  claimable so an interrupted R2 request can be retried without restoring the gallery record.
- One owner-scoped Project retention query protects direct assets and exact Version/output assets
  across Saved Video, reference-image, and generic lifecycle deletion. Archive and tombstone retain
  these relations; no Project physical-purge policy is implemented.
- An idempotent local backfill for saved videos/thumbnails, saved voices, and reference images.
  Saved-video metadata is normalized first to canonical UTC ISO timestamps and integer
  milliseconds, including legacy local records. Creative metadata migrates through the
  authenticated sync API. Local copies are never deleted.

## Runtime modes

| `DATABASE_MODE` | Metadata authority                    | Sessions/jobs                                      | Bytes                                                                                      |
| --------------- | ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `local`         | Existing local files/browser stores   | Process-local sessions/jobs plus safe file traces  | Existing private local store                                                               |
| `shadow`        | Local files remain authoritative      | Neon safe job traces and restart records           | `local`, or new saved-video writes to both R2 and local with R2-first/local-fallback reads |
| `postgres`      | Local PostgreSQL Drizzle repositories | Durable local sessions and resumable accepted jobs | Registered local objects or the isolated development R2 bucket                             |
| `neon`          | Neon Drizzle repositories             | Durable Neon sessions and resumable accepted jobs  | Registered local objects or private R2, selected at startup                                |

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
  support owner-scoped asset-retention batches without rewriting application data.

## Operational checks before any non-loopback deployment

The code does not provide signup/recovery, multi-tenant authorization, remote CSRF topology,
distributed rate limiting, malware scanning, moderation, quotas/billing, regional-retention
policy, backup objectives, or public incident controls. Those remain separate launch gates in the
[infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md).
