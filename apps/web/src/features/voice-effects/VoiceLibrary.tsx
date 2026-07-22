import { useEffect, useRef } from 'react';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { VoiceSummary } from '@studio/contracts';
import { Button, SegmentedControl, StatusNotice, TextField } from '../../ui';
import { VoiceList } from './VoiceList';
import { useVoiceLibrary } from '../../orchestration/voice-library/useVoiceLibrary';

export type VoiceLibraryProps = {
  disabled: boolean;
  collapsePublicImport?: boolean;
  onApply: (voice: VoiceSummary) => void;
};

const stackStyles = (theme: Theme): CSSObject => ({ display: 'grid', gap: theme.space.sm });
const pageStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  justifyContent: 'space-between',
  gap: theme.space.sm,
});
const searchFormStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: theme.space.xs,
  '@media (max-width: 31rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});
const searchButtonStyles = (): CSSObject => ({ alignSelf: 'end' });

const libraryOptions = [
  { value: 'workspace', label: 'Workspace' },
  { value: 'public', label: 'Public library' },
] as const;

export const VoiceLibrary = ({
  disabled,
  collapsePublicImport = false,
  onApply,
}: VoiceLibraryProps) => {
  const theme = useTheme();
  const library = useVoiceLibrary();
  const applyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (library.importSuccess && !collapsePublicImport) applyButtonRef.current?.focus();
  }, [collapsePublicImport, library.importSuccess]);

  const applySelectedVoice = async () => {
    if (!library.selected) return;
    if (collapsePublicImport && library.selected.kind === 'public') {
      const importedVoice = await library.importVoice(library.selected);
      if (importedVoice) onApply(importedVoice.voice);
      return;
    }
    if (library.selected.kind === 'workspace') onApply(library.selected.voice);
  };

  return (
    <div css={stackStyles(theme)}>
      <SegmentedControl
        label="Voice source"
        value={library.kind}
        options={libraryOptions}
        onChange={library.changeKind}
      />
      <form css={searchFormStyles(theme)} onSubmit={library.submitSearch}>
        <TextField
          label="Search voices"
          value={library.query}
          maxLength={100}
          placeholder="Name, style, accent…"
          onChange={(event) => library.setQuery(event.target.value)}
        />
        <Button type="submit" css={searchButtonStyles()}>
          Search
        </Button>
      </form>

      {library.error ? (
        <StatusNotice role="alert" tone="danger">
          {library.error}
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              library.setError(null);
              library.refresh();
            }}
          >
            Retry
          </Button>
        </StatusNotice>
      ) : null}
      {library.loading ? (
        <StatusNotice role="status" aria-live="polite" aria-atomic="true">
          Loading voices…
        </StatusNotice>
      ) : null}
      {library.importSuccess ? (
        <StatusNotice role="status" aria-live="polite" aria-atomic="true" tone="success">
          {library.importSuccess}
        </StatusNotice>
      ) : null}
      {!library.loading && library.voices.length === 0 && !library.error ? (
        <StatusNotice role="status" aria-live="polite">
          No matching voices.
        </StatusNotice>
      ) : null}

      <VoiceList
        voices={library.voices}
        kind={library.kind}
        selected={library.selected}
        loading={library.loading}
        importingVoiceKey={library.importingVoiceKey}
        collapsePublicImport={collapsePublicImport}
        onSelect={library.setSelected}
        onImport={(voice) => void library.importVoice(voice)}
        onPreviewError={(item) =>
          library.setError(`The preview for ${item.voice.name} could not be played.`)
        }
      />

      <div css={pageStyles(theme)}>
        <Button
          size="small"
          variant="quiet"
          disabled={library.previousDisabled}
          onClick={library.previous}
        >
          Previous
        </Button>
        <Button size="small" variant="quiet" disabled={!library.hasMore} onClick={library.next}>
          Next
        </Button>
      </div>

      <Button size="small" variant="quiet" disabled={library.loading} onClick={library.refresh}>
        Refresh voices
      </Button>

      {library.selected ? (
        <Button
          ref={applyButtonRef}
          variant="primary"
          busy={
            collapsePublicImport && library.kind === 'public' && library.importingVoiceKey !== null
          }
          disabled={disabled || (library.kind === 'public' && !collapsePublicImport)}
          onClick={() => void applySelectedVoice()}
        >
          {collapsePublicImport && library.kind === 'public'
            ? `Add & Apply ${library.selected.voice.name}`
            : `Apply ${library.selected.voice.name} to recorded audio`}
        </Button>
      ) : null}
      {library.kind === 'public' ? (
        <StatusNotice role="status" aria-live="polite" tone="warning">
          {collapsePublicImport
            ? 'Add & Apply imports the selected voice into the configured ElevenLabs workspace, then applies it to this take. Provider plan or voice-library limits may apply.'
            : 'Import is a separate explicit change to the configured ElevenLabs workspace and may be subject to its plan or voice-library limits. Import before conversion.'}
        </StatusNotice>
      ) : null}
    </div>
  );
};
