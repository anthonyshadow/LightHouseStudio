import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { referenceImageContentUrl } from '../../adapters/api-client/referenceImageRoutes';
import type {
  CreativeAssetRepository,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../creative-assets/types';
import { useRef, useState } from 'react';
import { Button, ConfirmationDialog, emptyExampleStyles, EmptyStatePreview } from '../../ui';
import { media } from '../../ui/media';

const compactGrid = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))',
  gap: theme.space.md,
});
const compactCard = (theme: Theme): CSSObject => ({
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

const characterLibraryStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.lg,
  padding: `${theme.space.md} ${theme.space.xs} ${theme.space.xs}`,
  '@media (max-width: 30rem)': {
    padding: 0,
  },
});

const characterGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 18rem), 1fr))',
  alignItems: 'start',
  gap: theme.space.lg,
  [media.down('compact')]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  '@media (max-width: 30rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

const characterCardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  transition: `border-color ${theme.motion.quick}, transform ${theme.motion.quick}`,
  '&:hover': { borderColor: theme.colors.borderStrong },
  '&:hover img': { transform: 'scale(1.04)' },
});

const characterVisualStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  width: '100%',
  aspectRatio: '4 / 5',
  overflow: 'hidden',
  background: theme.colors.canvasRaised,
  '& img': {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 1s cubic-bezier(0.2, 0, 0.2, 1)',
  },
  '& [data-character-placeholder]': {
    width: '100%',
    height: '100%',
    display: 'grid',
    placeItems: 'center',
    padding: theme.space.lg,
    color: theme.colors.textMuted,
    background: [
      'radial-gradient(circle at 30% 20%, rgba(98, 230, 194, 0.16), transparent 46%)',
      'radial-gradient(circle at 75% 80%, rgba(155, 124, 255, 0.14), transparent 48%)',
      theme.colors.canvasRaised,
    ].join(', '),
    textAlign: 'center',
  },
  '& [data-character-initial]': {
    display: 'grid',
    placeItems: 'center',
    width: '4rem',
    height: '4rem',
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.round,
    color: theme.colors.accentStrong,
    background: theme.colors.accentSoft,
    fontFamily: theme.type.display,
    fontSize: '1.5rem',
    fontWeight: 760,
  },
});

const characterContentStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  flex: '1 1 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.sm,
  padding: theme.space.md,
  '& h3, & p': { margin: 0 },
  '& h3': {
    color: theme.colors.text,
    fontSize: theme.fontSizes.label,
    lineHeight: 1.3,
    overflowWrap: 'anywhere',
  },
  '& p': {
    minHeight: '2.5rem',
    display: '-webkit-box',
    overflow: 'hidden',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
});

const characterActionsStyles = (theme: Theme): CSSObject => ({
  marginBlockStart: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.xs,
  '& > button': { width: '100%' },
  '& [data-secondary-character-actions]': {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: theme.space.xs,
  },
  '& [data-secondary-character-actions] > button': {
    width: '100%',
    minWidth: 0,
    minHeight: '2.75rem',
    padding: 0,
  },
  '& svg': {
    width: '1.15rem',
    height: '1.15rem',
  },
  '@media (max-width: 30rem)': {
    '& [data-secondary-character-actions]': {
      gridTemplateColumns: 'repeat(3, 2.75rem)',
      justifyContent: 'space-between',
    },
  },
});

type CharacterActionIconName = 'wardrobe' | 'copy' | 'delete';

const CharacterActionIcon = ({ name }: { name: CharacterActionIconName }) => {
  if (name === 'wardrobe') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="m8.5 3-5 2.5L5 10l3-1.2V21h8V8.8l3 1.2 1.5-4.5-5-2.5a4 4 0 0 1-7 0Z" />
      </svg>
    );
  }
  if (name === 'copy') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 5v5m4-5v5" />
    </svg>
  );
};

const emptyLibraryStyles = (theme: Theme): CSSObject => ({
  minHeight: 'clamp(12rem, 38vh, 24rem)',
  display: 'grid',
  placeItems: 'center',
  padding: theme.space.xl,
  border: `1px dashed ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.large,
  color: theme.colors.textMuted,
  background: theme.colors.surfaceSoft,
  textAlign: 'center',
  '& h2': {
    marginBlockEnd: theme.space.xs,
    color: theme.colors.text,
    fontFamily: theme.type.display,
  },
  '& p': { margin: 0 },
  '& [data-empty-state-preview]': { marginBlockEnd: theme.space.md },
  '& [data-empty-example]': { marginBlockStart: theme.space.xs },
  '& > div > button': { marginBlockStart: theme.space.md },
});

export const SavedCharacterLibrary = ({
  items,
  repository,
  onUse,
  onCreateFrom,
  onOpenWardrobe,
}: {
  items: readonly SavedCharacterPrompt[];
  repository: CreativeAssetRepository;
  onUse: (item: SavedCharacterPrompt) => void;
  onCreateFrom: (item: SavedCharacterPrompt) => void;
  onOpenWardrobe: (item: SavedCharacterPrompt) => void;
}) => {
  'use memo';

  const theme = useTheme();
  const [deleteTarget, setDeleteTarget] = useState<SavedCharacterPrompt | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeDelete = () => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };
  const confirmDelete = async () => {
    if (deleteTarget === null || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await repository.deleteSavedCharacterPrompt(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setDeleteError('The character could not be deleted. Retry or keep it in Saved Characters.');
    } finally {
      setDeleteBusy(false);
    }
  };
  return (
    <>
      <div css={characterLibraryStyles(theme)}>
        {items.length === 0 ? (
          <div css={emptyLibraryStyles(theme)}>
            <div>
              <EmptyStatePreview />
              <h2>No saved characters yet</h2>
              <p>Create a character in Studio and save it to see it here.</p>
              <p data-empty-example css={emptyExampleStyles(theme)}>
                For example: your brand presenter, saved once and applied to any video with
                Character Swap.
              </p>
            </div>
          </div>
        ) : (
          <div css={characterGridStyles(theme)}>
            {items.map((item) => (
              <article key={item.id} css={characterCardStyles(theme)}>
                <div css={characterVisualStyles(theme)}>
                  {item.referenceImageAssetId ? (
                    <img
                      src={referenceImageContentUrl(item.referenceImageAssetId)}
                      alt={item.name}
                    />
                  ) : (
                    <div data-character-placeholder aria-hidden="true">
                      <span data-character-initial>{item.name.trim().charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <div css={characterContentStyles(theme)}>
                  <h3>{item.name}</h3>
                  <p>{item.prompt}</p>
                  <div css={characterActionsStyles(theme)}>
                    <Button variant="primary" onClick={() => onUse(item)}>
                      Use in Studio
                    </Button>
                    <div data-secondary-character-actions>
                      <Button
                        variant="secondary"
                        aria-label="Wardrobe"
                        title="Wardrobe"
                        onClick={() => onOpenWardrobe(item)}
                      >
                        <CharacterActionIcon name="wardrobe" />
                      </Button>
                      <Button
                        variant="secondary"
                        aria-label="Create new from this character"
                        title="Create new from this character"
                        onClick={() => onCreateFrom(item)}
                      >
                        <CharacterActionIcon name="copy" />
                      </Button>
                      <Button
                        variant="quiet"
                        aria-label={`Delete ${item.name}`}
                        title={`Delete ${item.name}`}
                        css={{
                          color: theme.colors.danger,
                          '&:hover:not(:disabled):not([aria-disabled="true"])': {
                            color: theme.colors.danger,
                            background: theme.colors.dangerSoft,
                          },
                        }}
                        onClick={(event) => {
                          deleteTriggerRef.current = event.currentTarget;
                          setDeleteError(null);
                          setDeleteTarget(item);
                        }}
                      >
                        <CharacterActionIcon name="delete" />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <ConfirmationDialog
        open={deleteTarget !== null}
        title="Delete saved character?"
        description={`Delete “${deleteTarget?.name ?? 'this character'}” and its wardrobe records? This saved resource will no longer be available for new work.`}
        alert={deleteError ?? undefined}
        confirmLabel={deleteBusy ? 'Deleting character…' : 'Delete character'}
        cancelLabel="Keep character"
        danger
        busy={deleteBusy}
        returnFocusRef={deleteTriggerRef}
        onCancel={closeDelete}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};

export const SavedOutfitLibrary = ({
  items,
  repository,
  onUse,
  onCreate,
  showCreateAction = true,
}: {
  items: readonly SavedPrompt[];
  repository: CreativeAssetRepository;
  onUse: (item: SavedPrompt) => void;
  onCreate: () => void;
  /** Asset overlays promote creation into their library toolbar; embedded callers keep it here. */
  showCreateAction?: boolean;
}) => {
  'use memo';

  const theme = useTheme();
  const [deleteTarget, setDeleteTarget] = useState<SavedPrompt | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeDelete = () => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };
  const confirmDelete = async () => {
    if (deleteTarget === null || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await repository.deleteSavedPrompt(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setDeleteError('The outfit could not be deleted. Retry or keep it in Saved Outfits.');
    } finally {
      setDeleteBusy(false);
    }
  };
  // One create action, defined once: inside the empty state when the library teaches, above the
  // grid otherwise.
  const createOutfitButton = (
    <Button variant="primary" onClick={onCreate}>
      Create new saved outfit
    </Button>
  );
  return (
    <>
      <div css={{ display: 'grid', gap: theme.space.md }}>
        {items.length === 0 ? (
          <div css={emptyLibraryStyles(theme)}>
            <div>
              <EmptyStatePreview />
              <h2>No saved outfits yet</h2>
              <p>Create an outfit in Studio and save it to see it here.</p>
              <p data-empty-example css={emptyExampleStyles(theme)}>
                For example: a jacket you styled once with Virtual Try-On, ready to try on in any
                new video.
              </p>
              {showCreateAction ? createOutfitButton : null}
            </div>
          </div>
        ) : (
          <>
            {showCreateAction ? <div>{createOutfitButton}</div> : null}
            <div css={compactGrid(theme)}>
              {items.map((item) => (
                <article key={item.id} css={compactCard(theme)}>
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
                    aria-label={`Delete ${item.title}`}
                    onClick={(event) => {
                      deleteTriggerRef.current = event.currentTarget;
                      setDeleteError(null);
                      setDeleteTarget(item);
                    }}
                  >
                    Delete
                  </Button>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
      <ConfirmationDialog
        open={deleteTarget !== null}
        title="Delete saved outfit?"
        description={`Delete “${deleteTarget?.title ?? 'this outfit'}”? This saved resource will no longer be available for new work.`}
        alert={deleteError ?? undefined}
        confirmLabel={deleteBusy ? 'Deleting outfit…' : 'Delete outfit'}
        cancelLabel="Keep outfit"
        danger
        busy={deleteBusy}
        returnFocusRef={deleteTriggerRef}
        onCancel={closeDelete}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};
