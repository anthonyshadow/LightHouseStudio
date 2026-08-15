# Dashboard, Assets, and responsive navigation

## Story

As the authenticated operator, I can understand where I am, resume recent work, create supported
resources, and browse reusable Assets without activating media or a provider.

## Observable behavior

1. Successful Login and a restored authenticated visit to `/` replace-navigate to `/dashboard`
   unless a validated protected deep link is waiting. Dashboard exposes Create Video, Browse
   Assets, New Project, and New Campaign plus independent bounded recent queries.
2. Canonical organization routes are `/dashboard`, `/campaign`, `/projects`, and `/assets`.
   Project and Campaign detail/workspace children remain deep-linkable. Former `/studio/...`
   organization and library URLs replace-redirect to the corresponding canonical path; the former
   Recipe URL redirects to `/assets`.
3. `/studio/create` remains standalone creation, `/studio/create/live` remains configuration-gated
   Live AI, and UUID-only `/studio/:videoId` opens the current Saved Video Version in review.
   Reserved `create` routes are matched before the UUID route.
4. All protected destinations render through one stable `StudioApp`. Organization routes hide the
   single persistent `MediaStage`; navigation never creates a second stage, media owner, overlay
   system, or global store.
5. Desktop and tablet organization routes use a persistent left rail for Dashboard, Projects,
   Campaigns, and Assets. **Quick Create** retains New Video, New Project, New Campaign, and gated
   Live AI, and adds **Create Asset**. The shared chooser offers Video, Character, Outfit, and
   **Add Voice** only. Project context is propagated when creation starts from a Project.
6. `/assets` launches the current Videos, Characters, Outfits, and Voices libraries. It does not
   invent a new cross-type gallery, and Recipe is absent from routes, cards, menus, counts,
   dialogs, filters, accessibility labels, and Quick Create.
7. The four-item mobile organization navigation mirrors Dashboard, Projects, Campaigns, and
   Assets with safe-area padding. Quick Create stays in the header and the bottom bar remains
   absent from focused Create and Project workspaces.
8. Dashboard, library listing, Project membership listing, pickers, and preview metadata start no
   paid/provider work. Camera, microphone, byte fetching, and provider actions remain explicit.

## Acceptance checks

- Login restoration, protected deep-link return, legacy redirects, Browser Back/Forward, active
  destination naming, keyboard/focus restoration, mobile layout, and 200% text remain covered.
- Route-level **Back** controls traverse the actual prior browser entry. A direct deep link with no
  prior app entry uses the named safe in-app destination instead of leaving the operator stranded.
- `/studio/:videoId` direct entry is refresh-safe, cancellation-safe, and reports normalized
  unavailable/removed/load failures with navigation back to Videos or its originating Project.
- Dashboard and organization routes acquire no media, issue no provider token, and do not remount
  the authenticated composition root.

## Limits

Dashboard is not analytics, Assets is not a new persistence authority, and Quick Create does not
add Voice generation/upload, public sharing, billing, publishing, or multi-deliverable Projects.
