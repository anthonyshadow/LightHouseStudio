# Product audit — August 2026

A code-first, cross-functional audit of Lightframe Studio: what exists, what works, what does not,
and what to build next. Every finding cites the code or the observed running product.

**Method.** The repository was read directly, the application was run locally
(`bun run dev`, Postgres + R2 + all providers configured) and driven through its real surfaces.
Existing documentation was read for intent only; where a document and the code disagreed, the code
won. Findings are separated into **confirmed** (reproduced or read in the code) and
**suspected** (reasoned, not reproduced).

**This is an assessment, not a decision.** Nothing here has been implemented.

## Read in this order

| #                                        | Document                | Answers                                                          |
| ---------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| [00](00-executive-summary.md)            | Executive summary       | What is this product, what is wrong, what to do first            |
| [01](01-current-product-map.md)          | Current product map     | What actually exists — routes, data model, capabilities          |
| [02](02-user-flow-audit.md)              | User-flow audit         | Every journey traced end to end, with friction and severity      |
| [03](03-ui-ux-audit.md)                  | UI/UX audit             | Information architecture, hierarchy, states, accessibility       |
| [04](04-creative-workflow-audit.md)      | Creative workflow audit | Idea → source → create → review → save → organize → export       |
| [05](05-product-gap-analysis.md)         | Product gap analysis    | Strengths, missing capability, what not to build                 |
| [06](06-technical-architecture-audit.md) | Architecture audit      | Boundaries, performance, scalability, security, maintainability  |
| [07](07-bugs-and-risks.md)               | Bugs and risks          | Confirmed defects and unverified risks                           |
| [08](08-prioritized-findings.md)         | Prioritized findings    | The full register: P0–P4, effort, risk, dependencies, quick wins |
| [09](09-future-opportunities.md)         | Future opportunities    | Deliberately deferred ideas and why                              |
| [10](10-implementation-roadmap.md)       | Implementation roadmap  | Ordered incremental steps, each independently reviewable         |
| [prompts](prompts/README.md)             | Implementation prompts  | One standalone coding-agent prompt per roadmap step              |

## Relationship to existing documentation

This audit does **not** replace [`user-flows/gaps-and-usability-audit.md`](../user-flows/gaps-and-usability-audit.md),
which tracks an earlier finding-by-finding remediation programme through Tier 4. That work is real
and most of it has shipped. This audit re-verified its open items against the current code and takes
a wider view: product strategy, creative workflow, architecture at scale, and what to build next.

Where a finding here restates an open item from that document, the original identifier is cited.
