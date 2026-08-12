# Lightframe Studio product roadmap

**Status:** directional product roadmap; no calendar commitment

**Current behavior:** [README](../README.md) and [user stories](userStories/README.md)

**Product model and principles:** [Product vision](PRODUCT_VISION.md)

**Next implementation program:** [Campaign and Project MVP definition](MVP_DEFINITION.md) and
[remaining implementation sequence](implementation/LIGHTFRAME_MVP_IMPLEMENTATION_SEQUENCE.md)

This roadmap describes how Lightframe Studio can grow from the implemented video-focused Studio
into a broader content creation and campaign workspace. Phases express product dependency and
learning order, not promised dates. Every future phase requires validated user need, explicit
scope, and the security, privacy, cost, retention, accessibility, and operational gates appropriate
to that capability.

## Phase 1 — Video-focused creative Studio

**Status: implemented current product, with configuration-dependent capabilities.**

- Record a browser camera source or import a compatible video.
- Review and locally adjust video through trim, crop, rotation, flip, lighting, filters, and
  validated H.264/AAC export.
- Apply zero or one visual transformation—Character Swap or Virtual Try On—and optionally apply a
  local or configured provider-backed Voice treatment.
- Prepare and record advanced live character or try-on work.
- Create and reuse Characters, Character variants in Wardrobe, Outfits, Voices, prompts, recipes,
  and immutable reference media.
- Save video outputs, append immutable versions after confirmation, browse and filter Saved Videos,
  preview, rename, reuse, delete, and download.
- Derive ownership from an authenticated seeded local user and keep provider work explicit,
  bounded, sanitized, and non-fallback.
- Use local persistence by default, with configuration-gated PostgreSQL/Neon and private R2
  infrastructure.

This phase does not include Campaigns, a browser Projects workspace, collaboration, multi-format
output, or publishing. Empty Project lifecycle authority and APIs are implemented as Phase 2
infrastructure but are not yet a user-facing browser capability.

## Foundation already present — Durable Project model

**Status: implemented technical authority and lifecycle API; not a user-facing browser capability.**

The domain, HTTP schemas, database schema, local/shadow file authority, and authoritative
relational repository define a
video-oriented `Project` aggregate with immutable revisions and links to source/working media,
processing jobs, and Saved Video outputs. Authenticated APIs support empty create, bounded list,
current read, rename, archive, and restore; no browser UI uses them, and existing Saved Videos are
not assigned to Projects.

This foundation should be evolved, not advertised as a finished Project experience. It represents
a focused production effort, not a Campaign. Before Project writes become user-facing, the known
revision-lineage, exact-Version-reference, output-replay, retention, current-status, bounded-read,
and local-persistence gaps in the [MVP alignment audit](MVP_ALIGNMENT_AUDIT.md) must be corrected.

## Parallel enabling track — Account and service readiness

**Status: seeded authentication and configuration-gated persistence exist; public-service work is
deferred.**

Real signup and recovery, multi-device sessions, tenancy, plans and usage, production operations,
retention and portability, abuse controls, and public deployment are enabling capabilities rather
than definitions of the creative product. They may progress alongside the product phases, but they
must reach the appropriate gate before shared workspaces, direct publishing, or a public service is
offered. The [account and infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md)
owns the detailed sequence and launch evidence.

## Phase 2 — Campaign and Project video workspace MVP

**Status: in progress; invariant correction and lifecycle authority/API are implemented.**

- Correct the dormant Project foundation's revision and media-reference lineage, transaction/replay,
  retention, status, read-bounding, and cleanup invariants before exposing writes.
- Add owner-derived Project services, HTTP routes, local/relational persistence parity, and an
  accessible Projects workspace for create, list, open, rename, archive, and restore.
- Introduce a deliberately small Campaign aggregate—name and optional brief—that groups Projects
  without owning their media or processing state.
- Keep Campaign membership optional: one Campaign may group many Projects, a Project belongs to
  zero or one Campaign, and “No Campaign” is a virtual view rather than a default row.
- Allow owner-checked Project move/detach. Campaign archive never archives Projects, and guarded
  Campaign deletion requires all Projects to be detached or moved.
- Accept a durable recorded, uploaded, or explicitly reused video source before calling a Project
  resumable; restore exact Project state after navigation or restart.
- Connect Project revisions to exact applied creative intent, current edit specifications,
  processing jobs, durable results, and Saved Video/Video Version outputs.
- Preserve Project Revision as creative state and Video Version as playable media history; expose
  bounded history and download an exact ready Version.
- Keep one active focused video workflow per Project. Do not implement the deferred Deliverable
  child or a generic user-facing Asset platform for this MVP.

The objective criteria and twelve focused implementation prompts are maintained in the linked MVP
documents. This phase remains local-first, loopback-only, single-operator, and video-focused; it is
not a public-service launch.

## Phase 3 — Post-MVP organization and creative variations

**Status: future direction after the Campaign/Project MVP is validated.**

- Enrich Campaign briefs only with demonstrated needs such as goals, audiences, channels,
  placements, timing, or shared context.
- Add Project/Campaign search, filters, tags, favorites, folders, bulk organization, or review states
  only after their semantics and persistence authority are defined.
- Represent deliberate variations for audience, message, platform, aspect ratio, placement, or
  experiment separately from immutable Project revisions and Video Versions.
- Evaluate independently resumable Project Deliverables only if one focused workflow per Project
  proves insufficient.
- Add campaign-level approved-asset views without transferring asset, output, or reusable-resource
  ownership.
- Defer calendars, approvals, analytics, scheduling, publishing, and integrations to their explicit
  product and service-readiness gates.

## Phase 4 — Multi-format content Studio

**Status: long-term vision.**

- Extend creation and editing into image, product imagery, graphics, social and advertising
  creative, and other validated digital formats.
- Support cross-format derivatives and coordinated variations from common Project or Campaign
  context.
- Add format-appropriate previews, thumbnails, metadata, validation, processing, and exports.
- Evolve the current video-oriented Project snapshot through explicit schema versions or
  format-specific workflow state; do not merely rename video fields to generic fields.
- Preserve specialized lifecycle owners for video, image, audio, graphics, and their derivatives.

No additional content type should be claimed until an end-to-end create/import, edit, save,
organize, export, retention, and cleanup path exists for it.

## Phase 5 — Brand and creative intelligence

**Status: long-term vision.**

- Add reusable brand resources such as logos, colors, typography, products, approved imagery,
  styles, and usage rules.
- Add saved prompts, creative recipes, templates, and Project/Campaign defaults with explicit
  scope and version behavior.
- Help users maintain consistency and generate useful variations from approved context.
- Offer recommendations as reviewable assistance, never as invisible provider work or an authority
  that overrides brand rules.

## Phase 6 — Export, distribution, and publishing

**Status: download exists for Saved Videos; all other items are future direction.**

- Add channel-aware export presets, filenames, metadata, aspect ratios, resolution, and format
  validation.
- Generate delivery-ready bundles or variants for approved destinations.
- Explore scheduling and direct publishing after authentication, permission, token retention,
  revocation, failure recovery, moderation, audit, and support ownership are approved.
- Add advertising, social, CMS, or marketing-platform integrations only when intentionally scoped;
  this roadmap makes no commitment to a particular vendor.
- Keep export usable without requiring direct publishing.

## Phase 7 — Collaborative creative workspace

**Status: long-term vision; blocked on real-account and public-service decisions.**

- Introduce organizations or teams, memberships, and roles without overloading immutable resource
  ownership.
- Add shared Projects and Campaigns, comments, review, approval, and creative history with an
  auditable actor model.
- Define notification, conflict, presence, access-transfer, sharing, and offboarding behavior.
- Add shared asset libraries with explicit tenant, grant, retention, and deletion policy.
- Complete real account lifecycle, tenancy, abuse protection, privacy, backup/restore,
  observability, and public deployment gates before representing collaboration as available.

The [deferred account and infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md)
owns those service-readiness details.

## Cross-phase product rules

Every phase must preserve these rules:

- Current and future capability are labeled separately.
- Campaign, Project, Asset, Version, and Variation remain distinct concepts.
- Original/source assets and immutable lineage remain recoverable where policy permits.
- Product language describes outcomes first; provider and model details remain behind app-owned
  contracts and appear only where operationally relevant.
- Cost-bearing provider work requires explicit intent, bounded execution, and no automatic
  billable retry or fallback.
- Ownership derives from verified server identity. Relationships never infer ownership from IDs,
  paths, providers, devices, or client claims.
- New content types define their own validation, preview, storage, retention, derivative, and
  cleanup behavior.
- Export remains independent of direct publishing, and failure to publish must not destroy an
  approved asset.

## Future architecture considerations

These considerations guide later design; none are implementation claims.

### Campaign and Project relationships

The MVP decision is an explicit owner-constrained one-to-many relationship: a Campaign has many
Projects, and a Project belongs to zero or one Campaign. Projects may stand alone, move, or detach;
they do not belong to several Campaigns. “No Campaign” is a virtual query bucket. Campaign archive
and guarded tombstone never cascade into Projects or content. Do not repurpose the Project table as
a Campaign or make a Project title carry campaign semantics.

### Media-neutral asset identity

The existing media-asset boundary already provides opaque IDs, ownership, byte lifecycle, MIME and
inspection metadata, and relationship-aware retention for its current consumers. It does not yet
consult dormant Project relationships; that gap is Phase 2 work. Future content types should extend
the boundary with a discriminated media kind and format-specific metadata rather than funneling
every record through `SavedVideo` or assuming all assets are playable media.

### Versions, variations, and derivatives

Keep version history, creative alternatives, and technical derivatives separate. A thumbnail or
transcode is not a campaign variation; a platform-specific creative alternative is not merely an
older version. Store parent/derivation relationships explicitly and prevent deletion while a
retained dependent still needs an asset.

### Project snapshots

Snapshot v1 is intentionally video-oriented, including video edit and MP4 export specifications.
Multi-format support requires a reviewed snapshot schema version and migration, likely with
format-specific workflow payloads. Unknown versions must fail safely; old Projects must remain
readable or explicitly migrated.

### Storage and delivery

PostgreSQL should remain metadata and relationship authority while the selected byte store owns
private content. Future formats need validated MIME type, dimensions or duration as applicable,
checksums, thumbnails/previews, derivative roles, lifecycle state, and bounded delivery. Publishing
credentials and destination IDs belong in a separately secured integration boundary, not asset
metadata exposed to the browser.

### Search and intelligence

Search indexes, embeddings, recommendations, or brand intelligence are derived systems, not
ownership authority. They need rebuild, deletion propagation, privacy, model/provider, cost, and
stale-result rules before use.

### Collaboration and review

Future collaboration needs immutable actors, tenant membership, resource grants, comment/review
records, and optimistic concurrency. Do not infer team access from creator IDs or reuse the current
single-user owner field as a membership model.

## Decision gates

Before moving a future phase into implementation, record:

1. the validated user problem and smallest end-to-end workflow;
2. the current-versus-new capability boundary and migration/rollback plan;
3. ownership, authorization, retention, deletion, and portability rules;
4. provider, cost, privacy, moderation, and failure responsibilities;
5. accessibility, device, performance, test, and support expectations; and
6. the canonical documents and observable user story that will own the behavior after launch.
