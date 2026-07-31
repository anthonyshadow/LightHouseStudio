# Lightframe Studio design system

## Product context

Lightframe Studio is a local-first, single-operator browser camera studio. The primary flow is
Camera or Upload → optional Lucy/VTO → Record → optional Voice → Download. `/studio` is a
fixed-viewport production workspace with one persistent media stage; tools are focus-managed
overlays and must never remount the media. Character Builder creates a reusable Lucy 2.5 character
from approachable visual choices, an optional upload, and an optional paid reference generation.

The Character builder must be immediately legible to first-time users: choose a starting point,
adjust only what matters, optionally preview, then save and use. Provider cost/retention disclosure
remains clear at the moment of generation without dominating the main path.

## Visual character

Keep the existing cinematic dark-studio identity. Use calm, precise hierarchy rather than a
marketing aesthetic. The interface should feel like a dependable creative instrument: deep
blue-black canvas, layered slate surfaces, mint primary actions, restrained violet accents,
high-contrast white text, and visible cyan focus rings.

Do not introduce new fonts, colors, glassmorphism, neon, decorative gradients, or a competing
card/button language.

## Tokens

- Canvas `#090d12`; raised `#0d131a`
- Surface `#111922`; strong `#17232f`; soft `#0f171f`
- Border `#293642`; strong `#405363`
- Text `#f4f7f8`; muted `#b4c0c8`; faint `#7f909d`
- Mint accent `#62e6c2`; strong `#9ff3dc`; soft `#153d37`; on accent `#041612`
- Violet `#9b7cff`; warning `#ffbf69`; danger `#ff8178`; focus `#92ddff`
- Font: Inter/system UI; Avenir Next/system display; no additional typefaces
- Type: 12px caption, 13px metadata, 14px body, 16px label, 18px section
- Spacing: 4, 8, 12, 16, 24, 32, 48px
- Radius: 8px, 13px, 19px, and pill
- Minimum touch control: about 44px
- Quick motion: 120ms; standard: 220ms; fully respect reduced motion

## Character builder UX direction

- Keep one fullscreen `OverlayPanel` and one scroll owner.
- Desktop: orientation rail or compact step overview, spacious editing canvas, and a sticky visual
  summary/preview. Do not shrink the primary preview unpredictably.
- Tablet/mobile: one reading order with a compact sticky progress/review affordance. Do not
  duplicate stateful controls.
- Use progressive disclosure for optional detail. Show a useful starter path before exposing all
  catalog options.
- Make section status scannable: incomplete, selected value, optional, and ready states.
- Keep the primary save action reachable and unambiguous. Reset stays de-emphasized.
- Clearly distinguish “preview is optional” from “character is ready to save.”
- Keep upload and generation as two understandable alternatives, with generation provider/cost
  disclosure close to its action.
- Preserve native semantics, focus trap, Escape/return focus, live status, approximately 44px
  targets, safe areas, 200% reflow, and no document scrolling.

## Responsive contract

Design explicitly for `1440×960`, `1280×720`, `834×1112`, `390×844`, and `320×568`.
At short heights, header/footer remain compact and the named body region scrolls. At narrow widths,
buttons may stack, labels may wrap, and option cards use two columns without horizontal overflow.
The sole high-consequence save action must remain visible.
