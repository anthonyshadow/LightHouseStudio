# Product audit — second pass, 26 August 2026

An independent, code-first, cross-functional audit of Lightframe Studio, carried out five days
after the [first pass](../../archived/README.md) and after its fifteen-step roadmap and the five-tier UX
programme had both landed on `develop`.

This is a **new assessment of the product as it stands**, not an update to the earlier one. The
earlier audit is history: its findings describe a product that no longer exists, and its roadmap is
complete. Nothing here restates it without re-verifying it.

## Method

- The repository was read directly. Documentation was read for intent only; where a document and
  the code disagreed, the code won.
- The application was **run and driven**: `bun run dev` against Postgres and R2 with every provider
  configured (`/api/capabilities` returned Decart, Pruna, BFL, Wiro, OpenAI and ElevenLabs all
  available), signed in as the demo account, on the real data in that database.
- Behaviour was verified by hit-testing, measurement and network inspection in the running page,
  not by reading a screenshot. Where a claim rests on a measurement, the measurement is quoted.
- No paid provider work was submitted at any point during this audit.

Findings are separated into **confirmed** — reproduced in the running product or read directly in
the code, with the file and line cited — and **suspected**, which are reasoned but were not
reproduced. Suspected findings are never given a priority above P3.

## What this audit concluded, in one line

The product is correct, well engineered and no longer confusing; what it is missing is that **the
artifact it stores is not the artifact it promises**.

## Read in this order

| #                                        | Document                | Answers                                                           |
| ---------------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| [00](00-executive-summary.md)            | Executive summary       | What this is, what is wrong, what to do first                     |
| [01](01-current-product-map.md)          | Current product map     | Routes, data model, capabilities, what exists today               |
| [02](02-user-flow-audit.md)              | User-flow audit         | Every journey traced end to end, with friction and severity       |
| [03](03-ui-ux-audit.md)                  | UI/UX audit             | Hierarchy, language, states, responsive behaviour, accessibility  |
| [04](04-creative-workflow-audit.md)      | Creative workflow audit | Idea → source → create → review → save → organize → export        |
| [05](05-product-gap-analysis.md)         | Product gap analysis    | Strengths, missing capability, what not to build                  |
| [06](06-technical-architecture-audit.md) | Architecture audit      | Boundaries, performance, security, observability, maintainability |
| [07](07-bugs-and-risks.md)               | Bugs and risks          | Confirmed defects, and risks that need reproduction               |
| [08](08-prioritized-findings.md)         | Prioritized findings    | The register: P0–P4, effort, risk, dependencies, quick wins       |
| [09](09-future-opportunities.md)         | Future opportunities    | Deliberately deferred, and why                                    |
| [10](10-implementation-roadmap.md)       | Implementation roadmap  | Thirteen ordered steps, each independently reviewable             |
| [prompts/](prompts/README.md)            | Implementation prompts  | One standalone coding-agent prompt per roadmap step               |

## Relationship to the rest of the documentation

- [`../../archived/README.md`](../../archived/README.md) — the first-pass audit. Historical.
- [`../../user-flows/gaps-and-usability-audit.md`](../../user-flows/gaps-and-usability-audit.md) —
  the finding-by-finding remediation programme. Its open items were re-verified here; those that
  have shipped are not repeated.
- [`../../PRODUCT_ROADMAP.md`](../../PRODUCT_ROADMAP.md) — product intent. Not implementation
  authority, and not treated as evidence anywhere in this audit.

**This is an assessment, not a decision.** Nothing in it has been implemented.
