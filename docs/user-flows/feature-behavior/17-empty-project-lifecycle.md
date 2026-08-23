# Project lifecycle, creative checkpoints, and durable working media

## Story

As the authenticated operator, I can create and manage Projects from one canonical workspace,
accept one durable video original, reopen the same Project/source by URL, and resolve concurrent
metadata, creative, edit, source, or working-media changes without unsafe overwrite or implicit
provider work.

## Observable behavior

1. **Projects** is a primary destination in the authenticated Studio chrome. `/projects`
   lists bounded active and archived summaries; `/projects/:projectId` is its organization
   overview; `/projects/:projectId/workspace` opens its guided video workspace inside the same
   responsive organization navigation shell. All are protected, deep-linkable, and return to the
   same URL after Login.
2. **New Project** asks for a name and optional Campaign, and its **Create without a name** action
   creates `Untitled Project` in the same dialog without requiring a name, brief, source, tag, or
   provider choice — carrying whichever Campaign is selected. Either path may
   intentionally remain collection-only. The browser supplies one operation key and reuses it
   after an uncertain response so the server's durable receipt can reconcile an exact replay.
3. Summary rows show only title, derived Project status, and updated time. Active and archived
   queries are separate, cursor-bounded pages. Loading, empty, safe-error/retry, and explicit
   **Load more** states do not fetch snapshots, media, history, bytes, storage data, or provider
   details.
4. Open, rename, archive, restore, and deletion use owner-derived API behavior and Project-version
   CAS. Dialogs expose busy/error state, restore useful focus, and announce results. Archive removes
   a Project from the active list without deleting its history; restore returns it. Active or newest
   unresolved provider work blocks archive, while an older ambiguous attempt is superseded by any
   later durable attempt for that Project and cannot become an invisible permanent archive lock. Explicitly
   deleting one archived Project tombstones only that Project and removes it from visible Project
   and Campaign lists; retained lineage continues protecting referenced media and no physical purge
   is claimed.
5. A stale rename never overwrites server state. The dialog keeps the proposed name and requires
   **Reload and retry rename** or **Discard change**. Reload fetches current server authority;
   response-loss replay is reconciled when the requested result is already current.
6. Refreshing or directly opening an empty Project fetches its identity and current revision from
   server authority. The overview truthfully explains that an intentionally empty collection is
   valid, names the workflow as Source → Create → Save → History with the current step marked, and
   presents the Source task itself: **No source yet** offers **Record**, **Upload**, and **Use Saved
   Video** without a wizard. The Saved Video chooser shows a poster thumbnail and duration per row
   and can play the exact Version inline before it is committed, so the wrong video is caught before
   it is chosen rather than after. The primary action reads **Add source** until a source exists and
   **Continue editing** afterwards. Accepting a source from the overview continues into the
   workspace, and **Record** starts capture only after navigating there. A source-bearing Project
   does not mount the Source task on the overview, so opening it never re-reads source bytes. Upload previews immediately on the stage;
   Record starts local media only after the explicit action and offers a finalized take for
   acceptance; Use Saved Video selects the current exact active Version. The inspector groups the
   existing lifecycle into keyboard-operable **Source**, **Create**, **Save**, and **History** tasks
   without inventing a new progression or provider action.
7. `AuthenticatedShell` remains the sole authenticated composition root; the Studio runtime owns the one mounted media
   stage. Project list, overview, Dashboard, Assets, and Campaign routes hide it; only the Project
   workspace presents it beside the task inspector on desktop and above it at narrower widths. The
   stage remains a visible 16:9 frame on tablet and mobile. No route mounts another Studio, player,
   media session, object-URL owner, shell, or Project store.
8. Active Project identity and surface are URL-owned. Refreshing an `/assets/*` route
   restores that global Asset view and cannot resurrect the prior Project workspace from mounted
   React state. Leaving a workspace cannot silently abandon recording, finalization, local render,
   unaccepted source, dirty creative state, or a pending semantic checkpoint.
9. The UI distinguishes **Preparing source**, **Autosaving…**, **Autosaved**,
   **Conflict**, and safe failure. A Project becomes resumable only after durable byte storage or
   exact Version verification, server inspection, checksum/owner validation, and atomic source
   revision acceptance. A failed/unaccepted staging attempt can be replaced.
10. A Project's source is immutable _while it is attached_: a second acceptance conflicts rather
    than overwriting it. **Remove original video** detaches it explicitly, returning the Project to the
    Source step as a `draft` with its creative setup — Character, Outfit, Voice, prompt, treatment,
    local edit — intact, and clearing only the derived working and presented media. Removal is
    refused while a provider attempt is unresolved and on an archived or deleted Project, and the
    reason is stated rather than left to guesswork. It never deletes the video, an earlier revision,
    a saved output Version, or retained bytes: historical source lineage keeps protecting them.
    It creates no provider work and carries no operation key — removing an already-removed source
    converges on current authority, so a lost response is safe to replay, while a stale attempt
    against a source that has since been replaced conflicts instead. Exact Saved Video Version
    reuse references existing bytes and used-by lineage; it does not claim that the Project produced
    that Version or infer a later existing-video save target.
11. Accepted source metadata exposes only normalized media facts and a controlled Project content
    URL. Owner-checked range/HEAD content rehydrates a fresh Blob through the existing recording
    artifact owner after navigation, browser refresh/restart, or app restart. Blob/data URLs,
    checksums, storage paths/keys, and provider bodies remain private.
12. Recording/finalization blocks Project switching until safe. Upload/inspection/acceptance and a
    finalized unaccepted take require explicit stay or abort/discard. Every operation remains bound
    to its initiating Project, and an old Project's late completion cannot replace the new stage.
13. One feature-local Project session hydrates only from the Project ID in the canonical URL. It
    publishes current server authority to the source controller without owning the Blob, object
    URL, stage, recording, or render lifecycle. Leaving for a global library unmounts that session;
    refreshing the library URL cannot recover a hidden Project identity.
14. The session exposes one typed semantic-proposal port. Proposals contain workflow phase, exact
    applied creative/Voice/treatment values, explicit live metadata, and validated local edit; the
    immutable source and current media references are copied from server authority. Compatible
    proposals coalesce for 750 ms and append one revision rather than one revision per input event.
    `Unsaved changes`, **Autosaving…**, and timestamped **Autosaved · &lt;time&gt;** describe this
    server checkpoint only and remain ambient in the masthead. Only conflict and failure states
    become prominent notices.
15. A stale Project/revision CAS or unavailable response preserves the current tab's proposal and
    reloads server authority. If authority already contains the exact proposal, the lost response
    converges without another revision. Otherwise **Conflict** requires explicit **Reapply
    changes** or **Discard local changes**; Lightframe does not merge or overwrite automatically.
16. Project-to-Project switches, Project-to-library exits, back/forward, and logout first flush the
    Project session. Failed/conflicted saves stay on the source URL until retry or explicit discard.
    Refresh/unload receives the browser warning while a proposal is dirty or saving. No Project
    IndexedDB store is activated: a browser crash, forced unload, or confirmed reload can lose only
    the pending in-memory proposal, never a server-accepted revision or source.
17. The existing creative rail remains available beside one source-bearing Project stage. Character
    and Variant, Outfit, prompt configuration, one visual treatment, optional local/saved Voice, capture
    metadata, and validated local edit map through feature-local adapters into the same Project
    session. **Keep this setup** is an explicit semantic boundary; keystrokes, frames, slider
    ticks, and undo/redo entries never append revisions.
18. Snapshot v2 records stable resource IDs plus only exact applied labels, child/reference IDs,
    prompt/treatment/settings, and resource revisions needed to explain the checkpoint. The V1 read
    migration maps unavailable provenance to null rather than inventing it. Reusable records and
    their bytes/lifecycles stay independently owned.
19. Owner-scoped hydration restores only exact compatible resources. Missing, tombstoned,
    wrong-owner, or changed records keep the historical applied label/explanation and show
    **Choose another** without failing the source or revealing whether another owner has that ID.
20. **Render preview** is temporary. **Use as the current cut** accepts a validated local render or
    exact same-owner ready Media Asset/Saved Video Version, flushes the session, verifies both CAS
    tokens and one operation-key fingerprint, and appends working/presented lineage. It never
    changes the immutable source, copies exact retained media unnecessarily, infers a save target,
    or creates Project output provenance. Exact replay retains the original adoption revision ID,
    number, media, and receipt while also reporting the current Project revision; changed replay
    conflicts.
21. A material creative/edit/working-media checkpoint clears a stale `lastSuccessfulOutput` and
    returns status to current ready/attempt truth. Completing a local render or adoption alone does
    not make the Project `completed`. Saving setup, temporary rendering, and durable working-media
    readiness use distinct status copy.
22. Project Character Swap and Virtual Try-On now start visibly through the one pre-linked Project
    processing command. Reopen reconnects durable visual-provider jobs without submission,
    unknown acceptance never auto-retries, and current/stale retained results are labeled
    separately. Configuration and local render/adoption still make no provider call. Provider-
    backed Voice and live starts remain gated because their adapters do not meet the durable
    reconnect contract. Accepted visual work may continue after a Project switch. An active
    Project attempt exposes explicit local queue removal, which stops Lightframe tracking and
    releases admission without claiming provider cancellation or refund; local rendering or
    working-media adoption still blocks switching/exit until it completes or returns to a safe
    cancellable checkpoint.
23. A ready Project review exposes one placement-labelled **Save video** action. It reveals one
    destination choice: **New video**, with an editable proposed title, or **New version of an
    existing video**, with the exact current target named inside the same choice surface. The
    choice is inline in the desktop/tablet inspector and a single focus-trapped bottom sheet below
    `40rem`; it never chains a picker and confirmation modal. The command flushes the session,
    freshly reads Project authority, checks exact Project/revision/media and append CAS, reuses the
    already-durable current bytes, creates one
    immutable Video Version, attributes it to the producing pre-save revision, and appends a
    distinct completed post-save revision with the exact retained output pointer. Reusing a Saved
    Video Version as source never preselects an existing-video save target. A final CAS conflict clears the
    operation and refreshes current Project authority before asking the operator to review and save
    again. A settled save names the Saved Video and Version it produced and offers that exact
    Version in place — **Download** and **View in Assets** — belonging to the one settled operation.
    The new-Video title is proposed as the Project title plus the change the save is taken from, so
    successive saves from one Project stay distinguishable; the operator edits it before committing.
    The Save task also asks **where is this going** — keep as it is, phone full screen (9:16),
    widescreen (16:9), square (1:1), or tall feed post (4:5). Keeping the shape is the default and
    is stored as no specification at all, so a Project that never answers behaves exactly as before.
    A chosen placement is written onto the revision through the ordinary session checkpoint, under
    the same CAS as every other creative change, never through the output-save request; the save
    flushes it before it reads Project authority. The same destination surface restates the
    recorded placement. Because the retained bytes are the ones the Project already holds, the
    placement is
    produced at the settled save's **Download**, which re-frames locally to that shape and names the
    file after it, and offers the original shape alongside. A browser that cannot render explains
    that and gives the original shape; the placement stays recorded either way.
24. One pending owner/environment/Project-scoped operation survives browser response loss. Reload
    resubmits only the exact stored request and reconciles the original result; a changed replay
    conflicts without another Version or partial aggregate advancement. Removing the Saved Video
    from the global library explains and preserves exact Project-scoped Version access while any
    active, archived, or tombstoned Project output retains it.
25. Project history uses separate bounded cursor pages for Project changes, processing attempts and
    retained stale results, and immutable output Versions. Output rows distinguish the producing
    revision from the later revision that made the Version current. Lists contain metadata only;
    preview and **Download** fetch one exact retained Version through Project-scoped content. A
    Project change that recorded a placement states it, so the operator can see what a change was
    for.
26. **Use in Project** can explicitly adopt one exact retained output Version or valid stale
    processing result as working media after current lifecycle and CAS validation. It never changes
    the immutable original, Saved Video current pointer, or existing-video save target, and stale work is
    never promoted automatically. A removed global Saved Video remains reachable only through an
    exact same-owner retaining Project relation with truthful retention copy.
27. **Duplicate Project** duplicates a Project from its overview or from a Projects list row. The
    copy starts from the same original video and the same creative setup — character, outfit, voice,
    visual treatment, live-mode metadata, creative intent, local edit and placement — all carried by
    reference, so no video is duplicated and no storage is used again. It carries no outputs, no
    history beyond its own first `create` revision, no processing state and no retained-output
    pointer, and its status is derived from its own snapshot rather than copied. Duplicating starts
    no provider work and incurs no cost, which the dialog states before the operator confirms. The
    name is proposed as `"<title> (copy)"` and is editable; the Campaign defaults to the original's
    and can be changed, and a duplicate aimed at an unavailable Campaign is refused exactly as a move
    is. The command carries the source Project's expected version and an Idempotency-Key, so a
    Project that changed elsewhere is refused rather than copied from stale state, and a lost
    response replays to the one copy. The copy opens on the step it is ready for and is renameable,
    archivable and deletable on its own; the original is left exactly as it was. Archiving or
    deleting the original never reclaims the source the copy still references.
28. Project overview also exposes a separate non-owning Asset collection for Videos, Characters,
    Outfits, and Voices, stated in place as not being the Project source. Memberships are
    newest-first cursor pages and idempotent by Project/kind/resource. Membership alone does not
    create a source, working media, output, or retention claim. Archived Projects show the
    collection read-only. Missing underlying records remain visible as unavailable until explicitly
    detached. Adopting an attached Video is named for its consequence: **Use as Project source** on
    a Project without one, confirmed because it changes what the whole Project is built from, and
    **Use as working media** once a source exists. Either adopts the exact current Version before
    navigating to `/projects/:projectId/workspace`, and the working-media path never changes the
    immutable source.
29. **Add Asset** can attach existing records or launch Project-aware creation. Record/Upload uses
    `/studio/create?intent=...&projectId=...`; only an explicit Save to Assets attempts attachment,
    then returns to Project detail. A successful save plus failed attachment preserves the Video
    and offers retry. Character/Outfit builders and Add Voice attach without leaving Project
    context. Detach removes only the membership.

## Boundaries

This story includes bounded semantic creative/edit checkpoints, working-media adoption, recoverable
visual processing, atomic Saved Video output save, one recorded placement per revision, duplication
into an independent Project, bounded history categories, and exact-Version preview/reuse/Download,
but no Campaign expansion, restore/rollback, batch or multi-variant creation, templates or saved
presets, several placements from one save, server-side rendering, generic Export record, or
IndexedDB Project data. Project source selection, session hydration, configuration,
local adoption, history viewing, and output save start no provider.
Standalone existing-video behavior retains its separate save/replace contract. Project
server/repository authority, retention, and cleanup remain as documented in Architecture.
