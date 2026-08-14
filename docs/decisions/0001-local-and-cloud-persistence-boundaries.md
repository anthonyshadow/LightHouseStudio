# 0001: Local and cloud persistence boundaries

- Status: Accepted
- Date: 2026-08-08

## Context

Lightframe Studio is a local-first, loopback-oriented application. It needs
durable media and owner-scoped metadata without turning browser state, storage
locations, or optional cloud adapters into identity or public-service
authorization. Media bytes and relational metadata also have different access,
streaming, transaction, and cleanup requirements.

The implemented persistence factory supports local operation plus
configuration-gated Drizzle/PostgreSQL/Neon and private Cloudflare R2 adapters.
Those adapters are current infrastructure, but public deployment and shared
tenancy are not.

## Decision

- Appropriate user-scoped drafts, journals, cached creative metadata, and
  preferences remain in validated, versioned browser storage. Browser storage is
  untrusted and is not an ownership authority.
- Project identity, revisions, source acceptance, and source media never use the
  dormant browser Project/upload/outbox stores. They remain server-authoritative;
  the browser holds only cancellable controller/cache state and asks the existing
  recording-artifact owner to create a fresh playback URL from authenticated
  content after each hydration.
- In default local mode, the API owns durable media/reference bytes and related
  records under the configured private local data directory.
- Drizzle with PostgreSQL/Neon may own relational metadata, durable sessions,
  creative-library revisions, and accepted-job recovery when the configured
  persistence mode enables it.
- Private Cloudflare R2 may own media bytes through the server-side
  `AssetByteStore` boundary. Buckets, object keys, credentials, and normal content
  delivery remain private and mediated by authenticated application routes. The
  authoritative direct-upload path is a narrow exception: after authenticated
  owner/stage checks, the browser receives only a short-lived exact multipart-part
  presigned URL, while completion and attachment return to server authority.
- Metadata and media bytes remain explicit, separately mapped representations.
  Database transactions do not pretend to include object storage; lifecycle
  states, relationship checks, idempotency, and retryable cleanup coordinate the
  two systems.
- Authenticated ownership derives from stable verified server identity. Provider
  IDs, Host hashes, device IDs, storage paths, object keys, and browser-supplied
  user IDs are never identity.

## Consequences

Local mode remains usable without cloud credentials. Cloud-backed modes can add
durability without changing feature-level ownership or exposing storage
credentials, but they add migration, reconciliation, backup, restore, and
partial-failure responsibilities.

Schema changes use reviewed forward migrations. Local-to-cloud backfill is
idempotent and non-destructive, shadow mode provides comparison evidence, and
local copies remain available for the approved rollback window. Rollback changes
configuration only after data and relationship review; it does not begin by
deleting Neon or R2 data. Destructive migration, blanket garbage collection,
public tenancy, and production operations require separate decisions.

## Alternatives considered

- Browser-only durable media was rejected because large bytes, authenticated
  access, and lifecycle cleanup require a server-owned boundary.
- Treating the database as storage for media bytes was rejected because media
  streaming and object lifecycle differ from relational transactions.
- Deriving ownership from paths, provider identifiers, devices, or Host values
  was rejected because those values are forgeable, mutable, or deployment-local.
