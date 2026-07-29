import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { VoiceSummary } from '@studio/contracts';
import { Button, StatusNotice, TextField } from '../../ui';
import { VoiceList } from './VoiceList';
import { useVoiceLibrary } from '../../orchestration/voice-library/useVoiceLibrary';

export type VoiceLibraryProps = {
  disabled: boolean;
  clipDurationLabel: string;
  modelId?: string | null;
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

export const VoiceLibrary = ({
  disabled,
  clipDurationLabel,
  modelId,
  onApply,
}: VoiceLibraryProps) => {
  const theme = useTheme();
  const library = useVoiceLibrary();

  const applySelectedVoice = () => {
    if (!library.selected) return;
    onApply(library.selected.voice);
  };

  return (
    <div css={stackStyles(theme)}>
      <StatusNotice>
        Only voices currently saved in your ElevenLabs library are shown. Manage library membership
        in ElevenLabs, then refresh this list.
      </StatusNotice>
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
      {!library.loading && library.voices.length === 0 && !library.error ? (
        <StatusNotice role="status" aria-live="polite">
          No matching voices in your ElevenLabs library.
        </StatusNotice>
      ) : null}

      <VoiceList
        voices={library.voices}
        selected={library.selected}
        loading={library.loading}
        onSelect={library.setSelected}
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
        <>
          <StatusNotice id="elevenlabs-apply-disclosure" title="Provider usage">
            Clip duration: {clipDurationLabel}. Apply sends only the immutable original audio
            sidecar to ElevenLabs
            {modelId ? ` using ${modelId}` : ''} and may use provider credits. Zero-retention
            eligibility is required; provider refusal is final for this request.
          </StatusNotice>
          <Button
            variant="primary"
            disabled={disabled}
            aria-describedby="elevenlabs-apply-disclosure"
            onClick={applySelectedVoice}
          >
            Apply {library.selected.voice.name} to recorded audio
          </Button>
        </>
      ) : null}
    </div>
  );
};
