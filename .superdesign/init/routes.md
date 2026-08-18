# Route map

Router source: `apps/web/src/app/AppRouter.tsx`.

| URL            | Entry                                                                         | Layout                                                                       |
| -------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `/`            | `apps/web/src/app/EntryPage.tsx`                                              | Provider-free entry; no Studio/media modules                                 |
| `/studio/*`    | lazy `apps/web/src/app/shell/AuthenticatedShell.tsx` → `studio/StudioApp.tsx` | Studio stage and overlays; the runtime mounts only where live media is owned |
| any other path | redirect to `/`                                                               | none                                                                         |

The Character builder has no route. It is a fullscreen overlay inside `/studio`, launched from the
Studio creative workspace. Redesigning it must not add `/studio/*` aliases or remount the stage while the operator stays in Studio.

Relevant router structure:

```tsx
const browserRouter = createBrowserRouter([
  {
    path: '/',
    element: <RoutedApplication />,
    errorElement: <RouteFailure />,
    children: [
      { index: true, element: <EntryPage /> },
      {
        path: 'studio',
        lazy: async () => ({
          Component: (await import('./shell/AuthenticatedShell')).AuthenticatedShell,
        }),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
```
