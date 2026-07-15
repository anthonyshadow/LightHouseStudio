import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { HTMLAttributes, PropsWithChildren } from 'react';

export type NoticeTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface StatusNoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: NoticeTone;
  title?: string;
}

const noticeStyles = (theme: Theme, tone: NoticeTone): CSSObject => {
  const palette = {
    neutral: { foreground: theme.colors.textMuted, background: theme.colors.surfaceStrong },
    success: { foreground: theme.colors.success, background: theme.colors.successSoft },
    warning: { foreground: theme.colors.warning, background: theme.colors.warningSoft },
    danger: { foreground: theme.colors.danger, background: theme.colors.dangerSoft },
  }[tone];

  return {
    padding: `${theme.space.sm} ${theme.space.md}`,
    border: `1px solid color-mix(in srgb, ${palette.foreground} 35%, transparent)`,
    borderRadius: theme.radii.medium,
    color: palette.foreground,
    background: palette.background,
    fontSize: '0.86rem',
    lineHeight: 1.5,
  };
};

const noticeTitleStyles = (theme: Theme): CSSObject => ({
  display: 'block',
  marginBlockEnd: theme.space.xxs,
  color: theme.colors.text,
  fontWeight: 760,
});

export const StatusNotice = ({
  tone = 'neutral',
  title,
  children,
  ...props
}: PropsWithChildren<StatusNoticeProps>) => {
  const theme = useTheme();

  return (
    <div css={noticeStyles(theme, tone)} {...props}>
      {title ? <strong css={noticeTitleStyles(theme)}>{title}</strong> : null}
      {children}
    </div>
  );
};
