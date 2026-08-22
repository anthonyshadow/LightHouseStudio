# Route map

Router source: `apps/web/src/app/AppRouter.tsx`; the route table itself is `apps/web/src/app/paths.ts`
(`APP_PATHS`, `PROTECTED_ROUTES`, `isStudioRuntimePath`).

The router matches `*` and delegates recognition to `paths.ts`, so URLs are added there rather than
as nested route elements.

| URL                                          | Surface                                         | Mounts the capture runtime? |
| -------------------------------------------- | ----------------------------------------------- | --------------------------- |
| `/`                                          | Provider-free entry and Login (`EntryPage.tsx`) | No — no Studio/media at all |
| `/dashboard`                                 | Dashboard                                       | No                          |
| `/studio/create`                             | Standalone create surface                       | Yes                         |
| `/studio/create/live`                        | Live AI Beta (configuration-gated)              | No                          |
| `/studio/:videoId`                           | Saved Video review by deep link (UUID only)     | Yes                         |
| `/projects`, `/projects/:id`                 | Projects list, Project overview                 | No                          |
| `/projects/:id/workspace`                    | Project workspace (`?task=` selects the tab)    | Yes                         |
| `/campaigns`, `/campaigns/:id`               | Campaigns list, Campaign detail                 | No                          |
| `/assets`                                    | Assets hub                                      | No                          |
| `/assets/{videos,characters,outfits,voices}` | Library overlays over the hub                   | No                          |
| Legacy `/studio/...`, `/campaign/...`        | Replace-redirect to the canonical path          | n/a                         |
| Any other path                               | Redirect to `/`                                 | n/a                         |

Two boundaries matter when redesigning:

- **The shell persists; the runtime does not.** `app/shell/AuthenticatedShell.tsx` stays mounted
  across every protected route and owns the chrome, the library overlays and the session lifecycle.
  `studio/StudioApp.tsx` is the live-media runtime and mounts only on the three routes above that
  own live media. Do not move cross-route state into the runtime.
- **Asset libraries are overlays, not pages.** They key off `location.pathname` in
  `StudioLibraryOverlays.tsx`, which is why a focused Saved Video is `?video=<id>` on
  `/assets/videos` rather than a path segment.

The Character builder has no route. It is a fullscreen overlay launched from the creative
workspace. Redesigning it must not add route aliases or remount the stage while the operator stays
in place.
