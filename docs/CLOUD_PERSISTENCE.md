# Neon, Drizzle, and Cloudflare R2

**Status:** implemented, configuration-gated infrastructure; local remains the default  
**Reviewed:** 2026-08-07

This is the canonical setup, migration, rollback, and limitation guide for cloud persistence. It
does not authorize public exposure: Fastify still binds only to `127.0.0.1`, and the seeded demo
account is not production identity or tenancy.

## What is implemented

- Drizzle migrations for users/credentials, durable sessions, saved voices, saved videos and
  versions, private media assets, reference images, creative-library records, processing jobs,
  leases, resource references, idempotency receipts, and an outbox.
- Transactional Neon repositories behind the existing application ports. Password credentials are
  separate from public user rows. Saved-video version append and creative-library replacement use
  database transactions and optimistic concurrency.
- A private R2 `AssetByteStore` with opaque keys, streaming/multipart upload, app-owned SHA-256,
  byte-range reads, owner checks, database lifecycle states, multipart abort/cleanup, and deletion
  tombstones. R2 ETags are retained only as transport metadata, never as the integrity checksum.
- Restart recovery for provider jobs that already have a durable provider job ID. A restart never
  repeats an initial billable submission. Interrupted submissions without a durable provider ID
  become ambiguous; pre-submission work becomes failed and requires another explicit request.
- Global and per-provider admission limits in addition to the existing one-active-job-per-owner
  rule. Durable rows enforce one active job per owner across server instances. Limits are set by
  `VIDEO_JOB_MAX_ACTIVE` and `VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER`.
- A browser creative-library sync seam. The browser remains an immediate local cache; Neon uses a
  revision compare-and-swap. Conflicts pause sync and preserve the local copy instead of applying a
  last-writer-wins overwrite.
- An idempotent local backfill for saved videos/thumbnails, saved voices, and reference images.
  Creative metadata migrates through the authenticated sync API. Local copies are never deleted.

## Runtime modes

| `DATABASE_MODE` | Metadata authority                  | Sessions/jobs                                     | Bytes                                                                                      |
| --------------- | ----------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `local`         | Existing local files/browser stores | Process-local sessions/jobs plus safe file traces | Existing private local store                                                               |
| `shadow`        | Local files remain authoritative    | Neon safe job traces and restart records          | `local`, or new saved-video writes to both R2 and local with R2-first/local-fallback reads |
| `neon`          | Neon Drizzle repositories           | Durable Neon sessions and resumable accepted jobs | Registered local objects or private R2, selected at startup                                |

`ASSET_STORE_PROVIDER=r2` requires `DATABASE_MODE=shadow` or `neon`. Reference-image and creative
metadata stay local in `shadow`; their database adapters become authoritative only in `neon`.
The R2 adapter streams uploads and reads; it never buffers an entire large video solely to cross
the storage boundary. The Neon gallery path applies filtering, ordering, pagination, counts, and
facets in SQL rather than materializing the owner library in application memory.

## Initial setup

1. Create separate Neon branches/databases and private R2 buckets for development, staging, and
   production. Do not reuse credentials across environments or enable an R2 public/custom domain.
2. Give the R2 key permission only for the selected bucket and object operations used by the app.
3. Set the server-only variables documented in [`.env.example`](../.env.example). Never use a
   `VITE_*` variable for database or R2 credentials.
4. Generate/check migrations after schema edits, then apply them to the selected Neon database:

   ```bash
   pnpm --dir apps/api db:check
   pnpm --dir apps/api db:migrate
   ```

5. Inventory existing local data without writing to Neon or R2:

   ```bash
   pnpm --dir apps/api db:backfill-local
   ```

6. After reviewing the JSON counts/bytes/missing-assets result, run the explicit idempotent apply:

   ```bash
   pnpm --dir apps/api db:backfill-local -- --apply
   ```

   Apply stops on missing bytes, checksum conflicts, inconsistent version lineage, or transaction
   conflicts. It prints a second verification record after writes complete.

7. Run in `shadow`, exercise save/range/playback/reference/voice flows, and reconcile counts and
   checksums. Switch to `neon` only after that evidence is clean.

## Rollback and deletion

- Switching `DATABASE_MODE` or `ASSET_STORE_PROVIDER` requires restart; there is no runtime
  fallback or provider selection.
- Backfill and shadow mode retain local bytes. Rollback means restoring local configuration while
  the approved window remains open; it never means deleting Neon/R2 first.
- Logical Saved Video delete still retains bytes. Permanent garbage collection is intentionally
  absent until retention, dependency, legal-hold, backup-expiry, and account-deletion policy is
  approved. R2 delete support exists for failed/uncommitted saga cleanup, not blanket GC.
- Database migrations must be applied through reviewed forward migrations. Restore/PITR and R2
  inventory drills require real staging resources and are not claimed by automated local tests.

## Operational checks before any non-loopback deployment

The code does not provide signup/recovery, multi-tenant authorization, remote CSRF topology,
distributed rate limiting, malware scanning, moderation, quotas/billing, regional-retention
policy, backup objectives, or public incident controls. Those remain separate launch gates in the
[infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md).
