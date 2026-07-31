# Route map

Router source: `apps/web/src/app/AppRouter.tsx`.

| URL            | Entry                                    | Layout                                       |
| -------------- | ---------------------------------------- | -------------------------------------------- |
| `/`            | `apps/web/src/app/EntryPage.tsx`         | Provider-free entry; no Studio/media modules |
| `/studio`      | lazy `apps/web/src/studio/StudioApp.tsx` | Persistent Studio stage and overlays         |
| any other path | redirect to `/`                          | none                                         |

The Character builder has no route. It is a fullscreen overlay inside `/studio`, launched from the
Studio creative workspace. Redesigning it must not add `/studio/*` aliases or remount the stage.

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
        lazy: async () => ({ Component: (await import('../studio/StudioApp')).StudioApp }),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
```
