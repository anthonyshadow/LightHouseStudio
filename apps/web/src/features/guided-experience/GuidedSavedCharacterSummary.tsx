import { useTheme } from '@emotion/react';

export type GuidedSavedCharacterSummaryProps = Readonly<{
  characterName: string;
  referenceImageUrl: string | null;
}>;

export const GuidedSavedCharacterSummary = ({
  characterName,
  referenceImageUrl,
}: GuidedSavedCharacterSummaryProps) => {
  const theme = useTheme();

  return (
    <section
      aria-label="Saved character"
      css={{
        display: 'grid',
        gridTemplateColumns: referenceImageUrl ? 'minmax(5rem, 7rem) minmax(0, 1fr)' : '1fr',
        gap: theme.space.sm,
        alignItems: 'center',
        padding: theme.space.sm,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.medium,
        background: theme.colors.canvasRaised,
        minWidth: 0,
      }}
    >
      {referenceImageUrl ? (
        <img
          src={referenceImageUrl}
          alt={`Generated reference for ${characterName}`}
          css={{
            display: 'block',
            inlineSize: '100%',
            maxBlockSize: '8rem',
            aspectRatio: '3 / 4',
            objectFit: 'contain',
            borderRadius: theme.radii.small,
            background: theme.colors.canvas,
          }}
        />
      ) : null}
      <div css={{ minWidth: 0 }}>
        <span css={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.caption }}>
          Saved character
        </span>
        <strong css={{ display: 'block', overflowWrap: 'anywhere' }}>{characterName}</strong>
        <span css={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.caption }}>
          {referenceImageUrl
            ? 'Generated reference attached to this character'
            : 'Complete prompt saved without a reference image'}
        </span>
      </div>
    </section>
  );
};
