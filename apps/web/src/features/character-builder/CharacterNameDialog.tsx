import { ASSET_NAME_MAX_LENGTH, containsMeaningfulText, normalizeWhitespace } from '@studio/domain';
import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Button, OverlayPanel, SegmentedControl, StatusNotice, TextField } from '../../ui';

/** What a save produces: the described character, or the uploaded image on its own. */
export type CharacterSaveMode = 'default' | 'image-only';

const SAVE_MODE_OPTIONS = [
  { value: 'default', label: 'Described character' },
  { value: 'image-only', label: 'Uploaded image only' },
] as const satisfies readonly { value: CharacterSaveMode; label: string }[];

const SAVE_MODE_EXPLANATION: Readonly<Record<CharacterSaveMode, string>> = {
  default: 'Keeps your description and its generated portrait, so you can edit it again later.',
  'image-only': 'Keeps the image you uploaded and nothing else. There is no description to edit.',
};

export interface CharacterNameDialogProps {
  readonly open: boolean;
  readonly initialName: string;
  /** Offered only when there is an uploaded image, which is the only thing the choice is about. */
  readonly canSaveUploadedImageOnly?: boolean;
  readonly imageOnlyInitialName?: string;
  readonly retainsReferenceAsset?: boolean;
  readonly locked?: boolean;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onCancel: () => void;
  readonly onSubmit: (name: string, mode: CharacterSaveMode) => void;
}

export const CharacterNameDialog = ({
  open,
  initialName,
  canSaveUploadedImageOnly = false,
  imageOnlyInitialName,
  retainsReferenceAsset = false,
  locked = false,
  returnFocusRef,
  onCancel,
  onSubmit,
}: CharacterNameDialogProps) => {
  const formId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [mode, setMode] = useState<CharacterSaveMode>('default');
  const [attempted, setAttempted] = useState(false);
  const normalizedName = normalizeWhitespace(name, ASSET_NAME_MAX_LENGTH);
  const nameError =
    attempted && !containsMeaningfulText(normalizedName)
      ? 'Enter a useful character name.'
      : undefined;

  const chooseMode = (next: CharacterSaveMode) => {
    setMode(next);
    // The suggested name describes what is being saved, so it follows the choice unless edited.
    if (name === initialName || name === imageOnlyInitialName)
      setName(next === 'image-only' ? (imageOnlyInitialName ?? initialName) : initialName);
  };

  const cancel = () => {
    setAttempted(false);
    setMode('default');
    onCancel();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!containsMeaningfulText(normalizedName)) return;
    onSubmit(normalizedName, mode);
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
            {locked ? 'Resume Save' : 'Save Character'}
          </Button>
        </div>
      }
    >
      {canSaveUploadedImageOnly && !locked ? (
        <div css={{ display: 'grid', gap: '0.5rem', marginBlockEnd: '1rem' }}>
          <SegmentedControl
            columns={SAVE_MODE_OPTIONS.length}
            label="What to save"
            value={mode}
            options={SAVE_MODE_OPTIONS}
            onChange={chooseMode}
          />
          <small>{SAVE_MODE_EXPLANATION[mode]}</small>
        </div>
      ) : null}
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
          Saving keeps the reference image in your local data directory. Detaching or deleting the
          character later removes its links, not the stored image. Only retiring the whole
          environment deletes those files.
        </StatusNotice>
      ) : (
        <StatusNotice>
          This prompt-only save stays in the browser Character library and does not contact an image
          provider.
        </StatusNotice>
      )}
    </OverlayPanel>
  );
};
