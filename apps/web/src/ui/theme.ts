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
    onAccent: string;
    violet: string;
    violetSoft: string;
    signal: string;
    signalSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    recording: string;
    recordingSoft: string;
    success: string;
    successSoft: string;
    focus: string;
    shadow: string;
    scrim: string;
    overlaySurface: string;
  };
  gradients: {
    shellAmbient: string;
    stageIdle: string;
    stageScrim: string;
    recordingGlow: string;
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
  fontSizes: {
    caption: string;
    metadata: string;
    body: string;
    label: string;
    section: string;
    stageTitle: string;
  };
  shadows: {
    soft: string;
    lifted: string;
    focus: string;
    recording: string;
  };
  motion: {
    quick: string;
    standard: string;
  };
  layout: {
    shellRows: {
      header: string;
      headerCompact: string;
      headerMobile: string;
      headerUltra: string;
      capture: string;
      captureCompact: string;
      captureTablet: string;
      captureMobile: string;
      captureUltra: string;
      launcher: string;
      launcherCompact: string;
      launcherMobile: string;
      launcherUltra: string;
    };
    overlays: {
      drawer: string;
      drawerTablet: string;
      drawerWide: string;
      drawerWideCompact: string;
      bottom: string;
      bottomCompact: string;
      bottomTablet: string;
    };
  };
  layers: {
    stageMedia: number;
    stageContent: number;
    stageGuides: number;
    stageChrome: number;
    stageBlocking: number;
    stageNotices: number;
    skipLink: number;
    overlay: number;
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
  gradients: {
    shellAmbient: [
      'radial-gradient(circle at 8% -8%, rgba(98, 230, 194, 0.12), transparent 34rem)',
      'radial-gradient(circle at 92% 2%, rgba(155, 124, 255, 0.1), transparent 32rem)',
      '#090d12',
    ].join(', '),
    stageIdle: [
      'radial-gradient(circle at 18% 15%, rgba(98, 230, 194, 0.25), transparent 36%)',
      'radial-gradient(circle at 82% 28%, rgba(155, 124, 255, 0.24), transparent 42%)',
      'linear-gradient(145deg, #0b2027 0%, #101827 48%, #18132d 100%)',
    ].join(', '),
    stageScrim: 'linear-gradient(180deg, rgba(5, 9, 14, 0.04) 38%, rgba(5, 9, 14, 0.72) 100%)',
    recordingGlow:
      'radial-gradient(circle, rgba(255, 91, 100, 0.28) 0%, rgba(255, 91, 100, 0.1) 46%, transparent 72%)',
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
  fontSizes: {
    caption: '0.75rem',
    metadata: '0.8125rem',
    body: '0.875rem',
    label: '1rem',
    section: '1.125rem',
    stageTitle: 'clamp(1.375rem, 2vw, 1.875rem)',
  },
  shadows: {
    soft: '0 12px 38px rgba(0, 0, 0, 0.18)',
    lifted: '0 24px 70px rgba(0, 0, 0, 0.32)',
    focus: '0 0 0 3px rgba(146, 221, 255, 0.35)',
    recording: '0 0 0 1px rgba(255, 91, 100, 0.45), 0 0 26px rgba(255, 91, 100, 0.24)',
  },
  motion: {
    quick: '120ms ease',
    standard: '220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  },
  layout: {
    shellRows: {
      header: '4.5rem',
      headerCompact: '4rem',
      headerMobile: '3.5rem',
      headerUltra: '3rem',
      capture: '6.25rem',
      captureCompact: '5.5rem',
      captureTablet: '7.5rem',
      captureMobile: '5rem',
      captureUltra: '4.5rem',
      launcher: '3rem',
      launcherCompact: '2.75rem',
      launcherMobile: '3.25rem',
      launcherUltra: '3rem',
    },
    overlays: {
      drawer: 'clamp(22.5rem, 27vw, 26rem)',
      drawerTablet: 'min(30rem, calc(100vw - 2rem))',
      drawerWide: 'min(50rem, calc(100vw - 1rem))',
      drawerWideCompact: 'min(42rem, calc(100vw - 1rem))',
      bottom: 'min(52dvh, 32rem)',
      bottomCompact: 'min(68dvh, 30rem)',
      bottomTablet: '88dvh',
    },
  },
  layers: {
    stageMedia: 1,
    stageContent: 2,
    stageGuides: 3,
    stageChrome: 5,
    stageBlocking: 6,
    stageNotices: 7,
    skipLink: 100,
    overlay: 1_000,
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
