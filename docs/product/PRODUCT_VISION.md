# Lightframe Studio — Product vision

**Document type:** canonical product direction. This file states what Lightframe Studio is becoming.
What the product does _today_ is recorded in the
[current-state audit](../audits/CURRENT_STATE_AUDIT.md); how it gets from here to there is the
[roadmap](../roadmap/PRODUCT_ROADMAP.md). Terminology is defined once, in the
[domain model](DOMAIN_MODEL.md).

## Purpose

Lightframe Studio is an easy-to-use, browser-based digital media creation studio. It helps
individuals, brands, marketing teams, and content creators turn raw footage into polished,
export-ready media for the places that media actually goes: social posts, social and digital
advertisements, blog and website content, product marketing, and brand campaigns.

## The problem

Producing marketing media today means moving work through disconnected tools: a camera app, an
editor, one or more AI generation tools, local folders, and whatever delivers the file. That
fragmentation makes it hard to move from an idea to a finished deliverable, to keep originals and
versions straight, to reuse creative elements (people, outfits, voices, prompts), and to produce
the platform-specific variants each channel needs.

Lightframe Studio joins those stages into one understandable workflow: import or record, edit,
optionally transform with AI, compose, preview, and export — with every intermediate kept, every
original preserved, and every output attributable to what produced it.

## Intended users and jobs to be done

- **Creators and small businesses** — "I shot something on my phone; make it presentable and get me
  the right file for Instagram/TikTok/my site, without a professional editing suite."
- **Marketing and social teams** — "Adapt this footage for several placements and keep the variants
  of one campaign organized together."
- **Brands and e-commerce teams** — "Produce launch, product, and promotional creative repeatedly,
  reusing our established characters, looks, and voices."
- **Agencies and small creative teams** — "Manage repeated production and variants per client
  without losing lineage."

The current deployment is local-first and single-operator. Team tenancy, sharing, and any hosted
service are explicitly future work with their own gates (see
[Decisions required](../DECISIONS_REQUIRED.md)).

## Value proposition

One coherent pipeline from footage to deliverable. Not a camera demo, not an AI toy, not a file
manager: a place where uploading footage reliably ends in a finished, correctly-shaped, downloadable
video — and where AI is a set of optional power tools inside that pipeline, never the pipeline
itself.

## Product hierarchy

- A **Campaign** is an optional organizational umbrella for related Projects — a name and a brief,
  nothing heavier. Example: "Nike Fall Running Apparel" holding one Project per placement (vertical
  Reel, square paid ad, widescreen site video, teaser, testimonial edit). Campaigns organize; they
  never own media, never gate creation, and are never required.
- A **Project** is an outcome-focused production workspace. Its job is to guide the user from source
  media to a clearly identified final deliverable and its exports. A Project can hold multiple
  source videos, working edits, AI-generated results, a composition that combines clips, saved
  output versions, and platform-specific export variants. A Project may stand alone or belong to at
  most one Campaign.
- **Libraries** (Videos, Characters, Outfits, Voices) hold reusable, account-level material that
  Projects draw from and contribute back to.

Precise definitions, lifecycles, and relationships live in the [domain model](DOMAIN_MODEL.md).

## The core workflow

1. Create a standalone Project, or create one inside a Campaign.
2. Upload one or more videos (or record with the camera).
3. Organize and preview the Project's media.
4. Edit manually, on-device: trim, split, reorder and stitch clips, crop and reframe, change aspect
   ratio, adjust lighting and color, adjust audio levels, add and position subtitles over time
   ranges.
5. Optionally apply AI transformations — character replacement, outfit try-on, background work,
   voice treatment, automatic captions — whose outputs land back in the Project as usable assets.
6. Combine clips and created assets into a final composition, and keep editing it.
7. Preview the result accurately.
8. Save progress at any point and safely return later.
9. Identify the final deliverable and export it — including platform-specific variants (widescreen,
   vertical, square, tall) — as downloads.
10. Archive the Project when done; restore it later if needed.

## AI is optional, not the foundation

The complete workflow above must work end to end with no AI at all. AI features are power tools
that reduce effort or enable otherwise-impractical results:

- character/person replacement, outfit and accessory replacement, background generation, voice
  transformation, live on-camera transformation, automatic captions, reframing assistance.

Rules that every AI capability must satisfy:

- It is never a mandatory step, a blocker, or the organizing principle of a surface.
- It preserves the original input and is reversible where possible.
- It communicates processing time, cost, and failure states before and during work; cost-bearing
  submissions require explicit intent, and there is no automatic paid retry or fallback.
- Its output returns to the Project (or a Library) as a first-class asset. No generated result may
  end up orphaned outside the workflow.

## Video-first scope

Video is the primary medium and the only committed one. The architecture may leave room for other
media kinds, but no image/audio/graphic workflow is claimed until an end-to-end create → edit →
save → export → clean-up path exists for it. Do not generalize models ahead of a real second
consumer.

## Non-negotiable product principles

1. Beginner-friendly without feeling like a toy; a first-time user understands where to begin
   without documentation.
2. Campaigns are optional organization; Projects are where outcomes are produced.
3. Optimize for reaching a completed export, not for generating isolated assets.
4. Core creation and editing never require AI; AI is clearly optional and lives inside the same
   workflow.
5. Editing is non-destructive wherever practical; originals are always preserved.
6. The user always knows what is saved, processing, failed, ready, selected, or final.
7. Every action has a clear result and a logical next step; no dead ends.
8. Anything one tool creates is usable by the rest of the Project.
9. Consistent terminology and visual patterns everywhere (the [domain model](DOMAIN_MODEL.md) is
   the vocabulary authority).
10. Intentional, professional design — not a generic AI-tool interface.
11. Performance, reliability, data safety, privacy, and recoverability are product features.
12. Architecture supports growth without premature generalization; prefer incremental vertical
    slices over big-bang rewrites; leave every touched area cleaner without expanding scope.

## MVP boundary

The MVP is **one Project that ends in the right file**, delivered in two stages:

**Stage A — the polished single-clip deliverable (close what exists).** A user can create a
Project; bring in one video (upload or record); trim, crop, reframe, color-correct, adjust audio
level, and add timed subtitles on-device; optionally run character/outfit/voice AI whose results
return to the Project; preview accurately; save versions; export the deliverable in one or several
placements; archive and restore. The manual editor is a first-class Project surface, not an annex
of an AI wizard.

**Stage B — composition (the studio).** A Project accepts multiple source videos; clips can be
trimmed, split, reordered, and stitched into one composition; subtitles and audio settings apply
across the composition; the composition is the thing that gets previewed, saved, and exported.

Explicitly **in** MVP: standalone Projects, optional Campaigns (name + brief + a useful overview of
what they contain), version history, placement variants, download-based export.

Explicitly **not** in MVP: publishing/scheduling integrations, collaboration/review/approvals,
comments, multi-user accounts and tenancy, billing, brand kits, templates, analytics, multi-format
(non-video) media, server-side rendering farm. These are future possibilities, sequenced in the
[roadmap](../roadmap/PRODUCT_ROADMAP.md) — several deliberately rejected until validated.

## Future possibilities (not commitments)

Richer campaign context (target placements, due dates, brand assets), reusable creative presets and
templates, brand kits, batch/variant export sets, caption styling presets, audio normalization,
review and approval, shared libraries and collaboration, publishing integrations, product
analytics, additional media formats. Each requires validated need and its own security, privacy,
cost, and operational gates before implementation.

## Non-goals

- Becoming a full marketing-management platform (planning, calendars, budgets, KPIs).
- Becoming a professional NLE competing with desktop editors on depth.
- Shipping AI capability for its own sake; every AI feature must reduce effort, improve quality, or
  enable something otherwise impractical.
- A public multi-tenant service, until the deferred account/infrastructure gates are deliberately
  reopened.

## Success criteria

A new user can: sign in and immediately understand what the product does; create a standalone
Project or organize work in a Campaign; upload one or more videos and understand where they are
stored; edit without AI; optionally apply AI and see the outputs inside the same Project; select,
arrange, trim, and stitch clips into a final composition; add and position subtitles; adjust visual
and audio properties; preview the result; save and reopen safely; clearly identify the current
final deliverable; export the right format, with platform variants; archive and restore; and
recover from upload, processing, AI, rendering, or export failures without losing work. The product
feels coherent, fast, safe, and intentional throughout.
