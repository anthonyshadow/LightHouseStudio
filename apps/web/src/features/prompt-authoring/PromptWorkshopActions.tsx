import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button } from '../../ui';

export type PromptSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface PromptWorkshopActionsProps {
  canCommit: boolean;
  hasSaveAction: boolean;
  showSave: boolean;
  saveName: string;
  saveState: PromptSaveState;
  onUse: () => void;
  onToggleSave: () => void;
  onSaveNameChange: (name: string) => void;
  onSave: () => void;
}

const actionRowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.sm,
  '& > button': {
    flex: '0 1 auto',
  },
  '@media (max-width: 31rem)': {
    '& > button': { flex: '1 1 100%' },
  },
  '@media (max-height: 36rem)': {
    flexWrap: 'nowrap',
    gap: theme.space.xs,
    '& > button': {
      flex: '1 1 0',
      minWidth: 0,
      paddingInline: theme.space.xs,
      fontSize: theme.fontSizes.caption,
      lineHeight: 1.2,
    },
  },
});

export const PromptWorkshopActions = ({ canCommit, onUse }: PromptWorkshopActionsProps) => {
  const theme = useTheme();

  return (
    <div css={actionRowStyles(theme)}>
      <Button variant="primary" disabled={!canCommit} onClick={onUse}>
        Use in working draft
      </Button>
    </div>
  );
};
