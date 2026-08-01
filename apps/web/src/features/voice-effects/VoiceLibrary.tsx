import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { VoiceSummary } from '@studio/contracts';
import { Button, StatusNotice, TextField } from '../../ui';
import { useVoiceLibrary } from '../../orchestration/voice-library/useVoiceLibrary';
import { VoiceList } from './VoiceList';
import { VoicePreview, useVoicePreviewController } from './VoicePreview';

export type VoiceLibraryProps = {
  disabled: boolean;
  onSelect: (voice: VoiceSummary) => void;
  selectedVoiceId?: string | null;
};

const libraryStyles = (): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: '0.75rem',
});

const libraryHeaderStyles = (theme: Theme): CSSObject => ({
  position: 'sticky',
  top: `calc(-1 * ${theme.space.lg})`,
  zIndex: 2,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(12rem, 16rem)',
  alignItems: 'end',
  gap: theme.space.md,
  marginBlockStart: `calc(-1 * ${theme.space.lg})`,
  paddingBlock: theme.space.lg,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.canvas,
  '& h4': { fontFamily: theme.type.display, fontSize: theme.fontSizes.section },
  '@media (max-width: 48rem)': {
    top: `calc(-1 * ${theme.space.md})`,
    marginBlockStart: `calc(-1 * ${theme.space.md})`,
    paddingBlock: theme.space.md,
  },
  '@media (max-width: 34rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  '@media (max-width: 40rem)': {
    position: 'static',
    marginBlockStart: 0,
    paddingBlockStart: 0,
  },
});

const filterStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  gap: theme.space.xs,
  marginBlockStart: theme.space.md,
  overflowX: 'auto',
  scrollbarWidth: 'none',
  '& button': {
    minHeight: '2rem',
    flex: '0 0 auto',
    padding: `0.35rem ${theme.space.sm}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.round,
    color: theme.colors.textMuted,
    background: theme.colors.canvasRaised,
    fontSize: theme.fontSizes.caption,
    fontWeight: 650,
    cursor: 'pointer',
  },
  '& button[aria-pressed="true"]': {
    borderColor: theme.colors.borderStrong,
    color: theme.colors.text,
    background: theme.colors.surfaceStrong,
  },
  '& button:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
});

const searchStyles = (): CSSObject => ({
  minWidth: 0,
  '& label': { margin: 0 },
});

const safePreviewStyles = (theme: Theme): CSSObject => ({
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  '& strong': { color: theme.colors.accentStrong },
});

const resultsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.sm,
});

const pageStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  paddingBlockStart: theme.space.xs,
  borderBlockStart: `1px solid ${theme.colors.border}`,
});

const FILTERS = [
  { label: 'All Accents', query: '' },
  { label: 'British', query: 'British' },
  { label: 'American', query: 'American' },
  { label: 'Professional', query: 'Professional' },
] as const;

export const VoiceLibrary = ({ disabled, onSelect, selectedVoiceId }: VoiceLibraryProps) => {
  const theme = useTheme();
  const library = useVoiceLibrary();
  const preview = useVoicePreviewController((item) =>
    library.setError(`The preview for ${item.voice.name} could not be played.`),
  );
  const selected =
    selectedVoiceId !== undefined
      ? selectedVoiceId
        ? (library.voices.find((item) => item.voice.voiceId === selectedVoiceId) ??
          (library.selected?.voice.voiceId === selectedVoiceId ? library.selected : null))
        : null
      : library.selected;

  return (
    <div css={libraryStyles()}>
      <header css={libraryHeaderStyles(theme)}>
        <div>
          <h4>Saved Voices Library</h4>
          <div aria-label="Voice library filters" css={filterStyles(theme)}>
            {FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                aria-pressed={library.search === filter.query}
                onClick={() => library.applySearch(filter.query)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <form css={searchStyles()} onSubmit={library.submitSearch}>
          <TextField
            label="Search saved voices"
            value={library.query}
            maxLength={100}
            placeholder="Search voices..."
            onChange={(event) => library.setQuery(event.target.value)}
          />
        </form>
      </header>

      <p css={safePreviewStyles(theme)}>
        <strong>Safe preview:</strong> provider sample only—your recording is never uploaded.
      </p>

      <VoicePreview
        item={preview.item}
        objectUrl={preview.objectUrl}
        attachAudio={preview.attachAudio}
        setPlaying={preview.setPlaying}
        reportPlaybackError={preview.reportPlaybackError}
      />

      <div css={resultsStyles(theme)}>
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
            Loading saved voices…
          </StatusNotice>
        ) : null}
        {!library.loading && library.voices.length === 0 && !library.error ? (
          <StatusNotice role="status" aria-live="polite">
            {library.search
              ? `No saved voices match “${library.search}”.`
              : 'No saved voices are available in this ElevenLabs library.'}
            {library.search ? (
              <Button size="small" variant="quiet" onClick={library.resetSearch}>
                Clear search
              </Button>
            ) : (
              <Button size="small" variant="quiet" onClick={library.refresh}>
                Refresh
              </Button>
            )}
          </StatusNotice>
        ) : null}

        <VoiceList
          voices={library.voices}
          selected={selected}
          loading={library.loading}
          disabled={disabled}
          previewVoiceId={preview.item?.voice.voiceId ?? null}
          previewLoadingVoiceId={preview.loadingVoiceId}
          previewPlaying={preview.playing}
          onPreview={(item) => void preview.toggle(item)}
          onSelect={(item) => {
            library.setSelected(item);
            onSelect(item.voice);
          }}
        />

        {library.voices.length > 0 ? (
          <div css={pageStyles(theme)} aria-label="Voice library navigation">
            <Button
              size="small"
              variant="quiet"
              disabled={library.previousDisabled}
              onClick={library.previous}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="quiet"
              disabled={library.loading}
              onClick={library.refresh}
            >
              Refresh
            </Button>
            <Button size="small" variant="quiet" disabled={!library.hasMore} onClick={library.next}>
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
