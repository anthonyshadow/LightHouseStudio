import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { HTMLAttributes, PropsWithChildren } from 'react';

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'aside' | 'div' | 'article';
  tone?: 'default' | 'soft' | 'strong';
  padding?: 'compact' | 'regular' | 'spacious';
}

const surfaceStyles = (
  theme: Theme,
  tone: NonNullable<SurfaceProps['tone']>,
  padding: NonNullable<SurfaceProps['padding']>,
): CSSObject => ({
  minWidth: 0,
  padding:
    padding === 'compact'
      ? theme.space.sm
      : padding === 'spacious'
        ? `clamp(${theme.space.lg}, 3vw, ${theme.space.xl})`
        : `clamp(${theme.space.md}, 2vw, ${theme.space.lg})`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background:
    tone === 'soft'
      ? theme.colors.surfaceSoft
      : tone === 'strong'
        ? theme.colors.surfaceStrong
        : theme.colors.surface,
  boxShadow: theme.shadows.soft,
});

export const Surface = ({
  as: Element = 'section',
  tone = 'default',
  padding = 'regular',
  children,
  ...props
}: PropsWithChildren<SurfaceProps>) => {
  const theme = useTheme();

  return (
    <Element css={surfaceStyles(theme, tone, padding)} {...props}>
      {children}
    </Element>
  );
};
