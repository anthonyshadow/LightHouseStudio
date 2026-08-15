# Dashboard, Assets, and responsive navigation

## Story

As the authenticated operator, I can understand where I am, resume recent work, start a video or
organization container, and browse reusable Assets without activating media or a provider.

## Observable behavior

1. Successful Login opens Dashboard at `/studio`. Dashboard presents explicit **Create video**,
   **Browse Assets**, **New Project**, and **New Campaign** actions plus bounded recent Projects,
   Campaigns, and Videos. Each collection loads and retries independently through its existing API.
2. Dashboard makes three bounded, parallel, cacheable reads. It has no aggregate endpoint because
   the current local loopback surface needs neither cross-resource counts nor N+1 expansion.
3. A short orientation card explains Create, Project, and Campaign. Dismissal is versioned by
   environment and authenticated user in local browser storage, so it is account-scoped on this
   installation. It is not claimed to sync across devices; clearing that browser preference shows
   it again.
4. The desktop header exposes **Dashboard**, **Projects**, **Campaigns**, and **Assets**. **Create**
   offers a new video, Project, Campaign, and—only when effectively enabled—Live AI Beta. The
   account menu contains identity and Log out only; integration status is a separate control.
5. `/studio/create` is the focused standalone creator. `/studio/projects/:projectId` is a Project
   overview and its `/workspace` child is focused media work. Organization routes hide the single
   persistent stage rather than creating or destroying another media owner.
6. `/studio/assets` groups Videos, Characters, Outfits, Voices, and Recipes. Legacy Videos,
   Characters, Outfits, and Live URLs redirect to their canonical destinations without remounting
   the authenticated composition root.
7. On small organization-route viewports, a four-item bottom navigation mirrors Dashboard,
   Projects, Campaigns, and Assets with safe-area padding. Create remains the prominent header
   action instead of becoming a cramped fifth destination. The bottom bar is absent from focused
   Create and Project workspaces.
8. Live AI entry is visible only when both the server-side beta admission flag and provider
   configuration are effective. A direct disabled route explains unavailability and starts no
   session. The server rejects realtime token issuance while the beta flag is off.
9. **Export** is visible but disabled in video preview with an explanation that formats and
   channels are not specified. Exact-Version **Download** remains the supported delivery action.

## Acceptance checks

- Dashboard, every Assets child, Project overview/workspace, and the mobile bottom navigation are
  keyboard-operable, named, responsive at canonical viewports, and usable at 200% text.
- Dashboard and all organization routes acquire no camera/microphone, load no provider SDK, issue
  no provider token, and start no paid work.
- Browser Back/Forward retains the requested route, focus returns meaningfully, and active
  recording/finalization or discardable workspace work cannot be hidden behind an organization
  page without the existing explicit guard.

## Limits

Dashboard is not an analytics service, cross-device preference store, or new persistence
authority. Assets is navigation over existing lifecycle owners, not a new generic Asset table.
The disabled Export action is not a promise of a specific format, channel, publisher, or date.
