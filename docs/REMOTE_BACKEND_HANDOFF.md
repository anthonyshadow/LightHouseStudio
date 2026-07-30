# Remote backend design and handoff

Design date: 2026-07-29  
Status: approval-ready design; not approved for implementation  
Scope: Wave 11 / audit Phase 8 only

## 1. Authority and stop condition

This document is the remote-backend design package for `ARCH-003`, `SEC-001`, `SEC-002`,
`SEC-003`, `SEC-004`, `SEC-006`, and `PERF-003`. It defines the boundaries that a separately
authorized remote-MVP plan must preserve. It does not authorize accounts, remote access, public
origins, cloud persistence, billing, sharing, or deployment.

The current application remains a loopback-only, single-operator product:

- the API continues to bind only to loopback;
- `trustProxy` remains disabled;
- the exact loopback Host/Origin checks remain the current broker boundary;
- `localOwnerIdForRequest()` remains a local namespace only;
- browser stores and `LIGHTFRAME_DATA_DIR` remain the current persistence implementations; and
- no part of this design may be interpreted as a claim that authentication, authorization,
  tenant isolation, deletion, remote retention, or public operations exist.

Implementation must stop until all approvals in [Section 18](#18-approval-record-and-handoff-gate)
are recorded, Waves 0–10 meet the pre-remote handoff checklist, and a separate remote-MVP
implementation plan is authorized.

## 2. Frozen design principles

These are required properties, not options for the next phase:

1. An authenticated subject and organization membership establish identity and tenancy. A
   loopback Host hash, browser/device ID, filesystem path, storage key, provider ID, token, or
   import filename never does.
2. Every remotely addressable resource has an opaque application-owned ID and an authoritative
   organization owner in transactional metadata. Object keys and provider identifiers are not
   authorization evidence.
3. `packages/domain` and `packages/contracts` remain independent of React, persistence engines,
   authentication vendors, and raw provider payloads.
4. Browser storage, transactional metadata, object storage, and provider operations retain
   separate repositories because they have different ownership, consistency, and cleanup models.
5. Explicit provider intent, one startup-selected reference provider per execution, immutable
   originals, safe app-owned error codes, and no automatic fallback remain product rules.
6. A billable initial submission is never automatically repeated. Ambiguous outcomes reconcile
   from durable state and provider-supported lookup before a person can choose another submission.
7. Upload, generation, and processing commit only after server validation. Client-supplied MIME,
   duration, dimensions, ownership, or entitlement claims are never authoritative.
8. Delete and account-erasure operations traverse authoritative relationships. They never use an
   orphan scan as the primary correctness mechanism.
9. Logs, metrics, traces, audit events, and support views are content-free by default. Prompts,
   media, character names, voice IDs, provider URLs/bodies, credentials, and storage paths are not
   observability fields.
10. Remote rollout is explicit, reversible, and separate from local import/export. No local data is
    automatically moved, relabeled, deleted, or assigned to an account.

## 3. Current-to-remote migration seam inventory

The following inventory records present behavior and its future boundary. It does not change the
current implementation.

| Current detail                                                    | Current authority/lifetime                                              | Remote boundary                                                          | Import or migration rule                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact loopback Host hash from `localOwnerIdForRequest()`          | Local reference namespace                                               | Authenticated subject plus organization membership                       | Discard it. Never copy, compare, or transform it into a subject or organization ID.                                                         |
| Recipe Shelf v4 in `localStorage`                                 | Browser-local characters, recipes, recents, and reference relationships | Transactional character and recipe records                               | Parse with the current domain sanitizer, assign new remote IDs, and retain the local ID only as import provenance scoped to one import job. |
| Character Builder draft v1 in IndexedDB                           | One revisioned active local draft                                       | Optional remote draft record, if separately approved                     | Draft import is opt-in and off by default. Preserve source timestamps as provenance; use a new remote revision.                             |
| Legacy Guided projects in IndexedDB                               | Retained compatibility media/checkpoints                                | Optional take and sidecar import                                         | Only explicit selected-project import is allowed. Retired routes and workflow state are not revived.                                        |
| Temporary current take, audio sidecar, and processed output Blobs | Tab/session memory until Release/Discard/refresh                        | Take plus immutable media variants                                       | Upload only after an explicit authenticated action. Object URLs and runtime artifact IDs are discarded.                                     |
| `LIGHTFRAME_DATA_DIR` reference bytes and layout-v1 metadata      | Owner-only local immutable asset store                                  | Reference metadata plus immutable object                                 | Export bytes and allowlisted provenance through the loopback API. Never expose or import the local path or storage key.                     |
| Reference request UUID and filesystem idempotency mapping         | Retry identity for one local owner                                      | Durable operation-scoped idempotency record                              | Import does not reuse it as a remote request key. The import job owns a separate unique source mapping.                                     |
| Process-local reference operation Maps                            | Same-process coalescing only                                            | Durable provider-operation row, unique idempotency constraint, and lease | No state migration. New remote operations start from durable records.                                                                       |
| Provider request IDs and payload fragments in internal metadata   | Local support/reconciliation detail                                     | Encrypted/restricted operation metadata                                  | Import only allowlisted provider/model/provenance fields. Do not import raw IDs, bodies, messages, or URLs.                                 |
| Browser device IDs and capture preferences                        | Tab memory                                                              | Device-local preference only                                             | Never export or persist remotely.                                                                                                           |
| `.env` provider credentials                                       | Local server process                                                    | Managed deployment secret                                                | Never export or import. Provision and rotate independently for each environment.                                                            |
| Local created/updated timestamps                                  | Sanitized source history                                                | Server timestamps plus source provenance                                 | Validate and preserve as `source_created_at`/`source_updated_at`; server-owned timestamps remain authoritative.                             |
| Local reference repair scan                                       | Rare recovery for missing mappings                                      | Indexed unique lookup and bounded administrative repair                  | Do not port the linear scan into a request path.                                                                                            |
| Local usage/provider limits                                       | Moderated operator procedure                                            | Server-enforced entitlement, concurrency, rate, and spend controls       | Do not reconstruct usage from local data. New accounting begins at remote activation.                                                       |

No current schema addition is required. Opaque IDs, timestamps, versions, provenance,
retry-stable request IDs, sanitized browser migrations, and revisioned draft writes already have
current consumers and tests.

## 4. Target deployment and trust model

### 4.1 Deployment topology

The first remote deployment uses one application origin. A separate public API origin is out of
scope unless a later design proves it necessary.

```text
Browser
  |
  | HTTPS/WSS, one application origin
  v
Managed ingress / TLS termination
  |
  +--> Web/API service (private network)
  |      |
  |      +--> transactional metadata database
  |      +--> durable job/outbox records
  |      +--> private object storage
  |      +--> managed secret service
  |
  +--> Worker service (private network)
         |
         +--> Decart / ElevenLabs / selected reference provider
```

The Web/API and worker services may scale horizontally only after durable idempotency, leases, and
tenant authorization replace process-local assumptions. The database is authoritative for
ownership and operation state. Object storage is authoritative only for bytes whose database
record is committed. Provider systems are external trust domains and never become application
identity stores.

Decart realtime remains the one deliberate exception to server-only provider media transport: the
browser may connect directly with a short-lived, exact-origin, single-model credential minted
after authentication, authorization, entitlement, rate, and concurrency checks. The permanent
Decart credential remains server-only.

### 4.2 Network and secret boundaries

- TLS 1.2 or newer terminates at managed ingress; ingress-to-service transport is authenticated
  and encrypted where the platform supports it.
- Only the ingress is public. API workers, job workers, database, object store administration,
  and observability backends are private.
- Proxy headers are trusted only from the known ingress. A generic `trustProxy: true` is
  prohibited.
- CORS is disabled for the same-origin application. Any later cross-origin API requires a
  separate origin, credential, preflight, and CSRF review.
- Production, staging, and development use distinct provider accounts/keys, databases, buckets,
  encryption keys, origins, and audit sinks.
- Secrets are read from a managed secret service at runtime, never from browser configuration,
  images, build artifacts, logs, support exports, or committed environment files.
- Rotation supports an overlap window where necessary, records only secret version identifiers,
  and includes an emergency provider kill switch.

### 4.3 Trust boundaries

| Boundary                          | Untrusted input                                     | Required controls                                                                                                                   |
| --------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Browser → ingress/API             | Cookies, headers, bodies, uploads, idempotency keys | TLS, secure session, CSRF, exact origin, runtime schemas, size/time limits, authorization, rate and entitlement checks              |
| API → database                    | Application queries and migrations                  | Least-privilege role, parameterized queries, transaction boundaries, row ownership predicates, migration review                     |
| API/worker → object store         | Uploads, downloads, object keys                     | Private bucket, short-lived scoped grants, checksum/size validation, server metadata lookup, encryption, lifecycle rules            |
| API/worker → providers            | Prompts, media, credentials, provider responses     | Explicit intent, allowlisted model/settings, permanent secrets server-side, safe adapters, response bounds, cancellation, redaction |
| Provider → worker callbacks/polls | Status, usage, output locations                     | Authenticated callback or server poll, provider-operation correlation, replay protection, safe download, no raw forwarding          |
| Support/operations → production   | Search, repair, deletion, incident actions          | Named role, MFA, reason, least privilege, content-free default, approval for elevated access, immutable audit                       |
| Import bundle → remote account    | Local metadata and media                            | Explicit owner action, schema/version/checksum validation, quarantine, dry run, new ID assignment, transactional commit             |

## 5. Threat model

The remote phase must create a maintained threat-model record from this baseline and review it
whenever identity, origins, providers, storage, or sharing change.

| Abuse/failure case                      | Primary control                                                                                           | Detection/recovery                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Credential stuffing or account takeover | Standards-based authentication, MFA policy, throttling, breached-password/provider controls               | Auth anomaly alerts, global session revocation, account recovery runbook |
| Session theft/fixation                  | Opaque server-side sessions, rotation at sign-in/privilege change, `Secure`/`HttpOnly`/`SameSite` cookie  | Session inventory, revoke one/all, short idle and absolute lifetimes     |
| CSRF on provider or deletion action     | Same-origin application, exact Origin check, synchronizer token, SameSite cookie, no state-changing GET   | CSRF failure metric and alert without request content                    |
| IDOR/cross-tenant access                | Organization ownership on every record, centralized authorization, opaque IDs, deny by default            | Tenant-isolation tests, structured authorization-denial audit            |
| Provider-credit abuse                   | Authenticated rate/concurrency/entitlement/spend reservation before submission                            | Budget alerts, per-provider kill switch, content-free usage ledger       |
| Retry/replay double charge              | Unique scoped idempotency key and durable operation state                                                 | Reconciliation queue and duplicate-constraint metric                     |
| Ambiguous provider submission           | Persist `prepared` before submit; never blind-resubmit; reconcile using allowlisted provider correlation  | `outcome_unknown` alert and operator workflow                            |
| Malicious or oversized upload           | Quarantine, declared and cumulative byte limits, media decode/inspection, approved malware/content policy | Rejection metrics, quarantine expiry, no provider contact                |
| Spoofed MIME/duration/dimensions        | Server-derived inspection and checksums                                                                   | Invalid-media safe code and inspector telemetry                          |
| SSRF through provider output URL        | Existing safe downloader model: HTTPS allowlist, DNS/IP checks, redirect limits, byte/time limits         | Safe transport codes and blocked-target metric                           |
| Stored/reflected injection              | React escaping, no unsafe HTML, runtime schemas, deployment CSP                                           | CSP reports without payload content; dependency and SAST gates           |
| Support-user data browsing              | Content-free support UI, no raw media/prompt search, reasoned break-glass only                            | Immutable support audit and periodic access review                       |
| Secret leakage                          | Managed secrets, redaction, no raw provider errors, separate environments                                 | Secret scanning, rotation drill, incident playbook                       |
| Incomplete deletion                     | Relationship graph, durable deletion job, provider cleanup, backup expiry tracking                        | User-visible deletion receipt and verification job                       |
| Queue/worker duplication                | Lease fencing, idempotent transitions, unique provider submission record                                  | Stale-lease and duplicate-transition alerts                              |
| Database/object-store split brain       | Staged objects, checksum, transactional metadata/outbox, orphan lifecycle                                 | Reconciliation job and restore drill                                     |
| Availability attack                     | Ingress limits, authenticated quotas, bounded uploads/streams, backpressure                               | Saturation alerts, provider circuit/kill switch, graceful rejection      |
| Content-policy abuse                    | Approved server policy before self-service, provider settings as defense in depth only                    | Refusal/support workflow and content-free policy event                   |

An incident response plan must classify authentication compromise, tenant data exposure, provider
credential/spend compromise, deletion failure, and availability loss. Each class needs a named
incident owner, containment action, notification decision owner, evidence source, recovery
criteria, and retrospective owner.

## 6. Identity, session, tenancy, and authorization

### 6.1 Identity model

- `subject_id`: opaque application ID for one authenticated human or approved service principal.
- `organization_id`: opaque tenant/workspace ID and the ownership boundary for all product data.
- `membership_id`: binds a subject to one organization and one role.
- `created_by_subject_id`: provenance and audit field, not a substitute for organization
  ownership.

The first remote MVP should create one personal organization per account and keep invitations and
shared workspaces disabled unless collaboration is separately approved. Keeping an organization
boundary from day one prevents subject IDs from being embedded as permanent storage ownership
while avoiding premature collaboration UI.

Authentication should use a standards-based OIDC provider behind an application-owned adapter.
The design deliberately does not select a vendor. Provider subject claims are mapped to an
application subject record and are never copied into object keys or public resource IDs.

### 6.2 Session lifecycle

- The browser receives only an opaque session cookie such as `__Host-lightframe_session`.
- The cookie is `Secure`, `HttpOnly`, `Path=/`, and `SameSite=Lax`; it has no `Domain` attribute.
- Session state is server-side and stores subject, active organization, authentication strength,
  issued/last-seen/absolute-expiry timestamps, and revocation state.
- Sign-in, account recovery, password/provider changes, MFA changes, and privilege changes rotate
  the session identifier.
- Mutating requests require a session-bound CSRF token and exact allowed Origin.
- Idle and absolute lifetimes, concurrent-session policy, and reauthentication windows for export,
  account deletion, membership changes, and support elevation require security approval.
- Sign-out revokes the current session; account security offers revoke-all. Account deletion
  revokes all sessions before erasure begins.
- Browser local storage never contains bearer, refresh, provider, or session credentials.

### 6.3 Roles

| Role               | Purpose                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner`            | Controls the personal organization, export, member administration if later enabled, and organization deletion.                              |
| `admin`            | Manages organization settings and ordinary organization resources; cannot delete the organization or transfer ownership.                    |
| `creator`          | Creates and manages own resources within the organization and uses entitled provider operations.                                            |
| `support_operator` | Platform role outside tenant membership; sees content-free diagnostics only unless an approved, time-bounded break-glass procedure applies. |

The first personal-workspace release may grant only `owner`. The additional roles define the
authorization boundary before any later invitation feature; their existence does not authorize
collaboration.

### 6.4 Authorization matrix

`Own` means `created_by_subject_id` matches the authenticated subject and
`organization_id` matches the active membership. `Org` means any resource in the authorized
organization. All access also requires resource state and entitlement checks.

| Resource/action                                  | Owner                            | Admin                            | Creator                                    | Support operator                             |
| ------------------------------------------------ | -------------------------------- | -------------------------------- | ------------------------------------------ | -------------------------------------------- |
| View/update own account, sessions                | Own                              | Own                              | Own                                        | No                                           |
| Export own personal organization                 | Org                              | No                               | No                                         | Status only                                  |
| Delete personal organization/account             | Org                              | No                               | No                                         | Status only; cannot initiate                 |
| Membership/role administration                   | Org                              | Org except owner transfer/delete | No                                         | Content-free status only                     |
| Character/recipe create                          | Yes                              | Yes                              | Yes                                        | No                                           |
| Character/recipe read/update/delete              | Org                              | Org                              | Own                                        | Metadata status only                         |
| Reference/take/sidecar/output ingest/read/delete | Org                              | Org                              | Own                                        | Metadata status only                         |
| Start/cancel provider operation                  | Org with entitlement             | Org with entitlement             | Own with entitlement                       | Emergency cancel only with audited elevation |
| View usage                                       | Org aggregate and own detail     | Org aggregate                    | Own content-free detail                    | Content-free diagnostic fields               |
| Import                                           | Org after reauthentication       | Org if policy allows             | Own bundle into own scope if policy allows | No                                           |
| Audit events                                     | Org-safe account/security events | Org-safe operational events      | Own events                                 | Content-free operational audit               |
| Retention/legal hold                             | View status                      | No unless policy grants          | View status                                | Approved privacy/legal role only             |

Every API query and mutation must enforce the matrix server-side. Browser hiding, object-key
secrecy, signed URLs, provider ownership, and client-supplied organization IDs are never
authorization controls.

## 7. Resource inventory and ownership

| Resource              | Authoritative metadata                               | Byte owner/lifetime                                   | Required relationships                                                                  |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Subject/account       | Transactional database                               | None                                                  | Sessions, memberships, deletion job                                                     |
| Organization/tenant   | Transactional database                               | None                                                  | Memberships and every product resource                                                  |
| Character             | Transactional database, versioned                    | Optional reference through relationship               | Organization, creator, current recipe/reference versions                                |
| Recipe                | Transactional database, versioned                    | None                                                  | Organization, creator, optional immutable reference                                     |
| Reference             | Transactional database plus immutable object         | Private object storage                                | Organization, creator, derivation parent, characters/recipes, import/provider operation |
| Take                  | Transactional database plus immutable original video | Private object storage                                | Organization, creator, source mode, sidecar, processed variants                         |
| Audio sidecar         | Transactional database plus immutable original audio | Private object storage                                | One original take                                                                       |
| Processed output      | Transactional database plus immutable object         | Private object storage                                | Original take/sidecar, treatment/provider operation                                     |
| Provider operation    | Durable database state machine                       | Temporary/provider outputs until committed or expired | Organization, subject, source resources, idempotency, usage                             |
| Usage entry           | Append-only transactional ledger                     | None                                                  | Organization, subject, provider operation, reservation/settlement                       |
| Idempotency record    | Transactional database with unique scope/key         | None                                                  | Organization, operation kind, request fingerprint, result resource                      |
| Import/export job     | Durable database state                               | Temporary bundle object                               | Organization, subject, manifest version, source mappings                                |
| Deletion job          | Durable database state                               | Coordinates object/provider deletion                  | Organization/account, resource graph, verification receipt                              |
| Audit event           | Append-only restricted store/table                   | No content payloads                                   | Actor, organization, action class, target opaque ID, reason/result                      |
| Support case metadata | Restricted database                                  | Attachments prohibited by default                     | Organization, reporter, safe error/operation correlation                                |

Immutable fields include application IDs, organization ownership, original object checksum,
original media provenance, provider selection for an operation, source-resource relationships,
created timestamp, and import source mapping. Mutable records use optimistic versions and
server-owned `updated_at`. A replacement creates a new media/version record before the old
relationship is detached.

## 8. Persistence topology and consistency

### 8.1 Transactional metadata

A relational database is the source of truth for identity, organization ownership, resource
relationships, versions, operation state, idempotency, usage, deletion state, and audit metadata.
Required uniqueness/indexes include:

- `(identity_issuer, identity_subject)` for account mapping;
- `(organization_id, subject_id)` for membership;
- `(organization_id, resource_id)` or a globally unique opaque ID plus an organization index for
  every resource;
- `(organization_id, operation_scope, idempotency_key)` for remote idempotency;
- `(organization_id, source_kind, source_external_id, import_job_id)` for import replay safety;
- `(provider, provider_correlation_hash)` where provider reconciliation supports it;
- operation state/lease expiry, resource relationship, retention deadline, deletion state, and
  created/updated indexes; and
- a direct indexed replacement for the local request-mapping repair scan.

Database constraints enforce valid ownership relationships. Application authorization still
checks the active organization and actor; foreign keys alone are not sufficient.

### 8.2 Object storage

Object storage holds immutable references, take originals, audio sidecars, processed outputs,
quarantined uploads, and temporary export bundles. Keys use new random object IDs and versions,
for example `objects/<opaque-object-id>/<version>`. An organization prefix may aid operations but
is never trusted for authorization.

Each committed object record contains the expected checksum, byte size, server-derived media
facts, encryption/key version, creation time, retention class, and state. Buckets are private,
encrypted, versioning/lifecycle behavior is documented, and public ACLs are denied centrally.
Downloads use a short-lived authorization check or narrowly scoped signed URL after the database
ownership check.

### 8.3 Commit protocols

**Ingestion**

1. Authorize and create a `pending_upload` record with limits and expiry.
2. Upload to a quarantined random object key through a single-purpose grant.
3. Verify cumulative bytes, checksum, format, dimensions/duration, and approved safety checks.
4. In one database transaction, create the immutable media record, relationship, and outbox event.
5. Mark/move the object into committed state. A reconciler handles a crash between object and
   metadata transitions; uncommitted objects expire automatically.

**Provider result**

1. Commit the operation and spend reservation before any provider submission.
2. Submit once and durably record the outcome/correlation state.
3. Safely download and validate provider output to quarantine.
4. Commit the derived resource, provenance, usage settlement, and operation success in one
   database transaction.
5. Run provider-side temporary cleanup after local commit settles; cleanup failure becomes a safe
   lifecycle event and does not delete a valid committed result.

**Deletion**

1. Authorize, reauthenticate where required, and transactionally make the resource unavailable.
2. Snapshot the authoritative relationship/deletion plan.
3. Enqueue object and provider deletion with idempotent steps.
4. Verify each step, apply the approved tombstone rule, and issue a content-free receipt.

Distributed transactions across database, object store, and providers are prohibited. Durable
states, an outbox, idempotent steps, fencing leases, and reconciliation make each boundary
recoverable.

## 9. Explicit local import, export, and portability

### 9.1 Bundle contract

The future local exporter produces a versioned bundle only after an explicit local action. The
bundle contains:

- `manifest.json` with bundle schema, product version, export time, resource counts, checksums,
  source schema versions, and no device/filesystem/credential identifiers;
- sanitized Recipe Shelf characters and recipes;
- allowlisted Character Builder provenance if the user includes the active draft;
- selected immutable reference bytes and allowlisted reference metadata;
- selected legacy/current takes, original sidecars, and selected processed variants; and
- a relationship table using bundle-local IDs.

The bundle never contains object URLs, loopback Host hashes, filesystem/storage keys, device IDs,
provider credentials/tokens, raw provider bodies/messages/URLs, or unselected browser history.
Because it may contain personal media and prompts, export copy must say that the downloaded bundle
is sensitive. Bundle encryption and recovery-key UX require a separate approved decision; the
design must not claim encryption if a plain browser download is used.

### 9.2 Remote import

1. The authenticated owner chooses a bundle and the UI displays its schema, resource counts,
   media categories, and proposed retention policy before upload.
2. The server creates an import job and quarantines the bundle with a strict byte/decompression
   budget.
3. The importer validates schemas, checksums, relationship closure, media facts, and allowed
   provenance without trusting local IDs or timestamps.
4. A dry run reports accepted, skipped, conflicted, and unsupported records without changing
   product data or calling providers.
5. After explicit confirmation, one import job assigns new remote IDs and organization ownership.
   Source IDs remain only in import-scoped mapping rows.
6. Metadata commits transactionally. Referenced objects commit through the ingestion protocol.
7. Re-running the same confirmed job is idempotent. A failed import can resume or be discarded
   without exposing partial resources.

Import never deletes local data and never calls a provider. Export remains available before a
remote account is created. Migration rollout is opt-in per account, can be disabled independently,
and has no automatic destructive move.

### 9.3 Schema evolution and rollback

- Bundle schemas and database schemas are independently versioned.
- Readers accept an explicitly bounded set of older bundle versions and migrate through pure,
  tested transformations.
- Database changes use expand/migrate/contract. New code reads old and new fields during the
  compatibility window; destructive contraction occurs only after rollback expires and evidence
  shows migration completion.
- Source values remain available until the migrated replacement is verified.
- Rollback disables new writes/imports first, keeps old readers compatible, and never restores
  deleted user content from an unreviewed snapshot.

## 10. Retention, detach, deletion, and account erasure

The following is the proposed remote policy for stakeholder approval. It is not the current local
policy and is not effective until privacy/data-owner approval and product disclosure are complete.

| Data class                                                       | Proposed active retention                                                         | Delete/expiry behavior                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Pending/quarantined uploads                                      | 24 hours                                                                          | Automatic object and metadata deletion if not committed                     |
| Failed/cancelled operation temporary media                       | 24 hours after terminal state                                                     | Automatic deletion; retain only safe operation/usage metadata               |
| Export bundles                                                   | 24 hours or first successful download, whichever comes first                      | Revoke grant and delete object                                              |
| Active characters, recipes, references, takes, sidecars, outputs | Until explicit deletion or account deletion                                       | Relationship-aware deletion; Detach only removes the selected relationship  |
| Idempotency records                                              | 30 days after terminal operation, longer only if provider dispute policy requires | Remove request fingerprint/result mapping after retention                   |
| Content-free support metadata                                    | 90 days after case closure                                                        | Delete unless an approved incident/legal requirement applies                |
| Application logs/traces                                          | 30 days                                                                           | Automatic expiry; security events may use the audit class                   |
| Content-free security/authorization audit                        | 365 days                                                                          | Automatic expiry unless an approved legal hold applies                      |
| Usage/settlement records                                         | 365 days, subject to billing/legal approval                                       | Remove direct content/resource details as soon as operationally possible    |
| Database/object backups                                          | 35 days                                                                           | Encrypted rotation; deleted content ages out without ordinary restore       |
| Minimal deletion tombstone                                       | 90 days                                                                           | Contains opaque IDs, deletion state/time, and verification only; then purge |

Policy decisions that remain approval gates are listed in Section 17.

### 10.1 Semantics

- **Detach** removes one relationship but retains the immutable resource when another live
  relationship or the owner's library still references it.
- **Delete resource** immediately removes ordinary access, prevents new provider work, and starts a
  relationship-aware deletion job. Shared/derived relationships receive an explicit impact
  preview before confirmation.
- **Delete account/organization** revokes all sessions, freezes writes, offers the approved export
  window, deletes active resources and provider-side artifacts where supported, and verifies
  database, object, job, cache, and support relationships.
- Provider deletion is attempted through documented provider APIs. Unsupported provider deletion
  and provider retention terms must be disclosed before submission, not hidden after deletion.
- Backups are not selectively rewritten. Deleted data is not restored into the active product and
  expires within the approved backup window.
- A legal hold is not silently invented. If legal/privacy review requires holds, the data classes,
  authority, notice rules, access, expiry, and deletion resumption procedure require a separate
  approved policy.

The deletion receipt contains a random receipt ID, requested/completed timestamps, data classes,
provider cleanup status categories, backup-expiry deadline, and any approved exception. It contains
no prompt, media, provider URL, storage key, or secret.

## 11. Provider execution, idempotency, and spend safety

### 11.1 Durable operation state

Provider operations use an app-owned state machine:

```text
prepared -> submitted -> running -> output_validating -> succeeded
    |          |           |              |
    +----------+-----------+--------------+-> failed
                         \-------------------> outcome_unknown -> reconciling
prepared/running ---------------------------------------------> cancelling -> cancelled
```

`prepared` means authorization, intent, source ownership, model/settings, entitlement, rate,
concurrency, and spend reservation succeeded durably. Only the transition owner may make the
initial billable submit. A fencing lease prevents two workers from owning that transition.

The idempotency record stores organization, subject, operation kind, normalized request
fingerprint, key, state, result resource, and timestamps. Reusing a key with a different
fingerprint is rejected. Reusing it with the same fingerprint returns or waits for the original
operation.

If submission times out after the request may have reached the provider, the operation becomes
`outcome_unknown`. Automated work may poll or reconcile with an existing provider correlation;
it may not repeat the initial billable submission. A person receives a safe explanation before
any separately keyed new attempt.

### 11.2 Retry, cancellation, and reconciliation

- Pre-submission transient work may retry within a bounded deadline.
- Poll/read/download may retry with exponential backoff, jitter, provider rate guidance, and the
  original operation deadline.
- The initial billable submission does not retry automatically.
- Provider fallback is prohibited.
- Cancellation is best effort at the provider, authoritative in app state, and idempotent. Late
  output cannot publish after cancellation/deletion.
- Reconciliation repairs stale leases, polls ambiguous operations, completes validated stored
  outputs, settles usage once, and reports safe terminal states.
- Wiro input/output cleanup remains post-persistence and idempotent; failures are operational
  warnings.

### 11.3 Rate, entitlement, concurrency, and budgets

Before provider contact, the server enforces:

- authenticated subject and active organization;
- operation-specific entitlement;
- subject, organization, provider, and ingress abuse rates;
- maximum concurrent realtime/generation/voice operations;
- provider/model allowlist and startup-selected reference provider;
- daily/monthly organization spend or operation budgets;
- optional provider-account quota headroom; and
- an emergency global/provider/model kill switch.

The initial remote MVP may use an allowlist entitlement and hard budgets. Credits, subscriptions,
payments, refunds, and pricing remain deferred. A usage ledger can reserve and settle measured
provider usage without pretending it is a billing ledger. Failed, cancelled, ambiguous, and
provider-refused outcomes need an approved settlement policy before paid user balances exist.

Support views expose operation ID, safe state/code, provider/model allowlist name, timestamps,
attempt class, byte/duration buckets, usage amount, and reconciliation/deletion state. They exclude
prompts, media, character names, selected voice IDs, raw provider IDs, URLs, bodies, and messages.

## 12. Authenticated media ingestion

Every remote media input begins with an authorized upload record. Direct arbitrary multipart
requests to billable provider routes are prohibited.

### 12.1 Validation

- Enforce declared and cumulative byte ceilings at ingress and object storage.
- Verify checksum and server-decode the container.
- Derive MIME/codec, duration, dimensions, frame/sample rate where relevant, and reject a mismatch.
- Preserve the current reference-image ceilings: JPEG/PNG/WebP, 10 MiB, and 40 megapixels.
- Preserve the app-owned take maximum of 300 seconds.
- Derive ElevenLabs input duration from the immutable original audio sidecar or inspected upload;
  reject more than 300 seconds even though the provider contract is described as five minutes.
- Apply output-byte ceilings before commit and while streaming provider output.
- Quarantine until validation completes. No provider receives an uncommitted upload.

An approved malware/content policy must define scanner, failure mode, unsupported encrypted/archive
formats, content moderation boundaries, false-positive support, and retention. Until that policy is
approved, the remote ingestion feature remains disabled. Provider moderation settings are not a
substitute for application policy.

### 12.2 Immutable originals and derivations

Take video and original audio sidecar are immutable. Local voice and ElevenLabs processing always
read the original sidecar. A processed output references its original and operation/treatment
provenance. Replacement commits a healthy new variant before detaching an old selected variant.
Failure/cancel preserves the original and last valid output.

Signed upload/download grants are short-lived, single-resource, method/size/checksum scoped where
supported, and useless without the associated authorized database record. They do not convey
ownership.

## 13. Browser policy, CSRF, and deployment security

### 13.1 Header baseline

- HSTS is enabled only after the production hostname and subdomain policy are approved.
- `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`, and a restrictive
  `form-action` are deployment requirements.
- Referrer policy, permissions policy, MIME sniffing protection, and cache policy are explicit.
- Authenticated HTML/API responses are not shared-cacheable.
- COOP/COEP are tested with Decart SDK, WebRTC, workers, downloads, and media before enforcement.

### 13.2 CSP/provider-origin inventory

The deployment owns a machine-reviewed inventory. Wildcards and guessed provider aliases are
prohibited.

| Directive/capability | Expected source class                                                           | Approval evidence                                  |
| -------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| `default-src`        | `'self'`                                                                        | Static application smoke                           |
| `script-src`         | Built self-hosted chunks; nonce/hash only if runtime script is unavoidable      | Production bundle inventory and injection tests    |
| `connect-src`        | Application origin plus exact Decart HTTPS/WSS endpoints                        | Character/VTO live smoke for both configured modes |
| `media-src`          | `'self'`, required `blob:` playback, exact Decart media endpoints if applicable | Local/provider preview, recording, playback, Voice |
| `img-src`            | `'self'`, required `blob:`/`data:` use                                          | Builder upload/generated/reference states          |
| `worker-src`         | `'self'` and only required worker/blob sources                                  | Recording/remux/SDK compatibility                  |
| `style-src`          | Self-hosted styles; no broad unsafe exception without evidence                  | Production UI and CSP report review                |
| `font-src`           | Self-hosted fonts only unless approved otherwise                                | Visual and offline failure checks                  |
| `frame-src`          | None unless the selected identity flow proves a requirement                     | Authentication flow review                         |

CSP rolls out through test/staging enforcement, production `Report-Only` with redacted reporting,
then enforcement after provider and complete local regression evidence. COEP remains disabled if
provider media is incompatible; the decision and compensating controls are recorded rather than
blindly enabling it.

### 13.3 CSRF posture

Cookie-authenticated state changes require:

- exact HTTPS Origin allowlisting;
- a session-bound unpredictable CSRF token sent in a custom header;
- `SameSite=Lax` as defense in depth;
- no mutation through GET, link, image, or form-compatible endpoints; and
- explicit provider-intent markers in addition to, not instead of, CSRF and authorization.

OAuth/OIDC callback state, nonce, PKCE, redirect allowlists, and one-time code handling receive
separate tests. Webhooks use provider authentication/replay protection and never rely on browser
CSRF controls.

## 14. Observability, support, backup, and operations

### 14.1 Content-free telemetry

Allowed dimensions include environment, deployment version, route/operation class, safe code,
provider/model allowlist label, state transition, duration bucket, byte bucket, retry class,
organization/subject pseudonymous operational IDs, region, and success/cancel/refusal outcome.

Prohibited fields include prompts, names, tags, media, transcripts, voice IDs, provider
request/output URLs, raw provider error/body/message/cause, cookies/tokens, object keys, filesystem
paths, import filenames, and secret values.

### 14.2 Required dashboards and alerts

- authentication success/failure, session revocation, and CSRF/authorization denials;
- cross-tenant denial probes and support elevation;
- provider operations by safe state, latency, ambiguous outcome, refusal, cancellation, and
  reconciliation age;
- rate/concurrency/entitlement/budget rejection and spend thresholds;
- ingestion rejection, quarantine age, output bounds, and object/database reconciliation;
- deletion/provider-cleanup age and backup-expiry verification;
- worker lease age, queue depth, database/object availability, saturation, and error budget; and
- deploy version, migration version, rollback readiness, backup age, and restore-drill status.

Alerts identify an owner and runbook. They do not page on a raw prompt or media-derived label.

### 14.3 Support and privileged operations

Support can search by app-owned operation, deletion receipt, import job, safe code, or
organization-supplied support token. Default views show no user content. Any break-glass access
requires an approved privacy policy, MFA, reason, incident/case link, short expiry, restricted
fields, user notice where required, and immutable audit.

Administrative repair is explicit and idempotent. It may reconcile an operation, retry a
non-billable poll/download, release a stale lease, verify object metadata, or resume deletion. It
cannot silently resubmit a billable initial request, change tenant ownership, bypass retention, or
expose provider bodies.

### 14.4 Backup and restore

- Database and object metadata backups are encrypted, access-controlled, monitored, and retained
  for the approved window.
- Object versioning/lifecycle behavior is documented with deletion semantics.
- Restore drills run at least quarterly before general availability and verify referential
  integrity, ownership, checksums, operation/idempotency state, and deletion exclusions.
- A restore enters an isolated environment first. Deleted/expired data is not republished.
- Recovery-point and recovery-time objectives require operations/data-owner approval.

## 15. Deployment, rollout, incident response, and rollback

Remote capability is staged behind server-controlled gates:

1. infrastructure and schema in an isolated non-production environment;
2. authentication/session and authorization matrix with providers disabled;
3. object ingestion with provider contact disabled;
4. one provider/configuration at a time with allowlisted internal operators;
5. explicit local import/export for test accounts;
6. a named, approved remote cohort only after security/privacy/operations gates; and
7. wider access only after load, deletion, restore, incident, and cost evidence.

Deployments are immutable and identify source, schema compatibility, configuration version, and
provider allowlist. Database migrations use expand/migrate/contract and publish a forward-fix and
rollback decision. The rollback path:

- stops new provider submissions/imports/uploads through kill switches;
- preserves cancellation, download, export, deletion, and reconciliation where safe;
- drains or fences workers;
- rolls application code back only to a schema-compatible version;
- never runs an automatic destructive down migration;
- verifies no committed object or usage settlement was orphaned; and
- records the incident and customer-impact decision.

Incident response assigns severity, commander, security/privacy/data/operations owners,
containment, evidence preservation, provider/secret revocation, user/legal notification decision,
recovery verification, and retrospective. Provider spend compromise and suspected cross-tenant
access have dedicated kill-switch and session-revocation exercises.

## 16. Remote-phase test strategy

The complete local static, unit, integration, E2E, production, visual, coverage, and audit suites
remain regression gates. Remote tests add boundaries; they do not replace the local journey.

| Test area                      | Required evidence                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication/session         | OIDC state/nonce/PKCE, rotation, fixation, expiry, revoke one/all, recovery, MFA/reauth gates, secure cookie attributes                |
| CSRF/origin                    | Missing/wrong/replayed token, cross-origin form/fetch, exact Origin, callback/webhook distinction, no state-changing GET               |
| Authorization                  | Every role/action/resource state, opaque-ID guessing, mismatched body/path organization, signed URL after revocation                   |
| Tenant isolation               | Two or more tenants for every repository/query/job/cache/object/support path; database backup/restore preserves isolation              |
| Ingestion                      | Declared/chunked/decompression bounds, spoofed MIME, duration/dimension derivation, malformed codecs, quarantine expiry, cancellation  |
| Object/database failure        | Object succeeds/database fails, database succeeds/object commit fails, checksum mismatch, missing object, reconciler idempotency       |
| Idempotency/provider execution | Same/different fingerprints, duplicate workers, stale lease, timeout-before/after submit, no blind resubmit, no fallback               |
| Rate/entitlement/spend         | Subject/org/provider concurrency, reservation/settlement once, kill switches, disabled model/provider, fair retry behavior             |
| Provider adapters              | Pinned model/settings, explicit intent, safe codes, bounded output, abort, poll/download retry, provider cleanup, raw-data denial      |
| ElevenLabs                     | Server-derived duration, immutable original, saved-voice revalidation, zero-retention policy, output bounds, cancellation/preservation |
| Migration/import/export        | Every supported local schema, corrupt/unknown bundle, checksum/relationship failure, dry run, resume, replay, rollback, no auto-delete |
| Retention/deletion             | Detach versus delete, derived/shared resources, provider deletion, backup aging, tombstone expiry, account erasure receipt             |
| Observability/support          | Redaction tests, prohibited-field scanning, audit integrity, break-glass expiry, support tenant boundaries                             |
| Browser security               | Enforced CSP origin inventory, CSP report redaction, Decart HTTPS/WSS/media, COOP/COEP decision evidence                               |
| Operations                     | Backup restore, deploy rollback, worker fencing, provider/secret kill switch, database/object/provider outage                          |
| Load/resilience                | Concurrent uploads, realtime sessions, generation/voice jobs, database/object saturation, backpressure, recovery objectives            |
| Security                       | SAST/dependency/secret/container/IaC scans, penetration test, session/tenant/upload/SSRF review, threat-model sign-off                 |
| Preserved product              | Local Camera needs no account/provider, complete Character/VTO/Record/Voice/Download, five viewports, accessibility, 300-second rule   |

Tests deny unexpected live provider traffic by default. Paid/live checks remain gated,
configuration-specific, cancellable, content-safe, and owned by an authorized evidence recorder.

## 17. Decisions that remain approval gates

The design deliberately does not fabricate business, legal, identity-vendor, or hosting choices.
These decisions must be recorded before implementation planning:

| Decision                                     | Proposed baseline                                           | Required owner(s)                            |
| -------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| Remote audience and rollout cohort           | Named allowlisted cohort before self-service                | Product, security/privacy, operations        |
| Identity provider and account recovery       | Standards-based OIDC behind app adapter; no vendor selected | Security, architecture, product              |
| Personal versus shared organizations         | One personal organization; invitations disabled             | Product, architecture, privacy               |
| Session idle/absolute lifetime and MFA       | Server-side secure sessions; exact durations pending        | Security, product                            |
| Hosting regions/data residency/subprocessors | No region/vendor selected                                   | Privacy/data owner, operations, architecture |
| CSP/COEP exact provider origins              | Exact inventory from chosen production configuration        | Security, architecture                       |
| Malware/content policy                       | Quarantine and fail closed until policy/tooling is approved | Security/privacy, product, support           |
| Remote retention table                       | Proposed values in Section 10                               | Privacy/data owner, product, operations      |
| Legal holds                                  | None unless a separate applicable policy is approved        | Privacy/legal, data owner                    |
| Provider deletion/SLA disclosures            | Per approved provider contract/configuration                | Privacy, provider owner, support             |
| Rate/concurrency/spend numbers               | Hard server budgets; values based on qualified evidence     | Product, billing authorizer, operations      |
| Usage settlement for ambiguous/failure cases | No user billing; content-free ledger only initially         | Product, finance/billing, support            |
| Backup RPO/RTO and 35-day window             | Quarterly drill; exact objectives pending                   | Operations, data owner                       |
| Export encryption/recovery                   | Sensitive bundle warning; encryption UX undecided           | Security/privacy, product                    |
| Support break-glass                          | Disabled unless separately approved                         | Security/privacy, support owner              |
| Account-deletion grace/recovery window       | Immediate access removal; no restore into active product    | Product, privacy/data owner, support         |

## 18. Approval record and handoff gate

Approval means the reviewer accepts the complete design, proposed retention/operations obligations,
and their owned open decisions. Merging this document or completing automated checks is not
approval.

| Approval area                                                | Required signatory role          | Status  | Name/date/reference |
| ------------------------------------------------------------ | -------------------------------- | ------- | ------------------- |
| Product scope and remote cohort                              | Product owner                    | Pending | —                   |
| Threat model, identity/session, CSP/CSRF                     | Security owner                   | Pending | —                   |
| Retention, deletion, import/export, support access           | Privacy/data owner               | Pending | —                   |
| Domain/contracts, persistence, jobs, provider boundaries     | Architecture owner               | Pending | —                   |
| Deployment, observability, backup/restore, incident/rollback | Operations owner                 | Pending | —                   |
| Provider spend, limits, settlement policy                    | Billing authorizer/product owner | Pending | —                   |

The Wave 11 / Phase 8 exit gate passes only when:

- all approvals above are recorded with their final decisions;
- every open decision in Section 17 is resolved or explicitly deferred without weakening a remote
  security/privacy/operations claim;
- Waves 0–10 satisfy the pre-remote handoff checklist or carry named owner-approved acceptance;
- no Critical or High local-loopback finding remains open;
- all automated/manual/live limitations are explicit;
- the loopback broker has not been exposed during preparation;
- a separate remote-MVP implementation plan maps this design into reviewable phases and tests; and
- that plan receives explicit authorization before any account, public origin, remote storage,
  provider job, or deployment code is added.

Until then, the correct implementation state is the current loopback-only product plus this
approval-ready handoff package.
