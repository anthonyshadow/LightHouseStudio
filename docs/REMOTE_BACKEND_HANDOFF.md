# Deferred remote-backend handoff

**Status:** Design boundary only; all approvals pending

**Current product:** Single operator, loopback-only, browser/local persistence

**Effect:** No authorization to add accounts, public ingress, cloud storage, billing, sharing, or
remote deployment

## Why this document exists

Remote operation is outside the current MVP. This note prevents a future remote phase from
mistaking local implementation details for identity, ownership, authorization, or durable
distributed coordination.

The current application remains defined by [Architecture](ARCHITECTURE.md) and
[Privacy and temporary data](PRIVACY_AND_TEMPORARY_DATA.md):

- the API binds to `127.0.0.1`, does not trust proxies, and accepts loopback hosts only;
- exact Host/Origin checks protect a local credential broker, not a public service;
- there is one configured seeded local account, but no signup/recovery, tenants, remote product
  database, remote jobs, billing ledger, or cloud media;
- browser stores and `LIGHTFRAME_DATA_DIR` are the current persistence mechanisms; and
- the stable seeded user UUID is local Phase 1 identity; legacy Host hashes are migration
  namespaces only and neither becomes remote tenancy proof.

Implementation must stop until the approval gate below is complete and a separate remote-MVP plan
is authorized.

## Boundaries a future design must preserve

1. Authenticated subject plus organization membership establishes identity and tenancy. Device
   IDs, paths, storage keys, provider IDs, tokens, and local Host hashes never do.
2. Every remote resource has an opaque app-owned ID and authoritative tenant ownership in
   transactional metadata. Object keys and provider identifiers are not authorization evidence.
3. Domain and contract packages remain independent of React, persistence engines, identity
   vendors, and raw provider payloads.
4. Browser storage, transactional metadata, object storage, and provider operations keep separate
   repositories and consistency rules.
5. Explicit provider intent, immutable originals, pinned/selected providers, safe errors, and no
   automatic provider fallback remain product rules.
6. An initial billable submission is never automatically repeated. Ambiguous outcomes enter
   durable reconciliation before any separately authorized new submission.
7. Uploads and provider outputs commit only after server-derived media validation. Client MIME,
   duration, dimensions, ownership, and entitlement claims are untrusted.
8. Delete/account-erasure follows authoritative relationships and verifiable jobs; it is not an
   orphan scan.
9. Logs, metrics, traces, audits, and support views are content-free by default.
10. Local import is explicit, reversible, and non-destructive. No local data is silently moved,
    relabeled, or assigned to an account.

## Current-to-remote seam map

| Current local detail                                    | Required future boundary                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Host-derived owner hash                                 | Discard; use authenticated subject and tenant membership                           |
| Recipe Shelf `localStorage`                             | Sanitize on explicit import; assign new remote IDs                                 |
| Builder/legacy IndexedDB                                | Optional, explicit import only; do not revive retired workflows                    |
| In-memory current take/sidecar/output                   | Upload only after an authenticated, explicit action                                |
| `LIGHTFRAME_DATA_DIR` references                        | Private object plus tenant-owned metadata; never expose/import local paths or keys |
| Filesystem request mapping and process-local coalescing | Durable scoped idempotency, operation state, leases, and reconciliation            |
| Provider correlation metadata                           | Restricted allowlist only; never identity or browser-visible ownership             |
| `.env` credentials                                      | Independently provisioned managed deployment secrets                               |
| Capture device IDs/preferences                          | Device-local only; never remote identity or product data                           |

No current schema addition is justified solely by this future design.

## Required remote design package

Before implementation, reviewers must approve one coherent package covering:

- identity provider, session rotation/revocation, MFA/reauthentication, account recovery, and CSRF;
- tenant roles and a deny-by-default authorization matrix for every resource and operation;
- private ingress, exact proxy trust, TLS, CSP/provider-origin inventory, rate/concurrency limits,
  abuse controls, and secret rotation/kill switches;
- transactional ownership metadata, private object storage, checksums, versioning, and recoverable
  database/object commit protocols;
- durable provider-operation state, scoped idempotency, spend reservation/settlement policy,
  cancellation, ambiguous-outcome reconciliation, and no blind resubmission;
- authenticated, quarantined, bounded media ingestion with server-derived media facts;
- approved retention, detach/delete/account-erasure semantics, provider cleanup, backup expiry,
  deletion receipts, and support-access policy;
- content-free observability, incident response, backup/restore, rollout, rollback, and named
  operational owners;
- versioned import/export with checksums, relationship closure, dry run, new IDs, and no provider
  contact; and
- auth, CSRF, authorization, tenant-isolation, ingestion, idempotency, deletion, redaction,
  restore, rollback, load, and security evidence in addition to the complete local regression suite.

## Decisions still open

| Decision                                                             | Required approval                            |
| -------------------------------------------------------------------- | -------------------------------------------- |
| Remote audience and rollout cohort                                   | Product, security/privacy, operations        |
| Identity provider, account recovery, session/MFA policy              | Security, architecture, product              |
| Personal versus shared organizations                                 | Product, architecture, privacy               |
| Hosting vendor, regions, residency, subprocessors                    | Privacy/data owner, operations, architecture |
| CSP/COEP and exact provider origins                                  | Security, architecture                       |
| Malware/content policy and moderation/support boundary               | Security/privacy, product, support           |
| Retention, deletion, backup, legal-hold, and provider-cleanup policy | Privacy/data owner, product, operations      |
| Rate, concurrency, spend, ambiguous-outcome, and billing policy      | Product, billing/finance, operations         |
| Export encryption/recovery and local migration scope                 | Security/privacy, product                    |
| Support break-glass and incident notification                        | Security/privacy, support/operations         |

No proposed value is current product policy until these owners approve it.

## Approval and handoff gate

All of the following remain pending:

- Product owner: remote scope and cohort
- Security owner: threat model, identity/session, authorization, CSP/CSRF
- Privacy/data owner: retention, deletion, import/export, support access
- Architecture owner: persistence, jobs, object/provider boundaries
- Operations owner: deployment, observability, backup/restore, incidents, rollback
- Billing authorizer/product owner: provider limits, spend, settlement

The remote phase may begin only when:

1. approvals and open decisions are recorded;
2. local product value and pre-remote acceptance gates are complete or explicitly accepted by
   their owners;
3. no Critical/High local boundary finding would be carried into public exposure;
4. the loopback broker has not been exposed as a shortcut;
5. a reviewable implementation/test/migration plan is approved; and
6. rollback, deletion, provider-cost, privacy, and incident obligations have named owners.

Until then, the correct state is the current loopback product with remote work deferred.
