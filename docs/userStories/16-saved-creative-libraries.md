# Saved character and outfit libraries

## Story

As the authenticated operator, I can open dedicated Saved Characters and Saved Outfits views,
reuse or remove a record, and return to creation without losing the shared Studio runtime.

## Observable behavior

1. The account menu stays above the Studio workspace and links to `/studio/characters` and
   `/studio/outfits` alongside Saved Videos.
2. Both routes render full-screen library workspaces inside the existing `StudioApp`; route changes
   do not remount the media stage, create another session, or contact a provider.
3. Saved Characters list the user-scoped Character/Shelf records and support existing exact
   original/variant hydration. **Use** selects through the current character handoff.
4. Saved Outfits list the user-scoped reusable VTO records. **Use** selects through the existing
   outfit handoff without acquiring camera/media or starting provider work.
5. Delete uses the repository's existing relationship cleanup. Detached immutable reference bytes
   remain retained because Phase 1 has no relationship-safe physical garbage collector.
6. Loading, empty, error, and populated states have named scroll regions, keyboard operation,
   visible focus, Escape/back behavior, and mobile-safe controls.

## Ownership and migration

Creative metadata is sanitized and namespaced by the stable authenticated user; the prior global
v6 key is retained as a rollback source after idempotent migration. Character Builder uses a
user-scoped IndexedDB database. Auth changes clear in-memory caches. Browser storage never contains
the JWT, password, server path, or provider credential.
