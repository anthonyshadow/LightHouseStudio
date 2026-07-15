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
  '*': {
    boxSizing: 'border-box',
  },
  'html, body, #root': {
    minHeight: '100%',
    margin: 0,
  },
  html: {
    background: theme.colors.canvas,
  },
  body: {
    minHeight: '100vh',
    color: theme.colors.text,
    background: [
      'radial-gradient(circle at 12% -12%, rgba(98, 230, 194, 0.12), transparent 32rem)',
      'radial-gradient(circle at 96% 4%, rgba(255, 198, 92, 0.09), transparent 28rem)',
      theme.colors.canvas,
    ].join(', '),
  },
  '@supports (min-height: 100dvh)': {
    body: { minHeight: '100dvh' },
  },
  'button, input, textarea, select': {
    font: 'inherit',
  },
  button: {
    touchAction: 'manipulation',
  },
  'img, video, audio, canvas, svg': {
    display: 'block',
    maxWidth: '100%',
  },
  'h1, h2, h3, p': {
    marginBlockStart: 0,
  },
  a: {
    color: theme.colors.accentStrong,
  },
  '::selection': {
    color: theme.colors.canvas,
    background: theme.colors.accent,
  },
  ':focus:not(:focus-visible)': {
    outline: 'none',
  },
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
