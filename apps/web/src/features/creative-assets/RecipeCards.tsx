import { useTheme } from '@emotion/react';
import { Button } from '../../ui';
import {
  actionStyles,
  badgeStyles,
  cardBadgeGroupStyles,
  cardHeaderStyles,
  cardSelectButtonStyles,
  cardStyles,
  cardTitleStyles,
  emptyBodyStyles,
  emptyStyles,
  emptyTitleStyles,
  metadataStyles,
  notesStyles,
  promptStyles,
  tagsStyles,
  tagStyles,
} from './RecipeShelf.styles';
import type { ModelModeId, RecentPrompt, SavedCharacterPrompt, SavedPrompt } from './types';

export type ShelfCategory = 'saved' | 'recent' | 'characters';
export type EditAction = 'edit' | 'rename' | 'delete';

export const modeName = (mode: ModelModeId) =>
  mode === 'lucy-2.5' ? 'Character' : 'Virtual Try-On';

const formatDate = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Recently';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
};

const Tags = ({ tags }: { tags: readonly string[] }) => {
  const theme = useTheme();
  if (tags.length === 0) return null;
  return (
    <div css={tagsStyles(theme)} aria-label="Tags">
      {tags.map((tag) => (
        <span key={tag.toLocaleLowerCase()} title={tag} css={tagStyles(theme)}>
          {tag}
        </span>
      ))}
    </div>
  );
};

export const SavedPromptCard = ({
  item,
  selected = false,
  useDisabled = false,
  onSelect,
  onUse,
  onAction,
}: {
  item: SavedPrompt;
  selected?: boolean;
  useDisabled?: boolean;
  onSelect: () => void;
  onUse: () => void;
  onAction: (action: EditAction) => void;
}) => {
  const theme = useTheme();
  return (
    <article css={cardStyles(theme, selected)} data-selected={selected || undefined}>
      <header css={cardHeaderStyles(theme)}>
        <h3 css={cardTitleStyles()}>
          <button
            type="button"
            aria-pressed={selected}
            title={`Select ${item.title}`}
            css={cardSelectButtonStyles(theme)}
            onClick={onSelect}
          >
            {item.title}
          </button>
        </h3>
        <div css={cardBadgeGroupStyles(theme)}>
          {selected ? <span css={badgeStyles(theme, 'accent')}>Selected</span> : null}
          <span css={badgeStyles(theme, item.modelModeId === 'lucy-2.5' ? 'accent' : 'signal')}>
            {modeName(item.modelModeId)}
          </span>
        </div>
      </header>
      <div css={metadataStyles(theme)}>
        <span>{item.source === 'generated' ? 'Generated' : 'Written'}</span>
        <span>Updated {formatDate(item.updatedAt)}</span>
        {item.useCount > 0 ? <span>Used {item.useCount}×</span> : null}
      </div>
      <div>
        <p title={item.prompt} css={promptStyles(theme)}>
          {item.prompt}
        </p>
        <Tags tags={item.tags} />
      </div>
      <div css={actionStyles(theme)}>
        <Button
          aria-label={`Use ${item.title}`}
          variant="primary"
          size="small"
          disabled={useDisabled}
          title={
            useDisabled ? 'Recipe insertion is unavailable during the active session.' : undefined
          }
          onClick={() => {
            onSelect();
            onUse();
          }}
        >
          Use
        </Button>
        <Button
          aria-label={`Edit ${item.title}`}
          variant="quiet"
          size="small"
          onClick={() => {
            onSelect();
            onAction('edit');
          }}
        >
          Edit
        </Button>
        <Button
          aria-label={`Rename ${item.title}`}
          variant="quiet"
          size="small"
          onClick={() => {
            onSelect();
            onAction('rename');
          }}
        >
          Rename
        </Button>
        <Button
          aria-label={`Delete ${item.title}`}
          variant="quiet"
          size="small"
          onClick={() => {
            onSelect();
            onAction('delete');
          }}
        >
          Delete
        </Button>
      </div>
    </article>
  );
};

export const RecentPromptCard = ({
  item,
  selected = false,
  useDisabled = false,
  onSelect,
  onUse,
  onSave,
}: {
  item: RecentPrompt;
  selected?: boolean;
  useDisabled?: boolean;
  onSelect: () => void;
  onUse: () => void;
  onSave: () => void;
}) => {
  const theme = useTheme();
  return (
    <article css={cardStyles(theme, selected)} data-selected={selected || undefined}>
      <header css={cardHeaderStyles(theme)}>
        <h3 css={cardTitleStyles()}>
          <button
            type="button"
            aria-pressed={selected}
            title="Select recent direction"
            css={cardSelectButtonStyles(theme)}
            onClick={onSelect}
          >
            Recent direction
          </button>
        </h3>
        <div css={cardBadgeGroupStyles(theme)}>
          {selected ? <span css={badgeStyles(theme, 'accent')}>Selected</span> : null}
          <span css={badgeStyles(theme)}>Used {formatDate(item.usedAt)}</span>
        </div>
      </header>
      <div css={metadataStyles(theme)}>
        <span>{modeName(item.modelModeId)}</span>
        <span>{item.savedPromptId ? 'Linked to saved recipe' : 'Recent text only'}</span>
      </div>
      <p title={item.prompt} css={promptStyles(theme)}>
        {item.prompt}
      </p>
      <div css={actionStyles(theme)}>
        <Button
          aria-label={`Use recent prompt: ${item.prompt}`}
          variant="primary"
          size="small"
          disabled={useDisabled}
          title={
            useDisabled ? 'Recipe insertion is unavailable during the active session.' : undefined
          }
          onClick={() => {
            onSelect();
            onUse();
          }}
        >
          Use
        </Button>
        {!item.savedPromptId ? (
          <Button
            aria-label={`Save a copy of recent prompt: ${item.prompt}`}
            variant="quiet"
            size="small"
            onClick={() => {
              onSelect();
              onSave();
            }}
          >
            Save a copy
          </Button>
        ) : null}
      </div>
    </article>
  );
};

export const CharacterPromptCard = ({
  item,
  selected = false,
  useDisabled = false,
  onSelect,
  onUse,
  onOpenWorkshop,
  onAction,
}: {
  item: SavedCharacterPrompt;
  selected?: boolean;
  useDisabled?: boolean;
  onSelect: () => void;
  onUse: () => void;
  onOpenWorkshop?: (() => void) | undefined;
  onAction: (action: EditAction) => void;
}) => {
  const theme = useTheme();
  const referenceLabel =
    item.referenceImageStatus === 'prompt-only'
      ? 'Prompt only'
      : item.referenceImageStatus === 'session-portrait-not-saved'
        ? 'Session portrait was not saved'
        : 'Add a portrait when using';
  return (
    <article css={cardStyles(theme, selected)} data-selected={selected || undefined}>
      <header css={cardHeaderStyles(theme)}>
        <h3 css={cardTitleStyles()}>
          <button
            type="button"
            aria-pressed={selected}
            title={`Select ${item.name}`}
            css={cardSelectButtonStyles(theme)}
            onClick={onSelect}
          >
            {item.name}
          </button>
        </h3>
        <div css={cardBadgeGroupStyles(theme)}>
          {selected ? <span css={badgeStyles(theme, 'accent')}>Selected</span> : null}
          <span css={badgeStyles(theme, 'accent')}>Character</span>
        </div>
      </header>
      <div css={metadataStyles(theme)}>
        <span>{referenceLabel}</span>
        <span>Updated {formatDate(item.updatedAt)}</span>
        {item.useCount > 0 ? <span>Used {item.useCount}×</span> : null}
      </div>
      <div>
        <p title={item.prompt} css={promptStyles(theme)}>
          {item.prompt}
        </p>
        {item.notes ? (
          <p title={item.notes} css={notesStyles(theme)}>
            {item.notes}
          </p>
        ) : null}
        <Tags tags={item.tags} />
      </div>
      <div css={actionStyles(theme)}>
        <Button
          aria-label={`Use ${item.name}`}
          variant="primary"
          size="small"
          disabled={useDisabled}
          title={
            useDisabled ? 'Recipe insertion is unavailable during the active session.' : undefined
          }
          onClick={() => {
            onSelect();
            onUse();
          }}
        >
          Use
        </Button>
        {item.builderDraft && onOpenWorkshop ? (
          <Button
            aria-label={`Open ${item.name} in workshop`}
            variant="secondary"
            size="small"
            disabled={useDisabled}
            title={
              useDisabled ? 'The workshop is unavailable during the active session.' : undefined
            }
            onClick={() => {
              onSelect();
              onOpenWorkshop();
            }}
          >
            Open workshop
          </Button>
        ) : null}
        <Button
          aria-label={`Edit ${item.name}`}
          variant="quiet"
          size="small"
          onClick={() => {
            onSelect();
            onAction('edit');
          }}
        >
          Edit
        </Button>
        <Button
          aria-label={`Rename ${item.name}`}
          variant="quiet"
          size="small"
          onClick={() => {
            onSelect();
            onAction('rename');
          }}
        >
          Rename
        </Button>
        <Button
          aria-label={`Delete ${item.name}`}
          variant="quiet"
          size="small"
          onClick={() => {
            onSelect();
            onAction('delete');
          }}
        >
          Delete
        </Button>
      </div>
    </article>
  );
};

export const EmptyShelf = ({
  searching,
  category,
}: {
  searching: boolean;
  category: ShelfCategory;
}) => {
  const theme = useTheme();
  const categoryName =
    category === 'saved'
      ? 'saved recipes'
      : category === 'recent'
        ? 'recent prompts'
        : 'character recipes';
  return (
    <div css={emptyStyles(theme)}>
      <h3 css={emptyTitleStyles(theme)}>
        {searching ? 'No matching recipes' : `No ${categoryName} yet`}
      </h3>
      <p css={emptyBodyStyles()}>
        {searching
          ? 'Try a shorter search or another shelf.'
          : category === 'recent'
            ? 'Recent prompts appear only after a successful model Start or Apply.'
            : 'Save useful text once, then bring it into any working draft without starting media.'}
      </p>
    </div>
  );
};
