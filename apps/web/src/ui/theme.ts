import type { CSSObject } from '@emotion/react';

export interface StudioTheme {
  colors: {
    canvas: string;
    canvasRaised: string;
    surface: string;
    surfaceStrong: string;
    surfaceSoft: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textFaint: string;
    accent: string;
    accentStrong: string;
    accentSoft: string;
    signal: string;
    signalSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    success: string;
    successSoft: string;
    focus: string;
    shadow: string;
  };
  radii: {
    small: string;
    medium: string;
    large: string;
    round: string;
  };
  space: {
    xxs: string;
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  type: {
    sans: string;
    display: string;
    mono: string;
  };
  shadows: {
    soft: string;
    lifted: string;
    focus: string;
  };
  motion: {
    quick: string;
    standard: string;
  };
  breakpoints: {
    tablet: string;
    laptop: string;
    desktop: string;
    wide: string;
  };
}

declare module '@emotion/react' {
  export interface Theme extends StudioTheme {
    readonly __emotionStudioThemeBrand?: never;
  }
}

export const studioTheme: StudioTheme = {
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
    signal: '#ffc65c',
    signalSoft: '#3b2d12',
    warning: '#ffbf69',
    warningSoft: '#3a2914',
    danger: '#ff8178',
    dangerSoft: '#411e20',
    success: '#69e6a6',
    successSoft: '#15382a',
    focus: '#92ddff',
    shadow: '#020405',
  },
  radii: {
    small: '0.5rem',
    medium: '0.8rem',
    large: '1.2rem',
    round: '999px',
  },
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
  shadows: {
    soft: '0 12px 38px rgba(0, 0, 0, 0.18)',
    lifted: '0 24px 70px rgba(0, 0, 0, 0.32)',
    focus: '0 0 0 3px rgba(146, 221, 255, 0.35)',
  },
  motion: {
    quick: '120ms ease',
    standard: '220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  },
  breakpoints: {
    tablet: '40rem',
    laptop: '64rem',
    desktop: '80rem',
    wide: '100rem',
  },
};

export const focusRingStyles = (theme: StudioTheme): CSSObject => ({
  outline: `2px solid ${theme.colors.focus}`,
  outlineOffset: '3px',
});
