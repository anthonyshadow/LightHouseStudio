import { useTheme } from '@emotion/react';
import { Button } from '../../ui';
import {
  actionStyles,
  badgeStyles,
  cardHeaderStyles,
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
        <span key={tag.toLocaleLowerCase()} css={tagStyles(theme)}>
          {tag}
        </span>
      ))}
    </div>
  );
};

export const SavedPromptCard = ({
  item,
  useDisabled = false,
  onUse,
  onAction,
}: {
  item: SavedPrompt;
  useDisabled?: boolean;
  onUse: () => void;
  onAction: (action: EditAction) => void;
}) => {
  const theme = useTheme();
  return (
    <article css={cardStyles(theme)}>
      <header css={cardHeaderStyles(theme)}>
        <h3 css={cardTitleStyles()}>{item.title}</h3>
        <span css={badgeStyles(theme, item.modelModeId === 'lucy-2.5' ? 'accent' : 'signal')}>
          {modeName(item.modelModeId)}
        </span>
      </header>
      <div css={metadataStyles(theme)}>
        <span>{item.source === 'generated' ? 'Generated' : 'Written'}</span>
        <span>Updated {formatDate(item.updatedAt)}</span>
        {item.useCount > 0 ? <span>Used {item.useCount}×</span> : null}
      </div>
      <div>
        <p css={promptStyles(theme)}>{item.prompt}</p>
        <Tags tags={item.tags} />
      </div>
      <div css={actionStyles(theme)}>
        <Button
          aria-label={`Use ${item.title}`}
          variant="primary"
          size="small"
          disabled={useDisabled}
          onClick={onUse}
        >
          Use
        </Button>
        <Button
          aria-label={`Edit ${item.title}`}
          variant="quiet"
          size="small"
          onClick={() => onAction('edit')}
        >
          Edit
        </Button>
        <Button
          aria-label={`Rename ${item.title}`}
          variant="quiet"
          size="small"
          onClick={() => onAction('rename')}
        >
          Rename
        </Button>
        <Button
          aria-label={`Delete ${item.title}`}
          variant="quiet"
          size="small"
          onClick={() => onAction('delete')}
        >
          Delete
        </Button>
      </div>
    </article>
  );
};

export const RecentPromptCard = ({
  item,
  useDisabled = false,
  onUse,
  onSave,
}: {
  item: RecentPrompt;
  useDisabled?: boolean;
  onUse: () => void;
  onSave: () => void;
}) => {
  const theme = useTheme();
  return (
    <article css={cardStyles(theme)}>
      <header css={cardHeaderStyles(theme)}>
        <h3 css={cardTitleStyles()}>Recent direction</h3>
        <span css={badgeStyles(theme)}>Used {formatDate(item.usedAt)}</span>
      </header>
      <div css={metadataStyles(theme)}>
        <span>{modeName(item.modelModeId)}</span>
        <span>{item.savedPromptId ? 'Linked to saved recipe' : 'Recent text only'}</span>
      </div>
      <p css={promptStyles(theme)}>{item.prompt}</p>
      <div css={actionStyles(theme)}>
        <Button
          aria-label={`Use recent prompt: ${item.prompt}`}
          variant="primary"
          size="small"
          disabled={useDisabled}
          onClick={onUse}
        >
          Use
        </Button>
        {!item.savedPromptId ? (
          <Button
            aria-label={`Save a copy of recent prompt: ${item.prompt}`}
            variant="quiet"
            size="small"
            onClick={onSave}
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
  useDisabled = false,
  onUse,
  onOpenWorkshop,
  onAction,
}: {
  item: SavedCharacterPrompt;
  useDisabled?: boolean;
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
    <article css={cardStyles(theme)}>
      <header css={cardHeaderStyles(theme)}>
        <h3 css={cardTitleStyles()}>{item.name}</h3>
        <span css={badgeStyles(theme, 'accent')}>Character</span>
      </header>
      <div css={metadataStyles(theme)}>
        <span>{referenceLabel}</span>
        <span>Updated {formatDate(item.updatedAt)}</span>
        {item.useCount > 0 ? <span>Used {item.useCount}×</span> : null}
      </div>
      <div>
        <p css={promptStyles(theme)}>{item.prompt}</p>
        {item.notes ? <p css={notesStyles(theme)}>{item.notes}</p> : null}
        <Tags tags={item.tags} />
      </div>
      <div css={actionStyles(theme)}>
        <Button
          aria-label={`Use ${item.name}`}
          variant="primary"
          size="small"
          disabled={useDisabled}
          onClick={onUse}
        >
          Use
        </Button>
        {item.builderDraft && onOpenWorkshop ? (
          <Button
            aria-label={`Open ${item.name} in workshop`}
            variant="secondary"
            size="small"
            disabled={useDisabled}
            onClick={onOpenWorkshop}
          >
            Open workshop
          </Button>
        ) : null}
        <Button
          aria-label={`Edit ${item.name}`}
          variant="quiet"
          size="small"
          onClick={() => onAction('edit')}
        >
          Edit
        </Button>
        <Button
          aria-label={`Rename ${item.name}`}
          variant="quiet"
          size="small"
          onClick={() => onAction('rename')}
        >
          Rename
        </Button>
        <Button
          aria-label={`Delete ${item.name}`}
          variant="quiet"
          size="small"
          onClick={() => onAction('delete')}
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
