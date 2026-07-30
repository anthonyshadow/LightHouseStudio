# Structured prompt workshop

**Outcome:** compose a focused Add, Replace, or Restyle object direction for Lucy 2.5 without
starting media or provider work.

Character creation, editing, upload, and reference generation belong to
[Character Builder](11-studio-character-builder.md), not Workshop.

## Journey

1. Select **Workshop**, or open a compatible legacy object-edit record from Recipe Shelf.
2. Choose **Add one object**, **Replace one object**, or **Restyle one object**. Each intent keeps
   its own in-tab draft.
3. Enter the visible target/change and optional guardrails.
4. Review **Generated recipe summary** and resolve blocking feedback.
5. Select **Use in working draft** to replace the Lucy 2.5 text draft atomically.
6. Optionally name and **Save to Recipe Shelf**.

## Guards and recovery

- Validation blocks Use and Save without changing the Studio draft.
- Reset confirms only when the current intent has content and never clears the other two drafts.
- Ordinary close preserves all three drafts for the current tab.
- True character records never expose **Open workshop**.
- Workshop never starts camera, token, optimizer, image-generation, or realtime provider work.
