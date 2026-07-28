# Repository working guide

Use Node 24 (`>=24 <25`) and npm 11 or newer (`package.json` is authoritative;
`.nvmrc` pins the repository default). Install from the root with `npm ci` when
reproducing CI and `npm install` for ordinary local development.

Before changing behavior:

- Inspect the owning feature, its orchestration/controller, the relevant pure
  domain rule, the HTTP contract, and the tests that exercise the journey. Do not
  infer behavior from a component name or an old user story.
- Preserve the dependency direction documented in
  [Architecture and ownership](docs/ARCHITECTURE.md). `packages/domain` and
  `packages/contracts` must stay independent of React and provider payloads.
- Keep `StudioApp.tsx` as a composition boundary. Reuse the persistent
  `MediaStage`, shared `OverlayPanel`, app-owned contracts, and existing adapters
  instead of creating parallel media, modal, storage, or provider systems.
- There is no enforced numeric component-size limit. Split code at ownership or
  lifecycle boundaries, and keep product policy out of presentation components
  and provider adapters.
- Treat `/` as the only application route. Retired and unknown SPA entries are
  compatibility redirects, not pages to revive.
- Treat all provider contact as explicit and cost-sensitive. Local Camera must
  remain independent of provider credentials, token minting, SDK loading, and
  external media traffic.

The normal local verification gate is:

```bash
npm run quality
```

Before release, also run `npm run test:coverage`, `npm run test:e2e`,
`npm run test:visual`, and `npm run audit:prod`. Tests deny unexpected external
HTTP and WebSockets; live device/provider checks use
[Manual QA](docs/MANUAL_QA.md) and
[Gated live provider smoke testing](docs/LIVE_PROVIDER_SMOKE.md). Do not update
visual snapshots or run the pruning script as part of an unrelated change. The
visual suite currently defines 29 cases, and the checked-in Darwin and Linux
sets each contain all 29 reviewed baselines.

When behavior, routes, storage, commands, environment variables, or provider
boundaries change, update the canonical document named in the
[README documentation map](README.md#documentation) and any affected observable
journey under `docs/userStories/`. Preserve historical rationale in
`docs/PRODUCT_EVOLUTION.md` and `LESSONS.md`; do not rewrite planned behavior as
implemented behavior.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
