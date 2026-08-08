# Saved character and outfit libraries

## Story

As the authenticated operator, I can open dedicated Saved Characters and Saved Outfits views,
reuse or remove a record, and return to creation without losing the shared Studio runtime.

## Observable behavior

1. The account trigger is the far-right header control. Its viewport-safe menu stays above the
   Studio workspace, never overlaps the integration popover, and links to `/studio/characters` and
   `/studio/outfits` alongside Saved Videos.
2. Both routes render full-screen library workspaces inside the existing `StudioApp`; route changes
   do not remount the media stage, create another session, or contact a provider.
3. Saved Characters list the user-scoped Character/Shelf records and support existing exact
   original/variant hydration. **Create new character** opens the ordinary Character Builder with
   a brand-new create target, including when the library is empty. **Use** selects through the
   current character handoff. Every card exposes **Wardrobe** plus **Create new from this
   character**; the latter hydrates a new Builder create target and never edits the source
   character.
4. Saved Outfits list the user-scoped reusable VTO records. **Use** selects through the existing
   outfit handoff without acquiring camera/media or starting provider work. **Create new saved
   outfit** opens the ordinary Outfit Builder and returns to the library.
5. Delete uses the repository's existing relationship cleanup. In authoritative Neon/R2, the
   successful full-snapshot CAS compares prior and next saved reference relationships, then deletes
   each detached owner asset only after a second check proves that no saved character, variant,
   outfit, or recent recipe still uses it. Local mode retains detached immutable bytes.
6. Loading, empty, error, and populated states have named scroll regions, keyboard operation,
   visible focus, Escape/back behavior, and mobile-safe controls.
7. When authoritative Neon persistence is enabled, the browser remains the immediate local cache.
   An empty cloud library is initialized from the current browser; an empty browser hydrates from
   the cloud. If both contain different non-empty state or revision CAS conflicts, sync pauses,
   shows a safe notice, and preserves the browser copy instead of overwriting either side.

## Ownership and migration

Creative metadata is sanitized as Recipe Shelf v7 and namespaced by the stable authenticated user;
the user-scoped and global v6 keys are retained as rollback sources after idempotent migration.
Neon stores normalized owner rows behind one library revision and accepts only authenticated
owner-derived full-snapshot CAS writes. Character Builder drafts remain in user-scoped IndexedDB.
Auth changes clear in-memory caches. Browser storage never contains the JWT, password, server path,
R2 key, or provider credential.
