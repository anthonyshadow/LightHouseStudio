# Extractable components

There are no conventional cross-route navigation or footer components relevant to this overlay.
The persistent Studio shell must remain in React and is not a safe draft component extraction.

## OverlayPanel

- Source: `apps/web/src/ui/primitives/OverlayPanel.tsx`
- Category: basic
- Description: Shared portal/focus-managed drawer, sheet, and fullscreen tool surface.
- Extractable props: `placement`, `size`, `title`, `description`, `open`.
- Hardcoded: focus trap, inert behavior, Escape, portal, shared header/body/footer regions.
- Design note: pass source directly as context; do not replace its ownership with generated HTML.

## Button

- Source: `apps/web/src/ui/primitives/Button.tsx`
- Category: basic
- Description: Shared action primitive.
- Extractable props: `variant`, `size`, `busy`, `disabled`.
- Hardcoded: tokenized colors, focus ring, touch dimensions.

## CharacterChoiceDrawer

- Source: `apps/web/src/features/character-builder/CharacterChoiceDrawer.tsx`
- Category: basic
- Description: Native details/summary disclosure used for each character category.
- Extractable props: `title`, `description`, `currentLabel`, `defaultOpen`.
- Hardcoded: native disclosure semantics and chevron behavior.

## CharacterOptionButton

- Source: `apps/web/src/features/character-builder/CharacterVisualChoiceSection.tsx`
- Category: basic
- Description: Image/swatch option card with pressed state.
- Extractable props: `selected`, `disabled`, option label and image.
- Hardcoded: checkmark treatment, responsive card proportions, accessible pressed semantics.
