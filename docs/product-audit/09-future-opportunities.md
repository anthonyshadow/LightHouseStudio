# Future opportunities

Ideas worth keeping and worth **not** starting yet. Each says what would have to be true first.

## Deferred, with a clear trigger

### Captions, subtitles and text overlays

The most-requested capability in social video, and the largest genuinely new build in this list.
`VideoEditTool` is `trim | crop | rotate | lighting | filters`; adding timed text means a text
layer model, font handling, positioning, a preview path and a render path.

**Start when** export presets exist. Text is placement-dependent — safe areas differ between a Reel
and a feed post — so building text before knowing the output shape means building it twice.

### Music, audio tracks and mixing

Today audio is the source track or a replaced voice. A music bed, ducking and simple mixing are
natural next steps and reuse the existing Web Audio and AAC encoding path.

**Start when** the export step is settled and there is evidence operators are finishing videos and
adding music elsewhere.

### Templates and brand kits

Saved combinations of character, outfit, voice, export preset and edit spec. The obvious way to make
repeat production fast.

**Start when** variants exist. A template is a generalisation of a duplicate; building it first
means guessing which fields matter.

### Multi-clip timeline editing

An order of magnitude more work than the current editor. The product's thesis is transformation of a
single clip, not assembly.

**Start when** operators are demonstrably exporting single clips and stitching them elsewhere.

### Usage, credits and billing

The repository's roadmap already stages this correctly. A simple **usage view** (jobs run, by
operation, this month) is P2 and delivers most of the reassurance value; metering, credits and
payment need customers first.

**Start when** there is more than one operator.

### Multi-user, sharing and collaboration

Deliberately deferred by
[`deferred-account-and-infrastructure-roadmap.md`](../deferred-account-and-infrastructure-roadmap.md),
which warns explicitly against adding a tunnel, LAN binding, proxy, public hostname or cloud
deployment merely because the storage and repository ports exist. The loopback `Host`/`Origin`
boundary is not authentication.

**Start when** a security, privacy and operations design has been separately approved.

### Publishing to channels

Requires accounts, OAuth per platform, scheduling, retry semantics and a content-policy posture.
Download covers most of the need for a single operator.

**Start when** multi-user exists and operators are asking for scheduling rather than files.

### Server-side rendering

The local `WebCodecs` editor works and keeps the product local-first. A render service would lift
the 300-second and memory ceilings — and change the product's privacy story.

**Start when** clip-length limits are demonstrably blocking real work.

### Consolidating the two Project repositories

6 200 lines of duplicated policy across file and Drizzle implementations. Real debt, correctly
covered by tests today.

**Start when** `local`/`shadow` mode is retired. Consolidating while both are supported is a large,
high-risk change with no user-visible benefit.

## Smaller ideas worth recording

| Idea                                             | Value      | Note                                                               |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------ |
| Version compare in Project History               | Medium     | The lineage data already exists; only the view is missing          |
| Restore a Project to an earlier revision         | Medium     | Revisions are immutable and complete; this is mostly a new command |
| Bulk download / ZIP a Campaign's outputs         | Medium     | Natural once export presets exist                                  |
| A Campaign brief that seeds Project defaults     | Medium     | Would give Campaigns their first real function                     |
| "Start a Project from this Video" in the library | Low–medium | The reverse hand-off that is currently missing                     |
| Duration and file-size shown before download     | Low        | Metadata already retained                                          |
| Keyboard shortcuts for record/stop/save          | Low        | Fits the professional-tool framing                                 |
| Sample content on first run                      | Low        | Would let onboarding teach by example rather than by paragraph     |

## Ideas explicitly rejected

| Idea                                             | Why not                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Rewriting the front end on a different framework | Nothing about React 19 + Vite + Emotion is limiting this product                  |
| Replacing TanStack Query                         | The remote-state model is correct and the cache boundary is deliberate            |
| A generic plug-in provider architecture          | Four providers behind normalized ports is already the right amount of abstraction |
| A design-system package                          | The `ui/primitives` set is coherent and has one consumer                          |
| Moving domain rules into the API                 | The current boundary is the reason the domain is testable                         |
| Adding an ORM abstraction over Drizzle           | Two persistence modes is already one more than the product needs                  |
