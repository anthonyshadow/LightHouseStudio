import { useTheme, type CSSObject, type Theme } from '@emotion/react';

const previewStyles = (theme: Theme, variant: 'cards' | 'rows'): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: variant === 'cards' ? 'repeat(3, minmax(0, 1fr))' : 'minmax(0, 1fr)',
  width: 'min(22rem, 100%)',
  gap: theme.space.xs,
  marginInline: 'auto',
  opacity: 0.75,
  '& [data-preview-item]': {
    display: 'grid',
    gap: '0.3rem',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.surface,
    ...(variant === 'cards'
      ? { padding: '0.4rem' }
      : {
          gridTemplateColumns: '2.4rem minmax(0, 1fr)',
          gap: theme.space.xs,
          alignItems: 'center',
          padding: '0.35rem 0.4rem',
        }),
  },
  '& [data-preview-poster]': {
    borderRadius: theme.radii.small,
    background: `linear-gradient(135deg, ${theme.colors.accentSoft}, ${theme.colors.surfaceStrong})`,
    ...(variant === 'cards' ? { aspectRatio: '16 / 10' } : { height: '1.6rem' }),
  },
  '& [data-preview-lines]': { display: 'grid', gap: '0.28rem' },
  '& [data-preview-line]': {
    height: '0.32rem',
    borderRadius: theme.radii.small,
    background: theme.colors.border,
  },
  '& [data-preview-line="short"]': { width: '55%' },
});

/**
 * The one treatment for an empty state's "for example" line, exported beside the ghost preview so
 * the surfaces that teach through their empty states cannot drift apart on it.
 */
export const emptyExampleStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.textFaint,
  fontSize: theme.fontSizes.metadata,
});

/**
 * A decorative ghost of the populated surface — poster tiles or list rows with placeholder text
 * lines — so an empty state shows what will appear here instead of only saying nothing has. It is
 * presentation only: inline-styled, request-free, and hidden from assistive technology, which
 * gets the real explanation from the surrounding copy.
 */
export const EmptyStatePreview = ({ variant = 'cards' }: { variant?: 'cards' | 'rows' }) => {
  const theme = useTheme();
  return (
    <div aria-hidden="true" data-empty-state-preview="" css={previewStyles(theme, variant)}>
      {[0, 1, 2].map((index) => (
        <span key={index} data-preview-item="">
          <span data-preview-poster="" />
          <span data-preview-lines="">
            <span data-preview-line="" />
            <span data-preview-line="short" />
          </span>
        </span>
      ))}
    </div>
  );
};
