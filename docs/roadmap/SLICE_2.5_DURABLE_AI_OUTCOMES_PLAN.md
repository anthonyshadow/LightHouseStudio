# Slice 2.5 (Durable AI outcomes): audit and plan

**Document type:** the audit-and-plan output of implementation prompt 20 (Phase 2, slice 2.5 of the
[roadmap](PRODUCT_ROADMAP.md)), written 2026-09-05 against commit `a4f6c171`. Prompt 21 implements
it once approved and prompt 22 verifies it (prompts 20, 21 and 22 are A, B, C). Findings prov-2,
prov-3, prov-6 and prod-7 are in the [current-state audit](../audits/CURRENT_STATE_AUDIT.md);
prov-7 (single-process job assumptions) is a constraint on the design, not a finding this slice
closes. D5, D8, D9 and D14 are in [Decisions required](../DECISIONS_REQUIRED.md). **No code was
changed by this prompt. This is a plan for approval; nothing in it is implemented.** Every
current-behaviour claim below cites a file and a line that was read for this document.

**In one paragraph.** A transformation (processing job) moves today only when a client asks. The
provider is polled from two request-driven methods, the only server-side timer expires jobs, and a
result the provider finished while nobody was watching sits in temporary storage until its hour
runs out and the paid output is deleted. A delivered standalone result is deleted the moment its
stream completes, so a second download is a second submission. Nothing records what AI ran for an
account: the durable trace has a status and three timestamps but no read path per owner, no video
row carries a cost, and the Account panel says in its own copy that no total exists. The slice adds
three bounded things and changes no existing wire shape (one existing error code gains a new cause,
§3). A progression tick, owned by the process that already owns the jobs, polls due jobs and
retrieves completed ones without a client, Project-linked jobs first, and retains Project results
into the owner byte store (promotion into the current cut is gated by Q3). Delivery stops deleting
a standalone result; the existing creation-anchored one-hour deadline, explicit release and abandon
remain the only things that do. An AI usage ledger, one row per submission keyed by owner and job
id, is opened immediately before the single paid call and closed on the first terminal outcome by
one first-terminal-wins write owned by a domain rule, so a tick and a poll racing each other cannot
double-count. A new `GET /api/account/ai-usage` route serves it, and the Account panel's AI
activity section shows it as counts and outcomes only. Six questions in §5 change what prompt 21
builds; each carries a recommendation, and three of them (Q1, Q2, Q3) are gates that must be
answered in `DECISIONS_REQUIRED.md` before prompt 21 starts.

## 1. Current behaviour, with evidence

### 1.1 A job progresses only when a client asks

- The provider poll is `#refresh` (`apps/api/src/features/video-jobs/video-job-service.ts:1211`).
  It has exactly two callers: `reconcileActiveJob` (`:523`) and `status()` (`:1296`).
  `reconcileActiveJob` looks at one job, the owner's active job (`:514`). It is itself reached from
  `listActiveJobs` (`:530`), `start` (`:900`), `startPrelinked` (`:994`) and the Project submit
  path (`apps/api/src/features/projects/project-processing-service.ts:364`). `status()` is reached
  from `GET /api/video-jobs/:jobId` (`apps/api/src/features/video-jobs/routes.ts:103`) and from
  the Project reconcile path (`project-processing-service.ts:626`). Every one of those is a
  request.
- The only timer the service owns is the nearest-deadline `setTimeout`
  (`video-job-service.ts:153`). It is unref'd (`:158`, `:855`) and its callback only calls
  `#expireDueJobs` (`:851`). Restore re-launches `#retrieve` for rows restored as `retrieving`
  (`:355`) and never calls `#refresh`; restored `queued` and `processing` jobs wait for a request.
- `#refresh` polls only `queued` and `processing` jobs; it returns early for `validating`,
  `submitting` and `retrieving` (`:1215-1217`). It is gated by a per-job next-poll time (`:1221`)
  and coalesces concurrent callers on one in-memory promise (`:1222`). The poll is one
  `provider.status` call (`:1233`). A `completed` answer flips the job to `retrieving` (`:1250`)
  and spawns `#retrieve` as a tracked operation (`:1251`); a `failed` answer fails the job
  (`:1245`). The backoff ladder is 2/3/5/8/10 seconds (`:117`) and advances only while the
  provider status is unchanged (`:1257`). Two retryable status-read failures are tolerated
  (`:1267`).
- `#retrieve` downloads with `provider.download` (`:1168`), inspects the file (`:1179`), marks the
  job `ready` with a fire-and-forget trace write (`:1191`), retries a retryable download failure
  up to two times (three download attempts in total: the counter is incremented before every
  download at `:1159`, never reset, and the requeue at `:1199` is guarded by
  `job.retrievalAttempts < 3` at `:1197`) and otherwise fails the job (`:1206`).
- The browser drives all of this. The standalone workflow polls at the server's `nextPollAfterMs`
  hint or a 1.5 s default (`apps/web/src/features/existing-video/videoJobStatusQuery.ts:5`,
  `:19`), with no retry (`:67`) and in the background (`:74`). The Project workspace calls
  `POST .../processing/reconcile` on a timer
  (`apps/web/src/features/projects/useProjectProcessingController.ts:615`,
  `apps/web/src/features/projects/projectProcessingApi.ts:93`,
  `apps/api/src/features/projects/project-processing-routes.ts:79`). The Dashboard queue polls
  `GET /api/video-jobs` every 3 s while jobs exist
  (`apps/web/src/features/dashboard/DashboardRouteSurface.tsx:235`). Close every tab and nothing
  polls. This is prov-2.

### 1.2 A delivered standalone result is deleted at once

- `content()` admits a lease only while the job is `ready`, holds a result and admissions are open
  (`video-job-service.ts:1326`), and counts the lease (`:1330`). The content route settles
  `delivered = true` only when the stream completes (`routes.ts:124`) and `false` on cancel or
  error (`:125-126`).
- `#settleDelivery` requests cleanup with record deletion when delivered and not expired
  (`:1349-1350`) and otherwise only flushes pending cleanup (`:1352`). `#requestCleanup` closes
  admissions (`:799`), so no second lease can start. Cleanup removes the whole job directory
  (`:771`) and then deletes the record from the job map because `deleteAfterCleanup` is set
  (`:792`). A second `GET .../content` therefore answers 409 and then 404. This is prov-6.
- The Project path settles `delivered = true` only after the bytes are in the owner byte store
  (`project-processing-service.ts:654`, `:773`). For a Project-linked job the temporary copy is a
  duplicate by the time it is removed.
- The browser never releases a delivered job. After a successful download the lifecycle removes
  only its cache entry (`apps/web/src/features/existing-video/useExistingVideoJobLifecycle.ts:188`).
  `retainedJobIdRef` is set to a job id in exactly one place (`:154`), inside the `explicit-user`
  terminal-failure branch (`:153`), and cleared in exactly one place (`:37`, inside
  `releaseRetainedJobAndWait`, `:34-40`, which acts only on that ref); the two other references in
  the feature (`useExistingVideoWorkflow.ts:128`, `:332`) only destructure and pass it through. The
  job id is held in memory only: nothing under `apps/web/src/features/existing-video` touches
  `sessionStorage` or `localStorage`. The feature contract already says so: successful delivery
  cleans its local job without a follow-up browser DELETE
  (`docs/user-flows/feature-behavior/12-existing-video-processing.md:256-257`).
- `release` (`DELETE /api/video-jobs/:jobId`, `routes.ts:131-137`) refuses a non-terminal job
  (`video-job-service.ts:1364`) and otherwise requests cleanup with deletion (`:1371`). `abandon`
  marks a non-terminal or `ready` job cancelled with a required trace write (`:1382`, `:1391`) and
  cleans up (`:1400`); the request body must acknowledge that the provider may keep charging
  (`packages/contracts/src/video-jobs.ts:223`).

### 1.3 The deadline is one hour from creation, and three documents say otherwise

- `VIDEO_JOB_TTL_MS` is sixty minutes and owned by the contracts package
  (`packages/contracts/src/video-jobs.ts:26`). `#createJob` computes
  `expiresAtMs = createdAtMs + VIDEO_JOB_TTL_MS` (`video-job-service.ts:466`). Both durable stores
  derive expiry the same way
  (`apps/api/src/infrastructure/database/processing-job-repository.ts:59`;
  `apps/api/src/features/processing-jobs/file-processing-job-repository.ts:169`), and so does a
  Project attempt (`project-processing-service.ts:482`). Nothing extends it when a result becomes
  ready.
- Expiry pops the min-heap (`video-job-service.ts:834`, after the due check at `:833`; the heap is
  keyed on `expiresAtMs`, `:649`, `:667-668`), aborts provider work (`:807`), sets
  `job_expired` with resubmit copy (`:811`), writes the trace fire-and-forget (`:813`), requests
  cleanup without deleting the record (`:814`) and keeps a tombstone bounded at 500 (`:816`,
  `:118`). `content()` expires inline and answers 410 once the deadline has passed (`:1311`). The
  heap skips jobs whose admissions are closed (`:685`).
- Three documents anchor the deadline at acceptance: `docs/PRIVACY_AND_TEMPORARY_DATA.md:238-239`,
  `docs/ARCHITECTURE.md:895` and `12-existing-video-processing.md:246-247`. The code anchors it at
  creation. `accepted_at` is a separate nullable column
  (`apps/api/src/infrastructure/database/schema.ts:455`), derived at write time from the first
  trace that carries a provider job id (`processing-job-repository.ts:57`, kept by coalesce at
  `:137`).

### 1.4 What is durable, what is memory, and what a restart keeps

- Everything operational is process memory: the job map (`video-job-service.ts:241`), the owner
  index (`:242`), the deadline heap (`:243`), the tracked operations (`:251`) and the per-job trace
  chains (`:252`). Poll state lives only on the record (`:83-86`: read failures, poll attempt,
  next poll time, polled flag; the retrieval counter at `:87` and the in-flight refresh at `:88`
  are the rest of the transient per-record state). The durable shape
  (`file-processing-job-repository.ts:42-57`) carries none of it and restore zeroes all six
  (`video-job-service.ts:334-339`). The temporary root is
  `.tmp/video-jobs` under the data directory (`:285`) and is deleted on every construction
  (`:286`), so a restart destroys every undelivered result byte.
- Only a trace is persisted: a schema version (`file-processing-job-repository.ts:14`), identity
  (`:15-18`), provider job id (`:19`), request fingerprint (`:20-24`), output resolution (`:25`),
  provider output location (`:26`), source duration and orientation (`:27-28`), one of the ten wire
  statuses (`:29`; the ten at `packages/contracts/src/video-jobs.ts:33-44`), a safe error code
  (`:30`) and three timestamps (`:31-33`; strict at `:35`).
  The service derives it from the record (`video-job-service.ts:587-609`): the safe error code
  (`:604`) and `completedAt = updatedAt` when terminal (`:607`). No video row carries a cost; the
  only persisted cost in the API is `providerUsage.cost` on reference-image asset metadata
  (`apps/api/src/features/reference-images/reference-image-service.ts:529`).
- Trace writes are chained per job (`:627-628`) and, unless required, warn-only (`:631`, `:640`).
  `#trace` returns immediately when no writer is configured (`:625`), which is the case in test
  mode without a Project repository (`apps/api/src/app.ts:324-326`). Only four transitions await
  their write: `submitting` (`:1058`), the first trace carrying a provider id (`:1113`), the
  Project-linked pre-submission trace (`:1026`) and `cancelled` (`:1391`). `ready` (`:1191`),
  `expired` (`:813`), every `failed` (`:1080`, `:1152`, `:1206`, `:1245`, `:1280`) and the
  post-acceptance ambiguity (`:1122`) are `void`.
- The durable repository exposes only `admit`, `upsert` and `listResumable`
  (`file-processing-job-repository.ts:39`, `:62-64`). There is no read by owner and no read by id.
  Every HTTP read is served from the in-memory map (`video-job-service.ts:1292`), and a job absent
  from it is 404 even when its trace exists (`:1293-1294`).
- Restore runs once, in the constructor (`:289`, `:296`), and rebuilds only `queued`, `processing`
  and `retrieving` rows (`file-processing-job-repository.ts:49`), with the result dropped
  (`video-job-service.ts:325`) and poll counters zeroed (`:335`). `listResumable` mutates rows on
  the way: it expires overdue rows (`file-processing-job-repository.ts:176`;
  `processing-job-repository.ts:149`), demotes `ready` to `retrieving` so the result is
  re-downloaded (`file-processing-job-repository.ts:189`; `processing-job-repository.ts:216`),
  marks provider-less `submitting` rows `ambiguous` (`file-processing-job-repository.ts:199`;
  `processing-job-repository.ts:174`) and fails `validating` rows
  (`file-processing-job-repository.ts:209`; `processing-job-repository.ts:238`). The Postgres
  writer demotes only the newest ready row per owner because of the one-active index
  (`processing-job-repository.ts:187-188`, `:216`; the index at `schema.ts:475-478`).
- The table already carries what a lease would need, and nothing uses the lease columns:
  `lease_owner` and `lease_expires_at` (`schema.ts:452-453`) with `processing_jobs_lease_idx`
  (`:463`). The neighbouring `attempt` (`:454`) and `retry_of_job_id` (`:451`) are not lease
  scaffolding; they are Project retry lineage. Project admission inserts
  `attempt: input.attempt.attemptNumber`
  (`apps/api/src/infrastructure/database/project-repository.ts:2499`; 1 for a fresh attempt,
  `:2450`, previous plus one for a retry, `:2446`, computed at
  `project-processing-service.ts:467`) and `retryOfJobId: input.attempt.retryOfOperationId`
  (`:2496`); the aggregate mapper reads both back (`:197-198`) and rejects `job.attempt < 1`
  (`:178`); the current-attempt lookup orders by `attempt` (`:630`); retry lineage is queried at
  `:2599`, `:2660` and `:2667`; the column carries an index and a same-owner foreign key
  (`schema.ts:465-470`; added by `apps/api/drizzle/0019_tearful_microchip.sql:3`, `:6`, `:8`).
  Only the standalone writer inserts `attempt: 0` (`processing-job-repository.ts:56`). Both INSERT
  paths null the leases (`processing-job-repository.ts:54-55`; `project-repository.ts:2497-2498`)
  and neither UPDATE path names a lease column (`processing-job-repository.ts:125-140`;
  `project-repository.ts:2732-2745`). An `outbox` table exists with no writer or consumer
  (`schema.ts:1237`, `:1253`).
- The Postgres status enum has twelve values including `pending` and `accepted`
  (`schema.ts:50-63`); the wire enum has ten and neither of those
  (`packages/contracts/src/video-jobs.ts:33-44`); restore maps `accepted` back to `queued`
  (`processing-job-repository.ts:284`). The domain model lists a `delivered` lifecycle state
  (`docs/product/DOMAIN_MODEL.md:87-88`) that no enum contains.

### 1.5 Project-linked jobs: admission, reconcile, retention

- `ProjectProcessingService.submit` serializes on a process-local `KeyedLock`
  (`project-processing-service.ts:161`), CAS-checks the Project (`:354`), refuses a fresh submit
  while the head has a current attempt (`:357`), asks `VideoJobService` for the owner's active job
  (`:364`), gates retries by the domain policy (`:382`) and requires the duplicate-cost
  acknowledgement for an ambiguous retry (`:386`, `:390`; the wire default at
  `packages/contracts/src/project-processing.ts:152`). A retry is `submit` with
  `retryOfOperationId` (`:793`), so a retry is always a new operation id.
- Admission writes a `submitting` attempt with a preallocated `resultAssetId` (`:463`; the reason
  at `apps/api/src/features/projects/project-processing-repository.ts:47-48`) and the link
  (`:492`); an `active-attempt` conflict is 409 (`:502-505`). Only then is the job handed to
  `startPrelinked` (`:513`), which writes a required trace (`video-job-service.ts:1026`), marks the
  job `ambiguous` without any provider contact if that write fails (`:1033`) and otherwise submits
  (`:1037`). If `startPrelinked` throws, the service writes a `failed` trace directly through
  `updateProjectAttemptTrace` (`project-processing-service.ts:526`, `:538`), a write path outside
  `VideoJobService`.
- Progress returns through `ProjectAwareProcessingJobRepository.upsert`, which tries the Project
  authority first and falls back to the standalone store
  (`apps/api/src/features/processing-jobs/project-aware-processing-job-repository.ts:26-28`); a
  shadow mirror is warn-only (`:31-32`). Both Project repositories reject a trace that changes
  identity (`apps/api/src/features/projects/file-project-repository.ts:1021-1022`;
  `project-repository.ts:2724-2727`) and keep the first `acceptedAt`
  (`file-project-repository.ts:1025`; `project-repository.ts:2739-2742`).
- Retention is private. `#retainResult` (`project-processing-service.ts:644`) is reached only
  through `#reconcile` (`:603`), under a per-owner-and-operation lock (`:608`), and `#reconcile` is
  reached from `current()` (`:573-576`), which reconciles only the head revision's attempt, and
  from `reconcile()` (`:588`). It is idempotent because a second entrant finds the bytes already in
  the store (`:612-613`). It takes a content lease from the temporary job (`:652`), stores the file
  under `resultAssetId` (`:654`), promotes through `promoteProjectJobResult` with
  `operationIsCurrent` (`:685`), refuses with 409 if the Project moved mid-retention (`:693`),
  always links the asset as `job-output` (`:752`) and settles the lease as delivered only after
  the repository committed (`:773`). The domain answers `stale` when the operation is no longer
  current or the head moved (`packages/domain/src/projects/rules.ts:1618-1622`).
- Restart recovery is Project-first, then standalone de-duplicated by id
  (`project-aware-processing-job-repository.ts:42-45`), applying
  `projectProcessingRestartTransition` (`packages/domain/src/video-processing/rules.ts:111`;
  callers `file-project-repository.ts:1083` and `project-repository.ts:2812`, groups at
  `:2837-2841`). The rule never touches an attempt with retained bytes or an `ambiguous` one
  (`rules.ts:117`), re-drives a provider-bearing `ready` row to `retrieving` (`:143`) and marks a
  provider-less `submitting` or `accepted` row `ambiguous` (`:131`). Only accepted, queued,
  processing or retrieving attempts (`project-processing-repository.ts:204-207`) with a provider id
  (`:203`), a future expiry (`:201`) and a capability other than `voice` (`:202`) are resumable
  (the guard spans `:200-210` inside `resumableProjectProcessingAttempt`, `:196`). "Project-linked
  first" has no runtime meaning today beyond that restart ordering.

### 1.6 Where paid work is bounded

- `provider.submit` has one call site (`video-job-service.ts:1095`), inside `#submitProvider`,
  reached from `#submit` (`:1070`) and `startPrelinked` (`:1037`). Acceptance is the provider job
  id being retained (`:1110`) and the required trace succeeding (`:1113`); if that write fails the
  id is discarded and the job is `ambiguous` (`:1115`, `:1122`). A submission error of unknown
  acceptance (`:234-236`) is also `ambiguous`, with "Do not retry automatically" (`:1132-1138`).
  `ambiguous` is terminal (`:112`). The Project retry policy for it is explicit cost confirmation
  (`packages/domain/src/video-processing/rules.ts:58`); failed, expired and cancelled are explicit
  (`:59`). Only `timeout` and `upstream` provider errors are retryable
  (`apps/api/src/providers/video-jobs/video-job-provider.ts:49`), and only for status reads
  (`video-job-service.ts:1267`) and downloads (`:1197`). Provider cancellation is never supported
  (`:450`).
- The rule is written down four times: `CLAUDE.md:95-96`, `AGENTS.md:85`,
  `docs/product/DOMAIN_MODEL.md:217-218` and `docs/product/PRODUCT_VISION.md:96`. The audit lists
  the `ambiguous` reconciliation among the things to protect
  (`docs/audits/CURRENT_STATE_AUDIT.md:327`).

### 1.7 One process, one data directory: prov-7 today

- The only fixed-interval background work in the API is the direct-upload cleanup interval
  (`apps/api/src/features/saved-videos/direct-upload-service.ts:80-83`; ten minutes at `:23`). The
  other two timers are different in kind: a per-request 50 ms socket-closed poll in the runtime
  (`apps/api/src/application/application-runtime.ts:500-506`, cleared on close), and the video-job
  service's deadline-driven `setTimeout` (`video-job-service.ts:153`), re-armed by
  `#scheduleNextDeadline` (`:841`) after every mutation (`:357`, `:500`, `:756`, `:838`, `:1354`,
  `:1372`, `:1401`) to run `#expireDueJobs` (`:851`); that one is already scheduled server work on
  the job model, and the tick joins it rather than replacing it. The cleanup interval is unref'd
  (`:83`), swallows every failure (`:81`) and is closed with one final pass (`:484-485`). It exists
  only when relational persistence supplies R2 uploads
  (`app.ts:430-434`; `apps/api/src/infrastructure/persistence-factory.ts:144`). Its repository
  claim is the one multi-instance-safe pattern in the codebase: a transaction with
  `FOR UPDATE SKIP LOCKED` and a bounded page
  (`apps/api/src/infrastructure/database/direct-upload-repository.ts:202`, `:216`).
- Every lock is process-local. `KeyedLock` is a map of promise chains
  (`apps/api/src/application/keyed-lock.ts:3`), shared between the file Saved Video and Project
  repositories (`app.ts:301`; `persistence-factory.ts:34`). File-mode durability is an exclusive
  temp create plus rename (`file-processing-job-repository.ts:146`, `:153`), not a cross-process
  mutex. The temp root wipe (`video-job-service.ts:286`) means two processes on one data directory
  already destroy each other's job files.
- In Postgres the one cross-instance rule is the partial unique index on active status per owner
  (`schema.ts:475-478`). The global and per-provider caps are computed from the in-memory map
  (`video-job-service.ts:455`; defaults 8 and 4 at `apps/api/src/config/environment.ts:33-34`).
  Every instance restores every resumable row into its own memory (`:296`). The canon calls the
  design single-operator (`docs/ARCHITECTURE.md:4`) with no supported public deployment
  (`:1010-1011`) and no general durable worker queue (`:973-974`); D9 recommends recording
  "local-first, single-operator" as the standing decision (`docs/DECISIONS_REQUIRED.md:116`).
- Shutdown order is direct uploads, then `videoJobService.close()`, then persistence
  (`app.ts:503-506`). Close cancels the deadline timer (`video-job-service.ts:1411`), waits for
  tracked operations (`:1419`) and removes the temp root (`:1422`). Logging is pino on the runtime
  (`apps/api/src/application/application-runtime.ts:514`, `:546`) with a per-request child
  (`:736`); `createApp` enables it unless `nodeEnv` is `test` (`app.ts:158`) and uses it directly
  for provider lifecycle events (`:254`). Services have no logger seam and use `console.warn` with
  ids only (`video-job-service.ts:631`, `:1146`). The service's own test seams are `now` and
  `scheduleDeadline` (`:41`, `:47`; defaults at `:270`, `:273`).

### 1.8 What the Account panel shows, and what a ledger starts from

- The panel is read-only. It renders the in-memory session's plan
  (`apps/web/src/features/account/AccountPanel.tsx:151`), entitlement booleans (`:169-171`),
  `monthlyCredits` as "Not metered" when null (`:192-194`), the deployment-wide integration rows
  (`:203`) and one open-gated active-jobs query (`:58-62`) whose count feeds the AI activity
  section (`:213-223`). Its own copy says no lifetime total exists (`:224-227`). The domain
  hard-codes `monthlyCredits: null` (`packages/domain/src/accounts/rules.ts:15`) and types account
  usage as null (`packages/domain/src/accounts/types.ts:22-23`); the wire limit is nullable
  (`packages/contracts/src/auth.ts:43`). Entitlements are a fixed phase-one snapshot
  (`apps/api/src/features/auth/auth-service.ts:42`), fetched once and never refreshed while held
  (`apps/web/src/application/auth/AuthProvider.tsx:114`).
- No route returns the account itself (plan, entitlements, usage) beyond `GET /api/auth/me`
  (`apps/api/src/route-inventory.test.ts:17`; `apps/api/src/features/auth/routes.ts:67-75` returns
  `user`, `entitlements` and `expiresAt`). Several reads are scoped to the session subject
  (campaigns `:21`, projects `:28`, videos `:57`, the creative library `:88`), but the only
  per-account job read is the active queue (`:49`) and completed history exists only per Project
  (`:46`). `/api/capabilities` takes no
  request (`apps/api/src/features/system/routes.ts:63`). The active-jobs query key is per owner
  (`apps/web/src/adapters/api-client/videoJobsApi.ts:121-122`) and the queue lists only
  non-terminal jobs (`video-job-service.ts:532`), so a retained result would not appear in it.
- A grep for `ai-usage`, `aiUsage`, `ai_usage`, `usageLedger` and `usage_ledger` over
  `apps/api/src`, `packages/*/src`, `apps/web/src` and `apps/api/drizzle` returns nothing. The
  nearest data is `processing_jobs` (`schema.ts:426-427`), indexed by owner, status and creation
  time (`:462`), written by the Drizzle trace writer (`processing-job-repository.ts:119`) and, in
  local and shadow mode, by the file repository under `metadata/v1/processing-jobs`
  (`file-processing-job-repository.ts:74`). The relational writer excludes Project-linked rows
  outside shadow (`persistence-factory.ts:104-105`; the scope at
  `processing-job-repository.ts:72-73`).
- The exactly-once precedent is `project_output_operation_receipts`, keyed
  `(owner_user_id, operation_id)` (`schema.ts:1204`, `:1223`). The keep-the-first-write precedent
  is `accepted_at` (`processing-job-repository.ts:137`).

### 1.9 What the canon asks, and what does not change

- The roadmap names three things to build: a server-side progression tick for accepted jobs, results
  retained past first download until TTL, and a per-account AI usage ledger of submissions,
  provider, outcome and duration surfaced in Account (`docs/roadmap/PRODUCT_ROADMAP.md:92-94`),
  against the problem at `:82-83`. The ledger is a new table under expand-only migrations, each
  with its own verification prompt (`:101-103`); it holds counts and outcomes, never prompts or
  media (`:106`), and makes no pricing claims (`:119`). Acceptance: a submitted swap completes and
  is retrievable after closing the browser, and Account answers "what did AI run this month"
  (`:109-112`). Tests: API tests for ledger and retention (`:114`). Observability: tick metrics in
  logs, the ledger as the cost surface (`:116`). Phase 2's gate is D4, D10 and D11 (`:120`); D8 is
  a Phase 4 revisit (`:193`) and the terminal-job sweep is Phase 5 (`:205`).
- Prompt 20 names the code to inspect and the design to produce
  (`docs/roadmap/IMPLEMENTATION_PROMPTS.md:249-256`). Prompt 21 requires the table in both
  persistence modes and a single-instance-safe tick per prov-7 (`:258-261`). Prompt 22 requires a
  result retrievable within TTL after closing the client, ledger rows exactly once per submission
  under tick-plus-poll races, and an explicit audit of the tick against the cost rules
  (`:263-266`). No B prompt runs before its A plan is approved (`:6-7`); code is the only
  current-state authority (`:17-18`).
- The target architecture describes the job pattern as admission, lease, poll, reconcile and
  retained results with an in-memory service and a schema-level one-active guard
  (`docs/architecture/TARGET_ARCHITECTURE.md:130-132`). It wants every job explicitly started,
  cost-labeled, reconcilable and abandonable (`:133-136`), says the browser never learns provider
  identities as choices and names the ledger as submissions, provider and outcome (`:142-146`),
  and wants job metrics plus the ledger as the cost surface (`:163-165`; `:160-162` is the
  current-state paragraph). It also says the outputs of every AI path, standalone included, must
  land durably rather than session-only (`:143-144`), which this slice meets for Project results
  and not for standalone ones (Q4). The domain model deprecates provider names as user-facing
  choices (`docs/product/DOMAIN_MODEL.md:206`), lists the transformation kinds as character swap,
  virtual try-on and voice treatment (`:86`), says every surface uses its vocabulary (`:3-4`),
  derives
  ownership from the session subject only (`:210`), never deletes retained bytes (`:213`) and
  forbids automatic paid retry (`:217-218`). The target flows say the operator may leave and
  return while work runs (`docs/product/TARGET_USER_FLOWS.md:116`) and that results are retained
  server-side (`:118`).
- D5 records standalone AI results as ephemeral with a one-hour TTL
  (`docs/DECISIONS_REQUIRED.md:66-70`). D8 keeps the one-active guard until Phase 4 (`:99-106`).
  D14 defers the terminal-job retention horizon to Phase 5 (`:158-166`). The audit register places
  prov-2 in Phase 2 (`docs/audits/CURRENT_STATE_AUDIT.md:369`) but prov-1, prov-6 and ev-3 in
  Phase 4 (`:370`), while the roadmap cites prov-6 in slice 2.5 (`PRODUCT_ROADMAP.md:94`). The
  audit's "no unload guard" (`CURRENT_STATE_AUDIT.md:120`) is stale: the guard exists
  (`apps/web/src/studio/StudioExitGuard.tsx:262`, `:273`) and the feature contract says so
  (`12-existing-video-processing.md:202`). The audit's evidence was taken at commit `ddf4ec9d`
  (`CURRENT_STATE_AUDIT.md:394`).
- Docs that contradict the code today and are corrected in this slice: the acceptance-anchored
  deadline (§1.3); "the server hands the bytes over once and retains nothing"
  (`12-existing-video-processing.md:200-201`, true today and false after §3); "API restart does
  not recover it" (`:241`, stale for the server since restore exists at
  `video-job-service.ts:294`); `docs/user-flows/projects.md:440` says the controller polls
  `/processing/current` when its timer calls `/reconcile`, and `:441` cites `rules.ts:1262-1308`
  for `promoteProjectJobResult`, which starts at `packages/domain/src/projects/rules.ts:1606`;
  `docs/CLOUD_PERSISTENCE.md:150-152` places "Limits are set by" beside the cross-instance claim
  although the caps are per process (§1.7).
- Unchanged by this slice: every existing wire shape (the standalone PUT and the Project submit
  gain one new cause for the existing `provider_unavailable` code,
  `packages/contracts/src/video-jobs.ts:62`, the way a trace-store failure already reuses it at
  `video-job-service.ts:1060-1063`; the feature contract records the new cause, §3); the
  one-active-per-owner guard (D8); `VIDEO_JOB_TTL_MS` and its anchor (Q5); the Project retention
  policy and `job-output` links; the Project restart transitions; the browser polling cadences; the
  queue contract; the standalone submit, release and abandon routes; the synchronous image and
  voice provider calls, which have no job id (`TARGET_ARCHITECTURE.md:30`). The browser polling
  cadences stay because they answer a different question from the tick: the standalone poll
  (`videoJobStatusQuery.ts:5`) and the Project reconcile timer
  (`useProjectProcessingController.ts:615`) exist to update the screen in front of an operator,
  while the tick exists to move a job when no screen is open. Both drive the same coalesced
  `#refresh` (`video-job-service.ts:1222`) and the same locked `reconcile`
  (`project-processing-service.ts:608`), so keeping both adds no second provider read; removing
  the client drivers would leave an open screen waiting up to one interval for its own result.

## 2. Affected components, services, APIs, tables and tests

| Layer                | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain               | New `packages/domain/src/ai-usage/{types,rules,index}.ts` exported beside `packages/domain/src/index.ts:15`: `AI_USAGE_OUTCOMES`, `aiUsageOutcomeForJobStatus`, `applyAiUsageTransition`, `aiUsageDurationMs`; tests beside them. `video-processing` unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Contracts            | New `packages/contracts/src/ai-usage.ts` exported beside `packages/contracts/src/index.ts:14` (outcome enum as a literal list, entry, query with a required `since`, the maximum window, response, page size); tests; `apps/api/src/shared-contract-parity.test.ts` (three-way parity row beside `:115-116`, non-pairs note at `:144`). `video-jobs.ts` and `project-processing.ts` unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| API, video jobs      | `features/video-jobs/video-job-service.ts` (`projectId` and `ledgerOpened` on the record, `progressDueJobs`, the two ledger write points, the `#settleDelivery` branch, restore); new `features/video-jobs/video-job-progression.ts` (the tick runner); `routes.ts` unchanged. Tests: `video-job-service.test.ts`, `routes.test.ts`, new `video-job-progression.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| API, AI usage (new)  | `features/ai-usage/ai-usage-ledger-repository.ts` (the owner-scoped reader port the route receives, and the full port with `record` and `listOpen` that only the service and the reconciler receive), `file-ai-usage-ledger-repository.ts` (with an optional best-effort shadow writer), `ai-usage-reconciler.ts` (the third ledger writer, batched by owner), `routes.ts` (`GET /api/account/ai-usage`); `infrastructure/database/ai-usage-ledger-repository.ts` (Drizzle, applies the domain transition under a row lock). Tests beside each; the route in `apps/api/src/route-inventory.test.ts:14` (`alwaysRegisteredRoutes`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| API, processing jobs | `features/processing-jobs/file-processing-job-repository.ts` (`projectId` on `ResumableVideoProcessingJob`, `findOutcomes`), `project-aware-processing-job-repository.ts` (`findOutcomes` routed Project-first), `infrastructure/database/processing-job-repository.ts` (`findOutcomes`, `projectId: null`); `features/projects/project-processing-repository.ts` (`findProjectAttemptOutcomes`, `projectId` on the resumable record), `file-project-repository.ts` and `infrastructure/database/project-repository.ts` (the new read); `project-processing-service.ts` (passes `projectId` to `startPrelinked`; a public `retainResult` when Q3 keeps the retain-only default). Tests: `file-processing-job-repository.test.ts`, `project-aware-processing-job-repository.test.ts`, `repositories.test.ts`, `file-project-repository.test.ts`, `project-processing-routes.test.ts`.                                                                                                                                                                                                                                                                             |
| Storage, Postgres    | `infrastructure/database/schema.ts` (`ai_usage_outcome` enum, `ai_usage_ledger` table), generated `drizzle/0025_*.sql` and `meta`; new `ai-usage-ledger.postgres.integration.test.ts` behind the existing gate; `.github/workflows/quality.yml:159-162` gains the file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Storage, file        | `metadata/v1/ai-usage/<ownerUserId>.json`, a per-owner journal written by `FileAiUsageLedgerRepository`; no library version changes; the trace schema at `file-processing-job-repository.ts:35` unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Config and wiring    | `config/environment.ts` (`VIDEO_JOB_PROGRESSION_INTERVAL_MS`, a non-negative integer schema, the `RuntimeConfig` field and mapping), `.env.example:45-46`, `test/fakes.ts:39-40` (`videoJobProgressionIntervalMs: 0`); `app.ts` (a new `aiUsageLedger?` member on `AppPersistenceDependencies`, the file ledger fallback, `usageLedger` into `VideoJobService`, the reconciler, the tick, the route, the close hook; none of these exist in `app.ts` today); `infrastructure/persistence-factory.ts` (the Drizzle ledger in the relational bag and as a best-effort shadow writer in shadow mode).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Web                  | New `adapters/api-client/aiUsageApi.ts`; new `features/account/AiUsageSection.tsx` mounted in `AccountPanel.tsx:213-227`, built against the UI checklist (`IMPLEMENTATION_PROMPTS.md:44-49`: loading, empty, error, populated and paging states, each with a control); `AccountMenu.test.tsx` and every test that opens the panel (the new msw stub). No route, path or navigation change, so `apps/web/src/app/route-inventory.test.ts` and `paths.test.ts` are untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Docs                 | This plan; `DECISIONS_REQUIRED.md` (the answers to §5 including the Q1 decision under D9 and the Q4 exception, and a note under D5 and D14); `DOMAIN_MODEL.md` (terms "AI usage ledger" and "progression tick"; the outcome vocabulary `succeeded` defined as "reached `ready`", `failed`, `ambiguous`, `expired`, `cancelled`; the wire field `operation` as the name of a transformation kind on the video-job contracts; the `delivered` state at `:87-88` recorded as unpersisted; the provider-as-fact note under `:206` if Q2 is yes); `PRIVACY_AND_TEMPORARY_DATA.md:238-244`; `ARCHITECTURE.md:895-900` and `:973-974`; `12-existing-video-processing.md:200-203`, `:241-244`, `:246-248`, `:256-257` and the new `provider_unavailable` cause; `14-login-and-session.md:26-30`; `user-flows/projects.md:440-441`; `CLOUD_PERSISTENCE.md` (the 0025 bullet beside `:113`, the `:150-152` wording, a shadow-mode ledger note beside the trace row at `:182` and the rehearsal step at `:272`); `CURRENT_STATE_AUDIT.md:119-122`, `:369-370`, `:380`; `PRODUCT_ROADMAP.md` slice status and the Project-only reading of the acceptance line at `:110-111`. |

## 3. Step-by-step implementation plan with the order of changes

### The model: what the slice adds and what it deliberately leaves alone

These are the decisions the rest of §3 rests on. Each is a routine call made the way the nearest
existing code makes it; the ones that could go the other way are in §5.

1. **The deadline stays anchored at creation.** The code is the authority
   (`video-job-service.ts:466`; `processing-job-repository.ts:59`;
   `file-processing-job-repository.ts:169`; `project-processing-service.ts:482`). The three
   documents that say `acceptedAt` are corrected. D14's retention horizon is not pre-empted (Q5).
2. **prov-7 is a gate, not an assumption.** Prompt 21's checklist line reads "tick must be
   single-instance-safe per prov-7" (`docs/roadmap/IMPLEMENTATION_PROMPTS.md:259-260`). This plan
   reads it as: safe within the single instance the canon supports (`docs/ARCHITECTURE.md:4`,
   `:1010-1011`), with the in-process guards named under "Single-instance safety" below, and with
   the cross-process case decided explicitly in Q1 and written under D9
   (`docs/DECISIONS_REQUIRED.md:116`) before prompt 21 starts. A minimal relational guard is
   designed there so that either answer is implementable; it is not built unless Q1 says
   "enforce".
3. **The ledger covers video jobs only.** A submission is one `VideoJobService` job id, which is
   also the Project operation id. Image and voice transformations have no job id and are named as
   absent in the panel copy, which is scoped to video (Q6).
4. **No row, no spend.** The ledger row is opened after the required `submitting` trace and before
   `provider.submit`. If the ledger store fails, the job fails as `provider_unavailable` on both
   paths and nothing is submitted; the client sees an accepted job that reads `failed`, never a
   503, because `start()` tracks `#submit` and returns the snapshot (`video-job-service.ts:951-952`)
   and `startPrelinked` does the same (`:1037-1038`). The `failed` trace on that path is required
   (awaited), so while the process lives the job is never `ambiguous`. Across a crash inside that
   window the durable row can still be a provider-less `submitting` row, which restart labels
   `ambiguous` (`processing-job-repository.ts:174-182`;
   `packages/domain/src/video-processing/rules.ts:127-131`); that is the existing cost-conservative
   rule and the reconciler closes the ledger row from it.
5. **Three ledger writers, one rule.** Point 1 opens, Point 2 closes, and the reconciler closes
   rows the repositories transitioned without the service. The reconciler is read-only toward
   `processing_jobs` and a writer toward the ledger, so prompt 22 counts three writers. No per-poll
   writes, so the tick adds nothing to the 4-connection pool per poll
   (`apps/api/src/infrastructure/database/client.ts:20`).
6. **A null outcome means open, and the first terminal outcome wins.** The rule has one owner,
   `applyAiUsageTransition` in the domain; both repositories apply it, the Drizzle one under a row
   lock. `succeeded` means the job reached `ready` (`video-job-service.ts:1191`): the server holds
   the inspected bytes. Delivery is not recorded, because no enum holds `delivered` (§1.4), so a
   result that reaches `ready`, is never downloaded and expires at TTL is still `succeeded`. A
   delivered result that later expires or is abandoned stays `succeeded` for the same reason.
7. **Standalone results are retained in `.tmp`, not in the byte store.** `mediaPersistence:
'browser-only'` (`app.ts:470-474`) stays true for durable media; moving standalone results into
   Projects is Phase 4 (`CURRENT_STATE_AUDIT.md:370`).
8. **The tick retains Project results; promotion is gated by Q3.** The roadmap asks to "retain
   results" (`PRODUCT_ROADMAP.md:92-93`), and adopting a result as the current cut with nobody
   present is a user-flow change (`CLAUDE.md:71-72`; `DOMAIN_MODEL.md:90-91` says outputs "can be
   adopted"). The default, absent an explicit Q3 approval, is retain-only: the bytes land in the
   owner byte store under `resultAssetId` (the store step at
   `project-processing-service.ts:649-663`) and the attempt stays `ready` with `outputAssetId`
   null, the domain phase `saving-result` (`rules.ts:45`), until the operator's next visit runs the
   unchanged `#reconcile` (`:611-616`), which promotes exactly as today. If Q3 approves promotion,
   Step 2 calls `reconcile` instead.
9. **Provider is on the wire as a bounded string fact and muted in the panel, if Q2 says yes.**
   The canon deprecates provider names only as choices (`DOMAIN_MODEL.md:206`), and the queue
   contract already sends the field as a bounded string, not an enum
   (`packages/contracts/src/video-jobs.ts:199`; `video-job-service.ts:540`; the record field is
   `readonly providerId: string`, `:62`). Q2 is a gate because the exception must be written at
   `DOMAIN_MODEL.md:206` before prompt 21 (Q2).
10. **No backfill.** The ledger starts empty at deploy; a job in flight at deploy gets a row at its
    terminal write with `submittedAt = createdAt`.
11. **No `project_id`, `expires_at` or `accepted_at` on the ledger** (the roadmap's scope-creep
    risk, `PRODUCT_ROADMAP.md:119`). Window counts are served by the route from an index, not
    derived from the first page in the browser.
12. **The interval is an environment variable** with a `fakes.ts` default of `0`, not a new
    `AppDependencies` seam. The scheduler and clock are injected into the runner for unit tests.
13. **Docs are corrected in the same slice** (§2, Docs row).
14. **"Accepted jobs" means `queued` or `processing` with a provider job id.** The prompt says
    "poll + retrieve for accepted jobs" (`IMPLEMENTATION_PROMPTS.md:253-254`) and the domain
    lifecycle lists `accepted` (`DOMAIN_MODEL.md:87`), but the wire enum has no such status
    (`packages/contracts/src/video-jobs.ts:33-44`); only the stored enum does (`schema.ts:50-63`)
    and restore maps it back to `queued` (`processing-job-repository.ts:284`). Prompt 22 verifies
    the tick against `queued` and `processing`.
15. **New copy uses the domain vocabulary.** The unit is a transformation
    (`DOMAIN_MODEL.md:84-86`), `ambiguous` is shown as "acceptance unknown" (`:88`), `cancelled` as
    "Cancelled". The pre-existing "run" wording on screen (`AccountPanel.tsx:225`;
    `projectProcessingPresentation.ts:72`) is drift outside this slice and is not changed; the
    Project surface's "Submission needs attention" (`projectProcessingPresentation.ts:63`) is not
    changed either. "Deliverables" is deprecated in docs too (`DOMAIN_MODEL.md:198`, `:205`) and
    does not appear in this plan.

### The progression tick

**Where it runs.** Two pieces, split at the ownership boundary.

- `VideoJobService.progressDueJobs({ maxProviderPolls })`, a new public method on the service that
  already owns the job map (`video-job-service.ts:241`), the bindings (`:63`) and the poll cursor
  (`:85`). It awaits readiness, runs `#expireDueJobs` (`:828`), then selects every record for
  which `#ownsMutableJob` holds (`:694-703`), whose status is `queued` or `processing` (the only
  statuses `#refresh` polls, `:1215-1217`) and whose next poll is due
  (`!job.hasPolledProvider || now >= job.nextProviderPollAtMs`, the gate at `:1221`). It sorts
  Project-linked records first, then by earliest `nextProviderPollAtMs`, takes `maxProviderPolls`,
  and runs `Promise.allSettled` over `#refresh` (`:1211`) for the batch. It returns
  `{ polled, retrievalsStarted, readyProjectLinked }`, where `readyProjectLinked` lists records with
  `status === 'ready'`, a non-null `projectId`, open admissions and no active delivery, capped at
  `maxProviderPolls`.
- `VideoJobProgressionTick` in a new `apps/api/src/features/video-jobs/video-job-progression.ts`
  owns the interval and composes `VideoJobService`, `ProjectProcessingService` and the ledger
  reconciler. It needs the Project service because retention is private
  (`project-processing-service.ts:644`, reached only through `:603` and `:608`). Options are
  `{ videoJobs, projectProcessing?, reconciler, intervalMs, maxProviderPolls, schedule?, now?, log }`.
  `schedule` and `now` are injected the way the service injects its clock
  (`video-job-service.ts:41`, `:47`), so unit tests drive ticks by hand. The default is the
  direct-upload pattern: an unref'd `setInterval` cleared on close
  (`direct-upload-service.ts:80-83`, `:484`). Public `run()` and `close()`.

**Wiring.** Constructed in `app.ts` after `projectProcessingService` (`:420-429`), only when
`videoJobService.available` (`video-job-service.ts:382-386`) and the interval is greater than zero.
No provider means no timer. Its logger is `app.log.child({ component: 'video-job-progression' })`
(`application-runtime.ts:514`, child usage at `:736`; the `app.log` precedent at `app.ts:254`). It
is closed first in the existing hook (`app.ts:503`), before `videoJobService.close()` (`:505`). The
reconciler is not tied to the tick's existence: it is constructed whenever a ledger and
`durableProcessingJobs` (`app.ts:339`) both exist, runs one bounded pass at startup after
`videoJobService` restore has settled (through a new `ready()` accessor over the promise every
public method already awaits, `:512`), and is
then driven by the runner on the cadence below. With `VIDEO_JOB_PROGRESSION_INTERVAL_MS=0` only
the startup pass runs, so crash-orphaned rows close at the next boot rather than never. When
`durableProcessingJobs` is `undefined` (test mode without a Project repository,
`app.ts:322-326`, `:339`) the reconciler is not constructed at all: open rows in that mode close
only through Point 2, and nothing marks them `ambiguous`.

**Schedule.** `VIDEO_JOB_PROGRESSION_INTERVAL_MS`, default `5_000`, `0` disables. It is added to
`environment.ts` beside `VIDEO_JOB_MAX_ACTIVE` (`:181`) with a new non-negative integer schema,
because the existing helper rejects zero (`:80`); a `RuntimeConfig` field beside `:456`; the
mapping beside `:603`; `.env.example` after `:45-46`; and `videoJobProgressionIntervalMs: 0` in
`apps/api/src/test/fakes.ts` beside `:39-40`, so no existing suite grows a timer. Five seconds
cannot outrun the per-job ladder (`video-job-service.ts:117`); it only guarantees that the read
happens without a client.

**What one `run()` does.**

- Step 0: overlap guard. If a pass is in flight, return it and count `skippedOverlap`. If the
  service is not available, return.
- Step 1: `videoJobs.progressDueJobs({ maxProviderPolls })`. Each `#refresh` is one provider status
  read (`:1233`). A `completed` answer spawns the existing tracked download (`:1250-1251`,
  `:1168`), bounded as today (`:1197`).
- Step 2, Project-linked first: `Promise.allSettled` over the `readyProjectLinked` entries, as
  Step 1 does, because the lock is per owner and operation
  (`project-processing-service.ts:608`) and four concurrent copies are what four concurrent client
  reconciles do today. Each entry calls the retain-only `projectProcessing.retainResult(ownerId,
projectId, jobId)` by default (model point 8: the store step at `:649-663` under the same lock,
  no promotion), or `projectProcessing.reconcile(ownerId, projectId, jobId)` if Q3 approves
  promotion, the path the browser timer drives today (`useProjectProcessingController.ts:615`,
  `project-processing-routes.ts:79`). Either call is serialized with any client call by the lock
  and idempotent because a second entrant sees the retained bytes (`:612-613`). A per-job error is
  logged with ids only and the job stays `ready`; the runner keeps a per-job backoff map so a
  retention that keeps failing (for example the CAS refusal at `:693`) is retried after
  `min(interval × 2^n, 5 min)` rather than every pass, cleared on success and dropped when the
  job leaves the map. Without that map a conflicting retention would re-read the attempt under the
  lock (`:608-609`) every five seconds for up to an hour.
- Step 3, on the runner's own clock: `reconciler.reconcile(now, 25)` whenever at least 60 s have
  passed since the previous pass, checked on every run. At the 5 s default that is every twelfth
  run; at any interval above 60 s it is every run. See "Write points" below.
- Step 4: one pino line, only when work happened:
  `{ polled, retrievalsStarted, retained, retentionBackoffs, ledgerReconciled, skippedOverlap, elapsedMs }`
  (`PRODUCT_ROADMAP.md:116`). Failures log `{ jobId, errorClass }`, never a provider body. The
  reconciler's failures log through the same child logger as
  `[video-job-progression] Ledger reconciliation failed.` with `{ ownerUserId, jobId, errorClass }`
  per row and `{ errorClass }` for a failed `listOpen`; the ledger failures inside
  `VideoJobService` use `console.warn` in the `:631` style, because the service has no logger seam
  (§1.7): `[video-jobs] AI usage row could not be opened.` with `{ jobId }` at Point 1 and
  `[video-jobs] AI usage row could not be closed.` with `{ jobId, status }` at Point 2. The route's
  failure path is the existing error handler (`installErrorHandling`, `app.ts:508`), which
  normalizes anything thrown to a safe error and logs every 5xx with the request id, route and
  error class (`apps/api/src/http/errors.ts:99-112`; the `internal_error` fallback at `:57`); no
  new log line is needed there.

**Bounds per tick.** At most `maxProviderPolls = videoJobMaxActivePerProvider` (default 4,
`environment.ts:34`) status reads; at most four downloads launched as a consequence; at most four
Project retentions; at most 25 ledger reconciliations; zero submissions. With the global ceiling of
eight (`:33`) two consecutive ticks cover every active job.

**Unattended provider traffic, bounded and named.** The tick drives, without a client present,
the existing automatic retries: status reads tolerate two retryable failures
(`video-job-service.ts:1267`) and downloads three attempts (`:1197`), and a restart re-downloads a
`ready` result (`:355`). Per job the status-read rate is capped by the ladder (`:117`: never more
than one read per two seconds, settling at one per ten seconds while the provider status is
unchanged, `:1257`) for at most the one-hour deadline, so the worst case is about 360 reads for
one job hour at the settled rate and about 1,800 if the provider status flapped on every read;
downloads are at most three per process lifetime of the job. The repository holds no statement
of provider billing: the adapters are plain authenticated GETs
(`apps/api/src/providers/decart/video-job-provider.ts:168`;
`apps/api/src/providers/pruna/video-replace-provider.ts:308`). This plan therefore assumes, and
prompt 22's cost audit (`IMPLEMENTATION_PROMPTS.md:265-266`) must record as an assumption rather
than a finding, that status reads and result downloads are not billed; the only billed call is
`provider.submit` (`:1095`), which the tick never reaches. AGENTS.md forbids "surprise traffic"
(`AGENTS.md:85`); the numbers above are the traffic the tick can generate, stated so it is not a
surprise.

**Ordering.** Add `readonly projectId: string | null` to `VideoJobRecord`
(`video-job-service.ts:58`). `startPrelinked` (`:955`) takes it from `ProjectProcessingService`
(`project-processing-service.ts:513`, where `input.projectId` is in scope at `:457`); `start`
(`:859`) sets `null`; restore (`:309-347`) copies it from `ResumableVideoProcessingJob`, which gains
`readonly projectId: string | null` (`file-processing-job-repository.ts:42`). The standalone
repositories fill `null` (`:228`; `processing-job-repository.ts:277`) and
`resumableProjectProcessingAttempt` fills `attempt.projectId`
(`project-processing-repository.ts:196`; the record field at `:41`). Restart already yields Project
rows first (`project-aware-processing-job-repository.ts:45`); the field carries the same preference
into each pass and gives Step 2 the id it needs.

**Single-instance safety (prov-7), both modes.** In process: one interval per tick instance,
overlap-guarded. The tick and a client poll share one provider read per job because `#refresh`
coalesces (`video-job-service.ts:1222`) and the per-job trace chain serializes transitions
(`:627`); `#retrieve` is launched once per completed poll (`:1250-1251`); reconcile is serialized
per owner and operation (`project-processing-service.ts:608`). The tick works from memory and
**must never call `listResumable`**: that method mutates rows (§1.4) and runs once at construction
(`video-job-service.ts:289`). Across processes: nothing is enforced today. The temp root is wiped
per process (`:285-286`), every lock is process-local (`keyed-lock.ts:3`), the relational
repository already anticipates a second server (`processing-job-repository.ts:219-221`) and the
canon states single-operator (`ARCHITECTURE.md:4`, `:1010-1011`). The tick changes the blast
radius of a second instance from "nothing until a client polls" to "duplicate reads and egress on
every job" (§4), which is why Q1 is a gate. The minimal guard, built only if Q1 says "enforce",
is a tick claim on the existing lease columns in the relational modes: before the tick polls or
retrieves a job it runs one `UPDATE processing_jobs SET lease_owner = <instance id>,
lease_expires_at = now + 2 × interval WHERE id = ? AND owner_user_id = ? AND (lease_owner IS NULL
OR lease_owner = <instance id> OR lease_expires_at < now)` (`schema.ts:452-453`, served by
`processing_jobs_lease_idx`, `:463`), and only a claimed job is polled or retrieved by that
instance; client `status()` polls are unchanged. The claim survives trace upserts because neither
UPDATE path names a lease column (`processing-job-repository.ts:125-140`;
`project-repository.ts:2732-2745`; the columns are nulled only in INSERT values,
`processing-job-repository.ts:54-55`, `project-repository.ts:2497-2498`) and lapses on its own.
It gates only the tick's provider reads: the standalone upsert (`processing-job-repository.ts:132`)
and `#expireJob` (`video-job-service.ts:805`) still overwrite a `ready` row exactly as today, so
this is a guard against duplicate reads, not a job lease, and a job lease stays a different slice.
File mode has no cheap guard: two processes on one data directory already destroy each other's
job files (`:286`) before any tick runs, so the only file-mode option is the data-directory lock
described under Q1, which changes behaviour for misconfigured development setups and is not built
by default.

**No paid retry.** The tick reaches only `#refresh` and `#retrieve`. `ambiguous` is terminal
(`video-job-service.ts:112`), so `#ownsMutableJob` excludes it (`:698`); the Project retry policy
stays explicit-only (`packages/domain/src/video-processing/rules.ts:58-59`). Prompt 22 asserts that
`FakeVideoProvider.submit` is called exactly once per job across N ticks, a restart and concurrent
`status()` calls, and that the tick path never reaches `listResumable`, `#submit` or
`#submitProvider`.

### Retention until TTL

**What changes.** In `#settleDelivery` (`video-job-service.ts:1344`) the delivered branch becomes
conditional on origin: `if (delivered && job.status !== 'expired' && job.projectId !== null)`
request cleanup with deletion, else flush. For a standalone job that means no `#requestCleanup`, so
admissions stay open (`:799` is not executed), the record stays in the map, `content()` keeps
admitting while the job is `ready` and unexpired (`:1326`) and the deadline heap keeps the entry,
because `#nextDeadline` skips only closed jobs (`:685`). `#flushCleanup` still completes any cleanup
a mid-stream DELETE requested (`:788`). Project-linked jobs are unchanged: their bytes are durable
by the time `#retainResult` settles (`project-processing-service.ts:654`, `:752`, `:773`), so a
second copy in `.tmp` would be waste.

**What deletes a delivered standalone result.**

1. TTL expiry: `#expireDueJobs` pops the heap (`video-job-service.ts:834`, after the due check
   at `:833`) and `#expireJob` marks
   the trace expired (`:813`), requests cleanup (`:814`, which removes the directory at `:771`) and
   keeps the bounded tombstone (`:816`). This is the operative bound, because the browser sends no
   DELETE after a successful download (§1.2).
2. Explicit `DELETE /api/video-jobs/:jobId` (`routes.ts:131-137`, `video-job-service.ts:1357`,
   `:1371`) and abandon (`:1375`, `:1382`) delete at once, as today.
3. A restart wipes `.tmp` (`:286`), `listResumable` demotes the durable `ready` row to
   `retrieving` (`processing-job-repository.ts:216`; `file-processing-job-repository.ts:189`) and
   restore itself, not the tick, re-launches `#retrieve` for it (`video-job-service.ts:355`): one
   download under the billing assumption stated in the tick bounds, never a submission. There is
   no durable delivered marker (§1.4), so a result the operator already received is downloaded
   again, and while that restored job is non-terminal the owner's next submission is refused with
   `generation_in_progress` (`:900-906`; `reconcileActiveJob` answers true for a non-terminal job,
   `:526`). The block lasts until the download succeeds (`:1191`) or fails (`:1206`, after at most
   three attempts, `:1197`), and never past the deadline, which `content()` and `#settleDelivery`
   enforce inline (`:1345-1346`). Stated as the cost of retention without a delivered marker; the
   marker itself is D14 territory. File mode demotes every ready trace
   (`file-processing-job-repository.ts:183-195`). Postgres and neon demote only one per owner
   (`processing-job-repository.ts:187-188`, `:210-217`) because of the one-active index
   (`schema.ts:475`); an owner holding two ready results loses the older one at a relational
   restart. Stated, not fixed (Phase 4, D14).

**TTL.** Unchanged, sixty minutes from creation (§1.3). The three documents are corrected, not the
code; D14's horizon (`DECISIONS_REQUIRED.md:166`) is untouched.

**Storage implications.** A delivered standalone result, at most `VIDEO_RESULT_MAX_BYTES`
(`packages/contracts/src/video-jobs.ts:25`), lives under `.tmp/video-jobs/<id>/result.video` for up
to sixty minutes instead of seconds. `ready` is terminal for admission (`video-job-service.ts:111`)
and outside capacity (`:455`), so retained results never block a new job. The per-owner bound is
the submission rate over one hour: at worst 8 × 300 MB transient if every slot completes in the
same hour. Nothing lands in the byte store or the database for standalone results. The Dashboard
queue lists only non-terminal jobs (`:532`), so a retained result is reachable only by a browser
that still holds the job id (Q4). That browser holds the id in memory only: the lifecycle drops
its cache entry after delivery (`useExistingVideoJobLifecycle.ts:188`), nothing in the feature
writes `sessionStorage` or `localStorage` (§1.2), and the feature contract says a refresh or crash
does not recover the workflow (`12-existing-video-processing.md:241`). In practice, then, a
closed browser cannot retrieve a standalone result in this slice. Prompt 22's standalone
criterion, "close client → job completes and result retrievable within TTL"
(`IMPLEMENTATION_PROMPTS.md:263-264`), is verifiable only by a test that holds the job id out of
band, and the roadmap's acceptance line (`PRODUCT_ROADMAP.md:110-111`) is met for the Project path
only. Q4 records that as an accepted exception rather than leaving it implicit.

**Docs rewritten in the same slice.** `12-existing-video-processing.md:200-203`, `:241-244`,
`:246-248` and `:256-257`; `PRIVACY_AND_TEMPORARY_DATA.md:238-244`; `ARCHITECTURE.md:895-900`.

**Tests.** `video-job-service.test.ts` already has the fixtures: `FakeVideoProvider` (`:23`),
`ManualDeadlineScheduler` (`:70`), the zeroed ladder (`:216`) and the expiry pattern (`:1144`,
`:1201`). New cases: after a completed delivery `content()` succeeds again and streams identical
bytes; advancing past `createdAt + VIDEO_JOB_TTL_MS` removes the directory and `content()` answers
410; a Project-linked `settle(true)` still cleans immediately; `release()` and `abandon()` still
delete early; a retained result does not block a new job for the same owner.
`video-jobs/routes.test.ts` (`installRouteTestAuth` at `:20`): GET content twice answers 200 both
times; DELETE then GET answers 404. One named end-to-end case for prompt 22's standalone
criterion, at the app level with the tick enabled and a short interval (the phase-waiting pattern
at `project-processing-routes.test.ts:230`): `PUT /api/video-jobs/:jobId` submits, the test makes
no further status request, the fake provider completes, the tick moves the job through
`retrieving` to `ready`, and a first `GET .../content` with the id the test kept answers 200
before `createdAt + VIDEO_JOB_TTL_MS`. A second case restarts the service on the same directory
after a delivered download and asserts the re-download, the `generation_in_progress` refusal while
it runs, and that the refusal clears when the job is `ready` again.

### The AI usage ledger

**Domain owns the vocabulary and the rules.** `packages/domain/src/ai-usage/{types,rules}.ts`,
exported beside `packages/domain/src/index.ts:15`: `AI_USAGE_OUTCOMES` (`succeeded`, `failed`,
`ambiguous`, `expired`, `cancelled`); `aiUsageOutcomeForJobStatus(status)` over the domain status
union (`packages/domain/src/video-processing/types.ts:40`, a superset of the wire statuses), mapping
`ready` to `succeeded`, `failed`, `ambiguous`, `expired` and `cancelled` to themselves and everything
else to null; `applyAiUsageTransition(existing, incoming)`, which inserts when absent, keeps the
existing row when its outcome is set, and otherwise fills `outcome` and `completedAt`;
`aiUsageDurationMs`. `applyAiUsageTransition` is the only owner of first-terminal-outcome-wins
(`CLAUDE.md:82-83`, one owner per domain rule and per storage rule): both repositories call it and
neither re-implements it in SQL or in the journal merge.

**Postgres (postgres and neon).** A new pgEnum
`aiUsageOutcome = pgEnum('ai_usage_outcome', [...])` beside `operationStatus` (`schema.ts:50`),
deliberately not `operation_status`: it records the provider outcome, not the lifecycle. A new table
`ai_usage_ledger`, modelled on the receipt table (`:1204`, primary key at `:1223`):

| Column          | Type                                             | Note                                                               |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `owner_user_id` | uuid NOT NULL, FK `users(id)` ON DELETE restrict | as `processing_jobs` (`schema.ts:430-432`)                         |
| `job_id`        | uuid NOT NULL                                    | the `VideoJobService` job id, which is the Project operation id    |
| `operation`     | text NOT NULL                                    | `character-swap` or `virtual-try-on`, as `:433`                    |
| `provider`      | text NOT NULL                                    | `decart` or `pruna`, as `:434`                                     |
| `outcome`       | `ai_usage_outcome` NULL                          | null means submitted and not yet terminal                          |
| `submitted_at`  | timestamptz NOT NULL                             | when the open row is written, immediately before `provider.submit` |
| `completed_at`  | timestamptz NULL                                 | the terminal transition                                            |

Keys: `PRIMARY KEY (owner_user_id, job_id)`; index
`ai_usage_ledger_owner_submitted_idx (owner_user_id, submitted_at DESC, job_id DESC)` for
newest-first paging; partial index `ai_usage_ledger_open_idx (submitted_at) WHERE outcome IS NULL`
for the reconciler; check `ai_usage_ledger_outcome_completed_consistent`
`((outcome IS NULL) = (completed_at IS NULL))`. The page order is `(submitted_at DESC, job_id DESC)`
and the cursor is a keyset on that pair, compared as the row value
`(submitted_at, job_id) < (:submitted_at, :job_id)`, so both index columns run in the same
direction as the sort and the index serves the comparison. `countByOutcome` groups on `outcome`,
which is in no index: it walks the owner's window through the owner index and fetches `outcome`
from the heap. That is accepted explicitly rather than adding a third index, because the window
is bounded by the contract (at most 366 days) and by one owner's submission rate under the
one-active guard (D8). No foreign key to `processing_jobs`: the ledger must
outlive a D14 sweep, and `processing_jobs_id_owner_unique` (`schema.ts:461`) exists if a later slice
wants the link. Deliberately absent: prompts, filenames, media and asset ids, the provider job id,
the output location, the request fingerprint, the safe error code, cost or credits, project id,
`accepted_at`, `expires_at` and retry lineage (a Project retry is a new operation id,
`project-processing-service.ts:793`). `durationMs = completedAt − submittedAt` is derived by the
mapper and labelled app-observed: it includes poll lag and download plus inspection, because the
terminal time is `updatedAt` (`video-job-service.ts:607`).

**File mode (local and shadow, where files are the authority; `persistence-factory.ts:72-73`,
`:108`).** `FileAiUsageLedgerRepository` at
`apps/api/src/features/ai-usage/file-ai-usage-ledger-repository.ts` writes one per-owner journal
`<LIGHTFRAME_DATA_DIR>/metadata/v1/ai-usage/<ownerUserId>.json`, shaped
`{ schemaVersion: 1, entries: [{ jobId, operation, provider, outcome, submittedAt, completedAt }] }`,
a sibling of `metadata/v1/processing-jobs` (`file-processing-job-repository.ts:74`). It uses the
trace store's discipline: strict zod, directory mode 0700 and file mode 0600 with exclusive create,
fsync and rename (`:141-153`), ENOENT read as empty (`:85`). Writes are serialized by a private
per-owner promise chain, never the shared owner lock, so a ledger write cannot nest inside a
Project write (`file-project-repository.ts:1013`). Entries are unique by `jobId`; reads sort
newest-first by `(submittedAt, jobId)`, both descending, the same order as the relational index.
In shadow mode the file ledger stays the authority and the Drizzle ledger is attached as an
optional best-effort shadow writer for `record()` only, warn-only on failure, the pattern the
trace path already uses (`ProjectAwareProcessingJobRepository`'s `shadow` writer,
`project-aware-processing-job-repository.ts:18`, `:30-35`; the Neon trace writer is built for
shadow at `persistence-factory.ts:104-106` and handed over at `:112`; the mode is documented as
"best-effort side effects" at `docs/CLOUD_PERSISTENCE.md:182`). Without the mirror, and with no
backfill (model point 10), a shadow-to-neon switch would start with an empty relational ledger;
with it, the cutover rehearsal (`CLOUD_PERSISTENCE.md:272`) gains "reconcile ledger counts", and
that document records both.

**Write points.** Three writers (model point 5). Two of the three write points live in
`VideoJobService`, through a new option `usageLedger?: AiUsageLedgerRepository` on
`VideoJobServiceOptions` (`video-job-service.ts:40`) and a new `ledgerOpened: boolean` on
`VideoJobRecord`; the third is the reconciler (Point 3). The service's write points are not inside `#trace`, which
returns before any chaining when no trace writer is configured (`:625`, the test-mode case at
`app.ts:324-326`), and not inside `#submitProvider`'s `try` (`video-job-service.ts:1090`), because
a throw there reaches the catch at `:1127` and the unknown-acceptance branch at `:1132`, which would
label a never-submitted job `ambiguous`.

- **Point 1, open: after the required `submitting` trace, before any provider contact.**
  Standalone: after `:1058` and its catch (`:1059-1065`), and after the ownership check at
  `:1066`, `await this.#openUsageRow(job)` calls
  `usageLedger.record({ ownerUserId, jobId, operation, provider: job.providerId, submittedAt: now, outcome: null, completedAt: null })`
  and sets `job.ledgerOpened = true`. On failure it warns
  `[video-jobs] AI usage row could not be opened.` with `{ jobId }` and throws an
  `AppError(503, 'provider_unavailable', ...)` naming that nothing was submitted. That error never
  reaches a client: `#submit` runs tracked after `start()` has returned the snapshot
  (`:951-952`), so the enclosing catch (`:1071`) stores it as the job's error (`:1076-1079`) and
  the job reads `failed`, the existing durable-failure shape (`:1060-1063`). On this path the
  `failed` touch is required and awaited, `await this.#touch(job, 'failed', true).catch(warn)`,
  unlike the fire-and-forget `:1080`, so the durable row leaves `submitting` before the method
  returns and a crash immediately afterwards does not leave a provider-less `submitting` row.
  Project-linked: after `:1026` and its catch, the same call; on failure set
  `job.error = { code: 'provider_unavailable', ... }`, the same awaited required `failed` touch,
  clean up and return the snapshot, not the `:1033` `ambiguous` branch, because nothing was
  submitted; the attempt's retry policy is then plain `explicit` (`rules.ts:59`) rather than
  `explicit-cost-confirmation` (`:58`, which `submit` enforces at
  `project-processing-service.ts:386`). If the required `failed` trace itself fails (the store
  that refused the ledger write may refuse the trace, since both sit on one pool in Postgres), the
  job still reads `failed` in memory and the durable row stays provider-less `submitting`; a
  restart then labels it `ambiguous` (§1.4) and the reconciler closes the ledger row from that
  durable row. That residue is the reason model point 4 says "while the process lives". Net
  guarantee: no `provider.submit` (`:1095`) without a ledger row, and no row for a job that never
  reached `submitting`: validation (`:924`), admission (`:722`), inspection failure (`:1043`) and
  the `:1033` trace failure all precede it.
- **Point 2, close: in `#touch` on a terminal status.** After the trace call at `:621` is taken
  into a local, add: if `terminal(status)`, `job.ledgerOpened` and a ledger is configured, track
  (`:705`) a `record` with the identity, `submittedAt: job.createdAt`,
  `outcome: aiUsageOutcomeForJobStatus(status)` and `completedAt: job.updatedAt`, with a warn-only
  catch in the `:631` style that logs `[video-jobs] AI usage row could not be closed.` with
  `{ jobId, status }`. `submittedAt: job.createdAt` is used only when the row is absent (a
  job submitted before migration 0025); the upsert never overwrites `submitted_at`. Because it is
  tracked, `close()` waits for it (`:1419`). This covers `ready` (`:1191`), every `failed`
  (`:1080`, `:1152`, `:1206`, `:1245`, `:1280`), both post-contact ambiguities (`:1122`, `:1138`),
  `expired` (`:813`) and `cancelled` (`:1391`). Restored jobs set `ledgerOpened = true`, because a
  resumable record always carries a provider id (`file-processing-job-repository.ts:47`).
- **Point 2b, restore failure.** `#markRestoreFailed` (`video-job-service.ts:360`) writes the trace
  directly (`:362`, `:374`) and bypasses `#touch`; it additionally records `outcome: 'failed'`
  best-effort. The row it closes is one Point 1 opened before the crash.
- **Point 3, the reconciler: read-only toward `processing_jobs`, the third writer toward the
  ledger, batched by owner.** `apps/api/src/features/ai-usage/ai-usage-reconciler.ts`
  `reconcile(now, limit)`: `ledger.listOpen(limit)`, then group the open rows by `ownerUserId`
  and, per owner, one `durable.findOutcomes(ownerUserId, jobIds)` returning
  `Map<jobId, { status, completedAt, updatedAt }>`. For each open row: if the durable row is
  terminal, `record` the mapped outcome with the row's `completedAt ?? updatedAt`; if no durable
  row exists and `submittedAt + VIDEO_JOB_TTL_MS <= now`, `record` `ambiguous` at `now` (the job's
  own deadline is `createdAt + TTL`, earlier than that, so a live process closes through Point 2
  first); otherwise leave it. This closes rows the repositories transition without the service:
  restart recovery in both standalone stores (`processing-job-repository.ts:144`, `:149`, `:174`,
  `:238`; `file-processing-job-repository.ts:176`, `:199`, `:209`) and in Project attempts
  (`project-repository.ts:2812`, `:2837-2839`; `file-project-repository.ts:1083`), plus a
  warn-only Point 2 that failed. The per-row read the checklist warns about
  (`IMPLEMENTATION_PROMPTS.md:29`) is avoided on purpose: a pass of 25 rows is one `listOpen` plus
  at most two reads per distinct owner, never per row. The reads are new.
  `findOutcomes(ownerUserId, jobIds)` on `DurableProcessingJobRepository`
  (`file-processing-job-repository.ts:62`): file mode reads each id's own trace file with
  `#read(jobId)` (`:81`) and an owner check, at most 25 small files a pass; Drizzle is one select
  `where owner_user_id = ? and id in (...)` (the `inArray` idiom at
  `project-repository.ts:2835`) **without** the standalone scope
  (`processing-job-repository.ts:72-73`), so Project-linked rows in the shared table are found.
  `ProjectAwareProcessingJobRepository` (`project-aware-processing-job-repository.ts:14`) tries a
  new `projects.findProjectAttemptOutcomes(ownerUserId, jobIds)` first, a read added to
  `ProjectProcessingRepository` (`project-processing-repository.ts:113`) beside
  `getProjectAttempt` (`:120`), and asks the standalone store only for the ids the Project read
  did not answer: file mode reads the owner library once, the way `getProjectAttempt` does
  (`file-project-repository.ts:924`); Drizzle reuses the `:2710-2721` join with `inArray` and
  without `for update`. Never `listResumable`. Failures log per row and per pass as stated under
  "What one `run()` does".

**Not hooked:** the trace writers, `updateProjectAttemptTrace`, admission, the failed-start trace
in `ProjectProcessingService` (`project-processing-service.ts:526`, `:538`; a start that threw
before provider contact leaves no row, correctly), and the routes, which are read-only. Synchronous
image and voice calls have no job id and stay out (`TARGET_ARCHITECTURE.md:30`).

**Idempotency.** `record(entry)` is one monotonic write keyed `(owner_user_id, job_id)` whose
only rule is `applyAiUsageTransition` (model point 6). Postgres, inside one transaction:
`INSERT ... ON CONFLICT (owner_user_id, job_id) DO NOTHING` (the `admit` idiom at
`processing-job-repository.ts:91`), then `SELECT ... FOR UPDATE` on the primary key (the row-lock
idiom at `project-repository.ts:2720`), then `applyAiUsageTransition(existing, entry)` and an
`UPDATE` of `outcome` and `completed_at` only when the rule returns a changed row. Two concurrent
`record()` calls on one key serialize on the row lock, and the second sees the first's outcome.
There is no `coalesce` in SQL: the `accepted_at` idiom (`:137`) is the precedent for
keep-the-first semantics, but reproducing it would give the rule a second owner
(`CLAUDE.md:82-83`). `operation`, `provider` and `submitted_at` are never in the SET list, and
the entry type forces `outcome` and `completedAt` to be both null or both set, so the check
always holds. File mode: `applyAiUsageTransition` under the per-owner chain, then an atomic
rename. The domain test covers the four orderings (open then close, close then open, close then a
different close, close then open again); the scripted-database block asserts the Drizzle
repository issues exactly those three statements and writes what the rule returned; the Postgres
integration test races two instances on one key.

Why racing writers cannot double-count: (1) one submission is one job id is one primary key. A
replayed PUT returns the existing snapshot (`video-job-service.ts:871`, `:888`); a replayed
Project start likewise (`:968-983`); durable admission rejects a second owner or request
(`file-processing-job-repository.ts:107-129`; `processing-job-repository.ts:87`, the rejections at
`:107` and `:114`); an explicit retry is a new operation id. (2) In process, the tick and `status()` share the coalesced `#refresh`
(`:1222`) and `#retrieve` launches once per completed poll (`:1250-1251`), so one transition yields
one close; later terminal touches on the same job (ready then expired at `:813`, ready then
cancelled through `:1382` and `:1391`) are coalesce no-ops. (3) The reconciler only closes open
rows and never reopens or overwrites. (4) The open write can only be overtaken by a close across a
crash, and both go through `record()` and the same rule, so whichever lands first creates the row
and the other fills the null columns. Prompt 22's race test runs `tick.run()` concurrently with repeated `status()`
through queued, processing and ready, restarts on the same directory, runs the reconciler and
asserts one row, outcome `succeeded` and `provider.submit` called once; the Postgres integration
test races two `DrizzleAiUsageLedgerRepository` instances on one key.

**Contract.** `packages/contracts/src/ai-usage.ts`, exported beside
`packages/contracts/src/index.ts:14`:

- `aiUsageOutcomeSchema = z.enum(['succeeded', 'failed', 'ambiguous', 'expired', 'cancelled'])`,
  a literal copy of `AI_USAGE_OUTCOMES` written by hand, because the contracts package depends on
  zod alone (`packages/contracts/package.json:18-20`) and cannot import the domain constant; the
  existing mirror is a literal for the same reason (`shared-contract-parity.test.ts:73`).
  Three-way parity is asserted there next to `:115-116`: the domain list equals the contract
  options equals `aiUsageOutcome.enumValues`; the non-pairs note at `:144` records that
  `ai_usage_outcome` is not `operation_status`.
- `aiUsageLedgerEntrySchema`: `jobId` (uuid), `operation` (`videoTransformOperationIdSchema`,
  `packages/contracts/src/video-jobs.ts:9`), `provider` as a bounded string,
  `z.string().trim().min(1).max(80)`, exactly the queue item's field (`:199`) and the record's own
  type (`video-job-service.ts:62`), not `videoCharacterSwapProviderIdSchema` (`:10-11`): the
  column is `text` (`schema.ts:434`), so an enum on the wire would let one stored row with any
  other value fail the whole response parse, while a bounded string serves whatever the ledger
  holds (Virtual Try-On rows carry `decart`, `video-job-service.ts:403`); `outcome` (nullable),
  `submittedAt`, `completedAt` (nullable), `durationMs` (nullable non-negative int), strict.
- `AI_USAGE_LEDGER_PAGE_SIZE = 50`; `AI_USAGE_LEDGER_MAX_WINDOW_DAYS = 366`;
  `aiUsageLedgerQuerySchema = { since: z.iso.datetime(), cursor?: opaquePageTokenSchema }`
  (`packages/contracts/src/common.ts:66`; the cursor style of
  `packages/contracts/src/project-processing.ts:181`), strict. `since` is required and has no
  server default: the window is the caller's to state, the browser states the start of its local
  calendar month (so the panel answers the roadmap literally, `PRODUCT_ROADMAP.md:109-112`),
  tests state theirs, and no handler literal owns a second window policy (`AGENTS.md:55-56`). The
  maximum window is the contract's constant, so the handler enforces it without owning it.
- `aiUsageLedgerResponseSchema`: `since` echoed, `counts` (`running`, `succeeded`, `failed`,
  `ambiguous`, `expired`, `cancelled`), `entries` (max 50), `nextCursor` (nullable), strict.
  `counts` cover rows with `submittedAt >= since`.

**Route.** `GET /api/account/ai-usage` in `apps/api/src/features/ai-usage/routes.ts`, registered
right after `registerAuthRoutes` (`app.ts:440`). Ownership comes from the session only
(`apps/api/src/http/authentication.ts:78`, `:82`); `Cache-Control: no-store` as `/api/auth/me`
(`apps/api/src/features/auth/routes.ts:67`, `:70`); no provider-intent header, since the read
contacts no provider (unlike `video-jobs/routes.ts:20-24`). The handler `safeParse`s the query
and answers 400 `validation_error` on failure, the shape at `campaigns/routes.ts:57-59`; a `since`
earlier than `now` minus `AI_USAGE_LEDGER_MAX_WINDOW_DAYS` is the same 400, which is what bounds
`countByOutcome` (the checklist's "unbounded work in request handlers",
`IMPLEMENTATION_PROMPTS.md:31`); a bad cursor is the cursor helper's own 400
(`apps/api/src/http/page-cursor.ts:58`). It then calls
`ledger.listForOwner(owner, { since, cursor, pageSize: 50 })` and `ledger.countByOutcome(owner, since)`,
and parses the response. It is always registered, because a file ledger is always built as the
fallback (the pattern at `app.ts:302`), so it joins `alwaysRegisteredRoutes`
(`route-inventory.test.ts:14`) and gains its HEAD sibling automatically (`:124`).

**Repositories and wiring.** Two port types in
`apps/api/src/features/ai-usage/ai-usage-ledger-repository.ts`:
`AiUsageLedgerReader { listForOwner(owner, { since, cursor?, pageSize }); countByOutcome(owner, since) }`,
every method owner-scoped, which is all the route receives; and
`AiUsageLedgerRepository extends AiUsageLedgerReader { record(entry); listOpen(limit) }`, which
only `VideoJobService` and the reconciler receive. `listOpen` is the one cross-owner read on the
port and is internal to the reconciler by construction: a later route handed the reader type
cannot reach it without widening its own parameter, so the type is the guard and no test is
needed for it. `FileAiUsageLedgerRepository` and `DrizzleAiUsageLedgerRepository`
(`apps/api/src/infrastructure/database/ai-usage-ledger-repository.ts`) implement the full port.
None of the wiring exists today: `AppPersistenceDependencies` (`app.ts:112`) has no ledger member
in its body (`:113-131`), `persistence-factory.ts` builds no ledger in either return (`:109-114`,
`:124-153`), `app.ts` passes only `traceWriter`, `durableJobRepository` and the two caps into
`new VideoJobService(` (`:344-355`) and builds no reconciler (the only reconciliation in the API
is `reconcileActiveJob`, `video-job-service.ts:511`), and §1.8's grep is empty. Prompt 21 adds:
an optional `aiUsageLedger` member on `AppPersistenceDependencies`; in `persistence-factory.ts`,
`aiUsageLedger: new DrizzleAiUsageLedgerRepository(connection.db)` in the relational bag beside
`processingJobTraces` (`:131-132`) and the same instance handed to the shadow return beside
`:112`, where the file ledger stays the authority and the Drizzle one is the best-effort shadow
writer (the shadow paragraph under "File mode"); in `app.ts`, the file ledger fallback built
beside `:302`, `usageLedger` in the `VideoJobService` options at `:347-354`, the reconciler over
`durableProcessingJobs` (`:339`) as described under "Wiring", the route after `:440`, and the
tick's close before `:505`.

**Web.** `apps/web/src/adapters/api-client/aiUsageApi.ts` with
`getAiUsageLedger({ since, cursor }, signal)` and `aiUsageLedgerQueryOptions(ownerUserId, since)`
keyed `['account', 'ai-usage', ownerUserId, since]`, modelled on `activeVideoJobsQueryOptions`
(`videoJobsApi.ts:121-122`). The adapter computes `since` as the start of the viewer's local
calendar month; with `since` required by the contract there is no server default for it to
disagree with. A new `apps/web/src/features/account/AiUsageSection.tsx` is mounted inside the
existing AI activity section (`AccountPanel.tsx:213-214`) with the same open-gated query shape
(`:58-62`). Prompt 21's own line names only the standing rules and the API/DB checklist
(`IMPLEMENTATION_PROMPTS.md:258-259`); this section is a new surface, so the UI checklist
governs it (`:44-49`) and its states are listed here rather than left to the implementer:

- Loading: "Checking your AI activity…" in the `LoadingPlaceholder` primitive
  (`apps/web/src/ui/primitives/LoadingPlaceholder.tsx:14`); the panel's own close control is the
  control, exactly as for the existing line's loading copy (`AccountPanel.tsx:217`).
- Error: "Your AI activity is unavailable right now." in a `StatusNotice`
  (`ui/primitives/StatusNotice.tsx:37`) with a "Try again" `Button` (`ui/primitives/Button.tsx:102`)
  that refetches. The rest of the panel keeps rendering, which is why the deploy order under
  "Order of changes" puts the API before the web.
- Empty, zero rows in the window: "No video transformations this month." with a `LinkButton`
  (`Button.tsx:158`) to Assets (`APP_PATHS.assets`, `apps/web/src/app/paths.ts:9`), where
  Character Swap and Virtual Try-On start.
- Populated: the month summary and the rows below.
- Paging: while `nextCursor` is non-null, a "Show earlier" `Button` appends the next page under
  the same `since`; the cursor seals the criteria it was minted for
  (`apps/api/src/http/page-cursor.ts:9-12`), so a page can never shift under the reader.

One running number. The section keeps the running-jobs line (`:215-223`), which counts the
in-memory queue (`:63`), and does not render the ledger's `counts.running` as a second number:
the two differ by the crash-orphaned rows the reconciler has not yet closed (§4), and one screen
saying "running" twice with two values would be a defect. The month summary replaces the two
sentences at `:224-227` and reads "This month: N submitted. S succeeded, F failed, A acceptance
unknown, E expired, C cancelled." where N is the sum of all six counts, so the open rows are N
minus the terminal counts; `counts.running` stays on the wire for tests and other clients.

Rows, newest first, 50 a page: the transformation label from `:22-23`, `submittedAt` through
`formatDateTime` (`:3`), the duration captioned "time to outcome as observed by Lightframe", and
the outcome in the domain vocabulary (model point 15) with its next step. Open: "Running. See the
Dashboard queue." with a `LinkButton` to the Dashboard (`APP_PATHS.dashboard`, `paths.ts:3`).
`succeeded`: "Succeeded: the result was ready to download." `failed`: "Failed. A retry is a new
submission." `ambiguous`: "Acceptance unknown. The provider may have accepted it; reconcile before
retrying, since a retry may duplicate cost" (cf. `project-processing.ts:152`). `expired`:
"Expired before retrieval. Submit again explicitly." `cancelled`: "Cancelled. The provider may
still have charged." (`packages/contracts/src/video-jobs.ts:223`). The provider appears as muted
trailing text, never a control (Q2). A terminal row carries no control of its own: neither
`projectId` nor `expiresAt` is on the row, so there is no Project link and no "downloadable
until" hint. The checklist's "every state carries a control" (`:49`) is met at the state level
by the controls above; the row-level gap for a retained standalone result is the Q4 exception,
recorded in `DECISIONS_REQUIRED.md` (§2, Docs row) rather than left implicit. Footer, scoped to
video: "Counts and outcomes for video transformations only. Lightframe does not record what the
provider charged for them, and image and voice transformations are not listed."
`monthlyCredits` stays as it is; "Not metered" is UI copy (`AccountPanel.tsx:193`), not the
contract. Every test that opens the panel must stub `GET */api/account/ai-usage`, because msw
fails unhandled requests (`vitest.setup.ts:89`; the pattern at `AccountMenu.test.tsx:101`).

### Migration

**Postgres and neon.** Add `aiUsageOutcome` and `aiUsageLedger` to `schema.ts`, then
`bun run --filter @studio/api db:generate` (`apps/api/package.json:13`) and
`bun run --filter @studio/api db:check` (`:14`). The journal ends at 0024
(`apps/api/drizzle/meta/_journal.json:177`; the directory tail is `0024_pale_doomsday.sql`), so the
new file is `apps/api/drizzle/0025_<generated>.sql` containing only the enum, the table with its
primary key and check, the foreign key to `users`, and the two indexes. It is expand-only by
construction: no ALTER of an existing table, no enum value change, no backfill; the ledger starts
empty. Rollback leaves the table in place (`docs/CLOUD_PERSISTENCE.md:120`). Locally, migrate the
development database after the schema change (`CLOUD_PERSISTENCE.md:248-250`), or the real-stack
journey fails at an unrelated step; production stays a manual release action (`:253-254`). CI
applies it in the database job (`.github/workflows/quality.yml:153-154`). Add a
`CLOUD_PERSISTENCE.md` bullet in the voice of the 0024 entry (`:113`).

**File mode.** No migration. `metadata/v1/ai-usage/` is created lazily with mode 0700 on first
write; an absent directory or file is an empty ledger; the journal carries `schemaVersion: 1` as the
traces do (`file-processing-job-repository.ts:14`). The Project library, the saved-video library
and the trace schema (`:35`) are untouched. "Verified in both modes" (`IMPLEMENTATION_PROMPTS.md:259`,
`:266`) is evidence to produce, not a sentence to assert, so two file-mode cases are named in
`file-ai-usage-ledger-repository.test.ts` beside the layout cases:

1. Older reader. The four file repositories each resolve their own subdirectory
   (`file-processing-job-repository.ts:74`; `file-project-repository.ts:361`;
   `saved-voice-repository.ts:154`; `saved-video-repository.ts:270`) and the trace store lists only
   inside its own (`file-processing-job-repository.ts:93`, `:100`). The test constructs all four
   over a data directory that already holds `metadata/v1/ai-usage/<owner>.json` and asserts their
   reads are exactly what they were without it. That is what "an older API ignores the new
   directory" means, shown rather than claimed.
2. Schema mismatch. A journal whose `schemaVersion` is not `1` fails the strict parse and the
   repository throws, the trace store's own rule (`#read` rethrows everything but `ENOENT`,
   `:83-86`); no repair or rewrite is attempted. The consequences are stated so prompt 22 can
   check them: `record()` at Point 1 fails the job `provider_unavailable` before any provider
   contact (model point 4); the route answers 500 `internal_error` (`errors.ts:57`) and the panel
   shows its error state; `listOpen` logs `{ ownerUserId, errorClass }` and skips that journal, so
   one bad file cannot stop the reconciler for every other owner.

**Verification (prompt 22).** A new
`apps/api/src/infrastructure/database/ai-usage-ledger.postgres.integration.test.ts` behind the
existing gate (`project-migration.postgres.integration.test.ts:19-20`;
`withTemporaryPostgresDatabase` at `temporary-postgres.test-support.ts:37`; the documented command
at `docs/TESTING.md:65`). It applies 0000 through 0025 to a throwaway database, re-applies to prove
idempotence, and asserts the primary key, the check, both indexes and the coalesce rule under two
concurrent `record()` calls. Register it at `quality.yml:159-162`. Run it only against the
throwaway compose database on 5433, never the developer's database. A scripted-database unit block
in `repositories.test.ts` (the import at `:14`; the consumption check pattern at `:86`; the writer
block at `:573`). The file repository test on a tmp root asserts layout, the 0600 and 0700 modes,
atomic rename, first-outcome-wins, owner isolation, cursor paging and the two file-mode cases
above. The Postgres half of "both modes" is the integration test; the file half is those cases;
prompt 22 reports both.

### Order of changes for prompt 21

0. **Confirm before editing:** the two `#refresh` callers (`video-job-service.ts:523`, `:1296`),
   the single `provider.submit` call site (`:1095`), and that the journal still ends at 0024. No
   code changes.
1. Domain: `ai-usage` types and rules, tests for the status mapping over all twelve statuses, the
   transition rule over the four orderings, and the duration.
2. Contracts: `ai-usage.ts`, tests, the parity rows. **Deploy order:** contracts and API before
   web, because the panel's new query answers 404 against an old API and the section must render
   its error state rather than break the panel.
3. Storage: schema, 0025 through `db:generate` and `db:check`, the Drizzle repository with its
   scripted-database block, the file repository with its test, the Postgres integration test, the
   `CLOUD_PERSISTENCE.md` bullet.
4. Repositories: `findOutcome` on the three durable job repositories and
   `findProjectAttemptOutcome` on both Project repositories; `projectId` on the resumable record;
   tests in `file-processing-job-repository.test.ts`, `repositories.test.ts`,
   `file-project-repository.test.ts` and the Project Postgres integration file.
5. Service, ledger: the option, `ledgerOpened`, Points 1, 2 and 2b; tests for no-row-no-spend on
   both paths (a rejecting ledger yields `failed`, never `ambiguous`, and `submit` is not called),
   one row per job through every terminal path, a restored job closing its row, and the
   `submittedAt = createdAt` fallback. Side effect on existing suites, stated so it is not a
   surprise: `VideoJobService` unit tests pass no `usageLedger` and write nothing new; every
   app-level test that submits a job through `createApp` gets the file ledger fallback and writes
   `metadata/v1/ai-usage/<owner>.json` under its `lightframeDataDir`. Today that is only
   `project-processing-routes.test.ts`, which already uses a `mkdtemp` root (`:103`, `:126`) and
   removes it (`:118`); `video-jobs/routes.test.ts` builds the app with
   `decartVideoProvider: null` (`:56`) and submits nothing. `testConfig()`'s default data
   directory is the relative `./.lightframe-data-test` (`apps/api/src/test/fakes.ts:63`), which
   git does not ignore, so the new app-level cases in steps 8 and 10 must pass a `mkdtemp`
   `lightframeDataDir` as `project-processing-routes.test.ts` does;
   `videoJobProgressionIntervalMs: 0` (step 8) stops the timer, not these writes.
6. Service, retention: `projectId` on the record and through `startPrelinked`, the
   `#settleDelivery` branch, the tests listed under "Retention until TTL".
7. Service, progression: `progressDueJobs` and its tests: a queued job reaches `ready` with zero
   `status()` calls, Project-linked records are polled first, the batch bound holds, a job inside
   its backoff window is skipped, `submit` is called once across N passes and concurrent
   `status()` calls, `listResumable` is never called after construction.
8. The runner: `video-job-progression.ts`, the environment variable, `fakes.ts`, the `app.ts`
   wiring and close hook; runner tests with an injected scheduler for overlap, the 60 s
   reconciler cadence (every twelfth run at the 5 s default), the retention backoff map, the log
   line, and a Project-linked `ready` job being retained through `retainResult` (through
   `reconcile` only if Q3 approves promotion) with the browser absent (the app-level test sets a
   short interval and waits on phases, the pattern at `project-processing-routes.test.ts:230`).
9. Reconciler and its tests: closes a row whose durable row a restart expired; leaves an open row
   with a live durable row alone; marks a rowless open entry `ambiguous` only after
   `submittedAt + TTL`; never reopens; issues one durable read per distinct owner in the page,
   not one per row; skips and logs an unreadable owner journal in file mode.
10. Route, port wiring, `alwaysRegisteredRoutes`; route tests for ownership (another owner's rows
    are absent, never 403), `no-store`, paging, the window counts, 400 on a missing `since`, on a
    `since` older than the maximum window, and on a bad cursor.
11. Web: adapter, section, the panel wiring, the msw stub in every panel-opening test; component
    tests for the loading, empty, error and paging states and their controls, the month summary,
    the outcome copy per outcome, the muted provider and the footer.
12. Docs listed in §2, then `bun run format:check`, `bun run check:docs` and
    `bun run check:retired-program` (`package.json:43`, `:67`, `:68`).

**Validation (per `CLAUDE.md`), strictly sequential, never Vitest and Playwright together
(`docs/TESTING.md:74`):**
`vitest run packages/domain/src/ai-usage packages/contracts apps/api/src/features/video-jobs apps/api/src/features/ai-usage apps/api/src/features/processing-jobs apps/api/src/features/projects/project-processing-routes.test.ts apps/api/src/features/projects/file-project-repository.test.ts apps/api/src/route-inventory.test.ts apps/api/src/shared-contract-parity.test.ts apps/api/src/infrastructure/database/repositories.test.ts`;
`vitest run apps/web/src/features/account`; `bun run typecheck`;
`bun run --filter @studio/api db:check`; the gated Postgres files against the compose-5433
throwaway database; `bun run format:check` and `bun run check:docs`. Because persistence, an
auth-scoped route and shutdown are touched, finish with `bun run quality` (`package.json:82`). No
live provider is contacted at any step (`TESTING.md:72`). **Budget:** one tick performs at most four
provider status reads, four downloads, four Project retentions and, at most once a minute, one
reconciler pass; a pass is one `listOpen` plus at most two durable reads per distinct owner among
its 25 rows, three statements for a single operator and at most 51 if every row had a different
owner; a submission adds exactly one ledger transaction before the provider call and one after
the outcome, each three statements in Postgres.

## 4. Risks and dependencies

- **Cross-instance duplication is unchanged, not fixed.** Two relational API processes each
  restore every resumable row (`video-job-service.ts:296`) and would now both tick-poll and
  tick-download the same provider job: duplicate reads and egress, never duplicate submissions,
  never shared temp files (`:285-286`). The tick makes the single-process assumption load-bearing
  for provider read volume. Q1.
- **Unattended promotion, only if Q3 approves it.** Under the retain-only default (model point 8)
  the tick stores bytes and the cut does not move until the operator returns. If Q3 approves
  promotion, tick retention appends the `job-result` revision and bumps the Project version
  exactly as a client reconcile does today, and an operator editing that Project can meet the
  existing CAS refusal (`project-processing-service.ts:354`; retention's own `:693`).
  `promoteProjectJobResult` yields `stale` when the head moved
  (`packages/domain/src/projects/rules.ts:1618-1622`), so nothing is lost; the timing of that
  experience changes. Q3.
- **A relational restart keeps only the newest ready result per owner**
  (`processing-job-repository.ts:187-188`, `:210-217`), and retention-until-TTL makes several ready
  rows per owner more likely. File mode re-downloads all (`file-processing-job-repository.ts:183-195`).
  Re-download depends on the provider still serving the output (Pruna delivery is documented at
  about 24 hours, `PRIVACY_AND_TEMPORARY_DATA.md:269-271`); the ledger keeps `succeeded` either
  way.
- **Transient disk.** Up to 8 × 300 MB in `.tmp/video-jobs` for an hour, reclaimed by the deadline
  timer with no operator action. A disabled tick (`0`) does not affect expiry, which is the
  service's own timer; it does leave the reconciler with only its startup pass (the "Wiring"
  paragraph), so crash-orphaned rows then close at the next boot.
- **A new hard dependency before spend.** A ledger-store failure (an unreadable owner journal, an
  unavailable database) fails a new AI submission as `provider_unavailable` before any provider
  contact, by design; the client sees an accepted job that reads `failed`, never a 503 (model
  point 4). In file mode the dependency is one fsync and rename; in Postgres one three-statement
  transaction on the four-connection pool (`client.ts:20`). Mitigated by atomic writes, strict
  parsing and an ids-only warning.
- **Crash-window labelling.** A row whose durable row a restart marked `expired`, `ambiguous` or
  `failed` stays open until the next reconciler pass: at most about 60 s while the tick runs at
  any interval, since the reconciler keeps its own 60 s clock (at most 25 rows a pass), and until
  the next boot when `VIDEO_JOB_PROGRESSION_INTERVAL_MS=0`. A row with no durable row at all
  becomes `ambiguous` after `submittedAt + TTL`. That is cost-conservative and can overstate
  ambiguity only in that case.
- **Duration is app-observed** (poll lag up to 10 s plus download and inspection,
  `video-job-service.ts:607`). The caption and the contract comment carry the definition, or it
  will be read as provider time.
- **Provider on the Account surface** is a canon exception to record (`DOMAIN_MODEL.md:206`; the
  editor never shows it, `12-existing-video-processing.md:51`). Q2.
- **Unbounded ledger growth** in both modes until D14 (`DECISIONS_REQUIRED.md:158-166`). Rows are
  about 300 bytes; the file-mode rewrite cost grows with the per-owner journal.
- **The oracles fail until updated**: the route inventory (`route-inventory.test.ts:14`), the
  parity test (`shared-contract-parity.test.ts:115-116`), and every web test that opens the
  Account panel (`vitest.setup.ts:89`).
- **Logging is split**: the runner logs through pino while `VideoJobService` keeps `console.warn`
  (`video-job-service.ts:631`). Acceptable if the pino seam stays in the runner for this slice.
- **The tick shares the request process.** Four downloads of up to 300 MB each can run beside
  request handlers; today the same downloads run beside the requests that trigger them, so the
  ceiling is unchanged, but the trigger no longer needs a client.
- **Docs drift is already present** (§1.9) and is corrected in the same change.

## 5. Questions whose answers change the implementation

Only these six change what prompt 21 builds. Each carries a recommendation and what the other
answer costs.

**Q1: Must prov-7 be enforced rather than assumed?** Recommended: assume a single process, as the
canon states (`ARCHITECTURE.md:4`, `:1010-1011`; `DECISIONS_REQUIRED.md:116`), and write no lock
code; the design as written. If one host must be protected from a second process on the same
`LIGHTFRAME_DATA_DIR`, prompt 21 adds a data-directory lock (exclusive create plus heartbeat plus
stale takeover) gating the temp-root wipe (`video-job-service.ts:286`), restore (`:289`) and the
tick, with a follower that answers video-job routes 503; that changes behaviour for misconfigured
development setups. If several Postgres hosts must be safe, a per-job compare-and-set on
`processing_jobs.lease_owner` and `lease_expires_at` (`schema.ts:452-453`, the index at `:463`) is
the mechanism, but it must also gate the standalone upsert (`processing-job-repository.ts:132`)
and `#expireJob` (`video-job-service.ts:805`); that is a different slice.

**Q2: May `provider` be on the wire and shown as a muted fact?** Recommended: yes, as the bounded
string the contract paragraph in §3 describes, never an enum. The canon deprecates provider names
as choices (`DOMAIN_MODEL.md:206`), the queue contract already carries the field as a bounded
string (`packages/contracts/src/video-jobs.ts:199`), and the roadmap names it as a ledger column
(`PRODUCT_ROADMAP.md:93`). If no, drop the field from `aiUsageLedgerEntrySchema` and the span from
the panel; the column stays, because the ledger is also the operator's own record.

**Q3: When the tick retains a Project result, promote or retain only?** Recommended: retain
only, the default in model point 8, because adopting a result as the current cut with nobody
present is a user-flow change that needs an approval rather than a default (`CLAUDE.md:71-72`;
the roadmap asks to "retain results", `PRODUCT_ROADMAP.md:92-93`). Retain-only is a public
`ProjectProcessingService.retainResult(ownerId, projectId, jobId)` that runs the existing store
step (`project-processing-service.ts:649-663`) under the existing lock (`:608`), settles the
content lease as delivered once the bytes are in the owner store, and stops there; it calls
neither `promoteProjectJobResult` nor `retainProjectResult`, so no repository changes. The
attempt stays `ready` with `outputAssetId` null, the phase `saving-result`
(`packages/domain/src/video-processing/rules.ts:45`), and the operator's next `current()` runs
the unchanged `#reconcile`, whose first branch is exactly "bytes present, attempt not yet
updated" (`:611-616`, the partial-retention case the preallocated `resultAssetId` exists for,
`project-processing-repository.ts:47-48`), and promotes as today. Its cost: a restart between
retention and that visit re-drives the attempt to `retrieving` (`rules.ts:142-143` reads
`outputAssetId`, not the byte store) and re-downloads a result the owner store already holds; the
download is unpaid under the assumption stated in §3, and the later retention is a no-op. If Q3
approves promotion instead, Step 2 calls `reconcile`, the path the browser's timer drives today
with the operator present (`useProjectProcessingController.ts:615`), and the §4 "Unattended
promotion" risk applies. A third shape, `retainProjectResult` with `currentPromotion: null`
(`project-processing-repository.ts:151-157`), is not recommended: it completes the attempt as an
unpromoted historical result (`project-repository.ts:3131-3133`, `:3157`) that the operator must
adopt from History, which changes what happens on return.

**Q4: Does 2.5 need a browser surface for retained standalone results?** Recommended: no.
Server-side retention plus the ledger row satisfies the roadmap's "retrievable after closing the
browser" for the Project path, and the standalone re-attach surface is Phase 4
(`CURRENT_STATE_AUDIT.md:370`). A yes needs a listing of terminal-ready standalone jobs with a
download control, which means either a new GET or `expiresAt` on the ledger entry, and the Dashboard
queue contract widening past non-terminal jobs (`video-job-service.ts:532`).

**Q5: Which deadline anchor, creation (code) or acceptance (docs)?** Recommended: keep creation
and correct the three documents. Moving the code to acceptance changes `#createJob` (`:466`), both
durable writers (`processing-job-repository.ts:59`; `file-processing-job-repository.ts:169`), the
Project attempt (`project-processing-service.ts:482`), the deadline heap (which is pushed at
creation, `video-job-service.ts:495`) and the expiry tests, and it lengthens the window by the
time a job spends validating and submitting, which D14 has not weighed.

**Q6: Does the ledger cover synchronous image and voice AI?** Recommended: no, video jobs only,
which is what the prompt's schema implies with "job id" (`IMPLEMENTATION_PROMPTS.md:255`). Image
generation is the only place a provider cost is persisted today
(`reference-image-service.ts:529`) and those calls have no job id; including them means a second
write point per synchronous provider call, a synthetic id, and an `operation` enum that outgrows
`videoTransformOperationIdSchema`. The panel copy names the absence.

Everything else in §3, the field list, the coalesce rule, the interval default, the reconciler
cadence, the 50-row page, the copy, is a routine call made the way the nearest existing code makes
it, and prompt 21 proceeds on those defaults.

## 6. Verification evidence (prompt 22)

Prompt 22 (`IMPLEMENTATION_PROMPTS.md:263-266`) ran against the implementation of this plan. Every
provider was a local fake and the shared test setup denies outbound fetch, so nothing contacted a
live service at any step. Each criterion below gives the case that establishes it, the command that
was run and what it printed, and a file and line for every claim made about the code. Three
adversarial passes then tried to break the result, one per criterion group, and all three returned
partly verified rather than verified. What they could not rule out is in the second list at the end
rather than left implicit.

### 6.1 Submit, close the client, retrieve the result inside the deadline

**The case.** `apps/api/src/features/video-jobs/durable-ai-outcomes.verification.test.ts:236`,
"progresses an accepted job to a retrievable, retained result with no client watching". It builds
the app through `createApp` with a scripted provider and `videoJobProgressionIntervalMs: 5`, submits
through `PUT /api/video-jobs/:jobId`, and never asks the job for its status. The absence of a status
request is enforced rather than assumed: the test registers an `onRequest` hook and asserts that no
`GET /api/video-jobs/<id>` was served, both before and after the content reads (`:267`, `:273`).
Readiness is read from the durable trace rather than from the API. Both content reads answer 200
with the fixture bytes while `provider.downloads` stays at 1 (`:262-275`).

**The control that makes the tick load-bearing.** `:278`, "leaves the same job where it was when the
deployment runs no tick", runs the same scenario with the interval at 0. The trace is still `queued`
after the grace period, with zero status reads and zero downloads. `progressDueJobs` has one
non-test caller, the tick (`video-job-progression.ts:159`), and the tick is constructed only when
the interval is positive (`app.ts:469`).

**The code the retention half rests on.** `#settleDelivery` requests cleanup only for a delivered
Project-linked job (`video-job-service.ts:1534`), so a standalone job takes the flush branch and
stays admissible. The deadline is anchored at creation and written once,
`expiresAtMs = createdAtMs + VIDEO_JOB_TTL_MS` (`video-job-service.ts:517`), where the TTL is sixty
minutes (`packages/contracts/src/video-jobs.ts:26`).

**Where the deadline itself is proved.** Not in the app-level case above, but at the service layer
with a manual clock: `video-job-service.test.ts:1349` expires a retained standalone result at its
deadline, and `:1321` serves a delivered standalone result again after an interrupted delivery. The
route layer holds the same pair at `apps/api/src/features/video-jobs/routes.test.ts:453` and `:473`.

**Command.**
`bunx vitest run apps/api/src/features/video-jobs/durable-ai-outcomes.verification.test.ts` printed
`Test Files 1 passed (1)` and `Tests 5 passed (5)` in 6.87 s.

### 6.2 One ledger row per submission, idempotent under tick and poll races

**The case.** `durable-ai-outcomes.verification.test.ts:300`, "writes one usage row per submission
under a tick and client racing for the same job". The tick runs at 5 ms while the client polls every
10 ms, so both reach the same job through the coalescing refresh, which is where a duplicate row
would appear. Exactly one row is read back through a fresh file repository, its outcome is
`succeeded`, and the window counts report one succeeded row and nothing else. The stored
`submittedAt` is the opener's instant and not the closer's, separated by a wrapper that records
every `record()` call. A restart over the same data directory leaves the row byte-identical, and an
explicit reconciler pass over the same stores returns 0.

**The negatives in the same file.** `:377` records a refused submission once, as `failed`, and does
not submit it again. `:407` shows that when the ledger refuses the open write nothing is submitted
at all and the job fails as `provider_unavailable`, which is the no-row-no-spend ordering at
`video-job-service.ts:1199`.

**The rule that makes racing writers converge.** One domain rule owns every merge
(`packages/domain/src/ai-usage/rules.ts:58-66`): a settled row is never reopened, re-closed or
re-timed, and an incoming row that is itself still open writes nothing.

**Postgres cannot hold two rows for one submission.** Read back from the throwaway database on
compose 5433 after applying the migrations:
`ai_usage_ledger_owner_user_id_job_id_pk | PRIMARY KEY (owner_user_id, job_id)` and
`ai_usage_ledger_outcome_completed_consistent | CHECK (((outcome IS NULL) = (completed_at IS NULL)))`.
A refutation pass replayed the repository's own statement sequence in two interleaved psql sessions.
With two closers, the second writer's locking read returned the row the first had already settled,
so the rule dropped its write. With a closer arriving while the opener's insert was uncommitted, the
closer's insert blocked for about three seconds, inserted nothing, and then closed the opener's row,
leaving one row carrying the opener's `submitted_at`.

**File mode.** All four writer orderings settle on the first terminal outcome
(`apps/api/src/features/ai-usage/file-ai-usage-ledger-repository.test.ts:118`), and the same holds
across two repositories over one directory when the writes are sequential (`:186`).

**Commands.** `bunx vitest run apps/api/src/features/ai-usage`
`apps/api/src/features/video-jobs/video-job-progression.test.ts`
`apps/api/src/features/video-jobs/video-job-service.test.ts packages/domain/src/ai-usage` printed
`Test Files 6 passed (6)` and `Tests 100 passed (100)`. The file ledger suite on its own printed
`Tests 14 passed (14)`.

### 6.3 No automatic paid retry, audited on the tick path

**The rules audited**, read where they live: `CLAUDE.md:95`, `AGENTS.md:85`, `DOMAIN_MODEL.md:227`
and `PRODUCT_VISION.md:96`.

**Three provider call sites exist in the service**, and a grep over the file returns exactly them:
`video-job-service.ts:1225` (`submit`), `:1298` (`download`) and `:1363` (`status`).

**The tick reaches two of the three, and both are reads.** `progressDueJobs` awaits the constructor
promise, expires due jobs, filters, slices to the batch limit and then makes one outbound call,
`Promise.allSettled(due.map((job) => this.#refresh(job)))` (`:1429-1449`). `#refresh` calls
`status`, and only a `completed` answer launches `#retrieve`, which calls `download`. The single
`submit` call site sits inside `#submitProvider`, whose only callers are `startPrelinked` and
`#submit`, both driven by a request. The tick's view of each service is narrowed by type to
`Pick<VideoJobService, 'available' | 'progressDueJobs'>` (`video-job-progression.ts:43`) and
`Pick<ProjectProcessingService, 'retainResult'>` (`:46`).

**Retention and reconciliation touch no provider.** `ProjectProcessingService.retainResult`
(`project-processing-service.ts:639`) reads the attempt, checks the byte store, takes a local
content lease and stores bytes. The reconciler reads open rows, reads durable outcomes and writes
the ledger (`ai-usage-reconciler.ts:108`, `:120`, `:133`).

**Terminal and ambiguous jobs are excluded twice**, by `#ownsMutableJob` and by the explicit
`queued`/`processing` filter (`video-job-service.ts:1436-1437`), and each pass expires first
(`:1430`). `listResumable`, which mutates durable rows, has one call site and runs once per process
at construction (`:310`, `:317`).

**The bounds, as configured.** Four provider reads a pass, from `videoJobMaxActivePerProvider`
(default 4, `environment.ts:35`, wired at `app.ts:479`). A five second default interval, and no tick
object at all when the interval is 0 (`environment.ts:36`, `app.ts:469`). Three downloads per job
per process lifetime: the counter is incremented before the download (`video-job-service.ts:1289`),
guarded at `< 3` (`:1327`) and never reset mid-life. Twenty-five ledger rows a sweep, at most one
sweep a minute (`video-job-progression.ts:6`, `:13`). Retention retries back off to a five minute
ceiling (`:16`).

**Assertions.** `video-job-service.test.ts:1960` holds `provider.submissions` to one across three
concurrent passes and two status calls, and `:1963` holds `listResumable` to a single call. The two
app-level negatives are §6.2's `:377` and `:407`.

**Command.** The tick, reconciler and service suites are inside the 100-test run recorded in §6.2.

### 6.4 Migration 0025 verified in both modes

**Postgres.** `apps/api/src/infrastructure/database/ai-usage-ledger.postgres.integration.test.ts:98`
applies every migration to a throwaway database, applies them a second time, and asserts that the
journal rows and the whole table catalogue are unchanged. It then asserts the primary key, the
check, the foreign key and both indexes as rendered definitions, exercises the three rejections, and
drives the repository through concurrent writers, paging, window counts and the open sweep. It is
registered in CI at `.github/workflows/quality.yml:163`, one line later than the range §3 predicted,
and documented at `docs/TESTING.md:75-79`.

**Commands and their output.** `bun run db:migrate:development` against the throwaway
`lightframe_x_test` on compose 5433 printed `[✓] migrations applied successfully!` and exited 0. The
gated vitest run printed `Test Files 1 passed (1)` and `Tests 1 passed (1)`. Reading the live
catalogue back with psql returned exactly the primary key, the check, the foreign key and the two
indexes the test asserts, plus 26 rows in `drizzle.__drizzle_migrations` against 26 files in
`apps/api/drizzle/`. The developer's own database was never targeted.

**File mode needs no migration**, and the two cases §3 named exist.
`file-ai-usage-ledger-repository.test.ts:380` constructs the four sibling file repositories over a
directory that already holds the ledger and asserts their reads are exactly what they were without
it. `:411` shows the strict parse refusing an unknown `schemaVersion`, leaving the journal
unrepaired, and the sweep still serving the other owner. `:436` extends that to a fault that never
reaches the schema at all.

**Command.** The 14-test file ledger run recorded in §6.2.

### What is established

- A job that is submitted and then left alone reaches a retrievable result with no client request,
  and the tick, rather than anything else in the process, is what moves it.
- A delivered standalone result is served again from the same process, and the creation-anchored
  deadline still expires it.
- One row per submission survives a tick and a poll racing, a restart over the same data directory,
  and an explicit reconciler sweep.
- A refused submission and a refused ledger write each leave exactly one honest outcome and no
  second provider call.
- Neither store can hold two rows for one submission, and one domain rule decides every merge.
- The tick reaches only `status` and `download`, the single paid `submit` call site is request-driven
  on both paths, download attempts are capped at three per job per process, and the whole tick is
  switched off by `VIDEO_JOB_PROGRESSION_INTERVAL_MS=0`.
- Migration 0025 applies to an empty database, re-applies as a no-op, and produces exactly the
  primary key, check, foreign key and two indexes this plan specifies. File mode adds a directory
  the other file repositories do not see.

### What verification found and changed

Verification is worth running only if it is allowed to fail, and this pass failed four times. Each
defect below was found by prompt 22, fixed in the source, and pinned by a regression test that the
old code does not satisfy. They are recorded here rather than quietly repaired, because the plan
claimed some of them could not happen.

- **Two ledger repositories over one data directory lost a whole row.** The per-owner write chain
  was a field on the instance, so two repositories read, modified and renamed the same journal and
  the later write erased the earlier row. The chain is now keyed by the journal's own resolved path
  at module level, which is still deliberately not the shared owner lock a ledger write must never
  nest inside. A probe reproduced the loss five times out of five before the fix and none after, and
  `file-ai-usage-ledger-repository.test.ts` now opens two submissions from two instances at once and
  asserts both survive.
- **A terminal transition landing inside the open write left the row open.** The row was marked
  opened only after the write resolved, so a job that expired or was abandoned in that window was
  never closed by the process that did the work. The mark now happens before the write and is put
  back only when the write fails, so the close always fires and a submission that never reached the
  provider still leaves no row. `video-job-service.test.ts` holds the open write, expires the job
  and asserts one closed row.
- **The paid call was made against state one ledger round trip stale.** The ownership check ran
  before the ledger write and not again after it, so an abandon that arrived during the write landed
  after the provider had already been paid. Both submission paths now re-check after the write.
  Two cases assert the provider was never asked to submit.
- **A shadow mirror that threw before returning a promise failed the write the journal had already
  accepted.** The guard was attached to the returned promise. The call now goes through a resolved
  promise first, so a rehearsal store cannot fail a real write, which is the one thing it must never
  do.

### What is not established, or is assumed

- **The billing assumption stands as an assumption.** Verified: both adapters' `status` and
  `download` calls are plain authenticated GETs, and only `submit` sets a method
  (`decart/video-job-provider.ts:136`, `pruna/video-replace-provider.ts:226`). Not verified: that
  these providers do not meter status polls or result egress. If they do, the tick's unattended
  traffic is the exposure, bounded at four reads a pass every five seconds and switchable off.
- **The tick adds unattended provider traffic**, which `AGENTS.md:85` names alongside paid retry. It
  is bounded and disclosed above, so this is not "no new traffic". A restart also re-downloads a
  `ready` result on the restore path (`video-job-service.ts:380`), which is a re-retrieval of work
  already paid for, not a resubmission, and the tick makes it more likely by driving more jobs to
  `ready` unattended.
- **The app-level "within TTL" assertion is vacuous.** The whole case runs in about a tenth of a
  second against a one-hour deadline (`durable-ai-outcomes.verification.test.ts:265`), so it would
  pass even if the anchor moved. The creation anchor is established only by the service-layer case
  with a manual clock.
- **Retrievability across a restart inside the TTL is untested.** The service wipes its temp root at
  construction (`video-job-service.ts:307`), so a restart destroys the retained bytes and recovery
  re-downloads them, and the owner's next submission is refused while the restored job is
  non-terminal.
- **The second retention case §3 named was not implemented**: a restart after a delivered download
  asserting the re-download, the `generation_in_progress` refusal and the refusal clearing. The
  operator-visible cost of retention is therefore unverified.
- **The standalone criterion is met as a server capability, not as a user journey.** The browser
  holds the standalone job id in memory alone, which §3 records as accepted exception Q4, and the
  verification test mints the id itself.
- **The no-status-request guard is not self-validating.** Nothing asserts that any request was
  recorded, so plumbing that stopped invoking the hook would leave both assertions passing on an
  empty list.
- **Cross-process journal writing remains unguarded.** The fix above serializes every writer inside
  one process. Two processes on one data directory would still interleave a read, a modify and a
  rename, and nothing prevents that; prov-7 excludes the configuration rather than the failure, and
  Postgres is immune because its write is one transaction.
- **The bounded download retry is now self-driving and untested.** A retryable download failure
  requeues the job to `queued` (`video-job-service.ts:1329`) and the tick re-enters it with nobody
  watching, capped at three attempts. The cap was established by reading the code, not by a test.
- **Shadow mode is verified in neither direction.** The Postgres case constructs the relational
  repository standalone and the file case's mirror is a fake that always rejects, so the
  configuration where both stores are live (`persistence-factory.ts:120`) is untested. In it, the
  mirror's arrival order is not guaranteed to match the journal's chosen winner, which a refutation
  pass called plausible and could not demonstrate.
- **The migration test calls the programmatic migrator, not the shipped `drizzle-kit migrate`.** The
  shipped command was run by hand against the throwaway database and the catalogue read back
  matches, so the fact holds while the test's own coverage does not reach the deployment command.
- **The gated Postgres file skips silently in ordinary local validation.** Run without the gate it
  printed `Test Files 1 skipped (1)` and `Tests 1 skipped (1)`. It does run in CI.
- **The Postgres two-terminal-writer case asserts survival, not a winner.** Which concurrent writer
  lands first is decided by row-lock arrival and is not observable from the test, so that case
  asserts one surviving row with one writer's coherent pair. First-terminal-wins itself is proved by
  the two deterministic cases beside it.
- **Criteria 1, 2 and 3 came back partly verified** on the first pass, and criterion 4 with the
  shadow and deployment-path gaps above. The four defects that made them partly verified are fixed
  and listed above; the bullets that remain in this list are coverage gaps and assumptions, not
  known defects. Nothing here was reported as passing that was skipped or blocked.

Verification ran on 2026-09-06 against commit `b4ab68b9`. The four defects it found were fixed
in the commit that carries this section, and the counts above are from the suites as they stand
after those fixes.
