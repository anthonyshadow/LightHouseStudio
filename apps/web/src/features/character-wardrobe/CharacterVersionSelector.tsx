import { useTheme } from '@emotion/react';
import { Button } from '../../ui';
import { referenceImageContentUrl } from '../../adapters/api-client/referenceImageRoutes';

export type CharacterVersionOption = Readonly<{
  value: string;
  title: string;
  characterName?: string;
  referenceImageAssetId: string | null;
  original: boolean;
  useCount?: number;
}>;

export const CharacterVersionSelector = ({
  versions,
  selectedValue,
  disabled = false,
  allowPromptOnlyOriginal = false,
  actionLabel = 'Use',
  onSelect,
  onDelete,
}: {
  readonly versions: readonly CharacterVersionOption[];
  readonly selectedValue: string | null;
  readonly disabled?: boolean;
  readonly allowPromptOnlyOriginal?: boolean;
  readonly actionLabel?: string;
  readonly onSelect: (value: string) => void;
  readonly onDelete?: (value: string) => void;
}) => {
  'use memo';

  const theme = useTheme();
  return (
    <div
      role="list"
      aria-label="Character versions"
      css={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 11rem), 1fr))',
        gap: theme.space.sm,
        '@media (min-width: 22.01rem) and (max-width: 40rem)': {
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        },
        '@media (max-width: 22rem)': {
          gridTemplateColumns: 'minmax(0, 1fr)',
        },
      }}
    >
      {versions.map((version) => {
        const selected = selectedValue === version.value;
        return (
          <article
            key={version.value}
            role="listitem"
            data-selected={selected || undefined}
            css={{
              minWidth: 0,
              display: 'grid',
              gap: theme.space.xs,
              padding: theme.space.xs,
              border: `1px solid ${selected ? theme.colors.accent : theme.colors.border}`,
              borderRadius: theme.radii.medium,
              background: selected ? theme.colors.surfaceSoft : theme.colors.canvas,
            }}
          >
            <div
              css={{
                aspectRatio: '1',
                overflow: 'hidden',
                borderRadius: theme.radii.small,
                background: theme.colors.surfaceSoft,
              }}
            >
              {version.referenceImageAssetId ? (
                <img
                  src={referenceImageContentUrl(version.referenceImageAssetId)}
                  alt={`${version.title} character version`}
                  css={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
                />
              ) : (
                <div
                  css={{
                    width: '100%',
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    padding: theme.space.sm,
                    color: theme.colors.textMuted,
                    textAlign: 'center',
                  }}
                >
                  Prompt only
                </div>
              )}
            </div>
            <div css={{ minWidth: 0 }}>
              {version.characterName ? <small>{version.characterName}</small> : null}
              <strong css={{ display: 'block', overflowWrap: 'anywhere' }}>{version.title}</strong>
              <small>
                {version.original ? 'Original character' : 'Wardrobe variant'}
                {version.useCount ? ` · Used ${version.useCount}×` : ''}
              </small>
            </div>
            <div css={{ display: 'grid', gap: theme.space.xs }}>
              <Button
                variant={selected ? 'primary' : 'secondary'}
                size="small"
                disabled={
                  disabled ||
                  (!version.referenceImageAssetId && !(allowPromptOnlyOriginal && version.original))
                }
                aria-pressed={selected}
                onClick={() => onSelect(version.value)}
              >
                {selected ? 'Selected' : actionLabel}
              </Button>
              {!version.original && onDelete ? (
                <Button
                  variant="danger"
                  size="small"
                  disabled={disabled}
                  aria-label={`Delete ${version.title}`}
                  onClick={() => onDelete(version.value)}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
};
