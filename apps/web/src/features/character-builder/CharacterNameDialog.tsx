import { ASSET_NAME_MAX_LENGTH, containsMeaningfulText, normalizeWhitespace } from '@studio/domain';
import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Button, OverlayPanel, StatusNotice, TextField } from '../../ui';

export interface CharacterNameDialogProps {
  readonly open: boolean;
  readonly initialName: string;
  readonly imageOnly?: boolean;
  readonly retainsReferenceAsset?: boolean;
  readonly locked?: boolean;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onCancel: () => void;
  readonly onSubmit: (name: string) => void;
}

export const CharacterNameDialog = ({
  open,
  initialName,
  imageOnly = false,
  retainsReferenceAsset = false,
  locked = false,
  returnFocusRef,
  onCancel,
  onSubmit,
}: CharacterNameDialogProps) => {
  const formId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [attempted, setAttempted] = useState(false);
  const normalizedName = normalizeWhitespace(name, ASSET_NAME_MAX_LENGTH);
  const nameError =
    attempted && !containsMeaningfulText(normalizedName)
      ? 'Enter a useful character name.'
      : undefined;

  const cancel = () => {
    setAttempted(false);
    onCancel();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!containsMeaningfulText(normalizedName)) return;
    onSubmit(normalizedName);
  };

  return (
    <OverlayPanel
      open={open}
      onClose={cancel}
      title="Name your character"
      description={
        locked
          ? 'This save is being resumed with the original character name.'
          : 'Choose the name that will appear in Saved Characters and when this character is preloaded into Lucy.'
      }
      placement="bottom"
      size="standard"
      closeOnBackdrop={false}
      {...(locked ? { initialFocus: 'heading' as const } : { initialFocusRef: fieldRef })}
      {...(returnFocusRef ? { returnFocusRef } : {})}
      footer={
        <div css={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.75rem' }}>
          <Button variant="quiet" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary">
            {locked ? 'Resume Save' : imageOnly ? 'Save & Use Character' : 'Save Character'}
          </Button>
        </div>
      }
    >
      <form id={formId} noValidate onSubmit={submit}>
        <TextField
          ref={fieldRef}
          label="Character name"
          hint={
            locked
              ? 'The name is frozen so this retry resumes the exact same saved character.'
              : `Required. Up to ${ASSET_NAME_MAX_LENGTH} characters.`
          }
          error={nameError}
          value={name}
          maxLength={ASSET_NAME_MAX_LENGTH}
          required
          disabled={locked}
          autoComplete="off"
          onFocus={(event) => {
            if (!locked) event.currentTarget.select();
          }}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </form>
      {retainsReferenceAsset ? (
        <StatusNotice title="Local reference retention">
          Saving keeps the selected immutable reference image in the local data directory. Detaching
          or deleting the character later removes its links, not the stored image bytes. Only
          whole-environment retirement deletes those local bytes.
        </StatusNotice>
      ) : (
        <StatusNotice>
          This prompt-only save stays in the browser Recipe Shelf and does not contact an image
          provider.
        </StatusNotice>
      )}
    </OverlayPanel>
  );
};
