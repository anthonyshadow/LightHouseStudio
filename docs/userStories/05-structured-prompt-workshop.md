# Structured prompt workshop

**Outcome:** compose a focused Add, Replace, or Restyle object direction for the current live
character transformation without starting media or provider work. The configured implementation
uses Lucy 2.5.

Character creation, editing, upload, and reference generation belong to
[Character Builder](11-studio-character-builder.md), not Workshop.

## Journey

1. Select **Workshop**.
2. Choose **Add one object**, **Replace one object**, or **Restyle one object**. Each intent keeps
   its own in-tab draft.
3. Enter the visible target/change and optional guardrails.
4. Review **Generated direction summary** and resolve blocking feedback.
5. Select **Use in working draft** to replace the Lucy 2.5 text draft atomically.

## Guards and recovery

- Validation blocks Use without changing the Studio draft.
- Reset confirms only when the current intent has content and never clears the other two drafts.
- Ordinary close preserves all three drafts for the current tab.
- Workshop never starts camera, token, optimizer, image-generation, or realtime provider work.
- In an open Project, **Use in working draft** still changes only the Studio draft. The separate
  **Save creative setup** action captures one exact applied configuration label, durable reference
  ID, resource revision, and treatment checkpoint through the existing Project session. Workshop
  remains independently owned and no Project provider Start is enabled.
- Historical saved-prompt records remain readable compatibility data for supported Character and
  Outfit workflows, but Workshop exposes no Recipe chooser or save action.
