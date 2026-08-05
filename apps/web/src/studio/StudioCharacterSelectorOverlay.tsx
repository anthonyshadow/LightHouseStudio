import { useTheme } from '@emotion/react';
import type { RefObject } from 'react';
import type { SavedCharacterPrompt } from '../features/creative-assets/types';
import { Button, OverlayPanel } from '../ui';

export const StudioCharacterSelectorOverlay = ({
  open,
  returnFocusRef,
  activeCharacterName,
  activeCharacter,
  editBlockedReason,
  removalBlockedReason,
  recordingActive,
  onClose,
  onEdit,
  onOpenWardrobe,
  onUnselect,
  onCreate,
  onChooseSaved,
}: {
  open: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  activeCharacterName: string | null | undefined;
  activeCharacter: SavedCharacterPrompt | null | undefined;
  editBlockedReason: string | null | undefined;
  removalBlockedReason: string | null | undefined;
  recordingActive: boolean;
  onClose: () => void;
  onEdit: (character: SavedCharacterPrompt) => void;
  onOpenWardrobe: (character: SavedCharacterPrompt) => void;
  onUnselect: () => void;
  onCreate: () => void;
  onChooseSaved: () => void;
}) => {
  const theme = useTheme();
  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title="Character"
      description="Choose the character shown in the studio controls, or create a new one."
      placement="right"
      bodyMode="contained"
      returnFocusRef={returnFocusRef}
    >
      <div
        css={{
          display: 'grid',
          gap: theme.space.sm,
          alignContent: 'start',
          '& p': { margin: 0, color: theme.colors.textMuted },
        }}
      >
        <p>
          {activeCharacterName
            ? `${activeCharacterName} is currently selected.`
            : 'No saved character is selected.'}
        </p>
        {activeCharacterName ? (
          <>
            <Button
              variant="secondary"
              disabled={Boolean(editBlockedReason)}
              title={editBlockedReason ?? undefined}
              onClick={() => {
                if (activeCharacter) onEdit(activeCharacter);
              }}
            >
              Edit {activeCharacterName}
            </Button>
            <Button
              variant="secondary"
              disabled={!activeCharacter || Boolean(editBlockedReason)}
              title={editBlockedReason ?? undefined}
              onClick={() => {
                if (activeCharacter) onOpenWardrobe(activeCharacter);
              }}
            >
              Wardrobe
            </Button>
            <Button
              variant="danger"
              disabled={Boolean(removalBlockedReason)}
              title={removalBlockedReason ?? undefined}
              onClick={onUnselect}
            >
              Unselect character
            </Button>
          </>
        ) : null}
        <Button
          variant="primary"
          disabled={Boolean(editBlockedReason)}
          title={editBlockedReason ?? undefined}
          onClick={onCreate}
        >
          Create new character
        </Button>
        <Button variant="secondary" disabled={recordingActive} onClick={onChooseSaved}>
          Choose saved character
        </Button>
      </div>
    </OverlayPanel>
  );
};
