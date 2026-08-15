# Creative Assets

## Story

As the authenticated operator, I can browse dedicated Character, Outfit, Voice, and Recipe views,
reuse or remove supported records, and return to creation without losing the shared Studio runtime.

## Observable behavior

1. **Assets** is a primary authenticated destination. `/studio/assets` presents Videos, Characters,
   Outfits, Voices, and Recipes; the account menu is limited to identity and Log out.
2. `/studio/assets/characters`, `/studio/assets/outfits`, `/studio/assets/voices`, and
   `/studio/assets/recipes` render full-screen library workspaces inside the existing `StudioApp`;
   route changes hide rather than remount the media stage and contact no provider automatically.
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
8. Voices exposes the provider catalog and account-saved relationships as a management surface;
   applying a Voice remains disabled until an active video workflow owns the selection. Recipes
   exposes Character and Outfit recipe modes and uses the existing explicit Studio handoff.

## Ownership and migration

Creative metadata is sanitized as Recipe Shelf v7 and namespaced by the stable authenticated user;
the user-scoped and global v6 keys are retained as rollback sources after idempotent migration.
Neon stores normalized owner rows behind one library revision and accepts only authenticated
owner-derived full-snapshot CAS writes. Character Builder drafts remain in user-scoped IndexedDB.
Auth changes clear in-memory caches. Browser storage never contains the JWT, password, server path,
R2 key, or provider credential.
