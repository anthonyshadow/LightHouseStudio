# 0002: Bun and Elysia API runtime

- Status: Accepted
- Date: 2026-08-08

## Context

The loopback API previously used Node and Fastify. Its hooks and plugins enforced Host/Origin,
authentication, cookies, bounded uploads, response normalization, streaming cleanup, and static
production serving. The package manager was pnpm, while the retained TypeScript, Vitest, Vite,
Playwright, Storybook, and shared-package build tools were already separable from the production
runtime.

The migration requires one app-owned HTTP contract across development and production, faster and
more direct TypeScript execution, and a single package-manager lockfile without weakening the
local-only security, provider-cost, data-ownership, or cleanup boundaries.

## Decision

Bun `1.3.14` is the package manager, API development runtime, production runtime, and API bundler.
Elysia `1.4.29` is the API framework. The server remains loopback-only and continues to serve the
built web app and `/api` from one origin in production.

Node `26.x` remains an explicit tooling runtime for the retained Vitest, Vite, Playwright,
Storybook, tsup declaration builds, and repository scripts where substituting Bun would change the
tool's runtime contract without product benefit. These tools are invoked through `bun run`; bare
`bun test` is not the repository test command.

The migration preserves app-owned schemas, safe errors, exact authentication and Origin ordering,
streaming/backpressure, bounded multipart and raw uploads, disconnect cancellation, provider
deadlines, static SPA fallback, and deterministic shutdown. Framework payloads and errors do not
become public contracts.

## Consequences

The repository commits text `bun.lock`, declares workspaces and overrides in the root manifest,
uses isolated dependency linking, and disables Bun's automatic dotenv loading so the API keeps its
explicit repository-root configuration path. Native and Node-compatibility dependencies require
clean-install and runtime checks on maintained Darwin and Linux environments.

Elysia integration tests exercise the app-owned HTTP boundary rather than depending on Fastify
injection. Runtime-sensitive DNS pinning, Node/Web stream adapters, large-media spooling, R2
multipart/range behavior, Neon pooling, and provider SDKs retain focused compatibility tests and
manual live gates where credentials or paid calls are required.

The Bun process uses its exclusive loopback `node:http` compatibility listener and delegates every
request to Elysia. This is intentional: Bun's native listener cannot preserve both fixed
`Content-Length` responses and socket-finish delivery-lease semantics for the app's backpressured
file streams. The compatibility listener has no pre-Elysia body ceiling, so every route remains
bounded by app-owned declared-length and counted or spooled readers at 310,551,296 bytes or less.
This preserves Host/authentication/error precedence without authorizing a larger application
payload. The HTTP adapter also separates the 100-second absolute receive phase from the fresh
post-parse handler/response inactivity phase.
