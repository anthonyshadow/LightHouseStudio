import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, useRef } from 'react';
import { Button, StatusNotice, TextField } from '../../ui';

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

const saveFormStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'end',
  gap: theme.space.sm,
  '@media (max-width: 35rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

export const PromptWorkshopActions = ({
  canCommit,
  hasSaveAction,
  showSave,
  saveName,
  saveState,
  onUse,
  onToggleSave,
  onSaveNameChange,
  onSave,
}: PromptWorkshopActionsProps) => {
  const theme = useTheme();
  const saveNameRef = useRef<HTMLInputElement>(null);
  const saveToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showSave) return;
    const frame = window.requestAnimationFrame(() => saveNameRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [showSave]);

  useEffect(() => {
    if (showSave || saveState !== 'saved') return;
    const frame = window.requestAnimationFrame(() => saveToggleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [saveState, showSave]);

  return (
    <>
      <div css={actionRowStyles(theme)}>
        <Button variant="primary" disabled={!canCommit} onClick={onUse}>
          Use in working draft
        </Button>
        {hasSaveAction ? (
          <Button
            ref={saveToggleRef}
            variant="secondary"
            disabled={!canCommit}
            onClick={onToggleSave}
          >
            Save to Recipe Shelf
          </Button>
        ) : null}
      </div>

      {showSave && hasSaveAction ? (
        <div css={saveFormStyles(theme)}>
          <TextField
            ref={saveNameRef}
            label="Recipe name"
            required
            placeholder="e.g. Midnight culture host"
            value={saveName}
            maxLength={80}
            error={
              !saveName.trim() && saveState === 'error' ? 'Enter a useful recipe name.' : undefined
            }
            onChange={(event) => onSaveNameChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSave();
              }
            }}
          />
          <Button
            variant="primary"
            busy={saveState === 'saving'}
            disabled={!saveName.trim()}
            onClick={onSave}
          >
            {saveState === 'saving' ? 'Saving…' : 'Save recipe'}
          </Button>
        </div>
      ) : null}

      {saveState === 'saved' ? (
        <StatusNotice role="status" tone="success">
          Saved with restorable workshop choices. Manual portraits are not copied into the Shelf;
          generated references remain immutable local assets linked by ID.
        </StatusNotice>
      ) : null}
      {saveState === 'error' ? (
        <StatusNotice role="alert" tone="danger">
          The recipe could not be saved. Your workshop choices are still here.
        </StatusNotice>
      ) : null}
    </>
  );
};
