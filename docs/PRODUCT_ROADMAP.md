# Lightframe Studio product roadmap

**Status:** directional product roadmap; no calendar commitment

**Current behavior:** [README](../README.md) and [user stories](userStories/README.md)

**Product model and principles:** [Product vision](PRODUCT_VISION.md)

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

This phase does not include Campaigns, user-facing Projects, collaboration, multi-format output, or
publishing.

## Foundation already present — Durable Project model

**Status: implemented technical foundation; not a user-facing capability.**

The domain, HTTP schemas, database schema, and authoritative relational repository define a
video-oriented `Project` aggregate with immutable revisions and links to source/working media,
processing jobs, and Saved Video outputs. No Project routes or browser UI use it, and existing
Saved Videos are not assigned to Projects.

This foundation should be evolved, not advertised as a finished Project experience. It represents
a focused production effort, not a Campaign.

## Parallel enabling track — Account and service readiness

**Status: seeded authentication and configuration-gated persistence exist; public-service work is
deferred.**

Real signup and recovery, multi-device sessions, tenancy, plans and usage, production operations,
retention and portability, abuse controls, and public deployment are enabling capabilities rather
than definitions of the creative product. They may progress alongside the product phases, but they
must reach the appropriate gate before shared workspaces, direct publishing, or a public service is
offered. The [account and infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md)
owns the detailed sequence and launch evidence.

## Phase 2 — User-facing Project workspace

**Status: planned direction.**

- Add owner-derived Project application services, HTTP routes, and accessible Studio UI.
- Create, name, resume, archive, and safely delete or restore Projects.
- Connect Project revisions to exact source assets, creative selections, edit specifications,
  provider jobs, saved outputs, and export intent.
- Present lineage and recovery without loading large media eagerly.
- Add Project-level organization such as search, filters, tags, status, and recently used creative
  resources only after their semantics and persistence authority are defined.
- Decide whether independently resumable deliverables are required inside a Project before
  implementing the deferred child model.

A Project may initially stand alone. Campaigns should not be simulated through Project titles or
unstructured tags.

## Phase 3 — Campaign organization and creative variations

**Status: long-term direction; no Campaign model exists.**

- Introduce Campaigns as a separate owner-scoped aggregate above Projects while deciding whether
  Projects may also stand alone.
- Capture a campaign brief, goal, audience, channels or placements, and shared creative context.
- Group Projects and approved assets without transferring or weakening their ownership.
- Represent deliberate variations for audience, message, platform, aspect ratio, placement, or
  experiment separately from immutable version history.
- Add campaign-level asset views, tags, grouping, and review states.
- Define archive, detach, delete, retention, and portability behavior across Campaign–Project–Asset
  relationships before schema or UI work.

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

Add Campaigns through an explicit owner-constrained relationship. Do not repurpose the current
Project table as a Campaign or make a Project title carry campaign semantics. Decide whether
Projects may stand alone, move between Campaigns, or belong to more than one Campaign before
choosing keys and deletion rules.

### Media-neutral asset identity

The existing media-asset boundary already provides opaque IDs, ownership, byte lifecycle, MIME and
inspection metadata, and relationship-safe retention. Future content types should extend that
boundary with a discriminated media kind and format-specific metadata rather than funneling every
record through `SavedVideo` or assuming all assets are playable media.

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
