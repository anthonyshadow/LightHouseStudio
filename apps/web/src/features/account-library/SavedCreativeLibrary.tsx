import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { referenceImageContentUrl } from '../../adapters/api-client/referenceImageRoutes';
import type {
  CreativeAssetRepository,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../creative-assets/types';
import { Button } from '../../ui';

const grid = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))',
  gap: theme.space.md,
});
const card = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  '& img': {
    width: '100%',
    aspectRatio: '1',
    objectFit: 'cover',
    borderRadius: theme.radii.medium,
  },
  '& h3, & p': { margin: 0 },
  '& button': { minHeight: '2.75rem' },
});

export const SavedCharacterLibrary = ({
  items,
  repository,
  onUse,
}: {
  items: readonly SavedCharacterPrompt[];
  repository: CreativeAssetRepository;
  onUse: (item: SavedCharacterPrompt) => void;
}) => {
  const theme = useTheme();
  if (items.length === 0)
    return (
      <div>
        <h2>No saved characters yet</h2>
        <p>Create a character in Studio and save it to see it here.</p>
      </div>
    );
  return (
    <div css={grid(theme)}>
      {items.map((item) => (
        <article key={item.id} css={card(theme)}>
          {item.referenceImageAssetId ? (
            <img src={referenceImageContentUrl(item.referenceImageAssetId)} alt="" />
          ) : null}
          <h3>{item.name}</h3>
          <p>{item.prompt}</p>
          <Button variant="primary" onClick={() => onUse(item)}>
            Use in Studio
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm(`Delete “${item.name}” and its wardrobe records?`))
                repository.deleteSavedCharacterPrompt(item.id);
            }}
          >
            Delete
          </Button>
        </article>
      ))}
    </div>
  );
};

export const SavedOutfitLibrary = ({
  items,
  repository,
  onUse,
}: {
  items: readonly SavedPrompt[];
  repository: CreativeAssetRepository;
  onUse: (item: SavedPrompt) => void;
}) => {
  const theme = useTheme();
  if (items.length === 0)
    return (
      <div>
        <h2>No saved outfits yet</h2>
        <p>Create an outfit in Studio and save it to see it here.</p>
      </div>
    );
  return (
    <div css={grid(theme)}>
      {items.map((item) => (
        <article key={item.id} css={card(theme)}>
          {item.referenceImageAssetId ? (
            <img src={referenceImageContentUrl(item.referenceImageAssetId)} alt="" />
          ) : null}
          <h3>{item.title}</h3>
          <p>{item.prompt || 'Reference-image outfit'}</p>
          <Button variant="primary" onClick={() => onUse(item)}>
            Use in Studio
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm(`Delete “${item.title}”?`)) repository.deleteSavedPrompt(item.id);
            }}
          >
            Delete
          </Button>
        </article>
      ))}
    </div>
  );
};
