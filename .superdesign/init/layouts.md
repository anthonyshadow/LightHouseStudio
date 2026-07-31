# Shared layouts

Lightframe is not a conventional multi-page shell. `/studio` owns one persistent media stage and
opens tools through one shared overlay system.

## Studio design boundary

- Source: `apps/web/src/ui/StudioDesignProvider.tsx`
- Supplies the Emotion theme and global fixed-viewport/safe-area rules.

```tsx
import { Global, ThemeProvider, type CSSObject } from '@emotion/react';
import type { PropsWithChildren } from 'react';
import { studioTheme, type StudioTheme } from './theme';

const globalStyles = (theme: StudioTheme): CSSObject => ({
  ':root': {
    colorScheme: 'dark',
    fontFamily: theme.type.sans,
    fontSynthesis: 'none',
    textRendering: 'optimizeLegibility',
    background: theme.colors.canvas,
  },
  '*': { boxSizing: 'border-box' },
  '*::before, *::after': { boxSizing: 'border-box' },
  'html, body, #root': {
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    margin: 0,
    overflow: 'hidden',
  },
  html: { background: theme.colors.canvas, overscrollBehavior: 'none' },
  body: {
    width: '100%',
    height: '100vh',
    color: theme.colors.text,
    background: theme.gradients.shellAmbient,
    overscrollBehavior: 'none',
  },
  '@supports (height: 100svh)': { body: { height: '100svh' } },
  '#root': { position: 'relative', isolation: 'isolate' },
  '@supports (height: 100dvh)': { body: { height: '100dvh' } },
  'button, input, textarea, select': { font: 'inherit', maxWidth: '100%' },
  button: { touchAction: 'manipulation' },
  'img, video, audio, canvas, svg': { display: 'block', maxWidth: '100%' },
  'h1, h2, h3, h4, p': { marginBlockStart: 0 },
  'p, li, dd, dt, label, legend, button': { overflowWrap: 'break-word' },
  a: { color: theme.colors.accentStrong },
  '::selection': { color: theme.colors.canvas, background: theme.colors.accent },
  ':focus:not(:focus-visible)': { outline: 'none' },
  '@media (prefers-reduced-motion: reduce)': {
    '*, *::before, *::after': {
      scrollBehavior: 'auto',
      animationDuration: '0.01ms',
      animationIterationCount: '1',
      transitionDuration: '0.01ms',
    },
  },
});

export const StudioDesignProvider = ({ children }: PropsWithChildren) => (
  <ThemeProvider theme={studioTheme}>
    <Global styles={globalStyles(studioTheme)} />
    {children}
  </ThemeProvider>
);
```

## OverlayPanel

- Source: `apps/web/src/ui/primitives/OverlayPanel.tsx`
- Shared drawer, bottom-sheet, and fullscreen surface. It owns the portal, overlay stack, focus
  trap, inert siblings, Escape, return focus, backdrop policy, contained body, and sticky footer.
- The Character builder uses `placement="fullscreen"`, `size="wide"`, `bodyMode="contained"`,
  `initialFocus="heading"`, and disables backdrop close.
- Full styling source: `apps/web/src/ui/primitives/OverlayPanel.styles.ts`.

The design must keep this DOM/lifecycle owner and must not introduce a second modal or page shell.

## Studio runtime composition

- Source: `apps/web/src/studio/StudioApp.tsx`
- Owns one persistent `MediaStage`, one `OverlayPanel` system, shared controller contracts, and all
  tool launch/close coordination. The Character builder is mounted through
  `apps/web/src/features/character-builder/CharacterBuilderCoordinator.tsx`.
