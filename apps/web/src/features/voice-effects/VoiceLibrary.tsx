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
  onSelect?: (voice: VoiceSummary) => void;
  selectedVoiceId?: string | null;
  mode?: 'apply' | 'select';
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
const libraryDetailsStyles = (theme: Theme): CSSObject => ({
  padding: `0 ${theme.space.sm}`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  background: theme.colors.surfaceSoft,
  fontSize: theme.fontSizes.caption,
  '& summary': {
    minHeight: '2.75rem',
    display: 'flex',
    alignItems: 'center',
    color: theme.colors.text,
    cursor: 'pointer',
    fontWeight: 760,
  },
  '& p': { margin: `0 0 ${theme.space.sm}` },
});

export const VoiceLibrary = ({
  disabled,
  clipDurationLabel,
  modelId,
  onApply,
  onSelect,
  selectedVoiceId,
  mode = 'apply',
}: VoiceLibraryProps) => {
  const theme = useTheme();
  const library = useVoiceLibrary();
  const selected =
    library.selected ??
    (selectedVoiceId
      ? (library.voices.find((item) => item.voice.voiceId === selectedVoiceId) ?? null)
      : null);

  const applySelectedVoice = () => {
    if (!selected) return;
    onApply(selected.voice);
  };

  return (
    <div css={stackStyles(theme)}>
      <details css={libraryDetailsStyles(theme)}>
        <summary>Where these voices come from</summary>
        <p>
          Only voices currently saved in your ElevenLabs library are shown. Manage library
          membership in ElevenLabs, then refresh this list.
        </p>
      </details>
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
        selected={selected}
        loading={library.loading}
        onSelect={(item) => {
          library.setSelected(item);
          onSelect?.(item.voice);
        }}
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

      {selected ? (
        <>
          <StatusNotice id="elevenlabs-apply-disclosure" title="Provider usage">
            {mode === 'select' ? (
              <>
                Selecting a voice does not upload this video. Starting the edit later sends only the
                immutable original audio sidecar to ElevenLabs.
              </>
            ) : (
              <>
                Clip duration: {clipDurationLabel}. Apply sends only the immutable original audio
                sidecar to ElevenLabs
                {modelId ? ` using ${modelId}` : ''} and may use provider credits. Zero-retention
                eligibility is required; provider refusal is final for this request.
              </>
            )}
          </StatusNotice>
          <Button
            variant="primary"
            disabled={disabled}
            aria-describedby="elevenlabs-apply-disclosure"
            onClick={applySelectedVoice}
          >
            {mode === 'select'
              ? `Use ${selected.voice.name} for this edit`
              : `Apply ${selected.voice.name} to recorded audio`}
          </Button>
        </>
      ) : null}
    </div>
  );
};
