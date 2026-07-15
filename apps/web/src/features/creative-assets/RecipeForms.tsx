import { useTheme } from '@emotion/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, StatusNotice, TextAreaField, TextField } from '../../ui';
import {
  actionStyles,
  dialogStyles,
  dialogTextStyles,
  formFullWidthStyles,
  formGridStyles,
  formPanelStyles,
  formTitleStyles,
} from './RecipeShelf.styles';

export interface RecipeFormValue {
  title: string;
  prompt: string;
  notes: string;
  tags: readonly string[];
}

interface RecipeEditorProps {
  title: string;
  initialValue?: Partial<RecipeFormValue>;
  includeNotes?: boolean;
  submitLabel: string;
  onSubmit: (value: RecipeFormValue) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);

export const RecipeEditor = ({
  title,
  initialValue,
  includeNotes = false,
  submitLabel,
  onSubmit,
  onCancel,
  onDirtyChange,
}: RecipeEditorProps) => {
  const theme = useTheme();
  const [initial] = useState(() => ({
    name: initialValue?.title ?? '',
    prompt: initialValue?.prompt ?? '',
    notes: initialValue?.notes ?? '',
    tags: initialValue?.tags?.join(', ') ?? '',
  }));
  const [name, setName] = useState(initial.name);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [notes, setNotes] = useState(initial.notes);
  const [tags, setTags] = useState(initial.tags);
  const [attempted, setAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameError = attempted && !name.trim() ? 'Enter a useful name.' : undefined;
  const promptError = attempted && !prompt.trim() ? 'Enter a nonempty prompt.' : undefined;

  useEffect(() => nameRef.current?.focus(), []);
  const dirty =
    name !== initial.name ||
    prompt !== initial.prompt ||
    notes !== initial.notes ||
    tags !== initial.tags;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!name.trim() || !prompt.trim()) return;
    onSubmit({ title: name, prompt, notes, tags: parseTags(tags) });
  };

  return (
    <form css={formPanelStyles(theme)} onSubmit={submit} noValidate>
      <h3 css={formTitleStyles(theme)}>{title}</h3>
      <div css={formGridStyles(theme)}>
        <TextField
          ref={nameRef}
          label="Name"
          required
          value={name}
          maxLength={80}
          error={nameError}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <TextField
          label="Tags"
          hint="Comma-separated; up to 12."
          value={tags}
          placeholder="host, editorial, warm"
          onChange={(event) => setTags(event.currentTarget.value)}
        />
        <div css={formFullWidthStyles()}>
          <TextAreaField
            label="Prompt text"
            required
            value={prompt}
            maxLength={2_000}
            error={promptError}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />
        </div>
        {includeNotes ? (
          <div css={formFullWidthStyles()}>
            <TextAreaField
              label="Notes"
              hint="Private browser-local context; up to 220 characters."
              value={notes}
              maxLength={220}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          </div>
        ) : null}
      </div>
      <div css={actionStyles(theme)}>
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

interface RenameFormProps {
  label: string;
  initialName: string;
  onRename: (name: string) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export const RenameForm = ({
  label,
  initialName,
  onRename,
  onCancel,
  onDirtyChange,
}: RenameFormProps) => {
  const theme = useTheme();
  const [name, setName] = useState(initialName);
  const [attempted, setAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  const dirty = name !== initialName;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  return (
    <form
      css={formPanelStyles(theme)}
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (name.trim()) onRename(name);
      }}
      noValidate
    >
      <TextField
        ref={nameRef}
        label={label}
        required
        value={name}
        maxLength={80}
        error={attempted && !name.trim() ? 'Enter a useful name.' : undefined}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <div css={actionStyles(theme)}>
        <Button type="submit" variant="primary">
          Rename
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

interface DeleteConfirmationProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmation = ({ name, onConfirm, onCancel }: DeleteConfirmationProps) => {
  const theme = useTheme();
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      css={dialogStyles(theme)}
    >
      <h3 id={titleId} css={formTitleStyles(theme)}>
        Delete “{name}”?
      </h3>
      <p id={descriptionId} css={dialogTextStyles(theme)}>
        This removes the saved recipe text. Any matching recent prompt remains available without the
        saved link.
      </p>
      <div css={actionStyles(theme)}>
        <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
          Keep recipe
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Delete permanently
        </Button>
      </div>
    </div>
  );
};

export const RepositoryActionError = ({ message }: { message: string }) => (
  <StatusNotice role="alert" tone="danger">
    {message}
  </StatusNotice>
);
