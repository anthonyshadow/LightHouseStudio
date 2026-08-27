# Implementation prompts

One standalone prompt per roadmap step, in execution order. Each is self-contained: hand it to a
coding agent without any other context from this audit.

Each prompt carries its own acceptance criteria and its own validation commands. None of them
instructs an agent to run the whole test suite, build the repository, or lint everything — the
validation is scoped to what the step touches, per
[`../../../TESTING.md`](../../../TESTING.md) and the table in [`../../../../CLAUDE.md`](../../../../CLAUDE.md).

| Order | Prompt                                                                                 | Complexity | Depends on |
| ----- | -------------------------------------------------------------------------------------- | ---------- | ---------- |
| 1     | [Repair the documentation link gate](step-01-documentation-link-gate.md)               | XS         | —          |
| 2     | [Say where the media actually goes](step-02-truthful-privacy-copy.md)                  | XS         | 1          |
| 3     | [Repair the small-screen Save panel](step-03-small-screen-save-panel.md)               | S          | —          |
| 4     | [Save the video in the chosen placement](step-04-save-in-the-chosen-placement.md)      | L          | 3          |
| 5     | [Carry the placement with the video](step-05-carry-the-placement.md)                   | S          | 4          |
| 6     | [Put creation in the Create step](step-06-creation-in-the-create-step.md)              | M          | —          |
| 7     | [Stop showing internal identifiers](step-07-remove-internal-identifiers.md)            | S          | 6, 8       |
| 8     | [Choose an engine by what it does](step-08-engine-by-capability.md)                    | S          | —          |
| 9     | [Find a character or an outfit by name](step-09-search-creative-libraries.md)          | S          | —          |
| 10    | [Make every destination a real link](step-10-real-links.md)                            | M          | —          |
| 11    | [Give a Campaign something to do](step-11-campaign-placements.md)                      | L          | 4          |
| 12    | [Show what the AI work has cost](step-12-ai-usage-ledger.md)                           | M          | —          |
| 13    | [One conformance suite for both repositories](step-13-repository-conformance-suite.md) | M          | —          |

Steps 1–5 are the coherent-MVP boundary. Step 4 is the one that matters most and carries the most
risk; steps 1–3 are deliberately placed before it so it lands on a sound, honestly-validated surface.
