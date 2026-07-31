# Theme

## Compact token summary

- Framework: React 19 + Emotion; no Tailwind.
- Color scheme: dark only.
- Canvas: `#090d12`; raised canvas: `#0d131a`.
- Surfaces: `#111922`, strong `#17232f`, soft `#0f171f`.
- Borders: `#293642`, strong `#405363`.
- Text: `#f4f7f8`; muted `#b4c0c8`; faint `#7f909d`.
- Primary accent: mint `#62e6c2`, strong `#9ff3dc`, soft `#153d37`, on-accent `#041612`.
- Supporting violet: `#9b7cff`; signal `#ffc65c`; warning `#ffbf69`; danger `#ff8178`.
- Focus: `#92ddff`; overlay surface `rgba(9, 13, 18, 0.96)`.
- Fonts: Inter/system for UI, Avenir Next/system for display, SFMono for code/metadata.
- Type: 12px caption, 13px metadata, 14px body, 16px label, 18px section.
- Spacing: 4, 8, 12, 16, 24, 32, 48px.
- Radii: 8px small, 12.8px medium, 19.2px large, pill.
- Shadows: soft `0 12px 38px rgba(0,0,0,.18)`; lifted
  `0 24px 70px rgba(0,0,0,.32)`.
- Motion: 120ms ease quick; 220ms cubic-bezier standard; disabled for reduced motion.
- Breakpoints: 40rem tablet, 64rem laptop, 80rem desktop, 100rem wide.
- Canonical viewports: 1440x960, 1280x720, 834x1112, 390x844, 320x568.

## Raw source

The complete typed token source is `apps/web/src/ui/theme.ts`; the complete global rules are
`apps/web/src/ui/StudioDesignProvider.tsx`.

```ts
export const studioTheme = {
  colors: {
    canvas: '#090d12',
    canvasRaised: '#0d131a',
    surface: '#111922',
    surfaceStrong: '#17232f',
    surfaceSoft: '#0f171f',
    border: '#293642',
    borderStrong: '#405363',
    text: '#f4f7f8',
    textMuted: '#b4c0c8',
    textFaint: '#7f909d',
    accent: '#62e6c2',
    accentStrong: '#9ff3dc',
    accentSoft: '#153d37',
    onAccent: '#041612',
    violet: '#9b7cff',
    violetSoft: '#261d45',
    signal: '#ffc65c',
    signalSoft: '#3b2d12',
    warning: '#ffbf69',
    warningSoft: '#3a2914',
    danger: '#ff8178',
    dangerSoft: '#411e20',
    recording: '#ff5b64',
    recordingSoft: '#48191f',
    success: '#69e6a6',
    successSoft: '#15382a',
    focus: '#92ddff',
    shadow: '#020405',
    scrim: 'rgba(2, 5, 9, 0.72)',
    overlaySurface: 'rgba(9, 13, 18, 0.96)',
  },
  radii: { small: '0.5rem', medium: '0.8rem', large: '1.2rem', round: '999px' },
  space: {
    xxs: '0.25rem',
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  type: {
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: '"Avenir Next", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
  fontSizes: {
    caption: '0.75rem',
    metadata: '0.8125rem',
    body: '0.875rem',
    label: '1rem',
    section: '1.125rem',
  },
  breakpoints: { tablet: '40rem', laptop: '64rem', desktop: '80rem', wide: '100rem' },
} as const;
```
