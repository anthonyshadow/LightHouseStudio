import { useTheme } from '@emotion/react';
import { useState } from 'react';
import type { RecipeSelection } from './RecipeShelf.types';
import type { CreativeAssetRepository, RecentPrompt, SavedPrompt } from './types';
import { Button, SegmentedControl, StatusNotice, Surface } from '../../ui';

const views = [
  { value: 'saved', label: 'Saved' },
  { value: 'recent', label: 'Recent' },
] as const;

type OutfitSelectorProps = {
  readonly repository: CreativeAssetRepository;
  readonly disabledReason?: string | undefined;
  readonly activeOutfitLabel?: string | undefined;
  readonly onClear?: (() => void) | undefined;
  readonly onCreate: () => void;
  readonly onEdit: (outfit: SavedPrompt) => void;
  readonly onSaveCopy: (outfit: SavedPrompt) => void;
  readonly onSelect: (selection: RecipeSelection) => void;
};

const recentLabel = (item: RecentPrompt, saved: SavedPrompt | undefined) =>
  saved?.title ?? (item.prompt.trim() ? item.prompt.trim().slice(0, 72) : 'Image outfit');

export const OutfitSelector = ({
  repository,
  disabledReason,
  activeOutfitLabel,
  onClear,
  onCreate,
  onEdit,
  onSaveCopy,
  onSelect,
}: OutfitSelectorProps) => {
  const theme = useTheme();
  const [view, setView] = useState<'saved' | 'recent'>('saved');
  const [error, setError] = useState<string | null>(null);
  const store = repository.getSnapshot().store;
  const saved = store.savedPrompts.filter((item) => item.modelModeId === 'lucy-vton-latest');
  const recent = store.recentPrompts.filter((item) => item.modelModeId === 'lucy-vton-latest');
  const choose = (item: SavedPrompt | RecentPrompt) => {
    const isSaved = 'title' in item;
    onSelect({
      origin: isSaved ? 'saved-prompt' : 'recent-prompt',
      prompt: item.prompt,
      modelModeId: 'lucy-vton-latest',
      ...(isSaved
        ? { assetId: item.id }
        : item.savedPromptId
          ? { assetId: item.savedPromptId }
          : {}),
      referenceImageAssetId: item.referenceImageAssetId,
      vtonInputKind: item.vtonInputKind,
      enhancePrompt: item.enhancePrompt,
    });
  };

  return (
    <div css={{ display: 'grid', gap: theme.space.md, alignContent: 'start' }}>
      {activeOutfitLabel ? (
        <Surface tone="soft" padding="compact">
          <p>{activeOutfitLabel} is currently selected.</p>
          {onClear ? (
            <Button variant="danger" disabled={Boolean(disabledReason)} onClick={onClear}>
              Unselect outfit
            </Button>
          ) : null}
        </Surface>
      ) : null}
      <Button
        variant="primary"
        disabled={Boolean(disabledReason)}
        title={disabledReason}
        onClick={onCreate}
      >
        Create new outfit
      </Button>
      <SegmentedControl label="Outfit library" value={view} options={views} onChange={setView} />
      {error ? (
        <StatusNotice tone="danger" role="alert">
          {error}
        </StatusNotice>
      ) : null}
      <div css={{ display: 'grid', gap: theme.space.sm }}>
        {view === 'saved' ? (
          saved.length ? (
            saved.map((item) => (
              <Surface key={item.id} tone="soft" padding="compact">
                <h3>{item.title}</h3>
                <p>
                  {item.vtonInputKind === 'saved-outfit' ? 'Reference image outfit' : item.prompt}
                </p>
                <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.xs }}>
                  <Button
                    variant="primary"
                    disabled={Boolean(disabledReason)}
                    onClick={() => choose(item)}
                  >
                    Select
                  </Button>
                  <Button variant="secondary" onClick={() => onEdit(item)}>
                    Edit
                  </Button>
                  <Button variant="quiet" onClick={() => onSaveCopy(item)}>
                    Save a copy
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (!window.confirm(`Remove ${item.title} from saved outfits?`)) return;
                      try {
                        repository.deleteSavedPrompt(item.id);
                        setError(null);
                      } catch (caught) {
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : 'The outfit could not be removed.',
                        );
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </Surface>
            ))
          ) : (
            <p>No saved outfits yet.</p>
          )
        ) : recent.length ? (
          recent.map((item) => {
            const linked = saved.find((candidate) => candidate.id === item.savedPromptId);
            return (
              <Surface key={item.id} tone="soft" padding="compact">
                <h3>{recentLabel(item, linked)}</h3>
                <p>
                  {item.vtonInputKind === 'saved-outfit'
                    ? 'Recently used image outfit'
                    : item.prompt}
                </p>
                <Button
                  variant="primary"
                  disabled={Boolean(disabledReason)}
                  onClick={() => choose(item)}
                >
                  Select
                </Button>
              </Surface>
            );
          })
        ) : (
          <p>
            No recently used outfits yet. An outfit appears here after a successful Start or Apply.
          </p>
        )}
      </div>
    </div>
  );
};
