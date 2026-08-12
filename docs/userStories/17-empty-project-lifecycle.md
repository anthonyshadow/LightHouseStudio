# Empty Project lifecycle workspace

## Story

As the authenticated operator, I can create and manage durable empty Projects from one canonical
workspace, reopen the same Project by URL, and resolve concurrent metadata changes without losing
my proposed name or starting media/provider work.

## Observable behavior

1. **Projects** is a primary destination in the existing authenticated Studio chrome.
   `/studio/projects` lists bounded active and archived summaries; `/studio/projects/:projectId`
   opens one Project. Both routes are protected, deep-linkable, and return to the same URL after
   Login. Existing `/studio`, Saved Videos, Saved Characters, and Saved Outfits routes remain
   canonical.
2. **Quick Start** creates `Untitled Project` without requiring a Campaign, brief, source, tag, or
   provider choice. The browser supplies one operation key for the action and reuses it after an
   uncertain response so the server's durable receipt can reconcile an exact replay.
3. Summary rows show only title, derived Project status, and updated time. Active and archived
   queries are separate, cursor-bounded pages. Loading, empty, safe-error/retry, and explicit
   **Load more** states do not fetch snapshots, media, history, bytes, storage data, or provider
   details.
4. Open, rename, archive, and restore use owner-derived API behavior and Project-version CAS.
   Dialogs expose busy/error state, restore useful focus, and announce results. Archive removes a
   Project from the active list without deleting its history; restore returns it.
5. A stale rename never overwrites server state. The dialog keeps the proposed name and requires
   **Reload and retry rename** or **Discard change**. Reload fetches current server authority;
   response-loss replay is reconciled when the requested result is already current.
6. Refreshing or directly opening an empty Project fetches its identity and current revision from
   server authority. The detail truthfully says **No source yet**. Record, Upload, and Use Saved
   Video are visible only as disabled future affordances and do not acquire camera/media, mount a
   second player, contact a provider, or claim source/session resumability.
7. `StudioApp` remains the sole authenticated composition root and owns the one mounted media
   stage. The Projects full workspace hides that existing stage rather than mounting another
   Studio, player, media session, shell, or Project store.
8. Active Project identity is URL-owned. **Studio** navigation and global-library navigation are
   labelled as Project-context exits. Refreshing `/studio/videos`, `/studio/characters`, or
   `/studio/outfits` restores that global library and cannot resurrect the prior Project from
   mounted React state.

## Boundaries

This story adds no Campaign, source acceptance, media hydration, autosave, creative integration,
processing, output, history, download, browser Project authority, or IndexedDB Project data.
Project server/repository authority and retention behavior remain as documented in Architecture.
