# Storybook catalog

Stories live outside production source so the application remains deployment-focused while the
catalog stays easy to browse and maintain.

- `foundations/` documents design tokens and global styles.
- `primitives/` covers reusable UI building blocks.
- `features/` mirrors the feature folders in `apps/web/src/features`.
- `studio/` covers reusable studio-shell chrome and compositions.
- `flows/` captures stateful, multi-component user journeys.
- `fixtures/` contains typed sample data and controller doubles shared by stories.
- `support/` contains story-only layout and state helpers.

Every story is included in Autodocs and in the Chromium-backed Storybook test project by default.
