import { useTheme, type CSSObject, type Theme } from '@emotion/react';

interface GeneratedPromptPreviewProps {
  prompt: string;
}

const previewStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: `linear-gradient(135deg, ${theme.colors.canvasRaised}, ${theme.colors.surfaceSoft})`,
});

const previewHeaderStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.sm,
});

const previewLabelStyles = (theme: Theme): CSSObject => ({
  color: theme.colors.textMuted,
  fontSize: '0.78rem',
  fontWeight: 760,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
});

const previewCountStyles = (theme: Theme): CSSObject => ({
  color: theme.colors.textFaint,
  fontFamily: theme.type.mono,
  fontSize: '0.72rem',
});

const previewTextStyles = (theme: Theme, empty: boolean): CSSObject => ({
  minWidth: 0,
  minHeight: '4.8rem',
  margin: 0,
  color: empty ? theme.colors.textFaint : theme.colors.text,
  fontSize: '0.95rem',
  lineHeight: 1.6,
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
});

export const GeneratedPromptPreview = ({ prompt }: GeneratedPromptPreviewProps) => {
  const theme = useTheme();

  return (
    <div css={previewStyles(theme)}>
      <div css={previewHeaderStyles(theme)}>
        <span css={previewLabelStyles(theme)}>Generated recipe</span>
        <span css={previewCountStyles(theme)}>{prompt.length} characters</span>
      </div>
      <p css={previewTextStyles(theme, !prompt)}>
        {prompt || 'Your concise prompt will appear here as you make visible choices.'}
      </p>
    </div>
  );
};
