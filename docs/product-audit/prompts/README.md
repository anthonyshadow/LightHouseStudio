# Implementation prompts

One standalone prompt per roadmap step. Each is self-contained: hand it to a coding agent without
any other context.

Execute them in order unless the [roadmap](../10-implementation-roadmap.md) says a step has no
upstream dependency. Do not combine steps.

| #   | Prompt                                                                       | Objective                                                            | Complexity |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| 1   | [step-01-provider-safety-switch.md](step-01-provider-safety-switch.md)       | Make provider content filtering configurable and default-safe        | XS         |
| 2   | [step-02-creative-library-export.md](step-02-creative-library-export.md)     | Export/import the creative library; state its durability honestly    | S          |
| 3   | [step-03-reliable-previews.md](step-03-reliable-previews.md)                 | Every saved video gets a reliable, repairable poster frame           | S          |
| 4   | [step-04-ordinary-language.md](step-04-ordinary-language.md)                 | Replace internal vocabulary in user-facing copy                      | M          |
| 5   | [step-05-complete-the-save-moment.md](step-05-complete-the-save-moment.md)   | Project output save ends with the file in hand                       | S          |
| 6   | [step-06-separate-project-surfaces.md](step-06-separate-project-surfaces.md) | Split the Project list, overview and workspace — no behaviour change | M          |
| 7   | [step-07-visual-browsing.md](step-07-visual-browsing.md)                     | Poster-backed cards on every list and hub                            | M          |
| 8   | [step-08-search-and-totals.md](step-08-search-and-totals.md)                 | Text search and real totals for Videos, Projects, Campaigns          | M          |
| 9   | [step-09-create-surface.md](step-09-create-surface.md)                       | Give the Studio create surface back to creating                      | M          |
| 10  | [step-10-dashboard.md](step-10-dashboard.md)                                 | Lead the Dashboard with the work                                     | S          |
| 11  | [step-11-export-presets.md](step-11-export-presets.md)                       | Export for a placement — 16:9, 9:16, 1:1, 4:5                        | L          |
| 12  | [step-12-variants.md](step-12-variants.md)                                   | Duplicate a Project to make another version                          | M          |
| 13  | [step-13-streamed-project-source.md](step-13-streamed-project-source.md)     | Open a Project without downloading the whole video                   | M          |
| 14  | [step-14-account-and-usage.md](step-14-account-and-usage.md)                 | Show identity, capabilities and what has been run                    | S          |
| 15  | [step-15-help-that-survives.md](step-15-help-that-survives.md)               | Explanations that outlive a dismissed onboarding card                | S          |

## Working rules embedded in every prompt

Every prompt repeats these, so it stands alone:

1. **Audit before changing.** Read the code paths involved and trace UI → handler → hook → state →
   API → service → repository → storage before editing.
2. **Understand current behaviour.** Do not infer it from a file name, a comment, a stale document
   or a passing test.
3. **Confirm dependencies exist** before starting.
4. **Reuse existing architecture, components and helpers.** `apps/web/src/ui/primitives` covers most
   UI needs. Never use `window.confirm`.
5. **No unrelated changes.** No opportunistic refactors, formatting sweeps or renames.
6. **Remove no existing functionality** unless the prompt explicitly requires it.
7. **No regressions.** Preserve behaviour the prompt does not change.
8. **Do not guess.** If something cannot be determined, say so and stop rather than inventing it.
9. **Stay in scope.**
10. **Maintain responsive behaviour** across the tested viewports (1440×960, 1280×720, 834×1112,
    390×844, 320×568).
11. **Maintain accessibility** — roles, labels, focus order, live regions, keyboard operation,
    200 % text reflow.
12. **Preserve or improve performance.** No new per-row requests, no new polling.
13. **Update the documentation the change affects**, then run `bun run check:docs`.
14. **Run only the checks relevant to the change**, unless the change is in shared foundational code.
15. **Report exactly what changed** when finished: files, decisions, validation run and its result,
    checks deliberately skipped and why, and any unresolved risk.

Repository conventions live in [`../../../CLAUDE.md`](../../../CLAUDE.md) and
[`../../../AGENTS.md`](../../../AGENTS.md).
