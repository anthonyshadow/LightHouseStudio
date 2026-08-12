# Lightframe Studio product vision

**Document type:** product direction; current behavior is identified explicitly

**Current product authority:** [README](../README.md),
[Architecture](ARCHITECTURE.md), and [user stories](userStories/README.md)

## Vision

Lightframe Studio is a creative workspace for producing, customizing, organizing, and delivering
digital marketing assets. It is intended for brands, marketers, creators, agencies, and small
creative teams that need to turn an idea or existing asset into campaign-ready content without
moving work through a collection of disconnected generation, editing, file-management, and
delivery tools.

The implemented product is narrower than that vision. Today, Lightframe Studio is a local-first,
single-operator studio centered on video creation and transformation. It records or imports video,
supports local editing and optional creative transformations, maintains reusable characters,
outfits, and voices, saves versioned video outputs, and downloads finished work from Saved Videos.
It also provides user-facing empty Projects and lightweight optional Campaign organization.
Project source/resume, multi-format creation, collaboration, and direct publishing do not exist yet.

The intended product lifecycle is:

**Campaign → Project → Create or Import → Edit or Transform → Organize → Review → Export or Publish**

This lifecycle is directional, not a description of the current navigation.

## Product mission

Help creative and marketing teams produce more useful content with less workflow fragmentation:
reuse established creative elements, make purposeful variations, preserve source material and
lineage, keep work organized, and move finished assets to the channels where they create value.

AI accelerates parts of that work. It is an enabling technology, not the product definition.
Likewise, video is the initial primary medium, not the permanent boundary of the product.

## Target users

Lightframe Studio is being designed for:

- brands and e-commerce teams producing launch, product, promotional, and advertising creative;
- marketing and social teams adapting content for audiences, channels, placements, and campaigns;
- creators and small businesses that need approachable production tools without a professional
  editing stack; and
- agencies and creative teams managing repeated production, variants, and reusable client or brand
  assets.

The current loopback application is not a public team service. Organization tenancy, shared
workspaces, roles, approvals, billing, and public deployment require separate product, security,
privacy, and operational decisions.

## Core user problem

Digital content production is often split across generation tools, editors, local folders, asset
libraries, planning systems, review channels, and publishing products. That fragmentation makes it
hard to:

- move quickly from an idea or source asset to a finished deliverable;
- generate useful variations without repeating setup and creative direction;
- preserve originals, understand lineage, and recover earlier versions;
- find and reuse characters, voices, styles, prompts, product imagery, and brand elements;
- keep work connected to a project or campaign goal; and
- export or distribute the right asset for the right audience and placement.

Lightframe Studio should join those stages into one understandable creative workflow while keeping
cost-bearing provider actions explicit and advanced tools approachable.

## Product state

### Current product

The current Studio supports:

- a loopback-only, authenticated single-operator workspace with local persistence by default and
  configuration-gated PostgreSQL/Neon and private R2 adapters;
- browser camera recording and compatible video upload;
- local trim, crop, rotation, flip, lighting, filter, normalization, and export work;
- optional Character Swap, Virtual Try On, live character transformation, and voice treatment that
  runs locally or through a configured provider;
- reusable saved Characters, Character variants in Wardrobe, Outfits, recipes, and Voices;
- immutable reference media, explicit source/result handling, and non-destructive saved-video
  versions;
- a Saved Videos gallery with metadata, filtering, preview, rename, delete, reuse, and download;
  and
- durable empty Projects plus lightweight optional Campaigns, with lifecycle and membership parity
  across local/shadow and authoritative relational modes.

Projects and Campaigns have authenticated browser and HTTP lifecycle surfaces. Current Studio
creative work is not automatically placed in a Project, existing Saved Videos are not backfilled,
and empty Projects do not yet accept or resume media.

### Near-term product direction

The next coherent product layer attaches one immutable durable video source to the existing Project
workspace. A Project remains one focused video workflow and may stand alone; the implemented
Campaign relationship remains optional, owner-constrained, and non-cascading. Campaign has only a
name, optional brief, lifecycle, and fast New Project path.

Project should connect working context, source media, creative choices, jobs, versions, and outputs
without turning a Saved Video into editable project state. Rich Campaign planning, search, tags,
review states, and reusable defaults should be introduced only with validated value and explicit
ownership and lifecycle rules. See the [MVP definition](MVP_DEFINITION.md) for the bounded target.

### Long-term product vision

Future versions are expected to enrich Campaign planning, broaden Assets beyond video, deepen brand
and creative reuse, support structured review and collaboration, and help deliver approved content
through channel-appropriate export and publishing workflows. These are roadmap directions, not
current commitments or capabilities.

See the [product roadmap](PRODUCT_ROADMAP.md) for the proposed progression and the separate
[account and infrastructure roadmap](deferred-account-and-infrastructure-roadmap.md) for account,
public-service, security, and operational gates.

## Product model

| Concept           | Durable meaning                                                                                        | Current status                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Workspace         | The user's overall Lightframe Studio environment, libraries, settings, and accessible work             | One authenticated, single-operator Studio exists; shared/team workspaces do not                          |
| Campaign          | A marketing or creative initiative that can group Projects; richer planning context can evolve later   | Minimal optional aggregate, local/relational persistence, lifecycle API/UI, and guarded deletion exist   |
| Project           | A focused production effort with resumable creative intent, sources, revisions, jobs, and outputs      | Empty lifecycle UI/API and durable authority exist; source/session resume is not implemented             |
| Content           | Creative material and messaging independent of file format or storage representation                   | Broad product term; current finished output is primarily video                                           |
| Asset             | A piece of imported, generated, transformed, or organized content with ownership, type, and lineage    | Media/reference asset infrastructure exists, but user-facing saved outputs and workflows are video-led   |
| Version           | An immutable state in the history of the same logical record                                           | Implemented for Saved Videos and Project revisions; not a generic all-content version model              |
| Variation         | A purposeful alternative for another audience, placement, format, message, or treatment                | Some outputs and Character variants can serve this purpose; no generic campaign variation model exists   |
| Character         | A reusable creative identity with saved reference, prompt, and related selections                      | Implemented as a saved creative resource                                                                 |
| Character variant | A saved Wardrobe child of one Character with an exact reusable reference                               | Implemented; not the same as a generic campaign Asset variation                                          |
| Creative resource | A reusable input or direction such as a Character, Character variant, Outfit, Voice, recipe, or prompt | Characters, variants, Outfits, Voices, and recipes are implemented with different persistence lifecycles |
| Library           | An organized collection intended for finding and reusing retained records                              | Saved Videos, Saved Characters, Saved Outfits, Saved Voices, and Recipe Shelf exist                      |
| Gallery           | A visual library view optimized for browsing and acting on media records                               | Saved Videos is the current gallery; Gallery is not a separate ownership model                           |
| Export            | Producing a validated deliverable in a chosen file, format, size, or channel-ready specification       | Video rendering and download exist; broader export presets do not                                        |
| Publish           | Sending an approved asset to an external destination through an authorized integration                 | Vision only; no publishing or scheduling integration exists                                              |

Campaigns and Projects are separate concepts. The MVP decision allows one Campaign to group many
Projects while a Project belongs to zero or one Campaign and may stand alone. Campaign lifecycle
does not cascade into Projects. The current `Project` aggregate must not be relabeled as a Campaign
or overloaded with campaign planning.

## Asset model

Use **asset** or **content** as the media-neutral product term, then name the actual format when it
matters. Today, most finished assets are videos, and current contracts such as `SavedVideo` and
`VideoVersion` should keep their exact names until a real multi-format consumer justifies a
migration.

The long-term Asset model should be able to distinguish:

- a **source asset** imported, recorded, or otherwise chosen as input;
- a **generated asset** created from a prompt, reference, or other creative direction;
- an **edited asset** produced by modifying a source through a local or provider-backed workflow;
- a **derived asset** that retains explicit lineage to another asset;
- a **version**, which preserves immutable history for one logical asset or record; and
- a **variation**, which is a separately useful creative alternative rather than merely an earlier
  state.

Future media may include video, images, graphics, audio, product imagery, social and advertising
creative, and other digital campaign content. Each format will need explicit validation, preview,
metadata, derivative, export, retention, and cleanup rules; a generic name alone does not make
those lifecycles interchangeable.

## Campaign and Project model

A Campaign should supply organization and, over time, useful initiative context without becoming
the owner of media-processing state. MVP Campaign context is only name and optional brief; goals,
audience, channels, timing, and shared planning are deferred. Projects own focused production work
and its resumable creative history. Referenced source/working media links to the exact Project
revision that used it; generated outputs also record the exact producing revision and processing
operation.

The implemented organization relationship and planned media hierarchy are:

```text
Workspace / authenticated owner scope
├── Campaign (optional organizer)
│   └── Project
│       ├── source and working media references
│       ├── revisions and processing Jobs
│       └── Saved Video / Video Version outputs
└── standalone Project
```

Campaign and nullable Project membership are implemented schema. The source/revision/output branch
remains the bounded Project target. “No Campaign” is a virtual view rather than a default Campaign
row. Ownership derives from verified server identity; Campaign lifecycle is non-cascading.

## Creation and editing workflows

Creative tools are capabilities within the workspace, not separate definitions of the product.
Current examples include recording, upload, local video adjustment, Character Swap, Virtual Try On,
live character transformation, Character and Wardrobe creation, voice treatment, reference media,
and prompt/recipe workflows.

The product should describe the user outcome first. Provider and model names belong in capability,
integration, architecture, privacy, configuration, and live-validation documentation where their
exact behavior matters. A provider change should not require redefining what Lightframe Studio is.

## Asset organization and distribution

Saved outputs should become reusable, searchable records with source and derivation context rather
than isolated generations. Projects and Campaigns should eventually make that context visible;
libraries should support reuse across appropriate scopes without weakening ownership.

Download is the current delivery mechanism and is available from Saved Videos. Future distribution
may include channel-specific export presets, aspect-ratio and format adaptation, scheduling, direct
publishing, and marketing-platform integrations. No particular integration is committed until its
product, authentication, permission, failure, privacy, and support boundaries are approved.

## Product principles

### Fast path to usable content

Move from an idea or existing asset to a reviewable deliverable with as little repeated setup as
possible. Speed must not hide cost-bearing actions, overwrite source material, or weaken output
validation.

### Powerful without being overwhelming

Keep advanced creative capability understandable to marketers and creators who are not
professional editors. Reveal complexity when it helps the task instead of exposing provider or
implementation detail as product structure.

### Assets, not isolated generations

Useful output should be retainable, attributable, reusable, and connected to its source and
creative context.

### Non-destructive by default

Preserve immutable originals and lineage. Treat meaningful edits as derived assets or versions and
require explicit confirmation before changing a current pointer or removing retained work.

### Reuse over repetition

Characters, variants, Outfits, Voices, prompts, recipes, brand elements, and future templates
should be reusable at a clearly defined Workspace, Campaign, or Project scope.

### Campaign context without forced ceremony

Over time, work should connect to Projects and Campaigns when that context creates value. The
product should still support a quick path for an individual asset if requiring hierarchy would add
friction without benefit.

### Provider independence

Define capabilities through user outcomes. Select, pin, meter, and replace providers behind
app-owned contracts; never perform an automatic billable retry or fallback.

### Content-type extensibility with explicit lifecycles

Anticipate additional formats in product language and versioned models, but do not force video,
image, audio, and graphics through one lifecycle when their validation, storage, editing, and
delivery semantics differ.

### Export and distribution complete the job

Creation is valuable when users can get the right approved asset into the place where it will be
used. Treat export, download, and eventual publishing as product stages, not afterthoughts.

### User ownership and safe cleanup

Make ownership, access, lineage, retention, and deletion understandable. Derive authority from
verified server identity, preserve relationship-safe cleanup, and never equate a storage path,
provider ID, device ID, or browser-supplied value with ownership.

## Current non-claims

Lightframe Studio does not currently provide Project source/resume, rich Campaign planning,
generic multi-format asset management, direct social or advertising publishing, scheduling,
collaborative review, team roles,
public sharing, self-service signup, billing, or an approved public deployment. The broader vision
does not relax the current loopback, privacy, provider-cost, or manual/live validation boundaries.
