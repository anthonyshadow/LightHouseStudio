# Authentication and Entry

## Entry point

- Route `/` (`APP_PATHS.entry`), rendered by `apps/web/src/app/EntryPage.tsx`.
- Any unrecognised path redirects here (`AppRouter.tsx:200-202`).
- Any protected path visited while unauthenticated redirects here with router state
  `{ loginRequired: true, from: '<original path+search+hash>' }` (`ProtectedRoute.tsx:15-27`).

## Preconditions

- The API must be reachable; the web app calls it same-origin (dev uses a Vite proxy).
- Demo authentication must be enabled server-side (`DEMO_AUTH_ENABLED`, default on). When it is
  off, `POST /api/auth/login` returns `503 feature_unavailable`
  (`apps/api/src/features/auth/routes.ts:57-59`) and **there is no alternative login UI**.
- A seeded user exists: `SeededUserRepository` in local mode, or `DrizzleUserRepository.ensureSeededUser`
  in relational modes (`apps/api/src/infrastructure/persistence-factory.ts:80-85`).

## Auth state machine

`AuthStatus` (`apps/web/src/application/auth/AuthProvider.tsx:12-13`):

```text
unknown ──restore()──► authenticated | unauthenticated
unauthenticated ──login()──► authenticating ──► authenticated | unauthenticated
authenticated ──logout()──► logging-out ──► unauthenticated
authenticated ──expire()──► unauthenticated        (401 event or TTL timer)
```

`restore()` is de-duplicated by a promise ref, and every operation carries a generation counter so
a late response from a superseded request cannot revive a stale session
(`AuthProvider.tsx:36-42, 55-77`). The session object itself is held in React state only — nothing
is written to `localStorage`; the browser cookie is the only persistence.

## Exact user journey — first visit

1. User opens `/`. `AppRouter` renders `EntryPage`; document title becomes
   "Enter Lightframe Studio" (`AppRouter.tsx:85`).
2. `EntryPage` reads `useAuth()`. While `status === 'unknown'` the primary button shows
   **"Restoring…"** and is disabled (`EntryPage.tsx:100-107`).
3. An effect calls `auth.restore()` exactly once for the unknown state (`EntryPage.tsx:73-76`),
   which issues `GET /api/auth/me`.
4. `GET /api/auth/me` returns `401` for a first-time visitor. `status` becomes `unauthenticated`
   and the button becomes **"Log in"**.
5. User presses **Log in** → `loginOpen` state opens the lazily-loaded `LoginDialog`.
6. `LoginDialog` fetches `GET /api/auth/demo-config`. Outside production, when
   `DEMO_AUTH_PREFILL` is on, the response contains a `prefill` object with the demo login and
   password, and the form is pre-filled (`apps/api/src/features/auth/routes.ts:34-44`).
7. User submits → `POST /api/auth/login` with `{ login, password }`.
   - The route requires a trusted `Origin` (`requireTrustedOrigin`, `routes.ts:48-52`).
   - On success the server sets an `HttpOnly; SameSite=Strict; Path=/` cookie named
     `lightframe_session` (default) whose `maxAge` is `AUTH_SESSION_TTL_SECONDS` (default 24 h)
     and whose value is a signed JWT (`routes.ts:12-18, 63`).
   - The response body is `{ user, entitlements, expiresAt }`.
8. `AuthProvider` stores the session in memory; `status` becomes `authenticated`.
9. `EntryPage.onSuccess` navigates with `replace: true` to the canonicalised `from` destination if
   one was supplied, otherwise `/dashboard` (`EntryPage.tsx:118-121`).

## Exact user journey — returning visit

1. User opens `/` (or any protected path).
2. `restore()` issues `GET /api/auth/me`; the browser sends the session cookie automatically.
3. On `200`, `status` becomes `authenticated` and the effect at `EntryPage.tsx:77-79` immediately
   navigates to the requested path or `/dashboard`, `replace: true`. The user never sees the
   login dialog.
4. On a protected deep link, `ProtectedRoute` renders a `role="status"` "Restoring your Studio
   session…" panel until the restore settles (`ProtectedRoute.tsx:28-33`).

## Protected deep links

`canonicalizeProtectedDestination` (`paths.ts:186-198`) is the allow-list for the `from` value:

- must start with a single `/`
- must resolve to a protected path
- must not itself be a legacy path (legacy paths are rejected rather than rewritten here)
- query and hash are preserved

This is covered by `e2e/successful-studio-journeys.spec.ts` ("a protected Project deep link returns
to the same URL after login").

## System behaviour

| Step                                    | Server behaviour                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Every `/api/*` request                  | `installAuthentication` `onRequest` hook (`apps/api/src/http/authentication.ts:26-73`)                       |
| Public routes                           | `GET /api/health`, `GET /api/auth/demo-config`, `POST /api/auth/login`, `POST /api/auth/logout`              |
| All other `/api/*`                      | Verify cookie → populate `request.auth`; on failure clear the cookie and throw `401 authentication_required` |
| Any non-GET/HEAD/OPTIONS `/api/*`       | Additionally `requireTrustedOrigin(request)`                                                                 |
| Ownership                               | Every service call takes `ownerUserIdForRequest(request)`; there is no cross-user access path                |
| `NODE_ENV=test` with demo auth disabled | A synthetic per-host owner id is injected so integration tests are isolated (`authentication.ts:32-53`)      |

`/api/capabilities` is **not** public — it requires a session. `useProviderAvailability` therefore
only resolves inside the authenticated shell.

## Capability gating

`GET /api/capabilities` (`apps/api/src/features/system/routes.ts`) reports:

| Flag                                                                                                  | Meaning                                                                                                      | Primary UI effect                                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `decart`                                                                                              | Decart realtime token provider configured                                                                    | Live AI availability                                                        |
| `realtimeBetaEnabled`                                                                                 | `REALTIME_VIDEO_BETA_ENABLED`                                                                                | Shows/hides "Live AI · Beta" in Quick Create                                |
| `videoProcessing.characterSwap` / `.virtualTryOn`                                                     | Provider descriptors incl. `available`, `promptInput`, `referencePolicy`, `outputResolutions`, `providers[]` | Enables the Character Swap / Virtual Try-On tool cards and their form shape |
| `elevenLabs` + `elevenLabsModel`                                                                      | ElevenLabs key present                                                                                       | Enables cloud voice changer and the voice catalog                           |
| `referenceImagesAvailable`, `referenceImageEditAvailable`, `referenceImageProviderId/ModelId/Quality` | Image provider (OpenAI / BFL / Wiro)                                                                         | Enables character reference generation and edits                            |
| `promptOptimizerAvailable` + model/version                                                            | OpenAI prompt optimizer                                                                                      | Enables prompt optimization in the workshop and builder                     |
| `wardrobeAddOutfitAvailable`                                                                          | Pruna image try-on                                                                                           | Enables adding an outfit to a wardrobe variant                              |
| `directSavedVideoUploadAvailable`                                                                     | R2 multipart direct upload configured                                                                        | Switches `useSaveVideo` to the direct-upload client (`StudioApp.tsx:211`)   |

`useProviderAvailability` exposes `state: 'loading' | 'ready' | 'error'` plus a `retry`. The header
status menu renders "checking" / "configuration unavailable" / "configured" per capability
(`StudioHeader.tsx:44-52`).

## Logout

1. Account menu → **Log out** (`AccountMenu.tsx:245-247`). The menu contains no other item.
2. `useStudioLogoutController` (`studio/useStudioLogoutController.ts`) classifies current work:
   - `hasActiveWork` — recording, finalizing, provider job active, video render busy, project
     working-media busy (`StudioApp.tsx:908-915`)
   - `hasTemporaryWork` — a presented take, voice processing, dirty outfit/wardrobe/editor state,
     or a busy project source (`StudioApp.tsx:901-907`)
3. Confirmation dialogs from `StudioLifecycleDialogs` warn before discarding.
4. On confirm: temporary state is cleaned up, camera/microphone released via `session.stopCamera()`,
   then `POST /api/auth/logout` (which revokes the session row and clears the cookie), then
   `navigate('/', { replace: true })` (`StudioApp.tsx:916-936`).

## Session expiry

Two independent mechanisms end a session client-side:

1. **Global 401 interception.** `fetchSameOrigin`
   (`apps/web/src/adapters/api-client/transport.ts:39-48`) dispatches a
   `lightframe:authentication-required` window event for **any** same-origin `401` other than
   `/api/auth/login`. `AuthProvider` listens for it and calls `expire()`
   (`application/auth/AuthProvider.tsx:130-134`).
2. **Proactive expiry timer.** While a session exists, `AuthProvider` schedules `expire()` at
   `session.expiresAt` (`AuthProvider.tsx:147-152`).

`expire()` bumps an operation generation, aborts in-flight auth requests, clears the session, and
sets `status = 'unauthenticated'`. `ProtectedRoute` then immediately renders
`<Navigate to="/" state={{ loginRequired: true, from }} />`, so the user is returned to the entry
page with a "Your session is required to continue." message and their original destination
preserved.

**Consequence worth knowing:** because `ProtectedRoute` stops rendering its children, the whole
Studio shell — including `StudioExitGuard` — unmounts in the same commit. Any in-memory recording,
unsaved take, or dirty editor state is discarded without a prompt. See
[`gaps-and-usability-audit.md`](gaps-and-usability-audit.md#6-potential-bugs).

## Exit points

- Success → `/dashboard` or the requested protected path.
- Cancel the login dialog while `loginRequired` was set → `navigate('/', { replace: true })`,
  clearing the "session required" message (`EntryPage.tsx:112-117`).
- Logout → `/`.

## Unverified

- Behaviour when `DEMO_AUTH_ENABLED=false` in a browser: the login dialog will surface the `503`
  message, but no dedicated UI for "authentication is disabled" was found. Not exercised by any
  test.
- Session revocation across tabs (one tab logs out, another keeps a stale in-memory session) is not
  covered by code or tests.
