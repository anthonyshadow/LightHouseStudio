# Storybook catalog

Stories live outside production source so the application remains deployment-focused. The catalog
documents selected, review-worthy component surfaces and journeys; it is intentionally not an
exhaustive mirror of every production component or state.

- `foundations/` documents design tokens and global styles.
- `primitives/` covers reusable UI building blocks.
- `features/` mirrors the feature folders in `apps/web/src/features`.
- `studio/` covers reusable studio-shell chrome and compositions.
- `flows/` captures stateful, multi-component user journeys.
- `fixtures/` contains typed sample data and controller doubles shared by stories.
- `support/` contains story-only layout and state helpers.

Every retained story is included in Autodocs and the typechecked static Storybook build. Storybook
is a review catalog, not a second automated render suite; selected `play` functions remain
interactive examples when those stories are opened. Critical behavior belongs to the domain,
component, controller, API, or Playwright layer described in
[`docs/TESTING.md`](../docs/TESTING.md).
