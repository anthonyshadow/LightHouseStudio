# Dashboard, Assets, and responsive navigation

## Story

As the authenticated operator, I can understand where I am, resume recent work, create supported
resources, and browse reusable Assets without activating media or a provider.

## Observable behavior

1. Successful Login and a restored authenticated visit to `/` replace-navigate to `/dashboard`
   unless a validated protected deep link is waiting. Dashboard exposes Create Video, Browse
   Assets, New Project, and New Campaign plus independent bounded recent queries. Every recent row
   opens the exact record it names — a video row opens that Saved Video's preview in the Videos
   library, not the unfiltered library.
2. Canonical organization routes are `/dashboard`, `/campaigns`, `/projects`, and `/assets`.
   Project and Campaign detail/workspace children remain deep-linkable. Former `/studio/...`
   organization and library URLs replace-redirect to the corresponding canonical path; the former
   singular `/campaign` and `/campaign/:campaignId` redirect to their plural equivalents; the former
   Recipe URL redirects to `/assets`.
3. `/studio/create` remains standalone creation, `/studio/create/live` remains configuration-gated
   Live AI, and UUID-only `/studio/:videoId` opens the current Saved Video Version in review.
   Reserved `create` routes are matched before the UUID route.
4. All protected destinations render through one stable `StudioApp`. Organization collection and
   overview routes hide the single persistent `MediaStage`; the Project workspace keeps that same
   stage visible inside the organization shell. Navigation never creates a second stage, media
   owner, overlay system, or global store.
5. Every protected route at `48rem` and above — including Project workspaces and focused Create —
   uses the same persistent left rail
   for Dashboard, Projects, Campaigns, and Assets. **Quick Create** retains New Video, New Project,
   New Campaign, and gated Live AI, and adds **Create Asset**. The shared chooser offers Video,
   Character, Outfit, and **Add Voice** only. Project context is propagated when creation starts
   from a Project.
6. `/assets` launches the current Videos, Characters, Outfits, and Voices libraries. It does not
   invent a new cross-type gallery, and Recipe is absent from routes, cards, menus, counts,
   dialogs, filters, accessibility labels, and Quick Create.
7. The four-item mobile navigation mirrors Dashboard, Projects, Campaigns, and
   Assets with safe-area padding. Quick Create stays in the header. Project workspaces and focused
   Create retain this shared mobile shell, and each surface reserves bottom padding so the fixed bar
   never covers its content.
8. Dashboard, library listing, Project membership listing, pickers, and preview metadata start no
   paid provider work. Camera, microphone, byte fetching, and provider submissions remain explicit.
9. Dashboard lists the signed-in owner's queued and active Character Swap and Virtual Try-On jobs.
   Its bounded refresh can reconcile an already accepted provider identity without resubmitting it.
   **Remove from queue** or **Stop tracking** requires confirmation that the current providers have
   no verified cancellation API: Lightframe durably marks the attempt cancelled, abandons result
   recovery, removes temporary files, and releases the owner processing slot, while upstream work
   and cost may continue.

## Acceptance checks

- Login restoration, protected deep-link return, legacy redirects, Browser Back/Forward, active
  destination naming, keyboard/focus restoration, mobile layout, and 200% text remain covered.
- Route-level **Back** controls traverse the actual prior browser entry. A direct deep link with no
  prior app entry uses the named safe in-app destination instead of leaving the operator stranded.
  Closing an Asset library overlay and returning from a create dialog both follow this rule, so
  repeated open/close cycles never accumulate history entries the operator must press Back through.
- `/studio/:videoId` direct entry is refresh-safe, cancellation-safe, and reports normalized
  unavailable/removed/load failures with navigation back to Videos or its originating Project.
- Dashboard and organization routes acquire no media, issue no provider token, and do not remount
  the authenticated composition root.
- Queue actions are owner-scoped, require the provider-continuation warning, release local admission
  only after the cancelled trace is durable, and never claim the provider stopped or refunded work.

## Limits

Dashboard is not analytics, Assets is not a new persistence authority, and Quick Create does not
add Voice generation/upload, public sharing, billing, publishing, or multi-deliverable Projects.
